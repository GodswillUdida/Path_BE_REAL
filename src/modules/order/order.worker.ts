// src/modules/order/order.worker.ts
import logger from "@/utils/logger";
import { createWorker } from "@/lib/queues/create-worker";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import type { OrderSweepPayload } from "./order.jobs";
import { ensureOrderExpirySweeper } from "./order.queue";
import { expireStaleOrdersService } from "./order.service";

/**
 * Marks unpaid orders past their window as FAILED. Safe against late
 * payments: markOrderPaid still accepts FAILED -> PAID, so a customer who
 * pays after the sweep is fulfilled normally (or flagged as COHORT_FULL if
 * their seat was taken meanwhile). It never touches a PAID order.
 */
export const orderExpiryWorker = createWorker<OrderSweepPayload>(
  QUEUE_NAMES.ORDER_EXPIRY,
  async () => {
    await expireStaleOrdersService();
  },
  { concurrency: 1 },
);

// Register the repeating schedule when the worker module loads. Safe to run
// from both workers/index.ts and workers/board.ts (see ensureOrderExpirySweeper).
ensureOrderExpirySweeper().catch((err: unknown) =>
  logger.error("ORDER_SWEEPER_SCHEDULE_FAILED", { message: (err as Error).message }),
);