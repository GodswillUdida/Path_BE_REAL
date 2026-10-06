import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('5000'),
    G_ID: z.string(),
    G_SECRET: z.string(),
    G_URL: z.string(),
    G_REFRESH_TOKEN: z.string(),
    EMAIL_USER: z.string().email(),
    EMAIL_PASS: z.string(),
    ADMIN_EMAIL: z.string().email(),
    BASE_URL: z.string().url(),
    RESEND_API_KEY: z.string(),
    PAYSTACK_SECRET_KEY: z.string(),
    JWT_SECRET: z.string(),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.string(),
    DATABASE_URL: z.string(),
});

export const env = envSchema.parse(process.env);