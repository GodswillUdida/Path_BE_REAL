export const QUEUE_NAMES = {
  TOPIC_VIDEO: "topic-video-processing",
  COURSE_VIDEO_PREVIEW: "course-video-preview",
  AUTH_EMAIL: "auth-emails",
  INTAKE_EMAIL: "intake-emails",
  COURSE_ANALYTICS: "course-analytics",
  PAYMENT_FOLLOWUP: "payment-followup",
  RESOURCE_UPLOAD: "topic-resource-upload",
} as const;

export type QueueName =
  (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function getQueuePrefix(): string {
  const env = process.env.NODE_ENV || "development";

  return `pathfinder-${env}`;
}