import { z } from 'zod';

const emailSchema = z
  .string("Email is required.")
  .email("Please enter a valid email address.")
  .toLowerCase()
  .trim();

const verifiedTokenSchema = z
  .string("Verified token is required.")
  .min(1, "Verified token cannot be empty.");

export const sendCheckoutOtpSchema = z.object({
  email: z.string().email("Invalid email"),
});

export const verifyCheckoutOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "OTP must be 6 digits"),
});

export const completeGuestProfileSchema = z.object({
  email: z.string().email(),
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

export const verifyMagicLoginSchema = z.object({
  email: z.string().email(),
  token: z.string().min(32),
});

export type SendCheckoutOtpDto = z.infer<typeof sendCheckoutOtpSchema>;
export type VerifyCheckoutOtpDto = z.infer<typeof verifyCheckoutOtpSchema>;
export type CompleteGuestProfileDto = z.infer<typeof completeGuestProfileSchema>;