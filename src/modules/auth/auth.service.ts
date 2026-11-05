/**
 * Business logic only. All DB access goes through AuthRepository.
 *
 * Rules:
 *  - Session creation is always outside any interactive transaction.
 *  - Email enqueue is fire-and-forget; failures are logged, never thrown.
 *  - Credential login performs a constant-time-ish compare even when the
 *    user is missing (DUMMY_HASH).
 */
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
import type { RegisterDTO, ResetPasswordDTO } from "./auth.schema";
import type {
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
import type { RequestMeta } from "../../types/auth.types";
import { enqueueAuthEmail } from "./email.queue";
import {
  AccountDisabledError,
  authRepository,
  isUniqueViolation,
} from "./auth.repo";
import { clearOtpAttempts, consumeOtpAttempt } from "./otp-guard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pickGoogleEmail(profile: GoogleProfile) {
  const emails = profile.emails ?? [];
  return (
    emails.find((e) => e.verified === true) ??
    emails.find((e) => e.verified !== false) ??
    emails[0]
  );
}

/** Prefer verified addresses; never invent one. */
function extractGoogleEmail(profile: GoogleProfile): string | null {
  const candidate = pickGoogleEmail(profile)?.value ?? profile._json?.email;
  return typeof candidate === "string" && candidate.length > 0
    ? normalizeEmail(candidate)
    : null;
}

function isGoogleEmailExplicitlyUnverified(profile: GoogleProfile): boolean {
  return (
    profile._json?.email_verified === false ||
    pickGoogleEmail(profile)?.verified === false
  );
}

function enqueueEmailSafe(
  job: Parameters<typeof enqueueAuthEmail>[0],
  context: Record<string, unknown>,
): void {
  enqueueAuthEmail(job).catch((err: unknown) => {
    logger.error("AUTH_EMAIL_ENQUEUE_FAILED", {
      ...context,
      type: job.type,
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

// ─── Session + tokens (never inside $transaction) ────────────────────────────

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

  await authRepository.createSession({
    userId: user.id,
    tokenId,
    tokenHash: hashToken(refreshToken),
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

// ─── Registration ────────────────────────────────────────────────────────────

export async function createUser(
  dto: RegisterDTO,
): Promise<Pick<SessionUser, "id" | "name" | "email">> {
  const email = normalizeEmail(dto.email);
  const hashedPassword = await hashPassword(dto.password);
  const otp = generateOTP();

  let user: Pick<SessionUser, "id" | "name" | "email">;
  try {
    // The unique constraint is the source of truth; no check-then-insert race.
    user = await authRepository.createCredentialsUser({
      name: dto.name,
      email,
      hashedPassword,
      otpHash: hashOTP(otp),
      verificationExpires: new Date(Date.now() + TTL.OTP),
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw badRequest("Email already registered");
    throw err;
  }

  enqueueEmailSafe(
    { type: "welcome", to: user.email, name: user.name ?? "there", code: otp },
    { userId: user.id, flow: "register" },
  );

  return { id: user.id, name: user.name, email: user.email };
}

// ─── Email verification ──────────────────────────────────────────────────────

export async function verifyEmail(
  email: string,
  code: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const normalized = normalizeEmail(email);

  // Count the attempt BEFORE checking the code. 6 digits = 1M combinations.
  const allowed = await consumeOtpAttempt(normalized);
  if (!allowed) {
    // Swap for your 429 helper if utils/errors has one.
    throw badRequest("Too many attempts. Request a new code.");
  }

  const user = await authRepository.verifyEmailByOtp(
    normalized,
    hashOTP(code),
    new Date(),
  );
  if (!user) throw badRequest("Invalid or expired verification code");

  await clearOtpAttempts(normalized).catch((err: unknown) =>
    logger.warn("OTP_ATTEMPTS_CLEAR_FAILED", {
      message: err instanceof Error ? err.message : String(err),
    }),
  );

  return createSessionAndTokens(user, meta, "credentials");
}

/** Silent for unknown / already-verified emails (no enumeration). */
export async function resendVerificationEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const user = await authRepository.findActiveUserByEmail(normalized);
  if (!user || user.emailVerified) return;

  const otp = generateOTP();
  await authRepository.updateVerificationToken(
    normalized,
    hashOTP(otp),
    new Date(Date.now() + TTL.OTP),
  );
  await clearOtpAttempts(normalized).catch(() => undefined);

  enqueueEmailSafe(
    { type: "welcome", to: normalized, name: user.name ?? "there", code: otp },
    { userId: user.id, flow: "resend-verification" },
  );
}

// ─── Credential login ────────────────────────────────────────────────────────

export async function authenticate(
  email: string,
  password: string,
  meta?: RequestMeta,
): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  const user = await authRepository.findUserByEmail(normalized);

  // Always run a compare so response time doesn't reveal account existence.
  const passwordHash = user?.accounts[0]?.password ?? null;
  const match = await comparePassword(password, passwordHash ?? DUMMY_HASH);

  if (!user || !passwordHash || !match) {
    throw unauthorized("Invalid email or password");
  }
  if (!user.emailVerified) throw unauthorized("Email not verified");

  const { accounts: _accounts, ...sessionUser } = user;
  return createSessionAndTokens(sessionUser, meta, "credentials");
}

// ─── Google OAuth ────────────────────────────────────────────────────────────

export async function processGoogleOAuth(
  profile: GoogleProfile,
  meta: RequestMeta,
): Promise<AuthResult> {
  const email = extractGoogleEmail(profile);
  if (!email) {
    logger.warn("GOOGLE_OAUTH_MISSING_EMAIL", {
      googleId: profile.id,
      hasEmails: Boolean(profile.emails?.length),
    });
    throw badRequest("Google account has no email associated.");
  }

  if (isGoogleEmailExplicitlyUnverified(profile)) {
    throw unauthorized("Google email address is unverified.");
  }

  try {
    const user = await authRepository.findOrCreateGoogleUser({
      email,
      name: profile.displayName?.trim() || email.split("@")[0] || "User",
      avatar: profile.photos?.[0]?.value ?? null,
      googleId: profile.id,
    });
    return createSessionAndTokens(user, meta, "google");
  } catch (err) {
    if (err instanceof AccountDisabledError) {
      throw unauthorized("This account is disabled.");
    }
    throw err;
  }
}

// ─── Password reset ──────────────────────────────────────────────────────────

/** Silent when the account is unknown. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await authRepository.findActiveUserByEmail(normalizeEmail(email));
  if (!user) return;

  const rawToken = generateToken(32);
  await authRepository.setResetToken(
    user.id,
    hashToken(rawToken),
    new Date(Date.now() + TTL.RESET_TOKEN),
  );

  enqueueEmailSafe(
    { type: "password-reset", to: user.email, resetToken: rawToken },
    { userId: user.id, flow: "password-reset" },
  );
}

export async function verifyPasswordResetToken(token: string): Promise<boolean> {
  if (!token || token.length < 32) return false;
  const user = await authRepository.findUserByResetToken(hashToken(token));
  return user !== null;
}

export async function resetPassword(dto: ResetPasswordDTO): Promise<void> {
  const tokenHash = hashToken(dto.token);

  // Cheap pre-check so invalid tokens never burn a bcrypt round.
  const candidate = await authRepository.findUserByResetToken(tokenHash);
  if (!candidate) throw badRequest("Invalid or expired reset token");

  const hashed = await hashPassword(dto.newPassword);
  const consumed = await authRepository.consumeResetToken(tokenHash, hashed);
  if (!consumed) throw badRequest("Invalid or expired reset token");
}

// ─── Refresh-token rotation ──────────────────────────────────────────────────

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

  const session = await authRepository.findSessionByTokenId(payload.tokenId);
  if (!session || session.userId !== payload.userId) {
    throw unauthorized("Invalid session");
  }

  if (!compareTokenHash(refreshToken, session.tokenHash)) {
    await authRepository.revokeAllUserSessions(session.userId);
    throw unauthorized("Security breach detected. Please login again.");
  }

  const { deletedAt, ...user } = session.user;
  if (deletedAt) throw unauthorized("Invalid session");

  // Atomic claim: of N concurrent refreshes with the same token, exactly one
  // proceeds. Also enforces revokedAt/expiresAt in the same statement.
  const claimed = await authRepository.claimSessionForRotation(session.id);
  if (!claimed) throw unauthorized("Invalid session");

  return createSessionAndTokens(user, meta, session.provider);
}

// ─── Logout / sessions ───────────────────────────────────────────────────────

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
  const revoked = await authRepository.revokeUserSession(userId, sessionId);
  if (!revoked) throw badRequest("Session not found or already revoked");
}

export async function getUserById(id: string): Promise<SessionUser | null> {
  return authRepository.findUserById(id);
}

export async function getAllUsers(
  page = 1,
  pageSize = 25,
): Promise<PaginatedUsers> {
  return authRepository.paginateUsers(page, pageSize);
}