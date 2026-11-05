import {
  Prisma,
  ResourceStatus,
  ResourceType,
  VideoProvider,
  VideoStatus,
} from "@prisma/client";
import { faker } from "@faker-js/faker";

let videoCounter = 1;

const PROVIDER_WEIGHTS: VideoProvider[] = [
  VideoProvider.BUNNY,
  VideoProvider.BUNNY,
  VideoProvider.BUNNY,
  VideoProvider.BUNNY,
  VideoProvider.MUX,
  VideoProvider.AWS,
  VideoProvider.CLOUDFLARE,
];

function providerAssetIdFor(provider: VideoProvider, seq: string): string {
  switch (provider) {
    case VideoProvider.BUNNY:
      return `bvid_${seq}`;
    case VideoProvider.MUX:
      return `mux_${faker.string.alphanumeric(20)}`;
    case VideoProvider.AWS:
      return `s3://lms-video-assets/originals/${seq}.mp4`;
    case VideoProvider.CLOUDFLARE:
      return faker.string.uuid();
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function generateVideoAsset(
  durationSeconds: number,
): Prisma.VideoAssetCreateWithoutTopicInput {
  const provider = faker.helpers.arrayElement(PROVIDER_WEIGHTS);
  const seq = String(videoCounter++).padStart(4, "0");
  const width = faker.helpers.arrayElement([1920, 1280] as const);
  const height = width === 1920 ? 1080 : 720;

  return {
    provider,
    providerAssetId: providerAssetIdFor(provider, seq),
    status: VideoStatus.READY,
    durationSeconds,
    thumbnailUrl: `https://picsum.photos/seed/${faker.string.uuid().slice(0, 10)}/400/225`,
    fileSizeBytes: BigInt(faker.number.int({ min: 20_000_000, max: 800_000_000 })),
    width,
    height,
    retryCount: 0,
    idempotencyKey: faker.string.uuid(),
    readyAt: faker.date.recent({ days: 30 }),
  };
}

const FILE_RESOURCE_META: Record<Exclude<ResourceType, "LINK">, { extension: string; mimeType: string }> = {
  [ResourceType.PDF]: { extension: "pdf", mimeType: "application/pdf" },
  [ResourceType.EXCEL]: {
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  [ResourceType.WORD]: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  [ResourceType.TEMPLATE]: { extension: "pdf", mimeType: "application/pdf" },
};

export function generateTopicResources(): Prisma.TopicResourceCreateWithoutTopicInput[] {
  if (faker.number.int({ min: 1, max: 10 }) > 4) return [];

  const count = faker.number.int({ min: 1, max: 3 });
  const resources: Prisma.TopicResourceCreateWithoutTopicInput[] = [];

  for (let i = 0; i < count; i++) {
    if (faker.datatype.boolean({ probability: 0.25 })) {
      resources.push({
        type: ResourceType.LINK,
        title: faker.lorem.words({ min: 2, max: 5 }),
        storageKey: null,
        url: faker.internet.url(),
        mimeType: null,
        sizeBytes: null,
        status: ResourceStatus.READY,
        position: i,
        readyAt: faker.date.recent({ days: 30 }),
      });
      continue;
    }

    const type = faker.helpers.arrayElement([
      ResourceType.PDF,
      ResourceType.EXCEL,
      ResourceType.WORD,
      ResourceType.TEMPLATE,
    ] as const);
    const meta = FILE_RESOURCE_META[type];
    const resourceId = faker.string.uuid();
    const slug = faker.helpers.slugify(faker.lorem.words({ min: 2, max: 4 }));
    const storageKey = `topics/seed/resources/${resourceId}/${slug}.${meta.extension}`;

    resources.push({
      type,
      title: `${faker.lorem.words({ min: 2, max: 4 })} (${type})`,
      storageKey,
      url: `https://pathfinder-pull.b-cdn.net/${storageKey}`,
      mimeType: meta.mimeType,
      sizeBytes: faker.number.int({ min: 50_000, max: 5_000_000 }),
      status: ResourceStatus.READY,
      position: i,
      readyAt: faker.date.recent({ days: 30 }),
    });
  }

  return resources;
}

export function generateTopics(moduleSeq: number): Prisma.TopicCreateWithoutModuleInput[] {
  const count = faker.number.int({ min: 3, max: 7 });
  return Array.from({ length: count }, (_, i) => {
    const durationSeconds = faker.number.int({ min: 240, max: 1500 });
    return {
      title: faker.lorem.words({ min: 3, max: 8 }),
      slug: `topic-${moduleSeq}-${i + 1}`,
      position: i + 1,
      durationSeconds,
      videoAsset: { create: generateVideoAsset(durationSeconds) },
      resources: { create: generateTopicResources() },
    };
  });
}

export function generateModules(courseSeq: number): Prisma.ModuleCreateWithoutCourseInput[] {
  const count = faker.number.int({ min: 4, max: 8 });
  return Array.from({ length: count }, (_, i) => ({
    title: faker.lorem.words({ min: 2, max: 6 }),
    slug: `module-${i + 1}`,
    description: faker.lorem.paragraph(),
    position: i + 1,
    topics: { create: generateTopics(courseSeq * 100 + i + 1) },
  }));
}

export function generatePricings(
  isFree: boolean,
  includeLifetimeTier = false,
): Prisma.CoursePricingCreateWithoutCourseInput[] {
  if (isFree) {
    return [
      {
        name: "Free Access",
        price: 0,
        isFree: true,
        accessDurationDays: null,
        bonusDays: 0,
        sortOrder: 1,
      },
    ];
  }

  const tiers: Prisma.CoursePricingCreateWithoutCourseInput[] = [
    {
      name: "7 Days",
      price: faker.number.int({ min: 4500, max: 12000 }),
      accessDurationDays: 7,
      bonusDays: 0,
      sortOrder: 1,
    },
    {
      name: "30 Days",
      price: faker.number.int({ min: 14000, max: 28000 }),
      accessDurationDays: 30,
      bonusDays: 30, // "one month free" demo
      sortOrder: 2,
    },
    {
      name: "90 Days",
      price: faker.number.int({ min: 38000, max: 65000 }),
      accessDurationDays: 90,
      bonusDays: 0,
      sortOrder: 3,
    },
  ];

  if (includeLifetimeTier) {
    tiers.push({
      name: "Lifetime",
      price: faker.number.int({ min: 85000, max: 150000 }),
      accessDurationDays: null,
      bonusDays: 0,
      sortOrder: 4,
    });
  }

  return tiers;
}

/** Paid window + bonusDays → final expiresAt (null = lifetime). */
export function expiresAtFor(
  accessDurationDays: number | null,
  bonusDays: number,
  from: Date,
): Date | null {
  if (accessDurationDays === null) return null;
  const totalDays = accessDurationDays + (bonusDays ?? 0);
  return new Date(from.getTime() + totalDays * 24 * 60 * 60 * 1000);
}

export async function computeDurationAggregates(
  tx: Prisma.TransactionClient,
  courseId: string,
): Promise<void> {
  const modules = await tx.module.findMany({
    where: { courseId },
    select: { id: true, topics: { select: { durationSeconds: true } } },
  });

  let courseTotal = 0;
  for (const mod of modules) {
    const moduleTotal = mod.topics.reduce((sum, t) => sum + t.durationSeconds, 0);
    courseTotal += moduleTotal;
    await tx.module.update({
      where: { id: mod.id },
      data: { totalDurationSeconds: moduleTotal },
    });
  }

  await tx.course.update({
    where: { id: courseId },
    data: { totalDurationSeconds: courseTotal },
  });
}