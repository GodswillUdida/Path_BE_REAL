// enrollment.controller.ts
// Rewritten & Enhanced — February 2026
// Senior Engineer @ modern TypeScript/Express stack
// Fully aligned with enrollment.service.ts (2026 version)
// • Removed all physical/walk-in enrollment code (dead since schema update)
// • Removed dead mailQueue + commented imports
// • Consistent, production-grade error handling (propagates 403/404 from service)
// • Structured logging with context
// • Clean Zod handling (single or bulk)
// • Best-practice response shape + semantic status codes

import { NextFunction, Request, Response } from "express";
import { CreateEnrollmentSchema } from "./enrollment.schema";
import logger from "../../utils/logger";

import {
  createEnrollmentsService,
  getOneEnrollmentService,
  getUserEnrollmentsService,
} from "./enrollment.service";

export const createEnrollment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user!.userId || req.user!.id;

  try {
    const body = CreateEnrollmentSchema.parse(req.body);
    const payload = Array.isArray(body) ? body : [body];

    const data = await createEnrollmentsService(userId, payload);

    return res.status(201).json({
      success: true,
      message: `Enrollment${payload.length > 1 ? "s" : ""} created successfully`,
      data,
    });
  } catch (err: any) {
    logger.error(`Enrollment creation failed for user ${userId}`, {
      error: err.message,
      stack: err.stack,
      body: req.body,
    });

    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to create enrollment",
    });
  }
};

export const getMyEnrollments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user!.userId || req.user!.id;

  try {
    const data = await getUserEnrollmentsService(userId);

    return res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    logger.error(`Failed to fetch enrollments for user ${userId}`, err);

    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to fetch enrollments",
    });
  }
};

export const getOneEnrollment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user!.userId || req.user!.id;
  const enrollmentId = req.params.id;

  try {
    const data = await getOneEnrollmentService(enrollmentId, userId);

    return res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    logger.error(
      `Failed to fetch enrollment ${enrollmentId} for user ${userId}`,
      err,
    );

    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to fetch enrollment",
    });
  }
};
