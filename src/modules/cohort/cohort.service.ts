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
