import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";

export interface IntakeEmailJob {
  to: string;
  studentName: string;
//   courseTitle?: string;
}

export const intakeEmailQueue = createQueue<IntakeEmailJob>(QUEUE_NAMES.INTAKE_EMAIL);

export async function enqueueIntakeEmail(job: IntakeEmailJob) {
  return intakeEmailQueue.add("intake-confirmation", job);
}