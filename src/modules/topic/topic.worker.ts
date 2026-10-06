import fs from "fs/promises";

import { Job, UnrecoverableError } from "bullmq";

import { VideoProcessingJob } from "./topic.queue";

import prisma from "@/lib/prisma";

import logger from "@/utils/logger";

import { createWorker } from "@/lib/queues/create-worker";

import { QUEUE_NAMES } from "@/lib/queues/registry";

import { ApiError, BunnyUploadError } from "@/utils/errors";

import { BunnyClient } from "@/utils/bunny.client";

const PROGRESS_LOG_INTERVAL_MS = 5_000;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds a `.catch()` handler that logs a failed DB write. State writes in
 * this worker are best-effort bookkeeping and must never mask the real error.
 */
function logDbFailure(message: string, context: Record<string, unknown>) {
  return (error: unknown): void => {
    logger.error(message, { ...context, error: errorMessage(error) });
  };
}

/** Removes the local temp upload. Never throws. */
async function removeLocalFile(
  filePath: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await fs.rm(filePath, { force: true });

    logger.info("Removed local upload file", { ...context, filePath });
  } catch (error) {
    logger.warn("Failed to remove local upload file", {
      ...context,
      filePath,
      error: errorMessage(error),
    });
  }
}

/**
 * Deletes the remote Bunny asset. Returns true only when Bunny confirms it
 * is gone. On false the asset id MUST stay in the DB so the orphan stays
 * traceable (BunnyClient.deleteVideo never throws).
 */
async function discardRemoteAsset(
  providerAssetId: string,
  context: Record<string, unknown>,
): Promise<boolean> {
  const deleted = await BunnyClient.deleteVideo(providerAssetId);

  if (deleted) {
    logger.info("Deleted Bunny asset", { ...context, providerAssetId });
  } else {
    logger.error("Bunny asset could not be deleted; keeping id for cleanup", {
      ...context,
      providerAssetId,
    });
  }

  return deleted;
}

/* -------------------------------------------------------------------------- */
/* Video processing                                                           */
/* -------------------------------------------------------------------------- */

async function processVideoJob(
  job: Job<VideoProcessingJob, void, string>,
): Promise<void> {
  const { topicId, filePath, bunnyTitle } = job.data;

  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 1;
  const isFinalAttempt = attempt >= maxAttempts;

  const ctx = { topicId, jobId: job.id };

  logger.info("Starting topic video processing", {
    ...ctx,
    filePath,
    attempt,
    maxAttempts,
  });

  /* ------------------------------------------------------------------------ */
  /* 1. Load topic + existing Bunny asset                                     */
  /* ------------------------------------------------------------------------ */

  const topic = await prisma.topic.findUnique({
    where: {
      id: topicId,
    },
    select: {
      id: true,

      videoAsset: {
        select: {
          providerAssetId: true,
          status: true,
        },
      },
    },
  });

  if (!topic) {
    // The topic is gone, so nothing in the DB references the file.
    await removeLocalFile(filePath, ctx);

    throw new UnrecoverableError(`Topic ${topicId} no longer exists`);
  }

  let guid = topic.videoAsset?.providerAssetId ?? null;

  /* ------------------------------------------------------------------------ */
  /* 2. Verify local upload                                                   */
  /* ------------------------------------------------------------------------ */

  try {
    await fs.access(filePath);
  } catch {
    logger.error("Local upload file missing", { ...ctx, filePath });

    // A previous attempt may already have created the Bunny asset. The file
    // is gone, so no retry can ever fill it — don't leave an empty orphan.
    const deleted = guid ? await discardRemoteAsset(guid, ctx) : true;

    await prisma.videoAsset
      .update({
        where: {
          topicId,
        },
        data: {
          status: "FAILED",
          ...(deleted ? { providerAssetId: null } : {}),
          lastError: "Local upload binary file missing from temp volume.",
        },
      })
      .catch(
        logDbFailure("Failed to persist missing file state", ctx),
      );

    throw new UnrecoverableError(
      `Upload asset source not found: ${filePath}`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* 3. Create Bunny asset when necessary                                     */
  /* ------------------------------------------------------------------------ */

  if (!guid) {
    let createdGuid: string | null = null;

    try {
      logger.info("Creating Bunny video asset", { ...ctx, bunnyTitle });

      const created = await BunnyClient.createVideo(bunnyTitle);

      createdGuid = created.guid;

      /**
       * Persist the Bunny GUID immediately so future BullMQ attempts reuse
       * the same asset instead of creating another remote video.
       */
      await prisma.videoAsset.upsert({
        where: {
          topicId,
        },

        create: {
          topicId,
          provider: "BUNNY",
          providerAssetId: created.guid,
          status: "PROCESSING",
          retryCount: job.attemptsMade,
          lastError: null,
        },

        update: {
          provider: "BUNNY",
          providerAssetId: created.guid,
          status: "PROCESSING",
          retryCount: job.attemptsMade,
          lastError: null,
        },
      });

      guid = created.guid;

      logger.info("Bunny video asset created", {
        ...ctx,
        providerAssetId: guid,
      });
    } catch (error) {
      // Asset exists remotely but the GUID never reached the DB: the next
      // attempt would create a second asset and this one would leak forever.
      if (createdGuid) {
        await discardRemoteAsset(createdGuid, ctx);
      }

      throw classify(error, "createVideo", ctx);
    }
  } else {
    logger.info("Reusing existing Bunny video asset", {
      ...ctx,
      providerAssetId: guid,
      existingStatus: topic.videoAsset?.status,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* 4. Resolve Bunny asset ID                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Separate constant so the progress callback closes over a non-nullable.
   */
  const providerAssetId = guid;

  if (!providerAssetId) {
    throw new UnrecoverableError(
      `No Bunny video asset ID available for topic ${topicId}`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* 5. Progress tracking                                                     */
  /* ------------------------------------------------------------------------ */

  let lastLoggedAt = 0;

  /**
   * BullMQ progress updates are serialized so at most one Redis write is in
   * flight at a time.
   */
  let progressUpdate: Promise<void> = Promise.resolve();

  const updateProgress = (
    uploadedBytes: number,
    totalBytes: number,
  ): void => {
    const now = Date.now();

    if (now - lastLoggedAt < PROGRESS_LOG_INTERVAL_MS) {
      return;
    }

    lastLoggedAt = now;

    const percent =
      totalBytes > 0
        ? Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
        : 0;

    logger.info("Video upload progress", {
      ...ctx,
      providerAssetId,
      uploadedBytes,
      totalBytes,
      percent,
    });

    progressUpdate = progressUpdate
      .then(() => job.updateProgress(percent))
      .catch((error: unknown) => {
        logger.warn("Failed to update video job progress", {
          ...ctx,
          providerAssetId,
          percent,
          error: errorMessage(error),
        });
      });
  };

  /* ------------------------------------------------------------------------ */
  /* 6. Upload binary to Bunny                                                */
  /* ------------------------------------------------------------------------ */

  try {
    logger.info("Starting Bunny binary upload", {
      ...ctx,
      providerAssetId,
      filePath,
      attempt,
    });

    await BunnyClient.uploadVideo(providerAssetId, filePath, updateProgress);
  } catch (error) {
    const classified = classify(error, "uploadVideo", {
      ...ctx,
      providerAssetId,
      attempt,
    });

    /**
     * Terminal = will never run again: either a non-retryable error, or a
     * retryable one on the final attempt. BullMQ cannot clean up after the
     * last attempt, so it has to happen here — otherwise the Bunny asset
     * and the local file both leak.
     */
    const terminal = classified instanceof UnrecoverableError || isFinalAttempt;

    if (terminal) {
      const deleted = await discardRemoteAsset(providerAssetId, ctx);

      await prisma.videoAsset
        .update({
          where: {
            topicId,
          },

          data: {
            // Keep the id when the delete failed so the orphan is findable.
            ...(deleted ? { providerAssetId: null } : {}),
            status: "FAILED",
            retryCount: job.attemptsMade,
            lastError: classified.message,
          },
        })
        .catch(
          logDbFailure("Failed to persist permanent upload failure", {
            ...ctx,
            providerAssetId,
          }),
        );

      await removeLocalFile(filePath, ctx);
    }

    /**
     * Retryable failures with attempts left intentionally preserve the
     * providerAssetId and the local file so BullMQ can retry against the
     * same Bunny asset.
     */
    throw classified;
  }

  /* ------------------------------------------------------------------------ */
  /* 7. Record success                                                        */
  /* ------------------------------------------------------------------------ */

  /**
   * Deliberately outside the upload try/catch: a DB or Redis hiccup after a
   * successful upload must never trigger remote deletion of a good asset.
   */

  /** Let the last serialized progress write settle before reporting 100%. */
  await progressUpdate;

  await job.updateProgress(100).catch((error: unknown) => {
    logger.warn("Failed to set final job progress", {
      ...ctx,
      error: errorMessage(error),
    });
  });

  /**
   * Bunny accepting the binary does NOT mean the video is playable.
   *
   * PROCESSING → UPLOADED → (Bunny transcoding) → READY (webhook only)
   *
   * readyAt stays untouched here.
   */
  await prisma.videoAsset.update({
    where: {
      topicId,
    },

    data: {
      status: "UPLOADED",
      retryCount: job.attemptsMade,
      lastError: null,
    },
  });

  // Only after the DB confirms UPLOADED: the temp volume must not accumulate
  // multi-GB files.
  await removeLocalFile(filePath, ctx);

  logger.info("Topic video binary uploaded successfully", {
    ...ctx,
    providerAssetId,
  });
}

/* -------------------------------------------------------------------------- */
/* Worker                                                                     */
/* -------------------------------------------------------------------------- */

export const topicVideoWorker = createWorker<VideoProcessingJob, void>(
  QUEUE_NAMES.TOPIC_VIDEO,
  processVideoJob,
  {
    concurrency: 1,
  },
);

/* -------------------------------------------------------------------------- */
/* Worker events                                                              */
/* -------------------------------------------------------------------------- */

topicVideoWorker.on("ready", () => {
  logger.info("Topic video worker ready", {
    queue: topicVideoWorker.name,
    prefix: topicVideoWorker.opts.prefix,
  });
});

topicVideoWorker.on("active", (job) => {
  logger.info("Topic video job active", {
    jobId: job.id,
    queue: job.queueName,
    prefix: job.prefix,
    attempt: job.attemptsMade + 1,
  });
});

/**
 * Safety net for failures the processor cannot record itself (stalled jobs,
 * crashes, lock loss). It only writes DB state; it never touches
 * providerAssetId, so orphans stay traceable.
 */
topicVideoWorker.on("failed", async (job, error) => {
  if (!job) {
    return;
  }

  const ctx = { topicId: job.data.topicId, jobId: job.id };

  const attempts = job.opts.attempts ?? 1;
  const attemptsMade = job.attemptsMade;

  const exhausted = attemptsMade >= attempts;

  const unrecoverable =
    error instanceof UnrecoverableError || error?.name === "UnrecoverableError";

  /* ------------------------------------------------------------------------ */
  /* Retry still available                                                    */
  /* ------------------------------------------------------------------------ */

  if (!exhausted && !unrecoverable) {
    await prisma.videoAsset
      .update({
        where: {
          topicId: job.data.topicId,
        },

        data: {
          retryCount: attemptsMade,
          status: "PROCESSING",
          lastError: error.message,
        },
      })
      .catch(logDbFailure("Failed to persist retry state", ctx));

    logger.warn("Topic video job will retry", {
      ...ctx,
      attemptsMade,
      attempts,
      error: error.message,
    });

    return;
  }

  /* ------------------------------------------------------------------------ */
  /* Terminal failure                                                         */
  /* ------------------------------------------------------------------------ */

  await prisma.videoAsset
    .update({
      where: {
        topicId: job.data.topicId,
      },

      data: {
        status: "FAILED",
        retryCount: attemptsMade,
        lastError: exhausted
          ? `Exhausted retries: ${error.message}`
          : error.message,
      },
    })
    .catch(logDbFailure("Failed to persist terminal video failure", ctx));

  logger.error("Topic video job permanently failed", {
    ...ctx,
    attemptsMade,
    attempts,
    error: error.message,
  });
});

/* -------------------------------------------------------------------------- */
/* Error classification                                                       */
/* -------------------------------------------------------------------------- */

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError(errorMessage(error));
}

function classify(
  error: unknown,
  stage: string,
  context: Record<string, unknown>,
): Error {
  if (error instanceof BunnyUploadError) {
    logger.error(`Bunny operation failed at [${stage}]`, {
      ...context,
      retryable: error.retryable,
      error: error.message,
    });

    return error.retryable ? error : new UnrecoverableError(error.message);
  }

  const normalized = normalizeError(error);

  logger.error(`Unhandled operational fault at [${stage}]`, {
    ...context,
    error: normalized.message,
  });

  return normalized;
}