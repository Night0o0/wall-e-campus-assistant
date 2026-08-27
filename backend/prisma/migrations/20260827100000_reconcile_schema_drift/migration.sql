-- Reconciles the migration history with schema.prisma.
--
-- WHY THIS EXISTS
--
-- The database was previously built with `prisma db push`, which applies
-- schema.prisma directly and never writes a migration ledger. schema.prisma
-- therefore drifted ahead of the migration history: replaying all 12
-- migrations from empty produced a schema that `prisma migrate diff` reported
-- as different (exit code 2), so the migrations could never reproduce the
-- schema the application is generated against.
--
-- This migration closes that gap by appending to the history. The existing 12
-- migrations are left exactly as they are and are NOT marked applied by hand.
--
-- It covers three things:
--   1. AcademicTerm.isActive -> isCurrent, including the default change.
--   2. 29 indexes declared in schema.prisma that no migration ever created.
--   3. One index name that Postgres truncated differently than Prisma expects.

-- 1. AcademicTerm.isActive -> isCurrent
--
-- A RENAME rather than DROP + ADD: it preserves column values, so this stays
-- correct if it is ever replayed against a database that holds rows.
--
-- The default also changes, true -> false, and a rename alone would not carry
-- that; without the second statement the schema still drifts.
--
-- Note on semantics: the old flag meant "this term is active" and defaulted to
-- true; the new one means "this is the current term" and defaults to false.
-- Existing row VALUES are carried across unchanged by the rename, which would
-- mark every previously-active term as current. That is harmless here because
-- no database anywhere holds AcademicTerm rows, but it is the reason this is
-- worth reading before replaying against populated data.
ALTER TABLE "public"."AcademicTerm" RENAME COLUMN "isActive" TO "isCurrent";
ALTER TABLE "public"."AcademicTerm" ALTER COLUMN "isCurrent" SET DEFAULT false;

-- 2. Indexes declared in schema.prisma but never created by a migration.
--    All are plain (non-unique) indexes, so no constraint semantics change.

-- CreateIndex
CREATE INDEX "AcademicTerm_organizationId_isCurrent_idx" ON "public"."AcademicTerm"("organizationId", "isCurrent");

-- CreateIndex
CREATE INDEX "Assignment_organizationId_deadline_idx" ON "public"."Assignment"("organizationId", "deadline");

-- CreateIndex
CREATE INDEX "Assignment_departmentId_deadline_idx" ON "public"."Assignment"("departmentId", "deadline");

-- CreateIndex
CREATE INDEX "Assignment_createdById_idx" ON "public"."Assignment"("createdById");

-- CreateIndex
CREATE INDEX "AssignmentAttachment_fileId_idx" ON "public"."AssignmentAttachment"("fileId");

-- CreateIndex
CREATE INDEX "AssignmentCohort_cohortId_idx" ON "public"."AssignmentCohort"("cohortId");

-- CreateIndex
CREATE INDEX "AssignmentGrade_gradedById_idx" ON "public"."AssignmentGrade"("gradedById");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "public"."AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Cohort_organizationId_isActive_idx" ON "public"."Cohort"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Cohort_departmentId_level_idx" ON "public"."Cohort"("departmentId", "level");

-- CreateIndex
CREATE INDEX "CourseMaterial_departmentId_idx" ON "public"."CourseMaterial"("departmentId");

-- CreateIndex
CREATE INDEX "CourseMaterial_cohortId_idx" ON "public"."CourseMaterial"("cohortId");

-- CreateIndex
CREATE INDEX "CourseMaterial_offeringId_idx" ON "public"."CourseMaterial"("offeringId");

-- CreateIndex
CREATE INDEX "CourseMaterial_fileId_idx" ON "public"."CourseMaterial"("fileId");

-- CreateIndex
CREATE INDEX "CourseOffering_organizationId_isActive_idx" ON "public"."CourseOffering"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "CourseOffering_departmentId_termId_idx" ON "public"."CourseOffering"("departmentId", "termId");

-- CreateIndex
CREATE INDEX "CourseOfferingCohort_cohortId_idx" ON "public"."CourseOfferingCohort"("cohortId");

-- CreateIndex
CREATE INDEX "Enrollment_offeringId_isActive_idx" ON "public"."Enrollment"("offeringId", "isActive");

-- CreateIndex
CREATE INDEX "FileAsset_organizationId_uploadedById_idx" ON "public"."FileAsset"("organizationId", "uploadedById");

-- CreateIndex
CREATE INDEX "GradeItem_departmentId_category_idx" ON "public"."GradeItem"("departmentId", "category");

-- CreateIndex
CREATE INDEX "GradeItem_createdById_idx" ON "public"."GradeItem"("createdById");

-- CreateIndex
CREATE INDEX "LectureSchedule_departmentId_idx" ON "public"."LectureSchedule"("departmentId");

-- CreateIndex
CREATE INDEX "LectureSchedule_cohortId_idx" ON "public"."LectureSchedule"("cohortId");

-- CreateIndex
CREATE INDEX "LectureSchedule_offeringId_idx" ON "public"."LectureSchedule"("offeringId");

-- CreateIndex
CREATE INDEX "LectureSchedule_teachingAssignmentId_idx" ON "public"."LectureSchedule"("teachingAssignmentId");

-- CreateIndex
CREATE INDEX "StudentGrade_gradedById_idx" ON "public"."StudentGrade"("gradedById");

-- CreateIndex
CREATE INDEX "StudentProfile_cohortId_idx" ON "public"."StudentProfile"("cohortId");

-- CreateIndex
CREATE INDEX "TeachingAssignment_organizationId_instructorId_isActive_idx" ON "public"."TeachingAssignment"("organizationId", "instructorId", "isActive");

-- CreateIndex
CREATE INDEX "TeachingAssignment_offeringId_isActive_idx" ON "public"."TeachingAssignment"("offeringId", "isActive");

-- 3. Index name correction.
--
-- Migration 20260826123000 hardcodes a 68-character identifier:
--   TeachingAssignment_offeringId_instructorId_cohortId_teachingRole_key
-- Postgres truncates identifiers at 63 bytes, yielding "..._teachingRol",
-- while Prisma abbreviates long @@unique names to "..._teachin_key". Without
-- this rename the two never agree and the drift reproduces on every replay.

-- RenameIndex
ALTER INDEX "public"."TeachingAssignment_offeringId_instructorId_cohortId_teachingRol" RENAME TO "TeachingAssignment_offeringId_instructorId_cohortId_teachin_key";
