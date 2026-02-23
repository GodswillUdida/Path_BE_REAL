"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProgram = exports.updateProgram = exports.getProgramBySlug = exports.getProgram = exports.listPrograms = exports.createProgram = void 0;
exports.createCourseFromProgramId = createCourseFromProgramId;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const slugify_1 = require("../../utils/slugify");
const course_service_1 = require("../../modules/course/course.service");
const createProgram = async (data) => {
    const titleExists = await prisma_1.default.program.findFirst({
        where: { title: data.title, deletedAt: null },
    });
    if (titleExists)
        throw (0, errors_1.badRequest)("Program title already exists");
    const slug = data.slug ?? (await (0, slugify_1.generateUniqueSlug)(data.title, "program"));
    // const slug = await generateUniqueSlug(data.title, "program");
    const program = await prisma_1.default.program.create({
        data: {
            title: data.title,
            description: data.description,
            slug,
            image: data.image ?? null,
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
    switch (params.type) {
        case "online":
            return (0, course_service_1.createOnlineCourse)(
            // program.slug,
            params.payload, params.adminId, params.fileBuffer, params.fileMime);
        default:
            throw (0, errors_1.badRequest)("Invalid course type");
    }
    // if (params.type === "physical") {
    //   return createPhysicalCourse(
    //     program.slug,
    //     params.payload,
    //     params.adminId,
    //     params.fileBuffer,
    //     params.fileMime
    //   );
    // }
    // if (params.type === "online") {
    //   return createOnlineCourse(
    //     program.slug,
    //     params.payload,
    //     params.adminId,
    //     params.fileBuffer,
    //     params.fileMime
    //   );
    // }
    // throw new Error("Invalid course type");
}
const listPrograms = async () => {
    return prisma_1.default.program.findMany({
        where: { deletedAt: null },
        include: { courses: true },
        orderBy: { createdAt: "desc" },
    });
};
exports.listPrograms = listPrograms;
const getProgram = async (id) => {
    const program = await prisma_1.default.program.findUnique({
        where: { id },
        include: { courses: true },
    });
    if (!program || program.deletedAt)
        throw (0, errors_1.notFound)("Program not found");
    return program;
};
exports.getProgram = getProgram;
const getProgramBySlug = async (slug) => {
    const program = await prisma_1.default.program.findUnique({
        where: { slug },
        include: { courses: true },
    });
    if (!program || program.deletedAt)
        throw (0, errors_1.notFound)("Program not found");
    return program;
};
exports.getProgramBySlug = getProgramBySlug;
const updateProgram = async (id, data) => {
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program || program.deletedAt)
        throw (0, errors_1.notFound)("Program not found");
    let updatedSlug = data.slug ?? program.slug;
    if (data.title && data.title !== program.title) {
        const titleExists = await prisma_1.default.program.findFirst({
            where: { title: data.title, NOT: { id }, deletedAt: null },
        });
        if (titleExists)
            throw (0, errors_1.badRequest)("Program title already exists");
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.title, "program", id);
    }
    const updated = await prisma_1.default.program.update({
        where: { id },
        data: {
            ...data,
            slug: updatedSlug,
        },
    });
    return updated;
};
exports.updateProgram = updateProgram;
const deleteProgram = async (id) => {
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program || program.deletedAt)
        throw (0, errors_1.notFound)("Program not found");
    // Soft-delete
    return prisma_1.default.program.update({
        where: { id },
        data: { deletedAt: new Date() },
    });
};
exports.deleteProgram = deleteProgram;
