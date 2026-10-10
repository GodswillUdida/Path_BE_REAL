import { z } from "zod";
import { ResourceType } from "@prisma/client";
import { zJsonArray } from "@/utils/zodHelpers";

export const ResourceTypeEnum = z.nativeEnum(ResourceType);
const FILE_RESOURCE_TYPES = ["PDF", "EXCEL", "WORD", "TEMPLATE"] as const;
export const fileResourceTypeEnum = z.enum(FILE_RESOURCE_TYPES);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA-CHANGE NOTE — TopicResource is now async, same pattern as VideoAsset
// ─────────────────────────────────────────────────────────────────────────────
// TopicResource gained status/retryCount/lastError/readyAt — identical
// shape to VideoAsset. File-type resources (PDF/EXCEL/WORD/TEMPLATE) are
// no longer uploaded inline during the request; a row is created
// immediately with status: QUEUED, and a background worker
// (resource.worker.ts) performs the actual Bunny Storage upload and flips
// status to READY or FAILED. LINK resources have nothing to upload and
// are created with status: READY immediately.
//
// storageKey/url are both nullable in the schema, but storageKey is
// actually always KNOWN immediately for file types — it's a deterministic
// path (topicId + resourceId + filename), not something that depends on
// upload success. Only `status`/`readyAt` genuinely wait on the worker.
// See bunny.storage.client.ts's generateResourceStorageKey.
// ─────────────────────────────────────────────────────────────────────────────

// ── CREATE ──────────────────────────────────────────────────────────────────
// Metadata only. File-type entries correlate, in array order, to files
// uploaded under the `resources` multipart field — see topic.service.ts.

export const topicResourceCreateEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LINK"),
    title: z.string().min(1).max(200).trim(),
    url: z.string().url("Invalid resource URL"),
  }),
  z.object({
    type: fileResourceTypeEnum,
    title: z.string().min(1).max(200).trim(),
  }),
]);

export type TopicResourceCreateEntry = z.infer<typeof topicResourceCreateEntrySchema>;

// ── UPDATE ───────────────────────────────────────────────────────────────────
// action: "UPDATE" keeps an existing resource (optional title rename only
// — the file/storageKey is immutable via this path; to replace a file,
// omit the old entry (deletes it, including its Bunny object) and add a
// new "ADD" entry). action: "ADD" creates a new LINK or file resource;
// new file-type entries correlate by order to newly uploaded files.
// Any existing resource not referenced by an "UPDATE" entry is deleted.

export const topicResourceUpdateEntrySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    id: z.string().uuid("Invalid Resource ID"),
    title: z.string().min(1).max(200).trim().optional(),
  }),
  z.object({
    action: z.literal("ADD"),
    type: z.literal("LINK"),
    title: z.string().min(1).max(200).trim(),
    url: z.string().url("Invalid resource URL"),
  }),
  z.object({
    action: z.literal("ADD"),
    type: fileResourceTypeEnum,
    title: z.string().min(1).max(200).trim(),
  }),
]);

export type TopicResourceUpdateEntry = z.infer<typeof topicResourceUpdateEntrySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// PARAMS
// ─────────────────────────────────────────────────────────────────────────────

export const topicParamsSchema = z.object({
  id: z.string().uuid("Invalid Topic ID"),
});

export const moduleParamsSchema = z.object({
  moduleId: z.string().uuid("Invalid Module ID"),
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const createTopicSchema = z.object({
  title: z.string().min(2, "Title too short").max(200).trim(),
  position: z.coerce.number().int().min(0).optional(),
  resources: zJsonArray(topicResourceCreateEntrySchema).optional().default([]),
});

export const updateTopicSchema = z.object({
  title: z.string().min(2, "Title too short").max(200).trim().optional(),
  position: z.coerce.number().int().min(0).optional(),
  resources: zJsonArray(topicResourceUpdateEntrySchema).optional(),
});

export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;

/* ---------- BUNNY WEBHOOK ---------- */
export const bunnyWebhookSchema = z.object({
  VideoGuid: z.string(),
  Status: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4),
    z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10),
  ]),
  VideoLibraryId: z.number().optional(),
});

export type BunnyWebhookPayload = z.infer<typeof bunnyWebhookSchema>;