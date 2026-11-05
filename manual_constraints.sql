-- ============================================================
-- manual_constraints.sql
-- Constraints Prisma cannot express. Append to the generated
-- migration (use `prisma migrate dev --create-only`, then edit).
-- Table names are the Prisma model names unless @@map is used.
-- ============================================================

-- ------------------------------------------------------------
-- PHASE 1: Enrollment source integrity
-- ------------------------------------------------------------
-- v3: three creation channels.
--  PURCHASE    : course offer bought  -> orderItemId + pricingId, no cohort
--  ADMIN_GRANT : staff granted        -> grantedById, no orderItemId
--  COHORT_SEAT : bundled by a paid seat -> cohortId, no orderItemId/pricingId
--                (the seat's OrderItem lives on CohortMember.orderItemId)
ALTER TABLE "Enrollment"
  ADD CONSTRAINT enrollment_source_consistency CHECK (
    (
      "source" = 'PURCHASE'
      AND "orderItemId" IS NOT NULL
      AND "pricingId"   IS NOT NULL
      AND "cohortId"    IS NULL
    )
    OR
    (
      "source" = 'ADMIN_GRANT'
      AND "orderItemId" IS NULL
      AND "grantedById" IS NOT NULL
    )
    OR
    (
      "source" = 'COHORT_SEAT'
      AND "orderItemId" IS NULL
      AND "pricingId"   IS NULL
      AND "cohortId"    IS NOT NULL
    )
  );

-- Access window sanity.
ALTER TABLE "Enrollment"
  ADD CONSTRAINT enrollment_expiry_after_start CHECK (
    "expiresAt" IS NULL OR "expiresAt" > "startedAt"
  );

-- Cohort date sanity.
ALTER TABLE "Cohort"
  ADD CONSTRAINT cohort_dates_valid CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" >= "startsAt"
  );

-- ------------------------------------------------------------
-- PHASE 2: Announcements and notifications
-- ------------------------------------------------------------
-- A target row points at exactly one of cohort / course.
ALTER TABLE "AnnouncementTarget"
  ADD CONSTRAINT announcement_target_exactly_one CHECK (
    ("cohortId" IS NULL) <> ("courseId" IS NULL)
  );

-- Unread badge / unread list (hot path).
CREATE INDEX notification_unread_idx
  ON "Notification" ("userId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

-- Scheduler scan: announcements due to publish.
CREATE INDEX announcement_due_idx
  ON "Announcement" ("scheduledFor")
  WHERE "status" = 'SCHEDULED' AND "deletedAt" IS NULL;

-- Failed / pending email deliveries (ops dashboard + retry sweeper).
CREATE INDEX notification_delivery_attention_idx
  ON "NotificationDelivery" ("createdAt")
  WHERE "status" IN ('PENDING', 'FAILED', 'BOUNCED');

-- ------------------------------------------------------------
-- PHASE 3: Live sessions
-- ------------------------------------------------------------
ALTER TABLE "LiveSession"
  ADD CONSTRAINT live_session_ends_after_start CHECK ("endsAt" > "startsAt");

-- Reminder scheduler: upcoming sessions only.
CREATE INDEX live_session_upcoming_idx
  ON "LiveSession" ("startsAt")
  WHERE "status" = 'SCHEDULED';

-- ------------------------------------------------------------
-- PHASE 4: Chat
-- ------------------------------------------------------------
-- A non-system message must carry text or at least one attachment,
-- unless it has been moderated away.
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT chat_message_has_content CHECK (
    "type" = 'SYSTEM'
    OR "deletedAt" IS NOT NULL
    OR "body" IS NOT NULL
    OR jsonb_array_length("attachments") > 0
  );

-- ------------------------------------------------------------
-- EXISTING (already in your migrations; kept here as the checklist)
-- ------------------------------------------------------------
-- CREATE UNIQUE INDEX course_pricing_one_lifetime_per_course
--   ON "CoursePricing" ("courseId")
--   WHERE "accessDurationDays" IS NULL AND "isActive" = true;
-- CREATE UNIQUE INDEX course_pricing_one_active_duration_per_course
--   ON "CoursePricing" ("courseId", "accessDurationDays")
--   WHERE "isActive" = true AND "accessDurationDays" IS NOT NULL;

-- ------------------------------------------------------------
-- MIGRATION NOTES for the cleanup changes (not constraints)
-- ------------------------------------------------------------
-- 1. Otp.code -> Otp.codeHash. Prisma will generate drop+add. OTPs are
--    short-lived, so purge first; do NOT try to hash old plaintext rows:
--      DELETE FROM "Otp";
--    Update the OTP service to store HMAC-SHA256(code, OTP_SECRET) and
--    compare in constant time.
-- 2. Cart.courseId is dropped. Verify nothing reads it:
--      SELECT count(*) FROM "Cart" WHERE "courseId" IS NOT NULL;
-- 3. Payment.gatewayEventId loses its UNIQUE constraint. Backfill the
--    new PaymentEvent table from existing payments so duplicates keep
--    being rejected:
--      INSERT INTO "PaymentEvent"
--        (id, gateway, "eventId", "eventType", "paymentId", reference,
--         "signatureValid", "rawPayload", "processedAt", "receivedAt")
--      SELECT gen_random_uuid(), gateway, "gatewayEventId", 'legacy',
--             id, reference, true, COALESCE("rawPayload", '{}'::jsonb),
--             "updatedAt", "createdAt"
--      FROM "Payment" WHERE "gatewayEventId" IS NOT NULL;
-- 4. Position uniques on Topic and ProgramCourse are dropped (relaxing
--    only; no data change needed).

-- 5. Order.userId and Payment.userId become REQUIRED (no guest checkout),
--    with ON DELETE RESTRICT instead of SET NULL (financial records must
--    never lose their owner). PRE-FLIGHT: both queries must return 0, or
--    the migration fails. Resolve legacy rows first (link to a real user
--    or archive them deliberately, never default them).
--      SELECT count(*) FROM "Order"   WHERE "userId" IS NULL;
--      SELECT count(*) FROM "Payment" WHERE "userId" IS NULL;

-- 6. At most ONE pending payment per order. Makes checkout initiation
--    idempotent under concurrency (insert-first; the loser gets P2002 and
--    reuses the winner's link). PRE-FLIGHT, must return 0 rows or the index
--    fails to build; fix duplicates by marking the older ones FAILED:
--      SELECT "orderId", count(*) FROM "Payment"
--       WHERE status = 'PENDING' GROUP BY "orderId" HAVING count(*) > 1;
CREATE UNIQUE INDEX payment_one_pending_per_order
  ON "Payment" ("orderId")
  WHERE "status" = 'PENDING';


-- ============================================================
-- v3 additions: live-class seats, licences, chat scopes
-- ============================================================

-- An order/cart line is EITHER a course offer OR a cohort seat.
ALTER TABLE "OrderItem"
  ADD CONSTRAINT order_item_one_product CHECK (
    ("pricingId" IS NULL) <> ("cohortOfferId" IS NULL)
  );
ALTER TABLE "Cart"
  ADD CONSTRAINT cart_one_product CHECK (
    ("pricingId" IS NULL) <> ("cohortOfferId" IS NULL)
  );

-- Chat room is scoped to exactly one of cohort / course.
ALTER TABLE "ChatRoom"
  ADD CONSTRAINT chat_room_one_scope CHECK (
    ("cohortId" IS NULL) <> ("courseId" IS NULL)
  );

-- joinUrl is required for every provider except the in-app classroom.
ALTER TABLE "LiveSession"
  ADD CONSTRAINT live_session_join_target CHECK (
    "provider" = 'LIVEKIT' OR "joinUrl" IS NOT NULL
  );

-- One Zoom/Meet licence hosts ONE meeting at a time: the database refuses
-- overlapping sessions on the same licence (cancelled ones do not count).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "LiveSession"
  ADD CONSTRAINT live_session_no_licence_overlap
  EXCLUDE USING gist (
    "meetingAccountId" WITH =,
    tsrange("startsAt", "endsAt") WITH &&
  )
  WHERE ("meetingAccountId" IS NOT NULL AND "status" <> 'CANCELLED');

-- Bonus can never be negative.
ALTER TABLE "CoursePricing" ADD CONSTRAINT course_pricing_bonus_nonneg CHECK ("bonusDays" >= 0);
ALTER TABLE "CohortOffer"   ADD CONSTRAINT cohort_offer_bonus_nonneg   CHECK ("bonusDays" >= 0);
ALTER TABLE "OrderItem"     ADD CONSTRAINT order_item_bonus_nonneg     CHECK ("bonusDays" >= 0);

-- Seat capacity count (hot path under the cohort lock).
CREATE INDEX cohort_member_active_idx
  ON "CohortMember" ("cohortId") WHERE "status" = 'ACTIVE';

-- MIGRATION NOTES (v2 -> v3)
-- 1. OrderItem.pricingId and Cart.pricingId become NULLABLE. Existing rows
--    all have pricingId set, so order_item_one_product / cart_one_product
--    pass. Regenerate the Prisma client: every `item.pricing.x` in your
--    code is now `item.pricing?.x` and TypeScript will tell you where.
-- 2. Order creation MUST copy offer.bonusDays onto OrderItem.bonusDays.
--    Until it does, bonuses silently do not apply.
-- 3. ChatRoom.cohortId becomes nullable; existing rows keep their cohort.
