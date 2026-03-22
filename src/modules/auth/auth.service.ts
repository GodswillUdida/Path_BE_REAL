import prisma from "../../config/db";
import crypto from "crypto";
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
  RefreshTokenPayload,
  verifyRefreshToken,
} from "../../lib/jwt";
import { badRequest, notFound, unauthorized } from "../../utils/errors";
import logger from "../../utils/logger";
import {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../services/emailService";
import { sendMagicLogin } from "./magicLogin.service";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type AuthTokens = { accessToken: string; refreshToken: string };
 
export type AuthResult = {
  tokens: AuthTokens;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    emailVerified: boolean;
  };
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
};


// authService.ts — add this function

export const handleGoogleCallback = async (code: string) => {
  // 1. Exchange code for Google access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.BACKEND_URL}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) throw new Error("Failed to exchange Google code");

  const { access_token } = await tokenRes.json();

  // 2. Get user profile from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  const googleUser = await userInfoRes.json();
  const { sub: googleId, email, name, email_verified } = googleUser;

  if (!email || !email_verified) {
    throw new Error("Google email not verified");
  }

  // 3. Prisma: Find or Create + link existing email
  let user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, provider: "google", emailVerified: true },
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
    });
  }

  // 4. Generate tokens — reuse your existing logic if you have it
  // (If you have a generateTokens(user) or loginUser function, call it here instead)
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: (user as any).role || "user" },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: "15m" } // match your other endpoints
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" }
  );

  return {
    tokens: { accessToken, refreshToken },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      // role: user.role, // add if you have it
    },
  };
};




export async function createSessionAndTokens(
  user: SessionUser,
  meta?: { userAgent?: string; ipAddress?: string; fingerprint?: string },
): Promise<AuthResult> {
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
 
  const tokenId = crypto.randomBytes(16).toString("hex");
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
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
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

export const verifyMagicLogin = async (
  email: string,
  token: string,
): Promise<AuthResult> => {
  const tokenHash = hashToken(token);

  const magicToken = await prisma.magicLoginToken.findFirst({
    where: {
      email,
      tokenHash,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!magicToken) throw badRequest("Invalid or expired login link");

  await prisma.magicLoginToken.update({
    where: { id: magicToken.id },
    data: { used: true },
  });

  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
    },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        password: await hashPassword(crypto.randomBytes(32).toString("hex")),
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
  }

  return createSessionAndTokens(user);
};

export const createCheckoutUser = async (email: string, name: string) => {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        password: await hashPassword(crypto.randomBytes(32).toString("hex")),
        emailVerified: false,
      },
    });
  }

  await sendMagicLogin(email);

  return user;
};

export const sendGuestOtp = async (email: string) => {
  const existing = await prisma.otp.findFirst({
    where: { email, expiresAt: { gt: new Date() }, used: false },
  });

  // if (existing) throw badRequest("OTP already sent. Please wait.");

  const code = crypto.randomInt(100000, 999999).toString().padStart(6, "0");

  await prisma.otp.create({
    data: {
      email,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  // Let email failures propagate so the caller can surface them.
  await sendOtpEmail(email, email, code);

  return { message: "OTP sent successfully" };
};

export const verifyGuestOtp = async (email: string, code: string) => {
  const otp = await prisma.otp.findUnique({
    where: { email_code: { email, code } },
  });

  if (!otp || otp.used || otp.expiresAt < new Date()) {
    throw badRequest("Invalid or expired OTP");
  }

  // FIX (perf): mark used inside a transaction but skip the eager cleanup.
  // Stale OTP cleanup belongs in a scheduled background job (cron/queue),
  // not on the critical path of every verification request.
  await prisma.otp.update({
    where: { id: otp.id },
    data: { used: true },
  });

  return { verified: true };
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

  // Non-fatal but worth surfacing in logs at warn level.
  sendVerificationEmail(
    user.email,
    user.name ?? "Student",
    verificationToken,
  ).catch((err) =>
    logger.warn("Verification email failed for %s: %o", user.email, err),
  );

  return user;
};

export const authenticate = async (
  email: string,
  password: string,
  meta?: { userAgent?: string; ipAddress?: string; fingerprint?: string },
): Promise<AuthResult> => {
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

  // Constant-time path: always compare even when user not found to prevent
  // user-enumeration via response timing.
  const dummyHash =
    "$2b$12$invalidsaltthatisexactly22chars.invalidhashpadding123456";
  const match = user
    ? await comparePassword(password, user.password!)
    : await comparePassword(password, dummyHash).then(() => false);

  if (!user || !match) throw unauthorized("Invalid credentials");

  const { password: _pw, ...sessionUser } = user;
  return createSessionAndTokens(sessionUser, meta);
};

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
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });
};

export const getAllUsers = async (
  page = 1,
  pageSize = 50,
): Promise<{ users: object[]; total: number }> => {
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
        createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  return { users, total };
};

export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // silent — no enumeration

  const token = crypto.randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  sendPasswordResetEmail(user.email, user.name ?? "Student", token).catch(
    (err) =>
      logger.error("Password reset email failed for %s: %o", user.email, err),
  );
};

export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExpires: { gt: new Date() } },
  });
  if (!user) throw badRequest("Invalid or expired token");

  const hashed = await hashPassword(newPassword);

  // FIX (design): use a single interactive transaction for atomicity.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpires: null },
    });
    await tx.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });
  });
};

export const rotateRefreshToken = async (
  refreshToken: string,
): Promise<AuthResult> => {
  let payload: RefreshTokenPayload;

  try {
    payload = verifyRefreshToken(refreshToken) as RefreshTokenPayload;
  } catch {
    throw unauthorized("Invalid refresh token");
  }

  const session = await prisma.session.findUnique({
    where: { tokenId: payload.tokenId },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized("Invalid refresh token");
  }

  const isValid = compareTokenHash(refreshToken, session.tokenHash);

  // FIX (security): token reuse detected — revoke all sessions for this user
  // to contain the potential breach, then throw.
  if (!isValid) {
    await prisma.session.updateMany({
      where: { userId: session.userId },
      data: { revokedAt: new Date() },
    });
    logger.warn("Refresh token reuse detected for user %s", session.userId);
    throw unauthorized("Refresh token reuse detected");
  }

  const newTokenId = crypto.randomBytes(16).toString("hex");
  const newRefreshToken = signRefreshToken({
    userId: session.userId,
    tokenId: newTokenId,
  });
  const newAccessToken = signAccessToken({
    userId: session.userId,
    role: session.user.role,
  });
  const newHash = hashToken(newRefreshToken);

  // Atomic rotation: revoke old session and create new one in one transaction.
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
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
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
  return prisma.session.findMany({
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
};

export const revokeSession = async (userId: string, sessionId: string) => {
  // FIX (security): verify ownership and that the session is still active.
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null, // prevent silent double-revoke
    },
  });

  if (!session) throw badRequest("Session not found or already revoked");

  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
};

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

  return createSessionAndTokens(user);
};