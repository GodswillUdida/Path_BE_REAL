import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from "cloudinary";
import streamifier from "streamifier";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`cloudinary.client.ts: missing required env var ${name}`);
  return value;
}

cloudinary.config({
  cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
  api_key: requireEnv("CLOUDINARY_API_KEY"),
  api_secret: requireEnv("CLOUDINARY_API_SECRET"),
  secure: true,
});

const HEARTBEAT_INTERVAL_MS = 5_000;
const IMAGE_UPLOAD_TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO — path-based, chunked (see prior implementation, unchanged)
// ─────────────────────────────────────────────────────────────────────────────

interface UploadVideoOptions {
  publicId: string;
  overwrite?: boolean;
  onHeartbeat?: (elapsedMs: number) => void;
}

export async function uploadVideoPreviewFromPath(
  filePath: string,
  options: UploadVideoOptions,
): Promise<string> {
  const startedAt = Date.now();
  let heartbeat: NodeJS.Timeout | undefined;

  if (options.onHeartbeat) {
    heartbeat = setInterval(() => {
      options.onHeartbeat!(Date.now() - startedAt);
    }, HEARTBEAT_INTERVAL_MS);
  }

  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload_large(
        filePath,
        {
          resource_type: "video",
          public_id: options.publicId,
          overwrite: options.overwrite ?? true,
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("Cloudinary returned no result"));
          resolve(result);
        },
      );
    });

    return result.secure_url;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

export async function deleteVideoPreview(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
  } catch {
    // best effort — mirrors BunnyClient.deleteVideo's cleanup semantics
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE — buffer-based, for memoryStorage fields (course thumbnails, avatars)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads an in-memory image buffer via Cloudinary's upload_stream.
 *
 * Timeout guard: without one, a stalled connection here means the caller's
 * await never settles and withRetry() (which wraps this at the call site,
 * e.g. course.service.ts's uploadThumbnail) never gets a chance to retry —
 * a hung promise doesn't reject, so retry logic simply never fires.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  folder: string,
): Promise<UploadApiResponse> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot upload an empty image buffer");
  }

  return new Promise<UploadApiResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Cloudinary image upload timed out after ${IMAGE_UPLOAD_TIMEOUT_MS}ms`));
    }, IMAGE_UPLOAD_TIMEOUT_MS);

    const settle = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image", // explicit, not "auto" — this path is buffer-based and only ever used for images (see config/multer.ts: memoryStorage is used only for the thumbnail field)
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (result) return settle(() => resolve(result));
        return settle(() => reject(error ?? new Error("Cloudinary returned no result")));
      },
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
}