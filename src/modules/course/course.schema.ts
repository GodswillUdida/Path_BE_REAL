import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// Defined as plain enums — optionality is applied at the field site, never here.
// ─────────────────────────────────────────────────────────────────────────────

export const CourseStatusEnum = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const CourseLevelEnum = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

export type CourseStatus = z.infer<typeof CourseStatusEnum>;
export type CourseLevel = z.infer<typeof CourseLevelEnum>;

// ─────────────────────────────────────────────────────────────────────────────
// PRICING
// `id` is optional — present on update (upsert), absent on create (insert).
// Price is nonnegative to allow free tiers (0).
// Currency is validated as ISO 4217 3-char code.
// ─────────────────────────────────────────────────────────────────────────────

export const coursePricingSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100).trim().optional(),
  price: z.number().nonnegative("Price must be ≥ 0"),
  currency: z.string().length(3, "Must be a valid ISO 4217 currency code").default("NGN"),
  durationDays: z.number().int().positive("Duration must be a positive integer"),
  isActive: z.boolean().default(true),
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE COURSE
// - `instructorId` is NEVER in this schema — resolved from JWT in the service
// - `programId` comes from route param, injected by the controller pre-parse
// - `thumbnail` / `videoPreview` are optional URLs; if a file is uploaded,
//   the server resolves the CDN URL and overrides these fields
// ─────────────────────────────────────────────────────────────────────────────

export const createCourseSchema = z.object({
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title must be at most 200 characters")
    .trim(),

  slug: z
    .string()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens")
    .optional(),

  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description must be at most 5,000 characters")
    .trim(),

  thumbnail: z.string().url("Invalid thumbnail URL").optional(),
  videoPreview: z.string().url("Invalid video preview URL").optional(),

  level: CourseLevelEnum.default("BEGINNER"),
  duration: z.number().int().positive("Duration must be a positive integer (seconds)").optional(),
  status: CourseStatusEnum.default("DRAFT"),

  programId: z.string().uuid("Invalid program ID").optional(),

  tags: z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.array(z.string().trim().min(1)).max(10).default([])
  ),

  pricings: z.preprocess(
    (val) => {
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return val;
    },
    z.array(coursePricingSchema).min(1, "At least one pricing tier is required")),
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE COURSE
// Derived cleanly from create — no field is re-declared.
// Pricings omitted from partial then re-added with its own optionality rule.
// ─────────────────────────────────────────────────────────────────────────────

export const updateCourseSchema = createCourseSchema
  .omit({ pricings: true })
  .partial()
  .extend({
    pricings: z.array(coursePricingSchema).min(1).optional(),
  });

// ─────────────────────────────────────────────────────────────────────────────
// LIST QUERY PARAMS
// All filters are optional. Offset pagination for now;
// cursor field is stubbed — migrate when the table exceeds ~1M rows.
// ─────────────────────────────────────────────────────────────────────────────

export const listCoursesQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  status: CourseStatusEnum.optional(),
  level: CourseLevelEnum.optional(),
  programId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  // cursor: z.string().optional(), // reserved for keyset pagination
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CoursePricingInput = z.infer<typeof coursePricingSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;