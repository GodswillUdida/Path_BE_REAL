/**
 * resource.queue.ts
 *
 * BullMQ queue for TopicResource file uploads to Bunny Storage.
 *
 * jobId = resourceId gives natural idempotency for the initial enqueue:
 * duplicate enqueues collapse into a single job. NOTE: BullMQ keeps that id
 * reserved for as long as the job exists in Redis (completed and failed jobs
 * included, unless removeOnComplete / removeOnFail drops them), so a plain
 * `add` for a resource that already failed is silently ignored. Retries and
 * re-uploads must go through `reenqueueResourceUpload`.
 */

import fs from "fs/promises";

import logger from "@/utils/logger";
import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import * as repo from "./topic.repo";

export interface ResourceUploadJob {
  resourceId: string;
  topicId: string;
  filePath: string;
  storageKey: string;
  mimeType: string;
}

const JOB_NAME = "upload-resource";

export const resourceUploadQueue = createQueue<ResourceUploadJob>(
  QUEUE_NAMES.RESOURCE_UPLOAD,
  {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
  },
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Enqueue a single resource upload (idempotent per resourceId while a job
 * with that id still exists).
 */
export async function enqueueResourceUpload(
  job: ResourceUploadJob,
): Promise<void> {
  await resourceUploadQueue.add(JOB_NAME, job, {
    jobId: job.resourceId,
  });
}

/**
 * Re-queue a resource whose previous job already finished (typically a
 * FAILED resource after the user re-uploads the file).
 *
 * Returns false when a job for this resource is still waiting / active /
 * delayed — the caller should treat that as "already in progress".
 */
export async function reenqueueResourceUpload(
  job: ResourceUploadJob,
): Promise<boolean> {
  const existing = await resourceUploadQueue.getJob(job.resourceId);

  if (existing) {
    const state = await existing.getState();

    if (state !== "completed" && state !== "failed") {
      return false;
    }

    await existing.remove();
  }

  await enqueueResourceUpload(job);

  return true;
}

/**
 * Batch helper used by topic.service.ts.
 *
 * An enqueue failure must not abort sibling jobs, but it must not be
 * silent either: the DB row already exists as QUEUED and nothing would
 * ever pick it up. The row is marked FAILED, the staged file is removed,
 * and the failed resource ids are returned so the caller can surface them.
 */
export async function enqueueResourceUploads(
  jobs: ResourceUploadJob[],
): Promise<string[]> {
  if (jobs.length === 0) return [];

  const failedResourceIds: string[] = [];

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await enqueueResourceUpload(job);
      } catch (error) {
        failedResourceIds.push(job.resourceId);

        logger.error("Failed to enqueue resource upload", {
          resourceId: job.resourceId,
          topicId: job.topicId,
          error: errorMessage(error),
        });

        await repo
          .recordResourceFailure(
            job.resourceId,
            "Upload could not be queued. Please upload the file again.",
          )
          .catch((dbError: unknown) => {
            logger.error("Failed to persist enqueue failure", {
              resourceId: job.resourceId,
              error: errorMessage(dbError),
            });
          });

        await fs.rm(job.filePath, { force: true }).catch((fsError: unknown) => {
          logger.warn("Failed to remove staged file after enqueue failure", {
            resourceId: job.resourceId,
            filePath: job.filePath,
            error: errorMessage(fsError),
          });
        });
      }
    }),
  );

  return failedResourceIds;
}