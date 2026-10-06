import fs from "node:fs";

import { z } from "zod";

import { BunnyUploadError } from "./errors";
import logger from "./logger";

/* -------------------------------------------------------------------------- */
/* Config (validated lazily — importing this file never throws)               */
/* -------------------------------------------------------------------------- */

const envSchema = z.object({
  BUNNY_STREAM_LIBRARY_ID: z.string().trim().min(1, "is required"),
  BUNNY_STREAM_API_KEY: z.string().trim().min(1, "is required"),
});

type BunnyConfig = Readonly<{
  libraryUrl: string;
  headers: Readonly<Record<string, string>>;
}>;

let cachedConfig: BunnyConfig | undefined;

function getConfig(): BunnyConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join(".")} ${issue.message}`)
      .join("; ");

    throw new Error(`bunny.client.ts: invalid configuration — ${problems}`);
  }

  cachedConfig = {
    libraryUrl: `https://video.bunnycdn.com/library/${encodeURIComponent(
      parsed.data.BUNNY_STREAM_LIBRARY_ID,
    )}`,
    headers: {
      AccessKey: parsed.data.BUNNY_STREAM_API_KEY,
      Accept: "application/json",
    },
  };

  return cachedConfig;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Hard ceiling for one upload attempt. BullMQ owns job-level retries. */
const UPLOAD_TIMEOUT_MS = 60 * 60 * 1_000;

/** Ceiling for create / get / delete. Without it a hung call stalls the worker. */
const API_TIMEOUT_MS = 30 * 1_000;

/** Minimum gap between progress callbacks from this client. */
const PROGRESS_MIN_INTERVAL_MS = 1_000;

const FILE_READ_CHUNK_BYTES = 1024 * 1024;

/** Bunny error bodies end up in logs and DB `lastError` columns. */
const ERROR_BODY_MAX_CHARS = 500;

/* -------------------------------------------------------------------------- */
/* Schemas & types                                                            */
/* -------------------------------------------------------------------------- */

const createVideoSchema = z.object({
  guid: z.string().min(1),
  title: z.string().optional(),
});

const videoDetailsSchema = z.object({
  guid: z.string(),
  title: z.string(),
  status: z.number().int(),
  length: z.number(),
  width: z.number(),
  height: z.number(),
  storageSize: z.number(),
  availableResolutions: z.string().nullish(),
  thumbnailFileName: z.string().nullish(),
});

export type BunnyVideoDetails = z.infer<typeof videoDetailsSchema>;

type BunnyVideo = {
  guid: string;
  title: string;
};

type HttpResult = Readonly<{
  status: number;
  ok: boolean;
  body: string;
}>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function truncate(text: string): string {
  return text.length > ERROR_BODY_MAX_CHARS
    ? `${text.slice(0, ERROR_BODY_MAX_CHARS)}…`
    : text;
}

/** 4xx is the caller's fault — except 408 and 429, which are transient. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function assertOk(result: HttpResult, operation: string): void {
  if (result.ok) return;

  const body = truncate(result.body);

  throw new BunnyUploadError(
    `Bunny ${operation} failed (${result.status})${body ? `: ${body}` : ""}`,
    isRetryableStatus(result.status),
  );
}

function parseBody<T extends z.ZodType>(
  schema: T,
  text: string,
  operation: string,
): z.output<T> {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new BunnyUploadError(
      `Bunny ${operation} returned invalid JSON`,
      false,
      toError(error),
    );
  }

  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    throw new BunnyUploadError(
      `Bunny ${operation} returned an unexpected payload`,
      false,
      toError(parsed.error),
    );
  }

  return parsed.data;
}

/**
 * Single choke point for JSON API calls: auth headers, a hard timeout that
 * also covers the body read, and uniform error mapping.
 */
async function apiRequest(
  operation: string,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; json?: unknown },
): Promise<HttpResult> {
  const config = getConfig();

  const headers: Record<string, string> = { ...config.headers };
  let body: string | undefined;

  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  try {
    const response = await fetch(`${config.libraryUrl}${path}`, {
      method: init.method,
      headers,
      body,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    // Always drain the body so the connection can be reused.
    const text = await response.text();

    return { status: response.status, ok: response.ok, body: text };
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new BunnyUploadError(
        `Bunny ${operation} timed out after ${Math.round(API_TIMEOUT_MS / 1_000)}s`,
        true,
        toError(error),
      );
    }

    throw new BunnyUploadError(
      `Bunny ${operation} request failed`,
      true,
      toError(error),
    );
  }
}

/**
 * Wraps a file read stream as a Web ReadableStream so `fetch` accepts it
 * under any @types/node / lib.dom combination (no casts), while counting
 * bytes as fetch actually pulls them. Cancelling the body (abort, timeout,
 * network failure) closes the iterator, which destroys the file stream.
 */
function createUploadBody(
  source: AsyncIterable<Uint8Array>,
  onBytes: (byteLength: number) => void,
): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();

      if (done) {
        controller.close();
        return;
      }

      onBytes(value.byteLength);
      controller.enqueue(value);
    },

    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Advisory progress reporting: throttled, and a throwing callback can
 * never fail an upload. 100% is emitted once, by `complete()`.
 */
function createProgressReporter(
  callback: ((uploadedBytes: number, totalBytes: number) => void) | undefined,
  totalBytes: number,
): { add: (byteLength: number) => void; complete: () => void } {
  let uploaded = 0;
  let lastEmitAt = 0;

  const emit = (value: number): void => {
    try {
      callback?.(value, totalBytes);
    } catch (error) {
      logger.warn("Bunny upload progress callback threw", {
        error: toError(error).message,
      });
    }
  };

  return {
    add(byteLength) {
      uploaded += byteLength;

      const now = Date.now();

      if (
        !callback ||
        uploaded >= totalBytes ||
        now - lastEmitAt < PROGRESS_MIN_INTERVAL_MS
      ) {
        return;
      }

      lastEmitAt = now;
      emit(uploaded);
    },

    complete() {
      emit(totalBytes);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

export class BunnyClient {
  /**
   * Creates an empty video asset. Intentionally NOT retried here: the call
   * is not idempotent, so a lost response would leak an orphan asset.
   * Persist the returned guid before uploading and reuse it on job retries.
   */
  static async createVideo(title: string): Promise<BunnyVideo> {
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      throw new BunnyUploadError("Bunny video title must not be empty", false);
    }

    const result = await apiRequest("create", "/videos", {
      method: "POST",
      json: { title: cleanTitle },
    });

    assertOk(result, "create");

    const data = parseBody(createVideoSchema, result.body, "create");

    return { guid: data.guid, title: data.title ?? cleanTitle };
  }

  /**
   * Streams a local file to an existing asset with a single PUT.
   * Retries are owned by BullMQ (a restart re-sends from byte 0).
   */
  static async uploadVideo(
    videoId: string,
    filePath: string,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void,
  ): Promise<boolean> {
    const config = getConfig();

    let stats: fs.Stats;

    try {
      stats = await fs.promises.stat(filePath);
    } catch (error) {
      throw new BunnyUploadError(
        `Cannot read video file: ${toError(error).message}`,
        false,
        toError(error),
      );
    }

    if (!stats.isFile()) {
      throw new BunnyUploadError("Video path is not a regular file", false);
    }

    if (stats.size <= 0) {
      throw new BunnyUploadError("Cannot upload an empty video file", false);
    }

    const totalBytes = stats.size;
    const progress = createProgressReporter(onProgress, totalBytes);

    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: FILE_READ_CHUNK_BYTES,
    });

    try {
      const requestInit: RequestInit & { duplex: "half" } = {
        method: "PUT",
        headers: {
          ...config.headers,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(totalBytes),
        },
        body: createUploadBody(fileStream, progress.add),
        duplex: "half",
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      };

      const response = await fetch(
        `${config.libraryUrl}/videos/${encodeURIComponent(videoId)}`,
        requestInit,
      );

      const body = await response.text();

      assertOk({ status: response.status, ok: response.ok, body }, "upload");

      progress.complete();

      return true;
    } catch (error) {
      if (error instanceof BunnyUploadError) {
        throw error;
      }

      if (isTimeoutError(error)) {
        throw new BunnyUploadError(
          `Bunny upload timed out after ${Math.round(UPLOAD_TIMEOUT_MS / 60_000)} minutes`,
          true,
          toError(error),
        );
      }

      throw new BunnyUploadError(
        "Bunny upload request failed",
        true,
        toError(error),
      );
    } finally {
      fileStream.destroy();
    }
  }

  /**
   * Best-effort delete. Never throws.
   *
   * Returns true when the asset is gone (404 counts), false when it may
   * still exist — callers must NOT forget the asset id on false.
   */
  static async deleteVideo(videoId: string): Promise<boolean> {
    try {
      const result = await apiRequest(
        "delete",
        `/videos/${encodeURIComponent(videoId)}`,
        { method: "DELETE" },
      );

      if (result.ok || result.status === 404) return true;

      logger.warn("Bunny delete failed", {
        videoId,
        status: result.status,
        body: truncate(result.body),
      });

      return false;
    } catch (error) {
      logger.warn("Bunny delete failed", {
        videoId,
        error: toError(error).message,
      });

      return false;
    }
  }

  /**
   * Returns null ONLY when Bunny reports 404. Any other failure throws, so
   * "not found" is never confused with "Bunny is down".
   */
  static async getVideo(videoId: string): Promise<BunnyVideoDetails | null> {
    const result = await apiRequest(
      "get",
      `/videos/${encodeURIComponent(videoId)}`,
      { method: "GET" },
    );

    if (result.status === 404) return null;

    assertOk(result, "get");

    return parseBody(videoDetailsSchema, result.body, "get");
  }
}
