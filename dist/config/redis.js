"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCache = exports.getCache = exports.setCache = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = __importDefault(require("../utils/logger"));
dotenv_1.default.config();
const redis = new ioredis_1.default(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    retryStrategy: (times) => {
        if (times > 10)
            return null;
        return Math.min(times * 100, 3000);
    },
});
redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => console.error("❌ Redis Error:", err.message));
// 🔹 Set cache with optional expiration (default: 1 hour)
const setCache = async (key, value, expiration) => {
    try {
        const data = JSON.stringify(value);
        if (expiration) {
            await redis.set(key, data, "EX", expiration);
        }
        else {
            await redis.set(key, data);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Redis SET error:", error);
    }
};
exports.setCache = setCache;
// 🔹 Get cache safely
const getCache = async (key) => {
    try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }
    catch (error) {
        logger_1.default.error("❌ Redis GET error:", error);
        return null;
    }
};
exports.getCache = getCache;
const deleteCache = async (key) => {
    try {
        const deleted = await redis.del(key);
        logger_1.default.info(`🗑 Deleted cache for key: ${key} (${deleted ? "Success" : "Not Found"})`);
    }
    catch (error) {
        logger_1.default.error("❌ Redis DEL error:", error);
    }
};
exports.deleteCache = deleteCache;
process.on("SIGINT", async () => {
    logger_1.default.info("🔻 Closing Redis connection...");
    await redis.quit();
    logger_1.default.info("✅ Redis connection closed.");
    process.exit(0);
});
exports.default = redis;
