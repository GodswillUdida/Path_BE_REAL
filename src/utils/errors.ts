export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, status = 500, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFound = (msg = "Not Found"): ApiError =>
  new ApiError(msg, 404, "NOT_FOUND");
export const unauthorized = (msg = "Unauthorized"): ApiError =>
  new ApiError(msg, 401, "UNAUTHORIZED");
export const forbidden = (msg = "Forbidden"): ApiError =>
  new ApiError(msg, 403, "FORBIDDEN");
export const badRequest = (msg = "Bad Request"): ApiError =>
  new ApiError(msg, 400, "BAD_REQUEST");

/**
 * A typed, serializable HTTP error.
 *
 * Throw this anywhere in the service/repository layer.
 * The global error handler catches it and converts it into the
 * correct HTTP response shape.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
    // Maintains proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  // ─── Named constructors ────────────────────────────────────────────────────

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
      statusCode: this.statusCode,
      message: this.message,
      ...(this.context ? { context: this.context } : {}),
    };
  }
}
