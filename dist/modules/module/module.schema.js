"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateModuleSchema = exports.createModuleSchema = void 0;
const zod_1 = require("zod");
exports.createModuleSchema = zod_1.z.object({
    courseId: zod_1.z.uuid(),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional().nullable(),
});
exports.updateModuleSchema = exports.createModuleSchema.partial();
