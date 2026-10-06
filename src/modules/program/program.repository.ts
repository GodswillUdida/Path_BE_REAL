import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";

import type {
  CreateProgramDTO,
  UpdateProgramDTO,
  ListProgramsQuery,
} from "./program.schema";

// ─────────────────────────────────────────────────────────────────────────────
// SELECTS
// ─────────────────────────────────────────────────────────────────────────────

export const PROGRAM_SUMMARY_SELECT = {
  id: true,
  title: true,
  description: true,
  slug: true,
  image: true,
  status: true,
  createdAt: true,
  _count: {
    select: {
      courses: true,
    },
  },
} satisfies Prisma.ProgramSelect;

export const PROGRAM_DETAIL_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  image: true,
  status: true,
  createdAt: true,
  updatedAt: true,

  courses: {
    where: {
      course: {
        deletedAt: null,
      },
    },

    orderBy: {
      position: "asc" as const,
    },

    take: 20,

    select: {
      position: true,

      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          thumbnail: true,
          level: true,
          status: true,
          totalDurationSeconds: true,

          pricings: {
            where: {
              isActive: true,
            },

            orderBy: {
              sortOrder: "asc" as const,
            },

            take: 1,

            select: {
              id: true,
              name: true,
              price: true,
              currency: true,
              isFree: true,
              accessDurationDays: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProgramSelect;

export type ProgramSummary =
  Prisma.ProgramGetPayload<{
    select: typeof PROGRAM_SUMMARY_SELECT;
  }>;

export type ProgramDetail =
  Prisma.ProgramGetPayload<{
    select: typeof PROGRAM_DETAIL_SELECT;
  }>;

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function findProgramById(
  id: string,
): Promise<ProgramDetail | null> {
  return prisma.program.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function findProgramBySlug(
  slug: string,
): Promise<ProgramDetail | null> {
  return prisma.program.findFirst({
    where: {
      slug,
      deletedAt: null,
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function findProgramExists(
  id: string,
): Promise<{
  id: string;
  title: string;
  slug: string;
} | null> {
  return prisma.program.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });
}

export async function findDeletedProgramById(
  id: string,
): Promise<{
  id: string;
  title: string;
  slug: string;
} | null> {
  return prisma.program.findFirst({
    where: {
      id,
      deletedAt: {
        not: null,
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });
}

export async function findProgramByTitle(
  title: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.program.findFirst({
    where: {
      title,
      deletedAt: null,
      ...(excludeId
        ? {
            NOT: {
              id: excludeId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });
}

export async function findActiveProgramByTitle(
  title: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return findProgramByTitle(
    title,
    excludeId,
  );
}

export async function findActiveProgramBySlug(
  slug: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.program.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(excludeId
        ? {
            NOT: {
              id: excludeId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export async function paginatePrograms(
  query: ListProgramsQuery,
): Promise<{
  data: ProgramSummary[];
  total: number;
}> {
  const where: Prisma.ProgramWhereInput = {
    deletedAt: null,

    ...(query.status
      ? {
          status: query.status,
        }
      : {}),

    ...(query.q
      ? {
          OR: [
            {
              title: {
                contains: query.q,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: query.q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [
    total,
    data,
  ] = await prisma.$transaction([
    prisma.program.count({
      where,
    }),

    prisma.program.findMany({
      where,
      skip: query.offset,
      take: query.limit,
      select: PROGRAM_SUMMARY_SELECT,

      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
    }),
  ]);

  return {
    data,
    total,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function insertProgram(
  data: CreateProgramDTO,
  slug: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<ProgramDetail> {
  return tx.program.create({
    data: {
      title: data.title,
      description: data.description,
      slug,
      image: data.image ?? null,
      status: data.status,
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateProgramById(
  id: string,
  data: Omit<
    Prisma.ProgramUpdateInput,
    "deletedAt"
  >,
  tx: Prisma.TransactionClient = prisma,
): Promise<ProgramDetail> {
  return tx.program.update({
    where: {
      id,
    },
    data,
    select: PROGRAM_DETAIL_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function publishProgram(
  id: string,
): Promise<ProgramDetail> {
  return prisma.program.update({
    where: {
      id,
    },
    data: {
      status: "PUBLISHED",
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function archiveProgram(
  id: string,
): Promise<ProgramDetail> {
  return prisma.program.update({
    where: {
      id,
    },
    data: {
      status: "ARCHIVED",
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE / RESTORE
// ─────────────────────────────────────────────────────────────────────────────

export async function softDeleteProgram(
  id: string,
): Promise<void> {
  await prisma.program.update({
    where: {
      id,
    },
    data: {
      deletedAt: new Date(),
    },
  });
}

export async function restoreProgram(
  id: string,
): Promise<ProgramDetail> {
  return prisma.program.update({
    where: {
      id,
    },
    data: {
      deletedAt: null,
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM COURSE MEMBERSHIP
// ─────────────────────────────────────────────────────────────────────────────

export async function findProgramCourse(
  programId: string,
  courseId: string,
): Promise<{
  programId: string;
  courseId: string;
  position: number;
} | null> {
  return prisma.programCourse.findUnique({
    where: {
      programId_courseId: {
        programId,
        courseId,
      },
    },
    select: {
      programId: true,
      courseId: true,
      position: true,
    },
  });
}

export async function getNextProgramCoursePosition(
  programId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const aggregate =
    await tx.programCourse.aggregate({
      where: {
        programId,
      },
      _max: {
        position: true,
      },
    });

  return aggregate._max.position === null
    ? 0
    : aggregate._max.position + 1;
}

export async function attachCourseToProgram(
  programId: string,
  courseId: string,
  position: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.programCourse.create({
    data: {
      programId,
      courseId,
      position,
    },
  });
}

export async function detachCourseFromProgram(
  programId: string,
  courseId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.programCourse.delete({
    where: {
      programId_courseId: {
        programId,
        courseId,
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REORDER
//
// Requires:
// @@unique([programId, position])
//
// The target is moved to -1 first so its original position is free.
// Then affected rows are shifted in a safe order.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reorders a course position within a program securely.
 * Hardened against concurrent deadlocks using top-level pessimistic container locks
 * and single-step atomic shifting operations.
 */
export async function reorderProgramCourse(
  programId: string,
  courseId: string,
  requestedPosition: number,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // 1. CRITICAL: Acquire a shared pessimistic gate lock on the parent container.
      // This forces all subsequent concurrent updates for THIS program to line up 
      // sequentially, preventing interleaved locking states entirely.
      await tx.$executeRaw`
        SELECT id FROM "Program" WHERE id = ${programId} FOR UPDATE
      `;

      const target = await tx.programCourse.findUnique({
        where: {
          programId_courseId: { programId, courseId },
        },
        select: { position: true },
      });

      if (!target) {
        throw new Error("Course is not assigned to this program");
      }

      const count = await tx.programCourse.count({
        where: { programId },
      });

      if (count <= 1) return;

      const maxPosition = count - 1;
      const newPosition = Math.min(Math.max(requestedPosition, 0), maxPosition);

      if (target.position === newPosition) return;

      const oldPosition = target.position;

      // 2. Temporarily park the moving target outside the unique constraint index window
      await tx.programCourse.update({
        where: {
          programId_courseId: { programId, courseId },
        },
        data: { position: -1 },
      });

      // 3. 2026 Optimization Standard: Execute atomic set-based block updates 
      // instead of risky, iterative row-by-row loops.
      if (newPosition < oldPosition) {
        // Moving Upward (e.g., 3 -> 1): Shift intermediate rows downwards (+1)
        await tx.programCourse.updateMany({
          where: {
            programId,
            position: {
              gte: newPosition,
              lt: oldPosition,
            },
          },
          data: {
            position: { increment: 1 },
          },
        });
      } else {
        // Moving Downward (e.g., 1 -> 3): Shift intermediate rows upwards (-1)
        await tx.programCourse.updateMany({
          where: {
            programId,
            position: {
              gt: oldPosition,
              lte: newPosition,
            },
          },
          data: {
            position: { decrement: 1 },
          },
        });
      }

      // 4. Place the target securely into its newly cleared position slot
      await tx.programCourse.update({
        where: {
          programId_courseId: { programId, courseId },
        },
        data: { position: newPosition },
      });
    },
    {
      // 5. Short, aggressive timeout window to release rows quickly if the database is under load
      timeout: 10000, 
    }
  );
}


// export async function reorderProgramCourse(
//   programId: string,
//   courseId: string,
//   requestedPosition: number,
// ): Promise<void> {
//   await prisma.$transaction(
//     async (tx) => {
//       const target =
//         await tx.programCourse.findUnique({
//           where: {
//             programId_courseId: {
//               programId,
//               courseId,
//             },
//           },
//           select: {
//             position: true,
//           },
//         });

//       if (!target) {
//         throw new Error(
//           "Course is not assigned to this program",
//         );
//       }

//       const count =
//         await tx.programCourse.count({
//           where: {
//             programId,
//           },
//         });

//       if (count <= 1) {
//         return;
//       }

//       const maxPosition = count - 1;

//       const newPosition = Math.min(
//         Math.max(
//           requestedPosition,
//           0,
//         ),
//         maxPosition,
//       );

//       if (
//         target.position ===
//         newPosition
//       ) {
//         return;
//       }

//       // Free the target's original unique position.
//       await tx.programCourse.update({
//         where: {
//           programId_courseId: {
//             programId,
//             courseId,
//           },
//         },
//         data: {
//           position: -1,
//         },
//       });

//       if (
//         newPosition <
//         target.position
//       ) {
//         // Moving upward:
//         // 3 -> 1
//         // 2 -> 3
//         // 1 -> 2
//         const affected =
//           await tx.programCourse.findMany({
//             where: {
//               programId,
//               position: {
//                 gte: newPosition,
//                 lt: target.position,
//               },
//             },
//             orderBy: {
//               position: "desc",
//             },
//             select: {
//               programId: true,
//               courseId: true,
//               position: true,
//             },
//           });

//         for (const item of affected) {
//           await tx.programCourse.update({
//             where: {
//               programId_courseId: {
//                 programId: item.programId,
//                 courseId: item.courseId,
//               },
//             },
//             data: {
//               position:
//                 item.position + 1,
//             },
//           });
//         }
//       } else {
//         // Moving downward:
//         // 1 -> 3
//         // 2 -> 1
//         // 3 -> 2
//         const affected =
//           await tx.programCourse.findMany({
//             where: {
//               programId,
//               position: {
//                 gt: target.position,
//                 lte: newPosition,
//               },
//             },
//             orderBy: {
//               position: "asc",
//             },
//             select: {
//               programId: true,
//               courseId: true,
//               position: true,
//             },
//           });

//         for (const item of affected) {
//           await tx.programCourse.update({
//             where: {
//               programId_courseId: {
//                 programId: item.programId,
//                 courseId: item.courseId,
//               },
//             },
//             data: {
//               position:
//                 item.position - 1,
//             },
//           });
//         }
//       }

//       await tx.programCourse.update({
//         where: {
//           programId_courseId: {
//             programId,
//             courseId,
//           },
//         },
//         data: {
//           position: newPosition,
//         },
//       });
//     },
//   );
// }