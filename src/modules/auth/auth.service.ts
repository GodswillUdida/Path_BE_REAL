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
import prisma from "../../lib/prisma";
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
} from "../../lib/jwt";
import { badRequest, notFound, unauthorized } from "../../utils/errors";
import logger from "../../utils/logger";
import {
  sendOtpEmail,
  sendPasswordResetEmail,
} from "../../services/emailService";
import { ResetPasswordDTO } from "./auth.schema";
import { AuthResult, GoogleProfile, PaginatedUsers, SessionUser, SessionView } from "./types";
import { DUMMY_HASH, generateMagicToken, generateOTP, generateToken, hashOTP, toPublicUser, TTL } from "./config";
import { RequestMeta } from "types/auth.types";
import { CompleteGuestProfileDto } from "./checkout.schema";


export async function createSessionAndTokens(
  user: SessionUser,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    emailVerified: user.emailVerified,
  });

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
      provider: "credentials",
      expiresAt: new Date(Date.now() + TTL.REFRESH_SESSION),
    },
  });

  return {
    tokens: { accessToken, refreshToken },
    user: toPublicUser(user),
  };
}

export const processGoogleOAuth = async (
  profile: GoogleProfile,
  meta: RequestMeta,
): Promise<AuthResult> => {
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || email?.split("@")[0];
  const avatar = profile.photos?.[0]?.value;
  const googleId = profile.id;
  const emailVerified = profile._json?.email_verified === true;

  if (!email) throw badRequest("Google account has no email");
  if (!emailVerified) throw unauthorized("Google email not verified");

  // 1. Check if Google account already exists
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerId: {
        provider: "google",
        providerId: googleId,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    return createSessionAndTokens(existingAccount.user, meta);
  }

  // 2. Check if user exists by email
  let user = await prisma.user.findUnique({
    where: { email },
  });

  // 3. If not, create user
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        accounts: {
          create: {
            provider: "credentials",
            providerId: email,
            password: null,
          },
        },
        profileImage: avatar,
        emailVerified: true,
      },
    });
  }

  // 4. Link Google account
  await prisma.account.create({
    data: {
      userId: user.id,
      provider: "google",
      providerId: googleId,
    },
  });

  return createSessionAndTokens(user, meta);
};

export async function createUser(
  name: string,
  email: string,
  password: string,
): Promise<Pick<SessionUser, "id" | "name" | "email">> {
  // 1. Check existing user
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw badRequest("Email already registered");

  // 2. Hash password and generate OTP in parallel
  const [hashedPassword, otp] = await Promise.all([
    hashPassword(password),
    Promise.resolve(generateOTP()),
  ]);
  // 3. Generate fresh 6-digit OTP
  const otpHash = hashOTP(otp);
  const verificationExpires = new Date(Date.now() + TTL.OTP);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      accounts: {
        create: {
          provider: "credentials",
          providerId: email,
          password: hashedPassword,
        },
      },
      emailVerified: false,
      verificationToken: otpHash,
      verificationExpires,
    },
    select: { id: true, name: true, email: true },
  });
  // 5. Send OTP (async, non-blocking)
  try {
    await sendOtpEmail({ to: email, name, code: otp });
  } catch (err) {
    logger.error("Failed to send verification email", {
      email,
      error: (err as Error).message,
      stack: (err as Error).stack,

    });
    // await prisma.user.delete({ where: { id: user.id } });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: false },
    });
    throw new Error("Failed to send verification email");
  }
  return user;
};

export async function verifyEmail(
  email: string,
  code: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const otpHash = hashOTP(code);

  const user = await prisma.user.findFirst({
    where: {
      email,
      verificationToken: otpHash,
      verificationExpires: { gt: new Date() },
    },
  });

  if (!user) throw badRequest("Invalid or expired verification code");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationExpires: null,
    },
  });

  return createSessionAndTokens(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: true,
    },
    meta,
  );
};

export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true, name: true },
  });

  if (!user) throw badRequest("User not found");
  if (user.emailVerified) throw badRequest("Email is already verified");

  const otp = generateOTP();
  const otpHash = hashOTP(otp);
  const verificationExpires = new Date(Date.now() + TTL.OTP);

  await prisma.user.update({
    where: { email },
    data: { verificationToken: otpHash, verificationExpires },
  });

  try {
    await sendOtpEmail({ to: email, name: user.name!, code: otp });
  } catch (err) {
    logger.error("Failed to resend verification email", {
      email,
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw new Error("Failed to resend verification email");

  }
};

export async function authenticate(
  email: string,
  password: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      accounts: {
        where: { provider: "credentials" },
        select: { password: true },
      },
    },
  });

  // Always do password comparison to mitigate timing attacks, even if user not found
  const hashedPassword = user?.accounts[0]?.password || DUMMY_HASH;
  const passwordMatch = await comparePassword(password, hashedPassword);
  if (!user || !passwordMatch) {
    throw unauthorized("Invalid email or password");
  }

  if (!user.emailVerified) {
    throw unauthorized("Email not verified");
  }

  const { accounts: _accounts, ...sessionUser } = user;

  return createSessionAndTokens(sessionUser, meta);
};

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
    // logger.error(
    //   // { status: tokenRes.status },
    //   "Google token exchange failed",
    // );
    // throw badRequest("Failed to exchange Google authorization code");
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
};

export async function sendCheckoutOtp(
  email: string,
  userId?: string,
): Promise<{ message: string }> {

  if (userId) {
    return { message: "User already authenticated" };
  }

  const code = crypto.randomInt(100_000, 1_000_000).toString();
  const hashedOtp = hashOTP(code)

  await prisma.otp.deleteMany({ where: { email } });

  await prisma.otp.create({
    data: {
      email,
      code: hashedOtp,
      expiresAt: new Date(Date.now() + TTL.OTP),
      used: false,
    },
  });

  // await prisma.otp.upsert({
  //   where: { email_code: { email, code: "" } },
  //   update: { code, expiresAt: new Date(Date.now() + TTL.OTP), used: false },
  //   create: { email, code, expiresAt: new Date(Date.now() + TTL.OTP) },
  // });

  try {
    await sendOtpEmail({ to: email, code, name: "" });
  } catch (err) {
    logger.error("Failed to send checkout OTP email", {
      email,
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw new Error("Failed to send OTP email");
  }


  return { message: "OTP sent successfully" };
}

export async function verifyCheckoutOtp(
  email: string,
  code: string,
): Promise<{ verified: true; tempUserId?: string }> {
  const otp = await prisma.otp.findUnique({
    where: { email_code: { email, code } },
  });

  if (!otp || otp.used || otp.expiresAt < new Date()) {
    throw badRequest("Invalid or expired OTP");
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { used: true } });

  // Create provisional guest user immediately after OTP (emailVerified = true)
  // const provisional = await prisma.user.upsert({
  //   where: { email },
  //   update: { emailVerified: true, provider: "checkout" },
  //   create: {
  //     email,
  //     name: email.split("@")[0],
  //     password: await hashPassword(crypto.randomBytes(32).toString("hex")),
  //     emailVerified: true,
  //     provider: "checkout",
  //   },
  //   select: { id: true },
  // });


  // optionally cache verified email (redis recommended)

  return { verified: true };
}

export async function completeGuestProfile(dto: CompleteGuestProfileDto): Promise<SessionUser> {
  const user = await prisma.user.update({
    where: { email: dto.email },
    data: {
      name: dto.name,
      phone: dto.phone ?? null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
    },
  });

  if (!user) throw notFound("User not found");
  return user;
}

export async function createMagicLoginToken(
  email: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateMagicToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const existingToken = await prisma.magicLoginToken.findFirst({
    where: { email },
  });

  if (existingToken) {
    await prisma.magicLoginToken.update({
      where: { id: existingToken.id },
      data: { tokenHash, used: false, expiresAt },
    });
  } else {
    await prisma.magicLoginToken.create({
      data: { email, tokenHash, expiresAt },
    });
  }

  return { token, expiresAt };
}

export async function verifyMagicLogin(
  email: string,
  token: string,
): Promise<AuthResult> {
  const tokenHash = hashToken(token);

  const magic = await prisma.magicLoginToken.findFirst({
    where: { email, tokenHash, used: false, expiresAt: { gt: new Date() } },
  });

  if (!magic) throw badRequest("Invalid or expired magic token");

  await prisma.magicLoginToken.update({
    where: { id: magic.id },
    data: { used: true },
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw notFound("User not found");

  return createSessionAndTokens(user);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!user) return; // silent no-op

  const rawToken = generateToken();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: rawToken,
      resetTokenExpires: new Date(Date.now() + TTL.RESET_TOKEN),
    },
  });

  sendPasswordResetEmail(user.email, user.name ?? "Student", rawToken).catch(
    (err) => logger.error("Password reset email failed", err.message),
  );
}

export async function verifyPasswordResetToken(
  token: string,
): Promise<boolean> {
  if (!token || token.length < 32) return false;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: { gt: new Date() },
    },
    select: { id: true },
  });

  return !!user;
}

export async function resetPassword(dto: ResetPasswordDTO): Promise<void> {
  const { token, newPassword } = dto;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!user) throw badRequest("Invalid or expired reset token");

  const hashed = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        accounts: {
          updateMany: {
            where: { provider: "credentials" },
            data: { password: hashed },
          },
        },
        resetToken: null,
        resetTokenExpires: null,
      },
    }),
    prisma.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function rotateRefreshToken(
  refreshToken: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);

  // Atomic check and revocation
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenId: payload.tokenId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized("Invalid session");
    }

    // Reuse Detection: If hashes don't match, this token was already used
    if (!compareTokenHash(refreshToken, session.tokenHash)) {
      await tx.session.updateMany({
        where: { userId: session.userId },
        data: { revokedAt: new Date() },
      });
      throw unauthorized("Security breach detected. Please login again.");
    }

    // Revoke old session
    await tx.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Create new session
    return createSessionAndTokens(session.user, meta);
  });

  return result;
}

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
