/**
 * checkout.validator.ts
 *
 * Zod schemas for all checkout auth endpoints.
 * Kept in one file so the input contract for every route is visible at a glance.
 */

import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

const emailSchema = z
    .string("Email is required.")
    .email("Please enter a valid email address.")
    .toLowerCase()
    .trim();

const otpCodeSchema = z
    .string("Verification code is required.")
    .length(6, "Verification code must be exactly 6 digits.")
    .regex(/^\d+$/, "Verification code must contain only digits.");

const verifiedTokenSchema = z
    .string("Verified token is required.")
    .min(1, "Verified token cannot be empty.");

// ─── Endpoint schemas ─────────────────────────────────────────────────────────

export const sendCheckoutOtpSchema = z.object({
    email: emailSchema,
});

export const verifyCheckoutOtpSchema = z.object({
    email: emailSchema,
    code: otpCodeSchema,
});

export const completeGuestProfileSchema = z.object({
    email: emailSchema,
    verifiedToken: verifiedTokenSchema,
    name: z
        .string("Name is required.")
        .min(2, "Name must be at least 2 characters.")
        .max(100, "Name cannot exceed 100 characters.")
        .trim(),
    phone: z
        .string()
        .regex(/^\+?[1-9]\d{6,14}$/, "Please enter a valid phone number.")
        .optional(),
});

export const sendMagicLoginSchema = z.object({
    email: emailSchema,
});

export const verifyMagicLoginSchema = z.object({
    email: emailSchema,
    token: z
        .string("Token is required.")
        .min(1, "Token cannot be empty."),
});

// ─── DTO types (inferred from schemas) ───────────────────────────────────────

export type SendCheckoutOtpDto = z.infer<typeof sendCheckoutOtpSchema>;
export type VerifyCheckoutOtpDto = z.infer<typeof verifyCheckoutOtpSchema>;
export type CompleteGuestProfileDto = z.infer<typeof completeGuestProfileSchema>;
export type SendMagicLoginDto = z.infer<typeof sendMagicLoginSchema>;
export type VerifyMagicLoginDto = z.infer<typeof verifyMagicLoginSchema>;


// ─────────────────────────────────────────────────────────────────────────────
/**
 * lib/jwt.ts  (partial — verified-token helpers)
 *
 * These two helpers seal and unseal the short-lived proof-of-OTP token.
 * Add to your existing JWT lib — do NOT create a separate file if you already
 * have one; just export these alongside your existing helpers.
 *
 * The `purpose` claim ensures this token cannot be misused as a session token
 * or password-reset token even if the signing secret is shared.
 */

import jwt from "jsonwebtoken";

interface VerifiedTokenPayload {
    email: string;
    purpose: "guest-checkout";
    iat?: number;
    exp?: number;
}

const VERIFIED_TOKEN_SECRET =
    process.env.VERIFIED_TOKEN_SECRET ?? process.env.JWT_SECRET!;

const VERIFIED_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes

export function signVerifiedToken(payload: Omit<VerifiedTokenPayload, "iat" | "exp">): string {
    return jwt.sign(payload, VERIFIED_TOKEN_SECRET, {
        expiresIn: VERIFIED_TOKEN_TTL_SECONDS,
        issuer: "checkout-service",
    });
}

export function verifyVerifiedToken(token: string): VerifiedTokenPayload | null {
    try {
        return jwt.verify(token, VERIFIED_TOKEN_SECRET, {
            issuer: "checkout-service",
        }) as VerifiedTokenPayload;
    } catch {
        return null;
    }
}