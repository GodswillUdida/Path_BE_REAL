import type { Job } from "bullmq";
import { createWorker } from "@/lib/queues/create-worker";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import { deliverPostPaymentNotifications } from "../payment/payment.notifications";
import { NotificationJob } from "./notifcation.queue";

async function processNotification(job: Job<NotificationJob>): Promise<void> {
  switch (job.data.kind) {
    case "post-payment":
      await deliverPostPaymentNotifications(job.data.orderId);
      return;
  }
}

// IMPORTANT: import this worker in BOTH workers/index.ts and workers/board.ts
// (Bull Board). A worker missing from either is silently not consuming.
export const notificationWorker = createWorker<NotificationJob>(QUEUE_NAMES.NOTIFICATIONS, processNotification, {
  concurrency: 5,
});
