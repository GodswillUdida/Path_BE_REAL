import { Job } from "bullmq";
import { PaymentFollowupJob, enqueuePaymentFollowup } from "./payment.queue";
import logger from "@/utils/logger";
import { recoverPaymentIfConfirmed } from "./payment.service";
import { createWorker } from "@/lib/queues/create-worker";
import { QUEUE_NAMES } from "@/lib/queues/registry";

const MAX_ATTEMPTS = 3;

/**
 * FIXED — this previously did nothing useful:
 *
 *   const confirmed = await verifyPayment(job.data.paymentReference);
 *   if (!confirmed && job.data.attempt < 3) { ... just logged ... }
 *
 * `confirmed` was the entire result OBJECT from verifyPayment(), which is
 * always truthy (even `{ success: false, status: "failed" }` is a truthy
 * object reference) — so `!confirmed` could never be true, and the
 * "still unconfirmed, try again" branch was dead code. Worse: even when a
 * payment WAS actually confirmed successful, nothing here ever fulfilled
 * the order — this job only ever logged. If a Paystack webhook was ever
 * lost (network blip, deploy restart mid-delivery, etc.), this follow-up
 * job — the entire point of which is to be the recovery path for that
 * exact scenario — silently did nothing. Per your own payments skill
 * notes: "if webhook fails, system must still recover correctly." It
 * didn't.
 *
 * Now: calls the same shared fulfillment path the webhook uses
 * (recoverPaymentIfConfirmed → markPaidAndFulfill), so a lost webhook is
 * actually recovered, idempotently, without duplicating fulfillment logic.
 */
async function processFollowup(job: Job<PaymentFollowupJob>) {
  const { paymentReference, userId, attempt } = job.data;

  const outcome = await recoverPaymentIfConfirmed(paymentReference);

  switch (outcome) {
    case "fulfilled":
      logger.info("Payment follow-up: recovered a payment the webhook missed", {
        reference: paymentReference,
        userId,
        attempt,
      });
      return;

    case "already_paid":
      // Webhook (or a prior follow-up attempt) already handled this —
      // expected outcome most of the time, not worth logging above debug.
      return;

    case "not_found":
      logger.warn("Payment follow-up: reference not found — nothing to recover", {
        reference: paymentReference,
        userId,
      });
      return;

    case "still_pending":
      // FIXED: previously never actually re-enqueued anything regardless
      // of attempt count — this branch existed only in a comment.
      if (attempt < MAX_ATTEMPTS) {
        logger.info("Payment follow-up: still unconfirmed, scheduling another check", {
          reference: paymentReference,
          userId,
          nextAttempt: attempt + 1,
        });
        await enqueuePaymentFollowup({ paymentReference, userId, attempt: attempt + 1 });
      } else {
        // FIXED: previously did nothing on exhaustion either — a payment
        // stuck pending after 3 checks (45+ minutes) needs a human to look
        // at it (customer may have abandoned checkout, or Paystack itself
        // may be reporting something unexpected). No dedicated
        // manual-review queue/table exists yet — logging at error level
        // with a clear, greppable marker is the minimum viable signal
        // until one does.
        logger.error("PAYMENT_NEEDS_MANUAL_REVIEW: still unconfirmed after max follow-up attempts", {
          reference: paymentReference,
          userId,
          attemptsExhausted: attempt,
        });
      }
      return;
  }
}

export const paymentFollowupWorker = createWorker<PaymentFollowupJob>(
  QUEUE_NAMES.PAYMENT_FOLLOWUP,
  processFollowup,
  { concurrency: 5 },
);