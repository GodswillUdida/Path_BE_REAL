import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";

/**
 * Async offload for the course preview clip upload (Cloudinary).
 * Distinct from topic lecture videos (Bunny) — different CDN, different
 * size ceiling (LIMITS.VIDEO = 100MB, see config/multer.ts), different shape.
 */
export interface CourseVideoPreviewJob {
  courseId: string;
  filePath: string;
  originalFilename: string;
}

export interface CourseAnalyticsJob {
  courseId: string;
  reason: "enrollment" | "payment" | "manual-recalc";
}

export const courseVideoPreviewQueue = createQueue<CourseVideoPreviewJob>(
  QUEUE_NAMES.COURSE_VIDEO_PREVIEW,
  { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
);

export const courseAnalyticsQueue = createQueue<CourseAnalyticsJob>(
  QUEUE_NAMES.COURSE_ANALYTICS,
);

export async function enqueueCourseVideoProcessing(job: CourseVideoPreviewJob) {
  // jobId = courseId — same idempotency guarantee as the topic queue: a
  // second preview upload while one's in flight is deduped, not stacked.
  return courseVideoPreviewQueue.add("process-video-preview", job, {
    jobId: job.courseId,
  });
}

export async function enqueueCourseAnalyticsRecalc(job: CourseAnalyticsJob) {
  // Debounced by jobId — multiple enrollments/payments for the same course
  // within the job's lifetime collapse into one recompute, not a stack.
  return courseAnalyticsQueue.add("recalc", job, {
    jobId: `recalc-${job.courseId}`,
  });
}