"use strict";
// import Queue from "bull";
// // import { sendVerificationEmail, sendPasswordResetEmail } from "./emailService";
// import logger from "../../validations/utils/logger";
// import {
//   sendPasswordResetEmail,
//   sendVerificationEmail,
// } from "../../services/emailService";
// export const emailQueue = new Queue("email-queue", process.env.REDIS_URL!);
// emailQueue.process("verification", async (job) => {
//   await sendVerificationEmail(
//     job.data.email,
//     job.data.name,
//     job.data.token,
//     job.data.expiresAt
//   );
// });
// emailQueue.process("password-reset", async (job) => {
//   await sendPasswordResetEmail(
//     job.data.email,
//     job.data.name,
//     job.data.token,
//     job.data.expiresAt
//   );
// });
// emailQueue.on("failed", (job, err) => {
//   logger.error("Email job failed", { job: job.name, err });
// });
