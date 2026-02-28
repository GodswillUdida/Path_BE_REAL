"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOnlineCourse = createOnlineCourse;
exports.getCourse = getCourse;
exports.getCourseBySlug = getCourseBySlug;
exports.listCourses = listCourses;
exports.updateCourse = updateCourse;
exports.deleteCourse = deleteCourse;
exports.getCourseAnalytics = getCourseAnalytics;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const slugify_1 = require("../../utils/slugify");
const stream_1 = require("../../config/stream");
const logger_1 = __importDefault(require("../../utils/logger"));
// import redis from "../../utils/redisClient";
const redisClient_1 = __importDefault(require("../../utils/redisClient"));
/* -------------------- CREATE ONLINE COURSE -------------------- */
async function createOnlineCourse(data, adminId, fileBuffer, fileMime) {
    if (data.type !== "online")
        throw (0, errors_1.badRequest)("Only online courses allowed here");
    // Fetch program if assigned
    const program = data.programId
        ? await prisma_1.default.program.findUnique({ where: { id: data.programId } })
        : null;
    if (data.programId && !program)
        throw (0, errors_1.notFound)("Program not found");
    // Handle thumbnail upload
    let thumbnail = data.thumbnail ?? "";
    if (fileBuffer) {
        if (!fileMime?.startsWith("image/"))
            throw (0, errors_1.badRequest)("Invalid image type");
        try {
            const uploadResult = await (0, stream_1.streamUpload)(fileBuffer, "pathfinder/images/courses");
            thumbnail = uploadResult.secure_url;
        }
        catch (err) {
            logger_1.default.error("Thumbnail upload failed", err);
            throw (0, errors_1.badRequest)("Failed to upload thumbnail");
        }
    }
    else if (!thumbnail) {
        throw (0, errors_1.badRequest)("Thumbnail is required");
    }
    // Generate unique slug
    const slug = await (0, slugify_1.generateUniqueSlug)(data.slug ?? data.title, "course");
    // Prisma create course with pricing
    const course = await prisma_1.default.course.create({
        data: {
            title: data.title,
            description: data.description,
            slug,
            thumbnail,
            videoPreview: data.videoPreview ?? null,
            level: data.level ?? null,
            tags: data.tags,
            duration: data.duration ?? null,
            status: data.status ?? "DRAFT",
            programId: data.programId ?? null,
            instructorId: adminId,
            // type: "online",
            pricings: {
                create: data.pricings.map((p) => ({
                    name: p.name ?? null,
                    price: p.price,
                    currency: p.currency ?? "NGN",
                    durationDays: p.durationDays,
                    isActive: p.isActive ?? true,
                })),
            },
        },
        include: { pricings: true, program: true },
    });
    return course;
}
/* -------------------- GET COURSE -------------------- */
async function getCourse(courseId) {
    const course = await prisma_1.default.course.findUnique({
        where: { id: courseId },
        include: {
            pricings: true,
            program: true,
            modules: true,
            enrollments: true,
            // modules: { include: { topics: true } },
        },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    return course;
}
async function getCourseBySlug(programSlug, courseSlug) {
    const program = await prisma_1.default.program.findUnique({
        where: { slug: programSlug },
    });
    if (!program)
        throw (0, errors_1.notFound)("Program not found");
    const course = await prisma_1.default.course.findFirst({
        where: { slug: courseSlug, programId: program.id },
        include: {
            pricings: true,
            program: true,
            modules: { include: { topics: true } },
        },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    return course;
}
/* -------------------- LIST COURSES -------------------- */
// export async function listCourses(
//   q?: string,
//   tag?: string,
//   type?: "online" | "physical",
//   limit = 20,
//   offset = 0,
// ) {
//   const where: any = {};
//   if (q)
//     where.OR = [
//       { title: { contains: q, mode: "insensitive" } },
//       { description: { contains: q, mode: "insensitive" } },
//     ];
//   if (tag) where.tags = { has: tag };
//   if (type) where.type = type;
//   return prisma.course.findMany({
//     where,
//     skip: offset,
//     take: limit,
//     include: { pricings: true, program: true, enrollments: true },
//     orderBy: { createdAt: "desc" },
//   });
// }
async function listCourses(q, tag, limit = 20, offset = 0) {
    const where = { deletedAt: null };
    if (q) {
        where.OR = [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
        ];
    }
    if (tag)
        where.tags = { has: tag };
    const cacheKey = `courses:${q ?? ""}:${tag ?? ""}:${limit}:${offset}`;
    const cached = await redisClient_1.default.get(cacheKey);
    if (cached)
        return JSON.parse(cached);
    const [total, courses] = await prisma_1.default.$transaction([
        prisma_1.default.course.count({ where }),
        prisma_1.default.course.findMany({
            where,
            skip: offset,
            take: limit,
            include: { pricings: true, program: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);
    const result = {
        data: courses,
        meta: {
            total,
            limit,
            offset,
            pages: Math.ceil(total / limit),
        },
    };
    await redisClient_1.default.set(cacheKey, JSON.stringify(result), "EX", 60);
    return result;
}
/* -------------------- UPDATE COURSE -------------------- */
async function updateCourse(id, data, fileBuffer, fileMime) {
    const existing = await prisma_1.default.course.findUnique({
        where: { id },
        include: { pricings: true },
    });
    if (!existing)
        throw (0, errors_1.notFound)("Course not found");
    let thumbnail = data.thumbnail ?? existing.thumbnail;
    if (fileBuffer) {
        if (!fileMime?.startsWith("image/"))
            throw (0, errors_1.badRequest)("Invalid image type");
        try {
            const uploadResult = await (0, stream_1.streamUpload)(fileBuffer, "pathfinder/images/courses");
            thumbnail = uploadResult.secure_url;
        }
        catch (err) {
            logger_1.default.error("Thumbnail upload failed", err);
            throw (0, errors_1.badRequest)("Failed to upload thumbnail");
        }
    }
    // Handle slug update
    let updatedSlug = existing.slug;
    if (data.title && !data.slug)
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.title, "course", id);
    if (data.slug)
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.slug, "course", id);
    // Update course
    const { pricings, ...updateData } = data;
    const updated = await prisma_1.default.course.update({
        where: { id },
        data: {
            ...updateData,
            slug: updatedSlug,
            thumbnail,
            instructorId: existing.instructorId,
            ...(pricings && {
                pricings: {
                    deleteMany: {},
                    create: pricings.map((p) => ({
                        name: p.name ?? null,
                        price: p.price,
                        currency: p.currency ?? "NGN",
                        durationDays: p.durationDays,
                        isActive: p.isActive ?? true,
                    })),
                },
            }),
        },
        include: { program: true, pricings: true },
    });
    // const updated = await prisma.course.update({
    //   where: { id },
    //   data: {
    //     ...data,
    //     slug: updatedSlug,
    //     thumbnail,
    //     instructorId: undefined,
    //   },
    //   include: { pricings: true, program: true },
    // });
    return updated;
}
/* -------------------- DELETE COURSE -------------------- */
async function deleteCourse(id) {
    const existing = await prisma_1.default.course.findUnique({
        where: { id },
    });
    if (!existing)
        throw (0, errors_1.notFound)("Course not found");
    await prisma_1.default.course.update({
        where: { id },
        data: { deletedAt: new Date() },
    });
    return true;
}
async function getCourseAnalytics(courseId) {
    const course = await prisma_1.default.course.findUnique({
        where: { id: courseId, deletedAt: null },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    const [totalEnrollments, activePricings, revenue] = await prisma_1.default.$transaction([
        prisma_1.default.enrollment.count({ where: { courseId } }),
        prisma_1.default.coursePricing.count({
            where: { courseId, isActive: true },
        }),
        prisma_1.default.orderItem.aggregate({
            _sum: { price: true },
            // where: { courseId },
        }),
    ]);
    return {
        totalEnrollments,
        activePricings,
        totalRevenue: revenue._sum.price ?? 0,
    };
}
