import type { Request } from "express";
import { unauthorized } from "./errors";

/**
 * Shared replacement for the per-controller copies of requireActor.
 * Move it to src/utils/requireActor.ts and delete the local copies in
 * order.controller.ts, payment.controller.ts and enrollment.controller.ts.
 */
export function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}