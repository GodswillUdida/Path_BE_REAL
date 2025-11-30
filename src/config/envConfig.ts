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
};