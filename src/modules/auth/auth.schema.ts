// src/modules/auth/auth.schema.ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(3).max(128, "Name too long"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8).max(128, "Password too long"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8).max(128),
});

export const guestLoginSchema = z.object({
  email: z.string().email("Invalid email"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(8, "Invalid verification token"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(8),
  newPassword: z.string().min(8).max(128),
});

export const refreshTokenSchema = z.object({}).strict(); // empty for cookie-based

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type GuestLoginDTO = z.infer<typeof guestLoginSchema>;
export type VerifyEmailDTO = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;