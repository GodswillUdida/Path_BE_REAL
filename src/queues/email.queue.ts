import { Queue } from "bullmq";

export type EmailJob =
  | { type: "verification"; email: string; token: string }
  | { type: "password_reset"; email: string; token: string };

export const emailQueue = new Queue("email-queue", {
  connection: { url: process.env.REDIS_URL },
});
