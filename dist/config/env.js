"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('5000'),
    G_ID: zod_1.z.string(),
    G_SECRET: zod_1.z.string(),
    G_URL: zod_1.z.string(),
    G_REFRESH_TOKEN: zod_1.z.string(),
    EMAIL_USER: zod_1.z.string().email(),
    EMAIL_PASS: zod_1.z.string(),
    ADMIN_EMAIL: zod_1.z.string().email(),
    BASE_URL: zod_1.z.string().url(),
    RESEND_API_KEY: zod_1.z.string(),
    PAYSTACK_SECRET_KEY: zod_1.z.string(),
    JWT_SECRET: zod_1.z.string(),
    REDIS_HOST: zod_1.z.string(),
    REDIS_PORT: zod_1.z.string(),
    DATABASE_URL: zod_1.z.string(),
});
exports.env = envSchema.parse(process.env);
