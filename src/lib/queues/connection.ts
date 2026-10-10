// src/lib/queues/connection.ts

import IORedis, { RedisOptions } from "ioredis";
import logger from "@/utils/logger";

export type RedisConnectionRole =
  | "producer"
  | "worker"
  | "health";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error(
    "CRITICAL: REDIS_URL environment variable is missing.",
  );
}

const validatedRedisUrl: string = redisUrl;

const BASE_OPTIONS: RedisOptions = {
  lazyConnect: false,
  enableReadyCheck: true,

  retryStrategy(times) {
    return Math.min(
      1000 * 2 ** Math.min(times - 1, 4),
      20_000,
    );
  },
};

function getRoleOptions(
  role: RedisConnectionRole,
): RedisOptions {
  switch (role) {
    case "worker":
      return {
        ...BASE_OPTIONS,

        // Required/recommended for long-running BullMQ workers.
        maxRetriesPerRequest: null,
      };

    case "producer":
      return {
        ...BASE_OPTIONS,

        // HTTP/API work must fail reasonably quickly
        // when Redis is unavailable.
        maxRetriesPerRequest: 3,

        // Prevent a Redis command from hanging indefinitely.
        commandTimeout: 5_000,
      };

    case "health":
      return {
        ...BASE_OPTIONS,

        maxRetriesPerRequest: 1,
        commandTimeout: 2_000,
        connectTimeout: 2_000,

        // Health checks should fail rather than sit in
        // ioredis's offline command queue.
        enableOfflineQueue: false,
      };
  }
}

export function createRedisConnection(
  role: RedisConnectionRole,
): IORedis {
  const connection = new IORedis(
    validatedRedisUrl,
    getRoleOptions(role),
  );

  connection.on("error", (error: Error) => {
    logger.error("[Redis] Connection error", {
      role,
      message: error.message,
      stack: error.stack,
    });
  });

  return connection;
}