"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopic = exports.updateTopic = exports.listTopicsForModule = exports.handleBunnyWebhook = exports.verifyBunnyWebhookSignature = exports.generateSignedPlaybackUrl = exports.createTopic = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
const crypto_1 = __importDefault(require("crypto"));
const slugify_1 = require("../../utils/slugify");
const redisClient_1 = __importDefault(require("../../utils/redisClient"));
const logger_1 = __importDefault(require("../../utils/logger"));
const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;
const API_KEY = process.env.BUNNY_STREAM_API_KEY;
const SIGNING_KEY = process.env.BUNNY_STREAM_SIGNING_KEY;
const createTopic = async (moduleId, data) => {
    const module = await prisma_1.default.module.findUnique({
        where: { id: moduleId },
    });
    if (!module)
        throw (0, errors_1.notFound)("Module not found");
    const slug = await (0, slugify_1.generateUniqueSlug)(data.title, "topic");
    /* Create Bunny video */
    const bunnyRes = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`, {
        method: "POST",
        headers: {
            AccessKey: API_KEY,
            accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            title: data.title,
        }),
    });
    const bunnyVideo = await bunnyRes.json();
    const topic = await prisma_1.default.topic.create({
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
exports.createTopic = createTopic;
/* ---------------- SIGNED PLAYBACK ---------------- */
const generateSignedPlaybackUrl = async (topicId, userId) => {
    const cacheKey = `topic:${topicId}`;
    const topic = await redisClient_1.default.get(cacheKey);
    if (!topic) {
        const dbTopic = await prisma_1.default.topic.findUnique({
            where: { id: topicId },
            include: { module: true },
        });
        if (!dbTopic || dbTopic.deletedAt)
            throw (0, errors_1.notFound)("Topic not found");
        if (!dbTopic.bunnyVideoId)
            throw (0, errors_1.notFound)("Video not attached");
        const expires = Math.floor(Date.now() / 1000) + 60 * 60;
        const token = crypto_1.default
            .createHmac("sha256", SIGNING_KEY)
            .update(`${dbTopic.bunnyVideoId}${expires}`)
            .digest("hex");
        await redisClient_1.default.set(cacheKey, JSON.stringify(dbTopic), "EX", 300);
        const url = `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${dbTopic.bunnyVideoId}?token=${token}&expires=${expires}`;
        return url;
    }
    // TODO: Replace with real enrollment check
    // if (!userHasAccess(userId, topic.module.courseId)) throw forbidden();
    // const urlBeta = `https://player.mediadelivery.net /play/${LIBRARY_ID}/${topic.bunnyVideoId}?token=${token}&expires=${expires}`;
};
exports.generateSignedPlaybackUrl = generateSignedPlaybackUrl;
const WEBHOOK_SECRET = process.env.BUNNY_WEBHOOK_SECRET;
const verifyBunnyWebhookSignature = (rawBody, signature) => {
    const computed = crypto_1.default
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
    return crypto_1.default.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
};
exports.verifyBunnyWebhookSignature = verifyBunnyWebhookSignature;
/* ---------------- HANDLE WEBHOOK ---------------- */
const handleBunnyWebhook = async (payload) => {
    const { VideoGuid, Status } = payload;
    // logger.info("BunnyWebhook", {
    //   videoGuid: VideoGuid,
    //   status: Status,
    // });
    // logger.error("BunnyWebhookError", error);
    const topic = await prisma_1.default.topic.findUnique({
        where: { bunnyVideoId: VideoGuid },
    });
    if (!topic)
        return;
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
        await prisma_1.default.topic.update({
            where: { id: topic.id },
            data: { videoStatus: "uploaded" },
        });
        return;
    }
    if (Status === 2) {
        await prisma_1.default.topic.update({
            where: { id: topic.id },
            data: { videoStatus: "processing" },
        });
        return;
    }
    if (Status === 5) {
        await prisma_1.default.topic.update({
            where: { id: topic.id },
            data: { videoStatus: "failed" },
        });
        return;
    }
    /* ---------------- READY (FINAL STATE) ---------------- */
    if (Status === 4) {
        const response = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${VideoGuid}`, {
            method: "GET",
            headers: {
                AccessKey: API_KEY,
                accept: "application/json",
            },
        });
        const videoMeta = await response.json();
        logger_1.default.info("Video Data: ", videoMeta);
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
        await prisma_1.default.topic.updateMany({
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
exports.handleBunnyWebhook = handleBunnyWebhook;
const listTopicsForModule = async (moduleId) => {
    return prisma_1.default.topic.findMany({
        where: { moduleId },
        orderBy: { createdAt: "asc" },
    });
};
exports.listTopicsForModule = listTopicsForModule;
const updateTopic = async (id, data) => {
    const updated = await prisma_1.default.topic.update({ where: { id }, data });
    return updated;
};
exports.updateTopic = updateTopic;
const deleteTopic = async (id) => {
    await prisma_1.default.topic.delete({ where: { id } });
    return true;
};
exports.deleteTopic = deleteTopic;
