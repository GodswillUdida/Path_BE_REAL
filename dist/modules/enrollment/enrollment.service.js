"use strict";
// enrollment.service.ts
// Production-ready — March 2026
// Only query logic remains. Creation now happens atomically in payment webhook
// (fulfillOrderAfterPayment) to guarantee Order = intent → Payment = money → Enrollment = access.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserEnrollmentsService = getUserEnrollmentsService;
exports.getOneEnrollmentService = getOneEnrollmentService;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const enrollmentIncludes = {
    user: true,
    course: {
        include: {
            pricings: true,
            modules: {
                include: { topics: true },
            },
        },
    },
    pricing: true,
    progressRecords: true,
    certificate: true,
    payments: true,
    orderItem: true,
    order: true,
};
/**
 * Get all active/completed enrollments for a user (most recent first)
 */
async function getUserEnrollmentsService(userId) {
    return prisma_1.default.enrollment.findMany({
        where: { userId },
        include: enrollmentIncludes,
        orderBy: { startedAt: "desc" },
    });
}
/**
 * Get single enrollment with strict ownership check
 */
async function getOneEnrollmentService(id, userId) {
    const enrollment = await prisma_1.default.enrollment.findUnique({
        where: { id },
        include: enrollmentIncludes,
    });
    if (!enrollment)
        throw (0, errors_1.notFound)("Enrollment not found");
    if (enrollment.userId !== userId) {
        throw (0, errors_1.forbidden)("Access denied — this enrollment belongs to another user");
    }
    return enrollment;
}
