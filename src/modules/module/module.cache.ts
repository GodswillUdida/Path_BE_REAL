/**
 * module.cache.ts
 *
 * Redis caching layer for the Module domain, matching the Course/Program
 * convention: cache access lives here exclusively, never inline in the
 * service. The previous module.service.ts had dead, commented-out ad-hoc
 * redis.get/set calls directly in listModulesForCourse — that's the
 * pattern this file replaces.
 *
 * Scope: list caching only (per-course module lists, the hot read path —
 * course detail pages hit this on every load). No detail-by-id cache yet
 * because there is currently no single-module GET endpoint wired up (the
 * old controller had one commented out, calling a service function that
 * didn't exist). Add getCachedModuleDetail/setCachedModuleDetail here
 * later if that endpoint gets built — not adding it speculatively now.
 *
 * All operations degrade to the DB silently on Redis failure, same as
 * course.cache.ts / program.cache.ts.
 */

import redis from "@/config/redis";
import logger from "@/utils/logger";
import type { ListModulesQuery } from "./module.schema";
import type { ModuleWithTopics } from "./module.repo";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "v1";
const NS = `lms:module:${CACHE_VERSION}`;

// Short TTL — module lists change whenever an instructor edits curriculum
// (add/reorder/delete), and staleness here directly affects what a learner
// sees on a course page. 2 minutes matches course.cache.ts's LIST TTL.
const TTL = {
  LIST: 60 * 2,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// KEYS
// ─────────────────────────────────────────────────────────────────────────────

function listKey(courseId: string, query: ListModulesQuery): string {
  const stable = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v ?? ""}`)
    .join(":");
  return `${NS}:list:${courseId}:${stable}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNALS
// ─────────────────────────────────────────────────────────────────────────────

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn("module.cache.get failed — degrading to DB", { key, err });
    return null;
  }
}

async function cacheSet<T>(key: string, value: T, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.warn("module.cache.set failed — continuing without cache", { key, err });
  }
}

async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn("module.cache.del failed — stale entries will expire via TTL", { keys, err });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — LIST
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleListPayload = { data: ModuleWithTopics[]; total: number };

export async function getCachedModuleList(
  courseId: string,
  query: ListModulesQuery,
): Promise<ModuleListPayload | null> {
  return cacheGet<ModuleListPayload>(listKey(courseId, query));
}

export async function setCachedModuleList(
  courseId: string,
  query: ListModulesQuery,
  payload: ModuleListPayload,
): Promise<void> {
  return cacheSet(listKey(courseId, query), payload, TTL.LIST);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVALIDATION
//
// Called on every write (create, update, delete, reorder). Scoped to the
// single courseId whose module list changed — cheaper than the SCAN-based
// wholesale invalidation Course/Program use for their lists, because
// module lists are already partitioned by courseId in the key itself, so
// a plain MATCH on that prefix is precise rather than a blunt full-namespace
// bust.
// ─────────────────────────────────────────────────────────────────────────────

export async function invalidateModuleList(courseId: string): Promise<void> {
  try {
    const pattern = `${NS}:list:${courseId}:*`;
    const toDelete: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length) toDelete.push(...keys);
    } while (cursor !== "0");
    await cacheDel(...toDelete);
  } catch (err) {
    logger.warn("module.cache.invalidate scan failed — list TTL will handle expiry", {
      courseId,
      err,
    });
  }
}