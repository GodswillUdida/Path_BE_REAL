// services/progress.service.ts
import prisma from "@/lib/prisma";
import { assertEnrollmentOwnership, assertTopicInCourse } from "./progress.guard";
import { ProgressRepo } from "./progress.repo";

export interface UpsertProgressInput {
  enrollmentId: string;
  topicId: string;
  watchedSeconds?: number;
  completed?: boolean;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Upsert a progress record for one topic.
 * Auto-marks completed when watchedSeconds reaches 90% of topic duration.
 */
export const upsertProgress = async (input: UpsertProgressInput, userId: string) => {
  const { enrollmentId, topicId, watchedSeconds } = input;

  const enrollment = await assertEnrollmentOwnership(enrollmentId, userId);
  const topic = await assertTopicInCourse(topicId, enrollment.courseId);

  
//   const safeSeconds = Math.min(watchedSeconds!, topic.durationSeconds);

//   const percentage = safeSeconds / topic.durationSeconds!;

  const hasValidDuration = typeof topic.durationSeconds === "number" && topic.durationSeconds > 0;

  const autoCompleted =
    input.completed ??
    (hasValidDuration && !!watchedSeconds && watchedSeconds >= topic.durationSeconds! * 0.9);

  return ProgressRepo.upsertProgress({
    enrollmentId,
    topicId,
    watchedSeconds,
    completed: autoCompleted,
  });
};

/**
 * Explicitly mark a topic as complete (or incomplete).
 */
export const markTopicComplete = async (
  enrollmentId: string,
  topicId: string,
  userId: string,
  completed = true,
) => {
  const enrollment = await assertEnrollmentOwnership(enrollmentId, userId);
  await assertTopicInCourse(topicId, enrollment.courseId);

  return prisma.progress.upsert({
    where: { enrollmentId_topicId: { enrollmentId, topicId } },
    create: { enrollmentId, topicId, completed, lastWatchedAt: new Date() },
    update: { completed, lastWatchedAt: new Date() },
    include: { topic: { select: { id: true, title: true } } },
  });
};

/**
 * Get all progress records for a single enrollment.
 */
export const getProgressByEnrollment = async (enrollmentId: string, userId: string) => {
  await assertEnrollmentOwnership(enrollmentId, userId);

  const records = await prisma.progress.findMany({
    where: { enrollmentId },
    include: {
      topic: {
        select: { id: true, title: true, durationSeconds: true, videoStatus: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const totalTopics = records.length;
  const completedCount = records.filter((r) => r.completed).length;
  const percentage = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  return { records, completedCount, totalTopics, percentage };
};

/**
 * Get progress for a single topic within an enrollment.
 */
export const getSingleProgress = async (enrollmentId: string, topicId: string, userId: string) => {
  await assertEnrollmentOwnership(enrollmentId, userId);

  return prisma.progress.findUnique({
    where: { enrollmentId_topicId: { enrollmentId, topicId } },
    include: { topic: { select: { id: true, title: true, durationSeconds: true } } },
  });
};

/**
 * Reset (delete) all progress for an enrollment.
 */
export const resetEnrollmentProgress = async (enrollmentId: string, userId: string) => {
  await assertEnrollmentOwnership(enrollmentId, userId);
  const { count } = await prisma.progress.deleteMany({ where: { enrollmentId } });
  return { deletedCount: count };
};

export const getProgressSummary = async (userId: string) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: {
      progressRecords: true,
      course: { include: { modules: { include: { topics: true } } } },
    },
  });

  let totalCompleted = 0;
  let totalLessons = 0;
  let timeSpent = 0;

  for (const e of enrollments) {
    const lessons = e.course.modules.flatMap((m) => m.topics);
    totalLessons += lessons.length;
    totalCompleted += e.progressRecords.filter((p) => p.completed).length;
    timeSpent += e.progressRecords.reduce((sum, p) => sum + (p.watchedSeconds ?? 0), 0);
  }

  return {
    totalCompleted,
    totalLessons,
    timeSpentMinutes: Math.floor(timeSpent / 60),
    xp: totalCompleted * 10,
    streak: 0, // later from streak table
  };
};

/**
 * Admin: aggregated progress for all students on a given course.
 */
export const getCourseProgressAdmin = async (courseId: string) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    select: {
      id: true,
      user: true,
      progressRecords: { select: { completed: true, updatedAt: true } },
    },
  });

  const totalTopics = await prisma.topic.count({ where: { module: { courseId } } });

  return enrollments.map((e) => {
    const completedCount = e.progressRecords.filter((p) => p.completed).length;
    const percentage = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
    const lastActivity =
      e.progressRecords.map((p) => p.updatedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return { enrollmentId: e.id, user: e.user, totalTopics, completedCount, percentage, lastActivity };
  });
};