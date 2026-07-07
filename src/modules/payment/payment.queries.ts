/**
 * payment.queries.ts
 * All Prisma calls for the payment module.
 * Guest user helpers are gone — orders always have a userId.
 */

import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";

// ─── Selects ──────────────────────────────────────────────────────────────────

const paymentWithOrder = {
  order: { select: { email: true, userId: true } },
} satisfies Prisma.PaymentInclude;

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

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function findOrderForInitiation(orderId: string): Promise<OrderForInitiation | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderForInitiation });
}

export async function findPaymentByReference(reference: string): Promise<PaymentWithOrder | null> {
  return prisma.payment.findUnique({ where: { reference }, include: paymentWithOrder });
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

export async function findEnrollmentsForNotification(orderId: string) {
  return prisma.enrollment.findMany({
    where: { orderId },
    include: {
      user: { select: { email: true, name: true, phone: true } },
      course: { select: { title: true } },
      pricing: { select: { price: true, durationDays: true } },
    },
  });
}

// ─── Fulfillment queries ──────────────────────────────────────────────────────

export async function findOrderItems(tx: Prisma.TransactionClient, orderId: string) {
  return tx.orderItem.findMany({
    where: { orderId },
    include: { pricing: { select: { courseId: true, durationDays: true } } },
  });
}

export async function createEnrollments(
  tx: Prisma.TransactionClient,
  data: Prisma.EnrollmentCreateManyInput[],
): Promise<void> {
  await tx.enrollment.createMany({ data, skipDuplicates: true });
}

export async function findOrderEnrollments(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
) {
  return tx.enrollment.findMany({
    where: { orderId, userId },
    select: { id: true, courseId: true },
  });
}

export async function findFirstTopicsForCourses(
  tx: Prisma.TransactionClient,
  courseIds: string[],
) {
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