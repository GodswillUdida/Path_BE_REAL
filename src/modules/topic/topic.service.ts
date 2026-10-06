/**
 * topic.service.ts
 *
 * Orchestrates Topic lifecycle, video processing, resource uploads,
 * signed playback, and Bunny webhooks.
 *
 * Resource model (async):
 * - LINK  → persisted immediately as READY
 * - FILE  → persisted as QUEUED with a deterministic storageKey;
 *           resource.worker.ts performs the Bunny Storage upload and
 *           transitions status to READY / FAILED.
 *
 * Video model remains unchanged (topic.worker.ts + Bunny Stream).
 */

import fs from "fs/promises";
import crypto from "crypto";
import { ResourceStatus, ResourceType } from "@prisma/client";
import type { VideoStatus } from "@prisma/client";

import { badRequest, forbidden, notFound } from "../../utils/errors";
import logger from "@/utils/logger";
import { withMetrics } from "../../utils/observability";
import { BunnyClient } from "@/utils/bunny.client";
import {
  generateResourceStorageKey,
  deleteFromBunnyStorage,
  sanitizeFileName,
} from "@/utils/bunny.storage.client";
import type {
  CreateTopicInput,
  TopicResourceCreateEntry,
  TopicResourceUpdateEntry,
  UpdateTopicInput,
} from "./topic.schema";
import * as repo from "./topic.repo";
import type {
  ResolvedResourceRecord,
  ResourceUpdateOp,
  TopicWithAssets,
} from "./topic.repo";
import { enqueueVideoProcessing } from "./topic.queue";
import {
  enqueueResourceUploads,
  type ResourceUploadJob,
} from "./resource.queue";
import {
  getCachedTopicList,
  invalidateTopicList,
  setCachedTopicList,
} from "./topic.cache";
import { getBunnyConfig } from "@/config/bunny.config";

// const bunny  = createBunnyClient({
//   config: getBunnyConfig(),
//   logger
// })

// ─────────────────────────────────────────────────────────────────────────────
const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID!;
const SIGNING_KEY = process.env.BUNNY_STREAM_SIGNING_KEY!;
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const READONLY_API_KEY = process.env.BUNNY_STREAM_READONLY_API_KEY!;

type BunnyStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const STATUS_MAP: Partial<Record<BunnyStatus, VideoStatus>> = {
  0: "QUEUED",
  1: "PROCESSING",
  2: "PROCESSING",
  5: "FAILED",
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function cleanupTempFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(
    files.map((file) =>
      fs.unlink(file.path).catch((err: unknown) =>
        logger.warn("Failed to clean up temporary upload", {
          path: file.path,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    ),
  );
}

/**
 * Builds ResolvedResourceRecord[] for create.
 * - Pre-generates UUIDs so storageKeys are deterministic.
 * - LINK  → status READY, storageKey null
 * - FILE  → status QUEUED, storageKey computed immediately
 */
function buildResolvedResourcesForCreate(
  topicId: string,
  entries: TopicResourceCreateEntry[],
  files: Express.Multer.File[],
): ResolvedResourceRecord[] {
  const fileEntries = entries.filter(
    (
      e,
    ): e is Extract<
      TopicResourceCreateEntry,
      { type: Exclude<ResourceType, "LINK"> }
    > => e.type !== "LINK",
  );

  if (fileEntries.length !== files.length) {
    throw badRequest(
      `Resource correlation error: expected ${fileEntries.length} files, received ${files.length}`,
    );
  }

  let fileIdx = 0;

  return entries.map((entry): ResolvedResourceRecord => {
    const id = crypto.randomUUID();

    if (entry.type === "LINK") {
      return {
        id,
        type: ResourceType.LINK,
        title: entry.title,
        storageKey: null,
        url: entry.url,
        mimeType: null,
        sizeBytes: null,
        status: ResourceStatus.READY,
      };
    }

    const file = files[fileIdx++];
    const safeName = sanitizeFileName(file.originalname);
    const storageKey = generateResourceStorageKey(topicId, id, safeName);

    return {
      id,
      type: entry.type as ResourceType,
      title: entry.title,
      storageKey,
      url: null,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      status: ResourceStatus.QUEUED,
    };
  });
}

/**
 * Converts Zod update entries + newly uploaded files into ResourceUpdateOp[].
 * ADD file entries are correlated by order to the multipart files.
 */
function buildResourceUpdateOps(
  topicId: string,
  entries: TopicResourceUpdateEntry[],
  newFiles: Express.Multer.File[],
): ResourceUpdateOp[] {
  const addFileEntries = entries.filter(
    (
      e,
    ): e is Extract<
      TopicResourceUpdateEntry,
      { action: "ADD"; type: Exclude<ResourceType, "LINK"> }
    > => e.action === "ADD" && e.type !== "LINK",
  );

  if (addFileEntries.length !== newFiles.length) {
    throw badRequest(
      `Resource correlation error: expected ${addFileEntries.length} new files, received ${newFiles.length}`,
    );
  }

  let fileIdx = 0;

  return entries.map((entry): ResourceUpdateOp => {
    if (entry.action === "UPDATE") {
      return {
        action: "UPDATE",
        id: entry.id,
        title: entry.title,
      };
    }

    // action === "ADD"
    const id = crypto.randomUUID();

    if (entry.type === "LINK") {
      return {
        action: "ADD",
        record: {
          id,
          type: ResourceType.LINK,
          title: entry.title,
          storageKey: null,
          url: entry.url,
          mimeType: null,
          sizeBytes: null,
          status: ResourceStatus.READY,
        },
      };
    }

    const file = newFiles[fileIdx++];
    const safeName = sanitizeFileName(file.originalname);
    const storageKey = generateResourceStorageKey(topicId, id, safeName);

    return {
      action: "ADD",
      record: {
        id,
        type: entry.type as ResourceType,
        title: entry.title,
        storageKey,
        url: null,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: ResourceStatus.QUEUED,
      },
    };
  });
}

function buildResourceUploadJobs(
  resources: Array<{
    id: string;
    storageKey: string | null;
    mimeType: string | null;
  }>,
  files: Express.Multer.File[],
  topicId: string,
): ResourceUploadJob[] {
  return resources.map((resource, index) => {
    if (!resource.storageKey) {
      throw new Error(`Missing storageKey for resource ${resource.id}`);
    }

    return {
      resourceId: resource.id,
      topicId,
      storageKey: resource.storageKey,
      filePath: files[index].path,
      mimeType: resource.mimeType ?? files[index].mimetype,
    };
  });
}

async function safeDeleteStorageKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  await Promise.allSettled(
    keys.map((key) =>
      deleteFromBunnyStorage(key).catch((err: unknown) =>
        logger.warn("Failed to delete Bunny Storage object", {
          storageKey: key,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export const createTopic = async (
  moduleId: string,
  data: CreateTopicInput,
  videoFile: Express.Multer.File,
  resourceFiles: Express.Multer.File[] = [],
  idempotencyKey?: string,
): Promise<TopicWithAssets> => {
  return withMetrics("topic.create", async () => {
    const allTempFiles = [videoFile, ...resourceFiles];

    try {
      // 1. Idempotency short-circuit
      if (idempotencyKey) {
        const existing =
          await repo.findTopicByVideoIdempotencyKey(idempotencyKey);
        if (existing) {
          await cleanupTempFiles(allTempFiles);
          return existing;
        }
      }

      // 2. Validate video
      if (!videoFile.mimetype.startsWith("video/")) {
        throw badRequest("Invalid video type");
      }

      // 3. Ownership / existence
      const module = await repo.findModuleForTopicWrite(moduleId);
      if (!module) {
        throw notFound("Module not found or associated course is archived");
      }

      // 4. Pre-generate topicId so storageKeys are deterministic
      //    and match the ID that will be written to the DB.
      const topicId = crypto.randomUUID();

      const resolvedResources = buildResolvedResourcesForCreate(
        topicId,
        data.resources ?? [],
        resourceFiles,
      );

      // 5. Persist Topic + VideoAsset(QUEUED) + TopicResources
      //    Repository must accept the pre-generated topicId (see note below).
      const topic = await repo.createTopic(
        moduleId,
        { title: data.title, position: data.position },
        resolvedResources,
        idempotencyKey,
        topicId, // pass explicit ID
      );

      await invalidateTopicList(moduleId);

      // 6. Enqueue video processing (owns videoFile.path)
      await enqueueVideoProcessing({
        topicId: topic.id,
        filePath: videoFile.path,
        bunnyTitle: data.title,
      });

      // 7. Enqueue resource uploads (QUEUED file-type rows only)
      const queuedFileResources = topic.resources.filter(
        (r) =>
          r.type !== ResourceType.LINK &&
          r.status === ResourceStatus.QUEUED &&
          r.storageKey !== null,
      );

      if (queuedFileResources.length > 0) {
        const jobs = buildResourceUploadJobs(
          queuedFileResources,
          resourceFiles,
          topic.id,
        );
        await enqueueResourceUploads(jobs);
      }

      logger.info("Created topic and enqueued assets", {
        topicId: topic.id,
        resourceCount: resourceFiles.length,
      });

      return topic;
    } catch (error: unknown) {
      await cleanupTempFiles(allTempFiles);
      logger.error("Failed to create topic", { moduleId, error });
      throw error;
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateTopic = async (
  id: string,
  data: UpdateTopicInput,
  newResourceFiles: Express.Multer.File[] = [],
): Promise<void> => {
  return withMetrics("topic.update", async () => {
    try {
      let resourceOps: ResourceUpdateOp[] | undefined;

      if (data.resources !== undefined) {
        resourceOps = buildResourceUpdateOps(
          id,
          data.resources,
          newResourceFiles,
        );
      }

      const result = await repo.updateTopic(
        id,
        { title: data.title, position: data.position },
        resourceOps,
      );

      if (!result) {
        throw notFound("Topic not found");
      }

      // Post-commit: delete storage objects for removed resources
      await safeDeleteStorageKeys(
        result.deletedResources.map((r) => r.storageKey),
      );

      // Enqueue uploads for newly ADDed file resources
      if (resourceOps) {
        const newFileOps = resourceOps.filter(
          (op): op is Extract<ResourceUpdateOp, { action: "ADD" }> =>
            op.action === "ADD" &&
            op.record.type !== ResourceType.LINK &&
            op.record.status === ResourceStatus.QUEUED &&
            op.record.storageKey !== null,
        );

        if (newFileOps.length > 0) {
          const jobs: ResourceUploadJob[] = newFileOps.map((op, index) => ({
            resourceId: op.record.id,
            topicId: id,
            storageKey: op.record.storageKey!,
            filePath: newResourceFiles[index].path,
            mimeType: op.record.mimeType ?? newResourceFiles[index].mimetype,
          }));

          await enqueueResourceUploads(jobs);
        }
      }

      await invalidateTopicList(result.moduleId);
    } catch (error: unknown) {
      await cleanupTempFiles(newResourceFiles);
      throw error;
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export const deleteTopic = async (id: string): Promise<boolean> => {
  return withMetrics("topic.delete", async () => {
    const existing = await repo.findTopicForWrite(id);
    if (!existing) {
      throw notFound("Topic not found");
    }

    const { storageKeys } = await repo.softDeleteTopic(id);

    await safeDeleteStorageKeys(storageKeys);
    await invalidateTopicList(existing.moduleId);

    return true;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export const listTopicsForModule = async (
  moduleId: string,
): Promise<TopicWithAssets[]> => {
  return withMetrics("topic.list", async () => {
    const cached = await getCachedTopicList(moduleId);
    if (cached !== null) {
      logger.debug("Topic list cache hit", { moduleId });
      return cached;
    }

    logger.debug("Topic list cache miss", { moduleId });
    const topics = await repo.listTopicsForModule(moduleId);
    await setCachedTopicList(moduleId, topics);
    return topics;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// SIGNED PLAYBACK
// ─────────────────────────────────────────────────────────────────────────────

export const generateSignedPlaybackUrl = async (
  topicId: string,
  userId?: string,
  _ip?: string,
): Promise<string> => {
  if (!userId) {
    throw forbidden("User must be logged in to access this topic");
  }

  const topic = await repo.findTopicForPlayback(topicId);
  if (!topic || topic.deletedAt) {
    throw notFound("Topic not found");
  }

  if (
    !topic.videoAsset ||
    topic.videoAsset.status !== "READY" ||
    !topic.videoAsset.providerAssetId
  ) {
    throw notFound("Video not ready");
  }

  const hasAccess = await repo.checkEnrollmentAccess(userId, topic.courseId);
  if (!hasAccess) {
    throw forbidden("User does not have access to this topic");
  }

  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const providerAssetId = topic.videoAsset.providerAssetId;

  const token = crypto
    .createHash("sha256")
    .update(`${SIGNING_KEY}${providerAssetId}${expires}`)
    .digest("hex");

  return `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${providerAssetId}?token=${token}&expires=${expires}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// BUNNY WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────

export const verifyBunnyWebhookSignature = (
  rawBody: Buffer,
  signature: string,
  version: string,
  algorithm: string,
): boolean => {
  if (version !== "v1" || algorithm !== "hmac-sha256") return false;

  const expected = crypto
    .createHmac("sha256", READONLY_API_KEY)
    .update(rawBody)
    .digest("hex");

  if (
    typeof signature !== "string" ||
    signature.length !== expected.length ||
    !/^[0-9a-f]+$/.test(signature)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature, "utf8"),
  );
};

async function markReadyAndFetchMetadata(
  topicId: string,
  videoGuid: string,
): Promise<void> {
  const meta = await BunnyClient.getVideo(videoGuid);
  if (!meta) {
    logger.warn("Failed to fetch video metadata from Bunny", {
      videoGuid,
      topicId,
    });
    throw new Error("Failed to fetch video metadata");
  }

  await repo.markVideoAssetReady(topicId, {
    durationSeconds: meta.length ?? 0,
    fileSizeBytes: meta.storageSize ?? 0,
    width: meta.width ?? null,
    height: meta.height ?? null,
    thumbnailUrl: meta.thumbnailFileName
      ? `https://vz-${LIBRARY_ID}.b-cdn.net/${videoGuid}/${meta.thumbnailFileName}`
      : null,
  });

  logger.info("Video asset marked READY", { videoGuid, topicId });
}

export const handleBunnyWebhook = async (payload: {
  VideoGuid: string;
  Status: BunnyStatus;
  VideoLibraryId?: number;
}): Promise<void> => {
  const { VideoGuid, Status, VideoLibraryId } = payload;
  if (!VideoGuid) return;

  if (VideoLibraryId !== undefined && String(VideoLibraryId) !== LIBRARY_ID) {
    logger.warn("Webhook VideoLibraryId mismatch — ignoring", {
      VideoLibraryId,
      VideoGuid,
    });
    return;
  }

  const asset = await repo.findVideoAssetByProviderAssetId(VideoGuid);
  if (!asset) {
    logger.warn("Webhook for unknown providerAssetId — ignoring", {
      VideoGuid,
    });
    return;
  }

  const moduleId = asset.topic.moduleId;

  // Ready statuses (3 = finished encoding, 4 = resolution finished)
  if (Status === 3 || Status === 4) {
    if (asset.status !== "READY") {
      await markReadyAndFetchMetadata(asset.topicId, VideoGuid);
      await invalidateTopicList(moduleId);
    }
    return;
  }

  const newStatus = STATUS_MAP[Status];
  if (!newStatus) {
    logger.info("Informational Bunny webhook — no state change", {
      VideoGuid,
      topicId: asset.topicId,
      Status,
    });
    return;
  }

  if (asset.status === newStatus) return;

  await repo.updateVideoAssetStatusByTopicId(asset.topicId, newStatus);
  await invalidateTopicList(moduleId);
};
