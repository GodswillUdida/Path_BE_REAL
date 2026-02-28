"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementModuleCompletion = exports.incrementModuleView = exports.deleteModule = exports.updateModule = exports.listModulesForCourse = exports.createModule = void 0;
const slugify_1 = require("../../utils/slugify");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const redisClient_1 = __importDefault(require("../../utils/redisClient"));
const createModule = async (data) => {
    const course = await prisma_1.default.course.findUnique({
        where: { id: data.courseId },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    const slug = await (0, slugify_1.generateUniqueSlug)(data.title, "module");
    const created = await prisma_1.default.module.create({
        data: {
            title: data.title,
            description: data.description ?? null,
            position: data.position ?? 0,
            slug,
            courseId: data.courseId,
        },
        include: { topics: true },
    });
    return created;
};
exports.createModule = createModule;
const listModulesForCourse = async (courseId, query) => {
    const { limit = 20, offset = 0 } = query ?? {};
    const cacheKey = `modules:${courseId}:${limit}:${offset}`;
    // const cached = await redis.get(cacheKey);
    // if (cached) return JSON.parse(cached);
    // try {
    //   const cached = await redis.get(cacheKey);
    //   if (cached) return JSON.parse(cached);
    // } catch (err) {
    //   console.warn("Redis read failed, continuing without cache");
    // }
    const [total, modules] = await prisma_1.default.$transaction([
        prisma_1.default.module.count({ where: { courseId, deletedAt: null } }),
        prisma_1.default.module.findMany({
            where: { courseId, deletedAt: null },
            skip: offset,
            take: limit,
            orderBy: { position: "asc" },
            include: { topics: true },
        }),
    ]);
    const result = {
        data: modules,
        meta: {
            total,
            limit,
            offset,
            pages: Math.ceil(total / limit),
        },
    };
    // try {
    //   await redis.set(cacheKey, JSON.stringify(result), "EX", 60);
    // } catch (err) {
    //   console.warn("Redis write failed, skipping cache");
    // }
    return result;
};
exports.listModulesForCourse = listModulesForCourse;
// export const updateModule = async (
//   id: string,
//   data: Partial<{ title: string; description?: string }>
// ) => {
//   const updated = await prisma.module.update({
//     where: { id },
//     data,
//     include: { topics: true },
//   });
//   return updated;
// };
const updateModule = async (id, data) => {
    const existing = await prisma_1.default.module.findUnique({ where: { id } });
    if (!existing || existing.deletedAt)
        throw (0, errors_1.notFound)("Module not found");
    let updatedSlug = existing.slug;
    if (data.title && data.title !== existing.title) {
        updatedSlug = await (0, slugify_1.generateUniqueSlug)(data.title, "module", id);
    }
    const updated = await prisma_1.default.module.update({
        where: { id },
        data: { ...data, slug: updatedSlug },
        include: { topics: true, course: true },
    });
    // Invalidate cache for course modules
    await redisClient_1.default.del(`modules:${existing.courseId}:*`);
    return updated;
};
exports.updateModule = updateModule;
const deleteModule = async (id) => {
    const existing = await prisma_1.default.module.findUnique({ where: { id } });
    if (!existing || existing.deletedAt)
        throw (0, errors_1.notFound)("Module not found");
    await prisma_1.default.module.update({
        where: { id },
        data: { deletedAt: new Date() },
    });
    // Invalidate cache for course modules
    await redisClient_1.default.del(`modules:${existing.courseId}:*`);
    return true;
};
exports.deleteModule = deleteModule;
/* -------------------- ANALYTICS -------------------- */
const incrementModuleView = async (id) => {
    const module = await prisma_1.default.module.update({
        where: { id },
        data: { views: { increment: 1 } },
    });
    return module.views;
};
exports.incrementModuleView = incrementModuleView;
const incrementModuleCompletion = async (id) => {
    const module = await prisma_1.default.module.update({
        where: { id },
        data: { completions: { increment: 1 } },
    });
    return module.completions;
};
exports.incrementModuleCompletion = incrementModuleCompletion;
