import {
  Prisma,
  ResourceStatus,
  ResourceType,
  VideoProvider,
  VideoStatus,
} from "@prisma/client";
import { SEED_NOW, sid } from "./helpers";

export function videoAsset(
  topicKey: string,
  durationSeconds: number,
): Prisma.VideoAssetCreateWithoutTopicInput {
  return {
    id: sid(`video:${topicKey}`),
    provider: VideoProvider.BUNNY,
    providerAssetId: sid(`bunny:${topicKey}`),
    status: VideoStatus.READY,
    durationSeconds,
    thumbnailUrl: `https://picsum.photos/seed/${topicKey}/400/225`,
    fileSizeBytes: BigInt(80_000_000 + durationSeconds * 50_000),
    width: 1280,
    height: 720,
    retryCount: 0,
    idempotencyKey: sid(`video-idem:${topicKey}`),
    readyAt: SEED_NOW,
  };
}

export function topicResources(
  topicKey: string,
): Prisma.TopicResourceCreateWithoutTopicInput[] {
  return [
    {
      id: sid(`res:${topicKey}:pdf`),
      type: ResourceType.PDF,
      title: "Lesson notes",
      storageKey: `topics/seed/${topicKey}/notes.pdf`,
      url: `https://pathfinder-pull.b-cdn.net/topics/seed/${topicKey}/notes.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 240_000,
      status: ResourceStatus.READY,
      position: 0,
      readyAt: SEED_NOW,
    },
  ];
}