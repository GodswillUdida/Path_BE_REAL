import prisma from "../../lib/prisma";
import { forbidden, notFound } from "../../utils/errors";
import crypto from "crypto";
import { generateUniqueSlug } from "../../utils/slugify";
import { CreateTopicInput } from "./topic.schema";
import { withRetry } from "../../utils/retry";

type BunnyVideoResponse = {
  guid: string;
  title: string;
};

function userHasAccess(userId: string, courseId: string): boolean {
  // TODO: Implement actual access control logic
  return true;
}


const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID!;
const API_KEY = process.env.BUNNY_STREAM_API_KEY!;
const SIGNING_KEY = process.env.BUNNY_STREAM_SIGNING_KEY!;

async function createBunnyVideo(title: string) {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!res.ok) {
    throw new Error(`Bunny server error: ${res.status}`);
  }

  const data: BunnyVideoResponse = await res.json();

  if (!data?.guid) {
    throw new Error("Invalid Bunny response");
  }

  return data;
}

export async function uploadVideoToBunny(
  videoId: string,
  buffer: Buffer,
) {
  return withRetry(async () => {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`,
      {
        method: "PUT",
        headers: {
          AccessKey: API_KEY,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(buffer),
      }
    );

    if (res.status >= 400 && res.status < 500) {
      const text = await res.text();
      throw new Error(`Upload failed (client): ${text}`);
    }

    if (!res.ok) {
      throw new Error(`Upload failed (server): ${res.status}`);
    }

    return true;
  });
}

async function safeDeleteBunnyVideo(videoId: string) {
  try {
    await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`,
      {
        method: "DELETE",
        headers: { AccessKey: API_KEY },
      }
    );
  } catch {
    // swallow error (best effort cleanup)
  }
}

export const createTopic = async (
  moduleId: string,
  data: CreateTopicInput,
  file: Express.Multer.File,
  idempotencyKey?: string

) => {
  /* ---- IDEMPOTENCY CHECK (CRITICAL) ---- */
  if (idempotencyKey) {
    const existing = await prisma.topic.findFirst({
      where: { idempotencyKey },
    });
    if (existing) return existing;
  }

  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });

  if (!module) throw notFound("Module not found");

  const slug = await generateUniqueSlug(data.title, "topic");

  /* ---- CREATE BUNNY VIDEO (CRITICAL STEP) ---- */
  const { guid } = await createBunnyVideo(data.title);

  try {
    // 3. Upload video (with retry)
    await uploadVideoToBunny(guid, file.buffer);
  } catch (err) {
    // 🔥 cleanup (VERY IMPORTANT)
    await safeDeleteBunnyVideo(guid);
    throw err;
  }

  const topic = await prisma.topic.create({
    data: {
      title: data.title,
      slug,
      moduleId,
      resources: data.resources ?? [],
      bunnyVideoId: guid,
      videoStatus: "uploaded",
      idempotencyKey: idempotencyKey ?? null,
    },
  });

  console.log("Uploading video to Bunny", {
    videoId: guid,
    size: file.buffer.length,
  });

  return topic;
  //  {
  //   topic,
  //   uploadEndpoint: `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${guid}`,
  // };

};

/* ---------------- SIGNED PLAYBACK ---------------- */
export const generateSignedPlaybackUrl = async (
  topicId: string,
  userId?: string,
  ip?: string
) => {

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      module: {
       include: {
          course: true,
       },
      },
    },
    // select: {
    //   bunnyVideoId: true,
    //   deletedAt: true,
    // },
  });


  if (!topic || topic.deletedAt) throw notFound("Topic not found");
  if (!topic.bunnyVideoId) throw notFound("Video not ready");

    if (!userHasAccess(userId as string, topic.module.courseId)) {
    throw forbidden("No access to this course");
  }

  const expires = Math.floor(Date.now() / 1000) + 60 + 10; // 10 mins

  const path = `/${topic.bunnyVideoId}`;

   const payload = `${path}${expires}${userId}${ip ?? ""}`;

  const token = crypto
    .createHmac("sha256", SIGNING_KEY)
    .update(payload)
    .digest("hex");

  return `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${topic.bunnyVideoId}?token=${token}&expires=${expires}`;

  // return `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${topic.bunnyVideoId}?token=${token}&expires=${expires}`;
};

// TODO: Replace with real enrollment check
// if (!userHasAccess(userId, topic.module.courseId)) throw forbidden();

// const urlBeta = `https://player.mediadelivery.net /play/${LIBRARY_ID}/${topic.bunnyVideoId}?token=${token}&expires=${expires}`;
// };

const WEBHOOK_SECRET = process.env.BUNNY_WEBHOOK_SECRET!;

export const verifyBunnyWebhookSignature = (
  rawBody: Buffer,
  signature: string,
) => {
  const computed = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (computed.length !== signature.length) return false;

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
};

/* ---------------- HANDLE WEBHOOK ---------------- */
export const handleBunnyWebhook = async (payload: any) => {
  const { VideoGuid, Status } = payload;

  if (!VideoGuid) return;

  const topic = await prisma.topic.findUnique({
    where: { bunnyVideoId: VideoGuid },
  });

  if (!topic) return;

  /* ---- IDEMPOTENCY GUARD ---- */
  // if (topic.videoStatus === "ready") return;

  const statusMap: Record<number, string> = {
    1: "uploaded",
    2: "processing",
    4: "ready",
    5: "failed",
  };

  const newStatus = statusMap[Status];

  if (topic.videoStatus === newStatus) return;


  if (!newStatus) return;

  if (newStatus !== "ready") {
    await prisma.topic.update({
      where: { id: topic.id },
      data: { videoStatus: newStatus },
    });
    return;
  }

  let meta = null;

  try {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${VideoGuid}`,
      {
        headers: { AccessKey: API_KEY },
      }
    );
    if (res.ok) meta = await res.json();
  } catch (err) {
    console.error("Metadata fetch failed", err);
  }

  await prisma.topic.update({
    where: { id: topic.id },
    data: {
      videoStatus: "ready",
      durationSeconds: meta.length ?? 0,
      fileSizeBytes: meta.storageSize ?? 0,
      videoWidth: meta.width ?? null,
      videoHeight: meta.height ?? null,
      thumbnailUrl: meta.thumbnailFileName
        ? `https://vz-${LIBRARY_ID}.b-cdn.net/${VideoGuid}/${meta.thumbnailFileName}`
        : null,
    },
  });
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
  const existing = await prisma.topic.findUnique({ where: { id } });

  if (!existing || existing.deletedAt) throw notFound("Topic not found");

  await prisma.topic.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
  return true;
};