import { z } from "zod";

const pricingSchema = z.object({
  duration: z.string(), // "3 months"
  price: z.number().positive(),
});

//  title: z.string().min(3).max(200),
//   slug: z.string().min(3),
//   description: z.string().min(1).max(2000),
//   thumbnail: z.string().url().optional().or(z.literal("")).optional(),
//   price: z.number().min(0, "Invalid price"),
//   type: z.nativeEnum(CourseMode),
//   level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
//   duration: z.string().optional().nullable(),
//   category: z.string().max(100).optional().nullable(),
//   tags: z.array(z.string().max(50)).max(10).optional().default([]),
//   instructorId: z.string().uuid().optional(),
//   programId: z.string().optional().nullable(),
//   programTitle: z.string().optional().nullable(),
//   videoPreview: z.string().url().optional().or(z.literal("")).optional(),
//   modules: z.array(moduleSchema).optional().default([]),

export const createCourseSchema = z.object({
  title: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().min(5).max(200),
  thumbnail: z.url().optional().or(z.literal("")).optional(),
  type: z.enum(["online", "physical"]),
  // level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  level: z.string().optional(),
  duration: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  videoPreview: z.url().optional().or(z.literal("")).optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  schedule: z.string().optional(),
  instructorId: z.uuid().optional(),
  // programId: z.string().optional().nullable(),
  // modules: z.array(moduleSchema).optional().default([]),

  // Inline program creation OR programId
  program: z
    .object({
      id: z.uuid().optional(),
      create: z
        .object({
          title: z.string().min(2),
          description: z.string().optional(),
          image: z.string().optional(),
        })
        .optional(),
    })
    .refine((v) => v.id || v.create, {
      message: "Provide program.id or program.create",
    }),

  // Pricing tiers ONLY required for online courses
  pricings: z.array(pricingSchema).optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const listCoursesQuery = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  type: z.enum(["online", "physical"]).optional(),
  limit: z.coerce.number().default(20),
  offset: z.coerce.number().default(0),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
