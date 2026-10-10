import dotenv from 'dotenv';
dotenv.config();

export const envConfig = {
    resendApiKey: process.env.RESEND_API_KEY || '',
    isProduction: process.env.NODE_ENV === 'production',
    emailUser: process.env.EMAIL || '',
    emailPass: process.env.EMAIL_PASS || '',
    adminEmail: process.env.ADMIN_EMAIL || '',
    frontendUrl: process.env.FRONTEND_URL || '',
    paystackSecret: process.env.PAYSTACK_SECRET || '',
    paystackPublic: process.env.PAYSTACK_PUBLIC || '',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    sessionCookieName: process.env.SESSION_COOKIE_NAME || 'pathfinder_session',
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379'),
    redisPassword: process.env.REDIS_PASSWORD || undefined,
};