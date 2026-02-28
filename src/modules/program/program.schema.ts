import { z } from "zod";

// DTO for creating a new Program
export const createProgramSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").trim(),
  description: z.string().trim(),
  image: z.string().url().optional(), // if you plan to add image later
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
    .optional(),
});

// DTO for updating a Program
export const updateProgramSchema = createProgramSchema.partial();

export type CreateProgramDTO = z.infer<typeof createProgramSchema>;
export type UpdateProgramDTO = z.infer<typeof updateProgramSchema>;
