import { Queue, JobsOptions } from "bullmq";
import { createRedisConnection } from "./connection";
import { defaultJobOptions } from "./defaults";
import { getQueuePrefix, QueueName } from "./registry";
import logger from "@/utils/logger";

const activeQueues: Queue[] = [];

export function createQueue<
  JobData = any,
  JobResult = any,
  Name extends string = string,
>(
  name: QueueName,
  overrides: Partial<JobsOptions> = {},
): Queue<JobData, JobResult, Name> {
  const queue = new Queue<JobData, JobResult, Name>(name, {
    connection: createRedisConnection("producer") as any,

    prefix: getQueuePrefix(),

    defaultJobOptions: {
      ...defaultJobOptions,
      ...overrides,
    },
  });

  activeQueues.push(queue);

  logger.info("Queue initialized", {
    queue: name,
    prefix: getQueuePrefix(),
  });

  return queue;
}
/**
 * 2026 Structural Standards: Explicitly drains and disconnects all
 * client sockets cleanly to prevent memory leaks and hanging worker processes.
 */

export async function closeAllQueues(): Promise<void> {
  await Promise.all(
    activeQueues.map(async (queue) => {
      try {
        const client = await queue.client;
        await queue.close();

        // Essential: BullMQ leaves external Redis connections open on close()
        if (client && client.status !== "end") {
          await client.quit();
        }
        logger.info("[Queue] Queue closed", {
          queue: queue.name,
        });
      } catch (err) {
        logger.error(`Failed cleanly closing queue: ${queue.name}`, {
          error: (err as Error).message,
        });
      }
    }),
  );
}
