import { Request, Response, NextFunction } from "express";
import logger from "../../utils/logger";
import { processPaymentWebhook } from "./payment.service";

export const paymentWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const raw =
      req.body instanceof Buffer
        ? req.body.toString("utf-8")
        : JSON.stringify(req.body);

    await processPaymentWebhook(raw, req.headers as any);

    return res.status(200).send("OK");
  } catch (err: any) {
    logger.error("Payment webhook error", err);

    return res.status(400).json({
      success: false,
      message: err.message || "Webhook processing failed",
    });
  }
};
