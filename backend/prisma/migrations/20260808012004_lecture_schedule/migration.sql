-- CreateEnum
CREATE TYPE "public"."DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable
CREATE TABLE "public"."LectureSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "dayOfWeek" "public"."DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LectureSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LectureSchedule_organizationId_idx" ON "public"."LectureSchedule"("organizationId");

-- CreateIndex
CREATE INDEX "LectureSchedule_courseId_idx" ON "public"."LectureSchedule"("courseId");

-- CreateIndex
CREATE INDEX "LectureSchedule_instructorId_idx" ON "public"."LectureSchedule"("instructorId");

-- CreateIndex
CREATE INDEX "LectureSchedule_department_idx" ON "public"."LectureSchedule"("department");

-- CreateIndex
CREATE INDEX "LectureSchedule_level_idx" ON "public"."LectureSchedule"("level");

-- CreateIndex
CREATE INDEX "LectureSchedule_semester_idx" ON "public"."LectureSchedule"("semester");

-- CreateIndex
CREATE INDEX "LectureSchedule_section_idx" ON "public"."LectureSchedule"("section");

-- CreateIndex
CREATE INDEX "LectureSchedule_dayOfWeek_idx" ON "public"."LectureSchedule"("dayOfWeek");

-- CreateIndex
CREATE INDEX "LectureSchedule_isActive_idx" ON "public"."LectureSchedule"("isActive");

-- CreateIndex
CREATE INDEX "LectureSchedule_organizationId_isActive_faculty_department__idx" ON "public"."LectureSchedule"("organizationId", "isActive", "faculty", "department", "level", "semester", "section");

-- CreateIndex
CREATE INDEX "LectureSchedule_organizationId_instructorId_dayOfWeek_isAct_idx" ON "public"."LectureSchedule"("organizationId", "instructorId", "dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "LectureSchedule_organizationId_room_dayOfWeek_isActive_idx" ON "public"."LectureSchedule"("organizationId", "room", "dayOfWeek", "isActive");

-- AddForeignKey
ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LectureSchedule" ADD CONSTRAINT "LectureSchedule_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
