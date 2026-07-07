// /**
//  * program.cache.ts
//  *
//  * Redis caching layer for the Program domain.
//  *
//  * TTL decisions:
//  *   DETAIL  — 10 min: program metadata changes rarely (title, description, image)
//  *   LIST    — 3 min:  list pages can tolerate slight staleness
//  *
//  * All operations are wrapped in try/catch.
//  * A Redis failure NEVER propagates to the caller — we degrade to DB silently.
//  *
//  * Invalidation is explicit — called from the service on every write.
//  * List keys are busted via SCAN since we don't know which pages
//  * a given program appeared on.
//  */

// import logger from "@/utils/logger";
// import { ListProgramsQuery } from "./program.schema";
// import { ProgramDetail, ProgramSummary } from "./program.repository";
// import redis from "@/config/redis";

// // ─────────────────────────────────────────────────────────────────────────────
// // CONFIG
// // ─────────────────────────────────────────────────────────────────────────────

// const CACHE_VERSION = "v1";
// const NS = `lms:program:${CACHE_VERSION}`;

// const TTL = {
//     DETAIL: 60 * 10, // 10 minutes
//     LIST: 60 * 3,  // 3 minutes
// } as const;

// // ─────────────────────────────────────────────────────────────────────────────
// // KEY BUILDERS
// // ─────────────────────────────────────────────────────────────────────────────

// const detailKey = (id: string) => `${NS}:detail:${id}`;
// const slugKey = (slug: string) => `${NS}:slug:${slug}`;

// function listKey(query: ListProgramsQuery): string {
//     const stable = Object.entries(query)
//         .sort(([a], [b]) => a.localeCompare(b))
//         .map(([k, v]) => `${k}=${v ?? ""}`)
//         .join(":");
//     return `${NS}:list:${stable}`;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // INTERNALS
// // ─────────────────────────────────────────────────────────────────────────────

// async function cacheGet<T>(key: string): Promise<T | null> {
//     try {
//         const raw = await redis.get(key);
//         return raw ? (JSON.parse(raw) as T) : null;
//     } catch (err) {
//         logger.warn("program.cache.get failed — degrading to DB", { key, err });
//         return null;
//     }
// }

// async function cacheSet<T>(key: string, value: T, ttl: number): Promise<void> {
//     try {
//         await redis.set(key, JSON.stringify(value), "EX", ttl);
//     } catch (err) {
//         logger.warn("program.cache.set failed — continuing without cache", { key, err });
//     }
// }

// async function cacheDel(...keys: string[]): Promise<void> {
//     try {
//         if (keys.length) await redis.del(...keys);
//     } catch (err) {
//         logger.warn("program.cache.del failed — stale entries will expire via TTL", { keys, err });
//     }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // PUBLIC API — DETAIL
// // ─────────────────────────────────────────────────────────────────────────────

// export async function getCachedProgramDetail(id: string): Promise<ProgramDetail | null> {
//     return cacheGet<ProgramDetail>(detailKey(id));
// }

// export async function getCachedProgramBySlug(slug: string): Promise<ProgramDetail | null> {
//     return cacheGet<ProgramDetail>(slugKey(slug));
// }

// /** Write-through: cache under both id and slug keys simultaneously. */
// export async function setCachedProgramDetail(program: ProgramDetail): Promise<void> {
//     await Promise.all([
//         cacheSet(detailKey(program.id), program, TTL.DETAIL),
//         cacheSet(slugKey(program.slug), program, TTL.DETAIL),
//     ]);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // PUBLIC API — LIST
// // ─────────────────────────────────────────────────────────────────────────────

// export type ProgramListPayload = { data: ProgramSummary[]; total: number };

// export async function getCachedProgramList(
//     query: ListProgramsQuery,
// ): Promise<ProgramListPayload | null> {
//     return cacheGet<ProgramListPayload>(listKey(query));
// }

// export async function setCachedProgramList(
//     query: ListProgramsQuery,
//     payload: ProgramListPayload,
// ): Promise<void> {
//     return cacheSet(listKey(query), payload, TTL.LIST);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // INVALIDATION
// //
// // Called on every write (create, update, delete).
// // Busts detail keys (id + slug) and all list cache pages via SCAN.
// // ─────────────────────────────────────────────────────────────────────────────

// export async function invalidateProgram(id: string, slug: string): Promise<void> {
//     const toDelete = [detailKey(id), slugKey(slug)];

//     try {
//         const pattern = `${NS}:list:*`;
//         let cursor = "0";
//         do {
//             const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
//             cursor = next;
//             if (keys.length) toDelete.push(...keys);
//         } while (cursor !== "0");
//     } catch (err) {
//         logger.warn("program.cache.invalidate scan failed — list TTL will handle expiry", { err });
//     }

//     await cacheDel(...toDelete);
// }