import { z } from "zod";

// const resourceValidator = z.string().refine(
//   (val) =>
//     val === "" ||
//     /^https?:\/\//.test(val) || // full URL
//     /^[\w\-. ]+\.[A-Za-z0-9]{2,6}$/.test(val) || // simple filename with extension like "slides.pdf"
//     /^[\w\-/\\ ]+$/.test(val), // filenames without ext or paths
//  { message: "Invalid resource format" }
// );

const resourceValidator = z.string().trim().refine(
  (val) => {
    if (!val) return true;

    // URL
    if (/^https?:\/\/[^\s]+$/.test(val)) return true;

    // filename with extension
    if (/^[\w\-. ]+\.[A-Za-z0-9]{2,10}$/.test(val)) return true;

    // simple path/name
    if (/^[\w\-/\\ ]+$/.test(val)) return true;

    return false;
  },
  { message: "Invalid resource format" }
);

/* ---------- PARAMS ---------- */
export const topicParamsSchema = z.object({
  id: z.string().uuid(),
});

export const moduleParamsSchema = z.object({
  moduleId: z.string().uuid(),
});

export const createTopicSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  resources: z.array(resourceValidator).optional(),
});

export const updateTopicSchema = createTopicSchema.partial();

export type CreateTopicInput = z.infer<typeof createTopicSchema>;