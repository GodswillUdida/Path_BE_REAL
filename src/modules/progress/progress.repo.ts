import prisma from "@/lib/prisma";

export const ProgressRepo = {
  findEnrollmentById(enrollmentId: string) {
    return prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        userId: true,
        expiresAt: true,
        courseId: true,
      },
    });
  },

  topicExistsInCourse(topicId: string, courseId: string) {
    return prisma.topic.findFirst({
      where: {
        id: topicId,
        module: {
          courseId,
        },
      },
      select: { id: true, durationSeconds: true },
    });
  },

  upsertProgress(data: {
    enrollmentId: string;
    topicId: string;
    watchedSeconds?: number;
    completed: boolean;
  }) {
    return prisma.progress.upsert({
      where: {
        enrollmentId_topicId: {
          enrollmentId: data.enrollmentId,
          topicId: data.topicId,
        },
      },
      create: {
        ...data,
        watchedSeconds: data.watchedSeconds ?? 0,
        lastWatchedAt: new Date(),
      },
      update: {
        watchedSeconds: data.watchedSeconds,
        completed: data.completed,
        lastWatchedAt: new Date(),
      },
      include: {
        topic: {
          select: { id: true, title: true, durationSeconds: true },
        },
      },
    });
  },
};