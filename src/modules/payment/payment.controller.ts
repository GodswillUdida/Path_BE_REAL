import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireActor } from "../../utils/requireActor";
import { initiatePaystackPayment, verifyPayment } from "./payment.service";
import { InitializePaymentSchema, VerifyPaymentQuerySchema } from "./payment.schema";

// Kept so payment.routes.ts imports do not change.
export { paystackWebhookController } from "./payment.webhook.controller";

export const initializePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const { orderId } = InitializePaymentSchema.parse(req.body);

  const result = await initiatePaystackPayment(orderId, userId);

  const message = result.data.requiresPayment
    ? "Payment session initialized — redirect user to paymentLink"
    : "Order fulfilled — no payment required";

  res.status(200).json({ success: true, message, data: result.data });
});

// Route MUST sit behind authGuard: verification is owner-only.
export const verifyPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const { reference } = VerifyPaymentQuerySchema.parse(req.query);

  const result = await verifyPayment(reference, userId);

  const message =
    result.status === "success"
      ? "Payment verified successfully"
      : result.status === "pending"
        ? "Payment is pending"
        : "Payment verification failed";

  res.status(200).json({
    success: true, // the HTTP request succeeded; separate from whether the PAYMENT did
    message: "Payment status retrieved",
    data: { success: result.success, status: result.status, message },
  });
});
