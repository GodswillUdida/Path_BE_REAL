import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import logger from "@/utils/logger";

export type NotificationJob = { kind: "post-payment"; orderId: string };

export const notificationQueue = createQueue<NotificationJob>(QUEUE_NAMES.NOTIFICATIONS, {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600 }, // keeps the jobId dedupe window open for a week
  removeOnFail: false, // failed jobs stay visible in Bull Board
});

/**
 * Post-commit, best-effort enqueue: a Redis blip must never fail an already
 * committed payment. A failure is logged with a greppable marker.
 * Returns whether the job was queued.
 */
export async function enqueuePostPaymentNotifications(orderId: string): Promise<boolean> {
  try {
    await notificationQueue.add(
      "post-payment",
      { kind: "post-payment", orderId },
      { jobId: `post-payment-${orderId}` }, // BullMQ ids must not contain ":"
    );
    return true;
  } catch (err) {
    logger.error("NOTIFICATION_ENQUEUE_FAILED", {
      kind: "post-payment",
      orderId,
      message: (err as Error).message,
    });
    return false;
  }
}
