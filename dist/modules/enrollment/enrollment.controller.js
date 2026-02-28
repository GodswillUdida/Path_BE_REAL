"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOneEnrollment = exports.getMyEnrollments = exports.createEnrollment = void 0;
const enrollment_schema_1 = require("./enrollment.schema");
const logger_1 = __importDefault(require("../../utils/logger"));
const enrollment_service_1 = require("./enrollment.service");
const createEnrollment = async (req, res, next) => {
    const userId = req.user.userId || req.user.id;
    try {
        const body = enrollment_schema_1.CreateEnrollmentSchema.parse(req.body);
        const payload = Array.isArray(body) ? body : [body];
        const data = await (0, enrollment_service_1.createEnrollmentsService)(userId, payload);
        return res.status(201).json({
            success: true,
            message: `Enrollment${payload.length > 1 ? "s" : ""} created successfully`,
            data,
        });
    }
    catch (err) {
        logger_1.default.error(`Enrollment creation failed for user ${userId}`, {
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
exports.createEnrollment = createEnrollment;
const getMyEnrollments = async (req, res, next) => {
    const userId = req.user.userId || req.user.id;
    try {
        const data = await (0, enrollment_service_1.getUserEnrollmentsService)(userId);
        return res.json({
            success: true,
            data,
        });
    }
    catch (err) {
        logger_1.default.error(`Failed to fetch enrollments for user ${userId}`, err);
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to fetch enrollments",
        });
    }
};
exports.getMyEnrollments = getMyEnrollments;
const getOneEnrollment = async (req, res, next) => {
    const userId = req.user.userId || req.user.id;
    const enrollmentId = req.params.id;
    try {
        const data = await (0, enrollment_service_1.getOneEnrollmentService)(enrollmentId, userId);
        return res.json({
            success: true,
            data,
        });
    }
    catch (err) {
        logger_1.default.error(`Failed to fetch enrollment ${enrollmentId} for user ${userId}`, err);
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to fetch enrollment",
        });
    }
};
exports.getOneEnrollment = getOneEnrollment;
