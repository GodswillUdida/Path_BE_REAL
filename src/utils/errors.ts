/**
 * Application HTTP errors.
 *
 * One type for the request boundary. Domain/infra errors (e.g. BunnyUploadError)
 * should be mapped to ApiError before they reach the error middleware.
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status = 500,
    code = "INTERNAL",
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** True for 5xx — useful when deciding whether to retry or alert. */
  get isOperational(): boolean {
    return this.status < 500;
  }

  toJSON() {
    return {
      success: false as const,
      message: this.message,
      code: this.code,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const badRequest = (msg = "Bad Request", details?: unknown) =>
  new ApiError(msg, 400, "BAD_REQUEST", details);

export const unauthorized = (msg = "Unauthorized") =>
  new ApiError(msg, 401, "UNAUTHORIZED");

export const forbidden = (msg = "Forbidden") =>
  new ApiError(msg, 403, "FORBIDDEN");

export const notFound = (msg = "Not Found") =>
  new ApiError(msg, 404, "NOT_FOUND");

export const conflict = (msg = "Conflict", details?: unknown) =>
  new ApiError(msg, 409, "CONFLICT", details);

export const unprocessable = (
  msg = "Unprocessable Entity",
  details?: unknown,
) => new ApiError(msg, 422, "UNPROCESSABLE", details);

export const tooManyRequests = (msg = "Too Many Requests") =>
  new ApiError(msg, 429, "RATE_LIMITED");

export const internal = (msg = "Internal server error") =>
  new ApiError(msg, 500, "INTERNAL");

export const serviceUnavailable = (
  msg = "Service temporarily unavailable",
  details?: unknown,
) => new ApiError(msg, 503, "SERVICE_UNAVAILABLE", details);

// ─── Backward-compatible alias ───────────────────────────────────────────────
// Prefer the helpers above in new code. Kept so existing call sites
// (HttpError.notFound(...)) keep compiling during migration.

export const HttpError = {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  internal,
  serviceUnavailable,
} as const;

// ─── Domain / infrastructure errors ──────────────────────────────────────────
// Not sent to clients as-is. Map at the HTTP or worker boundary.

export class BunnyUploadError extends Error {
  public readonly retryable: boolean;
  public readonly cause?: unknown;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message);
    this.name = "BunnyUploadError";
    this.retryable = retryable;
    this.cause = cause;

    Object.setPrototypeOf(this, new.target.prototype);

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Map a Bunny upload failure to an HTTP-facing ApiError. */
export function mapBunnyUploadError(err: BunnyUploadError): ApiError {
  if (err.retryable) {
    return serviceUnavailable(err.message, { retryable: true });
  }
  return badRequest(err.message);
}

// ─── Type guard ──────────────────────────────────────────────────────────────

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}