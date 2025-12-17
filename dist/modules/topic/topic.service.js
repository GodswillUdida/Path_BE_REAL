"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopic = exports.updateTopic = exports.listTopicsForModule = exports.createTopic = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const createTopic = async (data) => {
    const module = await prisma_1.default.module.findUnique({
        where: { id: data.moduleId },
    });
    if (!module)
        throw (0, errors_1.notFound)("Module not found");
    const topic = await prisma_1.default.topic.create({
        data: {
            moduleId: data.moduleId,
            title: data.title,
            videoUrl: data.videoUrl ?? null,
            resources: data.resources ?? [],
        },
    });
    return topic;
};
exports.createTopic = createTopic;
const listTopicsForModule = async (moduleId) => {
    return prisma_1.default.topic.findMany({
        where: { moduleId },
        orderBy: { createdAt: "asc" },
    });
};
exports.listTopicsForModule = listTopicsForModule;
const updateTopic = async (id, data) => {
    const updated = await prisma_1.default.topic.update({ where: { id }, data });
    return updated;
};
exports.updateTopic = updateTopic;
const deleteTopic = async (id) => {
    await prisma_1.default.topic.delete({ where: { id } });
    return true;
};
exports.deleteTopic = deleteTopic;
