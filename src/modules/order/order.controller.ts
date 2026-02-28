// // src/modules/order/order.controller.ts
// import { Request, Response, NextFunction } from "express";
// import { createOrderSchema } from "./order.schema";
// import { createOrderService, getOrderService } from "./order.service";
// import logger from "../../utils/logger";

// export const createOrder = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const userId = req.user!.userId || req.user!.id;

//     const body = createOrderSchema.parse(req.body);

//     const result = await createOrderService(userId, body);

//     return res.status(201).json({
//       success: true,
//       data: result
//     });
    
//   } catch (err: any) {
//     logger.error("createOrder error", err);
//     return next(err);
//   }
// };

// export const getOrder = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const userId = req.user!.userId || req.user!.id;
//     const orderId = req.params.id;
//     const order = await getOrderService(userId, orderId);
//     return res.json({ success: true, data: order });
//   } catch (err) {
//     return next(err);
//   }
// };

// order.controller.ts
// Rewritten & Enhanced — February 2026
// Perfectly aligned with enrollment.controller.ts
// Structured logging, status propagation, 201 on create

import { NextFunction, Request, Response } from "express";
import { CreateOrderSchema } from "./order.schema";
import logger from "../../utils/logger";

import {
  createOrderService,
  getOneOrderService,
  getUserOrdersService,
} from "./order.service";

export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user!.userId || req.user!.id;

  try {
    const body = CreateOrderSchema.parse(req.body);
    // body is always array thanks to Zod transform

    const data = await createOrderService(userId, body);

    return res.status(201).json({
      success: true,
      message: `Order created successfully (${data.items.length} item${data.items.length > 1 ? "s" : ""})`,
      data,
    });
  } catch (err: any) {
    logger.error(`Order creation failed for user ${userId}`, {
      error: err.message,
      body: req.body,
    });

    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to create order",
    });
  }
};

export const getMyOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user!.userId || req.user!.id;

  try {
    const data = await getUserOrdersService(userId);
    return res.json({ success: true, data });
  } catch (err: any) {
    logger.error(`Failed to fetch orders for user ${userId}`, err);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to fetch orders",
    });
  }
};

export const getOneOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user!.userId || req.user!.id;
  const orderId = req.params.id;

  try {
    const data = await getOneOrderService(orderId, userId);
    return res.json({ success: true, data });
  } catch (err: any) {
    logger.error(`Failed to fetch order ${orderId} for user ${userId}`, err);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to fetch order",
    });
  }
};