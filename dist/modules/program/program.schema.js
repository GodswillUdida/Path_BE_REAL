"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProgramSchema = exports.createProgramSchema = void 0;
const zod_1 = require("zod");
// DTO for creating a new Program
exports.createProgramSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, "Title must be at least 2 characters").trim(),
    description: zod_1.z.string().trim(),
    image: zod_1.z.string().url().optional(), // if you plan to add image later
    slug: zod_1.z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
        .optional(),
});
// DTO for updating a Program
exports.updateProgramSchema = exports.createProgramSchema.partial();
