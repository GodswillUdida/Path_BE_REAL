/**
 * @file auth.service.ts
 * Business logic only. All DB access goes through AuthRepository.
 * Session creation is ALWAYS outside any interactive transaction.
 */
// import crypto from "crypto";
// import { authRepository } from "./auth.repo";
import {
  hashPassword,
  hashToken,
  compareTokenHash,
  comparePassword,
} from "../../utils/hash";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt";
import { badRequest, unauthorized } from "../../utils/errors";
import logger from "../../utils/logger";
import { RegisterDTO, ResetPasswordDTO } from "./auth.schema";
import {
  AuthResult,
  GoogleProfile,
  PaginatedUsers,
  SessionUser,
  SessionView,
} from "./types";
import {
  DUMMY_HASH,
  generateOTP,
  generateToken,
  hashOTP,
  toPublicUser,
  TTL,
} from "./config";
import { RequestMeta } from "../../types/auth.types";
import { enqueueAuthEmail } from "./email.queue";
import { authRepository } from "./auth.repo";

// ─── Shared session + token factory (never inside a $transaction) ────────
export async function createSessionAndTokens(
  user: SessionUser,
  meta?: RequestMeta,
  provider: string = "credentials",
): Promise<AuthResult> {
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    emailVerified: user.emailVerified,
  });

  const tokenId = generateToken(16);
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });
  const tokenHash = hashToken(refreshToken);

  await authRepository.createSession({
    userId: user.id,
    tokenId,
    tokenHash,
    userAgent: meta?.userAgent,
    ipAddress: meta?.ipAddress,
    fingerprint: meta?.fingerprint,
    provider,
    expiresAt: new Date(Date.now() + TTL.REFRESH_SESSION),
  });

  return {
    tokens: { accessToken, refreshToken },
    user: toPublicUser(user),
  };
}

// ─── Registration ────────────────────────────────────────────────────────
export async function createUser(
  dto: RegisterDTO,
): Promise<Pick<SessionUser, "id" | "name" | "email">> {
  const existing = await authRepository.findUserByEmail(dto.email);
  if (existing) throw badRequest("Email already registered");

  const [hashedPassword, otp] = await Promise.all([
    hashPassword(dto.password),
    Promise.resolve(generateOTP()),
  ]);

  const otpHash = hashOTP(otp);
  const verificationExpires = new Date(Date.now() + TTL.OTP);

  const user = await authRepository.createCredentialsUser({
    name: dto.name,
    email: dto.email,
    hashedPassword,
    otpHash,
    verificationExpires,
  });

  enqueueAuthEmail({
    type: "welcome",
    to: user.email,
    name: user.name!,
    code: otp,
  }).catch((err) => {
    logger.error("Failed to enqueue verification email", {
      userId: user.id,
      error: err.message,
    });
  });

  return user;
}

// ─── Email verification ──────────────────────────────────────────────────
export async function verifyEmail(
  email: string,
  code: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const otpHash = hashOTP(code);
  const now = new Date();

  // Pure DB transaction – stays well under 5 s
  const updatedUser = await prismaTransaction(async () => {
    const user = await authRepository.findVerificationUser(email, otpHash, now);
    if (!user) throw badRequest("Invalid or expired verification code");
    return authRepository.markEmailVerified(user.id);
  });

  return createSessionAndTokens(updatedUser, meta);
}

// helper so we can still use $transaction without leaking prisma into service
async function prismaTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const { default: prisma } = await import("../../lib/prisma");
  return prisma.$transaction(fn);
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await authRepository.findUserByEmail(email);
  if (!user) throw badRequest("User not found");
  if (user.emailVerified) throw badRequest("Email is already verified");

  const otp = generateOTP();
  const otpHash = hashOTP(otp);
  const expires = new Date(Date.now() + TTL.OTP);

  await authRepository.updateVerificationToken(email, otpHash, expires);

  enqueueAuthEmail({
    type: "welcome",
    to: email,
    name: user.name!,
    code: otp,
  }).catch((err) => {
    logger.error("Failed to re-queue verification email", {
      email,
      error: err.message,
    });
  });
}

// ─── Credential login ────────────────────────────────────────────────────
export async function authenticate(
  email: string,
  password: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const user = await authRepository.findUserByEmail(email);

  // Constant-time path even when user does not exist
  const hashed = user?.accounts[0]?.password ?? DUMMY_HASH;
  const match = await comparePassword(password, hashed);

  if (!user || !match) throw unauthorized("Invalid email or password");
  if (!user.emailVerified) throw unauthorized("Email not verified");

  const { accounts: _, ...sessionUser } = user;
  return createSessionAndTokens(sessionUser, meta, "credentials");
}

// ─── Google OAuth ────────────────────────────────────────────────────────
export async function processGoogleOAuth(
  profile: GoogleProfile,
  meta: RequestMeta,
): Promise<AuthResult> {
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || email?.split("@")[0];
  const avatar = profile.photos?.[0]?.value;
  const googleId = profile.id;
  const emailVerified = profile._json?.email_verified === true;

  if (!email) throw badRequest("Google account has no email associated.");
  if (!emailVerified) throw unauthorized("Google email address is unverified.");

  // Single short transaction that only does account/user linking
  const user = await authRepository.findOrCreateGoogleUser({
    email,
    name,
    avatar,
    googleId,
  });

  // Welcome email only for brand-new users (optional heuristic)
  // You can add a flag from the repository if you need exact detection.
  enqueueAuthEmail({
    type: "welcome",
    to: user.email,
    name: user.name ?? "there",
  }).catch((err) => {
    logger.error("Failed to enqueue Google welcome email", {
      error: err.message,
    });
  });

  // Session creation ALWAYS outside the transaction
  return createSessionAndTokens(user, meta, "google");
}

// ─── Password reset ──────────────────────────────────────────────────────
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await authRepository.findUserByEmail(email);
  if (!user) return; // silent

  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken); // never store raw token

  await authRepository.setResetToken(
    user.id,
    tokenHash,
    new Date(Date.now() + TTL.RESET_TOKEN),
  );

  enqueueAuthEmail({
    type: "password-reset",
    to: user.email,
    resetToken: rawToken, // send the raw one
  }).catch((err) => {
    logger.error("Failed to enqueue password-reset email", {
      userId: user.id,
      error: err.message,
    });
  });
}

export async function verifyPasswordResetToken(token: string): Promise<boolean> {
  if (!token || token.length < 32) return false;
  const tokenHash = hashToken(token);
  const user = await authRepository.findUserByResetToken(tokenHash);
  return !!user;
}

export async function resetPassword(dto: ResetPasswordDTO): Promise<void> {
  const tokenHash = hashToken(dto.token);
  const user = await authRepository.findUserByResetToken(tokenHash);
  if (!user) throw badRequest("Invalid or expired reset token");

  const hashed = await hashPassword(dto.newPassword);
  await authRepository.resetPasswordAndRevokeSessions(user.id, hashed);
}

// ─── Refresh-token rotation with reuse detection ─────────────────────────
export async function rotateRefreshToken(
  refreshToken: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  let payload: { userId: string; tokenId: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized("Invalid refresh token");
  }

  // Pure DB transaction – revoke only
  const session = await prismaTransaction(async () => {
    const s = await authRepository.findSessionByTokenId(payload.tokenId);

    if (!s || s.revokedAt || s.expiresAt < new Date()) {
      throw unauthorized("Invalid session");
    }

    // Reuse detection
    if (!compareTokenHash(refreshToken, s.tokenHash)) {
      await authRepository.revokeAllUserSessions(s.userId);
      throw unauthorized("Security breach detected. Please login again.");
    }

    await authRepository.revokeSession(s.id);
    return s;
  });

  // New session created AFTER the transaction commits
  return createSessionAndTokens(session.user, meta, session.provider);
}

// ─── Logout / session management ─────────────────────────────────────────
export async function logout(tokenId: string): Promise<void> {
  await authRepository.revokeByTokenId(tokenId);
}

export async function logoutAll(userId: string): Promise<void> {
  await authRepository.revokeAllUserSessions(userId);
}

export async function getUserSessions(userId: string): Promise<SessionView[]> {
  return authRepository.listActiveSessions(userId);
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const sessions = await authRepository.listActiveSessions(userId);
  const target = sessions.find((session: SessionView) => session.id === sessionId);
  if (!target) throw badRequest("Session not found or already revoked");
  await authRepository.revokeSession(sessionId);
}

export async function getUserById(id: string): Promise<SessionUser | null> {
  return authRepository.findUserById(id);
}

export async function getAllUsers(
  page = 1,
  pageSize = 50,
): Promise<PaginatedUsers> {
  return authRepository.paginateUsers(page, pageSize);
}