import type { Request, Response } from "express";
import logger from "../../utils/logger";
import { processPaymentWebhook } from "./payment.webhook.service";

/**
 * Mount BEFORE express.json(), with the raw parser, e.g.:
 *
 *   app.post("/v1/webhooks/paystack",
 *     express.raw({ type: "application/json", limit: "1mb" }),
 *     paystackWebhookController);
 *
 * Intentionally the one controller with try/catch: the HTTP status IS the
 * retry protocol with Paystack.
 *   200 = handled (including permanent rejections, already recorded)
 *   401 = bad signature
 *   500 = transient failure, please retry
 */
export const paystackWebhookController = async (req: Request, res: Response): Promise<void> => {
  // A parsed body means signature verification would run on re-serialized
  // JSON and never match. Fail loudly instead of papering over it.
  if (!Buffer.isBuffer(req.body)) {
    logger.error("CRITICAL: paystack webhook route is not receiving the raw body; check middleware order");
    res.status(500).json({ success: false, message: "Webhook misconfigured" });
    return;
  }

  try {
    const result = await processPaymentWebhook(req.body, req.headers["x-paystack-signature"] as string | undefined);
    res.status(200).json({ success: true, ...result });
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };

    if (error.statusCode === 401) {
      logger.warn("Paystack webhook rejected: invalid signature", { ip: req.ip });
      res.status(401).json({ success: false, message: "Invalid signature" });
      return;
    }

    logger.error("Paystack webhook transient failure; Paystack will retry", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, message: "Temporary failure" });
  }
};
