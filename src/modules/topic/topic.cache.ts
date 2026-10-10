/**
 * topic.cache.ts
 *
 * Redis caching layer for the Topic domain.
 *
 * Cached:
 * - listTopicsForModule()
 *
 * Deliberately NOT cached:
 * - generateSignedPlaybackUrl()
 *
 * Topic list cache is short-lived because video status can transition:
 * QUEUED -> PROCESSING -> READY / FAILED
 *
 * Explicit invalidation is performed after every write that can change
 * the result of listTopicsForModule().
 */

import redis from "@/config/redis";
import logger from "@/utils/logger";
import type { TopicWithAssets } from "./topic.repo";

const CACHE_VERSION = "v1";
const NS = `lms:topic:${CACHE_VERSION}`;

const TTL = {
  LIST: 120,
} as const;

function listKey(moduleId: string): string {
  return `${NS}:list:${moduleId}`;
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn("topic.cache.get failed — degrading to DB", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });

    return null;
  }
}

async function cacheSet<T>(
  key: string,
  value: T,
  ttl: number,
): Promise<void> {
  try {
    await redis.set(
      key,
      JSON.stringify(value),
      "EX",
      ttl,
    );
  } catch (err) {
    logger.warn(
      "topic.cache.set failed — continuing without cache",
      {
        key,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }
}

export async function getCachedTopicList(
  moduleId: string,
): Promise<TopicWithAssets[] | null> {
  return cacheGet<TopicWithAssets[]>(
    listKey(moduleId),
  );
}

export async function setCachedTopicList(
  moduleId: string,
  topics: TopicWithAssets[],
): Promise<void> {
  return cacheSet(
    listKey(moduleId),
    topics,
    TTL.LIST,
  );
}

export async function invalidateTopicList(
  moduleId: string,
): Promise<void> {
  try {
    await redis.del(listKey(moduleId));

    logger.debug("topic.cache invalidated", {
      moduleId,
    });
  } catch (err) {
    logger.warn(
      "topic.cache.invalidate failed — TTL will handle expiry",
      {
        moduleId,
        error:
          err instanceof Error
            ? err.message
            : String(err),
      },
    );
  }
}