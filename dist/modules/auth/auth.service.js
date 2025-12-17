"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.rotateRefreshToken = exports.resetPassword = exports.requestPasswordReset = exports.verifyEmail = exports.authenticate = exports.createUser = void 0;
const db_1 = __importDefault(require("../../config/db"));
const crypto_1 = __importDefault(require("crypto"));
const hash_1 = require("../../utils/hash");
const jwt_1 = require("../../lib/jwt");
const errors_1 = require("../../utils/errors");
const logger_1 = __importDefault(require("../../utils/logger"));
// import { emailQueue } from "../../jobs/email/emailJobs";
const emailService_1 = require("../../services/emailService");
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const createUser = async (name, email, password) => {
    const existing = await db_1.default.user.findUnique({ where: { email } });
    if (existing)
        throw (0, errors_1.badRequest)("Email already registered");
    const hashed = await (0, hash_1.hashPassword)(password);
    const verificationToken = crypto_1.default.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    const user = await db_1.default.user.create({
        data: {
            name,
            email,
            password: hashed,
            verificationToken,
            verificationExpires,
            // emailVerified: false,
        },
        select: { id: true, name: true, email: true },
    });
    try {
        await (0, emailService_1.sendVerificationEmail)(user.email, user.name, verificationToken);
        logger_1.default.info("Verification email sent");
    }
    catch (err) {
        logger_1.default.warn("Verification email failed", err);
    }
    // return { userId: user.id, verificationToken };
    return user;
};
exports.createUser = createUser;
const authenticate = async (email, password) => {
    const user = await db_1.default.user.findUnique({ where: { email } });
    if (!user)
        throw (0, errors_1.unauthorized)("Invalid credentials");
    const matches = await (0, hash_1.comparePassword)(password, user.password);
    if (!matches)
        throw (0, errors_1.unauthorized)("Invalid credentials");
    const accessToken = (0, jwt_1.signAccessToken)({ userId: user.id, role: user.role });
    const tokenId = crypto_1.default.randomBytes(16).toString("hex");
    const refreshPayload = { userId: user.id, tokenId };
    const refreshToken = (0, jwt_1.signRefreshToken)(refreshPayload);
    const hashedRefresh = await (0, hash_1.hashToken)(refreshToken);
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db_1.default.user.update({
        where: { id: user.id },
        data: { refreshToken: hashedRefresh, refreshTokenExpires: refreshExpires },
    });
    return {
        tokens: { accessToken, refreshToken },
        userId: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
    };
};
exports.authenticate = authenticate;
const verifyEmail = async (token) => {
    const user = await db_1.default.user.findFirst({
        where: {
            verificationToken: token,
            verificationExpires: { gt: new Date() },
        },
    });
    if (!user)
        throw (0, errors_1.badRequest)("Invalid or expired verification token");
    await db_1.default.user.update({
        where: { id: user.id },
        data: {
            emailVerified: true,
            verificationToken: null,
            verificationExpires: null,
        },
    });
};
exports.verifyEmail = verifyEmail;
const requestPasswordReset = async (email) => {
    const user = await db_1.default.user.findUnique({ where: { email } });
    if (!user) {
        // Avoid user enumeration — return early
        return;
    }
    const token = crypto_1.default.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await db_1.default.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpires: expires },
    });
    try {
        // await emailQueue.add(
        //   "password_reset",
        //   {
        //     type: "password_reset",
        //     email: user.email,
        //     name: user.name,
        //     token,
        //     expiresAt: expires.toISOString(),
        //   },
        //   { attempts: 3, backoff: { type: "exponential", delay: 3000 } }
        // );
        await (0, emailService_1.sendPasswordResetEmail)(user.email, user.name, token);
        logger_1.default.info("Password Reset Mail Sent");
    }
    catch (qErr) {
        logger_1.default.error("Direct password reset email failed", {
            error: qErr.message,
        });
        // logger.warn(
        //   "Failed to enqueue password reset email, attempting direct send",
        //   { error: (qErr as Error).message }
        // );
        // try {
        //   await sendPasswordResetEmail(user.email, user.name, token);
        // } catch (sendErr) {
        //   logger.error("Direct password reset email failed", {
        //     error: (sendErr as Error).message,
        //   });
        // }
    }
};
exports.requestPasswordReset = requestPasswordReset;
const resetPassword = async (token, newPassword) => {
    const user = await db_1.default.user.findFirst({
        where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
    });
    if (!user)
        throw (0, errors_1.badRequest)("Invalid or expired reset token");
    const hashed = await (0, hash_1.hashPassword)(newPassword);
    await db_1.default.user.update({
        where: { id: user.id },
        data: { password: hashed, resetToken: null, resetTokenExpires: null },
    });
    // Invalidate any existing refresh tokens
    await db_1.default.user.update({
        where: { id: user.id },
        data: { refreshToken: null, refreshTokenExpires: null },
    });
};
exports.resetPassword = resetPassword;
const rotateRefreshToken = async (currentRefreshToken) => {
    let payload;
    try {
        payload = (0, jwt_1.verifyRefreshToken)(currentRefreshToken);
    }
    catch (err) {
        throw (0, errors_1.unauthorized)("Invalid refresh token");
    }
    const user = await db_1.default.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.refreshToken)
        throw (0, errors_1.unauthorized)("Invalid refresh token");
    const valid = await (0, hash_1.compareTokenHash)(currentRefreshToken, user.refreshToken);
    if (!valid)
        throw (0, errors_1.unauthorized)("Refresh token mismatch");
    const newTokenId = crypto_1.default.randomBytes(16).toString("hex");
    const newRefreshPayload = {
        userId: user.id,
        tokenId: newTokenId,
    };
    const newRefreshToken = (0, jwt_1.signRefreshToken)(newRefreshPayload);
    const newAccessToken = (0, jwt_1.signAccessToken)({ userId: user.id, role: user.role });
    const hashedNew = await (0, hash_1.hashToken)(newRefreshToken);
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db_1.default.user.update({
        where: { id: user.id },
        data: { refreshToken: hashedNew, refreshTokenExpires: newExpires },
    });
    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        userId: user.id,
        role: user.role,
    };
};
exports.rotateRefreshToken = rotateRefreshToken;
const logout = async (userId) => {
    await db_1.default.user.update({
        where: { id: userId },
        data: { refreshToken: null, refreshTokenExpires: null },
    });
};
exports.logout = logout;
