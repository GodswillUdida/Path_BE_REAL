/**
 * course.cache.ts
 *
 * Typed Redis caching layer for the Course domain.
 *
 * Design decisions:
 *   - Keys are namespaced and versioned — a schema change bumps CACHE_VERSION
 *     and all old keys become orphans (auto-expired by Redis TTL)
 *   - All get/set/del operations are wrapped in try/catch — a Redis failure
 *     must NEVER take down the request; we degrade gracefully to the DB
 *   - TTLs are intentionally short for mutable data (course detail = 5 min)
 *     and longer for stable data (list = 2 min, analytics = 10 min)
 *   - Cache invalidation is explicit: call invalidateCourse() on any write
 */

import type { CourseDetail, CourseListItem } from "./course.repository";
import redis from "@/config/redis";
import type { ListCoursesQuery } from "./course.schema";
import logger from "@/utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "v1";
const NS            = `lms:course:${CACHE_VERSION}`;

const TTL = {
  DETAIL:    60 * 5,   // 5 minutes  — course content changes infrequently
  LIST:      60 * 2,   // 2 minutes  — list is slightly staleness-tolerant
  ANALYTICS: 60 * 10,  // 10 minutes — analytics are read-heavy, write-rare
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// KEY BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function detailKey(id: string)   { return `${NS}:detail:${id}`; }
function slugKey(slug: string)   { return `${NS}:slug:${slug}`; }
function analyticsKey(id: string){ return `${NS}:analytics:${id}`; }

function listKey(query: ListCoursesQuery): string {
  // Stable key from sorted query params — order-independent
  const parts = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v ?? ""}`)
    .join(":");
  return `${NS}:list:${parts}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNALS
// ─────────────────────────────────────────────────────────────────────────────

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn("cache.get failed — degrading to DB");
    return null;
  }
}

async function cacheSet<T>(key: string, value: T, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.warn("cache.set failed — continuing without cache");
  }
}

async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn("cache.del failed — stale cache may persist until TTL");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function getCachedCourseDetail(id: string): Promise<CourseDetail | null> {
  return cacheGet<CourseDetail>(detailKey(id));
}

export async function setCachedCourseDetail(course: CourseDetail): Promise<void> {
  // Cache under both id and slug — slug-based lookups are hot (public course pages)
  await Promise.all([
    cacheSet(detailKey(course.id),   course, TTL.DETAIL),
    cacheSet(slugKey(course.slug),   course, TTL.DETAIL),
  ]);
}

export async function getCachedCourseBySlug(slug: string): Promise<CourseDetail | null> {
  return cacheGet<CourseDetail>(slugKey(slug));
}

export async function getCachedCourseList(
  query: ListCoursesQuery,
): Promise<{ data: CourseListItem[]; total: number } | null> {
  return cacheGet(listKey(query));
}

export async function setCachedCourseList(
  query: ListCoursesQuery,
  value: { data: CourseListItem[]; total: number },
): Promise<void> {
  return cacheSet(listKey(query), value, TTL.LIST);
}

export type AnalyticsPayload = {
  courseId:         string;
  totalEnrollments: number;
  activePricings:   number;
  totalRevenue:     number;
};

export async function getCachedAnalytics(id: string): Promise<AnalyticsPayload | null> {
  return cacheGet<AnalyticsPayload>(analyticsKey(id));
}

export async function setCachedAnalytics(payload: AnalyticsPayload): Promise<void> {
  return cacheSet(analyticsKey(payload.courseId), payload, TTL.ANALYTICS);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVALIDATION
//
// Call on every write (create, update, delete).
// List cache is invalidated wholesale — we don't know which list pages
// this course appeared on, so we bust the entire list namespace via scan.
// In production, consider a tag-based cache (e.g. cache-manager with tags)
// to make this more surgical. For now, list TTL is short (2m) so
// over-invalidation has minimal impact.
// ─────────────────────────────────────────────────────────────────────────────

export async function invalidateCourse(id: string, slug: string): Promise<void> {
  const keysToDelete = [detailKey(id), slugKey(slug), analyticsKey(id)];

  // Scan and delete all list cache keys for this namespace
  try {
    const listPattern = `${NS}:list:*`;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", listPattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length) keysToDelete.push(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.warn("cache.invalidate scan failed — list cache may be stale");
  }

  await cacheDel(...keysToDelete);
}