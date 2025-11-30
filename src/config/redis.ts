import Redis from "ioredis";
import dotenv from "dotenv";
import logger from "validations/utils/logger";

dotenv.config();

const redis = new Redis(process.env.REDIS_URL! ?? "redis://127.0.0.1:6379", {
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 100, 3000);
  },
});

redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => console.error("❌ Redis Error:", err.message));

// 🔹 Set cache with optional expiration (default: 1 hour)
export const setCache = async (
  key: string,
  value: any,
  expiration?: number | null
): Promise<void> => {
  try {
    const data = JSON.stringify(value);
    if (expiration) {
      await redis.set(key, data, "EX", expiration);
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

process.on("SIGINT", async () => {
  logger.info("🔻 Closing Redis connection...");
  await redis.quit();
  logger.info("✅ Redis connection closed.");
  process.exit(0);
});

export default redis;
