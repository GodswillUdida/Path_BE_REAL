"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailQueue = void 0;
const bullmq_1 = require("bullmq");
const redisClient_1 = __importDefault(require("../utils/redisClient"));
exports.emailQueue = new bullmq_1.Queue("email-queue", {
    // connection: { url: process.env.REDIS_URL },
    connection: redisClient_1.default,
});
