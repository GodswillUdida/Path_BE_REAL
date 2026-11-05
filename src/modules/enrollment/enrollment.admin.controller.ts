import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireActor } from "../../utils/requireActor";
import { grantEnrollmentService } from "./enrollment.grant.service";
import { GrantEnrollmentSchema, IdempotencyKeyHeaderSchema } from "./enrollment.schema";

export const grantEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const key = IdempotencyKeyHeaderSchema.parse(req.header("idempotency-key"));
  const input = GrantEnrollmentSchema.parse(req.body);

  const result = await grantEnrollmentService(actor, input, key);

  res.status(result.isNew ? 201 : 200).json({ success: true, data: result });
});
