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
