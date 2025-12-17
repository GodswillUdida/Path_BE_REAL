"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.envConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.envConfig = {
    resendApiKey: process.env.RESEND_API_KEY || '',
    isProduction: process.env.NODE_ENV === 'production',
    emailUser: process.env.EMAIL || '',
    emailPass: process.env.EMAIL_PASS || '',
    adminEmail: process.env.ADMIN_EMAIL || '',
    frontendUrl: process.env.FRONTEND_URL || '',
    paystackSecret: process.env.PAYSTACK_SECRET || '',
};
