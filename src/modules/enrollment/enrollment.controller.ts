import { NextFunction, Request, Response } from "express";
import { CreateEnrollmentSchema } from "./enrollment.schema";
// import { enrollmentService } from "./enrollment.service";
import logger from "../../utils/logger";
import {
  createEnrollmentsService,
  getOneEnrollmentService,
  getUserEnrollmentsService,
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

    const enrollment = await createEnrollmentsService(userId, payload);

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
      data: enrollment,
    });
  } catch (err: any) {
    logger.error("Enrollment Failed to create ...", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to create enrollment",
    });
    // next(error);
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
    logger.error("Fetching enrollments failed", err);
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
