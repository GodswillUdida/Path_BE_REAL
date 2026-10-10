// src/modules/order/order.queue.ts
import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import { OrderExpirationPayload } from "./order.jobs";

/**
 * 2026 Strategy Standard: Low-priority operational lifecycle queue.
 * Configured with strict retention options since expired entries do not require debug tracking.
 */
export const orderExpiryQueue = createQueue<OrderExpirationPayload>(QUEUE_NAMES.COURSE_ANALYTICS, {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 100 }, // Keep historical overhead minimal
  removeOnFail: { count: 200 }
});

/**
 * Schedules an automated asynchronous process to check and terminate stale un-paid orders.
 * @param delayMs Defaults to 30 minutes (1,800,000 milliseconds)
 */
export async function scheduleOrderExpiration(orderId: string, userId: string, delayMs: number): Promise<void> {
  await orderExpiryQueue.add(
    `expire-order-${orderId}`,
    { orderId, userId },
    { 
      delay: delayMs, // Native BullMQ delayed job processing strategy
      jobId: `expiry-${orderId}` // Deterministic jobId overrides prevent scheduling duplication
    }
  );
}
