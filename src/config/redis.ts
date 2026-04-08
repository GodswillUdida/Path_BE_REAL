import Redis from "ioredis";
import dotenv from "dotenv";
import logger from "../utils/logger";

dotenv.config();

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 5,
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    if (times > 8) {
      logger.error(`Redis connection failed after ${times} retries`);
      return null; // stop retrying
    }
    const delay = Math.min(times * 150, 4000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  // Optional: connection timeout
  connectTimeout: 10000,
});

redis.on("connect", () => logger.info("✅ Connected to Redis"));
redis.on("ready", () => logger.info("🚀 Redis is ready"));
redis.on("error", (err) => logger.error("❌ Redis Error:", err.message));
redis.on("reconnecting", (ms: number) => logger.warn(`🔄 Redis reconnecting in ${ms}ms`));
redis.on("close", () => logger.warn("🔌 Redis connection closed"));

// 🔹 Set cache with optional expiration (default: 1 hour)
export const setCache = async (
  key: string,
  value: any,
  expirationInSeconds: number = 3600
): Promise<void> => {
  try {
    const data = JSON.stringify(value);
    if (expirationInSeconds) {
      await redis.set(key, data, "EX", expirationInSeconds);
    } else {
      await redis.set(key, data);
    }
  } catch (error) {
    logger.error("❌ Redis SET error:", error);
  }
};

// 🔹 Get cache safely
export const getCache = async <T = any>(key: string): Promise<T | null> => {
  try {
    const data = await redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch (error) {
    logger.error("❌ Redis GET error:", error);
    return null;
  }
};


export const deleteCache = async (key: string): Promise<void> => {
  try {
    const deleted = await redis.del(key);
    logger.info(
      `🗑 Deleted cache for key: ${key} (${deleted ? "Success" : "Not Found"})`
    );
  } catch (error) {
    logger.error("❌ Redis DEL error:", error);
  }
};

export const deleteCacheByPattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`🗑 Cleared ${keys.length} keys matching pattern: ${pattern}`);
    }
  } catch (error) {
    logger.error("❌ Redis pattern delete error:", error);
  }
};

process.on("SIGINT", async () => {
  logger.info("🔻 Closing Redis connection...");
  await redis.quit();
  logger.info("✅ Redis connection closed gracefully.");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("🔻 SIGTERM received. Closing Redis...");
  await redis.quit();
  process.exit(0);
});

export default redis;
