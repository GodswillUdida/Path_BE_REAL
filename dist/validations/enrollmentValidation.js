"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollmentSchema = void 0;
const zod_1 = require("zod");
exports.enrollmentSchema = zod_1.z
    .object({
    email: zod_1.z.string().email({ message: "Invalid email address" }),
    firstName: zod_1.z.string().min(1, { message: "First name is required" }),
    lastName: zod_1.z.string().min(1, { message: "Last name is required" }),
    phone: zod_1.z
        .string()
        .min(10, { message: "Phone number must be at least 10 digits" })
        .max(15, { message: "Phone number must be at most 15 digits" })
        .regex(/^\+?\d+$/, { message: "Phone number format is invalid" }),
    courseId: zod_1.z.string().optional(),
    subCourseId: zod_1.z.string().optional(),
    paymentStatus: zod_1.z
        .enum(["PENDING", "PAID", "FAILED", "REFUNDED"])
        .default("PENDING"),
    paymentRef: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().default(true),
    // Only needed for conditional logic (set in controller, not from user)
    hasSubCourses: zod_1.z.boolean().optional(),
})
    .superRefine((data, ctx) => {
    if (data.hasSubCourses && !data.subCourseId) {
        ctx.addIssue({
            code: "custom",
            message: "subCourseId is required when the course has sub-courses",
            path: ["subCourseId"],
        });
    }
});
