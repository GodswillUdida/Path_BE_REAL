import { z } from "zod";

// Centralized enums for maintainability
const type = ["PHYSICAL", "ONLINE",] as const;
const levels = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const schedules = ["FULL_TIME", "PART_TIME"] as const;

  // thumbnail: z.string().url().optional().or(z.literal("")),
  // price: z.number().min(0, "Invalid price"),
  // type: z.nativeEnum(CourseMode),
  // level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  // duration: z.string().optional(),
  // // tags: z.array(z.string().max(50)).max(10).optional().default([]),
  // instructorId: z.string().uuid().optional(),
  // programId: z.string().optional(),
  // videoPreview: z.string().url().optional().or(z.literal("")),

export const courseZodSchema = z.object({
  title: z.string().min(3, "Title too short").max(100, "Title too long"),
  slug: z.string().min(3),
  description: z
    .string()
    .trim()
    .min(10, "Description too short")
    .max(100, "Description too long"),
  price: z.coerce.number().min(0, "Price must be positive"),
  category: z.string().min(3, "Category too short"),
  type: z.enum(type),
  level: z.enum(levels, { errorMap: () => ({ message: "Invalid level" }) }),
  schedule: z.enum(schedules, {
    errorMap: () => ({ message: "Invalid schedule" }),
  }),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) =>
      typeof val === "string"
        ? val.split(",").map((tag) => tag.trim())
        : (val ?? [])
    ),
  duration: z.string().regex(/^\d+\s+(months|weeks|days|years)$/, {
    message: "Duration must be like '4 months', '6 weeks', etc.",
  }),
  programId: z.string().optional(),
  programTitle: z.string().optional(),
  videoPreview: z.string().url().optional().or(z.literal("")),
});

export const courseSchema = courseZodSchema.extend({
  image: z.string().url().optional(), // optional here because it's uploaded
});

export const courseUpdateSchema = courseZodSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update.",
  });

// export const subCourseSchema = z.object({
//   title: z.string().trim().min(3, "Title too short").max(100, "Title too long"),
//   description: z.string().trim().min(10, "Description too short"),
//   price: z.coerce.number().min(0, "Price must be positive"),
//   image: z.string().url().optional(),
//   duration: z.string().regex(/^\d+\s+(months|weeks|days|years)$/, {
//     message: "Duration must be like '4 months', '6 weeks', etc.",
//   }),
//   units: z.number().int().min(1, "Units must be at least 1"),
//   category: z.string().min(3, "Category too short"),
//   campus: z.enum(campuses, { errorMap: () => ({ message: "Invalid campus" }) }),
//   level: z.enum(levels, {
//     errorMap: () => ({
//       message: "Invalid level",
//     }),
//   }),
//   schedule: z.enum(schedules, {
//     errorMap: () => ({ message: "Invalid schedule" }),
//   }),
//   tags: z
//     .union([z.string(), z.array(z.string())])
//     .optional()
//     .transform((val) =>
//       typeof val === "string"
//         ? val.split(",").map((tag) => tag.trim())
//         : (val ?? [])
//     ),
//   curriculum: z.string().url().optional(),
//   // courseId: z.string().min(20, "Invalid course ID format"),
//   // courseId: z.string().regex(/^c[a-z0-9]{24,}$/i, "Invalid course ID format"),
//   isActive: z.boolean().default(false),
// });
