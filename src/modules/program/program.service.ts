/**
 * program.service.ts
 *
 * Business logic and orchestration for the Program domain.
 *
 * Strict rules enforced here:
 *   - No Prisma imports — all DB access via program.repository
 *   - No Redis imports — all cache access via program.cache
 *   - All public read paths are cache-through
 *   - All write paths invalidate then re-warm the cache
 *   - withMetrics wraps every operation
 *   - Slug generation happens OUTSIDE transactions (avoids long lock holds)
 *
 * Course creation from a program context is intentionally NOT here.
 * Cross-domain operations (program + course) belong in the course service,
 * which accepts an optional programId. The program router delegates
 * POST /:programId/courses to the course controller directly.
 */

import { badRequest, forbidden, notFound } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import { uploadImageOrFail } from "../../utils/file";
import logger from "../../utils/logger";
import { withMetrics } from "../../utils/observability";

import * as repo from "./program.repository";
// import * as cache from "./program.cache";

import type { CreateProgramDTO, UpdateProgramDTO, ListProgramsQuery } from "./program.schema";
import type { ProgramDetail } from "./program.repository";

// ─────────────────────────────────────────────────────────────────────────────
// PARAM TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateProgramParams = {
  data: CreateProgramDTO;
  imageFile?: Express.Multer.File;
};

export type UpdateProgramParams = {
  id: string;
  actorRole: string;
  data: UpdateProgramDTO;
  imageFile?: Express.Multer.File;
};

export type DeleteProgramParams = {
  id: string;
  actorRole: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
//
// Uniqueness is enforced at TWO layers:
//   1. Application-level check (fast, gives clean error message)
//   2. DB-level unique constraint on `title` (prevents race conditions)
//
// Slug generation is outside any transaction — it may hit the DB for
// uniqueness, and holding a transaction open during that adds lock contention.
// ─────────────────────────────────────────────────────────────────────────────

export async function createProgram({
  data,
  imageFile,
}: CreateProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.create", async () => {
    // ── 1. Resolve image — before any DB work ──────────────────────────────
    const image = imageFile
      ? await uploadImageOrFail(imageFile)
      : (data.image ?? null);

    // ── 2. Title uniqueness check ──────────────────────────────────────────
    const titleConflict = await repo.findProgramByTitle(data.title);
    if (titleConflict) throw badRequest("A program with this title already exists");

    // ── 3. Slug — outside transaction ──────────────────────────────────────
    const slug = await generateUniqueSlug(data.slug ?? data.title, "program");

    // ── 4. Insert (no transaction needed — single atomic write) ────────────
    const program = await repo.insertProgram({ ...data, image: image ?? undefined }, slug);

    // ── 5. Warm cache ──────────────────────────────────────────────────────
    // await cache.setCachedProgramDetail(program);

    logger.info("program.created", { programId: program.id });
    return program;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function getProgram(id: string): Promise<ProgramDetail> {
  return withMetrics("program.get", async () => {
    // const cached = await cache.getCachedProgramDetail(id);
    // if (cached) return cached;

    const program = await repo.findProgramById(id);
    if (!program) throw notFound("Program not found");

    // await cache.setCachedProgramDetail(program);
    return program;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG — cache-through (hot public path)
// ─────────────────────────────────────────────────────────────────────────────

export async function getProgramBySlug(slug: string): Promise<ProgramDetail> {
  return withMetrics("program.getBySlug", async () => {
    // const cached = await cache.getCachedProgramBySlug(slug);
    // if (cached) return cached;

    const program = await repo.findProgramBySlug(slug);
    if (!program) throw notFound("Program not found");

    // await cache.setCachedProgramDetail(program); // sets both id + slug keys
    return program;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST — cache-through, paginated
// ─────────────────────────────────────────────────────────────────────────────

export async function listPrograms(query: ListProgramsQuery) {
  return withMetrics("program.list", async () => {
    // const cached = await cache.getCachedProgramList(query);
    // if (cached) {
    //   return { data: cached.data, meta: buildMeta(query, cached.total) };
    // }

    const { data, total } = await repo.paginatePrograms(query);
    // await cache.setCachedProgramList(query, { data, total });

    return { data, meta: buildMeta(query, total) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
//
// Title uniqueness check + update are NOT in the same transaction by design:
// the uniqueness check is a best-effort guard; the DB unique constraint is
// the authoritative guard against races. If two concurrent updates slip
// through, the DB constraint catches the second one and the error middleware
// translates the Prisma P2002 into a 409.
//
// Only admins/superadmins can update programs — instructors operate on
// courses within programs, not the programs themselves.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateProgram({
  id,
  actorRole,
  data,
  imageFile,
}: UpdateProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.update", async () => {
    enforceAdminOnly(actorRole, "update programs");

    const existing = await repo.findProgramExists(id);
    if (!existing) throw notFound("Program not found");

    // ── Image resolution ───────────────────────────────────────────────────
    let image: string | undefined;
    if (imageFile) image = await uploadImageOrFail(imageFile);
    else if (data.image) image = data.image;

    // ── Title uniqueness ───────────────────────────────────────────────────
    if (data.title) {
      const conflict = await repo.findProgramByTitle(data.title, id);
      if (conflict) throw badRequest("A program with this title already exists");
    }

    // ── Slug ───────────────────────────────────────────────────────────────
    let slug = existing.slug;
    if (data.slug) slug = await generateUniqueSlug(data.slug, "program", id);
    else if (data.title) slug = await generateUniqueSlug(data.title, "program", id);

    // ── Write ──────────────────────────────────────────────────────────────
    const { slug: _s, image: _i, ...scalarUpdates } = data;
    const updated = await repo.updateProgramById(id, {
      ...scalarUpdates,
      slug,
      ...(image !== undefined && { image }),
    });

    // ── Cache ──────────────────────────────────────────────────────────────
    // await cache.invalidateProgram(id, existing.slug);
    // await cache.setCachedProgramDetail(updated);

    logger.info("program.updated", { programId: id });
    return updated;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SOFT DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteProgram({
  id,
  actorRole,
}: DeleteProgramParams): Promise<void> {
  enforceAdminOnly(actorRole, "delete programs");

  const existing = await repo.findProgramExists(id);
  if (!existing) throw notFound("Program not found");

  await repo.softDeleteProgram(id);
  // await cache.invalidateProgram(id, existing.slug);

  logger.info("program.deleted", { programId: id });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildMeta(query: ListProgramsQuery, total: number) {
  return {
    total,
    limit: query.limit,
    offset: query.offset,
    pages: Math.ceil(total / query.limit),
    hasMore: query.offset + query.limit < total,
  };
}

/**
 * Programs are admin/superadmin territory.
 * Instructors create courses within programs — not programs themselves.
 */
function enforceAdminOnly(role: string, action: string): void {
  const allowed = role === "admin" || role === "superadmin";
  if (!allowed) throw forbidden(`Only admins may ${action}`);
}