// import { Job } from "bullmq";
// import { IntakeEmailJob } from "./intake.queue";
// import { sendConfirmationEmail } from "@/services/emailService";
// import { createWorker } from "@/lib/queues/create-worker";
// import { QUEUE_NAMES } from "@/lib/queues/registry";

// async function processIntakeEmail(job: Job<IntakeEmailJob>) {
//   await sendConfirmationEmail({
//     to: job.data.to,
//     template: "intake-confirmation",
//     variables: { studentName: job.data.studentName, courseTitle: job.data.courseTitle },
//   });
// }

// export const intakeEmailWorker = createWorker<IntakeEmailJob>(
//   QUEUE_NAMES.INTAKE_EMAIL,
//   processIntakeEmail,
//   { concurrency: 10 },
// );