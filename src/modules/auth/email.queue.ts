import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";

// 1. Keep your clean, type-safe union definitions
export type AuthEmailJob =
  | { type: "welcome"; to: string; name: string, code?:string }
  | { type: "password-reset"; to: string; resetToken: string }
  | { type: "enrollment-confirmation"; to: string; courseTitle: string };

// 2. Instantiate with aggressive fail-fast configurations for transactional emails
export const authEmailQueue = createQueue<AuthEmailJob>(QUEUE_NAMES.AUTH_EMAIL, {
  attempts: 3,                 // Keep retries low to prevent clogging queue with dead inboxes
  backoff: { 
    type: "exponential", 
    delay: 2000                // Fast initial retry cycle (2s -> 4s -> 8s)
  },
});

/**
 * Enqueues an authentication or transactional communication job.
 * Leverages high-priority settings so lifecycle emails bypass analytics logs.
 */
export async function enqueueAuthEmail(job: AuthEmailJob): Promise<void> {
  // Use job.type for both the BullMQ internal action name and payload matching
  await authEmailQueue.add(job.type, job, {
    priority: 1,               // High priority: transactional items take precedence over background tasks
  });
}
