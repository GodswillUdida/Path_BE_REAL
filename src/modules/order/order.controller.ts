/**
 * @file order.controller.ts
 * Thin HTTP boundary. Validation via Zod; no business logic.
 */

import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireActor } from "@/utils/requireActor";
import {
  CreateOrderSchema,
  IdempotencyKeyHeaderSchema,
  ListOrdersQuerySchema,
  OrderIdParamSchema,
} from "./order.schema";
import { createOrder, getOneOrderService, getUserOrders } from "./order.service";

export const createOrderController = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const body = CreateOrderSchema.parse(req.body);
  const idempotencyKey = IdempotencyKeyHeaderSchema.parse(req.header("x-idempotency-key"));

  const order = await createOrder(body, userId, idempotencyKey);

  res.status(201).json({
    success: true,
    message: "Order created successfully — proceed to payment",
    data: order,
  });
});

export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const { limit, offset } = ListOrdersQuerySchema.parse(req.query);

  const result = await getUserOrders(userId, limit, offset);

  res.json({ success: true, ...result });
});

export const getOneOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const { id } = OrderIdParamSchema.parse(req.params);

  const order = await getOneOrderService(id, userId);

  res.json({ success: true, data: order });
});