import { PendingRegistrationStatus, type Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

export const pendingSelect = {
  id: true,
  email: true,
  status: true,
  passwordHash: true,
  payload: true,
  codeHash: true,
  codeExpiresAt: true,
  attempts: true,
  maxAttempts: true,
  sendCount: true,
  lastSentAt: true,
  expiresAt: true,
} satisfies Prisma.PendingRegistrationSelect;

export type PendingRow = Prisma.PendingRegistrationGetPayload<{ select: typeof pendingSelect }>;

/** Serializes submissions for one email (per-email limits and supersede are race-free). */
export async function lockEmail(tx: Tx, email: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pending-registration:${email}`}, 0))`;
}

export async function countCreatedSince(db: Db, email: string, since: Date): Promise<number> {
  return db.pendingRegistration.count({ where: { email, createdAt: { gte: since } } });
}

export async function supersedeOpen(tx: Tx, email: string): Promise<number> {
  const r = await tx.pendingRegistration.updateMany({
    where: { email, status: PendingRegistrationStatus.PENDING },
    data: { status: PendingRegistrationStatus.SUPERSEDED },
  });
  return r.count;
}

export async function createPending(
  tx: Tx,
  data: {
    id: string;
    email: string;
    passwordHash: string;
    payload: Prisma.InputJsonValue;
    codeHash: string;
    codeExpiresAt: Date;
    expiresAt: Date;
    ipAddress?: string;
  },
): Promise<void> {
  await tx.pendingRegistration.create({ data, select: { id: true } });
}

export async function findPendingById(db: Db, id: string): Promise<PendingRow | null> {
  return db.pendingRegistration.findUnique({ where: { id }, select: pendingSelect });
}

/**
 * Counts one verification attempt BEFORE the code is compared. Atomic and
 * committed independently of the finalize transaction, so a wrong guess can
 * never be rolled back. Returns false when the row is not open, expired, or
 * out of attempts.
 */
export async function consumeAttempt(db: Db, id: string, now: Date): Promise<boolean> {
  const r = await db.pendingRegistration.updateMany({
    where: {
      id,
      status: PendingRegistrationStatus.PENDING,
      codeExpiresAt: { gt: now },
      expiresAt: { gt: now },
      attempts: { lt: db.pendingRegistration.fields.maxAttempts },
    },
    data: { attempts: { increment: 1 } },
  });
  return r.count === 1;
}

/**
 * Atomic single-use claim (replay protection). Compares the exact code hash
 * that was verified, so a code rotated by a concurrent resend cannot be consumed.
 */
export async function claimForFinalize(tx: Tx, row: PendingRow, now: Date): Promise<boolean> {
  const r = await tx.pendingRegistration.updateMany({
    where: {
      id: row.id,
      status: PendingRegistrationStatus.PENDING,
      codeHash: row.codeHash,
      codeExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
    data: { status: PendingRegistrationStatus.COMPLETED, consumedAt: now },
  });
  return r.count === 1;
}

/** Records provenance and scrubs PII + secrets from a completed row. */
export async function scrubCompleted(
  tx: Tx,
  id: string,
  provenance: { userId: string; applicantId: string },
): Promise<void> {
  await tx.pendingRegistration.update({
    where: { id },
    data: { ...provenance, payload: {}, passwordHash: "", codeHash: "" },
    select: { id: true },
  });
}

/** Optimistic rotate: only succeeds if nobody else rotated/consumed since we read. */
export async function rotateCode(
  db: Db,
  row: Pick<PendingRow, "id" | "lastSentAt" | "sendCount">,
  next: { codeHash: string; codeExpiresAt: Date; now: Date },
): Promise<boolean> {
  const r = await db.pendingRegistration.updateMany({
    where: { id: row.id, status: PendingRegistrationStatus.PENDING, lastSentAt: row.lastSentAt },
    data: {
      codeHash: next.codeHash,
      codeExpiresAt: next.codeExpiresAt,
      attempts: 0,
      sendCount: { increment: 1 },
      lastSentAt: next.now,
    },
  });
  return r.count === 1;
}

/** Housekeeping: expire stale PENDING rows, purge old terminal rows. */
export async function sweepPending(db: Db, now: Date, purgeBefore: Date): Promise<{ expired: number; purged: number }> {
  const expired = await db.pendingRegistration.updateMany({
    where: { status: PendingRegistrationStatus.PENDING, expiresAt: { lte: now } },
    data: { status: PendingRegistrationStatus.EXPIRED, payload: {}, passwordHash: "", codeHash: "" },
  });
  const purged = await db.pendingRegistration.deleteMany({
    where: { status: { not: PendingRegistrationStatus.PENDING }, updatedAt: { lt: purgeBefore } },
  });
  return { expired: expired.count, purged: purged.count };
}
