/**
 * cohort.service.ts — Cohort domain rules.
 * Repositories + withTransaction; domain validation here.
 */

import { CohortMemberStatus, CohortStatus, Prisma } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "@/utils/errors";
import logger from "@/utils/logger";
import { withTransaction } from "@/utils/withTransaction";
import * as repo from "./cohort.repo";
import prisma from "@/lib/prisma";
import slugifyLib from "slugify";
import type {
  CreateCohortInput,
  CreateCohortOfferInput,
  GrantMemberInput,
  ListCohortsQuery,
  TransitionCohortInput,
  UpdateCohortInput,
  UpdateCohortOfferInput,
} from "./cohort.schema";

type Actor = { id: string; role: string };

const TRANSITIONS: Record<CohortStatus, CohortStatus[]> = {
  DRAFT: ["UPCOMING", "CANCELLED"],
  UPCOMING: ["DRAFT", "ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

function assertTransition(from: CohortStatus, to: CohortStatus): void {
  if (from === to) return;
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw badRequest(`Cannot transition cohort from ${from} to ${to}`, {
      code: "INVALID_STATUS_TRANSITION",
      from,
      to,
      allowed,
    });
  }
}

function toMoney(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

function capacitySummary(
  capacity: number | null,
  held: number,
  holds: number,
): {
  capacity: number | null;
  heldSeats: number;
  pendingHolds: number;
  available: number | null;
} {
  const used = held + holds;
  return {
    capacity,
    heldSeats: held,
    pendingHolds: holds,
    available: capacity === null ? null : Math.max(0, capacity - used),
  };
}

async function uniqueCohortSlug(base: string, excludeId?: string): Promise<string> {
  const baseSlug = slugifyLib(base, { lower: true, strict: true }) || "cohort";
  let slug = baseSlug;
  let n = 1;
  while (await repo.slugExists(prisma, slug, excludeId)) {
    slug = `${baseSlug}-${n++}`;
  }
  return slug;
}

export async function createCohortService(actor: Actor, input: CreateCohortInput) {
  const slug = input.slug ? input.slug : await uniqueCohortSlug(input.name);
  if (input.slug && (await repo.slugExists(prisma, slug))) {
    throw conflict("A cohort with this slug already exists", { code: "SLUG_TAKEN" });
  }
  return withTransaction(async (tx) => {
    const cohort = await repo.createCohort(tx, {
      name: input.name,
      slug,
      description: input.description,
      centre: input.centre,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      createdById: actor.id,
      status: CohortStatus.DRAFT,
    });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_CREATED",
      targetType: "Cohort",
      targetId: cohort.id,
      metadata: { slug: cohort.slug, name: cohort.name },
    });
    return cohort;
  });
}

export async function updateCohortService(actor: Actor, id: string, input: UpdateCohortInput) {
  const existing = await repo.findCohortRow(prisma, id);
  if (!existing || existing.deletedAt) throw notFound("Cohort not found");
  if (existing.status === "ARCHIVED" || existing.status === "CANCELLED") {
    throw badRequest("Cannot edit an archived or cancelled cohort", { code: "COHORT_IMMUTABLE" });
  }
  if (input.slug && (await repo.slugExists(prisma, input.slug, id))) {
    throw conflict("A cohort with this slug already exists", { code: "SLUG_TAKEN" });
  }
  return withTransaction(async (tx) => {
    const cohort = await repo.updateCohort(tx, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.centre !== undefined ? { centre: input.centre } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_UPDATED",
      targetType: "Cohort",
      targetId: id,
      metadata: { fields: Object.keys(input) },
    });
    return cohort;
  });
}

export async function getCohortService(id: string) {
  const cohort = await repo.findCohortById(prisma, id);
  if (!cohort) throw notFound("Cohort not found");
  const now = new Date();
  const [held, holds] = await Promise.all([
    repo.countActiveMembers(prisma, id),
    repo.countPendingSeatHolds(prisma, id, now),
  ]);
  return { ...cohort, seats: capacitySummary(cohort.capacity, held, holds) };
}

export async function getCohortBySlugService(slug: string) {
  const cohort = await repo.findCohortBySlug(prisma, slug);
  // Public discovery: only published lifecycle states.
  if (!cohort || !["UPCOMING", "ACTIVE"].includes(cohort.status)) {
    throw notFound("Cohort not found");
  }
  const now = new Date();
  const [held, holds] = await Promise.all([
    repo.countActiveMembers(prisma, cohort.id),
    repo.countPendingSeatHolds(prisma, cohort.id, now),
  ]);
  return { ...cohort, seats: capacitySummary(cohort.capacity, held, holds) };
}

export async function listCohortsService(query: ListCohortsQuery) {
  const { skip, take, page, limit } = paginate(query.page, query.limit);
  const { rows, total } = await repo.listCohorts(prisma, {
    skip,
    take,
    status: query.status,
    search: query.search,
    centre: query.centre,
    includeDeleted: query.includeDeleted,
  });
  return {
    data: rows,
    meta: { total, page, limit, pages: Math.ceil(total / limit), hasMore: skip + limit < total },
  };
}

export async function transitionCohortService(
  actor: Actor,
  id: string,
  input: TransitionCohortInput,
) {
  return withTransaction(async (tx) => {
    const row = await repo.findCohortRow(tx, id);
    if (!row || row.deletedAt) throw notFound("Cohort not found");
    assertTransition(row.status, input.status);
    if (input.status === "CANCELLED") {
      const unresolved = await repo.countUnresolvedPaidMembers(tx, id);
      if (unresolved > 0) {
        throw conflict(
          "Cannot cancel cohort while paid seats lack recorded financial resolution",
          { code: "UNRESOLVED_PAID_MEMBERS", count: unresolved },
        );
      }
    }
    const cohort = await repo.updateCohort(tx, id, { status: input.status });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_STATUS_CHANGED",
      targetType: "Cohort",
      targetId: id,
      metadata: { from: row.status, to: input.status, reason: input.reason ?? null },
    });
    logger.info("cohort.status_transition", { cohortId: id, from: row.status, to: input.status });
    return cohort;
  });
}

export async function archiveCohortService(actor: Actor, id: string, reason?: string) {
  return transitionCohortService(actor, id, { status: "ARCHIVED", reason });
}

export async function softDeleteCohortService(actor: Actor, id: string) {
  return withTransaction(async (tx) => {
    const row = await repo.findCohortRow(tx, id);
    if (!row || row.deletedAt) throw notFound("Cohort not found");
    if (row.status !== "ARCHIVED" && row.status !== "CANCELLED" && row.status !== "DRAFT") {
      throw badRequest("Only DRAFT, CANCELLED, or ARCHIVED cohorts can be soft-deleted", {
        code: "DELETE_NOT_ALLOWED",
      });
    }
    const cohort = await repo.updateCohort(tx, id, { deletedAt: new Date() });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_SOFT_DELETED",
      targetType: "Cohort",
      targetId: id,
    });
    return cohort;
  });
}

export async function getCapacityService(id: string) {
  const row = await repo.findCohortRow(prisma, id);
  if (!row || row.deletedAt) throw notFound("Cohort not found");
  const now = new Date();
  const [held, holds] = await Promise.all([
    repo.countActiveMembers(prisma, id),
    repo.countPendingSeatHolds(prisma, id, now),
  ]);
  return capacitySummary(row.capacity, held, holds);
}

export async function discoverCohortsService(query: {
  page: number;
  limit: number;
  centre?: string;
}) {
  const { skip, take, page, limit } = paginate(query.page, query.limit);
  const now = new Date();
  const { rows, total } = await repo.listDiscoverable(prisma, {
    skip,
    take,
    centre: query.centre,
    now,
  });
  const data = rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    centre: c.centre,
    status: c.status,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    capacity: c.capacity,
    offers: c.offers.filter((o) => {
      if (!o.isActive) return false;
      if (o.opensAt && o.opensAt > now) return false;
      if (o.closesAt && o.closesAt < now) return false;
      return true;
    }),
    courses: c.courses.map((cc) => ({
      courseId: cc.courseId,
      title: cc.course.title,
      slug: cc.course.slug,
    })),
  }));
  return {
    data,
    meta: { total, page, limit, pages: Math.ceil(total / limit), hasMore: skip + limit < total },
  };
}

export async function addCourseService(actor: Actor, cohortId: string, courseId: string) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  const course = await repo.findPublishedCourse(prisma, courseId);
  if (!course) throw notFound("Course not found");
  return withTransaction(async (tx) => {
    try {
      const row = await repo.addCourse(tx, cohortId, courseId);
      await repo.writeAudit(tx, {
        adminId: actor.id,
        action: "COHORT_COURSE_ADDED",
        targetType: "CohortCourse",
        targetId: row.id,
        metadata: { cohortId, courseId },
      });
      return row;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("Course is already assigned to this cohort", { code: "COURSE_ALREADY_ASSIGNED" });
      }
      throw err;
    }
  });
}

export async function removeCourseService(actor: Actor, cohortId: string, courseId: string) {
  return withTransaction(async (tx) => {
    const n = await repo.removeCourse(tx, cohortId, courseId);
    if (n === 0) throw notFound("Course association not found");
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_COURSE_REMOVED",
      targetType: "Cohort",
      targetId: cohortId,
      metadata: { courseId, note: "Enrollments preserved" },
    });
    return { removed: true };
  });
}

export async function listCoursesService(cohortId: string) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  return repo.listCourses(prisma, cohortId);
}

export async function createOfferService(
  actor: Actor,
  cohortId: string,
  input: CreateCohortOfferInput,
) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  if (cohort.status === "ARCHIVED" || cohort.status === "CANCELLED") {
    throw badRequest("Cannot add offers to an archived or cancelled cohort");
  }
  return withTransaction(async (tx) => {
    const offer = await repo.createOffer(tx, {
      cohortId,
      name: input.name,
      price: input.price,
      currency: input.currency,
      includesCourseAccess: input.includesCourseAccess,
      bonusDays: input.bonusDays,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_OFFER_CREATED",
      targetType: "CohortOffer",
      targetId: offer.id,
      metadata: { cohortId, price: String(input.price), currency: input.currency },
    });
    return offer;
  });
}

export async function updateOfferService(
  actor: Actor,
  offerId: string,
  input: UpdateCohortOfferInput,
) {
  const existing = await repo.findOffer(prisma, offerId);
  if (!existing || existing.cohort.deletedAt) throw notFound("Offer not found");
  return withTransaction(async (tx) => {
    const offer = await repo.updateOffer(tx, offerId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.price !== undefined ? { price: toMoney(input.price) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.includesCourseAccess !== undefined
        ? { includesCourseAccess: input.includesCourseAccess }
        : {}),
      ...(input.bonusDays !== undefined ? { bonusDays: input.bonusDays } : {}),
      ...(input.opensAt !== undefined ? { opensAt: input.opensAt } : {}),
      ...(input.closesAt !== undefined ? { closesAt: input.closesAt } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_OFFER_UPDATED",
      targetType: "CohortOffer",
      targetId: offerId,
      metadata: { fields: Object.keys(input) },
    });
    return offer;
  });
}

export async function setOfferActiveService(actor: Actor, offerId: string, isActive: boolean) {
  return updateOfferService(actor, offerId, { isActive });
}

export async function listOffersService(cohortId: string) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  return repo.listOffers(prisma, cohortId);
}

export async function getOfferService(offerId: string, opts: { publicView?: boolean } = {}) {
  const offer = await repo.findOffer(prisma, offerId);
  if (!offer || offer.cohort.deletedAt) throw notFound("Offer not found");
  if (opts.publicView) {
    const now = new Date();
    const cohortOk = ["UPCOMING", "ACTIVE"].includes(offer.cohort.status);
    const windowOk =
      offer.isActive &&
      (!offer.opensAt || offer.opensAt <= now) &&
      (!offer.closesAt || offer.closesAt >= now);
    if (!cohortOk || !windowOk) throw notFound("Offer not found");
  }
  return offer;
}

export async function grantMemberService(
  actor: Actor,
  cohortId: string,
  input: GrantMemberInput,
) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  if (["CANCELLED", "ARCHIVED"].includes(cohort.status)) {
    throw badRequest("Cannot grant membership on a cancelled or archived cohort");
  }
  const user = await repo.findUserBasic(prisma, input.userId);
  if (!user) throw notFound("User not found");
  const profile = await repo.findActiveStudentProfile(prisma, input.userId);
  if (!profile) {
    throw badRequest("User must have a StudentProfile before receiving a cohort seat", {
      code: "STUDENT_PROFILE_REQUIRED",
    });
  }
  if (profile.status !== "ACTIVE") {
    throw forbidden("Student profile is not ACTIVE", { code: "STUDENT_NOT_ACTIVE" });
  }
  const expiresAt = input.expiresAt === undefined ? cohort.endsAt : input.expiresAt;
  return withTransaction(async (tx) => {
    await repo.lockCohort(tx, cohortId);
    const existing = await repo.findMember(tx, cohortId, input.userId);
    if (existing?.status === "ACTIVE") {
      throw conflict("User is already an active member of this cohort", { code: "ALREADY_MEMBER" });
    }
    if (cohort.capacity !== null) {
      const taken = await repo.countActiveMembers(tx, cohortId);
      if (taken >= cohort.capacity) {
        throw conflict("Cohort is at capacity", { code: "COHORT_FULL" });
      }
    }
    const member = await repo.upsertAdminMember(tx, {
      cohortId,
      userId: input.userId,
      expiresAt,
      existingId: existing?.id,
    });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: existing ? "COHORT_MEMBER_REACTIVATED" : "COHORT_MEMBER_GRANTED",
      targetType: "CohortMember",
      targetId: member.id,
      metadata: {
        cohortId,
        userId: input.userId,
        expiresAt: expiresAt?.toISOString() ?? null,
        reason: input.reason,
        previousStatus: existing?.status ?? null,
        previousSource: existing?.source ?? null,
      },
    });
    return member;
  });
}

async function changeMemberStatus(
  actor: Actor,
  memberId: string,
  to: CohortMemberStatus,
  opts: { reason?: string; requireFrom?: CohortMemberStatus[] } = {},
) {
  return withTransaction(async (tx) => {
    const member = await repo.findMemberById(tx, memberId);
    if (!member) throw notFound("Membership not found");
    if (opts.requireFrom && !opts.requireFrom.includes(member.status)) {
      throw badRequest(`Cannot move membership from ${member.status} to ${to}`, {
        code: "INVALID_MEMBER_TRANSITION",
      });
    }
    const updated = await repo.setMemberStatus(tx, memberId, to, {
      leftAt:
        to === "REMOVED" || to === "COMPLETED"
          ? new Date()
          : to === "ACTIVE"
            ? null
            : undefined,
    });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: `COHORT_MEMBER_${to}`,
      targetType: "CohortMember",
      targetId: memberId,
      metadata: {
        from: member.status,
        to,
        reason: opts.reason ?? null,
        source: member.source,
        orderItemId: member.orderItemId,
      },
    });
    return updated;
  });
}

export async function suspendMemberService(actor: Actor, memberId: string, reason?: string) {
  return changeMemberStatus(actor, memberId, "SUSPENDED" as CohortMemberStatus, {
    reason,
    requireFrom: ["ACTIVE"],
  });
}

export async function removeMemberService(actor: Actor, memberId: string, reason?: string) {
  return changeMemberStatus(actor, memberId, "REMOVED", {
    reason,
    requireFrom: ["ACTIVE", "SUSPENDED" as CohortMemberStatus, "EXPIRED"],
  });
}

export async function reactivateMemberService(actor: Actor, memberId: string, reason?: string) {
  return withTransaction(async (tx) => {
    const member = await repo.findMemberById(tx, memberId);
    if (!member) throw notFound("Membership not found");
    if (!["SUSPENDED", "EXPIRED", "REMOVED"].includes(member.status)) {
      throw badRequest(`Cannot reactivate membership in status ${member.status}`);
    }
    const profile = await repo.findActiveStudentProfile(tx, member.userId);
    if (!profile || profile.status !== "ACTIVE") {
      throw forbidden("Student profile must be ACTIVE to reactivate membership");
    }
    await repo.lockCohort(tx, member.cohortId);
    const cohort = await repo.findCohortRow(tx, member.cohortId);
    if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
    if (cohort.capacity !== null) {
      const taken = await repo.countActiveMembers(tx, member.cohortId);
      if (taken >= cohort.capacity) throw conflict("Cohort is at capacity", { code: "COHORT_FULL" });
    }
    const updated = await repo.setMemberStatus(tx, memberId, "ACTIVE", { leftAt: null });
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_MEMBER_REACTIVATED",
      targetType: "CohortMember",
      targetId: memberId,
      metadata: {
        from: member.status,
        reason: reason ?? null,
        sourcePreserved: member.source,
        orderItemId: member.orderItemId,
      },
    });
    return updated;
  });
}

export async function completeMemberService(actor: Actor, memberId: string, reason?: string) {
  return changeMemberStatus(actor, memberId, "COMPLETED", {
    reason,
    requireFrom: ["ACTIVE", "EXPIRED"],
  });
}

export async function listMembersService(
  cohortId: string,
  query: { page: number; limit: number; status?: string },
) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  const { skip, take, page, limit } = paginate(query.page, query.limit);
  const status = query.status as CohortMemberStatus | undefined;
  const { rows, total } = await repo.listMembers(prisma, cohortId, {
    skip,
    take,
    status,
  });
  return {
    data: rows,
    meta: { total, page, limit, pages: Math.ceil(total / limit), hasMore: skip + limit < total },
  };
}

export async function getMemberService(memberId: string) {
  const member = await repo.findMemberById(prisma, memberId);
  if (!member) throw notFound("Membership not found");
  return member;
}

export async function assignInstructorService(actor: Actor, cohortId: string, userId: string) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  const user = await repo.findUserBasic(prisma, userId);
  if (!user) throw notFound("User not found");
  if (user.role !== "instructor" && user.role !== "admin" && user.role !== "superadmin") {
    throw badRequest("User must have instructor (or admin) role", { code: "INVALID_INSTRUCTOR_ROLE" });
  }
  return withTransaction(async (tx) => {
    try {
      const row = await repo.assignInstructor(tx, cohortId, userId);
      await repo.writeAudit(tx, {
        adminId: actor.id,
        action: "COHORT_INSTRUCTOR_ASSIGNED",
        targetType: "CohortInstructor",
        targetId: row.id,
        metadata: { cohortId, userId },
      });
      return row;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("Instructor already assigned", { code: "ALREADY_INSTRUCTOR" });
      }
      throw err;
    }
  });
}

export async function removeInstructorService(actor: Actor, cohortId: string, userId: string) {
  return withTransaction(async (tx) => {
    const n = await repo.removeInstructor(tx, cohortId, userId);
    if (n === 0) throw notFound("Instructor assignment not found");
    await repo.writeAudit(tx, {
      adminId: actor.id,
      action: "COHORT_INSTRUCTOR_REMOVED",
      targetType: "Cohort",
      targetId: cohortId,
      metadata: { userId },
    });
    return { removed: true };
  });
}

export async function listInstructorsService(cohortId: string) {
  const cohort = await repo.findCohortRow(prisma, cohortId);
  if (!cohort || cohort.deletedAt) throw notFound("Cohort not found");
  return repo.listInstructors(prisma, cohortId);
}
