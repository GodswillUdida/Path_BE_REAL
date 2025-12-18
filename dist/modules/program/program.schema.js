"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProgramSchema = exports.createProgramSchema = void 0;
const zod_1 = require("zod");
exports.createProgramSchema = zod_1.z.object({
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    // image: z.string().optional(),
    slug: zod_1.z.string().optional(),
});
exports.updateProgramSchema = exports.createProgramSchema.partial();
