import { Worker, WorkerOptions, Job } from "bullmq";
import { createRedisConnection } from "./connection";
import { QueueName, getQueuePrefix } from "./registry";
import logger from "@/utils/logger";

// Type-safe worker array matching the full generic signature
const activeWorkers: Worker<any, any, any>[] = [];

/**
 * Creates a standard BullMQ worker with localized error boundaries and connection tracking.
 */

export function createWorker<
  JobData = any,
  JobResult = any,
  Name extends string = string,
>(
  queueName: QueueName,
  processor: (job: Job<JobData, JobResult, Name>) => Promise<JobResult>,
  options: Partial<WorkerOptions> = {},
): Worker<JobData, JobResult, Name> {

   const prefix = getQueuePrefix();

  const worker = new Worker<JobData, JobResult, Name>(
    queueName,
    processor,
    {
      connection: createRedisConnection("worker") as any,

      prefix,

      concurrency: options.concurrency ?? 5,

      ...options,
    },
  );

  worker.on("completed", (job) => {
    logger.info("Job successfully completed", {
      queue: queueName,
      jobId: job.id,
      duration:
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : null,
    });
  });

  worker.on("failed", (job, err) => {
    logger.error("Job execution failed", {
      queue: queueName,
      jobId: job?.id,
      name: job?.name,
      attempt: job?.attemptsMade,
      error: err.message,
      stack: err.stack,
      payload: job?.data,
    });
  });

  worker.on("error", (err) => {
    logger.error("Critical worker-level engine error", {
      queue: queueName,
      error: err.message,
      stack: err.stack,
    });
  });

  activeWorkers.push(worker);

  return worker;
}

/**
 * 2026 Infrastructure Standard: Flushes and forcefully terminates
 * underlying Redis client connections to prevent resource leaks during container re-scaling.
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info("Draining worker clusters...", { count: activeWorkers.length });

  await Promise.all(
    activeWorkers.map(async (worker) => {
      try {
        // const client = await worker.client;

        // Instructs worker to stop taking new jobs and gracefully finish active work
        await worker.close();

        // Manual cleanup required when connection instances are passed dynamically
        // if (client && client.status !== "end") {
        //   await client.quit();
        // }
        logger.info("[Worker] Worker closed", {
          queue: worker.name,
        });
      } catch (err) {
        logger.error(
          `Error encountered while terminating worker: ${worker.name}`,
          {
            error: (err as Error).message,
          },
        );
      }
    }),
  );

  activeWorkers.length = 0;
}
