/**
 * @file order.controller.ts
 * @description Production-grade controller managing client checkout routing boundaries.
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { CreateOrderSchema } from "./order.schema";
import { createOrder, getOneOrderService, getUserOrders } from "./order.service";
import { unauthorized } from "@/utils/errors";

/* ==========================================================================
   CREATE INTENT ROUTINE
   ========================================================================== */

export const createOrderController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: userId } = requireActor(req);

    // 1. Parse and validate payload structural schemas at the ingestion wall
    const body = CreateOrderSchema.parse(req.body);

    //2. Safely acquire idempotency lock
    const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;

    console.log("Received request to create order with body:", body, "and idempotencyKey:", idempotencyKey); // Debugging log to verify inputs  

    // 2. Delegate execution down into the domain service layer
    const order = await createOrder(body, userId, idempotencyKey);

    res.status(201).json({
      success: true,
      message: "Order created successfully — proceed to payment verification",
      data: order,
    });
  },
);

/* ==========================================================================
   LIST CURRENT USER'S ORDERS
   ========================================================================== */

export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);

  // Enforce rigid pagination limits to protect database throughput thresholds
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const result = await getUserOrders(userId, limit, offset);

  res.json({ success: true, ...result });
});

/* ==========================================================================
   GET ONE RECORD LOOKUP
   ========================================================================== */

export const getOneOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const orderId = req.params.id as string;

  const order = await getOneOrderService(orderId, userId);

  res.json({ success: true, data: order });
});

/* ==========================================================================
   INTERNAL SYSTEM INFRASTRUCTURE HELPERS
   ========================================================================== */

function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}
