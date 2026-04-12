// src/modules/enrollment/enrollment.controller.ts
import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getUserEnrollmentsService,
  getOneEnrollmentService,
} from "./enrollment.service";

export const getMyEnrollments = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const enrollments = await getUserEnrollmentsService(userId);

    res.json({
      success: true,
      data: enrollments,
    });
  }
);

export const getOneEnrollment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    const enrollmentId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const enrollment = await getOneEnrollmentService(enrollmentId as string, userId);

    res.json({
      success: true,
      data: enrollment,
    });
  }
);