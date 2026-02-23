import { Request, Response, NextFunction } from "express";
import { forbidden } from "../utils/errors";
import { AuthRequest } from "./authGuard";

export type Role = "student" | "instructor" | "admin" | "superadmin";

export const roleGuard = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) throw forbidden("Not authenticated");

    if (!allowedRoles.includes(req.user.role as Role))
      throw forbidden("Insufficient permissions");

    next();
  };
};
