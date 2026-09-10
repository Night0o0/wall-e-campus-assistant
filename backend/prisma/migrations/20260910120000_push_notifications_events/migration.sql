-- Push notifications: event notification types + a stable idempotency key.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New NotificationType labels
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The same PostgreSQL rule as the account-notice migration governs this section:
-- `ALTER TYPE … ADD VALUE` may run inside a transaction on PostgreSQL 12+, but
-- the value it adds cannot be *used* in that same transaction. Prisma runs one
-- migration per transaction, so this file only adds the labels and adds a column
-- and an index that do not reference them. The first row carrying one of these
-- types is written by the application, in a later transaction, which is allowed.
-- Supabase runs PostgreSQL 15, so the in-transaction form is correct here.

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'COURSE_MATERIAL_PUBLISHED';

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'SCHEDULE_CREATED';

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'SCHEDULE_UPDATED';

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'SCHEDULE_CANCELLED';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Event idempotency key
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Lecture reminders are deduplicated by (userId, lectureScheduleId,
-- occurrenceStartsAt, type). Event notifications (account decisions, material
-- publications, schedule changes) have no lectureScheduleId or occurrence, and a
-- unique constraint over NULLs would not dedupe them, so they carry an explicit
-- per-recipient key. The column is nullable and stays NULL for lecture
-- reminders; PostgreSQL allows a unique index to hold arbitrarily many NULLs, so
-- existing rows and future reminders are unaffected.

-- AlterTable
ALTER TABLE "public"."Notification" ADD COLUMN "eventKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notification_event_identity" ON "public"."Notification"("eventKey");
