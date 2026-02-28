"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moduleParamsSchema = exports.listModulesQuerySchema = exports.updateModuleSchema = exports.createModuleSchema = void 0;
const zod_1 = require("zod");
/* -------------------- CREATE -------------------- */
exports.createModuleSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, "Title too short").trim(),
    description: zod_1.z.string().max(500, "Description too long").optional(),
    position: zod_1.z.number().int().min(0).optional(),
    // courseId: z.string().uuid("Invalid course ID"),
});
/* -------------------- UPDATE -------------------- */
exports.updateModuleSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, "Title too short").optional(),
    description: zod_1.z.string().max(500, "Description too long").optional(),
    position: zod_1.z.number().int().min(0).optional(),
});
/* -------------------- QUERY / LIST -------------------- */
exports.listModulesQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().min(1).max(50).default(20),
    offset: zod_1.z.coerce.number().min(0).default(0),
});
/* -------------------- PARAMS -------------------- */
exports.moduleParamsSchema = zod_1.z.object({
    courseId: zod_1.z.string().uuid("Invalid Course ID"),
});
