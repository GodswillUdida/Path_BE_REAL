import { Request, Response } from "express";
import logger from "../../utils/logger";
import { asyncHandler } from "../../utils/asyncHandler";

import {
  createOrderAndInitiatePayment,
  processPaymentWebhook,
  verifyPayment,
} from "./payment.service";
import { InitializePaymentSchema } from "./payment.schema";

export const initializePaymentController = asyncHandler(
  async (req: Request, res: Response) => {
    const dto = InitializePaymentSchema.parse(req.body);

    // Attach userId if the request came from an authenticated user.
    // authGuard is optional on this route — guests and logged-in users both hit it.
    const userId = (req as any).user?.userId ?? null;

    const result = await createOrderAndInitiatePayment(dto, userId);

    // const paymentData = await initiatePaystackPayment(orderId);

    res.status(200).json({
      success: true,
      message: "Payment session initialized – redirect user to paymentLink",
      data: result.data,
    });
  },
);

export const verifyPaymentController = asyncHandler(
  async (req: Request, res: Response) => {
    const { reference } = req.query || (req.query as string);

    if (!reference || typeof reference !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Missing reference" });
    }

    const result = await verifyPayment(reference);

    res.status(200).json(result);
  },
);

export const paystackWebhookController = async (
  req: Request,
  res: Response,
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf-8")
      : JSON.stringify(req.body);

    const signature = req.headers["x-paystack-signature"] as string | undefined;

    const result = await processPaymentWebhook(rawBody, signature);

    // Always return 200 to Paystack (prevents retries)
    return res.status(200).json({
      success: true,
      message: "Webhook received",
      ...result,
    });
  } catch (err: any) {
    logger.error("Paystack webhook error", {
      error: err.message,
      reference: req.body?.data?.reference,
      signature: req.headers["x-paystack-signature"],
    });

    // Never send error status — Paystack must always get 200
    return res.status(200).send("Webhook received");
  }
};
