-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('LECTURE_ADMIN_24H', 'LECTURE_ADMIN_30M', 'LECTURE_STUDENT_10M');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lectureScheduleId" TEXT,
    "occurrenceStartsAt" TIMESTAMP(3),
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "public"."DevicePlatform" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_status_scheduledFor_idx" ON "public"."Notification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "public"."Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "public"."Notification"("organizationId");

-- CreateIndex
CREATE INDEX "Notification_lectureScheduleId_idx" ON "public"."Notification"("lectureScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_lectureScheduleId_occurrenceStartsAt_ty_key" ON "public"."Notification"("userId", "lectureScheduleId", "occurrenceStartsAt", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "public"."DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_isActive_idx" ON "public"."DeviceToken"("userId", "isActive");

-- CreateIndex
CREATE INDEX "DeviceToken_organizationId_idx" ON "public"."DeviceToken"("organizationId");

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_lectureScheduleId_fkey" FOREIGN KEY ("lectureScheduleId") REFERENCES "public"."LectureSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceToken" ADD CONSTRAINT "DeviceToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
