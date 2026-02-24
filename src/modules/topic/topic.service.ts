import { generateUniqueSlug } from "utils/slugify";
import prisma from "../../lib/prisma";
import { notFound } from "../../utils/errors";
import crypto from "crypto"

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID!;
const API_KEY = process.env.BUNNY_STREAM_API_KEY!;
const SIGNING_KEY = process.env.BUNNY_STREAM_SIGNING_KEY!;

export const createTopic = async (moduleId: string,
  data: {
  title: string;
  videoUrl?: string | null;
  resources?: string[];
}) => {
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
        // "AccessKey": API_KEY,
         AccessKey: API_KEY,
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

  return {
    topic,
    uploadEndpoint: `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${bunnyVideo.guid}`,
    videoId: bunnyVideo.guid,
  };
};

/* ---------------- SIGNED PLAYBACK ---------------- */
export const generateSignedPlaybackUrl = async (
  topicId: string,
  userId: string
) => {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { module: true },
  });

  if (!topic || topic.deletedAt) throw notFound("Topic not found");
  if (!topic.bunnyVideoId) throw notFound("Video not attached");

  // TODO: Replace with real enrollment check
  // if (!userHasAccess(userId, topic.module.courseId)) throw forbidden();

  const expires = Math.floor(Date.now() / 1000) + 60 * 60;

  const token = crypto.createHmac("sha256", SIGNING_KEY)
    .update(`${topic.bunnyVideoId}${expires}`)
    .digest("hex");

  const url = `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${topic.bunnyVideoId}?token=${token}&expires=${expires}`;

  return url;
};

/* ---------------- HANDLE WEBHOOK ---------------- */
export const handleBunnyWebhook = async (payload: any) => {
  const { VideoGuid, Status, Length } = payload;

  const topic = await prisma.topic.findUnique({
    where: { bunnyVideoId: VideoGuid },
  });

  if (!topic) return;

  if (Status === 4) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: {
        videoStatus: "ready",
        durationSeconds: Length,
      },
    });
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
  }>
) => {
  const updated = await prisma.topic.update({ where: { id }, data });
  return updated;
};

export const deleteTopic = async (id: string) => {
  await prisma.topic.delete({ where: { id } });
  return true;
};
