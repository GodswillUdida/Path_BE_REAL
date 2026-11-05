/**
 * enrollment.progress.repo.ts
 * Queries for initializing a learner's starting progress. Moved here from
 * payment.queries.ts: progress rows belong to the enrollment domain, and
 * both purchases and admin grants need them. payment.queries.ts re-exports
 * these so existing imports keep working.
 */

import type { Prisma } from "@prisma/client";

// First LIVE module that has a LIVE topic, with stable ordering. (Previously
// a soft-deleted first module/topic became the learner's starting point.)
export async function findFirstTopicsForCourses(tx: Prisma.TransactionClient, courseIds: string[]) {
  return tx.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      modules: {
        where: { deletedAt: null, topics: { some: { deletedAt: null } } },
        take: 1,
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          topics: {
            where: { deletedAt: null },
            take: 1,
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: { id: true },
          },
        },
      },
    },
  });
}

export async function createProgressRows(
  tx: Prisma.TransactionClient,
  data: Prisma.ProgressCreateManyInput[],
): Promise<void> {
  if (data.length === 0) return;
  await tx.progress.createMany({ data, skipDuplicates: true });
}
