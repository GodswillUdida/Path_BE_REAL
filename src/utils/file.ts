/**
 * shared/services/file.service.ts
 *
 * Updated to handle files from the custom storage engine.
 *
 * After the multer refactor, files arrive in two forms:
 *   thumbnail    → file.buffer is populated (memoryStorage path)
 *   videoPreview → file.path is populated   (diskStorage path)
 *
 * streamUpload() already accepts a Buffer. For disk-stored videos,
 * we read the file into a buffer and stream it to the CDN, then
 * clean up the temp file. This keeps the CDN adapter interface
 * uniform while correctly handling both storage strategies.
 *
 * TODO: replace the video upload path with presigned URLs so the
 * backend never reads large video files at all.
 */

import fs                        from "fs";
// import { streamUpload }          from "../config/stream";
import logger                    from "../utils/logger";
import { badRequest, ApiError }  from "../utils/errors";
import { uploadImageBuffer } from "@/config/cloudinary";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type UploadOutcome =
  | { ok: true;  url: string; publicId: string }
  | { ok: false; error: string };

type MediaType = "image" | "video";

type UploadOptions = {
  folder:           string;
  maxFileSize:      number;
  allowedMimeTypes: ReadonlySet<string>;
  mediaType:        MediaType;
};

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_OPTIONS: UploadOptions = {
  folder:           "pathfinder/images/courses",
  maxFileSize:      1 * 1024 * 1024,
  allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  mediaType:        "image",
};

const VIDEO_OPTIONS: UploadOptions = {
  folder:           "pathfinder/videos/courses",
  maxFileSize:      100 * 1024 * 1024,
  allowedMimeTypes: new Set(["video/mp4", "video/webm", "video/quicktime"]),
  mediaType:        "video",
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// Always runs before I/O. Throws typed 400 — never 500.
// ─────────────────────────────────────────────────────────────────────────────

function validateFile(file: Express.Multer.File, options: UploadOptions): void {
  if (file.size > options.maxFileSize) {
    const actualMB = (file.size / (1024 * 1024)).toFixed(2);
    const limitMB  = (options.maxFileSize / (1024 * 1024)).toFixed(0);
    throw badRequest(
      `File too large (${actualMB} MB). Maximum for ${options.mediaType}s is ${limitMB} MB.`
    );
  }

  if (!options.allowedMimeTypes.has(file.mimetype)) {
    throw badRequest(
      `Unsupported ${options.mediaType} format: ${file.mimetype}. ` +
      `Accepted: ${[...options.allowedMimeTypes].join(", ")}`
    );
  }

  if (file.originalname.length > 255) {
    throw badRequest("Filename exceeds 255 characters.");
  }
}

// What to do after this is stable
// The video upload path still reads a 500MB file from disk into Node heap before streaming it to the CDN. That's tolerable for low concurrency but won't hold at scale. The correct production architecture is presigned URLs: the client uploads directly to the CDN, and the backend only receives the final URL. This eliminates video I/O from the request cycle entirely, improving performance and scalability while reducing server load and costs. Implementing this would require changes to both the backend (to generate presigned URLs) and the frontend (to use them for uploads).

// ─────────────────────────────────────────────────────────────────────────────
// BUFFER RESOLUTION
//
// The custom storage engine populates either file.buffer (images)
// or file.path (videos). This function normalises both to a Buffer
// for the CDN streaming adapter.
//
// The temp file is deleted after the buffer is read — regardless of
// whether the upload succeeds — to prevent disk accumulation.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (file.buffer) return file.buffer;

  if (file.path) {
    try {
      const buffer = await fs.promises.readFile(file.path);
      return buffer;
    } finally {
      // Always clean up — don't leave temp files on disk
      fs.unlink(file.path, (err) => {
        if (err) logger.warn("file.temp.cleanup_failed", { path: file.path, err });
      });
    }
  }

  throw new Error("Multer file has neither buffer nor path — storage engine misconfigured.");
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY
// ─────────────────────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [1_000, 2_000];

async function attemptUpload(
  buffer:  Buffer,
  file:    Express.Multer.File,
  options: UploadOptions,
): Promise<UploadOutcome> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await uploadImageBuffer(buffer, options.folder);

      logger.info("file.upload.success", {
        attempt: attempt + 1,
        mediaType: options.mediaType,
        file: file.originalname,
        size: file.size,
        url:  result.secure_url,
      });

      return { ok: true, url: result.secure_url, publicId: result.public_id };
    } catch (err) {
      lastError = err;

      logger.warn("file.upload.attempt_failed", {
        attempt,
        mediaType: options.mediaType,
        file:      file.originalname,
        error:     err instanceof Error ? err.message : String(err),
      });

      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  logger.error("file.upload.all_attempts_failed", {
    mediaType: options.mediaType,
    file:      file.originalname,
    error:     lastError instanceof Error ? lastError.message : String(lastError),
  });

  return {
    ok:    false,
    error: lastError instanceof Error ? lastError.message : "CDN upload failed",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function uploadRequired(
  file:    Express.Multer.File,
  options: UploadOptions,
): Promise<string> {
  validateFile(file, options);
  const buffer  = await resolveBuffer(file);
  const outcome = await attemptUpload(buffer, file, options);

  if (!outcome.ok) {
    throw new ApiError(
      `${options.mediaType.charAt(0).toUpperCase() + options.mediaType.slice(1)} upload failed. ` +
      "Please try again. If this persists, contact support.",
      503,
    );
  }

  return outcome.url;
}

async function uploadOptional(
  file:    Express.Multer.File | undefined,
  options: UploadOptions,
): Promise<string | null> {
  if (!file) return null;

  validateFile(file, options);
  const buffer  = await resolveBuffer(file);
  const outcome = await attemptUpload(buffer, file, options);

  if (!outcome.ok) {
    logger.warn("file.upload.optional_degraded", {
      mediaType: options.mediaType,
      file:      file.originalname,
      error:     outcome.error,
    });
    return null;
  }

  return outcome.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Required — throws 400/503 on failure. */
export async function uploadThumbnail(file: Express.Multer.File): Promise<string> {
  return uploadRequired(file, IMAGE_OPTIONS);
}

/** Optional — returns null on CDN failure, never throws. */
export async function uploadVideoPreview(
  file: Express.Multer.File | undefined,
): Promise<string | null> {
  return uploadOptional(file, VIDEO_OPTIONS);
}

/** General-purpose image upload. */
export async function uploadImage(
  file:     Express.Multer.File | undefined,
  folder:   string,
  required: boolean = false,
): Promise<string | null> {
  const options = { ...IMAGE_OPTIONS, folder };
  if (required) {
    if (!file) throw badRequest("Image file is required");
    return uploadRequired(file, options);
  }
  return uploadOptional(file, options);
}

/** @deprecated — use uploadThumbnail() or uploadImage() */
export async function uploadImageOrFail(
  file?:  Express.Multer.File,
  folder: string = IMAGE_OPTIONS.folder,
): Promise<string> {
  if (!file) throw badRequest("Image file is required");
  return uploadRequired(file, { ...IMAGE_OPTIONS, folder });
}

/** @deprecated — use uploadVideoPreview() */
export async function uploadVideoOrFail(
  file?:  Express.Multer.File,
  folder: string = VIDEO_OPTIONS.folder,
): Promise<string> {
  if (!file) throw badRequest("Video file is required");
  return uploadRequired(file, { ...VIDEO_OPTIONS, folder });
}