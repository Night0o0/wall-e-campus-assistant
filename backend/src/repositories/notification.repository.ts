import {
  NotificationStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import { toSkipTake } from "../utils/pagination.js";

/**
 * A notification is unreadable without the lecture behind it, so the course and
 * the room travel with it. The stored title/body already say everything a
 * client must show; this is for a client that wants to link back to the
 * timetable entry.
 */
const withLecture = {
  lectureSchedule: {
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      room: true,
      isActive: true,
      course: { select: { id: true, courseCode: true, courseName: true } },
      instructor: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.NotificationInclude;

export type NotificationWithLecture = Prisma.NotificationGetPayload<{
  include: typeof withLecture;
}>;

/** Everything the generator needs to write one reminder. */
export interface NotificationDraft {
  organizationId: string;
  userId: string;
  lectureScheduleId: string;
  occurrenceStartsAt: Date;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.InputJsonValue;
  scheduledFor: Date;
}

/**
 * An event notification — account decision, material publication, schedule
 * change. Unlike a reminder it hangs off no lecture and no occurrence; its
 * idempotency is the per-recipient `eventKey`. Written PENDING and due now, so
 * the same delivery worker that sends reminders also pushes these — the row is
 * the source of truth and push is the extra channel over it.
 */
export interface EventNotificationDraft {
  organizationId: string;
  userId: string;
  eventKey: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.InputJsonValue;
}

export interface NotificationListFilter {
  userId: string;
  organizationId: string;
  status?: NotificationStatus;
  type?: NotificationType;
  unreadOnly?: boolean;
}

export class NotificationRepository {
  /**
   * Idempotent insert. `skipDuplicates` leans on the unique constraint over
   * (userId, lectureScheduleId, occurrenceStartsAt, type), so re-running the
   * generator over a window it has already covered is a no-op in the database
   * rather than a race between a read and a write in the application.
   */
  async createManyIgnoringDuplicates(drafts: NotificationDraft[]) {
    if (drafts.length === 0) {
      return 0;
    }

    const { count } = await prisma.notification.createMany({
      data: drafts,
      skipDuplicates: true,
    });

    return count;
  }

  /**
   * Idempotent insert of event notifications. `skipDuplicates` leans on the
   * unique index over `eventKey`, so a retry or a repeated request (the same
   * material published twice, an approval re-issued) is a no-op in the database
   * rather than a duplicate in someone's inbox. Written PENDING and due now.
   */
  async createEventNotifications(drafts: EventNotificationDraft[]) {
    if (drafts.length === 0) {
      return 0;
    }

    const now = new Date();

    const { count } = await prisma.notification.createMany({
      data: drafts.map((draft) => ({
        organizationId: draft.organizationId,
        userId: draft.userId,
        eventKey: draft.eventKey,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        data: draft.data,
        // No lecture, no occurrence: event notifications are addressed by
        // eventKey, and deliberately do not touch lectureScheduleId so the
        // schedule-reminder sweeps (delete/cancel by schedule) never disturb
        // them.
        scheduledFor: now,
        status: NotificationStatus.PENDING,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  /* ------------------------------- Inbox ---------------------------------- */

  private inboxWhere(filter: NotificationListFilter): Prisma.NotificationWhereInput {
    return {
      // Both, always. The organization is redundant while a user belongs to one
      // organization, and is the thing that keeps being true if that changes.
      userId: filter.userId,
      organizationId: filter.organizationId,
      // A reminder that has not gone out yet is not in anybody's inbox, unless
      // the caller asked for that status specifically.
      status: filter.status ?? { not: NotificationStatus.PENDING },
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.unreadOnly ? { readAt: null } : {}),
    };
  }

  async findManyForUser(
    filter: NotificationListFilter,
    page: { page: number; limit: number }
  ) {
    const where = this.inboxWhere(filter);

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        ...toSkipTake(page),
        orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
        include: withLecture,
      }),
      prisma.notification.count({ where }),
    ]);

    return { data, total };
  }

  async countUnreadForUser(userId: string, organizationId: string) {
    return prisma.notification.count({
      where: {
        userId,
        organizationId,
        readAt: null,
        status: { not: NotificationStatus.PENDING },
      },
    });
  }

  async findByIdForUser(id: string, userId: string, organizationId: string) {
    // The ownership keys are part of the query, not checked after the fact, so
    // there is no window in which another user's row has been loaded.
    return prisma.notification.findFirst({
      where: { id, userId, organizationId },
      include: withLecture,
    });
  }

  async markRead(id: string, userId: string, organizationId: string, at: Date) {
    const { count } = await prisma.notification.updateMany({
      where: { id, userId, organizationId, readAt: null },
      data: { readAt: at },
    });

    return count;
  }

  async markAllRead(userId: string, organizationId: string, at: Date) {
    const { count } = await prisma.notification.updateMany({
      where: {
        userId,
        organizationId,
        readAt: null,
        status: { not: NotificationStatus.PENDING },
      },
      data: { readAt: at },
    });

    return count;
  }

  /* ------------------------------ Delivery -------------------------------- */

  /**
   * Takes ownership of up to `limit` due reminders and hands back exactly the
   * rows this call won.
   *
   * Claiming is two statements rather than one because Prisma cannot return the
   * rows an updateMany touched. The claim itself is still atomic: the UPDATE
   * re-tests the lock inside the same statement, so of two workers that read
   * the same candidate ids, only the first can write a lock, and each then
   * reads back the rows carrying its own token.
   */
  async claimDue(options: {
    now: Date;
    token: string;
    limit: number;
    lockTimeoutMs: number;
  }): Promise<NotificationWithLecture[]> {
    const { now, token, limit, lockTimeoutMs } = options;
    const staleLock = new Date(now.getTime() - lockTimeoutMs);

    const claimable: Prisma.NotificationWhereInput = {
      status: NotificationStatus.PENDING,
      scheduledFor: { lte: now },
      // Unlocked, or locked by a worker that has since died.
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }],
    };

    const candidates = await prisma.notification.findMany({
      where: claimable,
      select: { id: true },
      orderBy: { scheduledFor: "asc" },
      take: limit,
    });

    if (candidates.length === 0) {
      return [];
    }

    await prisma.notification.updateMany({
      where: { id: { in: candidates.map((row) => row.id) }, ...claimable },
      data: { lockedAt: now, lockedBy: token, attempts: { increment: 1 } },
    });

    return prisma.notification.findMany({
      where: { lockedBy: token, status: NotificationStatus.PENDING },
      include: withLecture,
    });
  }

  async markSent(id: string, at: Date) {
    return prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: at,
        failureReason: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * A reminder goes back to PENDING until it has used up its attempts, so a
   * provider that is briefly unreachable does not cost anyone their lecture.
   */
  async markFailed(id: string, reason: string, giveUp: boolean) {
    return prisma.notification.update({
      where: { id },
      data: {
        status: giveUp ? NotificationStatus.FAILED : NotificationStatus.PENDING,
        failureReason: reason.slice(0, 500),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Reminders whose moment has passed while nothing was delivering them. Sent
   * late, "starts in 10 minutes" is worse than useless, so they are cancelled.
   */
  async cancelOverdue(before: Date) {
    const { count } = await prisma.notification.updateMany({
      where: { status: NotificationStatus.PENDING, scheduledFor: { lt: before } },
      data: {
        status: NotificationStatus.CANCELLED,
        failureReason: "Missed its delivery window",
        lockedAt: null,
        lockedBy: null,
      },
    });

    return count;
  }

  /**
   * Removes reminders for a lecture that were never delivered, so the generator
   * can rebuild them from the lecture's new details.
   *
   * Deleted rather than cancelled, and this is the reason: the idempotency key
   * is (user, lecture, occurrence, type), so a cancelled row would keep
   * occupying the key and block the corrected reminder from ever being written.
   * A row nobody has received is not history — only sending makes it history,
   * which is why anything with a sentAt is left alone.
   */
  async deleteUnsentForSchedule(lectureScheduleId: string) {
    const { count } = await prisma.notification.deleteMany({
      where: {
        lectureScheduleId,
        sentAt: null,
        status: {
          in: [NotificationStatus.PENDING, NotificationStatus.CANCELLED],
        },
      },
    });

    return count;
  }

  /** Used when a lecture is deactivated or moved: its unsent reminders die with it. */
  async cancelPendingForSchedule(lectureScheduleId: string, reason: string) {
    const { count } = await prisma.notification.updateMany({
      where: { lectureScheduleId, status: NotificationStatus.PENDING },
      data: {
        status: NotificationStatus.CANCELLED,
        failureReason: reason,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return count;
  }

  /**
   * Brings pending reminders for one lecture occurrence forward so they are due
   * now. Development only — it is how a 24-hour reminder is tested without
   * waiting a day. It changes when a reminder is sent, never who gets it or
   * what it says.
   */
  async releaseForDelivery(
    target: {
      lectureScheduleId: string;
      occurrenceStartsAt: Date;
      types: NotificationType[];
    },
    at: Date
  ) {
    const { count } = await prisma.notification.updateMany({
      where: {
        lectureScheduleId: target.lectureScheduleId,
        occurrenceStartsAt: target.occurrenceStartsAt,
        type: { in: target.types },
        status: NotificationStatus.PENDING,
        scheduledFor: { gt: at },
      },
      data: { scheduledFor: at },
    });

    return count;
  }

  async countPendingBefore(at: Date) {
    return prisma.notification.count({
      where: { status: NotificationStatus.PENDING, scheduledFor: { lte: at } },
    });
  }
}
