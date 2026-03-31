export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status = 500,
    code?: string,
    details?: unknown
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;

    // ✅ Fix prototype chain (critical for instanceof)
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      ...(this.code ? { code: this.code } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ---

// # ✅ Helper functions (UNCHANGED API, safer internals)

export const notFound = (msg = "Not Found"): ApiError =>
  new ApiError(msg, 404, "NOT_FOUND");

export const unauthorized = (msg = "Unauthorized"): ApiError =>
  new ApiError(msg, 401, "UNAUTHORIZED");

export const forbidden = (msg = "Forbidden"): ApiError =>
  new ApiError(msg, 403, "FORBIDDEN");

export const badRequest = (msg = "Bad Request"): ApiError =>
  new ApiError(msg, 400, "BAD_REQUEST");

// ---

// # ✅ HttpError (normalized to behave like ApiError)

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;
  public readonly message: string;

  constructor(
    statusCode: number,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);

    this.name = "HttpError";
    this.message = message;
    this.statusCode = statusCode;
    this.context = context;

    // ✅ Fix prototype chain (same issue as ApiError)
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  // ─── Named constructors ─────────────────────────

  static badRequest(message: string, context?: Record<string, unknown>) {
    return new HttpError(400, message, context);
  }

  static unauthorized(message = "Unauthorized") {
    return new HttpError(401, message);
  }

  static forbidden(message = "Forbidden") {
    return new HttpError(403, message);
  }

  static notFound(message: string) {
    return new HttpError(404, message);
  }

  static conflict(message: string) {
    return new HttpError(409, message);
  }

  static unprocessable(message: string, context?: Record<string, unknown>) {
    return new HttpError(422, message, context);
  }

  static internal(message = "Internal server error") {
    return new HttpError(500, message);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      ...(this.context ? { context: this.context } : {}),
    };
  }
}