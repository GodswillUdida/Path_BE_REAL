import { Request, Response, NextFunction } from 'express';

import {
  registerApplicantService,
  getApplicantService,
  listApplicantsService,
  updateApplicantService,
  updateApplicantStatusService,
  deleteApplicantService,
  getStatsService,
} from './intake.service';

import {
  createApplicantSchema,
  updateApplicantSchema,
  updateApplicantStatusSchema,
  listApplicantsQuerySchema,
} from './intake.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { PrismaClient } from '@prisma/client';

// import { Queue } from 'bullmq';

const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * Factory function to create all intake controllers
 * Now uses PrismaClient directly instead of repository class
 */
export const createIntakeControllers = (prisma: PrismaClient, emailQueue?: any) => ({
  registerApplicantController: asyncHandler(async (req: Request, res: Response) => {
    const validated = createApplicantSchema.parse(req.body);

    const applicant = await registerApplicantService(prisma, validated);
    // emailQueue is available if needed in future

    res.status(201).json({
      success: true,
      message: 'Applicant registered successfully',
      data: applicant,
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
      res.status(400).json({ success: false, message: 'Invalid applicant ID format' });
      return;
    }

    const applicant = await getApplicantService(prisma, req.params.id as string);

    res.status(200).json({ success: true, data: applicant });
  }),

  updateApplicantController: asyncHandler(async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: 'Invalid applicant ID format' });
      return;
    }

    const validated = updateApplicantSchema.parse(req.body);
    const updated = await updateApplicantService(prisma, req.params.id as string, validated);

    res.status(200).json({
      success: true,
      message: 'Applicant updated successfully',
      data: updated,
    });
  }),

  updateApplicantStatusController: asyncHandler(async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: 'Invalid applicant ID format' });
      return;
    }

    const validated = updateApplicantStatusSchema.parse(req.body);

    const adminId = (req as any).user?.id;
    if (!adminId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const updated = await updateApplicantStatusService(
      prisma,
      req.params.id as string,
      validated.status,
      adminId
    );

    res.status(200).json({
      success: true,
      message: 'Applicant status updated successfully',
      data: updated,
    });
  }),

  deleteApplicantController: asyncHandler(async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.id as string)) {
      res.status(400).json({ success: false, message: 'Invalid applicant ID format' });
      return;
    }

    await deleteApplicantService(prisma, req.params.id as string);

    res.status(200).json({
      success: true,
      message: 'Applicant deleted successfully',
    });
  }),

  getStatsController: asyncHandler(async (req: Request, res: Response) => {
    const stats = await getStatsService(prisma);

    res.status(200).json({ success: true, data: stats });
  }),
});