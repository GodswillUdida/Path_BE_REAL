import { Request, Response } from "express";
import { enrollmentRequestSchema } from "./enrollmentRequest.schema";
import { createPhysicalEnrollmentRequestService, listPhysicalEnrollmentRequestsService } from "./enrollmentRequest.service";

export const createPhysicalEnrollmentRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const body = enrollmentRequestSchema.parse(req.body);
    const request = await createPhysicalEnrollmentRequestService(body);

    return res.json({
      success: true,
      message: "Your request has been submitted",
      data: request,
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Unable to submit request",
    });
  }
};

export const listPhysicalRequests = async (req: Request, res: Response) => {
  try {
        const requests = await listPhysicalEnrollmentRequestsService();

        return res.json({ success: true, data: requests });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Unable to fetch enrollment requests",
        });
    }
};