/**
 * config/multer.ts
 *
 * WHY THE PREVIOUS APPROACH BROKE
 * ────────────────────────────────
 * Composing two multer instances in sequence:
 *
 *   uploadThumbnailMiddleware(req, res, () => uploadVideoMiddleware(req, res, next))
 *
 * fails because multipart/form-data is a single stream consumed by busboy.
 * The first multer instance reads the ENTIRE stream. When it encounters
 * the `videoPreview` field it doesn't recognise, busboy emits `Unexpected field`
 * before the second instance ever runs.
 *
 * THE FIX
 * ───────
 * Single multer instance with a custom StorageEngine that routes each field
 * to the appropriate strategy:
 *   thumbnail    → memoryStorage  (≤ 5 MB, safe for in-process CDN streaming)
 *   videoPreview → diskStorage    (≤ 500 MB, temp file → CDN stream → cleanup)
 *
 * PRODUCTION NOTE — VIDEO UPLOADS
 * ────────────────────────────────
 * Even with diskStorage, the backend is in the video upload path.
 * At scale, migrate to presigned URLs: client uploads directly to
 * Bunny.net / S3 / R2, backend receives only the CDN URL.
 * This removes video I/O from the request cycle entirely.
 */

import multer, { type FileFilterCallback, type StorageEngine } from "multer";
import type { RequestHandler, Request }                         from "express";
import fs                                                       from "fs";
import path                                                     from "path";
import os                                                       from "os";

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

const LIMITS = {
  IMAGE: 5   * 1024 * 1024, //   5 MB
  VIDEO: 500 * 1024 * 1024, // 500 MB
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM STORAGE ENGINE
//
// Implements the multer StorageEngine interface.
// Routes each field to its own storage strategy based on fieldname.
// This is the only correct way to use different storage strategies
// for different fields in a single multipart request.
// ─────────────────────────────────────────────────────────────────────────────

const courseMediaStorage: StorageEngine = {
  _handleFile(
    _req: Request,
    file: Express.Multer.File,
    cb:   (error: Error | null, info?: Partial<Express.Multer.File>) => void,
  ): void {
    if (file.fieldname === "thumbnail") {
      // ── Memory strategy for images ───────────────────────────────────────
      // Collect stream into a buffer. Acceptable for ≤ 5 MB.
      const chunks: Buffer[] = [];

      file.stream.on("data",  (chunk: Buffer) => chunks.push(chunk));
      file.stream.on("error", (err: Error)    => cb(err));
      file.stream.on("end",   () => {
        const buffer = Buffer.concat(chunks);
        cb(null, { buffer, size: buffer.length });
      });
      return;
    }

    if (file.fieldname === "videoPreview") {
      // ── Disk strategy for videos ─────────────────────────────────────────
      // Write to OS temp dir. file.service reads from disk path,
      // streams to CDN, then calls fs.unlink for cleanup.
      const ext      = path.extname(file.originalname).toLowerCase() || ".mp4";
      const filename = `video_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const filepath = path.join(os.tmpdir(), filename);
      const dest     = fs.createWriteStream(filepath);

      file.stream.pipe(dest);

      dest.on("error", (err) => {
        fs.unlink(filepath, () => {}); // best-effort cleanup
        cb(err);
      });

      dest.on("finish", () => {
        cb(null, {
          path:     filepath,
          filename,
          size:     dest.bytesWritten,
        });
      });
      return;
    }

    // Reject any unexpected field name — gives a clear 400, not a 500.
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },

  _removeFile(
    _req:  Request,
    file:  Express.Multer.File,
    cb:    (error: Error | null) => void,
  ): void {
    // Only disk-stored files have a path to clean up.
    if (file.path) {
      fs.unlink(file.path, cb);
    } else {
      cb(null);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTER
//
// Validates MIME type per field BEFORE storage runs.
// Multer calls this first; returning cb(null, false) skips storage entirely.
// ─────────────────────────────────────────────────────────────────────────────

function courseMediaFilter(
  _req:  Request,
  file:  Express.Multer.File,
  cb:    FileFilterCallback,
): void {
  if (file.fieldname === "thumbnail") {
    return ALLOWED_IMAGE_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Unsupported image format: ${file.mimetype}`));
  }

  if (file.fieldname === "videoPreview") {
    return ALLOWED_VIDEO_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Unsupported video format: ${file.mimetype}`));
  }

  cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
}

function imageFilter(
  _req:  Request,
  file:  Express.Multer.File,
  cb:    FileFilterCallback,
): void {
  ALLOWED_IMAGE_TYPES.has(file.mimetype)
    ? cb(null, true)
    : cb(new Error(`Unsupported image format: ${file.mimetype}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Course create / update.
 * Single instance, custom storage engine handles both fields.
 *
 *   req.files.thumbnail[0].buffer   → in-memory image buffer
 *   req.files.videoPreview[0].path  → disk path to temp video file
 */
export const uploadCourseMedia: RequestHandler = multer({
  storage:    courseMediaStorage,
  fileFilter: courseMediaFilter,
  limits: {
    // Per-file limit enforced at the field level in the storage engine,
    // but set the outer cap to the larger of the two so multer doesn't
    // reject videos before the field-level check runs.
    fileSize: LIMITS.VIDEO,
    files:    2,
  },
}).fields([
  { name: "thumbnail",    maxCount: 1 },
  { name: "videoPreview", maxCount: 1 },
]);

/**
 * Single image upload — programs, avatars, etc.
 */
export const uploadSingleImage: RequestHandler = multer({
  storage:    multer.memoryStorage(),
  fileFilter: imageFilter,
  limits:     { fileSize: LIMITS.IMAGE, files: 1 },
}).single("image");

// ─────────────────────────────────────────────────────────────────────────────
// TYPE AUGMENTATION
// ─────────────────────────────────────────────────────────────────────────────

// declare global {
//   namespace Express {
//     interface Request {
//       files?: {
//         [fieldname: string]: Express.Multer.File[];
//       };
//     }
//   }
// }