// import { Worker, Job } from "bullmq";
// import { emailQueue, EmailJob } from "./email.queue";
// import { EmailService } from "services/emailService";
// // import { EmailService } from "../email.service";
// // import { verificationEmailTemplate } from "../templates/verification";
// // import { passwordResetTemplate } from "../templates/password-reset";

// import redis from "utils/redisClient";

// const emailService = new EmailService();

// export const emailWorker = new Worker(
//   emailQueue.name,
//   async (job) => {
//     if (!job || !job.data) return;

//     if (job.data.type === "verification") {
//       await emailService.sendEmail({
//         to: job.data.email,
//         subject: "Verify your email",
//         html: `<p> Verify Email </p>`
//       });
//       return;
//     }

//     if (job.data.type === "password_reset") {
//       await emailService.sendEmail({
//         to: job.data.email,
//         subject: "Reset your password",
//         html: `<p> Password reset </p>`
//       });
//       return;
//     }
//   },
//   {
//     connection: { url: process.env.REDIS_URL },
// connection: redis,
//     concurrency: 10,
//   }
// );
