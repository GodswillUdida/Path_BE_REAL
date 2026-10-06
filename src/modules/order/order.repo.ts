/**
 * order.repo.ts
 *
 * Single point of contact with Prisma for the Order/OrderItem domain.
 * Previously nonexistent — order.service.ts called prisma directly
 * throughout, the same layering gap Module/Topic had before their fixes.
 *
 * SCOPE NOTE: this covers order CREATION and READ only — checkout intent,
 * not fulfillment. Payment webhook handling, order fulfillment (creating/
 * upserting the resulting Enrollment rows), and Cart→Order conversion are
 * a separate, not-yet-built piece. Do not assume paying for an order here
 * results in an Enrollment — that logic doesn't exist yet.
 */

import { createRedisConnection } from "@/lib/queues/connection";
import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
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
      unitPrice: true,
      quantity: true,
      createdAt: true,
      pricing: {
        select: {
          id: true,
          name: true,
          accessDurationDays: true,
          course: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  },
  payments: {
    select: {
      id: true,
      reference: true,
      status: true,
      gateway: true,
      amount: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderDetail = Prisma.OrderGetPayload<{
  select: typeof ORDER_DETAIL_SELECT;
}>;

// List select intentionally omits nested payments/pricing.course depth —
// list views (order history) don't need the full pricing→course join,
// just enough to render a line item.
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
      pricing: {
        select: {
          name: true,
          course: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderListItem = Prisma.OrderGetPayload<{
  select: typeof ORDER_LIST_SELECT;
}>;

// ─────────────────────────────────────────────────────────────────────────────
// PRICING VALIDATION — for order creation
//
// Selects course.status and course.deletedAt alongside price/currency so
// the service can reject orders against archived/deleted courses, which
// the previous version never checked (isActive on the pricing row alone
// doesn't imply the course itself is still purchasable — nothing cascades
// CoursePricing.isActive=false when a course is archived or soft-deleted).
// ─────────────────────────────────────────────────────────────────────────────

export async function findPurchasablePricings(pricingIds: string[]): Promise<
  Array<{
    id: string;
    price: Prisma.Decimal;
    currency: string;
    isFree: boolean;
    course: {
      id: string;
      title: string;
      slug: string;
      status: string;
      deletedAt: Date | null;
    };
  }>
> {
  return prisma.coursePricing.findMany({
    where: { id: { in: pricingIds }, isActive: true },
    select: {
      id: true,
      price: true,
      currency: true,
      isFree: true,
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });
}

export async function findUserForCheckout(
  userId: string,
): Promise<{ email: string | null; name: string | null } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertOrderInput {
  userId: string;
  email: string;
  name: string | null;
  phone: string | undefined;
  totalAmount: number; // real currency value — see order.service.ts for why
  currency: string;
  isFreeOrder: boolean;
  items: Array<{ pricingId: string; unitPrice: number; quantity: number }>;
  expiresAt: Date;
  idempotencyKey?: string; // optional, for idempotent order creation
}

export async function insertOrder(
  data: InsertOrderInput,
): Promise<OrderDetail> {
  return prisma.order.create({
    data: {
      user: {
        connect: { id: data.userId },
      },
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
          unitPrice: item.unitPrice,
          quantity: item.quantity,
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
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);
  return { data, total };
}

export async function findOrderById(
  id: string,
): Promise<(OrderDetail & { userId: string | null }) | null> {
  return prisma.order.findUnique({
    where: { id },
    select: { ...ORDER_DETAIL_SELECT, userId: true },
  });
}

/**
 * 2026 Strategy Standard: Structural check to isolate user ownership records
 * across targeted course scopes before committing transactions.
 */
export async function hasActiveEnrollmentForCourses(
  userId: string,
  courseIds: string[],
): Promise<boolean> {
  const enrollmentCount = await prisma.enrollment.count({
    where: {
      userId,
      courseId: { in: courseIds },
      // Extend here if your schema tracks status structures (e.g., status: "ACTIVE")
    },
  });

  return enrollmentCount > 0;
}

export async function acquireIdempotencyLock(
  userId: string,
  key: string,
  ttlSeconds = 10,
): Promise<boolean> {
  const redis = createRedisConnection("health");
  const lockKey = `lock:checkout:${userId}:${key}`;

  try {
    // NX: Set only if key does not exist; EX: Set expiry window in seconds
    const acquired = await redis.set(lockKey, "locked", "EX", ttlSeconds, "NX");
    return acquired === "OK";
  } finally {
    // Gracefully release client connections back to the process context pool
    await redis.quit();
  }
}
