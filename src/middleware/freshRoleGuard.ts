// middleware/freshRoleGuard.ts
//
// For privileged MUTATIONS (grants, refunds, role changes, moderation).
// authGuard trusts the role inside the access token until it expires, so a
// demoted, deleted or compromised admin keeps full power for the token's
// lifetime. This re-reads role + deletedAt from the database (one primary
// key lookup) before allowing the action. Keep roleGuard for read routes.

import type { NextFunction, Response } from "express";
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "../utils/errors";
import type { AuthRequest } from "./authGuard";
import { authRepository } from "@/modules/auth/auth.repo";

export const freshRoleGuard = (...allowedRoles: Role[]) => {
  const allowed = new Set<string>(allowedRoles);

  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw unauthorized("Authentication required");

      const state = await authRepository.findAuthState(req.user.id);
      if (!state || state.deletedAt) throw unauthorized("Account unavailable");
      if (!allowed.has(state.role)) throw forbidden("Insufficient permissions");

      req.user.role = state.role; // downstream sees the verified role
      next();
    } catch (err) {
      next(err);
    }
  };
};