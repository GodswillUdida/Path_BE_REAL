"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollmentRequestSchema = void 0;
const zod_1 = require("zod");
exports.enrollmentRequestSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters long"),
    email: zod_1.z.email("Invalid email address"),
    phone: zod_1.z.string().min(7, "Phone number must be at least 10 characters long"),
    notes: zod_1.z.string().optional(),
    // programId: z.uuid().optional(),
    courseId: zod_1.z.uuid().optional(),
    //   source: z.string().optional(),
    //   metadata: z.any().optional(),
});
