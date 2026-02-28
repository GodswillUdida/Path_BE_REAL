"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCoursesQuery = exports.updateCourseSchema = exports.createCourseSchema = exports.baseCourseSchema = exports.coursePricingSchema = exports.courseStatusEnum = void 0;
const zod_1 = require("zod");
/* -------------------- ENUMS -------------------- */
exports.courseStatusEnum = zod_1.z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
/* -------------------- Pricing Schema -------------------- */
exports.coursePricingSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(), // for updates
    name: zod_1.z.string().optional(), // e.g., "1 Day Access"
    price: zod_1.z.number().positive("Price must be positive"),
    currency: zod_1.z.string().default("NGN"),
    durationDays: zod_1.z.number().int().positive("Duration must be positive"),
    isActive: zod_1.z.boolean().default(true),
});
/* -------------------- Base Course Schema -------------------- */
exports.baseCourseSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, "Title too short").trim(),
    slug: zod_1.z.string().optional(),
    description: zod_1.z.string().min(5, "Description too short").trim(),
    thumbnail: zod_1.z.string().url("Invalid thumbnail URL").optional(),
    videoPreview: zod_1.z.string().url("Invalid video URL").optional(),
    level: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string().trim()).max(20, "Max 20 tags").default([]),
    duration: zod_1.z.number().int().positive().optional(),
    status: exports.courseStatusEnum.default("DRAFT"),
    instructorId: zod_1.z.string().uuid().optional(),
    programId: zod_1.z.string().uuid().optional(),
});
/* -------------------- Online Course Schema -------------------- */
exports.createCourseSchema = exports.baseCourseSchema.extend({
    type: zod_1.z.literal("online"),
    pricings: zod_1.z
        .array(exports.coursePricingSchema)
        .min(1, "Online courses must have at least one pricing"),
});
/* -------------------- Update Course Schema -------------------- */
exports.updateCourseSchema = exports.baseCourseSchema.partial().extend({
    thumbnail: zod_1.z.string().url().optional(),
    videoPreview: zod_1.z.string().url().optional(),
    pricings: zod_1.z.array(exports.coursePricingSchema).optional(),
    status: exports.courseStatusEnum.optional(),
    duration: zod_1.z.number().int().positive().optional(),
});
/* -------------------- Query Params Schema -------------------- */
exports.listCoursesQuery = zod_1.z.object({
    q: zod_1.z.string().optional(),
    tag: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().min(1).max(50).default(20),
    offset: zod_1.z.coerce.number().min(0).default(0),
});
