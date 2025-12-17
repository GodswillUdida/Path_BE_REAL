"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPhysicalEnrollmentRequestAdminNotification = exports.sendPhysicalEnrollmentRequestNotification = exports.sendAdminNotification = exports.sendConfirmationEmail = exports.sendPasswordResetEmail = exports.sendVerificationEmail = exports.generateEmailToken = exports.getGmailTransporter = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const googleapis_1 = require("googleapis");
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../utils/logger"));
const error_1 = require("../middleware/error");
const { G_ID, G_SECRET, G_URL, G_REFRESH_TOKEN, EMAIL_USER, ADMIN_EMAIL, RESEND_API_KEY, BASE_URL, FRONTEND_URL, RESEND_FROM, NODE_ENV, } = process.env;
if (!G_ID ||
    !G_SECRET ||
    !G_URL ||
    !G_REFRESH_TOKEN ||
    !EMAIL_USER ||
    !ADMIN_EMAIL ||
    !RESEND_API_KEY ||
    !BASE_URL ||
    !FRONTEND_URL ||
    !RESEND_FROM) {
    throw new error_1.AppError("Missing required email environment variables", 500);
}
// const resend = new Resend(RESEND_API_KEY);
// OAuth2
const oAuth2Client = new googleapis_1.google.auth.OAuth2(G_ID, G_SECRET, G_URL);
oAuth2Client.setCredentials({ refresh_token: G_REFRESH_TOKEN });
const getGmailTransporter = async () => {
    const { token } = await oAuth2Client.getAccessToken();
    if (!token)
        throw new error_1.AppError("No Gmail access token", 500);
    return nodemailer_1.default.createTransport({
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
exports.getGmailTransporter = getGmailTransporter;
const templateCache = {};
const resolveViewPath = (template) => {
    const rootDir = path_1.default.resolve(__dirname, "..", NODE_ENV === "production" ? "../views" : "views");
    return path_1.default.join(rootDir, `${template}.ejs`);
};
const renderEmailTemplate = async (template, data) => {
    try {
        if (!templateCache[template]) {
            templateCache[template] = resolveViewPath(template);
        }
        return await ejs_1.default.renderFile(templateCache[template], data);
    }
    catch (err) {
        logger_1.default.error("Email template render failed: " + err.message);
        throw new error_1.AppError("Email template rendering failed", 500);
    }
};
// Core sender
const sendCoreEmail = async (to, subject, html) => {
    const correlationId = crypto_1.default.randomBytes(32).toString("hex");
    // try {
    //   const result = await resend.emails.send({
    //     from: RESEND_FROM!,
    //     to,
    //     subject,
    //     html,
    //   });
    //   logger.info(`[email:${correlationId}] Resend → Delivered to ${to}`);
    //   return { success: true, provider: "resend", id: result.id };
    // } catch (err) {
    //   logger.warn(
    //     `[email:${correlationId}] Resend failed → switching to Gmail fallback`
    //   );
    // }
    try {
        const transporter = await (0, exports.getGmailTransporter)();
        await transporter.sendMail({
            from: `Accountant Pathfinder <${EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        logger_1.default.info(`[email:${correlationId}] Gmail fallback email sent to ` + to);
        // await resend.emails.send({ from: RESEND_FROM!, to, subject, html });
        // logger.info("Resend email sent to " + to);
    }
    catch (err) {
        logger_1.default.warn("Mail failed to send !!!");
    }
};
const generateEmailToken = () => crypto_1.default.randomBytes(32).toString("hex");
exports.generateEmailToken = generateEmailToken;
// Verification Email
const sendVerificationEmail = async (to, name, token) => {
    const url = `${FRONTEND_URL}/verify-email?token=${token}`;
    const html = await renderEmailTemplate("verifyEmail", { name, url });
    await sendCoreEmail(to, "Verify your email - Pathfinder College", html);
};
exports.sendVerificationEmail = sendVerificationEmail;
// Password Reset Email
const sendPasswordResetEmail = async (to, name, token) => {
    const url = `${FRONTEND_URL}/reset-password?token=${token}`;
    const html = await renderEmailTemplate("resetPassword", { name, url });
    await sendCoreEmail(to, "Reset your password - Pathfinder College", html);
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
// Enrollment Confirmation
const sendConfirmationEmail = async (to, data) => {
    const html = await renderEmailTemplate("confirmation", data);
    await sendCoreEmail(to, "Enrollment Confirmation - Pathfinder College", html);
};
exports.sendConfirmationEmail = sendConfirmationEmail;
const sendAdminNotification = async (data) => {
    const html = await renderEmailTemplate("adminNotification", data);
    await sendCoreEmail(ADMIN_EMAIL, `New Enrollment - ${data.name}`, html);
};
exports.sendAdminNotification = sendAdminNotification;
//Physical Enrollment Request Notification
const sendPhysicalEnrollmentRequestNotification = async (to, data) => {
    const html = await renderEmailTemplate("physicalEnrollmentRequest", {
        name: data.name,
        courseTitle: data.course,
        requestId: data.requestId,
    });
    await sendCoreEmail(to, "Physical Enrollment Request Received - Pathfinder College", html);
};
exports.sendPhysicalEnrollmentRequestNotification = sendPhysicalEnrollmentRequestNotification;
const sendPhysicalEnrollmentRequestAdminNotification = async (data) => {
    const html = await renderEmailTemplate("physicalEnrollmentRequestAdmin", {
        name: data.name,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        courseTitle: data.course,
        requestId: data.requestId,
    });
    await sendCoreEmail(ADMIN_EMAIL, `New Physical Enrollment Request - ${data.name}`, html);
};
exports.sendPhysicalEnrollmentRequestAdminNotification = sendPhysicalEnrollmentRequestAdminNotification;
