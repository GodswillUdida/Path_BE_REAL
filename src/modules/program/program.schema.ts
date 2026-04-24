import { z } from "zod";

export const createProgramSchema = z.object({
  title: z.string().min(2).trim(),
  description: z.string().min(2).trim(),
  image: z.string().url().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
}).strict();

export const updateProgramSchema = createProgramSchema.partial().strict();

export type CreateProgramDTO = z.infer<typeof createProgramSchema>;
export type UpdateProgramDTO = z.infer<typeof updateProgramSchema>;