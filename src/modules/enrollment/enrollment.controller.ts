import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";

import {
  getUserEnrollmentsService,
  getOneEnrollmentService,
} from "./enrollment.service";

/**
 * GET /enrollments — My enrollments
 */
export const getMyEnrollments = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.userId || req.user!.id;

    const enrollments = await getUserEnrollmentsService(userId);

    res.json({
      success: true,
      data: enrollments,
    });
  },
);

/**
 * GET /enrollments/:id — Single enrollment (ownership protected)
 */
export const getOneEnrollment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.userId || req.user!.id;
    const enrollmentId = req.params.id;

    const enrollment = await getOneEnrollmentService(enrollmentId, userId);

    res.json({
      success: true,
      data: enrollment,
    });
  },
);
