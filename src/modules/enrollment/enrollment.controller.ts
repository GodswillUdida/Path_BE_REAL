import { NextFunction, Request, Response } from "express";
import { CreateEnrollmentSchema, CreatePhysicalEnrollmentRequestSchema } from "./enrollment.schema";
// import { enrollmentService } from "./enrollment.service";
import logger from "../../utils/logger";
import {
  createEnrollmentsService,
  createPhysicalEnrollmentRequestService,
  getOneEnrollmentService,
  getUserEnrollmentsService,
  listPhysicalEnrollmentRequestsService,
} from "./enrollment.service";

export const createEnrollment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId || req.user!.id;
    const body = CreateEnrollmentSchema.parse(req.body);

    const payload = Array.isArray(body) ? body : [body];

    const data = await createEnrollmentsService(userId, payload);

    // await mailQueue.add("sendEnrollmentEmail", {
    //   to: req.user!.email,
    //   subject: "Enrollment Successful",
    //   template: "enrollment-success",
    //   data: {
    //     user: req.user,
    //     enrollment,
    //   },
    // });

    return res.json({
      success: true,
      message: "Enrollment created successfully",
      data,
    });
  } catch (err: any) {
    logger.error("Enrollment Failed to create", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to create enrollment",
    });
  }
};

export const getMyEnrollments = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user!.userId || req.user!.id;
    const data = await getUserEnrollmentsService(userId);

    return res.json({ success: true, data });

  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch enrollments" });
  }
};

export const getOne = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user!.userId || req.user!.id;
    const data = await getOneEnrollmentService(req.params.id, userId);

    return res.json({ success: true, data });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch enrollments" });
  }
};

/**
 * PHYSICAL ENROLLMENT REQUEST (PUBLIC)
 */
export const createPhysicalRequest = async (req: Request, res: Response) => {
  try {
    const body = CreatePhysicalEnrollmentRequestSchema.parse(req.body);
    const data = await createPhysicalEnrollmentRequestService(body);

    return res.json({
      success: true,
      message: "Enrollment request submitted",
      data,
    });
  } catch (err: any) {
    logger.error("Physical request failed", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to submit request",
    });
  }
};

export const listPhysicalRequests = async (req: Request, res: Response) => {
  try {
    const data = await listPhysicalEnrollmentRequestsService();
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch enrollment requests",
    });
  }
};