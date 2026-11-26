import { Job } from "bullmq";
import { AuthEmailJob } from "./email.queue";
import { createWorker } from "@/lib/queues/create-worker";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import {
  sendApplicationVerificationEmail,
  sendConfirmationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/services/emailService";

/**
 * Handles the execution of enqueued transactional emails.
 * Leverages TypeScript compile-time type safety via the discriminated union.
 */
async function processEmailJob(
  job: Job<AuthEmailJob, void, string>,
): Promise<void> {
  const data = job.data;

  switch (data.type) {
    case "welcome":
      return sendVerificationEmail({
        to: data.to,
        template: "welcome",
        variables: {
             name: data.name,
             code: data.code as string, // Optional code for verification emails 
            },
      });

    case "application-verification":
      return sendApplicationVerificationEmail({
        to: data.to,
        name: data.name,
        code: data.code,
        verifyUrl: data.verifyUrl,
      });

    case "password-reset":
      return sendPasswordResetEmail(data.to, data.resetToken);

    case "enrollment-confirmation": {
      await sendConfirmationEmail(data.to, {
        name: "there",
        courseName: data.courseTitle,
        enrollmentId: "",
        orderId: "",
        amount: 0,
        currency: "",
        startDate: "",
        endDate: "",
      });
      return;
    }

    default: {
      // 2026 Standard: Compile-time check ensures developers can never forget a newly added email variant
      const _exhaustiveCheck: never = data;
      throw new Error(
        `Unhandled email type exception: ${JSON.stringify(_exhaustiveCheck)}`,
      );
    }
  }
}

/**
 * High concurrency (10-20) works beautifully here since executing
 * transactional email dispatches over HTTP/SMTP is purely I/O-bound.
 */
export const authEmailWorker = createWorker<AuthEmailJob, void>(
  QUEUE_NAMES.AUTH_EMAIL,
  processEmailJob,
  { concurrency: 10 },
);

// Note: Critical permanent failures are already managed inside the createWorker
// engine layout. Custom alerts or dead-letter notifications can be added here if needed.
