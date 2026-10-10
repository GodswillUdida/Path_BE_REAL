/**
 * payment.queries.ts
 * All Prisma calls for the payment/fulfillment module.
 */

import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";

// ─── Selects ──────────────────────────────────────────────────────────────────

const paymentWithOrder = {
  order: { select: { email: true, userId: true } },
} satisfies Prisma.PaymentInclude;

// isFreeOrder/totalAmount are scalar fields on Order and are returned
// automatically alongside this `include` (Prisma returns all base-model
// scalars plus whatever relations you `include` — no explicit select
// needed for them).
const orderForInitiation = {
  user: { select: { email: true } },
  items: {
    include: {
      pricing: {
        include: { course: { select: { id: true, title: true } } },
      },
    },
  },
} satisfies Prisma.OrderInclude;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: typeof paymentWithOrder;
}>;

export type OrderForInitiation = Prisma.OrderGetPayload<{
  include: typeof orderForInitiation;
}>;

// ─── Order / Payment queries ────────────────────────────────────────────────

export async function findOrderForInitiation(orderId: string): Promise<OrderForInitiation | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderForInitiation });
}

export async function findPaymentByReference(reference: string): Promise<PaymentWithOrder | null> {
  return prisma.payment.findUnique({ where: { reference }, include: paymentWithOrder });
}

export async function findPendingPaymentForOrder(orderId: string) {
  return prisma.payment.findFirst({ where: { orderId, status: "PENDING" } });
}

export async function createPayment(data: Prisma.PaymentCreateInput): Promise<{ id: string }> {
  return prisma.payment.create({ data, select: { id: true } });
}

export async function markPaymentPaid(
  tx: Prisma.TransactionClient,
  id: string,
  providerPayload: Prisma.InputJsonValue,
  existingMeta: Prisma.JsonValue,
): Promise<void> {
  await tx.payment.update({
    where: { id },
    data: {
      status: "PAID",
      metadata: { ...(existingMeta as Prisma.JsonObject), providerPayload },
    },
  });
}

export async function markOrderPaid(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.order.update({ where: { id: orderId }, data: { status: "PAID" } });
}

// FIXED: `pricing: { select: { price: true, durationDays: true } }` —
// durationDays doesn't exist (renamed to accessDurationDays, nullable).
export async function findEnrollmentsForNotification(orderId: string) {
  return prisma.enrollment.findMany({
    where: { orderId },
    include: {
      user: { select: { email: true, name: true, phone: true } },
      course: { select: { title: true } },
      pricing: { select: { price: true, accessDurationDays: true } },
    },
  });
}

// ─── Fulfillment queries ──────────────────────────────────────────────────────

// FIXED: was `pricing: { select: { courseId: true, durationDays: true } }`.
export async function findOrderItemsForFulfillment(tx: Prisma.TransactionClient, orderId: string) {
  return tx.orderItem.findMany({
    where: { orderId },
    include: { pricing: { select: { courseId: true, accessDurationDays: true } } },
  });
}

/**
 * FIXED — this replaces the old createEnrollments/findOrderEnrollments
 * pair entirely. Those relied on `createMany({ skipDuplicates: true })`,
 * which silently no-ops when an Enrollment already exists for
 * (userId, courseId) — exactly the renewal/tier-upgrade case the schema
 * explicitly documents as "update this same row, do not create a second
 * Enrollment." createMany + skipDuplicates could never satisfy that: it
 * can only skip or create, never update. A customer renewing a course
 * would pay successfully and receive literally nothing — no error, no
 * extended access, no signal anything went wrong.
 *
 * This does one upsert per course:
 *   - No existing enrollment → create it (status ACTIVE, orderItemId set
 *     to THIS order item — permanent provenance per schema comment).
 *   - Existing enrollment → update it. orderItemId is NEVER touched on
 *     update (it stays pointed at whichever order item originally created
 *     the row — that's what "provenance" means here). pricingId, status,
 *     and orderId (most recent order, for support/reference) do update.
 *
 * EXPIRY POLICY — DECISION POINT, flagged deliberately rather than
 * silently assumed: on renewal, this EXTENDS from the later of
 * {now, current expiresAt} rather than resetting to {now + duration}.
 * That protects a learner who renews a few days early from losing their
 * remaining paid time. If the intended business rule is "renewal always
 * resets to a fresh N-day window regardless of remaining time," change
 * `base` below to just `now`. Lifetime (accessDurationDays === null)
 * always wins outright — a lifetime purchase overrides any prior
 * expiring access, and there is no "extend" concept for it.
 */
export async function upsertEnrollmentForCourse(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    courseId: string;
    pricingId: string;
    orderItemId: string;
    orderId: string;
    accessDurationDays: number | null;
  },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await tx.enrollment.findUnique({
    where: { userId_courseId: { userId: params.userId, courseId: params.courseId } },
    select: { id: true, expiresAt: true },
  });

  const now = new Date();
  const newExpiresAt =
    params.accessDurationDays === null
      ? null
      : (() => {
          const base = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
          return new Date(base.getTime() + params.accessDurationDays * 86_400_000);
        })();

  if (!existing) {
    const created = await tx.enrollment.create({
      data: {
        userId: params.userId,
        courseId: params.courseId,
        pricingId: params.pricingId,
        orderItemId: params.orderItemId,
        orderId: params.orderId,
        status: "ACTIVE",
        startedAt: now,
        expiresAt: newExpiresAt,
      },
      select: { id: true },
    });
    return { id: created.id, isNew: true };
  }

  await tx.enrollment.update({
    where: { id: existing.id },
    data: {
      pricingId: params.pricingId,
      orderId: params.orderId,
      status: "ACTIVE", // reactivates a previously EXPIRED/REVOKED enrollment on repurchase
      expiresAt: newExpiresAt,
    },
  });
  return { id: existing.id, isNew: false };
}

export async function findFirstTopicsForCourses(tx: Prisma.TransactionClient, courseIds: string[]) {
  return tx.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      modules: {
        take: 1,
        orderBy: { position: "asc" },
        select: {
          topics: { take: 1, orderBy: { position: "asc" }, select: { id: true } },
        },
      },
    },
  });
}

export async function createProgressRows(
  tx: Prisma.TransactionClient,
  data: Prisma.ProgressCreateManyInput[],
): Promise<void> {
  if (data.length === 0) return;
  await tx.progress.createMany({ data, skipDuplicates: true });
}