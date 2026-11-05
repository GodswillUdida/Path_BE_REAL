import prisma from "../../lib/prisma";
import type { Role } from "@prisma/client";

/** Authoritative account state (the JWT role claim can be stale). */
export async function findAuthState(userId: string): Promise<{ role: Role; deletedAt: Date | null } | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
}
