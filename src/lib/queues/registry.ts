// queues/registry.ts

export const QUEUE_NAMES = {
  TOPIC_VIDEO: "topic-video-processing",
  COURSE_VIDEO_PREVIEW: "course-video-preview",
  AUTH_EMAIL: "auth-emails",
  INTAKE_EMAIL: "intake-emails",
  COURSE_ANALYTICS: "course-analytics",
  PAYMENT_FOLLOWUP: "payment-followup",
  RESOURCE_UPLOAD: "topic-resource-upload",
  // Per-user notification delivery: post-payment emails now; announcements,
  // live-class reminders and grant notices reuse it.
  NOTIFICATIONS: "notifications",
  // Delayed jobs that expire unpaid orders (was borrowing COURSE_ANALYTICS).
  ORDER_EXPIRY: "order-expiry",
} as const;

export type QueueName =
  (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function getQueuePrefix(): string {
  const env = process.env.NODE_ENV || "development";

  return `pathfinder-${env}`;
}
