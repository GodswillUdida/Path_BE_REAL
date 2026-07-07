import z from "zod";

const uuid = z.string().uuid();

export const upsertProgressSchema = z.object({
    body: z.object({
        enrollmentId:  uuid,
        topicId: uuid,
        watchedSeconds: z.number().int().min(0).optional(),
        completed: z.boolean().optional(),
    }),
});

export const markCompleteSchema = z.object({
    params: z.object({
        enrollmentId: uuid,
        topicId: uuid,
    }),
    body: z.object({
        completed: z.boolean().optional(),
    }),
});

export const enrollmentParamSchema = z.object({
    params: z.object({
        enrollmentId: z.string().uuid("enrollmentId must be a valid UUID."),
    }),
});

export const enrollmentTopicParamSchema = z.object({
    params: z.object({
        enrollmentId: z.string().uuid(),
        topicId: z.string().uuid(),
    }),
});

export const courseParamSchema = z.object({
    params: z.object({
        courseId: z.string().uuid("courseId must be a valid UUID."),
    }),
});