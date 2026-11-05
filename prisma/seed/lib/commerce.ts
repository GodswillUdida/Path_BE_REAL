import { PaymentGateway, Prisma, type PaymentStatus } from "@prisma/client";
import type { SeedCourse, SeedUser } from "../context";
import { addMinutes, payRef, sid, SEED_NOW } from "./helpers";

type Db = Prisma.TransactionClient; // PrismaClient is assignable, so both db and tx work

export const orderIdFor = (key: string): string => sid(`order:${key}`);
export const orderItemIdFor = (key: string, index = 0): string => sid(`oi:${key}:${index}`);

export async function orderExists(db: Db, key: string): Promise<boolean> {
  return (await db.order.count({ where: { id: orderIdFor(key) } })) > 0;
}

export interface OrderItemSpec {
  pricingId?: string;
  cohortOfferId?: string;
  unitPrice: Prisma.Decimal | number | string;
  bonusDays: number;
  quantity?: number;
}
export interface PaymentEventSpec {
  type: "charge.success" | "charge.failed" | "refund.processed";
  processed: boolean;
  error?: string;
  /** Gateway-reported amount in kobo; override to simulate a mismatch. */
  amountKobo?: number;
}
export interface InsertOrderOpts {
  key: string;
  user: SeedUser;
  createdAt: Date;
  orderStatus: PaymentStatus;
  expiresAt: Date;
  isFreeOrder?: boolean;
  items: OrderItemSpec[];
  payment?: { status: PaymentStatus; events: PaymentEventSpec[] };
}

const fail = (key: string, msg: string): never => {
  throw new Error(`[seed:${key}] ${msg}`);
};

function assertCoherent(o: InsertOrderOpts, total: Prisma.Decimal): void {
  for (const i of o.items) {
    if (Boolean(i.pricingId) === Boolean(i.cohortOfferId)) fail(o.key, "item needs exactly one of pricingId / cohortOfferId");
  }
  if (o.isFreeOrder) {
    if (o.payment || !total.isZero()) fail(o.key, "free order must total 0 and carry no payment");
    return;
  }
  const p = o.payment;
  if (!p) return fail(o.key, "non-free order needs a payment");
  if (p.status !== o.orderStatus) fail(o.key, `order ${o.orderStatus} vs payment ${p.status}`);
  const fulfilled = p.events.some((e) => e.type === "charge.success" && e.processed);
  if ((o.orderStatus === "PAID" || o.orderStatus === "REFUNDED") && !fulfilled) fail(o.key, `${o.orderStatus} needs a processed charge.success`);
  if ((o.orderStatus === "PENDING" || o.orderStatus === "FAILED") && fulfilled) fail(o.key, `${o.orderStatus} cannot have a processed charge.success`);
}

const gatewayBody = (reference: string, e: PaymentEventSpec, kobo: number) => ({
  event: e.type,
  data: {
    reference,
    status: e.type === "charge.success" ? "success" : e.type === "charge.failed" ? "failed" : "processed",
    amount: e.amountKobo ?? kobo,
    currency: "NGN",
  },
});

export async function insertOrder(db: Db, o: InsertOrderOpts): Promise<{ orderId: string; total: Prisma.Decimal }> {
  const total = o.items.reduce(
    (sum, i) => sum.add(new Prisma.Decimal(i.unitPrice).mul(i.quantity ?? 1)),
    new Prisma.Decimal(0),
  );
  assertCoherent(o, total);

  const orderId = orderIdFor(o.key);
  await db.order.create({
    data: {
      id: orderId, userId: o.user.id, email: o.user.email, name: o.user.name,
      totalAmount: total, isFreeOrder: o.isFreeOrder ?? false, currency: "NGN",
      status: o.orderStatus, expiresAt: o.expiresAt, createdAt: o.createdAt, updatedAt: o.createdAt,
    },
  });
  await db.orderItem.createMany({
    data: o.items.map((i, idx) => ({
      id: orderItemIdFor(o.key, idx), orderId,
      pricingId: i.pricingId ?? null, cohortOfferId: i.cohortOfferId ?? null,
      unitPrice: new Prisma.Decimal(i.unitPrice), quantity: i.quantity ?? 1,
      bonusDays: i.bonusDays, createdAt: o.createdAt,
    })),
  });

  if (o.payment) {
    const paymentId = sid(`pay:${o.key}`);
    const reference = payRef(o.key);
    const kobo = total.mul(100).toNumber();
    const events = o.payment.events;
    const last = events[events.length - 1];

    await db.payment.create({
      data: {
        id: paymentId, userId: o.user.id, reference, orderId, amount: total, currency: "NGN",
        status: o.payment.status, gateway: PaymentGateway.PAYSTACK,
        gatewayEventId: last ? `seed-evt-${o.key}-${events.length - 1}` : null,
        rawPayload: last ? gatewayBody(reference, last, kobo) : undefined,
        metadata: { seed: true, key: o.key },
        createdAt: o.createdAt, updatedAt: addMinutes(o.createdAt, 1 + events.length),
      },
    });
    await db.paymentEvent.createMany({
      data: events.map((e, idx) => ({
        id: sid(`pe:${o.key}:${idx}`), gateway: PaymentGateway.PAYSTACK,
        eventId: `seed-evt-${o.key}-${idx}`, eventType: e.type, paymentId, reference,
        signatureValid: true, rawPayload: gatewayBody(reference, e, kobo),
        processedAt: e.processed ? addMinutes(o.createdAt, 1 + idx) : null,
        processingError: e.error ?? null,
        attempts: e.processed || e.error ? 1 : 0,
        receivedAt: addMinutes(o.createdAt, 1 + idx),
      })),
    });
  }
  return { orderId, total };
}

/** Writes Progress rows AND the enrollment's denormalized percentage (duration-weighted). */
export async function seedProgress(db: Db, enrollmentId: string, course: SeedCourse, fraction: number): Promise<number> {
  const { startedAt } = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, select: { startedAt: true } });
  const topics = await db.topic.findMany({
    where: { deletedAt: null, module: { courseId: course.id, deletedAt: null } },
    orderBy: [{ module: { position: "asc" } }, { position: "asc" }, { id: "asc" }],
    select: { id: true, durationSeconds: true },
  });
  const totalSeconds = topics.reduce((s, t) => s + t.durationSeconds, 0);
  const target = Math.min(Math.max(fraction, 0), 1) * topics.length;
  const full = Math.floor(target);
  const partial = target - full;

  let watched = 0;
  const rows: Prisma.ProgressCreateManyInput[] = [];
  for (const [i, t] of topics.entries()) {
    const share = i < full ? 1 : i === full ? partial : 0;
    if (share === 0) continue;
    const seconds = Math.round(t.durationSeconds * share);
    watched += seconds;
    rows.push({
      id: sid(`progress:${enrollmentId}:${t.id}`), enrollmentId, topicId: t.id,
      completed: share === 1, watchedSeconds: seconds, watchedRanges: seconds ? [[0, seconds]] : [],
      lastWatchedAt: new Date(Math.min(addMinutes(startedAt, 60 * (i + 1)).getTime(), SEED_NOW.getTime())),
      duration: t.durationSeconds,
    });
  }
  await db.progress.createMany({ data: rows, skipDuplicates: true });

  const pct = Math.round((totalSeconds > 0 ? (watched / totalSeconds) * 100 : fraction * 100) * 10) / 10;
  await db.enrollment.update({ where: { id: enrollmentId }, data: { progressPercentage: pct } });
  return pct;
}