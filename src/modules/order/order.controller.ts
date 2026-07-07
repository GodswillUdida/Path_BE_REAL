import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";

import {
  createOrder,
  getOneOrderService,
  getUserOrders,
} from "./order.service";

/**
 * Create Order (financial intent only)
 */

export const createOrderController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;

    const order = await createOrder(req.body, userId as string);

    res.status(201).json({
      success: true,
      message: "Order created successfully – proceed to payment",
      data: order,
    });
  },
);

/**
 * Get all orders for logged-in user
 */
export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId || req.user!.id;

  const orders = await getUserOrders(userId);

  res.json({
    success: true,
    data: orders,
  });
});

/**
 * Get single order (with auth check inside service)
 */
export const getOneOrder = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId || req.user!.id;
  const orderId = req.params.id;

  const order = await getOneOrderService(orderId as string, userId);

  res.json({
    success: true,
    data: order,
  });
});
