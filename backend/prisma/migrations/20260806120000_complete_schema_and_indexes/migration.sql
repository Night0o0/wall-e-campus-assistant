-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('ACTIVE', 'CLOSED');
-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT');
-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
-- CreateEnum
CREATE TYPE "public"."BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');
-- AlterEnum
BEGIN;
CREATE TYPE "public"."UserRole_new" AS ENUM ('SYSTEM_OWNER', 'UNIVERSITY_SUPER_ADMIN', 'ADMIN', 'STUDENT');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."User" ALTER COLUMN "role" TYPE "public"."UserRole_new" USING ("role"::text::"public"."UserRole_new");
ALTER TYPE "public"."UserRole" RENAME TO "UserRole_old";
ALTER TYPE "public"."UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "public"."User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
COMMIT;
-- DropForeignKey
ALTER TABLE "public"."AdminProfile" DROP CONSTRAINT "AdminProfile_userId_fkey";
-- DropForeignKey
ALTER TABLE "public"."StudentProfile" DROP CONSTRAINT "StudentProfile_userId_fkey";
-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "address" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
-- AlterTable
ALTER TABLE "public"."StudentProfile" ADD COLUMN     "department" TEXT NOT NULL;
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
-- CreateTable
CREATE TABLE "public"."SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "yearlyPrice" DECIMAL(10,2) NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxRobots" INTEGER NOT NULL,
    "maxCourses" INTEGER NOT NULL,
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "billingCycle" "public"."BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "description" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Course" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "description" TEXT,
    "semester" TEXT NOT NULL,
    "department" TEXT,
    "credits" INTEGER,
    "createdById" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "courseId" TEXT,
    "organizationId" TEXT NOT NULL,
    "qrSecret" TEXT NOT NULL,
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Attendance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "scanTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "public"."SubscriptionPlan"("name");
-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "public"."Subscription"("planId");
-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "public"."Subscription"("status");
-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "public"."Payment"("transactionId");
-- CreateIndex
CREATE INDEX "Payment_organizationId_idx" ON "public"."Payment"("organizationId");
-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "public"."Payment"("status");
-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "public"."Payment"("paidAt");
-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "public"."Payment"("invoiceId");
-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "public"."Invoice"("invoiceNumber");
-- CreateIndex
CREATE INDEX "Invoice_organizationId_idx" ON "public"."Invoice"("organizationId");
-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "public"."Invoice"("status");
-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "public"."Invoice"("dueDate");
-- CreateIndex
CREATE INDEX "Course_organizationId_idx" ON "public"."Course"("organizationId");
-- CreateIndex
CREATE INDEX "Course_createdById_idx" ON "public"."Course"("createdById");
-- CreateIndex
CREATE UNIQUE INDEX "Course_courseCode_organizationId_key" ON "public"."Course"("courseCode", "organizationId");
-- CreateIndex
CREATE INDEX "Session_organizationId_idx" ON "public"."Session"("organizationId");
-- CreateIndex
CREATE INDEX "Session_createdById_idx" ON "public"."Session"("createdById");
-- CreateIndex
CREATE INDEX "Session_courseId_idx" ON "public"."Session"("courseId");
-- CreateIndex
CREATE INDEX "Session_status_idx" ON "public"."Session"("status");
-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "public"."Session"("createdAt");
-- CreateIndex
CREATE INDEX "Attendance_sessionId_idx" ON "public"."Attendance"("sessionId");
-- CreateIndex
CREATE INDEX "Attendance_studentId_idx" ON "public"."Attendance"("studentId");
-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_sessionId_key" ON "public"."Attendance"("studentId", "sessionId");
-- CreateIndex
CREATE UNIQUE INDEX "Organization_subscriptionId_key" ON "public"."Organization"("subscriptionId");
-- CreateIndex
CREATE INDEX "Organization_createdAt_idx" ON "public"."Organization"("createdAt");
-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "public"."User"("organizationId");
-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");
-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");
-- AddForeignKey
ALTER TABLE "public"."Organization" ADD CONSTRAINT "Organization_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."AdminProfile" ADD CONSTRAINT "AdminProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Course" ADD CONSTRAINT "Course_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
