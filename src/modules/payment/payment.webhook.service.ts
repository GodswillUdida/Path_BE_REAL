/**
 * payment.webhook.service.ts  (durable ingest + strict validation)
 *
 * Contract with the HTTP layer:
 *   returns        -> 200 (handled: fulfilled, duplicate, ignored, or
 *                     permanently rejected and recorded)
 *   throws 401     -> bad signature
 *   throws other   -> transient; 500 so Paystack retries. The PaymentEvent
 *                     row stays non-terminal, so the retry reprocesses it.
 */

import type { Prisma } from "@prisma/client";
import { unauthorized } from "@/utils/errors";
import logger from "@/utils/logger";
import { enqueuePostPaymentNotifications } from "../notifications/notifcation.queue";
import { verifyPaystackSignature } from "./paystack.signature";
import { checkChargeMatchesPayment } from "./payment.validation";
import { ANOMALY_MESSAGES, markPaidAndFulfill } from "./payment.fulfillment";
import {
  findPaymentForWebhook,
  markPaymentEventProcessed,
  markPaymentEventRejected,
  recordPaymentEvent,
} from "./payment.events.queries";

type WebhookOutcome = "duplicate" | "ignored" | "fulfilled" | "already_paid" | "rejected";

interface PaystackWebhookPayload {
  event: string;
  data: {
    id?: number | string;
    reference: string;
    amount: number; // kobo
    currency?: string;
    status?: string;
  };
}

export async function processPaymentWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): Promise<{ outcome: WebhookOutcome }> {
  if (!verifyPaystackSignature(rawBody, signature)) {
    throw unauthorized("Invalid webhook signature");
  }

  const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
  const payload = parsed as PaystackWebhookPayload;
  const { event, data } = payload;

  // Paystack sends no event id. data.id is the transaction (or refund) id,
  // stable across redeliveries of the same event.
  const eventId = `${event}:${data.id ?? data.reference}`;

  const rec = await recordPaymentEvent({
    eventId,
    eventType: event,
    reference: data.reference ?? null,
    rawPayload: parsed as Prisma.InputJsonValue,
  });
  if (rec.terminal) return { outcome: "duplicate" };

  if (event !== "charge.success") {
    // Stored for audit/reconciliation (refunds, disputes, failures).
    await markPaymentEventProcessed(rec.id);
    return { outcome: "ignored" };
  }

  const reject = async (code: string, message: string, paymentId?: string) => {
    await markPaymentEventRejected(rec.id, code, message, paymentId);
    // Money may have moved: this log line must page someone.
    logger.error("payment.webhook.rejected", { code, message, reference: data.reference, eventId });
    return { outcome: "rejected" as const };
  };

  const payment = await findPaymentForWebhook(data.reference);
  if (!payment) return reject("UNKNOWN_REFERENCE", "no payment for reference");

  if (payment.status === "PAID") {
    await markPaymentEventProcessed(rec.id, payment.id);
    return { outcome: "already_paid" };
  }
  if (payment.status === "REFUNDED") return reject("NOT_PAYABLE", "payment already refunded", payment.id);

  // No guest checkout: userId is required in the schema. Defensive only.
  if (!payment.orderId || !payment.userId) return reject("INVALID_STATE", "missing order or user", payment.id);

  const check = checkChargeMatchesPayment(payment, data);
  if (!check.ok) return reject(check.code, check.message, payment.id);

  // Transient errors propagate (-> 500 -> Paystack retries; row stays non-terminal).
  const result = await markPaidAndFulfill(data.reference, parsed as Prisma.InputJsonValue);
  if (!result) return reject("FULFILL_NULL", "fulfillment returned no result", payment.id);
  if (result.anomaly) {
    // Other lines in the order were still fulfilled: confirm those, then
    // record the anomaly (terminal + alert) so someone refunds/waitlists.
    if (!result.alreadyProcessed) await enqueuePostPaymentNotifications(result.orderId);
    return reject(result.anomaly, ANOMALY_MESSAGES[result.anomaly], payment.id);
  }

  await markPaymentEventProcessed(rec.id, payment.id);

  if (!result.alreadyProcessed) {
    await enqueuePostPaymentNotifications(result.orderId);
    logger.info("Payment successful", { reference: data.reference, orderId: result.orderId });
  }
  return { outcome: "fulfilled" };
}
