import { Request, Response } from "express";
import logger from "../../utils/logger";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";

import {
  initiatePaystackPayment,
  processPaymentWebhook,
  verifyPayment,
} from "./payment.service";
import {
  InitializePaymentSchema,
  VerifyPaymentQuerySchema,
} from "./payment.schema";

// FIXED: previously read `req.user?.userId!` (non-null-asserted, with a
// `.userId` field that doesn't exist anywhere else in this codebase's
// req.user shape — every other controller uses req.user.id exclusively).
// Replaced with the same requireActor pattern used everywhere else.
function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}

export const initializePaymentController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: userId } = requireActor(req);
    const { orderId } = InitializePaymentSchema.parse(req.body);

    const result = await initiatePaystackPayment(orderId, userId);

    // FIXED: message now reflects whether this was a free order (already
    // fulfilled, nothing further needed) or a real Paystack transaction
    // the frontend needs to redirect to. Previously this always said
    // "redirect user to paymentLink" even when no paymentLink exists.
    const message = result.data.requiresPayment
      ? "Payment session initialized — redirect user to paymentLink"
      : "Order fulfilled — no payment required";

    res.status(200).json({
      success: true,
      message,
      data: result.data,
    });
  },
);

export const verifyPaymentController = asyncHandler(
  async (req: Request, res: Response) => {
    const { reference } = VerifyPaymentQuerySchema.parse(req.query);
    const result = await verifyPayment(reference);

    console.log("Payment verification result for reference", reference, ":", result); // Debugging log to verify the result

    const message =
      result.status === "success"
        ? "Payment verified successfully"
        : result.status === "pending"
          ? "Payment is pending"
          : "Payment verification failed";

          console.log("Payment verification message for reference", reference, ":", message); // Debugging log to verify the message

    res.status(200).json({
      success: true, // the HTTP request itself succeeded — separate from whether the PAYMENT succeeded
      message: "Payment status retrieved",
      data: {
        success: result.success,
        status: result.status,
        message,
      },
    });

    // res.status(200).json({ success: result.success, message, status: result.status });
  },
);

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
      try {
        return (JSON.parse(rawBody) as { data?: { reference?: string } }).data
          ?.reference;
      } catch {
        return undefined;
      }
    })();

    logger.error("Paystack webhook handler failed", {
      statusCode: error.statusCode,
      message: error.message,
      reference,
      stack: error.stack,
    });

    // Always 200 — a non-200 causes Paystack to retry, which won't help
    // for signature failures or amount mismatches, and may cause
    // duplicate processing attempts.
    res.status(200).json({ success: false, message: "Webhook received" });
  }
};
