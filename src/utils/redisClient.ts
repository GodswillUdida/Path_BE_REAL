import dotenv from "dotenv";
import Redis from "ioredis";
import logger from "./logger";

dotenv.config();

// if (!process.env.REDIS_URL!) throw Error("Redis env missing");

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 5) return null;
    return Math.min(times * 50, 2000);
  },
});

redis.on("connect", () => logger.info("✅ Connected to Redis"));
redis.on("error", (err) => logger.error("❌ Redis Error:", err.message));

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
        console.error("❌ Redis SET error:", error);
    }
};

// 🔹 Get cache safely
export const getCache = async <T = any>(key: string): Promise<T | null> => {
    try {
        const data = await redis.get(key);
        return data ? (JSON.parse(data) as T) : null;
    } catch (error) {
        console.error("❌ Redis GET error:", error);
        return null;
    }
};

export const deleteCache = async (key: string): Promise<void> => {
    try {
        const deleted = await redis.del(key);
        console.log(
            `🗑 Deleted cache for key: ${key} (${deleted ? "Success" : "Not Found"})`
        );
    } catch (error) {
        console.error("❌ Redis DEL error:", error);
    }
};

process.on("SIGINT", async () => {
    console.log("🔻 Closing Redis connection...");
    await redis.quit();
    console.log("✅ Redis connection closed.");
    process.exit(0);
});

export default redis;