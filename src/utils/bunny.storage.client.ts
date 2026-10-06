/**
 * bunny.storage.client.ts
 *
 * Client for Bunny's Edge Storage API (docs.bunny.net/storage/http) —
 * distinct from BunnyClient (Stream API, video library). Used for
 * TopicResource file objects (PDFs, spreadsheets, docs, templates).
 *
 *   PUT    https://{region}.storage.bunnycdn.com/{zone}/{path}  → 201 on success
 *   DELETE https://{region}.storage.bunnycdn.com/{zone}/{path}
 *   Auth: `AccessKey: <storage zone password>` — a different credential
 *   from the account API key and the Stream API key.
 */

import axios from "axios";
import path from "path";

const REGION_HOST = process.env.BUNNY_STORAGE_REGION_HOST || "storage.bunnycdn.com";
const ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME;
const ACCESS_KEY = process.env.BUNNY_STORAGE_PASSWORD;
// Optional — only set if a Pull Zone is attached for public CDN delivery.
// Without one, files are still stored/retrievable via the Storage API
// itself, but there's no public URL; TopicResource.url stays null, which
// the schema explicitly allows.
const PULL_ZONE_HOST = process.env.BUNNY_STORAGE_PULL_ZONE_HOST;

if (!ZONE_NAME || !ACCESS_KEY) {
  throw new Error(
    "BUNNY_STORAGE_ZONE_NAME and BUNNY_STORAGE_PASSWORD must be set to use TopicResource file uploads",
  );
}

const baseUrl = `https://${REGION_HOST}/${ZONE_NAME}`;

const storageHttp = axios.create({
  headers: { AccessKey: ACCESS_KEY },
});

export interface BunnyStorageUploadResult {
  storageKey: string;
  url: string | null;
}

/** Per Bunny's docs, 201 = success — axios throws on any non-2xx by
 *  default, so a resolved promise here means it worked. */
export async function uploadToBunnyStorage(
  buffer: Buffer,
  storageKey: string,
  contentType?: string,
): Promise<BunnyStorageUploadResult> {
  await storageHttp.put(`${baseUrl}/${storageKey}`, buffer, {
    headers: { "Content-Type": contentType || "application/octet-stream" },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return { storageKey, url: buildPublicUrl(storageKey) };
}

/** Idempotent — a 404 (already gone) is success, not an error. Matters
 *  for cleanup paths that may race with or repeat a prior delete. */
export async function deleteFromBunnyStorage(storageKey: string): Promise<void> {
  try {
    await storageHttp.delete(`${baseUrl}/${storageKey}`);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return;
    throw err;
  }
}

export function buildPublicUrl(storageKey: string): string | null {
  if (!PULL_ZONE_HOST) return null;
  return `https://${PULL_ZONE_HOST}/${storageKey}`;
}

/** Strips anything that isn't filesystem/URL-safe out of the original
 *  filename's base, keeps the extension. Prevents a resource titled
 *  "Q&A (final) — v2.pdf" from producing a broken or ambiguous path. */
export function sanitizeFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const base = path
    .basename(fileName, ext)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${base || "resource"}${ext}`;
}

/** Deterministic — can be computed at creation time, before any upload
 *  happens, since it depends only on IDs and the original filename, not
 *  on upload success. This is what lets TopicResource.storageKey be set
 *  immediately (status: QUEUED) rather than waiting for the worker. */
export function generateResourceStorageKey(
  topicId: string,
  resourceId: string,
  originalFilename: string,
): string {
  return `topics/${topicId}/resources/${resourceId}/${sanitizeFileName(originalFilename)}`;
}