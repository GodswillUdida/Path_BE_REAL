import { z } from 'zod';

export const sendCheckoutOtpSchema = z.object({
  email: z.string().email("Invalid email"),
});

export const verifyCheckoutOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "OTP must be 6 digits"),
});

export const completeGuestProfileSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+?\d{10,15}$/, "Invalid phone number").optional(),
});

export const verifyMagicLoginSchema = z.object({
  email: z.string().email(),
  token: z.string().min(32),
});

export type SendCheckoutOtpDto = z.infer<typeof sendCheckoutOtpSchema>;
export type VerifyCheckoutOtpDto = z.infer<typeof verifyCheckoutOtpSchema>;
export type CompleteGuestProfileDto = z.infer<typeof completeGuestProfileSchema>;