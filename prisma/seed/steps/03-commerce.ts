import type { SeedCtx } from "../context";
import { BONUS_DAYS, DAY_MS } from "../config";
import { addMinutes, daysAgo, sid } from "../lib/helpers";
import {
  insertOrder,
  orderExists,
  orderIdFor,
  orderItemIdFor,
  seedProgress,
} from "../lib/commerce";

/**
 * Ten course-purchase scenarios (no cohort seats — those are step 04).
 *
 *  1. test     30-day accounting + bonus → expiresAt = start + 60d
 *  2. lifetime lifetime financial-analysis + certificate
 *  3. jane     free Excel (no Payment row)
 *  4. jane     bookkeeping REVOKED + refund event
 *  5. test     payroll ACTIVE but expiresAt in the past (date-based denial)
 *  6. jane     audit EXPIRED status
 *  7. test     open taxation checkout (PENDING, reusable link)
 *  8. jane     stale pending order (sweeper target)
 *  9. lifetime failed payment on corporate finance
 * 10. test     corporate finance PAID + AMOUNT_MISMATCH event
 */
export async function seedCommerce(ctx: SeedCtx): Promise<void> {
  const { db } = ctx;
  let created = 0;
  let skipped = 0;

  const once = async (key: string, run: () => Promise<void>): Promise<void> => {
    if (await orderExists(db, key)) {
      skipped++;
      return;
    }
    await run();
    created++;
  };

  // 1 ── active 30-day + bonus ────────────────────────────────────────────
  await once("purchase-test-accounting-30", async () => {
    const user = ctx.users.test;
    const course = ctx.courses["accounting-basics"];
    const pricing = course.pricings["30"];
    const startedAt = daysAgo(5);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-test-accounting-30",
        user,
        createdAt: startedAt,
        orderStatus: "PAID",
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: pricing.price,
            bonusDays: pricing.bonusDays,
          },
        ],
        payment: {
          status: "PAID",
          events: [{ type: "charge.success", processed: true }],
        },
      });

      const enrollmentId = sid("enrollment:purchase-test-accounting-30");
      const expiresAt = new Date(
        startedAt.getTime() + (30 + pricing.bonusDays) * DAY_MS,
      );
      await tx.enrollment.create({
        data: {
          id: enrollmentId,
          userId: user.id,
          courseId: course.id,
          pricingId: pricing.id,
          orderItemId: orderItemIdFor("purchase-test-accounting-30"),
          orderId: orderIdFor("purchase-test-accounting-30"),
          source: "PURCHASE",
          status: "ACTIVE",
          startedAt,
          expiresAt,
          progressPercentage: 42,
        },
      });
      await seedProgress(tx, enrollmentId, course, 0.42);
    });
  });

  // 2 ── lifetime + certificate ───────────────────────────────────────────
  await once("purchase-lifetime-analysis", async () => {
    const user = ctx.users.lifetime;
    const course = ctx.courses["financial-analysis"];
    const pricing = course.pricings.lifetime;
    const startedAt = daysAgo(40);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-lifetime-analysis",
        user,
        createdAt: startedAt,
        orderStatus: "PAID",
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: pricing.price,
            bonusDays: 0,
          },
        ],
        payment: {
          status: "PAID",
          events: [{ type: "charge.success", processed: true }],
        },
      });

      const enrollmentId = sid("enrollment:purchase-lifetime-analysis");
      await tx.enrollment.create({
        data: {
          id: enrollmentId,
          userId: user.id,
          courseId: course.id,
          pricingId: pricing.id,
          orderItemId: orderItemIdFor("purchase-lifetime-analysis"),
          orderId: orderIdFor("purchase-lifetime-analysis"),
          source: "PURCHASE",
          status: "ACTIVE",
          startedAt,
          expiresAt: null,
          completedAt: daysAgo(5),
          progressPercentage: 100,
        },
      });
      await seedProgress(tx, enrollmentId, course, 1);
      await tx.certificate.create({
        data: {
          id: sid("cert:lifetime-analysis"),
          enrollmentId,
          url: "https://cdn.academy.example/certificates/lifetime-analysis.pdf",
          verification: "SEEDCERT01",
          courseTitleAtIssuance: course.title,
          issuedAt: daysAgo(5),
        },
      });
    });
  });

  // 3 ── free order, no Payment row ───────────────────────────────────────
  await once("purchase-jane-excel-free", async () => {
    const user = ctx.users.jane;
    const course = ctx.courses["excel-for-accountants"];
    const pricing = course.pricings.free;
    const startedAt = daysAgo(12);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-jane-excel-free",
        user,
        createdAt: startedAt,
        orderStatus: "PAID",
        isFreeOrder: true,
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: 0,
            bonusDays: 0,
          },
        ],
        // no payment
      });

      const enrollmentId = sid("enrollment:purchase-jane-excel-free");
      await tx.enrollment.create({
        data: {
          id: enrollmentId,
          userId: user.id,
          courseId: course.id,
          pricingId: pricing.id,
          orderItemId: orderItemIdFor("purchase-jane-excel-free"),
          orderId: orderIdFor("purchase-jane-excel-free"),
          source: "PURCHASE",
          status: "ACTIVE",
          startedAt,
          expiresAt: null,
          progressPercentage: 25,
        },
      });
      await seedProgress(tx, enrollmentId, course, 0.25);
    });
  });

  // 4 ── refunded + REVOKED ───────────────────────────────────────────────
  await once("purchase-jane-bookkeeping-revoked", async () => {
    const user = ctx.users.jane;
    const course = ctx.courses["bookkeeping-essentials"];
    const pricing = course.pricings["7"];
    const startedAt = daysAgo(20);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-jane-bookkeeping-revoked",
        user,
        createdAt: startedAt,
        orderStatus: "REFUNDED",
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: pricing.price,
            bonusDays: 0,
          },
        ],
        payment: {
          status: "REFUNDED",
          events: [
            { type: "charge.success", processed: true },
            { type: "refund.processed", processed: true },
          ],
        },
      });

      await tx.enrollment.create({
        data: {
          id: sid("enrollment:purchase-jane-bookkeeping-revoked"),
          userId: user.id,
          courseId: course.id,
          pricingId: pricing.id,
          orderItemId: orderItemIdFor("purchase-jane-bookkeeping-revoked"),
          orderId: orderIdFor("purchase-jane-bookkeeping-revoked"),
          source: "PURCHASE",
          status: "REVOKED",
          startedAt,
          expiresAt: new Date(startedAt.getTime() + 7 * DAY_MS),
          progressPercentage: 8,
        },
      });
    });
  });

  // 5 ── ACTIVE status, expiresAt in the past ─────────────────────────────
  await once("purchase-test-payroll-stale", async () => {
    const user = ctx.users.test;
    const course = ctx.courses["payroll-management"];
    const pricing = course.pricings["30"];
    const startedAt = daysAgo(80);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-test-payroll-stale",
        user,
        createdAt: startedAt,
        orderStatus: "PAID",
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: pricing.price,
            bonusDays: pricing.bonusDays,
          },
        ],
        payment: {
          status: "PAID",
          events: [{ type: "charge.success", processed: true }],
        },
      });

      await tx.enrollment.create({
        data: {
          id: sid("enrollment:purchase-test-payroll-stale"),
          userId: user.id,
          courseId: course.id,
          pricingId: pricing.id,
          orderItemId: orderItemIdFor("purchase-test-payroll-stale"),
          orderId: orderIdFor("purchase-test-payroll-stale"),
          source: "PURCHASE",
          status: "ACTIVE", // intentional: access layer must use dates
          startedAt,
          expiresAt: new Date(
            startedAt.getTime() + (30 + pricing.bonusDays) * DAY_MS,
          ),
          progressPercentage: 60,
        },
      });
    });
  });

  // 6 ── EXPIRED status ───────────────────────────────────────────────────
  await once("purchase-jane-audit-expired", async () => {
    const user = ctx.users.jane;
    const course = ctx.courses["audit-fundamentals"];
    const pricing = course.pricings["30"];
    const startedAt = daysAgo(100);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-jane-audit-expired",
        user,
        createdAt: startedAt,
        orderStatus: "PAID",
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: pricing.price,
            bonusDays: pricing.bonusDays,
          },
        ],
        payment: {
          status: "PAID",
          events: [{ type: "charge.success", processed: true }],
        },
      });

      await tx.enrollment.create({
        data: {
          id: sid("enrollment:purchase-jane-audit-expired"),
          userId: user.id,
          courseId: course.id,
          pricingId: pricing.id,
          orderItemId: orderItemIdFor("purchase-jane-audit-expired"),
          orderId: orderIdFor("purchase-jane-audit-expired"),
          source: "PURCHASE",
          status: "EXPIRED",
          startedAt,
          expiresAt: new Date(
            startedAt.getTime() + (30 + pricing.bonusDays) * DAY_MS,
          ),
          progressPercentage: 55,
        },
      });
    });
  });

  // 7 ── open PENDING checkout (link reuse / one pending payment) ─────────
  await once("checkout-test-taxation-pending", async () => {
    const user = ctx.users.test;
    const course = ctx.courses["advanced-taxation"];
    const pricing = course.pricings["30"];
    const createdAt = daysAgo(0);

    await insertOrder(db, {
      key: "checkout-test-taxation-pending",
      user,
      createdAt,
      orderStatus: "PENDING",
      expiresAt: addMinutes(createdAt, 30),
      items: [
        {
          pricingId: pricing.id,
          unitPrice: pricing.price,
          bonusDays: pricing.bonusDays,
        },
      ],
      payment: {
        status: "PENDING",
        events: [],
      },
    });
  });

  // 8 ── stale pending order (sweeper) ────────────────────────────────────
  await once("checkout-jane-stale-pending", async () => {
    const user = ctx.users.jane;
    const course = ctx.courses["audit-fundamentals"];
    const pricing = course.pricings["90"];
    const createdAt = daysAgo(3);

    await insertOrder(db, {
      key: "checkout-jane-stale-pending",
      user,
      createdAt,
      orderStatus: "PENDING",
      expiresAt: addMinutes(createdAt, 30), // already expired window
      items: [
        {
          pricingId: pricing.id,
          unitPrice: pricing.price,
          bonusDays: 0,
        },
      ],
      payment: {
        status: "PENDING",
        events: [],
      },
    });
  });

  // 9 ── failed payment ───────────────────────────────────────────────────
  await once("checkout-lifetime-corporate-failed", async () => {
    const user = ctx.users.lifetime;
    const course = ctx.courses["corporate-finance-strategy"];
    const pricing = course.pricings["30"];
    const createdAt = daysAgo(2);

    await insertOrder(db, {
      key: "checkout-lifetime-corporate-failed",
      user,
      createdAt,
      orderStatus: "FAILED",
      expiresAt: addMinutes(createdAt, 30),
      items: [
        {
          pricingId: pricing.id,
          unitPrice: pricing.price,
          bonusDays: pricing.bonusDays,
        },
      ],
      payment: {
        status: "FAILED",
        events: [{ type: "charge.failed", processed: true }],
      },
    });
  });

  // 10 ─ paid + AMOUNT_MISMATCH event (ops) ───────────────────────────────
  await once("purchase-test-corporate-mismatch", async () => {
    const user = ctx.users.test;
    const course = ctx.courses["corporate-finance-strategy"];
    const pricing = course.pricings["30"];
    const startedAt = daysAgo(1);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: "purchase-test-corporate-mismatch",
        user,
        createdAt: startedAt,
        orderStatus: "PENDING",
        expiresAt: addMinutes(startedAt, 30),
        items: [
          {
            pricingId: pricing.id,
            unitPrice: pricing.price,
            bonusDays: pricing.bonusDays,
          },
        ],
        payment: {
          status: "PENDING",
          events: [
            {
              type: "charge.success",
              processed: false,
              error: "AMOUNT_MISMATCH: charge does not match payment",
              amountKobo: 100, // wrong vs order total
            },
          ],
        },
      });

      // await tx.enrollment.create({
      //   data: {
      //     id: sid("enrollment:purchase-test-corporate-mismatch"),
      //     userId: user.id,
      //     courseId: course.id,
      //     pricingId: pricing.id,
      //     orderItemId: orderItemIdFor("purchase-test-corporate-mismatch"),
      //     orderId: orderIdFor("purchase-test-corporate-mismatch"),
      //     source: "PURCHASE",
      //     status: "ACTIVE",
      //     startedAt,
      //     expiresAt: new Date(
      //       startedAt.getTime() + (30 + pricing.bonusDays) * DAY_MS,
      //     ),
      //     progressPercentage: 5,
      //   },
      // });
    });
  });

  console.log(`  commerce: ${created} scenarios created, ${skipped} already present`);
}