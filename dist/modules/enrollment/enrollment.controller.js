"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOne = exports.getMyEnrollments = exports.createEnrollment = void 0;
const enrollment_schema_1 = require("./enrollment.schema");
// import { enrollmentService } from "./enrollment.service";
const logger_1 = __importDefault(require("../../utils/logger"));
const enrollment_service_1 = require("./enrollment.service");
const createEnrollment = async (req, res, next) => {
    try {
        const userId = req.user.userId || req.user.id;
        const body = enrollment_schema_1.CreateEnrollmentSchema.parse(req.body);
        const payload = Array.isArray(body) ? body : [body];
        const data = await (0, enrollment_service_1.createEnrollmentsService)(userId, payload);
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
    }
    catch (err) {
        logger_1.default.error("Enrollment Failed to create", err);
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || "Failed to create enrollment",
        });
    }
};
exports.createEnrollment = createEnrollment;
const getMyEnrollments = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const data = await (0, enrollment_service_1.getUserEnrollmentsService)(userId);
        return res.json({ success: true, data });
    }
    catch (err) {
        return res
            .status(500)
            .json({ success: false, message: "Failed to fetch enrollments" });
    }
};
exports.getMyEnrollments = getMyEnrollments;
const getOne = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const data = await (0, enrollment_service_1.getOneEnrollmentService)(req.params.id, userId);
        return res.json({ success: true, data });
    }
    catch (error) {
        return res
            .status(500)
            .json({ success: false, message: "Failed to fetch enrollments" });
    }
};
exports.getOne = getOne;
/**
 * PHYSICAL ENROLLMENT REQUEST (PUBLIC)
 */
// export const createPhysicalRequest = async (req: Request, res: Response) => {
//   try {
//     const body = CreatePhysicalEnrollmentRequestSchema.parse(req.body);
//     const data = await createPhysicalEnrollmentRequestService(body);
//     return res.json({
//       success: true,
//       message: "Enrollment request submitted",
//       data,
//     });
//   } catch (err: any) {
//     logger.error("Physical request failed", err);
//     return res.status(err.status || 500).json({
//       success: false,
//       message: err.message || "Failed to submit request",
//     });
//   }
// };
// export const listPhysicalRequests = async (req: Request, res: Response) => {
//   try {
//     const data = await listPhysicalEnrollmentRequestsService();
//     return res.json({ success: true, data });
//   } catch {
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch enrollment requests",
//     });
//   }
// };
