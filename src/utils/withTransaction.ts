import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type Tx = Prisma.TransactionClient;

/**
 * The only way services open a transaction, so services never import
 * Prisma directly. Repositories accept the `tx` it hands out.
 */
export function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  return prisma.$transaction(fn, options);
}