"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCache = exports.getCache = exports.setCache = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("./logger"));
dotenv_1.default.config();
// if (!process.env.REDIS_URL!) throw Error("Redis env missing");
const redis = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => {
        if (times > 5)
            return null;
        return Math.min(times * 50, 2000);
    },
});
redis.on("connect", () => logger_1.default.info("✅ Connected to Redis"));
redis.on("error", (err) => logger_1.default.error("❌ Redis Error:", err.message));
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
        console.error("❌ Redis SET error:", error);
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
        console.error("❌ Redis GET error:", error);
        return null;
    }
};
exports.getCache = getCache;
const deleteCache = async (key) => {
    try {
        const deleted = await redis.del(key);
        console.log(`🗑 Deleted cache for key: ${key} (${deleted ? "Success" : "Not Found"})`);
    }
    catch (error) {
        console.error("❌ Redis DEL error:", error);
    }
};
exports.deleteCache = deleteCache;
process.on("SIGINT", async () => {
    console.log("🔻 Closing Redis connection...");
    await redis.quit();
    console.log("✅ Redis connection closed.");
    process.exit(0);
});
exports.default = redis;
