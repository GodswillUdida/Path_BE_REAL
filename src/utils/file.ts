// shared/services/file.service.ts
import { streamUpload } from "../config/stream";
import logger from "../utils/logger";
import { badRequest } from "../utils/errors";

export async function uploadImageOrFail(
  file?: Express.Multer.File
): Promise<string> {
  if (!file) {
    throw badRequest("Thumbnail is required");
  }

  try {
    const result = await streamUpload(
      file.buffer,
      "pathfinder/images/courses"
    );

    return result.secure_url;
  } catch (error: unknown) {
    logger.error("IMAGE_UPLOAD_FAILED", {
      message: error instanceof Error ? error.message : "unknown",
    });

    throw badRequest("Image upload failed");
  }
}