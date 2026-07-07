import { Request, Response } from "express";
import logger from "../../utils/logger";
import { asyncHandler } from "../../utils/asyncHandler";

import {
  initiatePaystackPayment,
  processPaymentWebhook,
  verifyPayment,
} from "./payment.service";
import { InitializePaymentSchema, VerifyPaymentQuerySchema } from "./payment.schema";

interface AuthenticatedRequest extends Request {
  user?: { userId: string, id: string, role: string }; // Extend as needed
}

export const initializePaymentController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = InitializePaymentSchema.parse(req.body);

    const result = await initiatePaystackPayment(orderId, req.user?.userId!);

    res.status(200).json({
      success: true,
      message: "Payment session initialized – redirect user to paymentLink",
      data: result.data,
    });
  },
);

export const verifyPaymentController = asyncHandler(
  async (req: Request, res: Response) => {
    const { reference } = VerifyPaymentQuerySchema.parse(req.query);

    const result = await verifyPayment(reference);

    const message =
      result.status === "success" ? "Payment verified successfully" :
        result.status === "pending" ? "Payment is pending" :
          "Payment verification failed";

    res.status(200).json({
      success: result.success,
      message,
      status: result.status,
    });
  },
);
//   req: Request,
//   res: Response,
// ) => {
//   try {
//     const rawBody = Buffer.isBuffer(req.body)
//       ? req.body.toString("utf-8")
//       : JSON.stringify(req.body);

//     const signature = req.headers["x-paystack-signature"] as string | undefined;

//     const result = await processPaymentWebhook(rawBody, signature);

//     // Always return 200 to Paystack (prevents retries)
//     return res.status(200).json({
//       success: true,
//       message: "Webhook received",
//       ...result,
//     });
//   } catch (err: any) {
//     logger.error("Paystack webhook error", {
//       error: err.message,
//       reference: req.body?.data?.reference,
//       signature: req.headers["x-paystack-signature"],
//     });

//     // Never send error status — Paystack must always get 200
//     return res.status(200).send("Webhook received");
//   }
// };

// ─── Webhook ──────────────────────────────────────────────────────────────────
// Not wrapped in asyncHandler — Paystack must always receive 200,
// but we still want differentiated logging per failure type.
 
export const paystackWebhookController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf-8")
    : JSON.stringify(req.body);
 
  const signature = req.headers["x-paystack-signature"] as string | undefined;
 
  try {
    const result = await processPaymentWebhook(rawBody, signature);
    res.status(200).json({ success: true, ...result });
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    const reference = (() => {
      try { return (JSON.parse(rawBody) as { data?: { reference?: string } }).data?.reference; }
      catch { return undefined; }
    })();
 
    // Signature failures (401) are security events — log at error level.
    // Amount mismatches (400) are data integrity events — log at error level.
    // Anything else is unexpected — log with stack.
    logger.error("Paystack webhook handler failed", {
      statusCode: error.statusCode,
      message: error.message,
      reference,
      stack: error.stack,
    });
 
    // Always 200 — a non-200 causes Paystack to retry, which won't help
    // for sig failures or amount mismatches, and may cause duplicate processing.
    res.status(200).json({ success: false, message: "Webhook received" });
  }
};
 
