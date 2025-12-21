"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProgram = exports.updateProgram = exports.getProgramBySlug = exports.getProgram = exports.listPrograms = exports.createProgram = void 0;
exports.createCourseFromProgramId = createCourseFromProgramId;
const error_1 = require("../../middleware/error");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const slugify_1 = require("../../utils/slugify");
const course_service_1 = require("../../modules/course/course.service");
const createProgram = async (data) => {
    const titleExists = await prisma_1.default.program.findFirst({
        where: { title: data.title },
    });
    if (titleExists)
        throw (0, errors_1.badRequest)("Program title already exists");
    const slug = await (0, slugify_1.generateUniqueSlug)(data.title, "program");
    const program = await prisma_1.default.program.create({
        data: {
            title: data.title,
            description: data.description,
            slug,
            // image: data.image ?? null,
        },
    });
    return program;
};
exports.createProgram = createProgram;
async function createCourseFromProgramId(params) {
    const program = await prisma_1.default.program.findUnique({
        where: { id: params.programId },
        select: { slug: true },
    });
    if (!program)
        throw (0, errors_1.notFound)("Program not found");
    if (params.type === "physical") {
        return (0, course_service_1.createPhysicalCourse)(program.slug, params.payload, params.adminId, params.fileBuffer, params.fileMime);
    }
    if (params.type === "online") {
        return (0, course_service_1.createOnlineCourse)(program.slug, params.payload, params.adminId, params.fileBuffer, params.fileMime);
    }
    throw new Error("Invalid course type");
}
const listPrograms = async () => {
    return prisma_1.default.program.findMany({ include: { courses: true } });
};
exports.listPrograms = listPrograms;
const getProgram = async (id) => {
    return prisma_1.default.program.findUnique({
        where: { id },
        include: { courses: true },
    });
};
exports.getProgram = getProgram;
const getProgramBySlug = async (programSlug) => {
    try {
        const program = await prisma_1.default.program.findUnique({
            where: { slug: programSlug },
            include: { courses: true },
        });
        if (!program)
            throw new error_1.AppError("Program not found", 404);
        return program;
    }
    catch (error) {
        console.error(`Error fetching program with slug ${programSlug}:`, error);
        throw new error_1.AppError("Internal server error", 500);
    }
};
exports.getProgramBySlug = getProgramBySlug;
const updateProgram = async (id, data) => {
    let updatedSlug = data.slug;
    if (data.title) {
        const titleExists = await prisma_1.default.program.findFirst({
            where: { title: data.title, NOT: { id } },
        });
        if (titleExists)
            throw (0, errors_1.badRequest)("Program title already exists");
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.title, "program", id);
    }
    const program = await prisma_1.default.program.update({
        where: { id },
        data: {
            ...data,
            slug: updatedSlug,
        },
    });
    return program;
};
exports.updateProgram = updateProgram;
const deleteProgram = async (id) => {
    return prisma_1.default.program.delete({ where: { id } });
};
exports.deleteProgram = deleteProgram;
