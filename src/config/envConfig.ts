import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// 1. Define the complete schema matching every active key in your .env
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),

    // Core URLs & Access Control
    ADMIN_EMAIL: z.email(),
    EMAIL_USER: z.email(),
    EMAIL_PASS: z.string().optional().default(''),
    FRONTEND_URL: z.url(),
    BASE_URL: z.url(),
    BACKEND_URL: z.url(),
    ACCESS_COOKIE_NAME: z.string().default('access_token'),
    REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
    COOKIE_SECRET: z.string().default('your_cookie_secret'),

    // Bunny Stream
    BUNNY_STREAM_API_KEY: z.string().min(1),
    BUNNY_STREAM_LIBRARY_ID: z.coerce.number(),
    BUNNY_STREAM_SIGNING_KEY: z.string().min(1),
    BUNNY_STREAM_READONLY_API_KEY: z.string().min(1),

    // Bunny Storage
    BUNNY_STORAGE_PASSWORD: z.string().min(1),
    BUNNY_STORAGE_REGION_HOST: z.string().default('://bunnycdn.com'),
    BUNNY_STORAGE_ZONE_NAME: z.string().min(1),
    BUNNY_STORAGE_PULL_ZONE_HOST: z.string().min(1),

    // Cloudinary
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),

    // Queue Board & Upload System
    QUEUE_BOARD_USER: z.string().default('admin'),
    QUEUE_BOARD_PASSWORD: z.string().default('admin'),
    QUEUE_BOARD_PORT: z.coerce.number().default(3001),
    UPLOAD_TMP_DIR: z.string().default('/tmp/video-uploads'),

    // Database
    DATABASE_URL: z.string().min(1),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),

    // Google OAuth
    G_ID: z.string().min(1),
    G_REFRESH_TOKEN: z.string().min(1),
    G_SECRET: z.string().min(1),
    G_URL: z.string().url(),
    G_CALLBACK_URL: z.string().url(),

    // Security Tokens
    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    VERIFIED_TOKEN_SECRET: z.string().min(32),
    VERIFIED_TOKEN_TTL_SECONDS: z.coerce.number().default(300),
    PENDING_REGISTRATION_SECRET: z.string().min(32),

    // Transactional Mail Providers
    MAIL_FROM: z.string().email(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM: z.string().min(1),

    // Paystack Payment Gateway
    PAYSTACK_PUBLIC_KEY: z.string().min(1),
    PAYSTACK_SECRET_KEY: z.string().min(1),
    PAYSTACK_WEBHOOK_SECRET: z.string().min(1),

    // Redis Connection URL
    REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
    REDIS_HOST: z.string().optional().default('localhost'),
    REDIS_PORT: z.coerce.number().optional().default(6379),
    REDIS_PASSWORD: z.string().optional(),
});

// 2. Validate process.env immediately at startup
const parsed = envSchema.parse(process.env);

// Helper to extract Redis details from REDIS_URL dynamically
const getRedisDetails = (url: string) => {
    try {
        const parsedUrl = new URL(url);
        return {
            host: parsedUrl.hostname,
            port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 6379,
            password: parsedUrl.password || undefined
        };
    } catch {
        return { host: parsed.REDIS_HOST, port: parsed.REDIS_PORT, password: parsed.REDIS_PASSWORD };
    }
};

const redisDetails = getRedisDetails(parsed.REDIS_URL);

// 3. Export the clean camelCase mapping containing all system integrations
export const envConfig = {
    // Original Legacy Object Properties (Untouched)
    resendApiKey: parsed.RESEND_API_KEY,
    isProduction: parsed.NODE_ENV === 'production',
    emailUser: parsed.EMAIL_USER,
    emailPass: parsed.EMAIL_PASS,
    adminEmail: parsed.ADMIN_EMAIL,
    frontendUrl: parsed.FRONTEND_URL,
    paystackSecret: parsed.PAYSTACK_SECRET_KEY,
    paystackPublic: parsed.PAYSTACK_PUBLIC_KEY,
    jwtAccessSecret: parsed.JWT_ACCESS_SECRET,
    jwtRefreshSecret: parsed.JWT_REFRESH_SECRET,
    sessionSecret: parsed.COOKIE_SECRET,
    sessionCookieName: 'pathfinder_session', // Safe fallback from previous object state
    redisHost: redisDetails.host,
    redisPort: redisDetails.port,
    redisPassword: redisDetails.password,

    // Newly Extracted Global Integrations
    port: parsed.PORT,
    baseUrl: parsed.BASE_URL,
    backendUrl: parsed.BACKEND_URL,
    databaseUrl: parsed.DATABASE_URL,
    accessCookieName: parsed.ACCESS_COOKIE_NAME,
    refreshCookieName: parsed.REFRESH_COOKIE_NAME,

    bunny: {
        streamApiKey: parsed.BUNNY_STREAM_API_KEY,
        streamLibraryId: parsed.BUNNY_STREAM_LIBRARY_ID,
        streamSigningKey: parsed.BUNNY_STREAM_SIGNING_KEY,
        streamReadonlyApiKey: parsed.BUNNY_STREAM_READONLY_API_KEY,
        storagePassword: parsed.BUNNY_STORAGE_PASSWORD,
        storageRegionHost: parsed.BUNNY_STORAGE_REGION_HOST,
        storageZoneName: parsed.BUNNY_STORAGE_ZONE_NAME,
        storagePullZoneHost: parsed.BUNNY_STORAGE_PULL_ZONE_HOST,
    },

    cloudinary: {
        apiKey: parsed.CLOUDINARY_API_KEY,
        apiSecret: parsed.CLOUDINARY_API_SECRET,
        cloudName: parsed.CLOUDINARY_CLOUD_NAME,
    },

    queueBoard: {
        user: parsed.QUEUE_BOARD_USER,
        password: parsed.QUEUE_BOARD_PASSWORD,
        port: parsed.QUEUE_BOARD_PORT,
        tmpDir: parsed.UPLOAD_TMP_DIR,
    },

    google: {
        id: parsed.G_ID,
        secret: parsed.G_SECRET,
        refreshToken: parsed.G_REFRESH_TOKEN,
        url: parsed.G_URL,
        callbackUrl: parsed.G_CALLBACK_URL,
    },

    security: {
        pendingRegistrationSecret: parsed.PENDING_REGISTRATION_SECRET,
        verifiedTokenSecret: parsed.VERIFIED_TOKEN_SECRET,
        verifiedTokenTtlSeconds: parsed.VERIFIED_TOKEN_TTL_SECONDS,
    },

    mail: {
        from: parsed.MAIL_FROM,
        resendFrom: parsed.RESEND_FROM,
    },

    paystack: {
        webhookSecret: parsed.PAYSTACK_WEBHOOK_SECRET,
    }
};

export type EnvConfigType = typeof envConfig;
