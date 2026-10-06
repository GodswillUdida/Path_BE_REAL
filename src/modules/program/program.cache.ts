/**
 * Redis caching boundary for Program.
 *
 * Redis is never authoritative.
 * Every Redis failure degrades to the database path.
 */

import redis from "../../config/redis";
import logger from "../../utils/logger";

import type { ListProgramsQuery } from "./program.schema";

import type { ProgramDetail, ProgramSummary } from "./program.repository";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "v1";
const NS = `lms:program:${CACHE_VERSION}`;

const TTL = {
  DETAIL: 60 * 10,
  LIST: 60 * 3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// KEYS
// ─────────────────────────────────────────────────────────────────────────────

const detailKey = (id: string) => `${NS}:detail:${id}`;

const slugKey = (slug: string) => `${NS}:slug:${encodeURIComponent(slug)}`;

const listKey = (query: ListProgramsQuery) => {
  const stable = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ""))}`,
    )
    .join("&");

  return `${NS}:list:${stable}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn("program.cache.parse.failed", { key, err });

      try {
        await redis.del(key);
      } catch {
        // Best effort only.
      }

      return null;
    }
  } catch (err) {
    logger.warn("program.cache.get.failed", { key, err });

    return null;
  }
}

async function cacheSet<T>(key: string, value: T, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.warn("program.cache.set.failed", { key, err });
  }
}

async function cacheDelete(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn("program.cache.delete.failed", {
      keyCount: keys.length,
      err,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL
// ─────────────────────────────────────────────────────────────────────────────

export async function getCachedProgramDetail(
  id: string,
): Promise<ProgramDetail | null> {
  return cacheGet<ProgramDetail>(detailKey(id));
}

export async function getCachedProgramBySlug(
  slug: string,
): Promise<ProgramDetail | null> {
  return cacheGet<ProgramDetail>(slugKey(slug));
}

export async function setCachedProgram(program: ProgramDetail): Promise<void> {
  await Promise.all([
    cacheSet(detailKey(program.id), program, TTL.DETAIL),
    cacheSet(slugKey(program.slug), program, TTL.DETAIL),
  ]);
}

// Backward-compatible alias.
export const setCachedProgramDetail = setCachedProgram;

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export type ProgramListPayload = {
  data: ProgramSummary[];
  total: number;
};

export async function getCachedProgramList(
  query: ListProgramsQuery,
): Promise<ProgramListPayload | null> {
  return cacheGet<ProgramListPayload>(listKey(query));
}

export async function setCachedProgramList(
  query: ListProgramsQuery,
  payload: ProgramListPayload,
): Promise<void> {
  await cacheSet(listKey(query), payload, TTL.LIST);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST INVALIDATION
// ─────────────────────────────────────────────────────────────────────────────

async function invalidateProgramLists(): Promise<void> {
  try {
    const pattern = `${NS}:list:*`;

    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await cacheDelete(keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    logger.warn("program.cache.list.invalidate.failed", { err });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM INVALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export async function invalidateProgram(
  id: string,
  previousSlug?: string,
  currentSlug?: string,
): Promise<void> {
  const keys = [detailKey(id)];

  if (previousSlug) {
    keys.push(slugKey(previousSlug));
  }

  if (currentSlug && currentSlug !== previousSlug) {
    keys.push(slugKey(currentSlug));
  }

  await cacheDelete(keys);

  await invalidateProgramLists();
}

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY / VERSION INVALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export async function invalidateAllProgramCaches(): Promise<void> {
  try {
    const pattern = `${NS}:*`;

    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await cacheDelete(keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    logger.warn("program.cache.invalidateAll.failed", { err });
  }
}
