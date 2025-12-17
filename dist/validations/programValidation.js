"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.programUpdateSchema = exports.programSchema = exports.programZodSchema = void 0;
const zod_1 = require("zod");
exports.programZodSchema = zod_1.z.object({
    title: zod_1.z.string().min(3, "Title too short").max(100, "Title too long"),
    slug: zod_1.z.string().min(3).optional(),
    description: zod_1.z
        .string()
        .trim()
        .min(10, "Description too short")
        .max(100, "Description too long"),
    image: zod_1.z.string().url().optional(),
});
exports.programSchema = exports.programZodSchema.extend({
    image: zod_1.z.string().url().optional(), // optional here because it's uploaded
});
exports.programUpdateSchema = exports.programZodSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update.",
});
