"use strict";
// enrollment.service.ts
// Rewritten & Enhanced — February 2026
// Senior Engineer @ xAI-inspired stack
// Alignments with Prisma schema:
//   • Removed all program/programId references (commented out in schema)
//   • progress → progressRecords
//   • orderItemId (required + @unique) + order relation
//   • expiresAt always set (1-year default; easily extensible via pricing.duration later)
//   • Full relation coverage in includes
//   • Atomic multi-create + best-effort progress init + notifications
//   • Cleaned duplicate checks, modern error messaging, better ordering
//   • Production-grade comments, best-effort side effects, no dead/commented code
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnrollmentsService = createEnrollmentsService;
exports.getUserEnrollmentsService = getUserEnrollmentsService;
exports.getOneEnrollmentService = getOneEnrollmentService;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const emailService_1 = require("../../services/emailService");
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
    progressRecords: true, // aligned with schema
    certificate: true,
    payments: true,
    orderItem: true,
    order: true, // added for completeness (orderId relation)
};
/**
 * Create one or more enrollments (bulk from cart/checkout).
 * - Full pre-validation (no partial success)
 * - Unique constraint enforcement ([userId, courseId, pricingId])
 * - Atomic transaction
 * - Auto-initialize first-topic progress (best-effort)
 * - Best-effort confirmation + admin notifications
 */
async function createEnrollmentsService(userId, data) {
    if (!data?.length) {
        throw (0, errors_1.forbidden)("No courses provided");
    }
    // Pre-validation + collect valid items (no N+1 in transaction)
    const toCreate = [];
    for (const item of data) {
        const { courseId, pricingId, orderItemId } = item;
        if (!orderItemId) {
            throw (0, errors_1.forbidden)(`orderItemId is required for course ${courseId}`);
        }
        const course = await prisma_1.default.course.findUnique({
            where: { id: courseId },
            include: {
                pricings: true,
                // modules only needed later for progress — kept minimal here
            },
        });
        if (!course)
            throw (0, errors_1.notFound)(`Course ${courseId} not found`);
        const validPricing = course.pricings.some((p) => p.id === pricingId);
        if (!validPricing) {
            throw (0, errors_1.forbidden)(`Invalid pricing tier for course "${course.title}"`);
        }
        // Enforce unique enrollment (schema @@unique)
        const existing = await prisma_1.default.enrollment.findFirst({
            where: { userId, courseId, pricingId },
        });
        if (existing) {
            throw (0, errors_1.forbidden)(`You are already enrolled in "${course.title}" with this pricing tier`);
        }
        toCreate.push({ courseId, pricingId, orderItemId });
    }
    // Atomic creation
    const created = await prisma_1.default.$transaction(toCreate.map((d) => prisma_1.default.enrollment.create({
        data: {
            userId,
            courseId: d.courseId,
            pricingId: d.pricingId,
            orderItemId: d.orderItemId,
            paymentStatus: "PENDING",
            startedAt: new Date(), // explicit for clarity
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
    })));
    // Best-effort first-topic progress initialization
    await Promise.all(created.map(async (enrollment) => {
        try {
            const courseWithModules = await prisma_1.default.course.findUnique({
                where: { id: enrollment.courseId },
                include: {
                    modules: {
                        orderBy: { position: "asc" }, // prefer position if column exists; fallback createdAt
                        take: 1,
                        include: {
                            topics: { orderBy: { position: "asc" }, take: 1 },
                        },
                    },
                },
            });
            const firstTopic = courseWithModules?.modules[0]?.topics[0];
            if (firstTopic) {
                await prisma_1.default.progress.create({
                    data: {
                        enrollmentId: enrollment.id,
                        topicId: firstTopic.id,
                    },
                });
            }
        }
        catch (err) {
            // Non-blocking — progress is optional UX enhancement
            console.warn(`Progress seed failed for enrollment ${enrollment.id}:`, err);
        }
    }));
    // Enrich with all relations
    const enriched = await prisma_1.default.enrollment.findMany({
        where: { id: { in: created.map((e) => e.id) } },
        include: enrollmentIncludes,
    });
    // Best-effort notifications (fire after success)
    try {
        await Promise.all(enriched.map((enrollment) => Promise.all([
            (0, emailService_1.sendConfirmationEmail)(enrollment.user.email, {
                name: enrollment.user.name ?? "Student",
                course: enrollment.course.title,
                pricing: enrollment.pricing.price,
            }),
            (0, emailService_1.sendAdminNotification)({
                name: enrollment.user.name ?? "Student",
                email: enrollment.user.email,
                course: enrollment.course.title,
            }),
        ])));
    }
    catch (err) {
        console.error("Enrollment notification failed (non-blocking):", err);
    }
    return enriched;
}
/**
 * Get all active/completed enrollments for a user (most recent first)
 */
async function getUserEnrollmentsService(userId) {
    return prisma_1.default.enrollment.findMany({
        where: { userId },
        include: enrollmentIncludes,
        orderBy: { startedAt: "desc" }, // more semantic than id
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
