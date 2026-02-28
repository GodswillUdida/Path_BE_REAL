"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeSession = exports.getUserSessions = exports.logoutAll = exports.logout = exports.rotateRefreshToken = exports.resetPassword = exports.requestPasswordReset = exports.verifyEmail = exports.authenticate = exports.createUser = void 0;
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
const authenticate = async (email, password, meta) => {
    const user = await db_1.default.user.findUnique({ where: { email } });
    if (!user)
        throw (0, errors_1.unauthorized)("Invalid credentials");
    const matches = await (0, hash_1.comparePassword)(password, user.password);
    if (!matches)
        throw (0, errors_1.unauthorized)("Invalid credentials");
    const accessToken = (0, jwt_1.signAccessToken)({
        userId: user.id,
        role: user.role,
    });
    const tokenId = crypto_1.default.randomBytes(16).toString("hex");
    const refreshPayload = {
        userId: user.id,
        tokenId,
    };
    const refreshToken = (0, jwt_1.signRefreshToken)(refreshPayload);
    const tokenHash = await (0, hash_1.hashToken)(refreshToken);
    await db_1.default.session.create({
        data: {
            userId: user.id,
            tokenId,
            tokenHash,
            userAgent: meta?.userAgent,
            ipAddress: meta?.ipAddress,
            fingerprint: meta?.fingerprint,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
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
    if (!user)
        return; // Avoid user enumeration — return early
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
        // await sendPasswordResetEmail(user.email, user.name, token);
        logger_1.default.info("Password Reset Mail Sent");
    }
    catch (err) {
        logger_1.default.error("Password reset email failed", {
            error: err.message,
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
    await db_1.default.session.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
    });
    // await logoutAll(user.id);
};
exports.resetPassword = resetPassword;
const rotateRefreshToken = async (currentRefreshToken) => {
    let payload;
    try {
        payload = (0, jwt_1.verifyRefreshToken)(currentRefreshToken);
    }
    catch {
        throw (0, errors_1.unauthorized)("Invalid refresh token");
    }
    const session = await db_1.default.session.findUnique({
        where: { tokenId: payload.tokenId },
        include: { user: true },
    });
    if (!session || session.revokedAt) {
        throw (0, errors_1.unauthorized)("Invalid refresh token");
    }
    if (session.expiresAt < new Date()) {
        throw (0, errors_1.unauthorized)("Refresh token expired");
    }
    const valid = await (0, hash_1.compareTokenHash)(currentRefreshToken, session.tokenHash);
    // 🔥 REUSE DETECTION
    if (!valid) {
        // revoke all sessions for user
        await db_1.default.session.updateMany({
            where: { userId: session.userId },
            data: { revokedAt: new Date() },
        });
        throw (0, errors_1.unauthorized)("Refresh token reuse detected");
    }
    // Revoke current session
    await db_1.default.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
    });
    // Create new session
    const newTokenId = crypto_1.default.randomBytes(16).toString("hex");
    const newRefreshPayload = {
        userId: session.userId,
        tokenId: newTokenId,
    };
    const newRefreshToken = (0, jwt_1.signRefreshToken)(newRefreshPayload);
    const newAccessToken = (0, jwt_1.signAccessToken)({
        userId: session.userId,
        role: session.user.role,
    });
    const newTokenHash = await (0, hash_1.hashToken)(newRefreshToken);
    await db_1.default.session.create({
        data: {
            userId: session.userId,
            tokenId: newTokenId,
            tokenHash: newTokenHash,
            userAgent: session.userAgent,
            ipAddress: session.ipAddress,
            fingerprint: session.fingerprint,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    });
    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        userId: session.userId,
        role: session.user.role,
    };
};
exports.rotateRefreshToken = rotateRefreshToken;
const logout = async (tokenId) => {
    await db_1.default.session.update({
        where: { tokenId },
        data: { revokedAt: new Date() },
    });
};
exports.logout = logout;
const logoutAll = async (userId) => {
    await db_1.default.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
};
exports.logoutAll = logoutAll;
const getUserSessions = async (userId) => {
    const sessions = await db_1.default.session.findMany({
        where: {
            userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            userAgent: true,
            ipAddress: true,
            createdAt: true,
            expiresAt: true,
        },
    });
    return sessions;
};
exports.getUserSessions = getUserSessions;
const revokeSession = async (userId, sessionId) => {
    const session = await db_1.default.session.findFirst({
        where: {
            id: sessionId,
            userId,
        },
    });
    if (!session) {
        throw (0, errors_1.badRequest)("Session not found");
    }
    await db_1.default.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
    });
};
exports.revokeSession = revokeSession;
