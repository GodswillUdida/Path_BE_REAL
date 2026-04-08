import path from "path";
import crypto from "crypto";
import logger from "../utils/logger";
import {  } from "../middleware/error";

const isProduction = process.env.NODE_ENV === "production";

const {
  G_ID,
  G_SECRET,
  G_URL,
  G_REFRESH_TOKEN,
  EMAIL_USER,
  ADMIN_EMAIL,
  RESEND_API_KEY,
  BASE_URL,
  FRONTEND_URL,
  RESEND_FROM,
  NODE_ENV,
} = process.env;

if (
  !G_ID ||
  !G_SECRET ||
  !G_URL ||
  !G_REFRESH_TOKEN ||
  !EMAIL_USER ||
  !ADMIN_EMAIL ||
  !RESEND_API_KEY ||
  !BASE_URL ||
  !FRONTEND_URL ||
  !RESEND_FROM
) {
  throw new Error("Missing required environment variables for email service");
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

// const resend = new Resend(RESEND_API_KEY);

// OAuth2
// const oAuth2Client = new google.auth.OAuth2(G_ID, G_SECRET, G_URL);
// oAuth2Client.setCredentials({ refresh_token: G_REFRESH_TOKEN });

export const getGmailTransporter = async (): Promise<any> => {
  const nodemailer = await import("nodemailer");
  const client = await getOAuth2Client();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain access token for Gmail");

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: EMAIL_USER,
      clientId: G_ID,
      clientSecret: G_SECRET,
      refreshToken: G_REFRESH_TOKEN,
      accessToken: token,
    },
  });
};

const templateCache: Record<string, string> = {};

const resolveViewPath = (template: string) => {
  const rootDir = path.resolve(
    __dirname,
    "..",
    isProduction ? "views" : "../../views",
  );
  return path.join(rootDir, `${template}.ejs`);
};

const renderEmailTemplate = async (template: string, data: any) => {
  try {
    if (!templateCache[template]) {
      templateCache[template] = resolveViewPath(template);
    }
    const ejs = await import("ejs");
    return await ejs.renderFile(templateCache[template], data);
  } catch (err: any) {
    logger.error("Email template render failed: " + err.message);
    throw new Error("Failed to render email template");
  }
};

// Core sender
const sendCoreEmail = async (to: string, subject: string, html: string) => {
  const correlationId = crypto.randomBytes(32).toString("hex");

  try {
    const transporter = await getGmailTransporter();
    await transporter.sendMail({
      from: `Accountant Pathfinder <${EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    logger.info(`[email:${correlationId}] Gmail fallback email sent to ` + to);
  } catch (err) {
    logger.warn("Mail failed to send !!!");
  }
};

export const generateEmailToken = () => crypto.randomBytes(32).toString("hex");

// Verification Email
export const sendVerificationEmail = async (
  to: string,
  email: string,
  name: string,
  code: string,
) => {
  // const url = `${FRONTEND_URL}/verify?token=${token}`;
  const html = await renderEmailTemplate("verifyEmail", { email, name, code });
  await sendCoreEmail(to, "Verify your email - Pathfinder College", html);
};

export const sendOtpEmail = async (to: string, email: string, code: string) => {
  const html = await renderEmailTemplate("otpEmail", { email, name: "", code });

  // Use your existing email sender (nodemailer, Resend, etc.)
  await sendCoreEmail(to, "Your Pathfinder Verification Code", html);
};


// Password Reset Email
export const sendPasswordResetEmail = async (
  to: string,
  name: string,
  token: string,
) => {
  const url = `${FRONTEND_URL}/auth/reset-password/${token}`;
  const html = await renderEmailTemplate("resetPassword", { name, url, expiresIn: "1 hour" });
  await sendCoreEmail(to, "Reset your password - Pathfinder College", html);
};

// Enrollment Confirmation
export const sendConfirmationEmail = async (to: string, data: any) => {
  const html = await renderEmailTemplate("confirmation", data);
  await sendCoreEmail(to, "Enrollment Confirmation - Pathfinder College", html);
};

export const sendAdminNotification = async (data: any) => {
  const html = await renderEmailTemplate("adminNotification", data);
  await sendCoreEmail(ADMIN_EMAIL!, `New Enrollment - ${data.name}`, html);
};
