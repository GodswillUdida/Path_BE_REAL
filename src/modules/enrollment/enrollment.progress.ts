/**
 * enrollment.progress.ts
 * Creates the starting Progress row for BRAND-NEW enrollments only (a
 * renewal must never reset an existing learner). Called from payment
 * fulfillment AND admin grants, so a granted learner gets a "current topic"
 * exactly like a paying one. Must run inside the enrollment's transaction.
 */

import type { Prisma } from "@prisma/client";
import logger from "../../utils/logger"; // ADJUST
import { createProgressRows, findFirstTopicsForCourses } from "./enrollment.progress.repo";

export async function initializeProgress(
  tx: Prisma.TransactionClient,
  enrollments: { id: string; courseId: string }[],
): Promise<void> {
  if (enrollments.length === 0) return;

  const courseIds = enrollments.map((e) => e.courseId);
  const courses = await findFirstTopicsForCourses(tx, courseIds);

  const firstTopicByCourse = new Map<string, string>();
  for (const c of courses) {
    const topicId = c.modules[0]?.topics[0]?.id;
    if (topicId) firstTopicByCourse.set(c.id, topicId);
  }

  const rows: Prisma.ProgressCreateManyInput[] = [];
  for (const e of enrollments) {
    const topicId = firstTopicByCourse.get(e.courseId);
    if (topicId) rows.push({ enrollmentId: e.id, topicId, completed: false });
  }

  if (rows.length === 0) {
    logger.warn("initializeProgress: no valid topics found", { courseIds });
    return;
  }
  await createProgressRows(tx, rows);
}
