-- Phase 2 — the attendance lifecycle: stale auto-close and the absence sweep.
--
-- Strictly additive. One new enum, two nullable columns, one index. No column
-- is dropped or narrowed, no existing value is rewritten, and no row is
-- written, updated or deleted.
--
-- Both columns are nullable with no default, which in PostgreSQL is a
-- catalogue-only change: the table is not rewritten and no existing Session row
-- is touched. Every session already in the database therefore reads as
-- closeReason = NULL and absencesSweptAt = NULL.
--
-- Those NULLs are meaningful rather than merely unset:
--
--   * A CLOSED session with closeReason = NULL was closed before this column
--     existed. It is deliberately NOT backfilled to MANUAL — that would be a
--     claim about how it was closed that nobody can actually support.
--
--   * absencesSweptAt = NULL means the roll has not been called. Every existing
--     closed session is in exactly that state, correctly: no ABSENT row has
--     ever been written by this system, so no roll has ever been called. The
--     sweep will pick them up on its first run and record the absences that
--     were always true but never written down. That is a data-creating
--     operation, which is precisely why the sweep is gated behind
--     ATTENDANCE_WORKER_ENABLED and why this migration is not being applied
--     until the deployment is approved.

-- CreateEnum
CREATE TYPE "public"."SessionCloseReason" AS ENUM ('MANUAL', 'AUTO_STALE');

-- AlterTable
ALTER TABLE "public"."Session" ADD COLUMN     "absencesSweptAt" TIMESTAMP(3),
ADD COLUMN     "closeReason" "public"."SessionCloseReason";

-- CreateIndex
-- The sweep's two queries: sessions still open, and closed rolls not yet called.
CREATE INDEX "Session_status_absencesSweptAt_idx" ON "public"."Session"("status", "absencesSweptAt");
