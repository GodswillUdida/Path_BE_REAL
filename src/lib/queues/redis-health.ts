// src/lib/queues/redis-health.ts

import IORedis from "ioredis";
import { createRedisConnection } from "./connection";

let healthConnection: IORedis | null = null;

function getHealthConnection(): IORedis {
  if (!healthConnection) {
    healthConnection =
      createRedisConnection("health");
  }

  return healthConnection;
}

export async function redisHealthCheck(): Promise<void> {
  await getHealthConnection().ping();
}

export async function closeRedisHealthConnection(): Promise<void> {
  if (!healthConnection) {
    return;
  }

  const connection = healthConnection;
  healthConnection = null;

  if (connection.status !== "end") {
    await connection.quit();
  }
}