import prisma from "../../lib/prisma";
import { notFound } from "../../utils/errors";
import crypto from "crypto";
import { generateUniqueSlug } from "../../utils/slugify";
import { bunnyFetch } from "../../utils/bunnyClient";
import redis from "../../config/redis";
import logger from "../../utils/logger";

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID!;
const API_KEY = process.env.BUNNY_STREAM_API_KEY!;
const SIGNING_KEY = process.env.BUNNY_STREAM_SIGNING_KEY!;

export const createTopic = async (
  moduleId: string,
  data: {
    title: string;
    resources?: string[];
  },
) => {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
  });
  if (!module) throw notFound("Module not found");

  const slug = await generateUniqueSlug(data.title, "topic");

  /* Create Bunny video */
  const bunnyRes = await fetch(
    `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: API_KEY,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: data.title,
      }),
    },
  );

  const bunnyVideo = await bunnyRes.json();

  const topic = await prisma.topic.create({
    data: {
      title: data.title,
      slug,
      resources: data.resources ?? [],
      bunnyVideoId: bunnyVideo.guid,
      moduleId,
      videoStatus: "created",
    },
  });

  // await prisma.$transaction(async (tx) => {
  //   const topic = await tx.topic.create({
  //     data: {
  //       title: data.title,
  //       slug,
  //       resources: data.resources ?? [],
  //       bunnyVideoId: bunnyVideo.guid,
  //       moduleId,
  //       videoStatus: "created",
  //     },
  //   });

  return {
    topic,
    uploadEndpoint: `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${bunnyVideo.guid}`,
    videoId: bunnyVideo.guid,
  };
};

/* ---------------- SIGNED PLAYBACK ---------------- */
export const generateSignedPlaybackUrl = async (
  topicId: string,
  userId: string,
) => {
  const cacheKey = `topic:${topicId}`;

  const topic = await redis.get(cacheKey);

  if (!topic) {
    const dbTopic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { module: true },
    });

    if (!dbTopic || dbTopic.deletedAt) throw notFound("Topic not found");
    if (!dbTopic.bunnyVideoId) throw notFound("Video not attached");

    const expires = Math.floor(Date.now() / 1000) + 60 * 60;

    const token = crypto
      .createHmac("sha256", SIGNING_KEY)
      .update(`${dbTopic.bunnyVideoId}${expires}`)
      .digest("hex");

    // await redis.set(cacheKey, JSON.stringify(dbTopic), "EX", 300);
    const url = `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${dbTopic.bunnyVideoId}?token=${token}&expires=${expires}`;
    return url;
  }

  // TODO: Replace with real enrollment check
  // if (!userHasAccess(userId, topic.module.courseId)) throw forbidden();

  // const urlBeta = `https://player.mediadelivery.net /play/${LIBRARY_ID}/${topic.bunnyVideoId}?token=${token}&expires=${expires}`;
};

const WEBHOOK_SECRET = process.env.BUNNY_WEBHOOK_SECRET!;

export const verifyBunnyWebhookSignature = (
  rawBody: Buffer,
  signature: string,
) => {
  const computed = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
};

/* ---------------- HANDLE WEBHOOK ---------------- */
export const handleBunnyWebhook = async (payload: any) => {
  const { VideoGuid, Status } = payload;

  // logger.info("BunnyWebhook", {
  //   videoGuid: VideoGuid,
  //   status: Status,
  // });

  // logger.error("BunnyWebhookError", error);

  const topic = await prisma.topic.findUnique({
    where: { bunnyVideoId: VideoGuid },
  });

  if (!topic) return;

  // const statusMap: Record<number, string> = {
  //   1: "uploaded",
  //   2: "processing",
  //   4: "ready",
  //   5: "failed",
  // };

  // const mappedStatus = statusMap[Status];

  // if (!mappedStatus) return;

  // if (mappedStatus !== "ready") {
  //   await prisma.topic.update({
  //     where: { id: topic.id },
  //     data: { videoStatus: mappedStatus },
  //   });
  //   return;
  // }

  /* ---------------- STATUS UPDATES ---------------- */

  if (Status === 1) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: { videoStatus: "uploaded" },
    });
    return;
  }

  if (Status === 2) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: { videoStatus: "processing" },
    });
    return;
  }

  if (Status === 5) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: { videoStatus: "failed" },
    });
    return;
  }

  /* ---------------- READY (FINAL STATE) ---------------- */

  if (Status === 4) {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${VideoGuid}`,
      {
        method: "GET",
        headers: {
          AccessKey: API_KEY,
          accept: "application/json",
        },
      },
    );

    const videoMeta = await response.json();
    logger.info("Video Data: ", videoMeta);

    if (!videoMeta || typeof videoMeta.length !== "number") {
      throw new Error("Invalid Bunny metadata response");
    }

    /*
      Bunny response contains:
      videoMeta.length
      videoMeta.storageSize
      videoMeta.thumbnailFileName
      videoMeta.width
      videoMeta.height
    */

    await prisma.topic.updateMany({
      where: {
        id: topic.id,
        videoStatus: { not: "ready" },
      },
      data: {
        videoStatus: "ready",
        durationSeconds: videoMeta.length ?? 0,
        fileSizeBytes: videoMeta.storageSize,
        videoWidth: videoMeta.width,
        videoHeight: videoMeta.height,
        thumbnailUrl: videoMeta.thumbnailFileName
          ? `https://vz-${LIBRARY_ID}.b-cdn.net/${VideoGuid}/${videoMeta.thumbnailFileName}`
          : null,
      },
    });

    return;
  }
};

export const listTopicsForModule = async (moduleId: string) => {
  return prisma.topic.findMany({
    where: { moduleId },
    orderBy: { createdAt: "asc" },
  });
};

export const updateTopic = async (
  id: string,
  data: Partial<{
    title: string;
    videoUrl?: string | null;
    resources?: string[];
  }>,
) => {
  const updated = await prisma.topic.update({ where: { id }, data });
  return updated;
};

export const deleteTopic = async (id: string) => {
  await prisma.topic.delete({ where: { id } });
  return true;
};
