import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getUserEnrollmentsService, getOneEnrollmentService } from "./enrollment.service";
import { ListEnrollmentsQuerySchema, EnrollmentIdParamSchema, GrantEnrollmentSchema, IdempotencyKeyHeaderSchema } from "./enrollment.schema";
import { requireActor } from "@/utils/requireActor";
import { grantEnrollmentService } from "./enrollment.grant.service";

// Zod failures must be mapped to the 400 error envelope by the central
// error middleware (ZodError -> { success:false, code:"VALIDATION_ERROR",
// details }). Controllers never hand-shape error responses.

export const getMyEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const { limit, offset } = ListEnrollmentsQuerySchema.parse(req.query);

  const result = await getUserEnrollmentsService(userId, limit, offset);

  res.json({ success: true, ...result });
});

export const getOneEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = requireActor(req);
  const { id } = EnrollmentIdParamSchema.parse(req.params);

  const enrollment = await getOneEnrollmentService(id, userId);

  res.json({ success: true, data: enrollment });
});

// export const grantEnrollment = asyncHandler(async (req: Request, res: Response) => {
//   const actor = requireActor(req);
//   const key = IdempotencyKeyHeaderSchema.parse(req.header("idempotency-key"));
//   const input = GrantEnrollmentSchema.parse(req.body);
 
//   const result = await grantEnrollmentService(actor, input, key["idempotency-key"]);
 
//   res.status(result.isNew ? 201 : 200).json({ success: true, data: result });
// });
 