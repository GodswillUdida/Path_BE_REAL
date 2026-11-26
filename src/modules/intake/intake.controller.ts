import { Request, Response } from "express";
import {
  registerApplicantService,
  getApplicantService,
  listApplicantsService,
  updateApplicantService,
  updateApplicantStatusService,
  deleteApplicantService,
  getStatsService,
} from "./intake.service";
import {
  createApplicantSchema,
  verifyRegistrationSchema,
  resendRegistrationSchema,
  updateApplicantSchema,
  updateApplicantStatusSchema,
  listApplicantsQuerySchema,
} from "./intake.schema";
import { asyncHandler } from "@/utils/asyncHandler";
import { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "@/middleware/authGuard";
import { createSessionAndTokens } from "@/modules/auth/auth.service";
import { extractMeta, issueTokens } from "@/modules/auth/config";
import {
  resendPendingRegistration,
  verifyPendingRegistration,
} from "./pending-registration.service";

const isValidUUID = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export const createIntakeControllers = (
  prisma: PrismaClient,
  _emailQueue?: unknown,
) => ({
  registerApplicantController: asyncHandler(
    async (req: AuthRequest, res: Response) => {
      const validated = createApplicantSchema.parse(req.body);
      const sessionUserId = req.user?.id ?? req.user?.userId;

      const outcome = await registerApplicantService(prisma, validated, {
        sessionUserId,
        ipAddress: req.ip,
      });

      if (outcome.kind === "registered") {
        res.status(201).json({
          success: true,
          message: "Applicant registered successfully",
          data: outcome.applicant,
        });
        return;
      }

      // Anonymous: nothing exists yet except the pending challenge.
      res.status(202).json({
        success: true,
        message: "Check your email for a verification code to finish your application.",
        data: {
          verificationRequired: true,
          pendingId: outcome.pending.pendingId,
          codeExpiresAt: outcome.pending.codeExpiresAt,
          resendAvailableAt: outcome.pending.resendAvailableAt,
        },
      });
    },
  ),

  verifyRegistrationController: asyncHandler(async (req: Request, res: Response) => {
    const input = verifyRegistrationSchema.parse(req.body);
    const { user } = await verifyPendingRegistration(prisma, input);
    const result = await createSessionAndTokens(user, extractMeta(req), "credentials");
    issueTokens(res, result, 201);
  }),

  resendRegistrationController: asyncHandler(async (req: Request, res: Response) => {
    const { pendingId } = resendRegistrationSchema.parse(req.body);
    const sent = await resendPendingRegistration(prisma, pendingId);
    // Same body whether or not the id exists (no oracle on pending ids).
    res.status(200).json({
      success: true,
      message: "If the verification is still open, a new code has been sent.",
      data: sent ? { resendAvailableAt: sent.resendAvailableAt, codeExpiresAt: sent.codeExpiresAt } : null,
    });
  }),

  listApplicantsController: asyncHandler(async (req: Request, res: Response) => {
    const validated = listApplicantsQuerySchema.parse(req.query);
    const result = await listApplicantsService(prisma, validated);
    res.status(200).json({
      success: true,
      data: result.data,
      meta: { pagination: result.pagination },
    });
  }),

  getApplicantController: asyncHandler(async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: "Invalid applicant ID format" });
      return;
    }
    const applicant = await getApplicantService(prisma, req.params.id as string);
    res.status(200).json({ success: true, data: applicant });
  }),

  updateApplicantController: asyncHandler(async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: "Invalid applicant ID format" });
      return;
    }
    const validated = updateApplicantSchema.parse(req.body);
    const updated = await updateApplicantService(prisma, req.params.id as string, validated);
    res.status(200).json({
      success: true,
      message: "Applicant updated successfully",
      data: updated,
    });
  }),

  updateApplicantStatusController: asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: "Invalid applicant ID format" });
      return;
    }
    const validated = updateApplicantStatusSchema.parse(req.body);
    const adminId = req.user?.id ?? req.user?.userId;
    if (!adminId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const updated = await updateApplicantStatusService(
      prisma,
      req.params.id as string,
      validated.status,
      adminId,
    );
    res.status(200).json({
      success: true,
      message: "Applicant status updated successfully",
      data: updated,
    });
  }),

  deleteApplicantController: asyncHandler(async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: "Invalid applicant ID format" });
      return;
    }
    await deleteApplicantService(prisma, req.params.id as string);
    res.status(200).json({ success: true, message: "Applicant deleted successfully" });
  }),

  getStatsController: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await getStatsService(prisma);
    res.status(200).json({ success: true, data: stats });
  }),
});
