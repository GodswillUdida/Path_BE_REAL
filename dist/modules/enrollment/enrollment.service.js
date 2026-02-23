"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnrollmentsService = createEnrollmentsService;
exports.getUserEnrollmentsService = getUserEnrollmentsService;
exports.getOneEnrollmentService = getOneEnrollmentService;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const enrollmentIncludes = {
    course: {
        include: { pricings: true, modules: { include: { topics: true } } },
    },
    pricing: true,
    program: true,
    progress: true,
    certificate: true,
    payments: true,
    user: true, // Added user relation
};
/**
 * Create a new enrollment with:
 * - strict validation
 * - pricing + program ownership checks
 * - unique enrollment enforcement
 * - automatic first-topic progress initialization
 */
// export async function createEnrollmentService(
//   userId: string,
//   data: CreateEnrollmentDTO[]
// ) {
//   const { programId, courseId, pricingId } = data;
//   // Fetch course with pricing + program relations
//   const course = await prisma.course.findUnique({
//     where: { id: courseId },
//     include: { pricings: true, program: true },
//   });
//   if (!course) throw notFound("Course not found");
//   // Validate pricing belongs to course
//   const validPricing = course.pricings.find((p) => p.id === pricingId);
//   if (!validPricing) throw forbidden("Invalid pricing for this course");
//   // Validate program ownership if applicable
//   if (programId && course.programId !== programId) {
//     throw forbidden("Course does not belong to this program");
//   }
//   // Prevent duplicate enrollment in same tier
//   const existing = await prisma.enrollment.findFirst({
//     where: {
//       userId,
//       courseId,
//       pricingId,
//       programId: programId ?? null,
//     },
//   });
//   if (existing) throw forbidden("You are already enrolled in this tier");
//   // Create enrollment
//   const enrollment = await prisma.enrollment.create({
//     data: {
//       userId,
//       courseId,
//       pricingId,
//       programId: programId ?? null,
//       orderId: orderId ?? null,
//       paymentStatus: "PENDING",
//     },
//     include: enrollmentIncludes,
//   });
//   // Auto-seed progress: first module → first topic
//   try {
//     const firstModule = await prisma.module.findFirst({
//       where: { courseId },
//       orderBy: { position: "asc" },
//       include: {
//         topics: { orderBy: { position: "asc" }, take: 1 },
//       },
//     });
//     // const firstTopic = firstModule?.topics?.[0];
//     if (firstModule?.topics?.length) {
//       await prisma.progress.create({
//         data: {
//           enrollmentId: enrollment.id,
//           topicId: firstModule.topics[0].id,
//         },
//       });
//     }
//   } catch (err) {
//     console.error("Progress initialization failed:", err);
//     // Not blocking enrollment — progress is optional
//   }
//   try {
//     await Promise.all([
//       sendConfirmationEmail(enrollment.user.email, {
//         name: enrollment.user.name,
//         course: enrollment.course.title,
//         pricing: enrollment.pricing.price,
//       }),
//       sendAdminNotification({
//         name: enrollment.user.name,
//         email: enrollment.user.email,
//         course: enrollment.course.title,
//       }),
//     ]);
//   } catch (err) {
//     console.error("Enrollment email failed:", err);
//   }
//   return enrollment;
// }
// export async function createEnrollmentsService(
//   userId: string,
//   data: CreateEnrollmentDTO[]
// ) {
//   if (!data || data.length === 0) throw forbidden("No courses selected");
//   const toCreate: {
//     courseId: string;
//     pricingId: string;
//     programId?: string;
//   }[] = [];
//   // const enrollmentsToCreate = [];
//   for (const item of data) {
//     const { courseId, pricingId, programId } = item;
//     const course = await prisma.course.findUnique({
//       where: { id: courseId },
//       include: {
//         pricings: true,
//         program: true,
//         modules: { include: { topics: true } },
//       },
//     });
//     if (!course) throw notFound(`Course ${courseId} not found`);
//     const validPricing = course.pricings.find((p) => p.id === pricingId);
//     if (!validPricing)
//       throw forbidden(`Invalid pricing for course ${course.title}`);
//     if (programId && course.programId !== programId)
//       throw forbidden(`Course ${course.title} does not belong to this program`);
//     const exists = await prisma.enrollment.findFirst({
//       where: { userId, courseId, pricingId, programId: programId ?? null },
//     });
//     if (exists) throw forbidden(`Already enrolled in ${course.title}`);
//     toCreate.push({ courseId, pricingId, programId });
//   }
//   // Create all enrollments in transaction
//   const enrollments = await prisma.$transaction(
//     toCreate.map(({ courseId, pricingId, programId }) =>
//       prisma.enrollment.create({
//         data: {
//           userId,
//           courseId,
//           pricingId,
//           programId,
//           paymentStatus: "PENDING",
//         },
//       })
//     )
//   );
//   // Auto-create first topic progress for each enrollment
//   await Promise.all(toCreate.map(async (t, idx) => {
//     try {
//     } catch (error) {
//     }
//   })
//   }
// Send emails
// for (const enrollment of enrollments) {
//   await sendConfirmationEmail(enrollment.courseId, {
//     userId,
//     enrollmentId: enrollment.id,
//   });
//   await sendAdminNotification({ userId, enrollmentId: enrollment.id });
// }
//   return enrollments;
// }
async function createEnrollmentsService(userId, data) {
    if (!data || data.length === 0)
        throw (0, errors_1.forbidden)("No courses provided");
    // Validate in-memory first (avoid partial creation)
    const toCreate = [];
    for (const item of data) {
        const { courseId, pricingId, programId, orderId } = item;
        const course = await prisma_1.default.course.findUnique({
            where: { id: courseId },
            include: {
                pricings: true,
                program: true,
                modules: { include: { topics: true } },
            },
        });
        if (!course)
            throw (0, errors_1.notFound)(`Course ${courseId} not found`);
        const validPricing = course.pricings.some((p) => p.id === pricingId);
        if (!validPricing)
            throw (0, errors_1.forbidden)(`Invalid pricing for course ${course.title}`);
        if (programId && course.programId !== programId)
            throw (0, errors_1.forbidden)(`Course ${course.title} does not belong to program`);
        const existing = await prisma_1.default.enrollment.findFirst({
            where: { userId, courseId, pricingId },
        });
        if (existing)
            throw (0, errors_1.forbidden)(`Already enrolled in ${course.title}`);
        const exists = await prisma_1.default.enrollment.findFirst({
            where: {
                userId,
                courseId,
                pricingId,
                // programId: programId ?? null,
            },
        });
        if (exists)
            throw (0, errors_1.forbidden)("Already enrolled in this course tier");
        toCreate.push({ courseId, pricingId, programId, orderId });
    }
    // create all enrollments in a single transaction
    const created = await prisma_1.default.$transaction(toCreate.map((d) => prisma_1.default.enrollment.create({
        data: {
            userId,
            courseId: d.courseId,
            pricingId: d.pricingId,
            // programId: d.programId ?? null,
            paymentStatus: "PENDING",
            orderItemId: d.orderId ?? null,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        },
    })));
    // initialize first topic progress per enrollment (best-effort)
    await Promise.all(created.map(async (enrollment) => {
        try {
            const course = await prisma_1.default.course.findUnique({
                where: { id: enrollment.courseId },
                include: {
                    modules: {
                        orderBy: { createdAt: "asc" },
                        include: { topics: { orderBy: { createdAt: "asc" } } },
                    },
                },
            });
            const firstModule = course?.modules?.[0];
            const firstTopic = firstModule?.topics?.[0];
            if (firstTopic) {
                await prisma_1.default.progress.create({
                    data: { enrollmentId: enrollment.id, topicId: firstTopic.id },
                });
            }
        }
        catch {
            // swallow — progress init must not block
        }
    }));
    // Return enriched records
    const ids = created.map((e) => e.id);
    return prisma_1.default.enrollment.findMany({
        where: { id: { in: ids } },
        include: enrollmentIncludes,
    });
}
/**
 * Get all enrollments for a user
 */
async function getUserEnrollmentsService(userId) {
    return prisma_1.default.enrollment.findMany({
        where: { userId },
        include: enrollmentIncludes,
        orderBy: { id: "desc" },
    });
}
/**
 * Get a single enrollment with owner validation
 */
async function getOneEnrollmentService(id, userId) {
    const e = await prisma_1.default.enrollment.findUnique({
        where: { id },
        include: enrollmentIncludes,
    });
    if (!e)
        throw (0, errors_1.notFound)("Enrollment not found");
    if (e.userId !== userId)
        throw (0, errors_1.forbidden)("Access denied — this is not your enrollment");
    return e;
}
/**
 * Create physical walk-in enrollment request
 */
// export async function createPhysicalEnrollmentRequestService(
//   data: CreatePhysicalEnrollmentRequestInput
// ) {
//   return prisma.enrollmentRequest.create({
//     data,
//     include: {
//       course: true,
//     },
//   });
// }
// export async function listPhysicalEnrollmentRequestsService() {
//   return prisma.enrollmentRequest.findMany({
//     include: {
//       course: true,
//     },
//     orderBy: { createdAt: "desc" },
//   });
// }
