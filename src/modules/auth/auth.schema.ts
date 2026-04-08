// src/modules/auth/auth.schema.ts
import { z } from "zod";

const email = z
  .string("Email is required")
  .email("Invalid email address")
  .toLowerCase()
  .trim();

const password = z
  .string("Password is required")
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must include uppercase")
  .regex(/[a-z]/, "Must include lowercase")
  .regex(/[0-9]/, "Must include number")
  .max(128, "Password too long");

const token = z.string("Token is required").min(8, "Token cannot be empty");

export const registerSchema = z.object({
  name: z.string().min(3).max(128, "Name too long"),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password,
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Code must be exactly 6 digits"),
});

export const resendVerificationEmailSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token,
  newPassword: password,
});

export const resetPasswordVerifySchema = z.object({
  token
});

// ─── Magic Link ───────────────────────────────────────────────────────────────

export const magicLoginVerifySchema = z.object({
  email,
  token,
});

export const guestOtpSendSchema = z.object({
  email,
});

export const guestOtpVerifySchema = z.object({
  email,
  code: z
    .string("OTP code is required")
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must contain digits only"),
});

export const guestLoginSchema = z.object({
  email,
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const refreshTokenSchema = z.object({}).strict(); // empty for cookie-based

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type GuestLoginDTO = z.infer<typeof guestLoginSchema>;
export type VerifyEmailDTO = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordVerifyDTO = z.infer<typeof resetPasswordVerifySchema>;
export type GuestOtpSendDTO = z.infer<typeof guestOtpSendSchema>;
export type GuestOtpVerifyDTO = z.infer<typeof guestOtpVerifySchema>;
