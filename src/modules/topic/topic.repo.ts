/**
 * topic.repository.ts
 *
 * Single point of contact with Prisma for Topic / VideoAsset / TopicResource.
 *
 * RESOURCE MODEL (current schema):
 * - storageKey / url are optional (String?)
 * - sizeBytes is Int?
 * - Full lifecycle identical to VideoAsset:
 *     status (QUEUED → PROCESSING → READY | FAILED)
 *     retryCount, lastError, readyAt
 *
 * Upload responsibility lives in topic.service.ts + resource.worker.ts.
 * This repository only persists records and never talks to Bunny Storage.
 *
 * Create path: service pre-generates resource IDs + deterministic storageKeys,
 * creates rows with status = QUEUED (files) or READY (LINKs), then enqueues
 * the worker. The worker later calls markResourceReady / recordResourceFailure.
 */

import prisma from "../../lib/prisma";
import { Prisma, ResourceStatus, ResourceType } from "@prisma/client";
import type { VideoStatus } from "@prisma/client";

type TopicDbClient = Prisma.TransactionClient | typeof prisma;

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
// ─────────────────────────────────────────────────────────────────────────────

export const TOPIC_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  moduleId: true,
  position: true,
  durationSeconds: true,
  createdAt: true,
  updatedAt: true,
  videoAsset: {
    select: {
      status: true,
      provider: true,
      thumbnailUrl: true,
      durationSeconds: true,
      readyAt: true,
    },
  },
  resources: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      type: true,
      title: true,
      storageKey: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      retryCount: true,
      lastError: true,
      readyAt: true,
      position: true,
    },
  },
} satisfies Prisma.TopicSelect;

export type TopicWithAssets = Prisma.TopicGetPayload<{
  select: typeof TOPIC_LIST_SELECT;
}>;

export type VideoAssetWebhookRecord = {
  topicId: string;
  status: VideoStatus;
  topic: { moduleId: string };
};

/**
 * Record prepared by the service before persistence.
 * - id is pre-generated so storageKey can be deterministic.
 * - storageKey is known immediately (even for QUEUED rows).
 * - status defaults to QUEUED for file types; READY for LINKs.
 */
export interface ResolvedResourceRecord {
  id: string;
  type: ResourceType;
  title: string;
  storageKey: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status?: ResourceStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP PROBES
// ─────────────────────────────────────────────────────────────────────────────

export async function findModuleForTopicWrite(moduleId: string): Promise<{
  id: string;
  courseId: string;
  instructorId: string | null;
} | null> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId, deletedAt: null },
    select: {
      id: true,
      courseId: true,
      course: { select: { instructorId: true, deletedAt: true } },
    },
  });
  if (!mod || mod.course.deletedAt) return null;
  return {
    id: mod.id,
    courseId: mod.courseId,
    instructorId: mod.course.instructorId,
  };
}

export async function findTopicForWrite(id: string): Promise<{
  id: string;
  slug: string;
  moduleId: string;
  title: string;
  courseInstructorId: string | null;
} | null> {
  const topic = await prisma.topic.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      slug: true,
      moduleId: true,
      title: true,
      module: {
        select: {
          deletedAt: true,
          course: { select: { instructorId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!topic || topic.module.deletedAt || topic.module.course.deletedAt) {
    return null;
  }
  return {
    id: topic.id,
    slug: topic.slug,
    moduleId: topic.moduleId,
    title: topic.title,
    courseInstructorId: topic.module.course.instructorId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SLUG / POSITION
// ─────────────────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateUniqueTopicSlug(
  title: string,
  moduleId: string,
  db: TopicDbClient = prisma,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title) || "topic";

  const existing = await db.topic.findMany({
    where: {
      moduleId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
    },
    select: { slug: true },
  });

  const taken = new Set(existing.map((t) => t.slug));
  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix <= 50; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(
    `Could not generate a unique topic slug for "${title}" after 50 attempts`,
  );
}

export async function nextTopicPosition(
  moduleId: string,
  db: TopicDbClient = prisma,
): Promise<number> {
  const aggregate = await db.topic.aggregate({
    where: { moduleId, deletedAt: null },
    _max: { position: true },
  });
  return aggregate._max.position === null ? 0 : aggregate._max.position + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY (VideoAsset)
// ─────────────────────────────────────────────────────────────────────────────

export async function findTopicByVideoIdempotencyKey(
  idempotencyKey: string,
): Promise<TopicWithAssets | null> {
  const asset = await prisma.videoAsset.findUnique({
    where: { idempotencyKey },
    select: { topicId: true },
  });
  if (!asset) return null;
  return prisma.topic.findFirst({
    where: { id: asset.topicId, deletedAt: null },
    select: TOPIC_LIST_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

function buildResourceCreateData(records: ResolvedResourceRecord[]) {
  return records.map((r, i) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    storageKey: r.storageKey,
    url: r.url,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    status: r.status ?? (r.type === "LINK" ? "READY" : "QUEUED"),
    position: i,
  }));
}

export async function insertTopicWithVideoAsset(
  data: { title: string },
  moduleId: string,
  slug: string,
  position: number,
  resolvedResources: ResolvedResourceRecord[],
  idempotencyKey: string | undefined,
  tx: Prisma.TransactionClient,
  topicId?: string,
): Promise<TopicWithAssets> {
  return tx.topic.create({
    data: {
      ...(topicId ? { id: topicId } : {}),
      title: data.title,
      slug,
      moduleId,
      position,
      videoAsset: {
        create: {
          provider: "BUNNY",
          status: "QUEUED",
          idempotencyKey: idempotencyKey ?? null,
        },
      },
      resources: {
        create: buildResourceCreateData(resolvedResources),
      },
    },
    select: TOPIC_LIST_SELECT,
  });
}

/**
 * Owns the create transaction + P2002 retry.
 * Resources are passed already prepared (IDs + storageKeys known).
 * No Bunny calls occur here.
 */
export async function createTopic(
  moduleId: string,
  data: { title: string; position?: number },
  resolvedResources: ResolvedResourceRecord[],
  idempotencyKey?: string,
  topicId?: string,
): Promise<TopicWithAssets> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const slug = await generateUniqueTopicSlug(data.title, moduleId, tx);
        const position =
          data.position ?? (await nextTopicPosition(moduleId, tx));
        return insertTopicWithVideoAsset(
          data,
          moduleId,
          slug,
          position,
          resolvedResources,
          idempotencyKey,
          tx,
          topicId,
        );
      });
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== "P2002"
      ) {
        throw err;
      }

      if (idempotencyKey) {
        const existing = await findTopicByVideoIdempotencyKey(idempotencyKey);
        if (existing) return existing;
      }

      if (attempt === 1) throw err;
    }
  }
  throw new Error("Failed to create topic after transaction retries");
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function listTopicsForModule(
  moduleId: string,
): Promise<TopicWithAssets[]> {
  return prisma.topic.findMany({
    where: { moduleId, deletedAt: null },
    orderBy: { position: "asc" },
    select: TOPIC_LIST_SELECT,
  });
}

export async function findTopicForPlayback(id: string): Promise<{
  id: string;
  deletedAt: Date | null;
  courseId: string;
  videoAsset: {
    status: VideoStatus;
    provider: string;
    providerAssetId: string | null;
  } | null;
} | null> {
  const topic = await prisma.topic.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      module: { select: { courseId: true } },
      videoAsset: {
        select: { status: true, provider: true, providerAssetId: true },
      },
    },
  });
  if (!topic) return null;
  return {
    id: topic.id,
    deletedAt: topic.deletedAt,
    courseId: topic.module.courseId,
    videoAsset: topic.videoAsset,
  };
}

export async function checkEnrollmentAccess(
  userId: string,
  courseId: string,
): Promise<boolean> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, courseId, status: "ACTIVE" },
    select: { id: true },
  });
  return !!enrollment;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO ASSET WRITES
// ─────────────────────────────────────────────────────────────────────────────

export async function findVideoAssetByProviderAssetId(
  providerAssetId: string,
): Promise<VideoAssetWebhookRecord | null> {
  return prisma.videoAsset.findUnique({
    where: {
      provider_providerAssetId: {
        provider: "BUNNY",
        providerAssetId,
      },
    },
    select: {
      topicId: true,
      status: true,
      topic: { select: { moduleId: true } },
    },
  });
}

export async function updateVideoAssetStatusByTopicId(
  topicId: string,
  status: VideoStatus,
): Promise<void> {
  await prisma.videoAsset.update({
    where: { topicId },
    data: { status },
  });
}

export async function markVideoAssetReady(
  topicId: string,
  meta: {
    durationSeconds: number;
    fileSizeBytes: number;
    width: number | null;
    height: number | null;
    thumbnailUrl: string | null;
  },
): Promise<void> {
  await prisma.$transaction([
    prisma.videoAsset.update({
      where: { topicId },
      data: {
        status: "READY",
        durationSeconds: meta.durationSeconds,
        fileSizeBytes: BigInt(meta.fileSizeBytes),
        width: meta.width,
        height: meta.height,
        thumbnailUrl: meta.thumbnailUrl,
        readyAt: new Date(),
      },
    }),
    prisma.topic.update({
      where: { id: topicId },
      data: { durationSeconds: meta.durationSeconds },
    }),
  ]);
}

export async function setVideoAssetProviderAssetId(
  topicId: string,
  providerAssetId: string,
): Promise<void> {
  await prisma.videoAsset.update({
    where: { topicId },
    data: { providerAssetId },
  });
}

export async function clearVideoAssetProviderAssetId(
  topicId: string,
): Promise<void> {
  await prisma.videoAsset.update({
    where: { topicId },
    data: { providerAssetId: null },
  });
}

export async function recordVideoAssetFailure(
  topicId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.videoAsset.update({
    where: { topicId },
    data: {
      status: "FAILED",
      lastError: errorMessage.slice(0, 2000),
      retryCount: { increment: 1 },
    },
  });
}

export async function findVideoAssetProviderId(
  topicId: string,
): Promise<string | null> {
  const asset = await prisma.videoAsset.findUnique({
    where: { topicId },
    select: { providerAssetId: true },
  });
  return asset?.providerAssetId ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCE STATUS TRANSITIONS (used by resource.worker.ts)
// ─────────────────────────────────────────────────────────────────────────────

export async function markResourceReady(
  id: string,
  meta: {
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  },
): Promise<boolean> {
  const { count } = await prisma.topicResource.updateMany({
    where: { id, topic: { deletedAt: null } },
    data: {
      status: "READY",
      url: meta.url,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      readyAt: new Date(),
      lastError: null,
    },
  });
 
  return count > 0;
}

export async function recordResourceFailure(
  id: string,
  errorMessage: string,
): Promise<void> {
  await prisma.topicResource.updateMany({
    where: { id, status: { not: "READY" } },
    data: {
      status: "FAILED",
      lastError: errorMessage.slice(0, 2000),
      retryCount: { increment: 1 },
    },
  });
}

export async function recordResourceRetry(
  id: string,
  retryCount: number,
  errorMessage: string,
): Promise<void> {
  await prisma.topicResource.updateMany({
    where: { id, status: { not: "READY" } },
    data: {
      retryCount,
      lastError: errorMessage.slice(0, 2000),
    },
  });
}

export async function findResourceForWorker(id: string): Promise<{
  id: string;
  type: ResourceType;
  storageKey: string | null;
  status: ResourceStatus;
  topicId: string;
} | null> {
  return prisma.topicResource.findFirst({
    where: { id, topic: { deletedAt: null } },
    select: {
      id: true,
      type: true,
      storageKey: true,
      status: true,
      topicId: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE / RESOURCE DIFF
// ─────────────────────────────────────────────────────────────────────────────

export async function updateTopicScalars(
  id: string,
  data: { title?: string; slug?: string; position?: number },
  db: TopicDbClient = prisma,
): Promise<void> {
  await db.topic.update({ where: { id }, data });
}

/**
 * Mirrors the Zod action discriminator.
 * - UPDATE → keep existing row, optional title rename, position re-normalized
 * - ADD    → create new row from a ResolvedResourceRecord
 *
 * Anything not referenced by an UPDATE entry is deleted.
 * Caller (service) is responsible for deleting remote storage objects
 * AFTER the transaction commits.
 */
export type ResourceUpdateOp =
  | { action: "UPDATE"; id: string; title?: string }
  | { action: "ADD"; record: ResolvedResourceRecord };

export async function applyTopicResourceUpdate(
  topicId: string,
  ops: ResourceUpdateOp[],
  tx: Prisma.TransactionClient,
): Promise<{ deleted: { id: string; storageKey: string }[] }> {
  const keepIds = ops
    .filter(
      (o): o is Extract<ResourceUpdateOp, { action: "UPDATE" }> =>
        o.action === "UPDATE",
    )
    .map((o) => o.id);

  const toDelete = await tx.topicResource.findMany({
    where: { topicId, id: { notIn: keepIds } },
    select: { id: true, storageKey: true, type: true },
  });

  if (toDelete.length > 0) {
    await tx.topicResource.deleteMany({
      where: { id: { in: toDelete.map((d) => d.id) } },
    });
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];

    if (op.action === "UPDATE") {
      await tx.topicResource.update({
        where: { id: op.id },
        data: {
          position: i,
          ...(op.title !== undefined && { title: op.title }),
        },
      });
    } else {
      const r = op.record;
      await tx.topicResource.create({
        data: {
          id: r.id,
          topicId,
          type: r.type,
          title: r.title,
          storageKey: r.storageKey,
          url: r.url,
          mimeType: r.mimeType,
          sizeBytes: r.sizeBytes,
          status: r.status ?? (r.type === "LINK" ? "READY" : "QUEUED"),
          position: i,
        },
      });
    }
  }

  return {
    deleted: toDelete
      .filter((d) => d.type !== "LINK" && d.storageKey)
      .map(({ id, storageKey }) => ({ id, storageKey: storageKey! })),
  };
}

export async function updateTopic(
  id: string,
  data: { title?: string; position?: number },
  resourceOps: ResourceUpdateOp[] | undefined,
): Promise<{
  moduleId: string;
  deletedResources: { id: string; storageKey: string }[];
} | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.topic.findUnique({
      where: { id },
      select: { title: true, moduleId: true },
    });
    if (!existing) return null;

    let slug: string | undefined;
    if (data.title !== undefined && data.title !== existing.title) {
      slug = await generateUniqueTopicSlug(
        data.title,
        existing.moduleId,
        tx,
        id,
      );
    }

    await updateTopicScalars(
      id,
      {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.position !== undefined && { position: data.position }),
        ...(slug !== undefined && { slug }),
      },
      tx,
    );

    let deletedResources: { id: string; storageKey: string }[] = [];
    if (resourceOps !== undefined) {
      const result = await applyTopicResourceUpdate(id, resourceOps, tx);
      deletedResources = result.deleted;
    }

    return { moduleId: existing.moduleId, deletedResources };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-deletes the topic and returns storage keys that the service
 * must clean up from Bunny Storage after the call returns.
 */
export async function softDeleteTopic(
  id: string,
): Promise<{ storageKeys: string[] }> {
  const resources = await prisma.topicResource.findMany({
    where: { topicId: id },
    select: { storageKey: true, type: true },
  });

  await prisma.topic.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return {
    storageKeys: resources
      .filter((r) => r.type !== "LINK" && r.storageKey)
      .map((r) => r.storageKey!),
  };
}
