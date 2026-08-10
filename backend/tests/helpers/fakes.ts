import {
  DayOfWeek,
  NotificationStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { DeviceTokenRepository } from "../../src/repositories/device-token.repository.js";
import {
  NotificationDraft,
  NotificationListFilter,
  NotificationRepository,
  NotificationWithLecture,
} from "../../src/repositories/notification.repository.js";
import {
  ScheduleForReminders,
  ScheduleRepository,
} from "../../src/repositories/schedule.repository.js";
import { StudentRepository } from "../../src/repositories/student.repository.js";

/**
 * In-memory stand-ins for the repository layer.
 *
 * Each one extends the repository it replaces, so it is the real type as far as
 * the services are concerned and any method left un-overridden would try to
 * reach Postgres and fail — a silently wrong double is not possible here.
 *
 * The notification double reproduces the one behaviour the database is relied
 * on for: the unique key over (userId, lectureScheduleId, occurrenceStartsAt,
 * type), which is what makes generation idempotent.
 */

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

/* ------------------------------- Fixtures -------------------------------- */

export const ORG_A = "org-a";
export const ORG_B = "org-b";

export interface ScheduleOptions {
  id?: string;
  organizationId?: string;
  instructorId?: string;
  instructorActive?: boolean;
  instructorRole?: string;
  faculty?: string;
  department?: string;
  level?: number;
  semester?: number;
  section?: string;
  dayOfWeek?: DayOfWeek;
  startTime?: string;
  endTime?: string;
  room?: string;
  isActive?: boolean;
  courseName?: string;
  courseCode?: string;
}

/** "Electronics, Sunday 12:00-14:00, room B-204, section B, level 2." */
export const makeSchedule = (
  options: ScheduleOptions = {}
): ScheduleForReminders =>
  ({
    id: options.id ?? "lecture-electronics",
    organizationId: options.organizationId ?? ORG_A,
    faculty: options.faculty ?? "Faculty of Engineering",
    department: options.department ?? "Mechatronics",
    level: options.level ?? 2,
    semester: options.semester ?? 1,
    section: options.section ?? "B",
    dayOfWeek: options.dayOfWeek ?? DayOfWeek.SUNDAY,
    startTime: options.startTime ?? "12:00",
    endTime: options.endTime ?? "14:00",
    room: options.room ?? "B-204",
    isActive: options.isActive ?? true,
    course: {
      id: "course-mec201",
      courseCode: options.courseCode ?? "MEC201",
      courseName: options.courseName ?? "Electronics",
    },
    instructor: {
      id: options.instructorId ?? "instructor-1",
      fullName: "Adel Mansour",
      role: (options.instructorRole ?? "ADMIN") as never,
      isActive: options.instructorActive ?? true,
      organizationId: options.organizationId ?? ORG_A,
    },
  }) as ScheduleForReminders;

export interface StudentFixture {
  userId: string;
  organizationId: string;
  faculty: string;
  department: string;
  level: number;
  /** Free text, exactly as StudentProfile stores it. */
  semester: string;
  section: string;
}

export const makeStudent = (
  userId: string,
  overrides: Partial<StudentFixture> = {}
): StudentFixture => ({
  userId,
  organizationId: ORG_A,
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: "First Semester",
  section: "B",
  ...overrides,
});

/* ------------------------------ Repositories ------------------------------ */

export class FakeScheduleRepository extends ScheduleRepository {
  constructor(private readonly schedules: ScheduleForReminders[] = []) {
    super();
  }

  override async findActiveForReminders() {
    return this.schedules.filter((schedule) => schedule.isActive);
  }

  override async findByIdForReminders(id: string) {
    return this.schedules.find((schedule) => schedule.id === id) ?? null;
  }
}

export class FakeStudentRepository extends StudentRepository {
  constructor(private readonly students: StudentFixture[] = []) {
    super();
  }

  /** Matches on everything the real query matches on — including the tenant. */
  override async findCohort(criteria: {
    organizationId: string;
    faculty: string;
    department: string;
    level: number;
    section: string;
  }) {
    const same = (a: string, b: string) =>
      a.trim().toLowerCase() === b.trim().toLowerCase();

    return this.students
      .filter(
        (student) =>
          student.organizationId === criteria.organizationId &&
          same(student.faculty, criteria.faculty) &&
          same(student.department, criteria.department) &&
          same(student.section, criteria.section) &&
          student.level === criteria.level
      )
      .map((student) => ({
        semester: student.semester,
        user: { id: student.userId, organizationId: student.organizationId },
      }));
  }
}

interface StoredNotification {
  id: string;
  organizationId: string;
  userId: string;
  lectureScheduleId: string | null;
  occurrenceStartsAt: Date | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  scheduledFor: Date;
  sentAt: Date | null;
  readAt: Date | null;
  status: NotificationStatus;
  failureReason: string | null;
  attempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const identity = (row: {
  userId: string;
  lectureScheduleId: string | null;
  occurrenceStartsAt: Date | null;
  type: NotificationType;
}) =>
  [
    row.userId,
    row.lectureScheduleId ?? "-",
    row.occurrenceStartsAt?.toISOString() ?? "-",
    row.type,
  ].join("|");

export class FakeNotificationRepository extends NotificationRepository {
  readonly rows: StoredNotification[] = [];

  /** Lecture summaries the inbox projection joins in. */
  private lectures = new Map<string, unknown>();

  setLecture(id: string, lecture: unknown) {
    this.lectures.set(id, lecture);
  }

  private hydrate(row: StoredNotification): NotificationWithLecture {
    return {
      ...row,
      lectureSchedule: row.lectureScheduleId
        ? (this.lectures.get(row.lectureScheduleId) ?? null)
        : null,
    } as unknown as NotificationWithLecture;
  }

  /** The unique constraint, enforced exactly where the database enforces it. */
  override async createManyIgnoringDuplicates(drafts: NotificationDraft[]) {
    const seen = new Set(this.rows.map(identity));
    let created = 0;

    for (const draft of drafts) {
      const key = identity(draft);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      created += 1;

      const now = new Date();

      this.rows.push({
        id: nextId("notification"),
        ...draft,
        data: draft.data as Prisma.JsonValue,
        sentAt: null,
        readAt: null,
        status: NotificationStatus.PENDING,
        failureReason: null,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return created;
  }

  private inbox(filter: NotificationListFilter) {
    return this.rows.filter((row) => {
      if (row.userId !== filter.userId) return false;
      if (row.organizationId !== filter.organizationId) return false;

      if (filter.status) {
        if (row.status !== filter.status) return false;
      } else if (row.status === NotificationStatus.PENDING) {
        return false;
      }

      if (filter.type && row.type !== filter.type) return false;
      if (filter.unreadOnly && row.readAt !== null) return false;

      return true;
    });
  }

  override async findManyForUser(
    filter: NotificationListFilter,
    page: { page: number; limit: number }
  ) {
    const matched = this.inbox(filter).sort(
      (a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime()
    );

    const start = (page.page - 1) * page.limit;

    return {
      data: matched.slice(start, start + page.limit).map((row) => this.hydrate(row)),
      total: matched.length,
    };
  }

  override async countUnreadForUser(userId: string, organizationId: string) {
    return this.rows.filter(
      (row) =>
        row.userId === userId &&
        row.organizationId === organizationId &&
        row.readAt === null &&
        row.status !== NotificationStatus.PENDING
    ).length;
  }

  override async findByIdForUser(
    id: string,
    userId: string,
    organizationId: string
  ) {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.userId === userId &&
        candidate.organizationId === organizationId
    );

    return row ? this.hydrate(row) : null;
  }

  override async markRead(
    id: string,
    userId: string,
    organizationId: string,
    at: Date
  ) {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.userId === userId &&
        candidate.organizationId === organizationId &&
        candidate.readAt === null
    );

    if (!row) {
      return 0;
    }

    row.readAt = at;
    return 1;
  }

  override async markAllRead(userId: string, organizationId: string, at: Date) {
    const matched = this.rows.filter(
      (row) =>
        row.userId === userId &&
        row.organizationId === organizationId &&
        row.readAt === null &&
        row.status !== NotificationStatus.PENDING
    );

    matched.forEach((row) => {
      row.readAt = at;
    });

    return matched.length;
  }

  override async claimDue(options: {
    now: Date;
    token: string;
    limit: number;
    lockTimeoutMs: number;
  }) {
    const staleLock = options.now.getTime() - options.lockTimeoutMs;

    const claimable = this.rows
      .filter(
        (row) =>
          row.status === NotificationStatus.PENDING &&
          row.scheduledFor.getTime() <= options.now.getTime() &&
          (row.lockedAt === null || row.lockedAt.getTime() < staleLock)
      )
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
      .slice(0, options.limit);

    claimable.forEach((row) => {
      row.lockedAt = options.now;
      row.lockedBy = options.token;
      row.attempts += 1;
    });

    return claimable.map((row) => this.hydrate(row));
  }

  override async markSent(id: string, at: Date) {
    const row = this.rows.find((candidate) => candidate.id === id)!;

    row.status = NotificationStatus.SENT;
    row.sentAt = at;
    row.failureReason = null;
    row.lockedAt = null;
    row.lockedBy = null;

    return this.hydrate(row) as never;
  }

  override async markFailed(id: string, reason: string, giveUp: boolean) {
    const row = this.rows.find((candidate) => candidate.id === id)!;

    row.status = giveUp
      ? NotificationStatus.FAILED
      : NotificationStatus.PENDING;
    row.failureReason = reason;
    row.lockedAt = null;
    row.lockedBy = null;

    return this.hydrate(row) as never;
  }

  override async cancelOverdue(before: Date) {
    const matched = this.rows.filter(
      (row) =>
        row.status === NotificationStatus.PENDING &&
        row.scheduledFor.getTime() < before.getTime()
    );

    matched.forEach((row) => {
      row.status = NotificationStatus.CANCELLED;
      row.failureReason = "Missed its delivery window";
    });

    return matched.length;
  }

  override async cancelPendingForSchedule(
    lectureScheduleId: string,
    reason: string
  ) {
    const matched = this.rows.filter(
      (row) =>
        row.lectureScheduleId === lectureScheduleId &&
        row.status === NotificationStatus.PENDING
    );

    matched.forEach((row) => {
      row.status = NotificationStatus.CANCELLED;
      row.failureReason = reason;
    });

    return matched.length;
  }

  override async deleteUnsentForSchedule(lectureScheduleId: string) {
    const doomed = this.rows.filter(
      (row) =>
        row.lectureScheduleId === lectureScheduleId &&
        row.sentAt === null &&
        (row.status === NotificationStatus.PENDING ||
          row.status === NotificationStatus.CANCELLED)
    );

    doomed.forEach((row) => {
      this.rows.splice(this.rows.indexOf(row), 1);
    });

    return doomed.length;
  }

  override async releaseForDelivery(
    target: {
      lectureScheduleId: string;
      occurrenceStartsAt: Date;
      types: NotificationType[];
    },
    at: Date
  ) {
    const matched = this.rows.filter(
      (row) =>
        row.lectureScheduleId === target.lectureScheduleId &&
        row.occurrenceStartsAt?.getTime() ===
          target.occurrenceStartsAt.getTime() &&
        target.types.includes(row.type) &&
        row.status === NotificationStatus.PENDING &&
        row.scheduledFor.getTime() > at.getTime()
    );

    matched.forEach((row) => {
      row.scheduledFor = at;
    });

    return matched.length;
  }

  override async countPendingBefore(at: Date) {
    return this.rows.filter(
      (row) =>
        row.status === NotificationStatus.PENDING &&
        row.scheduledFor.getTime() <= at.getTime()
    ).length;
  }
}

export class FakeDeviceTokenRepository extends DeviceTokenRepository {
  override async findActiveForUser() {
    return [];
  }
}
