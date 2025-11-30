import { z } from "zod";

const resourceValidator = z.string().refine(
  (val) =>
    val === "" ||
    /^https?:\/\//.test(val) || // full URL
    /^[\w\-. ]+\.[A-Za-z0-9]{2,6}$/.test(val) || // simple filename with extension like "slides.pdf"
    /^[\w\-/\\ ]+$/.test(val), // filenames without ext or paths
  { message: "Must be a valid URL or filename" }
);

export const createTopicSchema = z.object({
  moduleId: z.uuid(),
  title: z.string().min(1),
  videoUrl: z.url().optional().nullable(),
  resources: z.array(resourceValidator).optional().default([]),
});

export const updateTopicSchema = createTopicSchema.partial();
