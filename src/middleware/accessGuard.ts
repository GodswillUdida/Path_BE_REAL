import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { unauthorized } from "../utils/errors";
// import { AuthRequest } from "./authGuard";

export function accessGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing access token");
  }

  try {
    const token = header.split(" ")[1];
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.userId,
      role: payload.role!,
    };

    next();
  } catch (err) {
    throw unauthorized("Invalid or expired access token");
  }
}