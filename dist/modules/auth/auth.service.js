"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeSession = exports.getUserSessions = exports.logoutAll = exports.logout = exports.rotateRefreshToken = exports.resetPassword = exports.requestPasswordReset = exports.getAllUsers = exports.getUserById = exports.verifyEmail = exports.authenticate = exports.createUser = exports.guestLoginService = void 0;
const db_1 = __importDefault(require("../../config/db"));
const crypto_1 = __importDefault(require("crypto"));
const hash_1 = require("../../utils/hash");
const jwt_1 = require("../../lib/jwt");
const errors_1 = require("../../utils/errors");
const logger_1 = __importDefault(require("../../utils/logger"));
const emailService_1 = require("../../services/emailService");
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
async function createSessionAndTokens(user, meta) {
    const accessToken = (0, jwt_1.signAccessToken)({ userId: user.id, role: user.role });
    const tokenId = crypto_1.default.randomBytes(16).toString("hex");
    const refreshToken = (0, jwt_1.signRefreshToken)({ userId: user.id, tokenId });
    const tokenHash = await (0, hash_1.hashToken)(refreshToken);
    await db_1.default.session.create({
        data: {
            userId: user.id,
            tokenId,
            tokenHash,
            userAgent: meta?.userAgent,
            ipAddress: meta?.ipAddress,
            fingerprint: meta?.fingerprint,
            expiresAt: new Date(Date.now() + REFRESH_TTL),
        },
    });
    return {
        tokens: { accessToken, refreshToken },
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
        },
    };
}
const guestLoginService = async (email) => {
    const user = await db_1.default.user.findUnique({
        where: { email },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailVerified: true,
        },
    });
    if (!user)
        throw (0, errors_1.notFound)("User not found");
    return await createSessionAndTokens(user);
};
exports.guestLoginService = guestLoginService;
const createUser = async (name, email, password) => {
    const existing = await db_1.default.user.findUnique({ where: { email } });
    if (existing)
        throw (0, errors_1.badRequest)("Email already registered");
    const hashed = await (0, hash_1.hashPassword)(password);
    const verificationToken = crypto_1.default.randomBytes(32).toString("hex");
    const user = await db_1.default.user.create({
        data: {
            name,
            email,
            password: hashed,
            verificationToken,
            verificationExpires: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        },
        select: { id: true, name: true, email: true },
    });
    await (0, emailService_1.sendVerificationEmail)(user.email, user.name ?? "Student", verificationToken).catch((err) => logger_1.default.warn("Verification email failed", err));
    return user;
};
exports.createUser = createUser;
const authenticate = async (email, password, meta) => {
    const user = await db_1.default.user.findUnique({ where: { email } });
    if (!user)
        throw (0, errors_1.unauthorized)("Invalid credentials");
    const match = await (0, hash_1.comparePassword)(password, user.password);
    if (!match)
        throw (0, errors_1.unauthorized)("Invalid credentials");
    return await createSessionAndTokens(user, meta);
};
exports.authenticate = authenticate;
// export const authenticate = async (
//   email: string,
//   password: string,
//   meta?: {
//     userAgent?: string;
//     ipAddress?: string;
//     fingerprint?: string;
//   },
// ): Promise<{
//   tokens: AuthTokens;
//   userId: string;
//   role: string;
//   name: string;
//   email: string;
//   emailVerified: boolean;
// }> => {
//   const user = await prisma.user.findUnique({ where: { email } });
//   if (!user) throw unauthorized("Invalid credentials");
//   const matches = await comparePassword(password, user.password);
//   if (!matches) throw unauthorized("Invalid credentials");
//   const accessToken = signAccessToken({
//     userId: user.id,
//     role: user.role,
//   });
//   const tokenId = crypto.randomBytes(16).toString("hex");
//   const refreshPayload: RefreshTokenPayload = {
//     userId: user.id,
//     tokenId,
//   };
//   const refreshToken = signRefreshToken(refreshPayload);
//   const tokenHash = await hashToken(refreshToken);
//   await prisma.session.create({
//     data: {
//       userId: user.id,
//       tokenId,
//       tokenHash,
//       userAgent: meta?.userAgent,
//       ipAddress: meta?.ipAddress,
//       fingerprint: meta?.fingerprint,
//       expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//     },
//   });
//   return {
//     tokens: { accessToken, refreshToken },
//     userId: user.id,
//     role: user.role,
//     name: user.name,
//     email: user.email,
//     emailVerified: user.emailVerified,
//   };
// };
const verifyEmail = async (token) => {
    const user = await db_1.default.user.findFirst({
        where: {
            verificationToken: token,
            verificationExpires: { gt: new Date() },
        },
    });
    if (!user)
        throw (0, errors_1.badRequest)("Invalid or expired token");
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
const getUserById = async (id) => {
    const user = await db_1.default.user.findUnique({
        where: {
            id,
        },
    });
    return user;
};
exports.getUserById = getUserById;
const getAllUsers = async () => {
    const user = await db_1.default.user.findMany();
    return user;
};
exports.getAllUsers = getAllUsers;
const requestPasswordReset = async (email) => {
    const user = await db_1.default.user.findUnique({ where: { email } });
    if (!user)
        return; // silent fail (no enumeration)
    const token = crypto_1.default.randomBytes(32).toString("hex");
    await db_1.default.user.update({
        where: { id: user.id },
        data: {
            resetToken: token,
            resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
    });
    await (0, emailService_1.sendPasswordResetEmail)(user.email, user.name ?? "Student", token).catch((err) => logger_1.default.error("Password reset email failed", err));
};
exports.requestPasswordReset = requestPasswordReset;
const resetPassword = async (token, newPassword) => {
    const user = await db_1.default.user.findFirst({
        where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
    });
    if (!user)
        throw (0, errors_1.badRequest)("Invalid or expired token");
    const hashed = await (0, hash_1.hashPassword)(newPassword);
    await db_1.default.$transaction([
        db_1.default.user.update({
            where: { id: user.id },
            data: { password: hashed, resetToken: null, resetTokenExpires: null },
        }),
        db_1.default.session.updateMany({
            where: { userId: user.id },
            data: { revokedAt: new Date() },
        }),
    ]);
};
exports.resetPassword = resetPassword;
// export const rotateRefreshToken = async (
//   currentRefreshToken: string,
// ): Promise<{
//   accessToken: string;
//   refreshToken: string;
//   userId: string;
//   role: string;
// }> => {
//   let payload: RefreshTokenPayload;
//   try {
//     payload = verifyRefreshToken(currentRefreshToken) as RefreshTokenPayload;
//   } catch {
//     throw unauthorized("Invalid refresh token");
//   }
//   const session = await prisma.session.findUnique({
//     where: { tokenId: payload.tokenId },
//     include: { user: true },
//   });
//   if (!session || session.revokedAt) {
//     throw unauthorized("Invalid refresh token");
//   }
//   if (session.expiresAt < new Date()) {
//     throw unauthorized("Refresh token expired");
//   }
//   const valid = await compareTokenHash(currentRefreshToken, session.tokenHash);
//   // 🔥 REUSE DETECTION
//   if (!valid) {
//     // revoke all sessions for user
//     await prisma.session.updateMany({
//       where: { userId: session.userId },
//       data: { revokedAt: new Date() },
//     });
//     throw unauthorized("Refresh token reuse detected");
//   }
//   // Revoke current session
//   await prisma.session.update({
//     where: { id: session.id },
//     data: { revokedAt: new Date() },
//   });
//   // Create new session
//   const newTokenId = crypto.randomBytes(16).toString("hex");
//   const newRefreshPayload: RefreshTokenPayload = {
//     userId: session.userId,
//     tokenId: newTokenId,
//   };
//   const newRefreshToken = signRefreshToken(newRefreshPayload);
//   const newAccessToken = signAccessToken({
//     userId: session.userId,
//     role: session.user.role,
//   });
//   const newTokenHash = await hashToken(newRefreshToken);
//   await prisma.session.create({
//     data: {
//       userId: session.userId,
//       tokenId: newTokenId,
//       tokenHash: newTokenHash,
//       userAgent: session.userAgent,
//       ipAddress: session.ipAddress,
//       fingerprint: session.fingerprint,
//       expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//     },
//   });
//   return {
//     accessToken: newAccessToken,
//     refreshToken: newRefreshToken,
//     userId: session.userId,
//     role: session.user.role,
//   };
// };
const rotateRefreshToken = async (refreshToken) => {
    const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    const session = await db_1.default.session.findUnique({
        where: { tokenId: payload.tokenId },
        include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date())
        throw (0, errors_1.unauthorized)("Invalid refresh token");
    if (!(await (0, hash_1.compareTokenHash)(refreshToken, session.tokenHash)))
        throw (0, errors_1.unauthorized)("Refresh token reuse detected"); // revoke all
    // Atomic rotation
    const newTokenId = crypto_1.default.randomBytes(16).toString("hex");
    const newRefreshToken = (0, jwt_1.signRefreshToken)({
        userId: session.userId,
        tokenId: newTokenId,
    });
    const newAccessToken = (0, jwt_1.signAccessToken)({
        userId: session.userId,
        role: session.user.role,
    });
    const newHash = await (0, hash_1.hashToken)(newRefreshToken);
    await db_1.default.$transaction([
        db_1.default.session.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
        }),
        db_1.default.session.create({
            data: {
                userId: session.userId,
                tokenId: newTokenId,
                tokenHash: newHash,
                userAgent: session.userAgent,
                ipAddress: session.ipAddress,
                fingerprint: session.fingerprint,
                expiresAt: new Date(Date.now() + REFRESH_TTL),
            },
        }),
    ]);
    return {
        tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
        user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            role: session.user.role,
            emailVerified: session.user.emailVerified,
        },
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
        where: { userId },
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
