import { z } from "zod";

/* -------------------- CREATE -------------------- */
export const createModuleSchema = z.object({
  title: z.string().min(2, "Title too short").trim(),
  description: z.string().max(500, "Description too long").optional(),
  position: z.number().int().min(0).optional(),
  // courseId: z.string().uuid("Invalid course ID"),
});

/* -------------------- UPDATE -------------------- */
export const updateModuleSchema = z.object({
  title: z.string().min(2, "Title too short").optional(),
  description: z.string().max(500, "Description too long").optional(),
  position: z.number().int().min(0).optional(),
});

/* -------------------- QUERY / LIST -------------------- */
export const listModulesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

/* -------------------- PARAMS -------------------- */
export const moduleParamsSchema = z.object({
  courseId: z.string().uuid("Invalid Course ID"),
});


/* -------------------- TYPES -------------------- */
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ListModulesQuery = z.infer<typeof listModulesQuerySchema>;
export type ModuleParams = z.infer<typeof moduleParamsSchema>;
