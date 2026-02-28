"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.verifyEmailSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(3).max(128),
    email: zod_1.z.email(),
    password: zod_1.z.string().min(8).max(128),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.email(),
    password: zod_1.z.string().min(8).max(128),
});
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(8),
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string(),
    newPassword: zod_1.z.string().min(8).max(128),
});
