import { z } from "zod";

export const createModuleSchema = z.object({
  courseId: z.uuid(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
});

export const updateModuleSchema = createModuleSchema.partial();