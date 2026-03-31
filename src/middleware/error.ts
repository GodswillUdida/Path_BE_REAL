import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { ApiError } from "../utils/errors";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const isProduction = process.env.NODE_ENV === "production";

  let status = 500;
  let message = "Internal server error";
  let payload = {} as Record<string, any>;

  // ✅ Handle ApiError (PRIMARY)
  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;

    if (err.code) payload.code = err.code;
    if (err.details && typeof err.details === "object") payload.details = err.details;
  }

  // ✅ JSON parse error
  else if (
    err instanceof SyntaxError &&
    "body" in err &&
    err.message.includes("JSON")
  ) {
    status = 400;
    message = "Invalid JSON payload";
  }

  // ✅ Generic Error
  else if (err instanceof Error) {
    message = isProduction ? "Internal server error" : err.message;
  }

  // ✅ Logging (structured)
  logger[status >= 500 ? "error" : "warn"](
    `${message} - ${req.method} ${req.url}`,
    {
      status,
      method: req.method,
      url: req.url,
      ip: req.ip,
      stack: isProduction ? undefined : err instanceof Error ? err.stack : undefined,
    }
  );

  // ✅ Response (consistent with frontend expectations)
  res.status(status).json({
    success: false,
    message,
    ...payload,
    ...(!isProduction && {
      stack: err instanceof Error ? err.stack : undefined,
    }),
  });
};