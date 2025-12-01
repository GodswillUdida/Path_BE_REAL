// src/modules/order/order.controller.ts
import { Request, Response, NextFunction } from "express";
import { createOrderSchema } from "./order.schema";
import { createOrderService, getOrderService } from "./order.service";
import logger from "../../utils/logger";

export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId || req.user!.id;

    const body = createOrderSchema.parse(req.body);

    const result = await createOrderService(userId, body);

    return res.status(201).json({
      success: true,
      data: result
    });
    
  } catch (err: any) {
    logger.error("createOrder error", err);
    return next(err);
  }
};

export const getOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId || req.user!.id;
    const orderId = req.params.id;
    const order = await getOrderService(userId, orderId);
    return res.json({ success: true, data: order });
  } catch (err) {
    return next(err);
  }
};