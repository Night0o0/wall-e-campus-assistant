-- Phase 2 — the Session ↔ LectureSchedule relationship, and the room a session
-- was actually held in.
--
-- Strictly additive. Two nullable columns, two indexes, one foreign key
-- pointing OUT of Session. No column is dropped or narrowed, no default is
-- added to an existing column, and no row is written, updated or deleted.
--
-- Adding a nullable column with no default is a catalogue-only change in
-- PostgreSQL: the table is not rewritten and the ACCESS EXCLUSIVE lock is held
-- for the duration of a metadata update rather than a scan. Safe on a live
-- Session table of any size.
--
-- Every session that already exists gets lectureScheduleId = NULL and
-- room = NULL — "unlocated". That is a real state, not a migration artefact:
-- a session may legitimately be opened ad hoc with no timetable entry behind
-- it. Nothing downstream may assume either column is set. See the device
-- room-filter note in DeviceService.listActiveSessions for how unlocated
-- sessions are treated by a room-bound robot.

-- AlterTable
ALTER TABLE "public"."Session" ADD COLUMN     "lectureScheduleId" TEXT,
ADD COLUMN     "room" TEXT;

-- CreateIndex
CREATE INDEX "Session_lectureScheduleId_idx" ON "public"."Session"("lectureScheduleId");

-- CreateIndex
-- The robot's poll: the open sessions of one university.
CREATE INDEX "Session_organizationId_status_idx" ON "public"."Session"("organizationId", "status");

-- AddForeignKey
-- SET NULL, not CASCADE. A LectureSchedule is soft-deleted (isActive = false)
-- and never removed, but if one ever were, cascading into Session would delete
-- historical attendance records along with it. The session survives, unlinked.
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_lectureScheduleId_fkey" FOREIGN KEY ("lectureScheduleId") REFERENCES "public"."LectureSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
