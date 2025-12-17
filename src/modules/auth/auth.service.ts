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
import { badRequest, unauthorized } from "../../utils/errors";
import logger from "../../utils/logger";
// import { emailQueue } from "../../jobs/email/emailJobs";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../services/emailService";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export const createUser = async (
  name: string,
  email: string,
  password: string
) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw badRequest("Email already registered");

  const hashed = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  const user = await prisma.user.create({
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
    await sendVerificationEmail(user.email, user.name, verificationToken);
    logger.info("Verification email sent");
  } catch (err) {
    logger.warn("Verification email failed", err);
  }

  // return { userId: user.id, verificationToken };
  return user;
};

export const authenticate = async (
  email: string,
  password: string
): Promise<{
  tokens: AuthTokens;
  userId: string;
  role: string;
  name: string;
  email: string;
  emailVerified: boolean;
}> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw unauthorized("Invalid credentials");

  const matches = await comparePassword(password, user.password);
  if (!matches) throw unauthorized("Invalid credentials");

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const tokenId = crypto.randomBytes(16).toString("hex");
  const refreshPayload: RefreshTokenPayload = { userId: user.id, tokenId };
  const refreshToken = signRefreshToken(refreshPayload);

  const hashedRefresh = await hashToken(refreshToken);
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.user.update({
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

export const verifyEmail = async (token: string): Promise<void> => {
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationExpires: { gt: new Date() },
    },
  });
  if (!user) throw badRequest("Invalid or expired verification token");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationExpires: null,
    },
  });
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Avoid user enumeration — return early
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.user.update({
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
    await sendPasswordResetEmail(user.email, user.name, token);

    logger.info("Password Reset Mail Sent");
  } catch (qErr) {
    logger.error("Direct password reset email failed", {
      error: (qErr as Error).message,
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

export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<void> => {
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
  });
  if (!user) throw badRequest("Invalid or expired reset token");

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, resetToken: null, resetTokenExpires: null },
  });

  // Invalidate any existing refresh tokens
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: null, refreshTokenExpires: null },
  });
};

export const rotateRefreshToken = async (
  currentRefreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: string;
}> => {
  let payload: RefreshTokenPayload;
  try {
    payload = verifyRefreshToken(currentRefreshToken) as RefreshTokenPayload;
  } catch (err) {
    throw unauthorized("Invalid refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.refreshToken) throw unauthorized("Invalid refresh token");

  const valid = await compareTokenHash(currentRefreshToken, user.refreshToken);
  if (!valid) throw unauthorized("Refresh token mismatch");

  const newTokenId = crypto.randomBytes(16).toString("hex");
  const newRefreshPayload: RefreshTokenPayload = {
    userId: user.id,
    tokenId: newTokenId,
  };
  const newRefreshToken = signRefreshToken(newRefreshPayload);
  const newAccessToken = signAccessToken({ userId: user.id, role: user.role });

  const hashedNew = await hashToken(newRefreshToken);
  const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.user.update({
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

export const logout = async (userId: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null, refreshTokenExpires: null },
  });
};
