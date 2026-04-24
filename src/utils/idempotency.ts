import prisma from "../lib/prisma";

export async function enforceIdempotency(
  key: string | undefined,
  scope: string,
) {
  if (!key) return null;

  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      key_scope: { key, scope },
    },
  });

  if (existing) {
    return existing; // 🔥 replay response instead of throwing
  }

  return prisma.idempotencyKey.create({
    data: { key, scope },
  });
}