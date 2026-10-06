import { z } from "zod";

export const programZodSchema = z.object({
    title: z.string().min(3, "Title too short").max(100, "Title too long"),
    slug: z.string().min(3).optional(),
    description: z
        .string()
        .trim()
        .min(10, "Description too short")
        .max(100, "Description too long"),
    image: z.string().url().optional(),
});

export const programSchema = programZodSchema.extend({
  image: z.string().url().optional(), // optional here because it's uploaded
});

export const programUpdateSchema = programZodSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update.",
  });