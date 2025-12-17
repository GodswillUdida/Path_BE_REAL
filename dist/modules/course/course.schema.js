"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCoursesQuery = exports.updateCourseSchema = exports.createCourseSchema = void 0;
const zod_1 = require("zod");
/* -------------------- Pricing -------------------- */
const pricingSchema = zod_1.z.object({
    duration: zod_1.z.string(), // e.g. "3 months"
    price: zod_1.z.number().positive(),
});
/* -------------------- Shared -------------------- */
const baseCourseSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, "Title too short").trim(),
    slug: zod_1.z.string().optional(),
    description: zod_1.z
        .string()
        .min(5, "Description too short")
        .max(200, "Description too long")
        .trim(),
    thumbnail: zod_1.z
        .string()
        .url("Invalid thumbnail URL")
        .optional()
        .or(zod_1.z.literal("")),
    level: zod_1.z.string().optional(),
    duration: zod_1.z.string().optional().nullable(),
    tags: zod_1.z.array(zod_1.z.string().trim()).max(10, "Max 10 tags").default([]),
    category: zod_1.z.string().optional(),
    instructorId: zod_1.z.string().uuid("Invalid UUId").optional(),
});
/* -------------------- ONLINE -------------------- */
const onlineCourseSchema = baseCourseSchema.extend({
    // ...baseCourseSchema,
    type: zod_1.z.literal("online"),
    videoPreview: zod_1.z.string().url("Invalid video URL").optional().or(zod_1.z.literal("")),
    // REQUIRED
    pricings: zod_1.z
        .array(pricingSchema)
        .min(1, "Online courses need at least one pricing"),
    // FORBIDDEN
    location: zod_1.z.never().optional(),
    schedule: zod_1.z.never().optional(),
});
/* -------------------- PHYSICAL -------------------- */
const physicalCourseSchema = baseCourseSchema.extend({
    // ...baseCourseSchema,
    type: zod_1.z.literal("physical"),
    // REQUIRED
    location: zod_1.z.string().min(2),
    schedule: zod_1.z.string().min(2),
    // FORBIDDEN
    pricings: zod_1.z.never().optional(),
    videoPreview: zod_1.z.never().optional(),
});
/* -------------------- PUBLIC SCHEMA -------------------- */
exports.createCourseSchema = zod_1.z.discriminatedUnion("type", [
    onlineCourseSchema,
    physicalCourseSchema,
]);
// For updates: Partial each branch, then discriminated union
// const updateOnlineSchema = onlineCourseSchema.partial();
// const updatePhysicalSchema = physicalCourseSchema.partial();
// export const updateCourseSchema = z.discriminatedUnion("type", [
//   updateOnlineSchema,
//   updatePhysicalSchema,
// ]);
exports.updateCourseSchema = baseCourseSchema.partial().extend({
    thumbnail: zod_1.z.string().url().or(zod_1.z.literal("")).optional(),
});
/* -------------------- QUERY -------------------- */
exports.listCoursesQuery = zod_1.z.object({
    q: zod_1.z.string().optional(),
    tag: zod_1.z.string().optional(),
    type: zod_1.z.enum(["online", "physical"]).optional(),
    limit: zod_1.z.coerce.number().min(1).max(50, "Max limit 50").default(20),
    offset: zod_1.z.coerce.number().min(0).default(0),
});
