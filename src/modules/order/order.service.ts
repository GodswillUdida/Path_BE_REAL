/**
 * @file order.service.ts
 * Checkout intent: course offers and live-class seats. No Prisma imports.
 *
 * Changes vs the previous version:
 *  - "already enrolled" no longer blocks renewals (it counted EXPIRED and
 *    REVOKED rows too, so nobody could ever renew). Now only ACTIVE LIFETIME
 *    access blocks a course; revoked learners are blocked by the purchase
 *    gate; everything else is a renewal and is allowed.
 *  - Seats: offer window, batch status, student status, no duplicate seat,
 *    capacity under a per-cohort lock (pending orders count as holds).
 *  - bonusDays is snapshotted onto each line.
 *  - Money is exact Decimal arithmetic, not JS floats.
 *  - Idempotency is durable (database) and REPLAYS the same order; the old
 *    Redis lock rejected the retry with an error, expired after 10 seconds,
 *    and the key was never even saved on the order.
 *  - An identical unexpired pending order is reused instead of duplicated.
 */

import { badRequest, forbidden, notFound } from "@/utils/errors";
import { withMetrics } from "../../utils/observability";
import logger from "@/utils/logger";
import { withTransaction } from "@/utils/withTransaction";
import { assertCoursesPurchasableService } from "../enrollment/enrollment.service";
import * as repo from "./order.repo";
import type { CreateOrderDTO } from "./order.schema";
import type { OrderDetail, OrderListItem } from "./order.repo";
import { scheduleOrderExpiration } from "./order.queue";

const ORDER_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes to complete payment

/** Machine-readable code for the frontend (e.g. route to the application form). */
const withCode = <E extends Error>(err: E, code: string): E => Object.assign(err, { code });

export async function createOrder(dto: CreateOrderDTO, userId: string, idempotencyKey?: string): Promise<OrderDetail> {
  return withMetrics("order.create", async () => {
    const scope = `order.create:${userId}`;

    // Replay: same key => same order, not an error.
    if (idempotencyKey) {
      const replayId = await repo.findIdempotentOrderId(scope, idempotencyKey);
      if (replayId) {
        const replay = await repo.findOrderById(replayId);
        if (replay && replay.userId === userId) return replay;
      }
    }

    const user = await repo.findUserForCheckout(userId);
    if (!user?.email) throw badRequest("User profile incomplete — an email address is required to check out");

    const pricingIds = dto.items.flatMap((i) => (i.pricingId ? [i.pricingId] : []));
    const offerIds = dto.items.flatMap((i) => (i.cohortOfferId ? [i.cohortOfferId] : []));

    const [pricings, offers] = await Promise.all([
      pricingIds.length ? repo.findPurchasablePricings(pricingIds) : Promise.resolve([]),
      offerIds.length ? repo.findPurchasableOffers(offerIds) : Promise.resolve([]),
    ]);
    if (pricings.length !== pricingIds.length || offers.length !== offerIds.length) {
      throw notFound("One or more selected items are invalid or no longer available");
    }

    // ── course lines ──────────────────────────────────────────────────────
    for (const p of pricings) {
      if (p.course.deletedAt || p.course.status !== "PUBLISHED") {
        throw badRequest(`"${p.course.title}" is not currently available for purchase`);
      }
    }
    const lifetime = await repo.findLifetimeCourseIds(
      userId,
      pricings.map((p) => p.course.id),
    );
    if (lifetime.length > 0) {
      throw badRequest("You already have lifetime access to one or more of the selected courses.");
    }

    // ── seat lines ────────────────────────────────────────────────────────
    const now = new Date();
    for (const o of offers) {
      if (o.cohort.deletedAt || !["UPCOMING", "ACTIVE"].includes(o.cohort.status)) {
        throw badRequest(`"${o.cohort.name}" is not open for enrollment`);
      }
      if ((o.opensAt && o.opensAt > now) || (o.closesAt && o.closesAt < now)) {
        throw badRequest(`Enrollment for "${o.cohort.name}" is not open right now`);
      }
    }
    if (offers.length > 0) {
      // Registered-student features require a verified email. Legacy accounts
      // created before verification existed may hold a profile while unverified.
      if (!user.emailVerified) {
        throw withCode(
          forbidden("Verify your email before buying a live-class seat"),
          "EMAIL_VERIFICATION_REQUIRED",
        );
      }
      // Submitting the application form creates the student profile.
      if (!user.studentProfile) {
        throw withCode(
          badRequest("Complete the student application before buying a live-class seat"),
          "APPLICATION_REQUIRED",
        );
      }
      if (user.studentProfile.status !== "ACTIVE") {
        throw forbidden("Your student account cannot buy live-class seats right now");
      }
    }

    // Revoked learners cannot repurchase, directly or through a bundle.
    const courseIds = [
      ...pricings.map((p) => p.course.id),
      ...offers.flatMap((o) => o.cohort.courses.map((c) => c.courseId)),
    ];
    await assertCoursesPurchasableService(userId, courseIds);

    const currencies = new Set([...pricings.map((p) => p.currency), ...offers.map((o) => o.currency)]);
    if (currencies.size > 1) throw badRequest("All items in an order must use the same currency");
    const currency = [...currencies][0];

    // ── lines + exact totals ──────────────────────────────────────────────
    const pricingMap = new Map(pricings.map((p) => [p.id, p]));
    const offerMap = new Map(offers.map((o) => [o.id, o]));

    const items = dto.items.map((item) => {
      if (item.pricingId) {
        const p = pricingMap.get(item.pricingId)!;
        return { pricingId: p.id, unitPrice: p.price, quantity: item.quantity, bonusDays: p.bonusDays };
      }
      const o = offerMap.get(item.cohortOfferId!)!;
      return { cohortOfferId: o.id, unitPrice: o.price, quantity: item.quantity, bonusDays: o.bonusDays };
    });
    const totalAmount = items.reduce((sum, i) => sum.add(i.unitPrice.mul(i.quantity)), repo.ZERO);

    // Reuse an identical unexpired pending order instead of creating a duplicate.
    const productKeys = new Set(dto.items.map((i) => (i.pricingId ? `p:${i.pricingId}` : `c:${i.cohortOfferId}`)));
    const reusableId = await repo.findReusablePendingOrderId(userId, productKeys);
    if (reusableId) {
      const reusable = await repo.findOrderById(reusableId);
      if (reusable) return reusable;
    }

    let order: OrderDetail;
    try {
      order = await withTransaction(
        async (tx) => {
          if (idempotencyKey) await repo.claimIdempotencyKey(tx, scope, idempotencyKey);

          if (offers.length > 0) {
            const cohortIds = offers.map((o) => o.cohort.id);
            await repo.lockCohorts(tx, cohortIds); // serialize capacity decisions

            const already = await repo.findActiveMemberCohortIds(tx, userId, cohortIds);
            if (already.length > 0) throw badRequest("You already have a seat in one of the selected batches");

            for (const o of offers) {
              const capacity = o.cohort.capacity;
              if (capacity === null) continue;
              const used = await repo.countSeatsInUse(tx, o.cohort.id, userId);
              if (used >= capacity) throw badRequest(`"${o.cohort.name}" is full`);
            }
          }

          const created = await repo.insertOrder(tx, {
            userId,
            email: user.email!,
            name: user.name,
            phone: dto.phone,
            totalAmount,
            currency,
            isFreeOrder: totalAmount.lte(0),
            items,
            expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
            idempotencyKey,
          });

          if (idempotencyKey) await repo.storeIdempotentOrder(tx, scope, idempotencyKey, created.id);
          return created;
        },
        { maxWait: 5_000, timeout: 10_000 },
      );
    } catch (err) {
      // Concurrent duplicate request: return the winner's order.
      if (idempotencyKey && repo.isUniqueViolation(err)) {
        const winnerId = await repo.findIdempotentOrderId(scope, idempotencyKey);
        const winner = winnerId ? await repo.findOrderById(winnerId) : null;
        if (winner && winner.userId === userId) return winner;
      }
      throw err;
    }

    // Post-commit, best-effort: payment initiation also checks expiresAt.
    scheduleOrderExpiration(order.id, userId, ORDER_EXPIRY_MS).catch((err: unknown) => {
      logger.error("Failed to enqueue order expiration", { orderId: order.id, error: (err as Error).message });
    });

    return order;
  });
}

export async function getUserOrders(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{
  data: OrderListItem[];
  meta: { total: number; limit: number; offset: number; pages: number; hasMore: boolean };
}> {
  return withMetrics("order.list", async () => {
    const { data, total } = await repo.findOrdersForUser(userId, limit, offset);
    return {
      data,
      meta: { total, limit, offset, pages: Math.ceil(total / limit), hasMore: offset + limit < total },
    };
  });
}

export async function getOneOrderService(id: string, userId: string): Promise<OrderDetail> {
  return withMetrics("order.getOne", async () => {
    const order = await repo.findOrderById(id);
    // Not-found and not-yours are indistinguishable on purpose.
    if (!order || order.userId !== userId) throw notFound("Order not found");
    return order;
  });
}

/**
 * Called by the repeating sweeper. Seats are already released by TIME (a
 * pending order only holds a seat while expiresAt is in the future), so this
 * only keeps order STATUS honest for reporting and the UI.
 */
export async function expireStaleOrdersService(): Promise<number> {
  return withMetrics("order.expireStale", async () => {
    const count = await repo.expireStaleOrders();
    if (count > 0) logger.info("Expired stale unpaid orders", { count });
    return count;
  });
}
