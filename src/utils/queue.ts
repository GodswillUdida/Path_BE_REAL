// utils/queue.ts
import Queue from "bull";
import { sendConfirmationEmail } from "./email";
// import sendConfirmationEmail  from "../utils/email/sendConfirmationEmail";

export const emailQueue = new Queue("email");

export const enqueueEmailJob = (jobData: {
  to: string;
  subject: string;
  template: string;
  payload: Record<string, any>;
}) => emailQueue.add(jobData);

emailQueue.process(async (job) => {
  try {
    await sendConfirmationEmail("r",job.data);
  } catch (err) {
    console.error("📩 Fallback to Resend failed", err);
  }
});
