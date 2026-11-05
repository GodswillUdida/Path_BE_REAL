/**
 * Pure data-access layer. No business logic, no token signing, no email.
 * Rules:
 *  - Check-then-act is replaced with conditional updateMany + count check.
 *  - Interactive transactions use `tx` exclusively (never the global client).
 *  - Never return secret columns (hashes, reset/verification tokens).
 */
import { Prisma, Role } from "@prisma/client";
import prisma from "../../lib/prisma";
import { sessionUserSelect, type SessionUser } from "./auth.select";

export class AccountDisabledError extends Error {
  constructor() {
    super("ACCOUNT_DISABLED");
    this.name = "AccountDisabledError";
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

const userWithDeletedAt = {
  ...sessionUserSelect,
  deletedAt: true,
} satisfies Prisma.UserSelect;

interface GoogleUserInput {
  email: string; // already normalized
  name?: string | null;
  avatar?: string | null;
  googleId: string;
}

export class AuthRepository {
  // ─── User ──────────────────────────────────────────────────────────────
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: {
        ...sessionUserSelect,
        accounts: {
          where: { provider: "credentials" },
          select: { password: true },
        },
      },
    });
  }

  /** Lightweight lookup for flows that never need the password hash. */
  async findActiveUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true, name: true, email: true, emailVerified: true },
    });
  }

  async findUserById(id: string): Promise<SessionUser | null> {
    return prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: sessionUserSelect,
    });
  }

  /** Caller (sessionGuard) must treat deletedAt !== null as unauthenticated. */
  async findAuthState(
    userId: string,
  ): Promise<{ role: Role; deletedAt: Date | null } | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true },
    });
  }

  /** Nested create is already atomic; no $transaction needed. */
  async createCredentialsUser(data: {
    name: string;
    email: string;
    hashedPassword: string;
    otpHash: string;
    verificationExpires: Date;
  }) {
    return prisma.user.create({
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
  }

  /**
   * Atomic OTP consume: a single conditional UPDATE, so two concurrent
   * requests with the same code cannot both succeed.
   */
  async verifyEmailByOtp(
    email: string,
    otpHash: string,
    now: Date,
  ): Promise<SessionUser | null> {
    const { count } = await prisma.user.updateMany({
      where: {
        email,
        deletedAt: null,
        emailVerified: false,
        verificationToken: otpHash,
        verificationExpires: { gt: now },
      },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });
    if (count === 0) return null;

    return prisma.user.findUnique({
      where: { email },
      select: sessionUserSelect,
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
      select: { id: true },
    });
  }

  // ─── Password reset ────────────────────────────────────────────────────
  async setResetToken(userId: string, tokenHash: string, expires: Date) {
    return prisma.user.update({
      where: { id: userId },
      data: { resetToken: tokenHash, resetTokenExpires: expires },
      select: { id: true },
    });
  }

  async findUserByResetToken(tokenHash: string) {
    return prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpires: { gt: new Date() },
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  /**
   * Single-use under concurrency: the token is claimed by a conditional
   * updateMany; only the request that flips it proceeds. Password change and
   * session revocation commit together.
   */
  async consumeResetToken(
    tokenHash: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.user.findFirst({
        where: { resetToken: tokenHash, deletedAt: null },
        select: { id: true },
      });
      if (!candidate) return false;

      const claimed = await tx.user.updateMany({
        where: {
          id: candidate.id,
          resetToken: tokenHash,
          resetTokenExpires: { gt: new Date() },
        },
        data: { resetToken: null, resetTokenExpires: null },
      });
      if (claimed.count !== 1) return false;

      await tx.account.updateMany({
        where: { userId: candidate.id, provider: "credentials" },
        data: { password: hashedPassword },
      });
      await tx.session.updateMany({
        where: { userId: candidate.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
  }

  // ─── Google / account linking ──────────────────────────────────────────
  async findOrCreateGoogleUser(data: GoogleUserInput): Promise<SessionUser> {
    try {
      return await this.upsertGoogleUser(data);
    } catch (err) {
      // Two concurrent first-time logins: the loser hits a unique constraint.
      // The winner's rows are committed now, so one retry resolves it.
      if (isUniqueViolation(err)) return this.upsertGoogleUser(data);
      throw err;
    }
  }

  private upsertGoogleUser(data: GoogleUserInput): Promise<SessionUser> {
    return prisma.$transaction(async (tx) => {
      // 1. Known Google account
      const account = await tx.account.findUnique({
        where: {
          provider_providerId: { provider: "google", providerId: data.googleId },
        },
        select: { user: { select: userWithDeletedAt } },
      });

      if (account) {
        const { deletedAt, ...user } = account.user;
        if (deletedAt) throw new AccountDisabledError();

        // Fill gaps only; never clobber values the user edited themselves.
        const name = user.name ?? data.name ?? null;
        const profileImage = user.profileImage ?? data.avatar ?? null;
        if (name === user.name && profileImage === user.profileImage) {
          return user;
        }
        return tx.user.update({
          where: { id: user.id },
          data: { name, profileImage },
          select: sessionUserSelect,
        });
      }

      // 2. Existing email → link
      const existing = await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true, emailVerified: true, deletedAt: true },
      });

      if (existing) {
        if (existing.deletedAt) throw new AccountDisabledError();

        // Pre-registration takeover defence: an unverified row may have been
        // created by someone who does not own the mailbox. Drop their
        // credentials and sessions before trusting the Google-verified email.
        if (!existing.emailVerified) {
          await tx.account.deleteMany({
            where: { userId: existing.id, provider: "credentials" },
          });
          await tx.session.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        await tx.account.create({
          data: {
            userId: existing.id,
            provider: "google",
            providerId: data.googleId,
          },
        });

        return tx.user.update({
          where: { id: existing.id },
          data: {
            emailVerified: true,
            verificationToken: null,
            verificationExpires: null,
            resetToken: null,
            resetTokenExpires: null,
          },
          select: sessionUserSelect,
        });
      }

      // 3. Brand-new user (role uses the schema default)
      return tx.user.create({
        data: {
          email: data.email,
          name: data.name ?? null,
          profileImage: data.avatar ?? null,
          emailVerified: true,
          accounts: {
            create: { provider: "google", providerId: data.googleId },
          },
        },
        select: sessionUserSelect,
      });
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
    return prisma.session.create({ data, select: { id: true } });
  }

  async findSessionByTokenId(tokenId: string) {
    return prisma.session.findUnique({
      where: { tokenId },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        revokedAt: true,
        expiresAt: true,
        provider: true,
        user: { select: userWithDeletedAt },
      },
    });
  }

  /** Atomic claim used by refresh rotation. false = already revoked/expired. */
  async claimSessionForRotation(id: string): Promise<boolean> {
    const now = new Date();
    const { count } = await prisma.session.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  /** Scoped to the owner. false = not found / not yours / already revoked. */
  async revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1;
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
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        provider: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  // ─── Admin ─────────────────────────────────────────────────────────────
  async paginateUsers(page: number, pageSize: number) {
    const where = { deletedAt: null } satisfies Prisma.UserWhereInput;
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], // stable paging
        select: sessionUserSelect,
      }),
      prisma.user.count({ where }),
    ]);
    return {
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

export const authRepository = new AuthRepository();