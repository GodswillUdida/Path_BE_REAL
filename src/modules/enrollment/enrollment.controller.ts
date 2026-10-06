import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { getUserEnrollmentsService, getOneEnrollmentService } from "./enrollment.service";

// FIXED: previously `req.user?.id || req.user?.userId` with a manual
// hand-rolled 401 response — same ad hoc auth-guessing pattern already
// fixed in order.controller.ts and payment.controller.ts. Normalized to
// the same requireActor helper used everywhere else, which also ensures
// this goes through the centralized error envelope (message/code/details)
// rather than a hand-shaped response that happened to look similar.
function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}

export const getMyEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const result = await getUserEnrollmentsService(userId, limit, offset);

  res.json({ success: true, ...result });
});

export const getOneEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const enrollmentId = req.params.id as string;

  const enrollment = await getOneEnrollmentService(enrollmentId, userId);

  res.json({ success: true, data: enrollment });
});