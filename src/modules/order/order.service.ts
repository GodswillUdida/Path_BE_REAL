/**
 * @file order.service.ts
 * @description Production-grade order management service equipped with background expiration dispatch hooks.
 */

import { badRequest, notFound, unauthorized } from "../../utils/errors";
import { withMetrics } from "../../utils/observability";
import * as repo from "./order.repo";
import type { CreateOrderDTO } from "./order.schema";
import type { OrderDetail, OrderListItem } from "./order.repo";
import { scheduleOrderExpiration } from "./order.queue";
import logger from "@/utils/logger";

const ORDER_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes to complete payment

export async function createOrder(dto: CreateOrderDTO, userId: string | undefined, idempotencyKey?: string): Promise<OrderDetail> {
  return withMetrics("order.create", async () => {
    // console.log("Creating order for userId:", userId, "with idempotencyKey:", idempotencyKey); // Debugging log to verify inputs
    if (!userId) throw unauthorized("Authentication required");

    if (idempotencyKey) {
      const lockAcquired = await repo.acquireIdempotencyLock(userId, idempotencyKey);
      if (!lockAcquired) {
        throw badRequest("Order creation is already in progress for this idempotency key"); 
      }
    }

    const user = await repo.findUserForCheckout(userId);
    if (!user?.email) throw badRequest("User profile incomplete — an email address is required to check out");

    const pricingIds = dto.items.map((item) => item.pricingId);
    const pricings = await repo.findPurchasablePricings(pricingIds);

    if (pricings.length !== pricingIds.length) {
      throw notFound("One or more selected pricing options are invalid or no longer available");
    }

    // 1. Decoupled Structural Security Guard via Repository Layer
    const courseIds = pricings.map((p) => p.course.id);
    const alreadyOwnsCourse = await repo.hasActiveEnrollmentForCourses(userId, courseIds);

    if (alreadyOwnsCourse) {
      throw badRequest("You are already enrolled in one or more of the selected courses.");
    }

    // 2. Availability Verification Loop
    for (const pricing of pricings) {
      if (pricing.course.deletedAt || pricing.course.status !== "PUBLISHED") {
        throw badRequest(`"${pricing.course.title}" is not currently available for purchase`);
      }
    }

    const pricingMap = new Map(pricings.map((p) => [p.id, p]));
    let totalAmount = 0;
    let allFree = true;

    const orderItems = dto.items.map((item) => {
      const pricing = pricingMap.get(item.pricingId)!;
      const unitPrice = Number(pricing.price); // Resolved property parameter mapping
      totalAmount += unitPrice * item.quantity;
      if (!pricing.isFree) allFree = false;

      return { pricingId: item.pricingId, unitPrice, quantity: item.quantity };
    });

    const currencies = new Set(pricings.map((p) => p.currency));
    if (currencies.size > 1) {
      throw badRequest("All items in an order must use the same currency");
    }
    const currency = pricings[0].currency; // Fixed: Safely accesses the index tracker object

    const order = await repo.insertOrder({
      userId,
      email: user.email,
      name: user.name,
      phone: dto.phone,
      totalAmount,
      currency,
      isFreeOrder: allFree,
      items: orderItems,
      expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
    });

    // 3. 2026 Strategy Standard: Delayed scheduler background tracking activation
    scheduleOrderExpiration(order.id, userId, ORDER_EXPIRY_MS).catch((err) => {
      logger.error("Failed to enqueue delayed expiration structural observer for order context key", {
        orderId: order.id,
        error: err.message
      });
    });

    return order;
  });
}


export async function getUserOrders(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ data: OrderListItem[]; meta: { total: number; limit: number; offset: number; pages: number; hasMore: boolean } }> {
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
    if (!order) throw notFound("Order not found");
    if (order.userId !== userId) throw notFound("Order not found");

    return order;
  });
}
