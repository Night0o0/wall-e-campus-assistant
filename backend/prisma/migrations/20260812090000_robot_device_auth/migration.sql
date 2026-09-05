-- Phase 0 — robot/tablet device authentication.
--
-- Strictly additive: one new enum, one new table, three foreign keys pointing
-- OUT of it. No existing table is altered, no column is dropped or narrowed,
-- and no row is written, updated or deleted. Rolling this migration out cannot
-- affect any data that already exists.
--
-- The two relations declared on User and Organization in schema.prisma are
-- back-relations, which Prisma resolves virtually — neither table gains a
-- column here, which is why neither appears below.

-- CreateEnum
CREATE TYPE "public"."DeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "public"."RobotDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "deviceKeyId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "public"."DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "canOpenSessions" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RobotDevice_deviceKeyId_key" ON "public"."RobotDevice"("deviceKeyId");

-- CreateIndex
CREATE INDEX "RobotDevice_organizationId_status_idx" ON "public"."RobotDevice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RobotDevice_createdById_idx" ON "public"."RobotDevice"("createdById");

-- CreateIndex
CREATE INDEX "RobotDevice_revokedById_idx" ON "public"."RobotDevice"("revokedById");

-- AddForeignKey
ALTER TABLE "public"."RobotDevice" ADD CONSTRAINT "RobotDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RobotDevice" ADD CONSTRAINT "RobotDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RobotDevice" ADD CONSTRAINT "RobotDevice_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
