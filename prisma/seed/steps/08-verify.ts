import type { SeedCtx } from "../context";
import { sid } from "../lib/helpers";

export async function verifySeed(ctx: SeedCtx): Promise<void> {
  const checks: { name: string; sql: string; params?: unknown[] }[] = [
    { name: "PAID order must have exactly one PAID payment of equal amount",
      sql: `SELECT o.id FROM "Order" o WHERE o.status='PAID' AND NOT o."isFreeOrder" AND (SELECT count(*) FROM "Payment" p WHERE p."orderId"=o.id AND p.status='PAID' AND p.amount=o."totalAmount")<>1` },
    { name: "PAID/REFUNDED payment needs a processed charge.success",
      sql: `SELECT p.id FROM "Payment" p WHERE p.status IN ('PAID','REFUNDED') AND NOT EXISTS (SELECT 1 FROM "PaymentEvent" e WHERE e."paymentId"=p.id AND e."eventType"='charge.success' AND e."processedAt" IS NOT NULL)` },
    { name: "PENDING/FAILED orders must not be fulfilled",
      sql: `SELECT o.id FROM "Order" o WHERE o.status IN ('PENDING','FAILED') AND (EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."orderId"=o.id) OR EXISTS (SELECT 1 FROM "OrderItem" oi JOIN "CohortMember" m ON m."orderItemId"=oi.id WHERE oi."orderId"=o.id))` },
    { name: "Enrollment shape per source",
      sql: `SELECT id FROM "Enrollment" WHERE (source='PURCHASE' AND ("pricingId" IS NULL OR "orderItemId" IS NULL)) OR (source='COHORT_SEAT' AND ("cohortId" IS NULL OR "pricingId" IS NOT NULL)) OR (source='ADMIN_GRANT' AND ("grantedById" IS NULL OR "grantReason" IS NULL))` },
    { name: "ACTIVE member needs ACTIVE profile (allowlist: suspended-denial case)",
      sql: `SELECT cm.id FROM "CohortMember" cm JOIN "StudentProfile" sp ON sp."userId"=cm."userId" JOIN users u ON u.id=cm."userId" WHERE cm.status='ACTIVE' AND sp.status<>'ACTIVE' AND u.email<>$1`,
      params: [ctx.users.tunde.email] },
    { name: "Member joined before registration",
      sql: `SELECT cm.id FROM "CohortMember" cm JOIN "StudentProfile" sp ON sp."userId"=cm."userId" WHERE cm."joinedAt"<sp."registeredAt"` },
    { name: "Cohort over capacity",
      sql: `SELECT c.id FROM "Cohort" c WHERE c.capacity IS NOT NULL AND (SELECT count(*) FROM "CohortMember" m WHERE m."cohortId"=c.id AND m.status='ACTIVE')>c.capacity` },
    { name: "Seat order outside offer window",
      sql: `SELECT o.id FROM "Order" o JOIN "OrderItem" oi ON oi."orderId"=o.id JOIN "CohortOffer" co ON co.id=oi."cohortOfferId" WHERE o."createdAt"<co."opensAt" OR o."createdAt">co."closesAt"` },
    { name: "Time ordering (user <= order <= enrollment)",
      sql: `SELECT e.id FROM "Enrollment" e JOIN "Order" o ON o.id=e."orderId" WHERE e."startedAt"<o."createdAt" UNION SELECT o.id FROM "Order" o JOIN users u ON u.id=o."userId" WHERE o."createdAt"<u."createdAt"` },
    { name: "ACTIVE enrollment past expiresAt (allowlist: payroll-stale)",
      sql: `SELECT id FROM "Enrollment" WHERE status='ACTIVE' AND "expiresAt"<now() AND id<>$1`,
      params: [sid("enrollment:purchase-test-payroll-stale")] },
    { name: "Import batch counters vs linked profiles",
      sql: `SELECT b.id FROM "StudentImportBatch" b WHERE b."successRows"<>(SELECT count(*) FROM "StudentProfile" sp WHERE sp."importBatchId"=b.id)` },
    { name: "Announcement notification sent to non-ACTIVE student",
      sql: `SELECT n.id FROM "Notification" n JOIN "StudentProfile" sp ON sp."userId"=n."userId" WHERE n.type='ANNOUNCEMENT' AND sp.status<>'ACTIVE'` },
    { name: "Session host not an instructor of every targeted cohort",
      sql: `SELECT ls.id FROM "LiveSession" ls JOIN "LiveSessionCohort" l ON l."sessionId"=ls.id WHERE ls."hostId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CohortInstructor" ci WHERE ci."cohortId"=l."cohortId" AND ci."userId"=ls."hostId")` },
    { name: "ADMIN_GRANT without ENROLLMENT_GRANTED audit row",
      sql: `SELECT e.id FROM "Enrollment" e WHERE e.source='ADMIN_GRANT' AND NOT EXISTS (SELECT 1 FROM "AdminAuditLog" a WHERE a.action='ENROLLMENT_GRANTED' AND a."targetId"=e.id)` },
    { name: "progressPercentage > 0 with no Progress rows",
      sql: `SELECT e.id FROM "Enrollment" e WHERE e."progressPercentage">0 AND NOT EXISTS (SELECT 1 FROM "Progress" p WHERE p."enrollmentId"=e.id)` },
  ];

  const failures: string[] = [];
  for (const c of checks) {
    const rows = await ctx.db.$queryRawUnsafe<{ id: string }[]>(c.sql, ...(c.params ?? []));
    if (rows.length) failures.push(`${c.name}: ${rows.length} row(s), e.g. ${rows[0].id}`);
  }
  if (failures.length) throw new Error(`Seed invariants violated:\n - ${failures.join("\n - ")}`);
  console.log(`  verify: ${checks.length} invariants hold`);
}