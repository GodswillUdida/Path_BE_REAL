"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTokenSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.verifyEmailSchema = exports.guestLoginSchema = exports.loginSchema = exports.registerSchema = void 0;
// src/modules/auth/auth.schema.ts
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(3).max(128, "Name too long"),
    email: zod_1.z.string().email("Invalid email"),
    password: zod_1.z.string().min(8).max(128, "Password too long"),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email"),
    password: zod_1.z.string().min(8).max(128),
});
exports.guestLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email"),
});
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(8, "Invalid verification token"),
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(8),
    newPassword: zod_1.z.string().min(8).max(128),
});
exports.refreshTokenSchema = zod_1.z.object({}).strict(); // empty for cookie-based
