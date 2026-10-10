/**
 * Pure data-access layer. No business logic, no token signing, no email.
 * Every method is transactional when it mutates >1 table.
 */
import prisma from "../../lib/prisma";
import type { SessionUser } from "./types";

export class AuthRepository {
  // ─── User ──────────────────────────────────────────────────────────────
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        accounts: {
          where: { provider: "credentials" },
          select: { password: true },
        },
      },
    });
  }

  async findUserById(id: string): Promise<SessionUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        profileImage: true,
      },
    });
  }

  async createCredentialsUser(data: {
    name: string;
    email: string;
    hashedPassword: string;
    otpHash: string;
    verificationExpires: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          emailVerified: false,
          verificationToken: data.otpHash,
          verificationExpires: data.verificationExpires,
          accounts: {
            create: {
              provider: "credentials",
              providerId: data.email,
              password: data.hashedPassword,
            },
          },
        },
        select: { id: true, name: true, email: true },
      });
    });
  }

  async findVerificationUser(email: string, otpHash: string, now: Date) {
    return prisma.user.findFirst({
      where: {
        email,
        verificationToken: otpHash,
        verificationExpires: { gt: now },
        emailVerified: false,
      },
    });
  }

  async markEmailVerified(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });
  }

  async updateVerificationToken(
    email: string,
    otpHash: string,
    expires: Date,
  ) {
    return prisma.user.update({
      where: { email },
      data: { verificationToken: otpHash, verificationExpires: expires },
    });
  }

  // ─── Password Reset ────────────────────────────────────────────────────
  async setResetToken(userId: string, tokenHash: string, expires: Date) {
    return prisma.user.update({
      where: { id: userId },
      data: { resetToken: tokenHash, resetTokenExpires: expires },
    });
  }

  async findUserByResetToken(tokenHash: string) {
    return prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpires: { gt: new Date() },
      },
      select: { id: true },
    });
  }

  async resetPasswordAndRevokeSessions(
    userId: string,
    hashedPassword: string,
  ) {
    return prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          resetToken: null,
          resetTokenExpires: null,
          accounts: {
            updateMany: {
              where: { provider: "credentials" },
              data: { password: hashedPassword },
            },
          },
        },
      }),
      prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ─── Google / Account linking ──────────────────────────────────────────
  async findAccountByProvider(provider: string, providerId: string) {
    return prisma.account.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });
  }

  async findOrCreateGoogleUser(data: {
    email: string;
    name?: string | null;
    avatar?: string | null;
    googleId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Existing Google account → return user
      const existingAccount = await tx.account.findUnique({
        where: {
          provider_providerId: {
            provider: "google",
            providerId: data.googleId,
          },
        },
        include: { user: true },
      });
      if (existingAccount) return existingAccount.user;

      // 2. Existing email → just link Google account
      let user = await tx.user.findUnique({ where: { email: data.email } });
      if (user) {
        await tx.account.create({
          data: {
            userId: user.id,
            provider: "google",
            providerId: data.googleId,
          },
        });
        return user;
      }

      // 3. Brand-new user
      user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          profileImage: data.avatar,
          emailVerified: true,
          accounts: {
            create: {
              provider: "google",
              providerId: data.googleId,
            },
          },
        },
      });
      return user;
    });
  }

  // ─── Session ───────────────────────────────────────────────────────────
  async createSession(data: {
    userId: string;
    tokenId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    fingerprint?: string;
    provider: string;
    expiresAt: Date;
  }) {
    return prisma.session.create({ data });
  }

  async findSessionByTokenId(tokenId: string) {
    return prisma.session.findUnique({
      where: { tokenId },
      include: { user: true },
    });
  }

  async revokeSession(id: string) {
    return prisma.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByTokenId(tokenId: string) {
    return prisma.session.updateMany({
      where: { tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listActiveSessions(userId: string) {
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
        provider: true,
      },
    });
  }

  // ─── Admin ─────────────────────────────────────────────────────────────
  async paginateUsers(page: number, pageSize: number) {
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
      prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}

export const authRepository = new AuthRepository();