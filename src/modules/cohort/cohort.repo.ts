/**
 * cohort.repo.ts - Prisma access for the Cohort domain.
 * Services call these; no business rules beyond query shape.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { CohortMemberStatus, CohortStatus } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

export const cohortDetailSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  centre: true,
  status: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  createdById: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  courses: {
    select: {
      id: true,
      courseId: true,
      createdAt: true,
      course: { select: { id: true, title: true, slug: true, status: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  offers: {
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      includesCourseAccess: true,
      bonusDays: true,
      opensAt: true,
      closesAt: true,
      isActive: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
  instructors: {
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  },
  _count: {
    select: {
      members: {
        where: { status: { in: [CohortMemberStatus.ACTIVE, CohortMemberStatus.SUSPENDED] } },
      },
    },
  },
} satisfies Prisma.CohortSelect;

export type CohortDetail = Prisma.CohortGetPayload<{ select: typeof cohortDetailSelect }>;

export const memberSelect = {
  id: true,
  cohortId: true,
  userId: true,
  status: true,
  source: true,
  joinedAt: true,
  leftAt: true,
  expiresAt: true,
  orderItemId: true,
  chatMutedUntil: true,
  student: {
    select: {
      id: true,
      status: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.CohortMemberSelect;

export type MemberDetail = Prisma.CohortMemberGetPayload<{ select: typeof memberSelect }>;

export async function findCohortById(db: Db, id: string): Promise<CohortDetail | null> {
  return db.cohort.findFirst({ where: { id, deletedAt: null }, select: cohortDetailSelect });
}

export async function findCohortBySlug(db: Db, slug: string): Promise<CohortDetail | null> {
  return db.cohort.findFirst({ where: { slug, deletedAt: null }, select: cohortDetailSelect });
}

export async function findCohortRow(
  db: Db,
  id: string,
): Promise<{
  id: string;
  status: CohortStatus;
  endsAt: Date | null;
  capacity: number | null;
  deletedAt: Date | null;
  name: string;
} | null> {
  return db.cohort.findUnique({
    where: { id },
    select: { id: true, status: true, endsAt: true, capacity: true, deletedAt: true, name: true },
  });
}

export async function slugExists(db: Db, slug: string, excludeId?: string): Promise<boolean> {
  const row = await db.cohort.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return !!row;
}

export async function createCohort(
  tx: Tx,
  data: {
    name: string;
    slug: string;
    description?: string | null;
    centre?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    capacity?: number | null;
    createdById: string;
    status: CohortStatus;
  },
) {
  return tx.cohort.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      centre: data.centre ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      capacity: data.capacity ?? null,
      createdById: data.createdById,
      status: data.status,
    },
    select: cohortDetailSelect,
  });
}

export async function updateCohort(tx: Tx, id: string, data: Prisma.CohortUpdateInput) {
  return tx.cohort.update({ where: { id }, data, select: cohortDetailSelect });
}

export async function listCohorts(
  db: Db,
  q: {
    skip: number;
    take: number;
    status?: CohortStatus;
    search?: string;
    centre?: string;
    includeDeleted?: boolean;
  },
): Promise<{ rows: CohortDetail[]; total: number }> {
  const where: Prisma.CohortWhereInput = {};
  if (!q.includeDeleted) where.deletedAt = null;
  if (q.status) where.status = q.status;
  if (q.centre) where.centre = { contains: q.centre, mode: "insensitive" };
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { slug: { contains: q.search, mode: "insensitive" } },
      { description: { contains: q.search, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.cohort.findMany({
      where,
      select: cohortDetailSelect,
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      skip: q.skip,
      take: q.take,
    }),
    db.cohort.count({ where }),
  ]);
  return { rows, total };
}

export async function listDiscoverable(
  db: Db,
  q: { skip: number; take: number; centre?: string; now: Date },
): Promise<{ rows: CohortDetail[]; total: number }> {
  const where: Prisma.CohortWhereInput = {
    deletedAt: null,
    status: { in: [CohortStatus.UPCOMING, CohortStatus.ACTIVE] },
    offers: {
      some: {
        isActive: true,
        AND: [
          { OR: [{ opensAt: null }, { opensAt: { lte: q.now } }] },
          { OR: [{ closesAt: null }, { closesAt: { gte: q.now } }] },
        ],
      },
    },
  };
  if (q.centre) where.centre = { contains: q.centre, mode: "insensitive" };
  const [rows, total] = await Promise.all([
    db.cohort.findMany({
      where,
      select: cohortDetailSelect,
      orderBy: [{ startsAt: "asc" }, { name: "asc" }],
      skip: q.skip,
      take: q.take,
    }),
    db.cohort.count({ where }),
  ]);
  return { rows, total };
}

/** Members holding capacity (ACTIVE + SUSPENDED). */
export async function countActiveMembers(db: Db, cohortId: string): Promise<number> {
  return db.cohortMember.count({
    where: { cohortId, status: { in: [CohortMemberStatus.ACTIVE, CohortMemberStatus.SUSPENDED] } },
  });
}

export async function countActiveOnlyMembers(db: Db, cohortId: string): Promise<number> {
  return db.cohortMember.count({
    where: { cohortId, status: CohortMemberStatus.ACTIVE },
  });
}

export async function countPendingSeatHolds(db: Db, cohortId: string, now: Date): Promise<number> {
  return db.orderItem.count({
    where: {
      cohortOffer: { cohortId },
      order: { status: "PENDING", expiresAt: { gt: now } },
    },
  });
}

/** Paid seats without recorded financial resolution (not only ACTIVE). */
export async function countUnresolvedPaidMembers(db: Db, cohortId: string): Promise<number> {
  return db.cohortMember.count({
    where: {
      cohortId,
      source: "PURCHASE",
      orderItemId: { not: null },
      status: {
        in: [
          CohortMemberStatus.ACTIVE,
          CohortMemberStatus.SUSPENDED,
          CohortMemberStatus.EXPIRED,
          CohortMemberStatus.COMPLETED,
        ],
      },
    },
  });
}

export async function lockCohort(tx: Tx, cohortId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cohort:${cohortId}`}, 0))`;
}

export async function addCourse(
  tx: Tx,
  cohortId: string,
  courseId: string,
): Promise<{ id: string; cohortId: string; courseId: string }> {
  return tx.cohortCourse.create({
    data: { cohortId, courseId },
    select: { id: true, cohortId: true, courseId: true },
  });
}

export async function removeCourse(tx: Tx, cohortId: string, courseId: string): Promise<number> {
  const r = await tx.cohortCourse.deleteMany({ where: { cohortId, courseId } });
  return r.count;
}

export async function listCourses(db: Db, cohortId: string) {
  return db.cohortCourse.findMany({
    where: { cohortId },
    select: {
      id: true,
      courseId: true,
      createdAt: true,
      course: { select: { id: true, title: true, slug: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createOffer(
  tx: Tx,
  data: {
    cohortId: string;
    name: string;
    price: number;
    currency: string;
    includesCourseAccess: boolean;
    bonusDays: number;
    opensAt?: Date | null;
    closesAt?: Date | null;
    isActive: boolean;
    sortOrder: number;
  },
) {
  return tx.cohortOffer.create({
    data: {
      cohortId: data.cohortId,
      name: data.name,
      price: data.price,
      currency: data.currency,
      includesCourseAccess: data.includesCourseAccess,
      bonusDays: data.bonusDays,
      opensAt: data.opensAt ?? null,
      closesAt: data.closesAt ?? null,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    },
  });
}

export async function updateOffer(tx: Tx, id: string, data: Prisma.CohortOfferUpdateInput) {
  return tx.cohortOffer.update({ where: { id }, data });
}

export async function findOffer(db: Db, id: string) {
  return db.cohortOffer.findUnique({
    where: { id },
    include: { cohort: { select: { id: true, name: true, status: true, deletedAt: true } } },
  });
}

export async function listOffers(db: Db, cohortId: string) {
  return db.cohortOffer.findMany({
    where: { cohortId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function findMember(db: Db, cohortId: string, userId: string): Promise<MemberDetail | null> {
  return db.cohortMember.findUnique({
    where: { cohortId_userId: { cohortId, userId } },
    select: memberSelect,
  });
}

export async function findMemberById(db: Db, id: string): Promise<MemberDetail | null> {
  return db.cohortMember.findUnique({ where: { id }, select: memberSelect });
}

export async function listMembers(
  db: Db,
  cohortId: string,
  q: { skip: number; take: number; status?: CohortMemberStatus },
): Promise<{ rows: MemberDetail[]; total: number }> {
  const where: Prisma.CohortMemberWhereInput = { cohortId };
  if (q.status) where.status = q.status;
  const [rows, total] = await Promise.all([
    db.cohortMember.findMany({
      where,
      select: memberSelect,
      orderBy: { joinedAt: "desc" },
      skip: q.skip,
      take: q.take,
    }),
    db.cohortMember.count({ where }),
  ]);
  return { rows, total };
}

export async function upsertAdminMember(
  tx: Tx,
  data: { cohortId: string; userId: string; expiresAt: Date | null; existingId?: string },
): Promise<MemberDetail> {
  if (data.existingId) {
    return tx.cohortMember.update({
      where: { id: data.existingId },
      data: { status: CohortMemberStatus.ACTIVE, leftAt: null, expiresAt: data.expiresAt },
      select: memberSelect,
    });
  }
  return tx.cohortMember.create({
    data: {
      cohortId: data.cohortId,
      userId: data.userId,
      status: CohortMemberStatus.ACTIVE,
      source: "ADMIN",
      expiresAt: data.expiresAt,
    },
    select: memberSelect,
  });
}

export async function setMemberStatus(
  tx: Tx,
  id: string,
  status: CohortMemberStatus,
  extra: { leftAt?: Date | null; expiresAt?: Date | null } = {},
): Promise<MemberDetail> {
  return tx.cohortMember.update({
    where: { id },
    data: {
      status,
      ...(extra.leftAt !== undefined ? { leftAt: extra.leftAt } : {}),
      ...(extra.expiresAt !== undefined ? { expiresAt: extra.expiresAt } : {}),
    },
    select: memberSelect,
  });
}

export async function assignInstructor(tx: Tx, cohortId: string, userId: string) {
  return tx.cohortInstructor.create({
    data: { cohortId, userId },
    select: {
      id: true,
      cohortId: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function removeInstructor(tx: Tx, cohortId: string, userId: string): Promise<number> {
  const r = await tx.cohortInstructor.deleteMany({ where: { cohortId, userId } });
  return r.count;
}

export async function listInstructors(db: Db, cohortId: string) {
  return db.cohortInstructor.findMany({
    where: { cohortId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function writeAudit(
  tx: Tx,
  data: {
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.adminAuditLog.create({
    data: {
      adminId: data.adminId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      metadata: data.metadata ?? undefined,
    },
  });
}

export async function findActiveStudentProfile(db: Db, userId: string) {
  return db.studentProfile.findUnique({
    where: { userId },
    select: { id: true, status: true, userId: true },
  });
}

export async function findUserBasic(db: Db, userId: string) {
  return db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true, name: true, role: true },
  });
}

export async function findPublishedCourse(db: Db, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, deletedAt: null, status: "PUBLISHED" },
    select: { id: true, title: true, status: true },
  });
}

/** Paid order lines that still reference this offer (blocks destructive commercial edits). */
export async function countPaidOrderItemsForOffer(db: Db, offerId: string): Promise<number> {
  return db.orderItem.count({
    where: {
      cohortOfferId: offerId,
      order: { status: "PAID" },
    },
  });
}
