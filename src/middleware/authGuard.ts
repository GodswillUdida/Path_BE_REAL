import { Request, Response, NextFunction } from "express";
import { unauthorized } from "../utils/errors";
import { verifyAccessToken } from "../lib/jwt";
import logger from "../utils/logger";

// Extend Express Request type for TS
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export function authGuard(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    throw unauthorized("Missing or invalid Authorization header");

  const token = header.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.userId,
      role: payload.role!,
    };
    next();
  } catch (error) {
    logger.error("Invalid or expired access token", error);
    throw unauthorized("Invalid or expired access token");
  }
}
