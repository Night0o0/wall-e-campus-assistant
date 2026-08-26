-- Leornian academic-core cutover.
--
-- REVIEWED ARTIFACT ONLY: this migration is intentionally not applied by the
-- implementation task. Take a database backup and test it against a restored
-- production snapshot before `prisma migrate deploy`.
--
-- Robot credentials are retired without deleting their records: the old table
-- is renamed to an archive that Prisma no longer exposes. It can be exported
-- and dropped in a later retention migration.

-- Identity and authorization vocabulary.
ALTER TYPE "public"."UserRole" RENAME VALUE 'UNIVERSITY_SUPER_ADMIN' TO 'UNIVERSITY_ADMIN';
ALTER TYPE "public"."UserRole" RENAME VALUE 'ADMIN' TO 'INSTRUCTOR';
ALTER TYPE "public"."UserRole" ADD VALUE 'DEPARTMENT_ADMIN';

ALTER TYPE "public"."NotificationType" RENAME VALUE 'LECTURE_ADMIN_24H' TO 'LECTURE_INSTRUCTOR_24H';
ALTER TYPE "public"."NotificationType" RENAME VALUE 'LECTURE_ADMIN_30M' TO 'LECTURE_INSTRUCTOR_30M';
ALTER TYPE "public"."NotificationType" ADD VALUE 'ASSIGNMENT_PUBLISHED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'ASSIGNMENT_DUE_SOON';
ALTER TYPE "public"."NotificationType" ADD VALUE 'GRADE_PUBLISHED';

CREATE TYPE "public"."AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'DISABLED');
CREATE TYPE "public"."TeachingRole" AS ENUM ('LECTURER', 'TEACHING_ASSISTANT');
CREATE TYPE "public"."GradeCategory" AS ENUM ('ASSIGNMENT', 'QUIZ', 'COURSEWORK', 'MIDTERM', 'FINAL', 'OTHER');
CREATE TYPE "public"."AuditAction" AS ENUM ('CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'DISABLE', 'ENABLE', 'DELETE', 'PUBLISH', 'UNPUBLISH');

-- Subscription limits now describe infrastructure the product actually uses.
ALTER TABLE "public"."SubscriptionPlan" RENAME COLUMN "maxRobots" TO "storageLimitGb";

-- University organization structure.
CREATE TABLE "public"."Department" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AcademicTerm" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "semester" INTEGER NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Cohort" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "section" TEXT,
  "groupName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."User"
  ADD COLUMN "authUserId" TEXT,
  ADD COLUMN "accountStatus" "public"."AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "departmentId" TEXT,
  ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "public"."StudentProfile" ADD COLUMN "cohortId" TEXT;
ALTER TABLE "public"."Course" ADD COLUMN "departmentId" TEXT;

-- One catalog course delivered in one term, with explicit audience and staff.
CREATE TABLE "public"."CourseOffering" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "displayName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CourseOfferingCohort" (
  "offeringId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  CONSTRAINT "CourseOfferingCohort_pkey" PRIMARY KEY ("offeringId", "cohortId")
);

CREATE TABLE "public"."TeachingAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "cohortId" TEXT,
  "teachingRole" "public"."TeachingRole" NOT NULL DEFAULT 'LECTURER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Enrollment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."LectureSchedule"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "cohortId" TEXT,
  ADD COLUMN "offeringId" TEXT,
  ADD COLUMN "teachingAssignmentId" TEXT;

-- Private-file metadata, assignments and gradebook.
CREATE TABLE "public"."FileAsset" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "objectPath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksum" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."CourseMaterial"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "cohortId" TEXT,
  ADD COLUMN "offeringId" TEXT,
  ADD COLUMN "fileId" TEXT;

CREATE TABLE "public"."Assignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "deadline" TIMESTAMP(3) NOT NULL,
  "maxScore" DECIMAL(8,2) NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AssignmentCohort" (
  "assignmentId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  CONSTRAINT "AssignmentCohort_pkey" PRIMARY KEY ("assignmentId", "cohortId")
);

CREATE TABLE "public"."AssignmentAttachment" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AssignmentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AssignmentGrade" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "score" DECIMAL(8,2) NOT NULL,
  "feedback" TEXT,
  "gradedById" TEXT NOT NULL,
  "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "AssignmentGrade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."GradeItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "assignmentId" TEXT,
  "category" "public"."GradeCategory" NOT NULL,
  "name" TEXT NOT NULL,
  "maxScore" DECIMAL(8,2) NOT NULL,
  "weight" DECIMAL(5,2),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."StudentGrade" (
  "id" TEXT NOT NULL,
  "gradeItemId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "score" DECIMAL(8,2) NOT NULL,
  "feedback" TEXT,
  "gradedById" TEXT NOT NULL,
  "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentGrade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" "public"."AuditAction" NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Uniqueness and lookup indexes.
CREATE UNIQUE INDEX "User_authUserId_key" ON "public"."User"("authUserId");
CREATE UNIQUE INDEX "Department_organizationId_code_key" ON "public"."Department"("organizationId", "code");
CREATE UNIQUE INDEX "Department_organizationId_name_key" ON "public"."Department"("organizationId", "name");
CREATE INDEX "Department_organizationId_isActive_idx" ON "public"."Department"("organizationId", "isActive");
CREATE UNIQUE INDEX "AcademicTerm_organizationId_academicYear_semester_key" ON "public"."AcademicTerm"("organizationId", "academicYear", "semester");
CREATE UNIQUE INDEX "Cohort_departmentId_academicYear_level_section_groupName_key" ON "public"."Cohort"("departmentId", "academicYear", "level", "section", "groupName");
CREATE UNIQUE INDEX "CourseOffering_courseId_termId_departmentId_key" ON "public"."CourseOffering"("courseId", "termId", "departmentId");
CREATE UNIQUE INDEX "TeachingAssignment_offeringId_instructorId_cohortId_teachingRole_key" ON "public"."TeachingAssignment"("offeringId", "instructorId", "cohortId", "teachingRole");
CREATE UNIQUE INDEX "Enrollment_offeringId_studentId_key" ON "public"."Enrollment"("offeringId", "studentId");
CREATE UNIQUE INDEX "FileAsset_bucket_objectPath_key" ON "public"."FileAsset"("bucket", "objectPath");
CREATE UNIQUE INDEX "AssignmentAttachment_assignmentId_fileId_key" ON "public"."AssignmentAttachment"("assignmentId", "fileId");
CREATE UNIQUE INDEX "AssignmentGrade_assignmentId_studentId_key" ON "public"."AssignmentGrade"("assignmentId", "studentId");
CREATE UNIQUE INDEX "GradeItem_assignmentId_key" ON "public"."GradeItem"("assignmentId");
CREATE UNIQUE INDEX "StudentGrade_gradeItemId_studentId_key" ON "public"."StudentGrade"("gradeItemId", "studentId");

CREATE INDEX "User_departmentId_idx" ON "public"."User"("departmentId");
CREATE INDEX "User_accountStatus_idx" ON "public"."User"("accountStatus");
CREATE INDEX "Course_departmentId_idx" ON "public"."Course"("departmentId");
CREATE INDEX "Enrollment_organizationId_studentId_isActive_idx" ON "public"."Enrollment"("organizationId", "studentId", "isActive");
CREATE INDEX "Assignment_offeringId_isPublished_deadline_idx" ON "public"."Assignment"("offeringId", "isPublished", "deadline");
CREATE INDEX "AssignmentGrade_studentId_publishedAt_idx" ON "public"."AssignmentGrade"("studentId", "publishedAt");
CREATE INDEX "GradeItem_organizationId_offeringId_idx" ON "public"."GradeItem"("organizationId", "offeringId");
CREATE INDEX "StudentGrade_studentId_idx" ON "public"."StudentGrade"("studentId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "public"."AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "public"."AuditLog"("resourceType", "resourceId");

-- Foreign keys: every academic row remains tenant-addressable, with the
-- concrete resource relations enforcing referential integrity.
ALTER TABLE "public"."Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AcademicTerm" ADD CONSTRAINT "AcademicTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Cohort" ADD CONSTRAINT "Cohort_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Cohort" ADD CONSTRAINT "Cohort_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "public"."Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CourseOffering" ADD CONSTRAINT "CourseOffering_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CourseOffering" ADD CONSTRAINT "CourseOffering_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CourseOffering" ADD CONSTRAINT "CourseOffering_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CourseOffering" ADD CONSTRAINT "CourseOffering_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CourseOfferingCohort" ADD CONSTRAINT "CourseOfferingCohort_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CourseOfferingCohort" ADD CONSTRAINT "CourseOfferingCohort_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "public"."Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "public"."Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Enrollment" ADD CONSTRAINT "Enrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Enrollment" ADD CONSTRAINT "Enrollment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."FileAsset" ADD CONSTRAINT "FileAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentCohort" ADD CONSTRAINT "AssignmentCohort_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentCohort" ADD CONSTRAINT "AssignmentCohort_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "public"."Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentAttachment" ADD CONSTRAINT "AssignmentAttachment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentAttachment" ADD CONSTRAINT "AssignmentAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentGrade" ADD CONSTRAINT "AssignmentGrade_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentGrade" ADD CONSTRAINT "AssignmentGrade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AssignmentGrade" ADD CONSTRAINT "AssignmentGrade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."GradeItem" ADD CONSTRAINT "GradeItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GradeItem" ADD CONSTRAINT "GradeItem_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."GradeItem" ADD CONSTRAINT "GradeItem_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GradeItem" ADD CONSTRAINT "GradeItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."GradeItem" ADD CONSTRAINT "GradeItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StudentGrade" ADD CONSTRAINT "StudentGrade_gradeItemId_fkey" FOREIGN KEY ("gradeItemId") REFERENCES "public"."GradeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StudentGrade" ADD CONSTRAINT "StudentGrade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StudentGrade" ADD CONSTRAINT "StudentGrade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "public"."Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "public"."TeachingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "public"."Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "public"."CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."CourseMaterial" ADD CONSTRAINT "CourseMaterial_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recoverable retirement: no active route or Prisma model can use this table.
ALTER TABLE "public"."RobotDevice" RENAME TO "_retired_RobotDevice";
