import { Request, Response, NextFunction } from "express";
import { forbidden } from "../utils/errors";

export const roleGuard = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw forbidden("Not authenticated");

    if (!allowedRoles.includes(req.user.role))
      throw forbidden("Insufficient permissions");

    next();
  };
};
