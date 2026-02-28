"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTopicSchema = exports.createTopicSchema = exports.moduleParamsSchema = exports.topicParamsSchema = void 0;
const zod_1 = require("zod");
const resourceValidator = zod_1.z.string().refine((val) => val === "" ||
    /^https?:\/\//.test(val) || // full URL
    /^[\w\-. ]+\.[A-Za-z0-9]{2,6}$/.test(val) || // simple filename with extension like "slides.pdf"
    /^[\w\-/\\ ]+$/.test(val), // filenames without ext or paths
{ message: "Must be a valid URL or filename" });
/* ---------- PARAMS ---------- */
exports.topicParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.moduleParamsSchema = zod_1.z.object({
    moduleId: zod_1.z.string().uuid(),
});
exports.createTopicSchema = zod_1.z.object({
    // moduleId: z.uuid(),
    title: zod_1.z.string().min(1),
    // videoUrl: z.url().optional().nullable(),
    position: zod_1.z.number().int().min(0).optional(),
    resources: zod_1.z.any().optional().default([]),
    // resources: z.array(resourceValidator).optional().default([]),
});
exports.updateTopicSchema = exports.createTopicSchema.partial();
