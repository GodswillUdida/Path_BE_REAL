import fs from "fs/promises";
import { Job, UnrecoverableError } from "bullmq";
import { createWorker } from "@/lib/queues/create-worker";
import { createRedisConnection } from "@/lib/queues/connection";
import { QUEUE_NAMES } from "@/lib/queues/registry";
import { CourseVideoPreviewJob, CourseAnalyticsJob } from "./course.queue";
import { fetchCourseAnalytics } from "./course.repository";
import prisma from "@/lib/prisma";
import logger from "@/utils/logger";
import { uploadVideoPreviewFromPath } from "@/config/cloudinary";

const ANALYTICS_CACHE_TTL_SECONDS = 300; // 5 min — cheap to recompute, no need for longer

/* ---------------- COURSE VIDEO PREVIEW ---------------- */

async function processCourseVideoPreview(job: Job<CourseVideoPreviewJob>) {
  const { courseId, filePath, originalFilename } = job.data;

  try {
    await fs.access(filePath);
  } catch {
    logger.error("Temp course preview file missing — cannot process", {
      courseId,
      filePath,
      jobId: job.id,
    });
    throw new UnrecoverableError(`Upload file not found: ${filePath}`);
  }

  try {
    const secureUrl = await uploadVideoPreviewFromPath(filePath, {
      publicId: `course-preview-${courseId}`,
      overwrite: true,
     onHeartbeat: (elapsedMs) => {
        logger.info("Course preview upload still in progress", {
          courseId,
          jobId: job.id,
          elapsedSeconds: Math.round(elapsedMs / 1000),
        }); 
      }
    });

    await prisma.course.update({
      where: { id: courseId },
      data: { videoPreview: secureUrl },
    });

    logger.info("Course video preview uploaded", { courseId, jobId: job.id, originalFilename });
  } catch (err) {
    logger.error("Course video preview upload failed", {
      courseId,
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    await fs.unlink(filePath).catch((e) =>
      logger.warn("Failed to clean up temp course preview file", {
        courseId,
        filePath,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

export const courseVideoPreviewWorker = createWorker<CourseVideoPreviewJob>(
  QUEUE_NAMES.COURSE_VIDEO_PREVIEW,
  processCourseVideoPreview,
  { concurrency: 1 }, // same rationale as topic worker — one large upload at a time
);

/* ---------------- COURSE ANALYTICS ---------------- */

const analyticsCacheConnection = createRedisConnection("worker");

async function processCourseAnalyticsRecalc(job: Job<CourseAnalyticsJob>) {
  const { courseId, reason } = job.data;

  const analytics = await fetchCourseAnalytics(courseId);

  await analyticsCacheConnection.set(
    `course-analytics - ${courseId}`,
    JSON.stringify(analytics),
    "EX",
    ANALYTICS_CACHE_TTL_SECONDS,
  );

  logger.info("Course analytics recalculated", { courseId, reason, ...analytics });
}

export const courseAnalyticsWorker = createWorker<CourseAnalyticsJob>(
  QUEUE_NAMES.COURSE_ANALYTICS,
  processCourseAnalyticsRecalc,
  { concurrency: 5 }, // cheap aggregate queries — fine to run several at once
);

courseAnalyticsWorker.on("failed", (job, err) => {
  if (!job) return;
  logger.error("Course analytics recalc failed", {
    courseId: job.data.courseId,
    reason: job.data.reason,
    error: err.message,
  });
});