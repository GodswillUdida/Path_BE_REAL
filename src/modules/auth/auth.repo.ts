import { Prisma, User } from "@prisma/client";
import prisma from "../../config/db";
import {
  SessionUser,
  SessionView,
  PaginatedResult,
  PublicUser,
} from "../../types/auth.types";

// ─── User selects ─────────────────────────────────────────────────────────────

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
} satisfies Prisma.UserSelect;

const SESSION_USER_SELECT = {
  ...PUBLIC_USER_SELECT,
  password: true,
} satisfies Prisma.UserSelect;

// ─── User queries ─────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: SESSION_USER_SELECT,
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      ...PUBLIC_USER_SELECT,
      createdAt: true,
    },
  });
}

export async function findUserByVerificationToken(token: string) {
  return prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationExpires: { gt: new Date() },
    },
    select: { id: true },
  });
}

export async function findUserByResetToken(token: string) {
  return prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: { gt: new Date() },
    },
    select: { id: true },
  });
}

export async function findUserByGoogleId(googleId: string) {
  return prisma.user.findUnique({
    where: { googleId },
    select: PUBLIC_USER_SELECT,
  });
}

// ─── User mutations ───────────────────────────────────────────────────────────

export async function createCredentialsUser(data: {
  name: string;
  email: string;
  hashedPassword: string;
  verificationToken: string;
  verificationExpires: Date;
}) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: data.hashedPassword,
      verificationToken: data.verificationToken,
      verificationExpires: data.verificationExpires,
    },
    select: { id: true, name: true, email: true },
  });
}

export async function createGoogleUser(data: {
  email: string;
  name: string;
  googleId: string;
}) {
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      googleId: data.googleId,
      provider: "google",
      emailVerified: true,
    },
    select: PUBLIC_USER_SELECT,
  });
}

export async function createMagicLinkUser(data: {
  email: string;
  hashedPassword: string;
}) {
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.email.split("@")[0],
      password: data.hashedPassword,
      emailVerified: true,
    },
    select: PUBLIC_USER_SELECT,
  });
}

export async function linkGoogleAccount(
  userId: string,
  googleId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { googleId, provider: "google", emailVerified: true },
  });
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationExpires: null,
    },
  });
}

export async function setResetToken(
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { resetToken: token, resetTokenExpires: expiresAt },
  });
}

export async function resetUserPassword(
  userId: string,
  hashedPassword: string,
): Promise<void> {
  // Atomic: update password + revoke all sessions
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    }),
    prisma.session.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function setVerificationToken(
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { verificationToken: token, verificationExpires: expiresAt },
  });
}

// ─── User listing ─────────────────────────────────────────────────────────────

export async function listUsers(
  page: number,
  pageSize: number,
): Promise<PaginatedResult<PublicUser & { createdAt: Date }>> {
  const skip = (page - 1) * pageSize;

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: { ...PUBLIC_USER_SELECT, createdAt: true },
    }),
    prisma.user.count(),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Session queries ──────────────────────────────────────────────────────────

export async function createSession(data: {
  userId: string;
  tokenId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  fingerprint?: string;
}) {
  return prisma.session.create({ data });
}

export async function findSessionByTokenId(tokenId: string) {
  return prisma.session.findUnique({
    where: { tokenId },
    include: {
      user: { select: PUBLIC_USER_SELECT },
    },
  });
}

export async function findActiveSessionById(sessionId: string, userId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, userId, revokedAt: null },
  });
}

export async function rotateSession(
  oldSessionId: string,
  newSession: {
    userId: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
    fingerprint?: string | null;
  },
) {
  return prisma.$transaction([
    prisma.session.update({
      where: { id: oldSessionId },
      data: { revokedAt: new Date() },
    }),
    prisma.session.create({ data: newSession }),
  ]);
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeSessionByTokenId(tokenId: string): Promise<void> {
  await prisma.session.update({
    where: { tokenId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId },
    data: { revokedAt: new Date() },
  });
}

export async function listActiveSessions(
  userId: string,
): Promise<SessionView[]> {
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

// ─── Magic link queries ───────────────────────────────────────────────────────

export async function findValidMagicToken(email: string, tokenHash: string) {
  return prisma.magicLoginToken.findFirst({
    where: { email, tokenHash, used: false, expiresAt: { gt: new Date() } },
  });
}

export async function markMagicTokenUsed(id: string): Promise<void> {
  await prisma.magicLoginToken.update({
    where: { id },
    data: { used: true },
  });
}

// ─── OTP queries ──────────────────────────────────────────────────────────────

export async function findActiveOtp(email: string) {
  return prisma.otp.findFirst({
    where: { email, used: false, expiresAt: { gt: new Date() } },
  });
}

export async function createOtp(email: string, code: string, expiresAt: Date) {
  return prisma.otp.create({ data: { email, code, expiresAt } });
}

export async function findOtpByEmailAndCode(email: string, code: string) {
  return prisma.otp.findUnique({
    where: { email_code: { email, code } },
  });
}

export async function markOtpUsed(id: string): Promise<void> {
  await prisma.otp.update({ where: { id }, data: { used: true } });
}
