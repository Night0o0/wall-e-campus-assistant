import {
  DayOfWeek,
  SessionCloseReason,
  SessionStatus,
} from "@prisma/client";
import { SessionRepository } from "../../src/repositories/session.repository.js";

export const ORG_A = "org-a";
export const ORG_B = "org-b";

let sequence = 0;

export interface FakeSessionRow {
  id: string;
  organizationId: string;
  title?: string;
  status?: "ACTIVE" | "CLOSED";
  qrSecret?: string;
  courseId?: string | null;
  /** Who opened it. The instructor-narrowing rule turns on this. */
  createdById?: string;
  /** Null means "unlocated" for an ad-hoc session. */
  room?: string | null;
  lectureScheduleId?: string | null;
  startTime?: Date;
}

/** What the repository's schedule summary projects, for a linked session. */
const summaryFor = (lectureScheduleId: string | null) =>
  lectureScheduleId
    ? {
        id: lectureScheduleId,
        room: "B-204",
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: "10:00",
        endTime: "12:00",
        isActive: true,
        course: {
          id: "course-1",
          courseCode: "MEC201",
          courseName: "Electronics",
        },
        instructor: { id: "instructor-1", fullName: "Dr. Adel Mansour" },
      }
    : null;

/** What the repository's course summary projects. */
const courseFor = (courseId: string | null) =>
  courseId
    ? { id: courseId, courseCode: "MEC201", courseName: "Electronics" }
    : null;

export class FakeSessionRepository extends SessionRepository {
  readonly rows: Required<FakeSessionRow>[];
  /** Everything `create` was asked to write, for the linking tests. */
  readonly created: Parameters<SessionRepository["create"]>[0][] = [];

  constructor(seed: FakeSessionRow[] = []) {
    super();

    this.rows = seed.map((row) => ({
      title: "Electronics",
      status: "ACTIVE" as const,
      qrSecret: `secret-${row.id}`,
      courseId: null,
      createdById: "instructor-1",
      room: null,
      lectureScheduleId: null,
      startTime: new Date(),
      ...row,
    }));
  }

  override async findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      createdById: row.createdById,
      courseId: row.courseId,
      organizationId: row.organizationId,
      lectureScheduleId: row.lectureScheduleId,
      room: row.room,
      qrSecret: row.qrSecret,
      status: row.status as SessionStatus,
      startTime: row.startTime,
      endTime: null,
      closeReason: null,
      absencesSweptAt: null,
      createdAt: row.startTime,
      createdBy: {
        id: row.createdById,
        fullName: "Dr. Adel Mansour",
        email: "adel.mansour@cu.edu.eg",
      },
      course: courseFor(row.courseId),
      lectureSchedule: summaryFor(row.lectureScheduleId),
    };
  }

  override async findByCreator(
    createdById: string,
    organizationId: string,
    page = { skip: 0, take: 25 }
  ) {
    const matched = this.rows.filter(
      (row) =>
        row.createdById === createdById && row.organizationId === organizationId
    );

    return this.pageOf(matched, page) as never;
  }

  override async findByOrganization(
    organizationId: string,
    page = { skip: 0, take: 25 }
  ) {
    const matched = this.rows.filter(
      (row) => row.organizationId === organizationId
    );

    return this.pageOf(matched, page) as never;
  }

  private pageOf<T>(rows: T[], page: { skip: number; take: number }) {
    return {
      data: rows.slice(page.skip, page.skip + page.take),
      total: rows.length,
    };
  }

  override async updateStatus(
    id: string,
    status: "ACTIVE" | "CLOSED",
    endTime?: Date,
    closeReason?: SessionCloseReason
  ) {
    const row = this.rows.find((candidate) => candidate.id === id);

    if (!row) {
      throw new Error(`updateStatus called for unknown session ${id}`);
    }

    row.status = status;

    const stored = await this.findById(id);

    return {
      ...stored!,
      status: status as SessionStatus,
      endTime: endTime ?? null,
      closeReason: closeReason ?? null,
    };
  }

  override async findOpenedForScheduleBetween(
    lectureScheduleId: string,
    organizationId: string,
    from: Date,
    to: Date
  ) {
    return this.rows
      .filter(
        (row) =>
          row.lectureScheduleId === lectureScheduleId &&
          row.organizationId === organizationId &&
          row.startTime >= from &&
          row.startTime < to
      )
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status as SessionStatus,
        startTime: row.startTime,
      }));
  }

  override async create(data: Parameters<SessionRepository["create"]>[0]) {
    this.created.push(data);

    const at = new Date();
    const id = `session-${(sequence += 1)}`;

    this.rows.push({
      id,
      organizationId: data.organizationId,
      title: data.title,
      status: "ACTIVE",
      qrSecret: `secret-${id}`,
      courseId: data.courseId ?? null,
      createdById: data.createdById,
      room: data.room ?? null,
      lectureScheduleId: data.lectureScheduleId ?? null,
      startTime: at,
    });

    return {
      id,
      title: data.title,
      createdById: data.createdById,
      organizationId: data.organizationId,
      courseId: data.courseId ?? null,
      course: courseFor(data.courseId ?? null),
      lectureScheduleId: data.lectureScheduleId ?? null,
      lectureSchedule: summaryFor(data.lectureScheduleId ?? null),
      room: data.room ?? null,
      qrSecret: "secret",
      status: SessionStatus.ACTIVE,
      startTime: at,
      endTime: null,
      closeReason: null,
      absencesSweptAt: null,
      createdAt: at,
    };
  }
}
