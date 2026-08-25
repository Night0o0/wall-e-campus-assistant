-- Phase 4 — student email verification, password reset, and account notices.
--
-- NOT APPLIED. Written, reviewed and committed ahead of being run, like the
-- four migrations before it. Applying it is a separate, explicit decision.
--
-- Strictly additive. One new enum type, two new values on an existing enum, one
-- new table and two indexes. Nothing is dropped, nothing is narrowed, no
-- existing value is rewritten, and no row is inserted, updated or deleted.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. NotificationType gains ACCOUNT_APPROVED and ACCOUNT_REJECTED
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Adding a value to a PostgreSQL enum is safe for existing rows: no row holds
-- the new labels, every existing label keeps its position, and no index or
-- constraint is rebuilt.
--
-- One PostgreSQL rule governs the shape of this section. `ALTER TYPE … ADD
-- VALUE` may run inside a transaction on PostgreSQL 12 and later, but the value
-- it adds cannot be *used* in that same transaction. Prisma runs each migration
-- in one transaction, so this file adds the labels and stops — nothing here
-- writes a Notification row. The first row carrying ACCOUNT_APPROVED is written
-- by the application, in a later transaction, which is always allowed.
--
-- Supabase runs PostgreSQL 15, so the in-transaction form is correct here. On
-- PostgreSQL 11 or older these two statements would have to be run outside a
-- transaction instead.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EmailChallenge
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A new table with no dependants and no foreign keys, so it cannot affect any
-- existing query, and no existing table gains a column.
--
-- Deliberately NOT keyed to User. At registration the address is proven before
-- the account exists, so there is nothing to reference — and that ordering is
-- the point: an abandoned signup must leave no User row behind holding the
-- unique claim on an email address or a university ID that somebody else may
-- legitimately need. Password reset reads the address, then looks the user up.
--
-- "codeHash" is bcrypt over the one-time code, never the code itself. Six
-- digits is a million possibilities, which a fast digest surrenders instantly
-- to anyone holding a copy of this table; bcrypt at the project's work factor
-- does not. The same reasoning as RobotDevice.secretHash.
--
-- No unique constraint on (email, purpose). More than one row per address is
-- normal and wanted: superseded codes stay as rows, because they are what the
-- per-hour issue ceiling counts and what makes a replay attempt visible after
-- the fact rather than merely impossible. Uniqueness is enforced in behaviour —
-- issuing a code consumes the previous live one — not in the schema.

-- CreateEnum
CREATE TYPE "public"."EmailChallengePurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'ACCOUNT_APPROVED';

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'ACCOUNT_REJECTED';

-- CreateTable
CREATE TABLE "public"."EmailChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "public"."EmailChallengePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Serves both hot reads: the newest live code for an address and purpose, and
-- the count of codes issued to that address in the last hour.
CREATE INDEX "EmailChallenge_email_purpose_createdAt_idx" ON "public"."EmailChallenge"("email", "purpose", "createdAt");

-- CreateIndex
-- The pruning sweep.
CREATE INDEX "EmailChallenge_expiresAt_idx" ON "public"."EmailChallenge"("expiresAt");
