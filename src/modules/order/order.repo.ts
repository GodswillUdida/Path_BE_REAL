/**
 * order.repo.ts
 * Single point of contact with Prisma for the Order/OrderItem domain.
 * Functions that join a transaction take `tx` as their first argument.
 *
 * SCOPE: order CREATION and READ only. Fulfillment (enrollments, seats)
 * lives in payment.fulfillment.ts.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { Tx } from "@/utils/withTransaction";

export const ZERO = new Prisma.Decimal(0);

export const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES  (a line is a course offer OR a seat: one of pricing / cohortOffer is null)
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_DETAIL_SELECT = {
  id: true,
  userId: true,
  email: true,
  name: true,
  phone: true,
  totalAmount: true,
  isFreeOrder: true,
  currency: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  items: {
    select: {
      id: true,
      pricingId: true,
      cohortOfferId: true,
      unitPrice: true,
      quantity: true,
      bonusDays: true,
      createdAt: true,
      pricing: {
        select: {
          id: true,
          name: true,
          accessDurationDays: true,
          course: { select: { id: true, title: true, slug: true } },
        },
      },
      cohortOffer: {
        select: {
          id: true,
          name: true,
          cohort: { select: { id: true, name: true, startsAt: true, endsAt: true } },
        },
      },
    },
  },
  payments: {
    select: { id: true, reference: true, status: true, gateway: true, amount: true, createdAt: true },
  },
} satisfies Prisma.OrderSelect;

export type OrderDetail = Prisma.OrderGetPayload<{ select: typeof ORDER_DETAIL_SELECT }>;

export const ORDER_LIST_SELECT = {
  id: true,
  totalAmount: true,
  isFreeOrder: true,
  currency: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  items: {
    select: {
      id: true,
      unitPrice: true,
      quantity: true,
      pricing: { select: { name: true, course: { select: { id: true, title: true, slug: true } } } },
      cohortOffer: { select: { name: true, cohort: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderListItem = Prisma.OrderGetPayload<{ select: typeof ORDER_LIST_SELECT }>;

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

export async function findPurchasablePricings(pricingIds: string[]) {
  return prisma.coursePricing.findMany({
    where: { id: { in: pricingIds }, isActive: true },
    select: {
      id: true,
      price: true,
      currency: true,
      isFree: true,
      bonusDays: true,
      course: { select: { id: true, title: true, slug: true, status: true, deletedAt: true } },
    },
  });
}

export async function findPurchasableOffers(offerIds: string[]) {
  return prisma.cohortOffer.findMany({
    where: { id: { in: offerIds }, isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      bonusDays: true,
      opensAt: true,
      closesAt: true,
      cohort: {
        select: {
          id: true,
          name: true,
          status: true,
          deletedAt: true,
          capacity: true,
          courses: { select: { courseId: true } },
        },
      },
    },
  });
}

export async function findUserForCheckout(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, studentProfile: { select: { status: true } } },
  });
}

/** Courses where the learner already has ACTIVE LIFETIME access (nothing left to buy). */
export async function findLifetimeCourseIds(userId: string, courseIds: string[]): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: courseIds }, status: "ACTIVE", expiresAt: null },
    select: { courseId: true },
  });
  return rows.map((r) => r.courseId);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEAT CAPACITY  (call inside the order transaction)
// ─────────────────────────────────────────────────────────────────────────────

/** Sorted, so concurrent multi-cohort orders cannot deadlock. */
export async function lockCohorts(tx: Tx, cohortIds: string[]): Promise<void> {
  for (const id of [...new Set(cohortIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cohort:${id}`}, 0))`;
  }
}

export async function findActiveMemberCohortIds(tx: Tx, userId: string, cohortIds: string[]): Promise<string[]> {
  const rows = await tx.cohortMember.findMany({
    where: { userId, cohortId: { in: cohortIds }, status: "ACTIVE" },
    select: { cohortId: true },
  });
  return rows.map((r) => r.cohortId);
}

/** Seats in use = ACTIVE members + other people's unexpired PENDING order lines (holds). */
export async function countSeatsInUse(tx: Tx, cohortId: string, excludeUserId: string): Promise<number> {
  const [members, holds] = await Promise.all([
    tx.cohortMember.count({ where: { cohortId, status: "ACTIVE" } }),
    tx.orderItem.count({
      where: {
        cohortOffer: { cohortId },
        order: { status: "PENDING", expiresAt: { gt: new Date() }, userId: { not: excludeUserId } },
      },
    }),
  ]);
  return members + holds;
}

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY (database, not Redis: durable, replays the SAME order)
// ─────────────────────────────────────────────────────────────────────────────

export async function claimIdempotencyKey(tx: Tx, scope: string, key: string): Promise<void> {
  await tx.idempotencyKey.create({ data: { key, scope } }); // P2002 if already claimed
}

export async function storeIdempotentOrder(tx: Tx, scope: string, key: string, orderId: string): Promise<void> {
  await tx.idempotencyKey.update({
    where: { key_scope: { key, scope } },
    data: { response: { orderId }, statusCode: 201 },
  });
}

export async function findIdempotentOrderId(scope: string, key: string): Promise<string | null> {
  const row = await prisma.idempotencyKey.findUnique({ where: { key_scope: { key, scope } }, select: { response: true } });
  const r = row?.response as { orderId?: string } | null | undefined;
  return r?.orderId ?? null;
}

/** An identical unexpired PENDING order from the last 30 minutes (avoids duplicate checkouts). */
export async function findReusablePendingOrderId(userId: string, productKeys: Set<string>): Promise<string | null> {
  const candidates = await prisma.order.findMany({
    where: { userId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, items: { select: { pricingId: true, cohortOfferId: true } } },
  });
  for (const c of candidates) {
    const keys = c.items.map((i) => (i.pricingId ? `p:${i.pricingId}` : `c:${i.cohortOfferId}`));
    if (keys.length === productKeys.size && keys.every((k) => productKeys.has(k))) return c.id;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertOrderInput {
  userId: string;
  email: string;
  name: string | null;
  phone: string | undefined;
  totalAmount: Prisma.Decimal; // real currency, exact
  currency: string;
  isFreeOrder: boolean;
  items: Array<{
    pricingId?: string;
    cohortOfferId?: string;
    unitPrice: Prisma.Decimal;
    quantity: number;
    bonusDays: number; // snapshot: fulfillment reads THIS, not the live offer
  }>;
  expiresAt: Date;
  idempotencyKey?: string;
}

export async function insertOrder(tx: Tx, data: InsertOrderInput): Promise<OrderDetail> {
  return tx.order.create({
    data: {
      user: { connect: { id: data.userId } },
      email: data.email,
      name: data.name,
      phone: data.phone,
      totalAmount: data.totalAmount,
      currency: data.currency,
      isFreeOrder: data.isFreeOrder,
      status: "PENDING",
      expiresAt: data.expiresAt,
      idempotencyKey: data.idempotencyKey ?? null,
      items: {
        create: data.items.map((item) => ({
          pricingId: item.pricingId,
          cohortOfferId: item.cohortOfferId,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          bonusDays: item.bonusDays,
        })),
      },
    },
    select: ORDER_DETAIL_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function findOrdersForUser(
  userId: string,
  limit: number,
  offset: number,
): Promise<{ data: OrderListItem[]; total: number }> {
  const [total, data] = await prisma.$transaction([
    prisma.order.count({ where: { userId } }),
    prisma.order.findMany({
      where: { userId },
      select: ORDER_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
    }),
  ]);
  return { data, total };
}

export async function findOrderById(id: string): Promise<OrderDetail | null> {
  return prisma.order.findUnique({ where: { id }, select: ORDER_DETAIL_SELECT });
}

 
/** PENDING -> FAILED for every order whose payment window has passed. */
export async function expireStaleOrders(): Promise<number> {
  const res = await prisma.order.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "FAILED" },
  });
  return res.count;
}