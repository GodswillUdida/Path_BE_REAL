"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOneEnrollment = exports.getMyEnrollments = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const enrollment_service_1 = require("./enrollment.service");
/**
 * GET /enrollments — My enrollments
 */
exports.getMyEnrollments = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const enrollments = await (0, enrollment_service_1.getUserEnrollmentsService)(userId);
    res.json({
        success: true,
        data: enrollments,
    });
});
/**
 * GET /enrollments/:id — Single enrollment (ownership protected)
 */
exports.getOneEnrollment = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const enrollmentId = req.params.id;
    const enrollment = await (0, enrollment_service_1.getOneEnrollmentService)(enrollmentId, userId);
    res.json({
        success: true,
        data: enrollment,
    });
});
