// payment.worker.ts
import { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import logger from "@/utils/logger";
import { createWorker } from "@/lib/queues/create-worker";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import { PaymentFollowupJob, enqueuePaymentFollowup } from "./payment.queue";
import { recoverPaymentIfConfirmed } from "./payment.service";
import { recordRejectedPaymentEvent } from "./payment.events.queries";

const MAX_ATTEMPTS = 3;

/**
 * Lost-webhook recovery. recoverPaymentIfConfirmed asks Paystack directly,
 * validates status + currency + amount exactly like the webhook, and
 * fulfills through the shared claim-based path. Transient errors (Paystack
 * or DB down) are thrown, so BullMQ's own attempts/backoff retries them.
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
      return; // webhook / verify endpoint handled it: the expected outcome

    case "closed":
      // Paystack reports failed/abandoned/reversed. Payment is now FAILED
      // (still reversible by a late success), so the customer can retry.
      logger.info("Payment follow-up: transaction closed unpaid", { reference: paymentReference, userId });
      return;

    case "rejected":
      // Mismatch or duplicate payment: already recorded as a terminal
      // PaymentEvent and logged by the recovery path. Retrying cannot help.
      return;

    case "not_found":
      logger.warn("Payment follow-up: reference not found, nothing to recover", {
        reference: paymentReference,
        userId,
      });
      return;

    case "still_pending":
      if (attempt < MAX_ATTEMPTS) {
        logger.info("Payment follow-up: still unconfirmed, scheduling another check", {
          reference: paymentReference,
          userId,
          nextAttempt: attempt + 1,
        });
        await enqueuePaymentFollowup({ paymentReference, userId, attempt: attempt + 1 });
        return;
      }

      // Exhausted: a queryable, terminal PaymentEvent (alongside webhook
      // rejections), not just a log line.
      {
        const first = await recordRejectedPaymentEvent({
          eventId: `followup-exhausted:${paymentReference}`,
          eventType: "followup.exhausted",
          reference: paymentReference,
          rawPayload: { userId, attemptsExhausted: attempt } as Prisma.InputJsonValue,
          code: "NEEDS_MANUAL_REVIEW",
          message: `still unconfirmed after ${attempt} follow-up checks`,
        });
        if (first) {
          logger.error("PAYMENT_NEEDS_MANUAL_REVIEW: still unconfirmed after max follow-up attempts", {
            reference: paymentReference,
            userId,
            attemptsExhausted: attempt,
          });
        }
      }
      return;
  }
}

export const paymentFollowupWorker = createWorker<PaymentFollowupJob>(
  QUEUE_NAMES.PAYMENT_FOLLOWUP,
  processFollowup,
  { concurrency: 5 },
);
