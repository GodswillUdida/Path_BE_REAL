import { faker } from "@faker-js/faker";
import { StudentStatus, type Prisma } from "@prisma/client";
import type { SeedCohort, SeedCtx } from "../context";
import { BONUS_DAYS, BULK_STUDENTS, DAY_MS, SEED_VALUE } from "../config";
import { addMinutes, daysAgo, inDays, sid } from "../lib/helpers";
import { insertOrder, orderExists, orderIdFor, orderItemIdFor, seedProgress } from "../lib/commerce";

interface CohortSpec {
  key: string;
  name: string;
  slug: string;
  centre: string;
  status: "UPCOMING" | "ACTIVE" | "COMPLETED";
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  courses: string[];
  instructors: ("instructor" | "instructor2")[];
  offer: { name: string; price: number; opensAt: Date; closesAt: Date; active: boolean };
}

/**
 * Three batches that exercise every cohort state:
 *   evening   ACTIVE, open for late joiners
 *   weekend   UPCOMING, capacity 3 and already FULL (tests the full-batch path)
 *   completed ended 10 days ago: live access over, content still inside the
 *             free-bonus window (endsAt + 30 days)
 */
const COHORTS: CohortSpec[] = [
  {
    key: "evening", name: "ATS Evening Class (Lagos), Oct 2026", slug: "ats-evening-lagos-oct-2026", centre: "Lagos",
    status: "ACTIVE", startsAt: daysAgo(14), endsAt: inDays(76), capacity: 30,
    courses: ["accounting-basics", "bookkeeping-essentials"], instructors: ["instructor"],
    offer: { name: "Full seat: evening class", price: 60_000, opensAt: daysAgo(30), closesAt: inDays(7), active: true },
  },
  {
    key: "weekend", name: "Weekend Finance Batch (Abuja)", slug: "weekend-finance-abuja", centre: "Abuja",
    status: "UPCOMING", startsAt: inDays(10), endsAt: inDays(100), capacity: 3,
    courses: ["financial-analysis"], instructors: ["instructor2"],
    offer: { name: "Full seat: weekend batch", price: 85_000, opensAt: daysAgo(5), closesAt: inDays(9), active: true },
  },
  {
    key: "completed", name: "ICAN Foundation Batch (Lagos), Jul 2026", slug: "ican-foundation-lagos-jul-2026", centre: "Lagos",
    status: "COMPLETED", startsAt: daysAgo(100), endsAt: daysAgo(10), capacity: 30,
    courses: ["accounting-basics"], instructors: ["instructor"],
    offer: { name: "Full seat: closed batch", price: 55_000, opensAt: daysAgo(130), closesAt: daysAgo(105), active: false },
  },
];

export async function seedStudents(ctx: SeedCtx): Promise<void> {
  const { db } = ctx;
  faker.seed(SEED_VALUE + 4);
  const admin = ctx.users.admin;

  // ── cohorts, courses, instructors, offers ──────────────────────────────
  for (const c of COHORTS) {
    const row = await db.cohort.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        id: sid(`cohort:${c.key}`), name: c.name, slug: c.slug, centre: c.centre, status: c.status,
        description: `${c.name}: live classes with recordings, class chat and announcements.`,
        startsAt: c.startsAt, endsAt: c.endsAt, capacity: c.capacity, createdById: admin.id,
      },
      select: { id: true },
    });

    await db.cohortCourse.createMany({
      data: c.courses.map((slug) => ({ id: sid(`cohortCourse:${c.key}:${slug}`), cohortId: row.id, courseId: ctx.courses[slug].id })),
      skipDuplicates: true,
    });
    await db.cohortInstructor.createMany({
      data: c.instructors.map((k) => ({ id: sid(`cohortInstructor:${c.key}:${k}`), cohortId: row.id, userId: ctx.users[k].id })),
      skipDuplicates: true,
    });

    const offerId = sid(`offer:${c.key}`);
    await db.cohortOffer.upsert({
      where: { id: offerId },
      update: {},
      create: {
        id: offerId, cohortId: row.id, name: c.offer.name, price: c.offer.price, currency: "NGN",
        includesCourseAccess: true, bonusDays: BONUS_DAYS, opensAt: c.offer.opensAt, closesAt: c.offer.closesAt,
        isActive: c.offer.active,
      },
    });

    const cohort: SeedCohort = { id: row.id, key: c.key, name: c.name, startsAt: c.startsAt, endsAt: c.endsAt, courseSlugs: c.courses, memberIds: [] };
    ctx.cohorts[c.key] = cohort;
    ctx.offers[c.key] = { id: offerId, cohortKey: c.key, price: c.offer.price, bonusDays: BONUS_DAYS };
  }

  // ── bulk CSV import batch + applicants ─────────────────────────────────
  const batchId = sid("import:legacy-students");
  await db.studentImportBatch.upsert({
    where: { id: batchId },
    update: {},
    create: {
      id: batchId, uploadedById: admin.id, fileUrl: "https://seed.example/imports/legacy-students.csv",
      status: "COMPLETED_WITH_ERRORS", totalRows: BULK_STUDENTS + 5, successRows: BULK_STUDENTS + 3, failedRows: 2,
      errors: [
        { row: 6, email: "not-an-email", code: "INVALID_EMAIL", message: "Email address is not valid" },
        { row: 13, email: "student03@seed.example", code: "DUPLICATE_ROW", message: "Email appears twice in the file" },
      ],
      options: { cohortKey: "evening" }, startedAt: daysAgo(30), completedAt: addMinutes(daysAgo(30), 2), createdAt: daysAgo(30),
    },
  });

  const legacyStatuses = ["PENDING", "REVIEWED", "APPROVED", "REJECTED"] as const;
  for (const [i, status] of legacyStatuses.entries()) {
    const fullName = faker.person.fullName();
    const id = sid(`applicant:legacy:${i}`);
    await db.applicant.upsert({
      where: { id },
      update: {},
      create: {
        id, fullName, status,
        email: faker.internet.email({ firstName: fullName.split(" ")[0] }).toLowerCase(),
        phone: faker.phone.number(), address: faker.location.streetAddress({ useFullAddress: true }),
        lectureCenter: faker.helpers.arrayElement(["Lagos", "Abuja", "Port Harcourt"]),
        isNewStudent: faker.datatype.boolean(), level: faker.helpers.arrayElement(["Diploma", "Certificate"]),
        careerChallenges: faker.lorem.sentence(), referredBy: i % 2 === 0 ? faker.person.fullName() : null,
        ...(status !== "PENDING" && status !== "REJECTED"
          ? { employment: { create: { id: sid(`employment:${id}`), placeOfWork: faker.company.name(), position: faker.person.jobTitle() } } }
          : {}),
        ...(status === "APPROVED"
          ? { sponsor: { create: { id: sid(`sponsor:${id}`), name: faker.person.fullName(), phone: faker.phone.number(), email: faker.internet.email(), location: faker.location.city(), workplace: faker.company.name() } } }
          : {}),
      },
    });
  }

  // Ada applied through the app: auto-approved, linked to her account, a
  // picked batch, and real courses chosen from the backend list.
  const adaApplicantId = sid("applicant:ada");
  await db.applicant.upsert({
    where: { id: adaApplicantId },
    update: {},
    create: {
      id: adaApplicantId, fullName: ctx.users.ada.name ?? "Ada Lovelace", email: ctx.users.ada.email, phone: "+2348020000001",
      address: "12 Allen Avenue, Ikeja, Lagos", lectureCenter: "Lagos", isNewStudent: true, level: "Diploma",
      status: "APPROVED", userId: ctx.users.ada.id, cohortOfferId: ctx.offers.evening.id,
      approvedAt: daysAgo(21), autoApproved: true, createdAt: daysAgo(21),
    },
  });
  await db.applicantPaper.createMany({
    data: ["accounting-basics", "bookkeeping-essentials"].map((slug) => ({
      id: sid(`paper:ada:${slug}`), applicantId: adaApplicantId, paperName: ctx.courses[slug].title, courseId: ctx.courses[slug].id,
    })),
    skipDuplicates: true,
  });

  // ── student profiles (STATUS only: access is always paid for) ──────────
  const bulkKeys = Array.from({ length: BULK_STUDENTS }, (_, i) => `student${String(i + 1).padStart(2, "0")}`);
  type ProfileSpec = {
    key: string; code: string; status: StudentStatus; source: "MANUAL" | "CSV_IMPORT" | "APPLICATION";
    reason?: string; applicantId?: string; batch?: boolean; byAdmin?: boolean;
  };
  const profiles: ProfileSpec[] = [
    { key: "ada", code: "PF-2026-0001", status: "ACTIVE", source: "APPLICATION", applicantId: adaApplicantId },
    { key: "chidi", code: "PF-2026-0002", status: "ACTIVE", source: "MANUAL", byAdmin: true },
    { key: "ngozi", code: "PF-2026-0003", status: "ACTIVE", source: "CSV_IMPORT", batch: true, byAdmin: true },
    { key: "tunde", code: "PF-2026-0004", status: "SUSPENDED", source: "MANUAL", byAdmin: true, reason: "Payment dispute under review" },
    { key: "bola", code: "PF-2026-0005", status: "ALUMNI", source: "MANUAL", byAdmin: true },
    ...bulkKeys.map((key, i): ProfileSpec => ({
      key, code: `PF-2026-${String(100 + i + 1).padStart(4, "0")}`, status: "ACTIVE", source: "CSV_IMPORT", batch: true, byAdmin: true,
    })),
  ];
  await db.studentProfile.createMany({
    data: profiles.map((p) => ({
      id: sid(`student:${p.key}`), userId: ctx.users[p.key].id, studentCode: p.code, status: p.status,
      statusReason: p.reason ?? null, statusChangedAt: p.reason ? daysAgo(3) : null,
      registrationSource: p.source, registeredById: p.byAdmin ? admin.id : null, registeredAt: daysAgo(30),
      applicantId: p.applicantId ?? null, importBatchId: p.batch ? batchId : null,
    })),
    skipDuplicates: true,
  });

  // ── seat purchases: order + payment + membership + bundled content ─────
  let created = 0;
  let skipped = 0;

  const seatPurchase = async (o: {
    key: string; userKey: string; cohortKey: string; paidDaysAgo: number; progress: number; memberStatus: "ACTIVE" | "COMPLETED";
  }): Promise<void> => {
    const user = ctx.users[o.userKey];
    const cohort = ctx.cohorts[o.cohortKey];
    const offer = ctx.offers[o.cohortKey];
    if (await orderExists(db, o.key)) {
      // Re-run: the rows exist, but later steps still need the member list.
      if (o.memberStatus === "ACTIVE") cohort.memberIds.push(user.id);
      skipped++;
      return;
    }
    const paidAt = daysAgo(o.paidDaysAgo);

    await db.$transaction(async (tx) => {
      await insertOrder(tx, {
        key: o.key, user, createdAt: paidAt, orderStatus: "PAID", expiresAt: addMinutes(paidAt, 30),
        items: [{ cohortOfferId: offer.id, unitPrice: offer.price, bonusDays: offer.bonusDays }],
        payment: { status: "PAID", events: [{ type: "charge.success", processed: true }] },
      });

      // Live access ends with the batch.
      const memberId = sid(`member:${o.cohortKey}:${o.userKey}`);
      await tx.cohortMember.create({
        data: {
          id: memberId, cohortId: cohort.id, userId: user.id, status: o.memberStatus, source: "PURCHASE",
          orderItemId: orderItemIdFor(o.key), expiresAt: cohort.endsAt, joinedAt: paidAt,
        },
      });

      // Bundled content ends at batch end + the free bonus.
      const until = new Date(cohort.endsAt.getTime() + offer.bonusDays * DAY_MS);
      for (const slug of cohort.courseSlugs) {
        const enrollmentId = sid(`enrollment:seat:${o.key}:${slug}`);
        await tx.enrollment.create({
          data: {
            id: enrollmentId, userId: user.id, courseId: ctx.courses[slug].id, source: "COHORT_SEAT",
            cohortId: cohort.id, status: "ACTIVE", startedAt: paidAt, expiresAt: until,
          },
        });
        await seedProgress(tx, enrollmentId, ctx.courses[slug], o.progress);
      }

      const notificationId = sid(`notif:seat:${o.key}`);
      await tx.notification.create({
        data: {
          id: notificationId, userId: user.id, type: "SEAT_CONFIRMED", title: `Your seat in ${cohort.name} is confirmed`,
          refType: "CohortMember", refId: memberId, dedupeKey: `seat-confirmation:${orderIdFor(o.key)}:${memberId}`,
          readAt: o.paidDaysAgo > 10 ? addMinutes(paidAt, 30) : null, createdAt: paidAt,
        },
      });
      await tx.notificationDelivery.create({
        data: {
          id: sid(`delivery:seat:${o.key}`), notificationId, channel: "EMAIL", status: "SENT", toAddress: user.email,
          provider: "email-service", attempts: 1, sentAt: paidAt, createdAt: paidAt,
        },
      });
    }, { timeout: 30_000 });

    if (o.memberStatus === "ACTIVE") cohort.memberIds.push(user.id);
    created++;
  };

  await seatPurchase({ key: "seat-evening-ada", userKey: "ada", cohortKey: "evening", paidDaysAgo: 20, progress: 0.35, memberStatus: "ACTIVE" });
  await seatPurchase({ key: "seat-evening-chidi", userKey: "chidi", cohortKey: "evening", paidDaysAgo: 19, progress: 0.5, memberStatus: "ACTIVE" });
  await seatPurchase({ key: "seat-evening-ngozi", userKey: "ngozi", cohortKey: "evening", paidDaysAgo: 18, progress: 0.2, memberStatus: "ACTIVE" });
  await seatPurchase({ key: "seat-evening-s01", userKey: "student01", cohortKey: "evening", paidDaysAgo: 17, progress: 0.15, memberStatus: "ACTIVE" });
  await seatPurchase({ key: "seat-evening-s02", userKey: "student02", cohortKey: "evening", paidDaysAgo: 16, progress: 0.1, memberStatus: "ACTIVE" });
  await seatPurchase({ key: "seat-evening-s03", userKey: "student03", cohortKey: "evening", paidDaysAgo: 15, progress: 0.05, memberStatus: "ACTIVE" });
  // Finished batch: members COMPLETED, content still open through the bonus window.
  await seatPurchase({ key: "seat-completed-bola", userKey: "bola", cohortKey: "completed", paidDaysAgo: 105, progress: 0.9, memberStatus: "COMPLETED" });
  await seatPurchase({ key: "seat-completed-s10", userKey: "student10", cohortKey: "completed", paidDaysAgo: 104, progress: 0.7, memberStatus: "COMPLETED" });
  await seatPurchase({ key: "seat-completed-s11", userKey: "student11", cohortKey: "completed", paidDaysAgo: 103, progress: 0.6, memberStatus: "COMPLETED" });

  // ── staff-added members (no order) and manual enrollments ──────────────
  const adminAdd: { cohortKey: string; userKey: string; grantCourse?: string }[] = [
    { cohortKey: "evening", userKey: "student04", grantCourse: "accounting-basics" },
    { cohortKey: "evening", userKey: "student05", grantCourse: "accounting-basics" },
    { cohortKey: "evening", userKey: "tunde" }, // member, but SUSPENDED profile: the policy must deny him
    { cohortKey: "weekend", userKey: "student07" },
    { cohortKey: "weekend", userKey: "student08" },
    { cohortKey: "weekend", userKey: "student09" }, // 3 of 3: batch is full
  ];
  await db.cohortMember.createMany({
    data: adminAdd.map((a) => ({
      id: sid(`member:${a.cohortKey}:${a.userKey}`), cohortId: ctx.cohorts[a.cohortKey].id, userId: ctx.users[a.userKey].id,
      status: "ACTIVE" as const, source: "ADMIN" as const, expiresAt: ctx.cohorts[a.cohortKey].endsAt, joinedAt: daysAgo(10),
    })),
    skipDuplicates: true,
  });
  for (const a of adminAdd) ctx.cohorts[a.cohortKey].memberIds.push(ctx.users[a.userKey].id);

  const grants = [
    ...adminAdd.filter((a) => a.grantCourse).map((a) => ({
      key: `grant-${a.userKey}-${a.grantCourse}`, userKey: a.userKey, slug: a.grantCourse!,
      reason: "Offline payment received at the Lagos centre", expiresAt: new Date(ctx.cohorts.evening.endsAt.getTime() + BONUS_DAYS * DAY_MS),
    })),
    { key: "grant-chidi-audit", userKey: "chidi", slug: "audit-fundamentals", reason: "Scholarship award", expiresAt: inDays(90) },
  ];
  await db.enrollment.createMany({
    data: grants.map((g) => ({
      id: sid(`enrollment:${g.key}`), userId: ctx.users[g.userKey].id, courseId: ctx.courses[g.slug].id, source: "ADMIN_GRANT" as const,
      grantedById: admin.id, grantReason: g.reason, status: "ACTIVE" as const, startedAt: daysAgo(9), expiresAt: g.expiresAt,
    })),
    skipDuplicates: true,
  });

  console.log(`  students: ${profiles.length} profiles, ${COHORTS.length} cohorts, ${created} seat purchases (${skipped} already present), ${grants.length} admin grants`);
}