-- Phase 3 — course material links, and the audit trail behind student approval.
--
-- NOT APPLIED. Written, reviewed and committed ahead of being run, like the
-- three migrations before it. Applying it is a separate, explicit decision.
--
-- Strictly additive. One new table, three new nullable columns on User, four
-- indexes and two foreign keys. Nothing is dropped, nothing is narrowed, no
-- existing value is rewritten, and no row is inserted, updated or deleted.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. User.verifiedAt / User.verifiedById
-- ─────────────────────────────────────────────────────────────────────────────
--
-- User.isVerified already exists and already defaults to false. It is not
-- touched here, and in particular it is NOT backfilled.
--
-- That matters more than it looks. Every student currently in the database
-- registered through /api/auth/register, which has never set isVerified, so
-- every one of them reads false — and as of this release, false means "cannot
-- use the system". Backfilling them to true would be the convenient thing to
-- do and the wrong one: it would assert that somebody approved each of those
-- accounts, which nobody did. They are pending, correctly, and staff will work
-- through the queue at /api/admin/students/pending.
--
-- If a pilot deployment needs its existing students admitted in bulk, that is a
-- deliberate operational act with a name and a date attached, not a side effect
-- of a schema change. It does not belong in this file.
--
-- Both columns are nullable with no default, which in PostgreSQL is a
-- catalogue-only change: the table is not rewritten and no existing row is
-- touched. NULL on an approved-but-unaudited row is honest — it says the
-- approval predates the audit trail, rather than naming somebody who was not
-- there.
--
-- The self-referencing foreign key is ON DELETE SET NULL: deleting a member of
-- staff must not delete, or block deleting, the students they approved. The
-- approval survives; only the attribution is lost.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CourseMaterial
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A new table with no dependants, so it cannot affect any existing query.
--
-- "section" is the only nullable part of the academic address, and the NULL is
-- load-bearing: it means "every section of this cohort", which is the common
-- case. See the model comment in schema.prisma.
--
-- course_id is ON DELETE CASCADE — a material link addresses a course, and a
-- link to a deleted course addresses nothing. added_by_id is RESTRICT, matching
-- how the schema already treats authorship elsewhere (Course.createdById,
-- Session.createdById): a user who has published material cannot be hard
-- deleted out from under it.

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateTable
CREATE TABLE "public"."CourseMaterial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "section" TEXT,
    "title" TEXT NOT NULL,
    "driveUrl" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_verifiedById_idx" ON "public"."User"("verifiedById");

-- CreateIndex
CREATE INDEX "CourseMaterial_organizationId_idx" ON "public"."CourseMaterial"("organizationId");

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_idx" ON "public"."CourseMaterial"("courseId");

-- CreateIndex
CREATE INDEX "CourseMaterial_addedById_idx" ON "public"."CourseMaterial"("addedById");

-- CreateIndex
-- The student lookup: every column it filters on, in order.
CREATE INDEX "CourseMaterial_organizationId_isActive_faculty_department_l_idx" ON "public"."CourseMaterial"("organizationId", "isActive", "faculty", "department", "level", "semester");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
