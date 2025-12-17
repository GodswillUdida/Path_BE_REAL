"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteModule = exports.updateModule = exports.listModulesForCourse = exports.createModule = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const createModule = async (data) => {
    const course = await prisma_1.default.course.findUnique({
        where: { id: data.courseId },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    const created = await prisma_1.default.module.create({
        data: {
            title: data.title,
            description: data.description ?? null,
            courseId: data.courseId,
        },
        include: { topics: true },
    });
    return created;
};
exports.createModule = createModule;
const listModulesForCourse = async (courseId) => {
    return prisma_1.default.module.findMany({
        where: { courseId },
        include: { topics: true },
    });
};
exports.listModulesForCourse = listModulesForCourse;
const updateModule = async (id, data) => {
    const updated = await prisma_1.default.module.update({
        where: { id },
        data,
        include: { topics: true },
    });
    return updated;
};
exports.updateModule = updateModule;
const deleteModule = async (id) => {
    await prisma_1.default.module.delete({ where: { id } });
    return true;
};
exports.deleteModule = deleteModule;
