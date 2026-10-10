import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";

export interface PaymentFollowupJob {
  paymentReference: string;
  userId: string;
  attempt: number;
}

export const paymentFollowupQueue = createQueue<PaymentFollowupJob>(
  QUEUE_NAMES.PAYMENT_FOLLOWUP,
  { attempts: 3, backoff: { type: "fixed", delay: 60_000 } }, // payment retries shouldn't be aggressive
);

export async function enqueuePaymentFollowup(job: PaymentFollowupJob) {
  return paymentFollowupQueue.add("follow-up", job, {
    delay: 15 * 60_000, // check back in 15 min if webhook hasn't confirmed
  });
}