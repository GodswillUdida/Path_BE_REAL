import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";
import logger from "../utils/logger";
import {
  ApiError,
  BunnyUploadError,
  badRequest,
  conflict,
  internal,
  isApiError,
  mapBunnyUploadError,
  notFound,
  serviceUnavailable,
} from "../utils/errors";

const PRISMA_MAP: Record<
  string,
  (err: Prisma.PrismaClientKnownRequestError) => ApiError
> = {
  P2002: (err) =>
    conflict("A record with this value already exists", {
      target: err.meta?.target,
    }),
  P2025: () => notFound("Record not found"),
  P2003: () =>
    conflict("This action conflicts with related records"),
};

function toApiError(err: unknown): ApiError {
  if (isApiError(err)) return err;

  if (err instanceof BunnyUploadError) {
    return mapBunnyUploadError(err);
  }

  if (err instanceof ZodError) {
    return badRequest("Validation failed", err.flatten());
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return badRequest("Uploaded file exceeds the maximum allowed size", {
        code: err.code,
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return badRequest(`Unexpected file field: ${err.field}`, {
        code: err.code,
        field: err.field,
      });
    }
    return badRequest(err.message, { code: err.code });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const map = PRISMA_MAP[err.code];
    if (map) return map(err);
    // Unknown Prisma codes stay internal — don't leak query details.
    return internal();
  }

  if (
    err instanceof SyntaxError &&
    "body" in err &&
    typeof err.message === "string" &&
    err.message.includes("JSON")
  ) {
    return badRequest("Invalid JSON payload");
  }

  // Anything else: hide message in production via internal().
  return internal();
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const isProduction = process.env.NODE_ENV === "production";
  const apiErr = toApiError(err);

  // Soft-auth probe — clients often hit /auth/me while logged out.
  const isExpectedUnauthCheck =
    apiErr.status === 401 &&
    /\/auth\/me\/?$/.test(req.path ?? req.originalUrl ?? "");

  if (!isExpectedUnauthCheck) {
    const level = apiErr.status >= 500 ? "error" : "warn";
    logger[level](`${apiErr.message} - ${req.method} ${req.url}`, {
      status: apiErr.status,
      code: apiErr.code,
      method: req.method,
      url: req.url,
      ip: req.ip,
      // Real stack only outside production, and only for unexpected errors.
      ...(!isProduction &&
        !isApiError(err) &&
        err instanceof Error && { stack: err.stack }),
    });
  }

  res.status(apiErr.status).json({
    ...apiErr.toJSON(),
    // Never expose stacks in production.
    ...(!isProduction &&
      err instanceof Error &&
      apiErr.status >= 500 && { stack: err.stack }),
  });
};