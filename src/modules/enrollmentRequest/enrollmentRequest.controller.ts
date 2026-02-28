// import { NextFunction, Request, Response } from "express";
// import { enrollmentRequestSchema } from "./enrollmentRequest.schema";
// import {
//   createPhysicalEnrollmentRequestService,
//   getSingleEnrollmentRequestService,
//   listPhysicalEnrollmentRequestsService,
// } from "./enrollmentRequest.service";
// // import {
// //   sendPhysicalEnrollmentRequestAdminNotification,
// //   sendPhysicalEnrollmentRequestNotification,
// // } from "../../services/emailService";

// export const createPhysicalEnrollmentRequest = async (
//   req: Request,
//   res: Response
// ) => {
//   try {
//     const courseId = req.params.courseId as string;
//     const body = enrollmentRequestSchema.safeParse({
//       ...req.body,
//       courseId,
//     });

//     if (!body.success) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid request data",
//         errors: body.error.flatten().fieldErrors,
//       });
//     }

//     const request = await createPhysicalEnrollmentRequestService(courseId, {
//       name: body.data.name,
//       email: body.data.email,
//       phone: body.data.phone,
//       notes: body.data.notes,
//       courseId: body.data.courseId,
//     });

//     // try {
//     //   await sendPhysicalEnrollmentRequestNotification(body.data.email, {
//     //     name: body.data.name,
//     //     course: request.courseId,
//     //     requestId: request.id,
//     //   });
//     //   await sendPhysicalEnrollmentRequestAdminNotification({
//     //     name: body.data.name,
//     //     email: body.data.email,
//     //     phone: body.data.phone,
//     //     notes: body.data.notes || "",
//     //     course: request.courseId,
//     //     requestId: request.id,
//     //   });
//     // } catch (emailError) {
//     //   console.error(
//     //     "Error sending physical enrollment request emails:",
//     //     emailError
//     //   );
//     // }

//     return res.json({
//       success: true,
//       message: "Your request has been submitted",
//       data: request,
//     });
//   } catch (error: any) {
//     return res.status(error.status || 500).json({
//       success: false,
//       message: error.message || "Unable to submit request",
//     });
//   }
// };

// export const listPhysicalRequests = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const requests = await listPhysicalEnrollmentRequestsService();
//     return res.json({ success: true, data: requests });
//   } catch (error: any) {
//     console.error("Error: ", error.message);
//     next(error);
//   }
// };

// export const getSingleRequest = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const id = req.params.id as string;
//     const request = await getSingleEnrollmentRequestService(id);
//     return res.json({ success: true, data: request });
//   } catch (error) {
//     next(error);
//   }
// };
