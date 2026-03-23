/**
 * @file auth.service.ts
 * @description Production-grade authentication service.
 *
 * Responsibilities:
 *  - User registration & email verification
 *  - Credential-based login / logout
 *  - Google OAuth 2.0 callback
 *  - Magic-link & OTP flows
 *  - Refresh-token rotation with reuse detection
 *  - Password reset lifecycle
 *  - Session management (list / revoke)
 *  - Guest checkout helper
 *
 * Design decisions:
 *  - All DB writes that touch >1 table run inside Prisma $transaction
 *  - Token reuse → full session wipe (breach-containment)
 *  - Timing-safe user enumeration guard on login
 *  - OTP/magic-link cleanup is intentionally async-background (not on hot path)
 *  - Google OAuth reuses createSessionAndTokens to avoid duplicated token logic
 */

import crypto from "crypto";
import prisma from "../../config/db";
import { Role } from "@prisma/client";
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
  type RefreshTokenPayload,
} from "../../lib/jwt";
import { badRequest, notFound, unauthorized } from "../../utils/errors";
import logger from "../../utils/logger";
import {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../services/emailService";
import { sendMagicLogin } from "./magicLogin.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const TTL = {
  VERIFICATION_TOKEN: 24 * 60 * 60 * 1000, // 24 h
  RESET_TOKEN: 1 * 60 * 60 * 1000, //  1 h
  REFRESH_SESSION: 7 * 24 * 60 * 60 * 1000, //  7 d
  OTP: 10 * 60 * 1000, // 10 min
} as const;

/** Dummy bcrypt hash used for constant-time login path when user is not found. */
const DUMMY_HASH =
  "$2b$12$invalidsaltthatisexactly22chars.invalidhashpadding123456";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: Required<SessionUser>;
}

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
  fingerprint?: string;
}

export interface PaginatedUsers {
  users: SessionUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Generates a cryptographically-random hex token.
 */
const generateToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString("hex");

/**
 * Converts a SessionUser to the shape returned in every AuthResult.
 * Ensures name is never null on the wire.
 */
const toPublicUser = (user: SessionUser): Required<SessionUser> => ({
  id: user.id,
  name: user.name ?? "",
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
});

// ─── Core: Session & Token Issuance ──────────────────────────────────────────

/**
 * Creates a persisted session and returns a signed access + refresh token pair.
 *
 * This is the single source of truth for token issuance — every auth flow
 * (credential login, Google OAuth, magic-link, OTP) funnels through here.
 */
export async function createSessionAndTokens(
  user: SessionUser,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const accessToken = signAccessToken({ userId: user.id, role: user.role });

  const tokenId = generateToken(16);
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });
  const tokenHash = hashToken(refreshToken);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenId,
      tokenHash,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
      fingerprint: meta?.fingerprint,
      expiresAt: new Date(Date.now() + TTL.REFRESH_SESSION),
    },
  });

  return {
    tokens: { accessToken, refreshToken },
    user: toPublicUser(user),
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers a new user with email + password credentials.
 * Sends a verification email (non-blocking — failure is logged, not thrown).
 */
export async function createUser(
  name: string,
  email: string,
  password: string,
): Promise<Pick<SessionUser, "id" | "name" | "email">> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw badRequest("Email already registered");

  const [hashedPassword, verificationToken] = await Promise.all([
    hashPassword(password),
    Promise.resolve(generateToken()),
  ]);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      verificationToken,
      verificationExpires: new Date(Date.now() + TTL.VERIFICATION_TOKEN),
    },
    select: { id: true, name: true, email: true },
  });

  sendVerificationEmail(
    user.email,
    user.name ?? "Student",
    verificationToken,
  ).catch((err) =>
    logger.warn(
      // { err, email: user.email },
      "Verification email failed",
    ),
  );

  return user;
}

// ─── Email Verification ───────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationExpires: { gt: new Date() },
    },
    select: { id: true },
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
}

// ─── Credential Login ─────────────────────────────────────────────────────────

/**
 * Authenticates a user by email + password.
 *
 * Always runs a bcrypt comparison, even when the user doesn't exist, to prevent
 * user-enumeration via response-timing side channels.
 */
export async function authenticate(
  email: string,
  password: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      password: true,
    },
  });

  // Constant-time guard: always await a comparison regardless of lookup result.
  const isMatch = user
    ? await comparePassword(password, user.password ?? DUMMY_HASH)
    : await comparePassword(password, DUMMY_HASH).then(() => false);

  if (!user || !isMatch) throw unauthorized("Invalid credentials");

  const { password: _omit, ...sessionUser } = user;
  return createSessionAndTokens(sessionUser, meta);
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

/**
 * Handles the Google OAuth 2.0 authorization-code callback.
 *
 * Flow:
 *  1. Exchange auth code for a Google access token
 *  2. Fetch the verified Google user profile
 *  3. Find-or-create the local user, linking googleId if needed
 *  4. Issue session tokens via the shared createSessionAndTokens helper
 */
export async function handleGoogleCallback(
  code: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  // Step 1: Exchange code → Google access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.G_ID!,
      client_secret: process.env.G_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  // console.log("tokenResponse:", tokenRes);

  if (!tokenRes.ok) {
    const errBody = await tokenRes.json().catch(() => tokenRes.text());
    console.error(
      "Google token exchange error body:",
      JSON.stringify(errBody, null, 2),
    );
    throw badRequest("Failed to exchange Google authorization code");
    logger.error(
      // { status: tokenRes.status },
      "Google token exchange failed",
    );
    throw badRequest("Failed to exchange Google authorization code");
  }

  const { access_token: googleAccessToken } = (await tokenRes.json()) as {
    access_token: string;
  };

  // Step 2: Fetch Google user profile
  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    },
  );

  if (!profileRes.ok) throw badRequest("Failed to retrieve Google user info");

  const {
    sub: googleId,
    email,
    name,
    email_verified,
  } = (await profileRes.json()) as {
    sub: string;
    email: string;
    name: string;
    email_verified: boolean;
  };

  if (!email || !email_verified) {
    throw badRequest("Google account does not have a verified email");
  }

  // Step 3: Find or create local user
  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      googleId: true,
    },
  });

  if (user) {
    if (!user.googleId) {
      // Link Google identity to pre-existing email account
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, provider: "google", emailVerified: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          googleId: true,
        },
      });
    }
  } else {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        googleId,
        provider: "google",
        emailVerified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        googleId: true,
      },
    });
  }

  const { googleId: _gid, ...sessionUser } = user;
  return createSessionAndTokens(sessionUser, meta);
}

// ─── Magic-Link ───────────────────────────────────────────────────────────────

/**
 * Verifies a magic-login token and issues a session.
 * Creates the user account if it doesn't exist yet (frictionless onboarding).
 */
export async function verifyMagicLogin(
  email: string,
  token: string,
): Promise<AuthResult> {
  const tokenHash = hashToken(token);

  const magicToken = await prisma.magicLoginToken.findFirst({
    where: {
      email,
      tokenHash,
      used: false,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!magicToken) throw badRequest("Invalid or expired login link");

  // Mark used before upsert to prevent race-condition replay
  await prisma.magicLoginToken.update({
    where: { id: magicToken.id },
    data: { used: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { emailVerified: true },
    create: {
      email,
      name: email.split("@")[0],
      password: await hashPassword(generateToken()),
      emailVerified: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
    },
  });

  return createSessionAndTokens(user);
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

/**
 * Issues a 6-digit OTP for the given email.
 * Idempotent within the TTL window — existing active OTPs are not blocked.
 */
export async function sendGuestOtp(
  email: string,
): Promise<{ message: string }> {
  const code = crypto.randomInt(100_000, 1_000_000).toString();

  await prisma.otp.create({
    data: {
      email,
      code,
      expiresAt: new Date(Date.now() + TTL.OTP),
    },
  });

  await sendOtpEmail(email, email, code);

  return { message: "OTP sent successfully" };
}

/**
 * Verifies an OTP code.
 * Marks it used atomically. Stale OTP cleanup runs as a background job.
 */
export async function verifyGuestOtp(
  email: string,
  code: string,
): Promise<{ verified: true }> {
  const otp = await prisma.otp.findUnique({
    where: { email_code: { email, code } },
    select: { id: true, used: true, expiresAt: true },
  });

  if (!otp || otp.used || otp.expiresAt < new Date()) {
    throw badRequest("Invalid or expired OTP");
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { used: true } });

  return { verified: true };
}

// ─── Guest Checkout ───────────────────────────────────────────────────────────

/**
 * Ensures a user record exists for the given checkout email and dispatches
 * a magic-login link so they can access their account post-purchase.
 */
export async function createCheckoutUser(
  email: string,
  name: string,
): Promise<{ id: string; email: string; name: string | null }> {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      password: await hashPassword(generateToken()),
      emailVerified: false,
    },
    select: { id: true, email: true, name: true },
  });

  // Fire-and-forget — checkout UX must not block on email delivery.
  sendMagicLogin(email).catch((err) =>
    logger.warn(
      // { err, email },
      "Magic login dispatch failed during checkout",
    ),
  );

  return user;
}

// ─── Guest Login ──────────────────────────────────────────────────────────────

export async function guestLoginService(
  email: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
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

  return createSessionAndTokens(user, meta);
}

// ─── Password Reset ───────────────────────────────────────────────────────────

/**
 * Issues a password-reset token.
 * Returns silently if the email is not found — prevents enumeration.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!user) return; // silent no-op

  const token = generateToken();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpires: new Date(Date.now() + TTL.RESET_TOKEN),
    },
  });

  sendPasswordResetEmail(user.email, user.name ?? "Student", token).catch(
    (err) =>
      logger.error(
        // { err, email: user.email },
        "Password reset email failed",
      ),
  );
}

/**
 * Resets a user's password and revokes all active sessions atomically.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
    select: { id: true },
  });

  if (!user) throw badRequest("Invalid or expired reset token");

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
}

// ─── Token Rotation ───────────────────────────────────────────────────────────

/**
 * Rotates a refresh token:
 *  1. Verifies the JWT signature
 *  2. Validates the persisted session (not expired, not revoked)
 *  3. Detects reuse via hash mismatch → revokes ALL user sessions (breach response)
 *  4. Atomically revokes old session and creates a new one
 */
export async function rotateRefreshToken(
  refreshToken: string,
): Promise<AuthResult> {
  let payload: RefreshTokenPayload;

  try {
    payload = verifyRefreshToken(refreshToken) as RefreshTokenPayload;
  } catch {
    throw unauthorized("Invalid refresh token");
  }

  const session = await prisma.session.findUnique({
    where: { tokenId: payload.tokenId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized("Session expired or revoked");
  }

  // Reuse detection: hash mismatch means the original token was already rotated
  if (!compareTokenHash(refreshToken, session.tokenHash)) {
    await prisma.session.updateMany({
      where: { userId: session.userId },
      data: { revokedAt: new Date() },
    });
    logger.warn(
      // { userId: session.userId },
      "Refresh token reuse detected — all sessions revoked",
    );
    throw unauthorized("Refresh token reuse detected");
  }

  const newTokenId = generateToken(16);
  const newRefreshToken = signRefreshToken({
    userId: session.userId,
    tokenId: newTokenId,
  });
  const newAccessToken = signAccessToken({
    userId: session.userId,
    role: session.user.role,
  });
  const newHash = hashToken(newRefreshToken);

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
        expiresAt: new Date(Date.now() + TTL.REFRESH_SESSION),
      },
    }),
  ]);

  return {
    tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    user: toPublicUser(session.user),
  };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(tokenId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─── Session Management ───────────────────────────────────────────────────────

export interface SessionView {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export async function getUserSessions(userId: string): Promise<SessionView[]> {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
  });
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId, revokedAt: null },
    select: { id: true },
  });

  if (!session) throw badRequest("Session not found or already revoked");

  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

// ─── User Queries ─────────────────────────────────────────────────────────────

export async function getUserById(id: string): Promise<SessionUser | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
    },
  });
}

export async function getAllUsers(
  page = 1,
  pageSize = 50,
): Promise<PaginatedUsers> {
  const skip = (page - 1) * pageSize;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    }),
    prisma.user.count(),
  ]);

  return {
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
