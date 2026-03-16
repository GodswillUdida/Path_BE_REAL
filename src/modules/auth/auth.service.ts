import prisma from "../../config/db";
import crypto from "crypto";
import {
  hashPassword,
  hashToken,
  compareTokenHash,
  comparePassword,
} from "../../utils/hash";
import {
  signAccessToken,
  signRefreshToken,
  RefreshTokenPayload,
  verifyRefreshToken,
} from "../../lib/jwt";
import { badRequest, notFound, unauthorized } from "../../utils/errors";
import logger from "../../utils/logger";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../services/emailService";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export type AuthTokens = { accessToken: string; refreshToken: string };

export type AuthResult = {
  tokens: AuthTokens;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    emailVerified: boolean;
  };
};

async function createSessionAndTokens(
  user: any,
  meta?: { userAgent?: string; ipAddress?: string; fingerprint?: string },
): Promise<AuthResult> {
  const accessToken = signAccessToken({ userId: user.id, role: user.role });

  const tokenId = crypto.randomBytes(16).toString("hex");
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });
  const tokenHash = await hashToken(refreshToken);

  await prisma.session.create({
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

export const guestLoginService = async (email: string): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
    },
  });
  if (!user) throw notFound("User not found");

  return await createSessionAndTokens(user);
};

export const createUser = async (
  name: string,
  email: string,
  password: string,
) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw badRequest("Email already registered");

  const hashed = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      verificationToken,
      verificationExpires: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    },
    select: { id: true, name: true, email: true },
  });

  await sendVerificationEmail(
    user.email,
    user.name ?? "Student",
    verificationToken,
  ).catch((err) => logger.warn("Verification email failed", err));

  return user;
};

export const authenticate = async (
  email: string,
  password: string,
  meta?: { userAgent?: string; ipAddress?: string; fingerprint?: string },
): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw unauthorized("Invalid credentials");

  const match = await comparePassword(password, user.password!);
  if (!match) throw unauthorized("Invalid credentials");

  return await createSessionAndTokens(user, meta);
};

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

export const verifyEmail = async (token: string) => {
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationExpires: { gt: new Date() },
    },
  });
  if (!user) throw badRequest("Invalid or expired token");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationExpires: null,
    },
  });
};

export const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
  });

  return user;
};

export const getAllUsers = async () => {
  const user = await prisma.user.findMany();

  return user;
};

export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // silent fail (no enumeration)

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await sendPasswordResetEmail(user.email, user.name ?? "Student", token).catch(
    (err) => logger.error("Password reset email failed", err),
  );
};

export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
  });
  if (!user) throw badRequest("Invalid or expired token");

  const hashed = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpires: null },
    }),
    prisma.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    }),
  ]);
};

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

export const rotateRefreshToken = async (
  refreshToken: string,
): Promise<AuthResult> => {
  const payload = verifyRefreshToken(refreshToken) as RefreshTokenPayload;

  const session = await prisma.session.findUnique({
    where: { tokenId: payload.tokenId },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date())
    throw unauthorized("Invalid refresh token");

  if (!(await compareTokenHash(refreshToken, session.tokenHash)))
    throw unauthorized("Refresh token reuse detected"); // revoke all

  // Atomic rotation
  const newTokenId = crypto.randomBytes(16).toString("hex");
  const newRefreshToken = signRefreshToken({
    userId: session.userId,
    tokenId: newTokenId,
  });
  const newAccessToken = signAccessToken({
    userId: session.userId,
    role: session.user.role,
  });
  const newHash = await hashToken(newRefreshToken);

  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.session.create({
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

export const logout = async (tokenId: string) => {
  await prisma.session.update({
    where: { tokenId },
    data: { revokedAt: new Date() },
  });
};

export const logoutAll = async (userId: string) => {
  await prisma.session.updateMany({
    where: { userId },
    data: { revokedAt: new Date() },
  });
};

export const getUserSessions = async (userId: string) => {
  const sessions = await prisma.session.findMany({
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

export const revokeSession = async (userId: string, sessionId: string) => {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
  });

  if (!session) {
    throw badRequest("Session not found");
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
};
