"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCourse = exports.updateCourse = exports.getCourseBySlug = exports.getCourse = exports.listCourses = exports.createPhysicalCourse = void 0;
exports.createOnlineCourse = createOnlineCourse;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../..//utils/errors");
const slugify_1 = require("../../utils/slugify");
const stream_1 = require("../../config/stream");
const logger_1 = __importDefault(require("../../utils/logger"));
async function createOnlineCourse(programSlug, data, adminId, fileBuffer, fileMime) {
    const program = await prisma_1.default.program.findUnique({
        where: { slug: programSlug },
    });
    if (!program)
        throw (0, errors_1.notFound)("Program not found");
    let thumbnail = data.thumbnail ?? "";
    if (fileBuffer) {
        if (!fileMime?.startsWith("image/")) {
            throw (0, errors_1.badRequest)("Invalid image file type");
        }
        try {
            const uploadResult = await (0, stream_1.streamUpload)(fileBuffer, "pathfinder/images/courses");
            thumbnail = uploadResult.secure_url;
        }
        catch (err) {
            logger_1.default.error("Failed to upload image", err);
            throw (0, errors_1.badRequest)("Failed to upload image");
        }
    }
    else if (!thumbnail) {
        throw (0, errors_1.badRequest)("Thumbnail URL or file is required");
    }
    if (!thumbnail)
        throw (0, errors_1.badRequest)("Thumbnail/Image is required");
    if (data.type !== "online") {
        throw (0, errors_1.badRequest)("Only online course allowed for this endpoint");
    }
    const slug = await (0, slugify_1.generateUniqueSlug)(data.title, "course");
    const course = await prisma_1.default.course.create({
        data: {
            ...data,
            slug,
            thumbnail,
            type: "online",
            level: data.level,
            duration: data.duration,
            tags: data.tags,
            category: data.category,
            videoPreview: data.videoPreview,
            programId: program.id,
            instructorId: adminId,
            pricings: {
                create: data.pricings.map((p) => ({
                    duration: p.duration,
                    price: p.price,
                })),
            },
        },
        include: {
            program: true,
            pricings: true,
        },
    });
    return course;
}
const createPhysicalCourse = async (programSlug, data, adminId, fileBuffer, fileMime) => {
    const program = await prisma_1.default.program.findUnique({
        where: { slug: programSlug },
    });
    if (!program)
        throw (0, errors_1.notFound)("Program not found");
    let thumbnail = data.thumbnail ?? "";
    // const { secure_url, public_id }: any = await streamUpload(req);
    if (fileBuffer) {
        if (!fileMime?.startsWith("image/")) {
            throw (0, errors_1.badRequest)("Invalid image file type");
        }
        try {
            const uploadResult = await (0, stream_1.streamUpload)(fileBuffer, "pathfinder/images/physical-courses");
            thumbnail = uploadResult.secure_url;
        }
        catch (err) {
            logger_1.default.error("Failed to upload image", err);
            throw (0, errors_1.badRequest)("Failed to upload image");
        }
    }
    else if (!thumbnail) {
        throw (0, errors_1.badRequest)("Thumbnail URL or file is required");
    }
    // const { secure_url } = await streamUpload(
    //       fileBuffer,
    //       "pathfinder/images/physical-courses"
    //     );
    if (!thumbnail)
        throw (0, errors_1.badRequest)("Thumbnail/Image is required");
    const slug = await (0, slugify_1.generateUniqueSlug)(data.title, "course");
    if (data.type !== "physical") {
        throw (0, errors_1.badRequest)("Invalid course type for this endpoint");
    }
    const physicalCourse = await prisma_1.default.course.create({
        data: {
            // ...data,
            title: data.title,
            description: data.description,
            slug,
            thumbnail,
            type: "physical",
            level: data.level,
            duration: data.duration,
            tags: data.tags,
            category: data.category,
            location: data.location,
            schedule: data.schedule,
            programId: program.id,
            instructorId: adminId,
        },
        include: {
            program: true,
        },
    });
    return physicalCourse;
};
exports.createPhysicalCourse = createPhysicalCourse;
const listCourses = async (q, type, limit, offset) => {
    const where = {};
    if (q) {
        where.OR = [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
        ];
    }
    if (type)
        where.type = type;
    return prisma_1.default.course.findMany({
        where,
        take: limit ?? 20,
        skip: offset ?? 0,
        include: { program: true, pricings: true, enrollments: true },
        orderBy: { createdAt: "desc" },
    });
};
exports.listCourses = listCourses;
const getCourse = async (id) => {
    const course = await prisma_1.default.course.findUnique({
        where: { id },
        include: {
            program: true,
            pricings: true,
            modules: { include: { topics: true } },
            enrollments: true,
        },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    return course;
};
exports.getCourse = getCourse;
const getCourseBySlug = async (programSlug, courseSlug) => {
    const program = await prisma_1.default.program.findUnique({
        where: { slug: programSlug },
    });
    if (!program)
        throw (0, errors_1.notFound)("Program not found");
    const course = await prisma_1.default.course.findFirst({
        where: { slug: courseSlug, programId: program.id },
        include: {
            program: true,
            pricings: true,
            modules: { include: { topics: true } },
        },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    return course;
};
exports.getCourseBySlug = getCourseBySlug;
const updateCourse = async (id, data, fileBuffer, fileMime) => {
    // disallow program reassign via simple update; require dedicated endpoint if needed
    const payload = { ...data };
    delete payload.program;
    const existing = await prisma_1.default.course.findUnique({ where: { id } });
    if (!existing)
        throw (0, errors_1.badRequest)("Course not found");
    let thumbnail = data.thumbnail ?? existing.thumbnail;
    if (fileBuffer) {
        if (!fileMime?.startsWith("image/")) {
            throw (0, errors_1.badRequest)("Invalid image file type");
        }
        try {
            const uploadResult = await (0, stream_1.streamUpload)(fileBuffer, "pathfinder/images/courses");
            thumbnail = uploadResult.secure_url;
        }
        catch (err) {
            logger_1.default.error("Failed to upload image", err);
            throw (0, errors_1.badRequest)("Failed to upload image");
        }
    }
    let updatedSlug = existing.slug;
    if (data.title && !data.slug) {
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.title, "course", id);
        payload.slug = updatedSlug;
    }
    if (data.slug) {
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.slug, "course");
        payload.slug = updatedSlug;
    }
    const updated = await prisma_1.default.course.update({
        where: { id },
        data: {
            ...payload,
            slug: updatedSlug,
            thumbnail,
        },
        include: { program: true, pricings: true },
    });
    return updated;
};
exports.updateCourse = updateCourse;
const deleteCourse = async (id) => {
    await prisma_1.default.course.delete({ where: { id } });
    return true;
};
exports.deleteCourse = deleteCourse;
