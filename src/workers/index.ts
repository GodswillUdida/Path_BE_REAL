import "dotenv/config";

import { validateEnv } from "@/utils/validateEnv";

validateEnv([
  "DATABASE_URL",
  "REDIS_URL",
  "NODE_ENV",
  "UPLOAD_TMP_DIR",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_STREAM_SIGNING_KEY",
  "BUNNY_STREAM_READONLY_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "QUEUE_BOARD_USER",
  "QUEUE_BOARD_PASSWORD",
]);

import "../modules/topic/topic.worker";
import "../modules/auth/email.worker";
import "../modules/intake/intake.worker";
import "../modules/course/course.worker";
import "../modules/payment/payment.worker";
import "../modules/topic/resource.worker";
import "../modules/notifications/notification.worker";

import { startBullBoard } from "./board";
import logger from "@/utils/logger";
import { shutdownWorkers } from "@/lib/queues/create-worker";

startBullBoard();
logger.info("worker process started");

async function shutdown(signal: string) {
  logger.info("shutting down worker process", { signal });
  await shutdownWorkers();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
