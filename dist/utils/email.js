"use strict";
// import nodemailer, { Transporter } from "nodemailer";
// import { Resend } from "resend";
// import { google } from "googleapis";
// import ejs from "ejs";
// import path from "path";
// import crypto from "crypto";
// import logger from "../utils/logger";
// import { AppError } from "../middleware/error";
// // import { followUpQueue } from "./marketing/followUpQueue";
// const {
//   G_CLIENT_ID,
//   G_SECRET,
//   G_URL,
//   G_REFRESH_TOKEN,
//   EMAIL_USER,
//   ADMIN_EMAIL,
//   RESEND_API_KEY,
//   BASE_URL,
//   FRONTEND_URL,
//   RESEND_FROM,
// } = process.env;
// if (
//   !G_ID ||
//   !G_SECRET ||
//   !G_URL ||
//   !G_REFRESH_TOKEN ||
//   !EMAIL_USER ||
//   !ADMIN_EMAIL ||
//   !RESEND_API_KEY ||
//   !BASE_URL ||
//   !FRONTEND_URL ||
//   !RESEND_FROM
// ) {
//   throw new AppError(
//     "Missing required environment variables for email service",
//     500
//   );
// }
// const resend = new Resend(RESEND_API_KEY!);
// // Gmail OAuth2 Transport
// const oAuth2Client = new google.auth.OAuth2(G_ID, G_SECRET, G_URL);
// oAuth2Client.setCredentials({ refresh_token: G_REFRESH_TOKEN });
// export const getGmailTransporter = async (): Promise<Transporter> => {
//   const { token } = await oAuth2Client.getAccessToken();
//   if (!token) throw new AppError("No Gmail access token available", 500);
//   return nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       type: "OAuth2",
//       user: EMAIL_USER,
//       clientId: G_ID,
//       clientSecret: G_SECRET,
//       refreshToken: G_REFRESH_TOKEN,
//       accessToken: token,
//     },
//   });
// };
// // Token generator
// export const generateToken = (): string =>
//   crypto.randomBytes(32).toString("hex");
// // EJS Template Renderer
// interface EmailData {
//   name?: string;
//   email?: string;
//   url?: string;
//   courseName?: string;
//   subCourseName?: string;
//   coursePrice?: number;
//   courseDuration?: string;
//   enrollmentId?: string;
// }
// const resolveViewPath = (template: string) => {
//   const rootDir = path.resolve(
//     __dirname,
//     "..",
//     process.env.NODE_ENV === "production" ? "../views" : "views"
//   );
//   return path.join(rootDir, `${template}.ejs`);
// };
// const renderEmailTemplate = async (template: string, data: EmailData) => {
//   try {
//     return await ejs.renderFile(resolveViewPath(template), data);
//   } catch (err: any) {
//     logger.error(`Email template rendering failed: ${err.message}`);
//     throw new AppError("Email template error", 500);
//   }
// };
// // Core send function with Resend + Gmail fallback
// const sendEmail = async (to: string, subject: string, html: string) => {
//   try {
//     await resend.emails.send({ from: RESEND_FROM!, to, subject, html });
//     logger.info(`✅ Resend email sent to ${to}`);
//   } catch (resendErr) {
//     logger.warn("Resend failed, using Gmail fallback", { error: resendErr });
//     try {
//       const transporter = await getGmailTransporter();
//       await transporter.sendMail({
//         from: `"Pathfinder College" <${EMAIL_USER}>`,
//         to,
//         subject,
//         html,
//       });
//       logger.info(`✅ Gmail fallback email sent to ${to}`);
//     } catch (gmailErr: any) {
//       logger.error(`❌ Failed to send email to ${to}: ${gmailErr.message}`);
//       throw new AppError("Email sending failed", 500);
//     }
//   }
// };
// // ---------------- Transactional Emails ----------------
// export const sendVerificationEmail = async (
//   to: string,
//   name: string,
//   token: string
// ) => {
//   const url = `${FRONTEND_URL}/verify-email?token=${token}`;
//   const html = `<p>Hi ${name}, click to verify your email:</p><a href="${url}">${url}</a>`;
//   await sendEmail(to, "Verify your email", html);
// };
// export const sendPasswordResetEmail = async (
//   to: string,
//   name: string,
//   token: string
// ) => {
//   const url = `${FRONTEND_URL}/reset-password?token=${token}`;
//   const html = `<p>Hi ${name}, reset your password:</p><a href="${url}">${url}</a>`;
//   await sendEmail(to, "Reset your password", html);
// };
// export const sendConfirmationEmail = async (to: string, data: EmailData) => {
//   const html = await renderEmailTemplate("confirmation", data);
//   await sendEmail(to, "Enrollment Confirmation - Pathfinder College", html);
// };
// export const sendAdminNotification = async (data: EmailData) => {
//   const html = await renderEmailTemplate("adminNotification", data);
//   await sendEmail(ADMIN_EMAIL!, `New Enrollment - ${data.name}`, html);
// };
