/**
 * @file email.service.ts
 * @description 2026 Enterprise Transactional Email Dispatcher.
 * Refactored to align with type-safe async worker payloads and structured error propagation.
 */

import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import logger from "../utils/logger";

const getEjs = async () => {
  const mod = await import("ejs");
  return mod.default || mod;
};

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

if (
  !G_ID ||
  !G_SECRET ||
  !G_URL ||
  !G_REFRESH_TOKEN ||
  !ADMIN_EMAIL ||
  !FRONTEND_URL
) {
  throw new Error(
    "CRITICAL: Missing required environment variables for email engine execution.",
  );
}

let oAuth2Client: any;
const getOAuth2Client = async () => {
  if (!oAuth2Client) {
    const { google } = await import("googleapis");
    oAuth2Client = new google.auth.OAuth2(G_ID, G_SECRET, G_URL);
    oAuth2Client.setCredentials({ refresh_token: G_REFRESH_TOKEN });
  }
  return oAuth2Client;
};

export const getGmailTransporter = async (): Promise<any> => {
  const nodemailer = await import("nodemailer");
  const client = await getOAuth2Client();
  const { token } = await client.getAccessToken();
  if (!token)
    throw new Error(
      "Failed to obtain dynamic access token for Gmail OAuth2 layer",
    );

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

const templateCache: Record<string, string> = {};

const resolveViewPath = (template: string): string => {
  const basePath = isProduction
    ? path.join(process.cwd(), "dist/views")
    : path.join(process.cwd(), "src/views");
  return path.join(basePath, `${template}.ejs`);
};

const renderEmailTemplate = async (
  template: string,
  data: Record<string, any>,
): Promise<string> => {
  try {
    const ejs = await getEjs();

    if (!templateCache[template]) {
      const filePath = resolveViewPath(template);

      try {
        await fs.access(filePath);
      } catch {
        throw new Error(
          `Template asset could not be accessed at path: ${filePath}`,
        );
      }

      templateCache[template] = await fs.readFile(filePath, "utf-8");
    }

    return ejs.render(templateCache[template], data);
  } catch (err: any) {
    logger.error("Email engine visualization rendering failed", {
      template,
      error: err.message,
    });
    throw new Error(`Failed execution on template rendering: ${template}`);
  }
};

const sendCoreEmail = async (
  to: string,
  subject: string,
  html: string,
): Promise<void> => {
  const correlationId = crypto.randomUUID();

  try {
    const transporter = await getGmailTransporter();
    await transporter.sendMail({
      from: `Accountant Pathfinder <${EMAIL_USER || ADMIN_EMAIL}>`,
      to,
      subject,
      html,
    });

    logger.info(`[Email Dispatch Success] Trace ID: ${correlationId}`, {
      recipient: to,
    });
  } catch (err: any) {
    logger.error(`[Email Dispatch Failure] Trace ID: ${correlationId}`, {
      recipient: to,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
};

interface VerificationEmailInput {
  to: string;
  template: "welcome";
  variables: { name: string; code: string };
}

export const sendVerificationEmail = async (
  input: VerificationEmailInput,
): Promise<void> => {
  const html = await renderEmailTemplate("verifyEmail", {
    email: input.to,
    name: input.variables.name,
    code: input.variables.code,
  });
  await sendCoreEmail(input.to, "Verify your email - Pathfinder College", html);
};

export const sendPasswordResetEmail = async (
  to: string,
  resetToken: string,
): Promise<void> => {
  const url = `${FRONTEND_URL}/auth/reset-password/${resetToken}`;
  const html = await renderEmailTemplate("resetPassword", {
    url,
    token: resetToken,
    expiresIn: "1 hour",
  });
  await sendCoreEmail(to, "Reset your password - Pathfinder College", html);
};

/**
 * FIXED — signature mismatch with payment.service.ts's actual call site.
 * This function previously accepted `(to, templateName, { courseTitle })`
 * — but `templateName` was never actually used (renderEmailTemplate always
 * hardcoded "confirmation" regardless of what was passed), and
 * payment.service.ts calls this with a richer, 2-argument shape:
 * `sendConfirmationEmail(email, { name, courseName, enrollmentId, orderId,
 * amount, currency, startDate, endDate })`. That mismatch meant the
 * options object would land in the ignored `templateName` slot and
 * `variables` would be `undefined` — every enrollment confirmation email
 * would have failed to render. Dropped the dead `templateName` param
 * entirely and expanded `variables` to match what's actually sent and
 * what a real confirmation email needs (dates, price, order reference) —
 * a confirmation email with only a course title was thin anyway.
 *
 * BREAKING CHANGE: any other existing caller of sendConfirmationEmail
 * needs updating to the new 2-arg (to, variables) signature — this
 * codebase's only known caller (payment.service.ts) already expects it.
 */
interface ConfirmationEmailVariables {
  name: string;
  courseName: string;
  enrollmentId: string;
  orderId: string;
  amount: number;
  currency: string;
  startDate: string;
  endDate: string;
}

export const sendConfirmationEmail = async (
  to: string,
  variables: ConfirmationEmailVariables,
): Promise<void> => {
  const html = await renderEmailTemplate("confirmation", variables);
  await sendCoreEmail(to, "Enrollment Confirmation - Pathfinder College", html);
};

/**
 * NEW — payment.service.ts already calls this on every successful
 * enrollment (paid or free), but it never existed here at all. That
 * import would have failed to resolve, and every post-payment
 * notification attempt would have thrown (harmlessly, since it's called
 * fire-and-forget with a .catch() — but silently, meaning admin
 * notifications for every single sale were never actually sending).
 *
 * DEPENDENCY: requires an `adminNotification.ejs` template in your views
 * directory (same convention as "confirmation", "welcome", etc.) — I
 * don't have visibility into your views folder to confirm it exists;
 * create it with the variable set below if it doesn't.
 */
interface AdminNotificationVariables {
  name: string;
  email: string;
  phone: string;
  courseName: string;
  courseDuration: string;
  coursePrice: string;
  enrollmentId: string;
  startDate: string;
  endDate: string;
}

export const sendAdminNotification = async (
  variables: AdminNotificationVariables,
): Promise<void> => {
  const html = await renderEmailTemplate("adminNotification", variables);
  await sendCoreEmail(ADMIN_EMAIL, `New Enrollment: ${variables.courseName}`, html);
};

export const sendOtpEmail = async ({
  to,
  name,
  code,
}: {
  to: string;
  name?: string;
  code: string;
}) => {
  const html = await renderEmailTemplate("otpEmail", {
    email: to,
    name: name ?? "",
    code,
  });
  await sendCoreEmail(to, "Your Pathfinder Verification Code", html);
};