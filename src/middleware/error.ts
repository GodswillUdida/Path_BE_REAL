import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.error(`${err.message} - ${req.method} ${req.url}`);
    return res.status(err.statusCode).json({ error: err.message });
  }
  logger.error(`Unexpected error: ${err.message} - ${req.method} ${req.url}`);
  res.status(500).json({ error: "Internal server error" });
};
