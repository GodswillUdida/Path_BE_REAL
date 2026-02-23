import { z } from "zod";

/* -------------------- ENUMS -------------------- */
export const courseStatusEnum = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/* -------------------- Pricing Schema -------------------- */
export const coursePricingSchema = z.object({
  id: z.string().uuid().optional(), // for updates
  name: z.string().optional(), // e.g., "1 Day Access"
  price: z.number().positive("Price must be positive"),
  currency: z.string().default("NGN"),
  durationDays: z.number().int().positive("Duration must be positive"),
  isActive: z.boolean().default(true),
});

/* -------------------- Base Course Schema -------------------- */
export const baseCourseSchema = z.object({
  title: z.string().min(2, "Title too short").trim(),
  slug: z.string().optional(),
  description: z.string().min(5, "Description too short").trim(),
  thumbnail: z.string().url("Invalid thumbnail URL").optional(),
  videoPreview: z.string().url("Invalid video URL").optional(),
  level: z.string().optional(),
  tags: z.array(z.string().trim()).max(20, "Max 20 tags").default([]),
  duration: z.number().int().positive().optional(),
  status: courseStatusEnum.default("DRAFT"),
  instructorId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
});

/* -------------------- Online Course Schema -------------------- */
export const createCourseSchema = baseCourseSchema.extend({
  type: z.literal("online"),
  pricings: z
    .array(coursePricingSchema)
    .min(1, "Online courses must have at least one pricing"),
});

/* -------------------- Update Course Schema -------------------- */
export const updateCourseSchema = baseCourseSchema.partial().extend({
  thumbnail: z.string().url().optional(),
  videoPreview: z.string().url().optional(),
  pricings: z.array(coursePricingSchema).optional(),
  status: courseStatusEnum.optional(),
  duration: z.number().int().positive().optional(),
});

/* -------------------- Query Params Schema -------------------- */
export const listCoursesQuery = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

/* -------------------- TYPES -------------------- */
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CoursePricingInput = z.infer<typeof coursePricingSchema>;
