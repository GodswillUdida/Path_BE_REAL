// middleware/roleGuard.ts

import type { NextFunction, Response } from "express";
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "../utils/errors";
import type { AuthRequest } from "./authGuard";

// Single source of truth for roles: the Prisma enum. The hand-written
// union this replaces would silently drift the next time Role changes.
// Re-exported so existing `import { Role } from "./roleGuard"` keeps working.
export type { Role };

export const roleGuard = (...allowedRoles: Role[]) => {
  const allowed = new Set<string>(allowedRoles);

  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    // Missing identity is 401, not 403: clients use the difference to
    // decide between "re-authenticate" and "you may not do this".
    if (!req.user) throw unauthorized("Authentication required");
    if (!allowed.has(req.user.role)) throw forbidden("Insufficient permissions");
    next();
  };
};