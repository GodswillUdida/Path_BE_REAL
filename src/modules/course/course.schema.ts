import { z } from "zod";

/* -------------------- Pricing -------------------- */
const pricingSchema = z.object({
  duration: z.string(), // e.g. "3 months"
  price: z.number().positive(),
});

/* -------------------- Shared -------------------- */
const baseCourseSchema = z.object({
  title: z.string().min(2, "Title too short").trim(),
  slug: z.string().optional(),
  description: z
    .string()
    .min(5, "Description too short")
    .max(200, "Description too long")
    .trim(),
  thumbnail: z
    .string()
    .url("Invalid thumbnail URL")
    .optional()
    .or(z.literal("")),
  level: z.string().optional(),
  duration: z.string().optional().nullable(),
  tags: z.array(z.string().trim()).max(10, "Max 10 tags").default([]),
  category: z.string().optional(),
  instructorId: z.string().uuid("Invalid UUId").optional(),
});

/* -------------------- ONLINE -------------------- */
const onlineCourseSchema = baseCourseSchema.extend({
  // ...baseCourseSchema,
  type: z.literal("online"),

  videoPreview: z.string().url("Invalid video URL").optional().or(z.literal("")),

  // REQUIRED
  pricings: z
    .array(pricingSchema)
    .min(1, "Online courses need at least one pricing"),

  // FORBIDDEN
  location: z.never().optional(),
  schedule: z.never().optional(),
});

/* -------------------- PHYSICAL -------------------- */
const physicalCourseSchema = baseCourseSchema.extend({
  // ...baseCourseSchema,
  type: z.literal("physical"),

  // REQUIRED
  location: z.string().min(2),
  schedule: z.string().min(2),

  // FORBIDDEN
  pricings: z.never().optional(),
  videoPreview: z.never().optional(),
});

/* -------------------- PUBLIC SCHEMA -------------------- */
export const createCourseSchema = z.discriminatedUnion("type", [
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
export const updateCourseSchema = baseCourseSchema.partial().extend({
  thumbnail: z.string().url().or(z.literal("")).optional(),
})

/* -------------------- QUERY -------------------- */
export const listCoursesQuery = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  type: z.enum(["online", "physical"]).optional(),
  limit: z.coerce.number().min(1).max(50, "Max limit 50").default(20),
  offset: z.coerce.number().min(0).default(0),
});

/* -------------------- TYPES -------------------- */
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type OnlineCourseInput = z.infer<typeof onlineCourseSchema>;
export type PhysicalCourseInput = z.infer<typeof physicalCourseSchema>;
