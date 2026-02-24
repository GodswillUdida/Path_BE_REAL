import { z } from "zod";

const resourceValidator = z.string().refine(
  (val) =>
    val === "" ||
    /^https?:\/\//.test(val) || // full URL
    /^[\w\-. ]+\.[A-Za-z0-9]{2,6}$/.test(val) || // simple filename with extension like "slides.pdf"
    /^[\w\-/\\ ]+$/.test(val), // filenames without ext or paths
  { message: "Must be a valid URL or filename" }
);

/* ---------- PARAMS ---------- */
export const topicParamsSchema = z.object({
  id: z.string().uuid(),
});

export const moduleParamsSchema = z.object({
  moduleId: z.string().uuid(),
});

export const createTopicSchema = z.object({
  // moduleId: z.uuid(),
  title: z.string().min(1),
  // videoUrl: z.url().optional().nullable(),
  position: z.number().int().min(0).optional(),
  resources: z.any().optional().default([]),
  // resources: z.array(resourceValidator).optional().default([]),
});

export type CreateTopicInput = z.infer<typeof createTopicSchema>;

export const updateTopicSchema = createTopicSchema.partial();
