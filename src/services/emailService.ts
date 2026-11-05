/**
 * @file email.service.ts
 * @description Transactional email dispatcher (Gmail OAuth2 + EJS).
 *
 * Contract:
 * - Specialized helpers (verification, reset, OTP, confirmation, admin)
 *   stay for call-site clarity.
 * - Generic `sendEmail` is the single path used by the notification worker
 *   so delivery tracking (provider / messageId) is always available.
 * - Rendering failures and transport failures both throw; callers decide
 *   whether to retry (BullMQ) or mark a NotificationDelivery as FAILED.
 */

import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import logger from "../utils/logger";

// ─── Env ──────────────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === "production";

const {
  G_ID,
  G_SECRET,
  G_URL,
  G_REFRESH_TOKEN,
  EMAIL_USER,
  ADMIN_EMAIL,
  FRONTEND_URL,
} = process.env;

if (!G_ID || !G_SECRET || !G_URL || !G_REFRESH_TOKEN || !ADMIN_EMAIL || !FRONTEND_URL) {
  throw new Error(
    "CRITICAL: Missing required environment variables for email engine (G_ID, G_SECRET, G_URL, G_REFRESH_TOKEN, ADMIN_EMAIL, FRONTEND_URL).",
  );
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface SendEmailInput {
  to: string;
  subject: string;
  /** EJS template basename under src/views (or dist/views in production). */
  template: string;
  /** Variables passed to the template. */
  context: Record<string, unknown>;
}

export interface SendEmailResult {
  provider: "gmail";
  messageId: string | undefined;
  correlationId: string;
}

interface VerificationEmailInput {
  to: string;
  template: "welcome";
  variables: { name: string; code: string };
}

interface ConfirmationEmailVariables {
  name: string;
  courseName: string;
  enrollmentId: string;
  orderId: string;
  amount: string | number;
  currency: string;
  startDate: string;
  endDate: string;
  accessLabel?: string;
}

interface AdminNotificationVariables {
  name: string;
  email: string;
  phone?: string;
  courseName: string;
  courseDuration: string;
  coursePrice: string;
  enrollmentId: string;
  startDate: string;
  endDate: string;
}

// ─── Lazy deps (keep cold-start light) ────────────────────────────────────

const getEjs = async () => {
  const mod = await import("ejs");
  return (mod as { default?: typeof import("ejs") }).default ?? mod;
};

let oAuth2Client: InstanceType<typeof import("googleapis").google.auth.OAuth2> | null = null;

const getOAuth2Client = async () => {
  if (!oAuth2Client) {
    const { google } = await import("googleapis");
    oAuth2Client = new google.auth.OAuth2(G_ID, G_SECRET, G_URL);
    oAuth2Client.setCredentials({ refresh_token: G_REFRESH_TOKEN });
  }
  return oAuth2Client;
};

export const getGmailTransporter = async () => {
  const nodemailer = await import("nodemailer");
  const client = await getOAuth2Client();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("Failed to obtain Gmail OAuth2 access token");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: ADMIN_EMAIL,
      clientId: G_ID,
      clientSecret: G_SECRET,
      refreshToken: G_REFRESH_TOKEN,
      accessToken: token,
    },
  });
};

// ─── Template render ──────────────────────────────────────────────────────

const templateCache: Record<string, string> = {};

const resolveViewPath = (template: string): string => {
  const basePath = isProduction
    ? path.join(process.cwd(), "dist/views")
    : path.join(process.cwd(), "src/views");
  return path.join(basePath, `${template}.ejs`);
};

const renderEmailTemplate = async (
  template: string,
  data: Record<string, unknown>,
): Promise<string> => {
  try {
    const ejs = await getEjs();

    if (!templateCache[template]) {
      const filePath = resolveViewPath(template);
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`Email template not found: ${filePath}`);
      }
      templateCache[template] = await fs.readFile(filePath, "utf-8");
    }

    return ejs.render(templateCache[template], data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Email template render failed", { template, error: message });
    throw new Error(`Failed to render email template: ${template}`);
  }
};

// ─── Core transport ───────────────────────────────────────────────────────

const sendCoreEmail = async (
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> => {
  const correlationId = crypto.randomUUID();

  try {
    const transporter = await getGmailTransporter();
    const info = await transporter.sendMail({
      from: `Accountant Pathfinder <${EMAIL_USER || ADMIN_EMAIL}>`,
      to,
      subject,
      html,
    });

    logger.info("Email dispatch success", {
      correlationId,
      to,
      subject,
      messageId: info.messageId,
    });

    return {
      provider: "gmail",
      messageId: typeof info.messageId === "string" ? info.messageId : undefined,
      correlationId,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("Email dispatch failure", {
      correlationId,
      to,
      subject,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// ─── Generic entry used by notification worker ────────────────────────────

/**
 * Single path for queued / fan-out mail.
 * Returns provider + messageId so NotificationDelivery can be marked SENT
 * with a durable provider reference.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const html = await renderEmailTemplate(input.template, input.context);
  return sendCoreEmail(input.to, input.subject, html);
}

// ─── Specialized helpers (auth + enrollment) ──────────────────────────────

export const sendVerificationEmail = async (input: VerificationEmailInput): Promise<void> => {
  const html = await renderEmailTemplate("verifyEmail", {
    email: input.to,
    name: input.variables.name,
    code: input.variables.code,
  });
  await sendCoreEmail(input.to, "Verify your email - Accountant Pathfinder", html);
};

export const sendPasswordResetEmail = async (to: string, resetToken: string): Promise<void> => {
  const url = `${FRONTEND_URL}/auth/reset-password/${resetToken}`;
  const html = await renderEmailTemplate("resetPassword", {
    url,
    token: resetToken,
    expiresIn: "1 hour",
  });
  await sendCoreEmail(to, "Reset your password - Accountant Pathfinder", html);
};

export const sendOtpEmail = async (input: {
  to: string;
  name?: string;
  code: string;
}): Promise<void> => {
  const html = await renderEmailTemplate("otpEmail", {
    email: input.to,
    name: input.name ?? "",
    code: input.code,
  });
  await sendCoreEmail(input.to, "Your Pathfinder Verification Code", html);
};

/**
 * Direct confirmation (non-queued path). Prefer the notification worker +
 * sendEmail for anything that must be durable and retried.
 */
export const sendConfirmationEmail = async (
  to: string,
  variables: ConfirmationEmailVariables,
): Promise<SendEmailResult> => {
  const html = await renderEmailTemplate("confirmation", {
    name: variables.name,
    courseName: variables.courseName,
    courseTitle: variables.courseName, // alias used by some templates
    enrollmentId: variables.enrollmentId,
    orderId: variables.orderId,
    amount: variables.amount,
    currency: variables.currency,
    startDate: variables.startDate,
    endDate: variables.endDate,
    accessLabel: variables.accessLabel ?? variables.endDate,
  });
  return sendCoreEmail(to, "Enrollment Confirmation - Accountant Pathfinder", html);
};

export const sendAdminNotification = async (
  variables: AdminNotificationVariables,
): Promise<SendEmailResult> => {
  const html = await renderEmailTemplate("adminNotification", { ...variables });
  return sendCoreEmail(ADMIN_EMAIL!, `New Enrollment: ${variables.courseName}`, html);
};