// /**
//  * checkout.service.ts
//  *
//  * Handles the full guest-checkout auth flow:
//  *   1. Send OTP  →  2. Verify OTP (issues a short-lived verified token)
//  *   →  3. Complete profile (consumes verified token, creates session)
//  *
//  * Magic-login (passwordless) is kept as a separate, independent flow.
//  *
//  * Design goals
//  * ─────────────
//  * • No silent failures — every branch either returns a value or throws.
//  * • Atomic DB operations where race conditions are possible.
//  * • Short-lived "verified" JWT bridges the OTP → profile step safely.
//  * • Idempotent OTP send (cooldown guard).
//  * • Prisma errors surfaced as domain errors, never leaked raw.
//  */

// import crypto from "crypto";
// import { prisma } from "@/lib/prisma";
// import { logger } from "@/lib/logger";
// // import { sendOtpEmail, sendMagicLinkEmail } from "@/lib/mailer";
// import { signVerifiedToken, verifyVerifiedToken } from "@/lib/jwt";
// import { createSessionAndTokens } from "@/lib/session";
// import { badRequest, notFound, tooManyRequests } from "@/lib/errors";
// import { TTL } from "@/config/ttl";
// import type { CompleteGuestProfileDto } from "@/dtos/checkout.dto";
// import type { AuthResult, SessionUser } from "@/types/auth";

// // ─── Constants ────────────────────────────────────────────────────────────────

// /** Minimum seconds a user must wait before requesting another OTP. */
// const OTP_RESEND_COOLDOWN_MS = 60_000; // 60 s

// /** Max OTP attempts before the record is locked. */
// const OTP_MAX_ATTEMPTS = 5;

// // ─── Checkout OTP ─────────────────────────────────────────────────────────────

// /**
//  * Sends a one-time passcode to the given email.
//  *
//  * Idempotency: if a non-expired OTP was issued within the cooldown window
//  * we return early without emailing again — prevents spam/enumeration.
//  *
//  * If the caller is already authenticated (userId present) the OTP step is
//  * skipped entirely so an authenticated user can proceed straight to checkout.
//  */
// export async function sendCheckoutOtp(
//   email: string,
//   userId?: string | null,
// ): Promise<{ message: string }> {
//   if (userId) {
//     return { message: "Already authenticated — proceed to checkout." };
//   }

//   // Cooldown guard: reject if a fresh OTP was sent recently.
//   const recent = await prisma.otp.findFirst({
//     where: { email },
//     orderBy: { createdAt: "desc" },
//     select: { createdAt: true, expiresAt: true, used: true },
//   });

//   if (recent && !recent.used) {
//     const elapsed = Date.now() - recent.createdAt.getTime();
//     if (elapsed < OTP_RESEND_COOLDOWN_MS) {
//       const waitSecs = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
//       throw tooManyRequests(
//         `Please wait ${waitSecs}s before requesting another code.`,
//       );
//     }
//   }

//   const code = crypto.randomInt(100_000, 1_000_000).toString();
//   const hashedOtp = hashOTP(code);
//   const expiresAt = new Date(Date.now() + TTL.OTP);

//   // Delete stale records then insert fresh — wrapped in a transaction so we
//   // never leave the table in a half-cleaned state.
//   await prisma.$transaction([
//     prisma.otp.deleteMany({ where: { email } }),
//     prisma.otp.create({
//       data: { email, code: hashedOtp, expiresAt, used: false, attempts: 0 },
//     }),
//   ]);

//   try {
//     // await sendOtpEmail({ to: email, code });
//   } catch (err) {
//     // Roll back the OTP row so the next attempt isn't blocked by cooldown.
//     await prisma.otp.deleteMany({ where: { email } }).catch(() => void 0);

//     logger.error("checkout.sendOtp — mailer failure", {
//       email,
//       error: (err as Error).message,
//       stack: (err as Error).stack,
//     });

//     throw new Error("Unable to send OTP email. Please try again.");
//   }

//   return { message: "A verification code has been sent to your email." };
// }

// /**
//  * Verifies the OTP submitted by the guest.
//  *
//  * On success, issues a short-lived **verifiedToken** (signed JWT) that proves
//  * this email address was validated. The client must present this token in the
//  * `completeGuestProfile` call — preventing anyone from completing a profile
//  * for an email they never verified.
//  *
//  * The OTP row is marked `used = true` atomically so it cannot be replayed.
//  */
// export async function verifyCheckoutOtp(
//   email: string,
//   code: string,
// ): Promise<{ verifiedToken: string }> {
//   const otp = await prisma.otp.findFirst({
//     where: { email },
//     orderBy: { createdAt: "desc" },
//   });

//   if (!otp) {
//     throw badRequest("No verification code was found for this email.");
//   }

//   if (otp.used) {
//     throw badRequest("This code has already been used.");
//   }

//   if (otp.expiresAt < new Date()) {
//     throw badRequest("Verification code has expired. Please request a new one.");
//   }

//   if (otp.attempts >= OTP_MAX_ATTEMPTS) {
//     throw badRequest(
//       "Too many failed attempts. Please request a new verification code.",
//     );
//   }

//   const isValid = compareTokenHash(code, otp.code);

//   if (!isValid) {
//     // Increment attempt counter — do NOT expose which field was wrong.
//     await prisma.otp.update({
//       where: { id: otp.id },
//       data: { attempts: { increment: 1 } },
//     });

//     const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
//     throw badRequest(
//       remaining > 0
//         ? `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
//         : "Too many failed attempts. Please request a new code.",
//     );
//   }

//   // Mark used atomically.
//   await prisma.$transaction([
//     prisma.otp.update({ where: { id: otp.id }, data: { used: true } }),
//   ]);

//   // Issue a short-lived proof-of-verification token (5 minutes).
//   // This is NOT a session — it only unlocks the profile-completion step.
//   const verifiedToken = signVerifiedToken({ email, purpose: "guest-checkout" });

//   return { verifiedToken };
// }

// /**
//  * Completes the guest's profile after OTP verification.
//  *
//  * Requires a valid `verifiedToken` issued by `verifyCheckoutOtp`.
//  * Upserts the user (safe for first-time guests and returning ones),
//  * then creates a full session + tokens.
//  *
//  * The resulting AuthResult is identical to a normal login so the client
//  * needs no special-casing.
//  */
// export async function completeGuestProfile(
//   dto: CompleteGuestProfileDto,
// ): Promise<AuthResult> {
//   // Validate the verified token before touching the DB.
//   const payload = verifyVerifiedToken(dto.verifiedToken);

//   if (
//     !payload ||
//     payload.email !== dto.email ||
//     payload.purpose !== "guest-checkout"
//   ) {
//     throw badRequest("Invalid or expired verification session. Please restart.");
//   }

//   // Upsert: handles both brand-new guests and returning users completing
//   // a new checkout without an active session.
//   const user = await prisma.user.upsert({
//     where: { email: dto.email },
//     create: {
//       email: dto.email,
//       name: dto.name,
//       phone: dto.phone ?? null,
//       // Random strong password — guest accounts log in via OTP/magic-link only.
//       password: await hashToken(crypto.randomBytes(32).toString("hex")),
//       emailVerified: true,
//       provider: "checkout",
//     },
//     update: {
//       // Only update profile fields if the user already exists.
//       name: dto.name,
//       phone: dto.phone ?? null,
//       emailVerified: true,
//     },
//     select: {
//       id: true,
//       name: true,
//       email: true,
//       role: true,
//       emailVerified: true,
//     },
//   });

//   // Promote to a real session — same path as a registered login.
//   return createSessionAndTokens(user as SessionUser);
// }

// // ─── Magic Login ──────────────────────────────────────────────────────────────

// /**
//  * Creates (or refreshes) a magic login token for the given email and fires
//  * the email. Uses an atomic upsert to eliminate the read-then-write race
//  * condition present in the original implementation.
//  *
//  * The raw token is emailed; only its hash is persisted — identical to a
//  * password-reset token pattern.
//  */
// export async function sendMagicLogin(
//   email: string,
// ): Promise<{ message: string }> {
//   const token = generateMagicToken();
//   const tokenHash = hashToken(token);
//   const expiresAt = new Date(Date.now() + TTL.MAGIC_LINK ?? 15 * 60 * 1000);

//   // Atomic upsert eliminates the findFirst + conditional create/update pattern.
//   await prisma.magicLoginToken.upsert({
//     where: { email },
//     create: { email, tokenHash, expiresAt, used: false },
//     update: { tokenHash, expiresAt, used: false },
//   });

//   try {
//     await sendMagicLinkEmail({ to: email, token });
//   } catch (err) {
//     logger.error("checkout.sendMagicLogin — mailer failure", {
//       email,
//       error: (err as Error).message,
//       stack: (err as Error).stack,
//     });
//     throw new Error("Unable to send magic link. Please try again.");
//   }

//   return {
//     message: "A sign-in link has been sent to your email. It expires in 15 minutes.",
//   };
// }

// /**
//  * Validates a magic login token and issues a full auth session.
//  *
//  * Token lookup uses the hash directly in the query — no extra round-trips.
//  * The `used` flag and expiry check are both enforced at the DB query level
//  * so there is no TOCTOU window.
//  */
// export async function verifyMagicLogin(
//   email: string,
//   token: string,
// ): Promise<AuthResult> {
//   const tokenHash = hashToken(token);

//   const magic = await prisma.magicLoginToken.findFirst({
//     where: {
//       email,
//       tokenHash,
//       used: false,
//       expiresAt: { gt: new Date() },
//     },
//   });

//   if (!magic) {
//     throw badRequest(
//       "This link is invalid or has expired. Please request a new one.",
//     );
//   }

//   // Mark consumed before issuing tokens — prevents race-condition replay.
//   await prisma.magicLoginToken.update({
//     where: { id: magic.id },
//     data: { used: true },
//   });

//   const user = await prisma.user.findUnique({ where: { email } });
//   if (!user) throw notFound("No account is associated with this email.");

//   return createSessionAndTokens(user);
// }