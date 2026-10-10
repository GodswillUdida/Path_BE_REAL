import { createQueue } from "@/lib/queues/create-queue";
import { QUEUE_NAMES } from "@/lib/queues/registry";

export interface VideoProcessingJob {
  topicId: string;
  filePath: string;
  bunnyTitle: string;
}

export const topicVideoQueue = createQueue<VideoProcessingJob>(
  QUEUE_NAMES.TOPIC_VIDEO,
  { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
);

export async function enqueueVideoProcessing(job: VideoProcessingJob) {
  return topicVideoQueue.add("process-video", job, { jobId: job.topicId });
}