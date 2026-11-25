-- READ-ONLY. Run against production (psql -f) BEFORE any migration or cleanup.
-- Nothing here modifies data. Paste the output into
-- PATHFINDER_IMPLEMENTATION_STATUS.md ("Production verification").

\echo '== 1. Which manual constraints exist? (expect 6 rows if manual_constraints.sql was applied)'
SELECT conname FROM pg_constraint
WHERE conname IN ('enrollment_source_consistency','enrollment_expiry_after_start','cohort_dates_valid',
                  'announcement_target_exactly_one','live_session_ends_after_start','chat_message_has_content')
ORDER BY 1;

\echo '== 2. OrderItem pricing/cohortOffer XOR check present?'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = '"OrderItem"'::regclass AND contype = 'c';

\echo '== 3. Enum values (need DRAFT/CANCELLED on CohortStatus, EXPIRED on CohortMemberStatus)'
SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('CohortStatus','CohortMemberStatus','StudentStatus','StudentRegistrationSource')
GROUP BY t.typname;

\echo '== 4. Applied migrations (prisma _prisma_migrations)'
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;

\echo '== 5. Legacy risk: unverified users that already hold a StudentProfile'
SELECT count(*) AS unverified_users_with_profile
FROM users u JOIN "StudentProfile" sp ON sp."userId" = u.id
WHERE u."emailVerified" = false;

\echo '== 5b. Detail (no PII beyond email local part masking)'
SELECT u.id, regexp_replace(u.email, '^(.).*(@.*)$', '\1***\2') AS email_masked,
       u."createdAt", sp.status AS profile_status, sp."registrationSource",
       (SELECT count(*) FROM "Applicant" a WHERE a."userId" = u.id)  AS applicants,
       (SELECT count(*) FROM "Order" o WHERE o."userId" = u.id)      AS orders,
       (SELECT count(*) FROM "Payment" p WHERE p."userId" = u.id)    AS payments,
       (SELECT count(*) FROM "Enrollment" e WHERE e."userId" = u.id) AS enrollments,
       (SELECT count(*) FROM "CohortMember" cm WHERE cm."userId" = u.id) AS cohort_memberships
FROM users u JOIN "StudentProfile" sp ON sp."userId" = u.id
WHERE u."emailVerified" = false
ORDER BY u."createdAt";

\echo '== 6. Would the 24h unverified-user cleanup have FK problems? (users it would delete that are referenced)'
SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."userId" = u.id)) AS has_profile,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."userId" = u.id))            AS has_orders,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."userId" = u.id))       AS has_enrollments,
       count(*) AS total_candidates
FROM users u WHERE u."emailVerified" = false AND u."createdAt" < now() - interval '24 hours';

\echo '== 7. Data that would violate manual constraints if applied now'
SELECT count(*) AS cohort_bad_dates FROM "Cohort" WHERE "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "endsAt" <= "startsAt";
SELECT count(*) AS orderitem_neither_or_both FROM "OrderItem" WHERE ("pricingId" IS NULL) = ("cohortOfferId" IS NULL);
SELECT count(*) AS enrollment_expiry_before_start FROM "Enrollment" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= "startedAt";
