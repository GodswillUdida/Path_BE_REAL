/**
 * resource.worker.ts
 *
 * Processes ResourceUploadJob:
 * 1. Skip stale deliveries (row deleted, or already READY)
 * 2. Read staged file → upload to Bunny Storage (deterministic key, so a
 *    retry overwrites instead of duplicating)
 * 3. Mark the row READY atomically (matches only a live row under a live
 *    topic). If it matches nothing, the resource was deleted mid-upload:
 *    remove the just-written storage object and exit cleanly
 * 4. Delete the staged file only after that
 *
 * Failure bookkeeping lives in ONE place — the `failed` handler below —
 * so retry state, terminal state and staged-file cleanup can't drift apart.
 * The processor never deletes the staged file before success: a retry
 * needs it.
 *
 * All DB writes go through topic.repo helpers — never raw Prisma from the
 * worker.
 */

import fs from "fs/promises";
import { Job, UnrecoverableError } from "bullmq";
import logger from "@/utils/logger";
import {
  uploadToBunnyStorage,
  buildPublicUrl,
  deleteFromBunnyStorage,
} from "@/utils/bunny.storage.client";
import { createWorker } from "@/lib/queues/create-worker";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import * as repo from "./topic.repo";
import type { ResourceUploadJob } from "./resource.queue";

/**
 * The storage client takes a Buffer, and concurrency is 3, so worst-case
 * memory is 3x this. Enforce the real limit at the upload endpoint too;
 * this is the backstop. Switch the storage client to streams to lift it.
 */
const MAX_BUFFERED_UPLOAD_BYTES = 100 * 1024 * 1024;

const MISSING_FILE_MESSAGE =
  "Staged upload file is missing (removed before processing). Please upload the file again.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/** Removes the staged file. Never throws. */
async function removeStagedFile(
  filePath: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await fs.rm(filePath, { force: true });
  } catch (error) {
    logger.warn("Failed to remove staged resource file", {
      ...context,
      filePath,
      error: errorMessage(error),
    });
  }
}

async function processResourceUpload(
  job: Job<ResourceUploadJob>,
): Promise<void> {
  const { resourceId, filePath, storageKey, mimeType } = job.data;

  const ctx = { resourceId, jobId: job.id, attempt: job.attemptsMade + 1 };

  // ── 1. Stale-delivery guards ───────────────────────────────────────────
  // findResourceForWorker returns null for deleted rows AND soft-deleted topics.
  const resource = await repo.findResourceForWorker(resourceId);

  if (!resource) {
    logger.warn("Resource was deleted before processing — dropping job", ctx);
    await removeStagedFile(filePath, ctx);
    return;
  }

  // BullMQ may redeliver a job that already finished (stall recovery, manual
  // re-add). The staged file is gone by then; failing here would flip a
  // healthy READY row to FAILED.
  if (resource.status === "READY") {
    logger.info("Resource already READY — ignoring duplicate delivery", ctx);
    await removeStagedFile(filePath, ctx);
    return;
  }

  // ── 2. Ensure staged file exists ───────────────────────────────────────
  let sizeBytes: number;

  try {
    sizeBytes = (await fs.stat(filePath)).size;
  } catch (error) {
    if (!isNotFound(error)) throw error; // transient fs error → retry

    logger.error("Staged resource file missing — cannot process", {
      ...ctx,
      filePath,
    });

    throw new UnrecoverableError(MISSING_FILE_MESSAGE);
  }

  if (sizeBytes > MAX_BUFFERED_UPLOAD_BYTES) {
    throw new UnrecoverableError(
      `Resource file is too large to process (${sizeBytes} bytes)`,
    );
  }

  // ── 3. Upload to Bunny Storage (file stays on disk until success) ──────
  const buffer = await fs.readFile(filePath);

  await uploadToBunnyStorage(buffer, storageKey, mimeType);

  // ── 4. Mark READY atomically, then release the staged file ─────────────
  // markResourceReady only matches a row that still exists AND whose topic
  // is not soft-deleted, so "deleted while we uploaded" is detected by the
  // write itself — no check-then-write window.
  const marked = await repo.markResourceReady(resourceId, {
    url: buildPublicUrl(storageKey),
    mimeType,
    sizeBytes: buffer.byteLength,
  });

  if (!marked) {
    logger.warn(
      "Resource was deleted during upload — removing orphaned storage object",
      { ...ctx, storageKey },
    );

    await deleteFromBunnyStorage(storageKey).catch((error: unknown) =>
      logger.error("Failed to clean up orphaned resource object", {
        ...ctx,
        storageKey,
        error: errorMessage(error),
      }),
    );

    await removeStagedFile(filePath, ctx);
    return; // clean exit — nothing left to mark READY
  }

  await removeStagedFile(filePath, ctx);

  logger.info("Resource uploaded to Bunny Storage", { ...ctx, storageKey });
}

// ─────────────────────────────────────────────────────────────────────────────

export const resourceUploadWorker = createWorker<ResourceUploadJob>(
  QUEUE_NAMES.RESOURCE_UPLOAD,
  processResourceUpload,
  { concurrency: 3 }, // documents are small & independent
);

/**
 * Single owner of failure bookkeeping (also covers stalled jobs and crashes
 * the processor never gets to handle).
 *
 * - attempts left  → record retryCount / lastError, keep status
 * - terminal       → FAILED + release the staged file
 */
resourceUploadWorker.on("failed", async (job, error) => {
  if (!job) return;

  const { resourceId, filePath } = job.data;

  const attempts = job.opts.attempts ?? 1;
  const attemptsMade = job.attemptsMade;

  const exhausted = attemptsMade >= attempts;
  const unrecoverable =
    error instanceof UnrecoverableError || error?.name === "UnrecoverableError";

  const ctx = { resourceId, jobId: job.id, attemptsMade, attempts };

  if (!exhausted && !unrecoverable) {
    await repo
      .recordResourceRetry(resourceId, attemptsMade, error.message)
      .catch((dbError: unknown) =>
        logger.error("Failed to persist resource retry state", {
          ...ctx,
          error: errorMessage(dbError),
        }),
      );

    logger.warn("Resource upload will retry", {
      ...ctx,
      error: error.message,
    });

    return;
  }

  await repo
    .recordResourceFailure(
      resourceId,
      unrecoverable ? error.message : `Exhausted retries: ${error.message}`,
    )
    .catch((dbError: unknown) =>
      // best-effort — the row may already be gone
      logger.error("Failed to persist terminal resource failure", {
        ...ctx,
        error: errorMessage(dbError),
      }),
    );

  await removeStagedFile(filePath, ctx);

  logger.error("Resource upload permanently failed", {
    ...ctx,
    error: error.message,
  });
});