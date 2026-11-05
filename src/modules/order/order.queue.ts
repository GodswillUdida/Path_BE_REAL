// src/modules/order/order.queue.ts
import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import { OrderExpirationPayload, OrderSweepPayload } from "./order.jobs";

const SWEEP_EVERY_MS = 5 * 60_000;

/**
 * Delayed jobs that expire unpaid orders. Previously borrowed the
 * COURSE_ANALYTICS queue; it now has its own (ORDER_EXPIRY). Point the
 * expiry worker at QUEUE_NAMES.ORDER_EXPIRY and register it in
 * workers/index.ts AND workers/board.ts.
 *
 * The worker MUST only move an order PENDING -> FAILED and MUST NOT touch
 * one that is PAID. A late Paystack success can still flip FAILED -> PAID
 * (markOrderPaid allows it), so expiring an order never loses a payment.
 */
export const orderExpiryQueue = createQueue<OrderSweepPayload | OrderExpirationPayload>(QUEUE_NAMES.ORDER_EXPIRY, {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
});

/**
 * @param delayMs Defaults to 30 minutes (1,800,000 ms)
 */
export async function scheduleOrderExpiration(orderId: string, userId: string, delayMs: number): Promise<void> {
  await orderExpiryQueue.add(
    `expire-order-${orderId}`,
    { orderId, userId },
    {
      delay: delayMs,
      jobId: `expiry-${orderId}`, // deterministic: no duplicate scheduling
    },
  );
}

/**
 * Idempotent: the fixed jobId + repeat key means calling this on every
 * process start (or from both workers/index.ts and workers/board.ts) still
 * leaves exactly one schedule.
 */
export async function ensureOrderExpirySweeper(): Promise<void> {
  await orderExpiryQueue.add(
    "sweep-expired-orders",
    { kind: "sweep" },
    { repeat: { every: SWEEP_EVERY_MS }, jobId: "sweep-expired-orders" },
  );
}
