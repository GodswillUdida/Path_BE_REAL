/**
 * config/multer.ts
 *
 * Multipart upload configuration for the platform.
 *
 * DESIGN RULES
 * ────────────
 * 1. One multer instance per logical upload shape.
 *    Never compose two multer instances sequentially — the first consumes
 *    the entire multipart stream and any unrecognised field aborts the request.
 *
 * 2. Custom StorageEngine only when memory + disk must coexist in the same
 *    request (course thumbnail + videoPreview). All other uploads use the
 *    built-in diskStorage or memoryStorage.
 *
 * 3. TMP_DIR must be a volume shared between the API and worker containers.
 *    Falls back to os.tmpdir() for local development.
 *
 * 4. At scale, lecture videos should move to presigned URLs so the backend
 *    is no longer in the upload path.
 */

import multer, {
  type FileFilterCallback,
  type StorageEngine,
  MulterError,
} from "multer";
import type { Request, RequestHandler, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { badRequest } from "../utils/errors";
import logger from "../utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const ALLOWED_RESOURCE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg",
]);

export const LIMITS = {
  IMAGE: 2 * 1024 * 1024, // 2 MB
  VIDEO: 100 * 1024 * 1024, // 100 MB — course preview clips
  TOPIC_VIDEO: 2 * 1024 * 1024 * 1024, // 2 GB — full lecture videos
  TOPIC_RESOURCE: 50 * 1024 * 1024, // 50 MB per resource file
} as const;

export const MAX_TOPIC_RESOURCES = 10;

/** Shared volume in production; OS temp dir in local dev. */
const TMP_DIR = process.env.UPLOAD_TMP_DIR || os.tmpdir();

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function tempFilename(prefix: string, originalname: string): string {
  const ext = path.extname(originalname).toLowerCase() || "";
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM STORAGE — course thumbnail (memory) + videoPreview (disk)
// ─────────────────────────────────────────────────────────────────────────────

const courseMediaStorage: StorageEngine = {
  _handleFile(req, file, cb) {
    if (file.fieldname === "thumbnail") {
      // Manual size guard: outer limits.fileSize is sized for videoPreview.
      const chunks: Buffer[] = [];
      let total = 0;
      let rejected = false;

      file.stream.on("data", (chunk: Buffer) => {
        if (rejected) return;
        total += chunk.length;
        if (total > LIMITS.IMAGE) {
          rejected = true;
          file.stream.destroy();
          cb(new MulterError("LIMIT_FILE_SIZE", file.fieldname));
          return;
        }
        chunks.push(chunk);
      });

      file.stream.on("error", (err) => cb(err));
      file.stream.on("end", () => {
        if (rejected) return;
        const buffer = Buffer.concat(chunks);
        cb(null, { buffer, size: buffer.length });
      });
      return;
    }

    if (file.fieldname === "videoPreview") {
      const filename = tempFilename("video", file.originalname);
      const filepath = path.join(TMP_DIR, filename);
      const dest = fs.createWriteStream(filepath);

      file.stream.pipe(dest);

      dest.on("error", (err) => {
        fs.unlink(filepath, () => {});
        cb(err);
      });

      dest.on("finish", () => {
        // Busboy sets stream.truncated when the outer fileSize limit is hit.
        if ((file.stream as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
          fs.unlink(filepath, () => {});
          cb(new MulterError("LIMIT_FILE_SIZE", file.fieldname));
          return;
        }
        cb(null, { path: filepath, filename, size: dest.bytesWritten });
      });
      return;
    }

    cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },

  _removeFile(_req, file, cb) {
    if (file.path) {
      fs.unlink(file.path, (err) => cb(err ?? null));
    } else {
      cb(null);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DISK STORAGE — topic lecture video + resources
// ─────────────────────────────────────────────────────────────────────────────

const topicVideoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) =>
    cb(null, tempFilename("topic", file.originalname)),
});

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────────────────────────────────────

function courseMediaFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (file.fieldname === "thumbnail") {
    return ALLOWED_IMAGE_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(badRequest(`Invalid image format: ${file.mimetype}`));
  }

  if (file.fieldname === "videoPreview") {
    return ALLOWED_VIDEO_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(badRequest(`Unsupported video format: ${file.mimetype}`));
  }

  cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
}

function imageFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  ALLOWED_IMAGE_TYPES.has(file.mimetype)
    ? cb(null, true)
    : cb(badRequest(`Unsupported image format: ${file.mimetype}`));
}

function topicVideoFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (file.fieldname === "video") {
    return ALLOWED_VIDEO_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(badRequest(`Unsupported video format: ${file.mimetype}`));
  }

  if (file.fieldname === "resourceFiles") {
    return ALLOWED_RESOURCE_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(badRequest(`Unsupported resource format: ${file.mimetype}`));
  }

  cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Course create / update.
 *   req.files.thumbnail[0].buffer  → in-memory image
 *   req.files.videoPreview[0].path → disk temp path
 */
export const uploadCourseMedia: RequestHandler = multer({
  storage: courseMediaStorage,
  fileFilter: courseMediaFilter,
  limits: {
    fileSize: LIMITS.VIDEO, // outer cap for videoPreview; thumbnail capped inside storage engine
    files: 2,
  },
}).fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "videoPreview", maxCount: 1 },
]);

/**
 * Single image upload — programs, avatars, etc.
 */
export const uploadSingleImage: RequestHandler = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: LIMITS.IMAGE, files: 1 },
}).single("image");

/**
 * Topic lecture video + optional resource attachments.
 *   req.files.video[0].path
 *   req.files.resources[i].path
 *
 * Outer fileSize is the video ceiling. Per-resource size is enforced
 * by enforceResourceSizeLimits (multer has no per-field size limit).
 */
// export const uploadTopicVideo: RequestHandler = multer({
//   storage: topicVideoStorage,
//   fileFilter: topicVideoFilter,
//   limits: {
//     fileSize: LIMITS.TOPIC_VIDEO,
//     files: 1 + MAX_TOPIC_RESOURCES,
//   },
// }).fields([
//   { name: "video", maxCount: 1 },
//   { name: "resources", maxCount: MAX_TOPIC_RESOURCES },
// ]);

export const uploadTopicVideo: RequestHandler = multer({
  storage: topicVideoStorage,
  fileFilter: topicVideoFilter,
  limits: {
    fileSize: LIMITS.TOPIC_VIDEO,
    files: 1 + MAX_TOPIC_RESOURCES,
  },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "resourceFiles", maxCount: MAX_TOPIC_RESOURCES },
]);

/**
 * Secondary size guard for TopicResource files.
 * Runs after uploadTopicVideo. Deletes oversized temp files before
 * the request reaches the controller.
 */
export const enforceResourceSizeLimits: RequestHandler = (
  req,
  _res,
  next,
) => {
  const files = req.files as
    | {
        video?: Express.Multer.File[];
        resourceFiles?: Express.Multer.File[];
      }
    | undefined;

  const resourceFiles = files?.resourceFiles ?? [];

  const oversized = resourceFiles.filter(
    (file) => file.size > LIMITS.TOPIC_RESOURCE,
  );

  if (oversized.length === 0) {
    return next();
  }

  // Best-effort cleanup of rejected temporary files
  for (const file of oversized) {
    if (file.path) {
      fs.unlink(file.path, () => {});
    }
  }

  return next(
    badRequest(
      `Resource file${oversized.length > 1 ? "s" : ""} too large: ${oversized
        .map((file) => file.originalname)
        .join(", ")}. Limit is ${
        LIMITS.TOPIC_RESOURCE / (1024 * 1024)
      } MB each.`,
    ),
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ORPHANED TEMP FILE SWEEP
//
//  * Call from a BullMQ repeatable job (e.g. daily). Removes temp files left
//  * behind by crashed workers or killed API processes.
//  */
export async function sweepOrphanedTempFiles(
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  const entries = await fs.promises.readdir(TMP_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const entry of entries) {
    if (!entry.startsWith("video_") && !entry.startsWith("topic_")) continue;

    const fullPath = path.join(TMP_DIR, entry);
    try {
      const stat = await fs.promises.stat(fullPath);
      if (stat.mtimeMs < cutoff) {
        await fs.promises.unlink(fullPath);
        removed++;
      }
    } catch {
      // concurrently removed — ignore
    }
  }

  if (removed > 0) {
    logger.info("Swept orphaned temp upload files", {
      removed,
      tmpDir: TMP_DIR,
    });
  }

  return removed;
}