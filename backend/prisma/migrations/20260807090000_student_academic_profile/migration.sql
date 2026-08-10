-- CreateEnum
CREATE TYPE "public"."ProfileStatus" AS ENUM ('INCOMPLETE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."ProfileDataSource" AS ENUM ('SELF_REPORTED', 'UNIVERSITY_SYNC');

-- AlterTable
-- The profile row is now created empty at registration, so every academic
-- column becomes nullable. Dropping NOT NULL never loses data.
--
-- "updatedAt" is added WITH a default and the default dropped immediately
-- after, so existing rows get a value. Prisma's generated form has no default
-- and would fail on a non-empty table; the resulting column is identical.
ALTER TABLE "public"."StudentProfile" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dataSource" "public"."ProfileDataSource" NOT NULL DEFAULT 'SELF_REPORTED',
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "externalStudentId" TEXT,
ADD COLUMN     "faculty" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "semester" TEXT,
ADD COLUMN     "status" "public"."ProfileStatus" NOT NULL DEFAULT 'INCOMPLETE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "department" DROP NOT NULL,
ALTER COLUMN "level" DROP NOT NULL,
ALTER COLUMN "section" DROP NOT NULL,
ALTER COLUMN "groupName" DROP NOT NULL,
ALTER COLUMN "academicYear" DROP NOT NULL;

ALTER TABLE "public"."StudentProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Pre-existing profiles stay INCOMPLETE: none of them carry a faculty,
-- semester, phone number, national ID or date of birth yet.

-- CreateIndex
CREATE INDEX "StudentProfile_status_idx" ON "public"."StudentProfile"("status");

-- CreateIndex
CREATE INDEX "StudentProfile_nationalId_idx" ON "public"."StudentProfile"("nationalId");

-- CreateIndex
CREATE INDEX "StudentProfile_externalStudentId_idx" ON "public"."StudentProfile"("externalStudentId");
