// shared/utils/file.ts
import { streamUpload } from "config/stream";
import { badRequest } from "../utils/errors";
import logger from "./logger";

export function validateImage(file?: Express.Multer.File) {
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.mimetype)) {
    throw badRequest("Invalid image type");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw badRequest("Image too large (max 2MB)");
  }
}


export async function resolveThumbnail(
  file?: Express.Multer.File,
  fallback?: string,
): Promise<string> {
  /* -------------------- FILE UPLOAD -------------------- */
  if (file) {
    validateImage(file); // strict validation

    try {
      const result = await streamUpload(
        file.buffer,
        "pathfinder/images/courses",
      );

      return result.secure_url;
    } catch (err) {
      logger.error("Thumbnail upload failed", err);
      throw badRequest("Failed to upload image");
    }
  }

  /* -------------------- FALLBACK -------------------- */
  if (fallback) return fallback;

  throw badRequest("Thumbnail is required");
}