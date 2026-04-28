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
import {
  hashPassword,
  hashToken,
  compareTokenHash,
  comparePassword,
} from "../../utils/hash";
import {
  signAccessToken,
  signRefreshToken,
  signVerifiedToken,
  verifyRefreshToken,
  verifyVerifiedToken,
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
import { RequestMeta } from "../../types/auth.types";
import { CompleteGuestProfileDto } from "./checkout.schema";

/** Minimum seconds a user must wait before requesting another OTP. */
const OTP_RESEND_COOLDOWN_MS = 60_000; // 60 s

/** Max OTP attempts before the record is locked. */
const OTP_MAX_ATTEMPTS = 5;


export async function createSessionAndTokens(
  user: SessionUser,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    // emailVerified: user.emailVerified,
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

  console.log("Generated OTP for verification:", otp); // Log OTP for testing; remove in production!
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
  // try {
  //   await sendOtpEmail({ to: email, name, code: otp });
  // } catch (err) {
  //   logger.error("Failed to send verification email", {
  //     email,
  //     error: (err as Error).message,
  //     stack: (err as Error).stack,

  //   });
  //   // await prisma.user.delete({ where: { id: user.id } });
  //   await prisma.user.update({
  //     where: { id: user.id },
  //     data: { emailVerified: false },
  //   });
  //   throw new Error("Failed to send verification email");
  // }
  return user;
};

export async function verifyEmail(
  email: string,
  code: string,
  meta?: RequestMeta,
): Promise<any> {
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

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: true,
  }
  // createSessionAndTokens(
  // {
  //   id: user.id,
  //   name: user.name,
  //   email: user.email,
  //   role: user.role,
  //   emailVerified: true,
  // },
  // meta,
  // );
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

  console.log("Resend Verification: ", otp)

  await prisma.user.update({
    where: { email },
    data: { verificationToken: otpHash, verificationExpires },
  });

  // try {
  //   await sendOtpEmail({ to: email, name: user.name!, code: otp });
  // } catch (err) {
  //   logger.error("Failed to resend verification email", {
  //     email,
  //     error: (err as Error).message,
  //     stack: (err as Error).stack,
  //   });
  //   throw new Error("Failed to resend verification email");

  // }
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
  userId?: string | null,
): Promise<{ message: string, code: string }> {

  // if (userId) {
  //   return { message: "Already authenticated — proceed to checkout." };
  // }

  const recent = await prisma.otp.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, expiresAt: true, used: true },
  });

  if (recent && !recent.used) {
    const elapsed = Date.now() - recent.createdAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const waitSecs = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw badRequest(`Please wait ${waitSecs}s before requesting another code.`);
      // throw tooManyRequests(
      //   `Please wait ${waitSecs}s before requesting another code.`,
      // );
    }
  }

  const code = generateOTP();
  const hashedOtp = hashOTP(code);
  const expiresAt = new Date(Date.now() + TTL.OTP);

  console.log("Checkout OTP :", code)

  // Delete stale records then insert fresh — wrapped in a transaction so we
  // never leave the table in a half-cleaned state.
  await prisma.$transaction([
    prisma.otp.deleteMany({ where: { email } }),
    prisma.otp.create({
      data: { email, code: hashedOtp, expiresAt, used: false, attempts: 0 },
    }),
  ]);

  // try {
  //   await sendOtpEmail({ to: email, code });
  // } catch (err) {
  //   await prisma.otp.deleteMany({ where: { email } }).catch(() => void 0);
  //   logger.error("Failed to send checkout OTP email", {
  //     email,
  //     error: (err as Error).message,
  //     stack: (err as Error).stack,
  //   });
  //   throw new Error("Unable to send OTP email. Please try again.");
  // }


  return { message: "A verification code has been sent to your email.", code };
}

export async function verifyCheckoutOtp(
  email: string,
  code: string,
): Promise<{ verifiedToken: string }> {
  const otp = await prisma.otp.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw badRequest("No verification code was found for this email. Please request a new one.");
  }

  if (otp.used) {
    throw badRequest("This code has already been used.");
  }

  if (otp.expiresAt < new Date()) {
    throw badRequest("Verification code has expired. Please request a new one.");
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw badRequest("Too many failed attempts. Please request a new verification code.");
  }

  console.log("Checkout code:", code)

  const isValid = compareTokenHash(code, otp.code);

  if (!isValid) {
    await prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: otp.attempts + 1 },
    });

    const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    throw badRequest(
      remaining > 0
        ? `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "Too many failed attempts. Please request a new code.",
    );
  }

  await prisma.$transaction([
    prisma.otp.update({
      where: { id: otp.id },
      data: { used: true },
    }),
  ]);

  const verifiedToken = signVerifiedToken({ email, purpose: "guest-checkout" });

  return { verifiedToken };

}

export async function completeGuestProfile(dto: CompleteGuestProfileDto): Promise<AuthResult> {

  const payload = verifyVerifiedToken(dto.verifiedToken);

  if (
    !payload ||
    payload.email !== dto.email ||
    payload.purpose !== "guest-checkout"
  ) {
    throw badRequest("Invalid or expired verification session. Please restart.");
  }

  const generatePassword = crypto.randomBytes(32).toString("hex");;

  const user = await prisma.user.upsert({
    where: { email: dto.email },
    create: {
      email: dto.email,
      name: dto.name,
      phone: dto.phone ?? null,
      accounts: {
        create: {
          provider: "checkout",
          providerId: dto.email,
          password: generatePassword,
        },
      },
      emailVerified: true,
    },
    update: {
      // Only update profile fields if the user already exists.
      name: dto.name,
      phone: dto.phone ?? null,
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

  // Promote to a real session — same path as a registered login.
  return createSessionAndTokens(user as SessionUser);
}

export async function createMagicLoginToken(
  email: string,
): Promise<{ message: string; token: string; expiresAt: Date }> {

  const token = generateMagicToken();
  const tokenHash = hashToken(token);
  // const expiresAt = new Date(Date.now() + TTL.MAGIC_LINK ?? 15 * 60 * 1000);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  //   await prisma.magicLoginToken.upsert({
  //   where: { email },
  //   create: { email, tokenHash, expiresAt, used: false },
  //   update: { tokenHash, expiresAt, used: false },
  // });

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

  return {
    message: "If an account with that email exists, a magic login link has been sent.",
    token, // Expose token for testing purposes; remove in production!
    expiresAt, // Expose expiry for testing purposes; remove in production!
  };
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

  console.log("Reset Password Token: ", rawToken)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: rawToken,
      resetTokenExpires: new Date(Date.now() + TTL.RESET_TOKEN),
    },
  });

  // sendPasswordResetEmail(user.email, user.name ?? "Student", rawToken).catch(
  //   (err) => logger.error("Password reset email failed", err.message),
  // );
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
  // const payload = verifyRefreshToken(refreshToken);

  // if (!payload) {
  //   throw unauthorized("Invalid refresh token");
  // }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized("Invalid refresh token");
  }

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
