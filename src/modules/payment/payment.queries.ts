/**
 * payment.queries.ts
 * All Prisma calls for the payment/fulfillment module (repository layer).
 * Functions that join a transaction take `tx`.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

// Enrollment creation/renewal lives in ONE place shared with admin grants.
export { upsertEnrollmentForCourse } from "../enrollment/enrollment.commands";

// ─── Selects ──────────────────────────────────────────────────────────────────

const paymentWithOrder = {
  order: { select: { email: true, userId: true } },
} satisfies Prisma.PaymentInclude;

// isFreeOrder/totalAmount/currency/expiresAt/status are scalar fields on
// Order and are returned alongside this `include`.
const orderForInitiation = {
  user: { select: { email: true } },
  items: {
    include: {
      // Exactly one of pricing / cohortOffer is set on each line.
      pricing: {
        include: { course: { select: { id: true, title: true } } },
      },
      cohortOffer: {
        select: {
          id: true,
          name: true,
          cohort: { select: { name: true, courses: { select: { courseId: true } } } },
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

export type PaymentWithOrder = Prisma.PaymentGetPayload<{ include: typeof paymentWithOrder }>;
export type OrderForInitiation = Prisma.OrderGetPayload<{ include: typeof orderForInitiation }>;

// ─── Order / Payment reads ────────────────────────────────────────────────────

export async function findOrderForInitiation(orderId: string): Promise<OrderForInitiation | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderForInitiation });
}

export async function findPaymentByReference(reference: string): Promise<PaymentWithOrder | null> {
  return prisma.payment.findUnique({ where: { reference }, include: paymentWithOrder });
}

export async function findPendingPaymentForOrder(orderId: string) {
  return prisma.payment.findFirst({
    where: { orderId, status: "PENDING" },
    select: { id: true, reference: true, metadata: true },
  });
}

/** For markPaidAndFulfill. */
export async function findPaymentForFulfillment(reference: string) {
  return prisma.payment.findUnique({
    where: { reference },
    select: { id: true, status: true, orderId: true, userId: true, metadata: true },
  });
}

/** For recovery: everything the shared charge validator needs. */
export async function findPaymentForRecovery(reference: string) {
  return prisma.payment.findUnique({
    where: { reference },
    select: { id: true, status: true, amount: true, currency: true, orderId: true, userId: true },
  });
}

// ─── Payment writes ───────────────────────────────────────────────────────────

/**
 * Insert-first. The partial unique index payment_one_pending_per_order
 * (manual_constraints.sql) makes a concurrent second initiate fail with
 * P2002, returned here as null so the caller can reuse the winner's link.
 */
export async function createPendingPayment(
  data: Prisma.PaymentUncheckedCreateInput,
): Promise<{ id: string } | null> {
  try {
    return await prisma.payment.create({ data, select: { id: true } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

export async function setPaymentAuthorizationUrl(
  id: string,
  metadata: Prisma.InputJsonObject,
  authorizationUrl: string,
): Promise<void> {
  await prisma.payment.update({
    where: { id },
    data: { metadata: { ...metadata, authorizationUrl } },
  });
}

/** PENDING -> FAILED only. FAILED can still become PAID later (late success). */
export async function markPaymentFailed(id: string): Promise<boolean> {
  const res = await prisma.payment.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "FAILED" },
  });
  return res.count === 1;
}

/**
 * CLAIM semantics. Returns true only for the call that actually moved the
 * payment to PAID. Callers MUST fulfill only when this and markOrderPaid
 * both returned true. REFUNDED is never resurrected; FAILED -> PAID is
 * allowed (late gateway success).
 */
export async function markPaymentPaid(
  tx: Prisma.TransactionClient,
  id: string,
  providerPayload: Prisma.InputJsonValue,
  existingMeta: Prisma.JsonValue,
): Promise<boolean> {
  const res = await tx.payment.updateMany({
    where: { id, status: { in: ["PENDING", "FAILED"] } },
    data: {
      status: "PAID",
      metadata: { ...(existingMeta as Prisma.JsonObject), providerPayload },
    },
  });
  return res.count === 1;
}

/** Same claim semantics, for the order. */
export async function markOrderPaid(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
  const res = await tx.order.updateMany({
    where: { id: orderId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PAID" },
  });
  return res.count === 1;
}

// ─── Fulfillment / notification reads ─────────────────────────────────────────

export async function findOrderItemsForFulfillment(tx: Prisma.TransactionClient, orderId: string) {
  return tx.orderItem.findMany({
    where: { orderId },
    include: { pricing: { select: { courseId: true, accessDurationDays: true } } },
    // cohortOfferId, pricingId and bonusDays are scalars and come back with
    // the row; pricing is null for seat lines.
  });
}

/** Seats bought in an order, for the confirmation email. */
export async function findSeatsForNotification(orderId: string) {
  return prisma.cohortMember.findMany({
    where: { orderItem: { orderId } },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      cohort: { select: { name: true } },
      orderItem: { select: { unitPrice: true } },
      student: { select: { user: { select: { email: true, name: true, phone: true } } } },
    },
  });
}

/**
 * Amount comes from the OrderItem snapshot (what was actually charged), and
 * the end date from the enrollment's real expiresAt (correct on renewals).
 */
export async function findEnrollmentsForNotification(orderId: string) {
  return prisma.enrollment.findMany({
    where: { orderId },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      user: { select: { email: true, name: true, phone: true } },
      course: { select: { title: true } },
      orderItem: { select: { unitPrice: true } },
      pricing: { select: { accessDurationDays: true } },
    },
  });
}
