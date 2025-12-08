import { z } from "zod";

export const createProgramSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  image: z.string().optional(),
  slug: z.string().optional(),
});

export const updateProgramSchema = createProgramSchema.partial();