import {
  AttendanceStatus,
  DayOfWeek,
  ProfileStatus,
  SessionStatus,
} from "@prisma/client";
import { AttendanceRepository } from "../../src/repositories/attendance.repository.js";
import { SessionRepository } from "../../src/repositories/session.repository.js";
import { StudentRepository } from "../../src/repositories/student.repository.js";
import { ORG_A } from "./device-fakes.js";

/**
 * Doubles for the scan path.
 *
 * Both return the real payload shapes field for field, with no cast, so a
 * change to either repository's projection fails the override rather than
 * passing silently.
 */

export interface ScanSessionSeed {
  id?: string;
  organizationId?: string;
  status?: SessionStatus;
  qrSecret?: string;
  /** When attendance opened. The window is measured from here. */
  startTime?: Date;
  /** Null models an ad-hoc session, which falls back to the default length. */
  lectureSchedule?: { startTime: string; endTime: string } | null;
  /**
   * The lecture's academic address — who it is addressed to. Overridden by the
   * cohort tests; defaults to the same cohort DEFAULT_PROFILE is in.
   */
  cohort?: Partial<ScanCohort>;
  /** Models a lecture whose organization has drifted from its session's. */
  scheduleOrganizationId?: string;
}

/** The academic address, on both sides of the cohort comparison. */
export interface ScanCohort {
  faculty: string;
  department: string;
  level: number;
  semester: number;
  section: string;
}

export const DEFAULT_COHORT: ScanCohort = {
  faculty: "Engineering",
  department: "Mechatronics",
  level: 2,
  semester: 1,
  section: "A",
};

export const SCAN_NOW = new Date("2026-08-13T11:00:00.000Z");

/** The lecture behind a seeded session runs two hours, like the demo timetable. */
const DEFAULT_LECTURE = { startTime: "10:00", endTime: "12:00" };

export const makeScanSession = (seed: ScanSessionSeed = {}) => {
  const lecture =
    seed.lectureSchedule === undefined ? DEFAULT_LECTURE : seed.lectureSchedule;

  return {
    id: seed.id ?? "session-1",
    title: "Electronics",
    createdById: "instructor-1",
    courseId: lecture ? "course-1" : null,
    course: lecture
      ? { id: "course-1", courseCode: "MEC201", courseName: "Electronics" }
      : null,
    organizationId: seed.organizationId ?? ORG_A,
    lectureScheduleId: lecture ? "schedule-1" : null,
    room: "B-204",
    qrSecret: seed.qrSecret ?? "qr-secret-for-session-1",
    status: seed.status ?? SessionStatus.ACTIVE,
    // Default: opened thirty minutes before SCAN_NOW, so the seeded session is
    // squarely inside its two-hour window.
    startTime: seed.startTime ?? new Date(SCAN_NOW.getTime() - 30 * 60_000),
    endTime: null,
    closeReason: null,
    absencesSweptAt: null,
    createdAt: new Date("2026-08-13T10:00:00.000Z"),
    createdBy: {
      id: "instructor-1",
      fullName: "Dr. Adel Mansour",
      email: "adel.mansour@cu.edu.eg",
    },
    lectureSchedule: lecture
      ? {
          id: "schedule-1",
          room: "B-204",
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: lecture.startTime,
          endTime: lecture.endTime,
          isActive: true,
          course: {
            id: "course-1",
            courseCode: "MEC201",
            courseName: "Electronics",
          },
          instructor: { id: "instructor-1", fullName: "Dr. Adel Mansour" },
        }
      : null,
  };
};

export type ScanSession = ReturnType<typeof makeScanSession>;

/**
 * What `findForScan` projects, built from the same seed.
 *
 * Returned field for field with no cast, so a change to the repository's scan
 * projection fails the override here rather than passing silently — the same
 * contract every other double in this suite is written to.
 */
export const makeScanProjection = (seed: ScanSessionSeed = {}) => {
  const session = makeScanSession(seed);
  const cohort = { ...DEFAULT_COHORT, ...seed.cohort };

  return {
    id: session.id,
    title: session.title,
    organizationId: session.organizationId,
    room: session.room,
    qrSecret: session.qrSecret,
    status: session.status,
    startTime: session.startTime,
    courseId: session.courseId,
    course: session.courseId
      ? { id: session.courseId, courseCode: "MEC201", courseName: "Electronics" }
      : null,
    lectureScheduleId: session.lectureScheduleId,
    lectureSchedule: session.lectureSchedule
      ? {
          id: session.lectureSchedule.id,
          organizationId:
            seed.scheduleOrganizationId ?? session.organizationId,
          faculty: cohort.faculty,
          department: cohort.department,
          level: cohort.level,
          semester: cohort.semester,
          section: cohort.section,
          startTime: session.lectureSchedule.startTime,
          endTime: session.lectureSchedule.endTime,
          instructor: { id: "instructor-1", fullName: "Dr. Adel Mansour" },
        }
      : null,
  };
};

export type ScanProjection = ReturnType<typeof makeScanProjection>;

export class ScanSessionRepository extends SessionRepository {
  readonly rows = new Map<string, ScanSession>();
  readonly scanRows = new Map<string, ScanProjection>();

  constructor(seed: ScanSession[] = [], projections: ScanProjection[] = []) {
    super();

    for (const row of seed) {
      this.rows.set(row.id, row);
    }

    for (const row of projections) {
      this.scanRows.set(row.id, row);
    }
  }

  override async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  override async findForScan(id: string) {
    return this.scanRows.get(id) ?? null;
  }
}

/**
 * A StudentProfile lookup for the cohort check.
 *
 * Deliberately returns the profile's raw stored shape — `semester` as the free
 * text a student typed, not a number — because turning that text into 1 or 2 is
 * `resolveCohort`'s job and a fake that pre-resolved it would hide a service
 * that had skipped the step.
 */
export interface ScanProfileSeed {
  faculty?: string | null;
  department?: string | null;
  level?: number | null;
  semester?: string | null;
  section?: string | null;
}

export const DEFAULT_PROFILE: ScanProfileSeed = {
  faculty: "Engineering",
  department: "Mechatronics",
  level: 2,
  semester: "First Semester",
  section: "A",
};

export class ScanStudentRepository extends StudentRepository {
  constructor(private readonly profile: ScanProfileSeed | null = DEFAULT_PROFILE) {
    super();
  }

  override async findByUserId(userId: string) {
    if (!this.profile) {
      return null;
    }

    return {
      id: `profile-${userId}`,
      userId,
      status: ProfileStatus.COMPLETED,
      ...this.profile,
    } as unknown as Awaited<ReturnType<StudentRepository["findByUserId"]>>;
  }
}

export class ScanAttendanceRepository extends AttendanceRepository {
  readonly rows: {
    id: string;
    studentId: string;
    sessionId: string;
    scanTime: Date;
    status: AttendanceStatus;
  }[] = [];

  override async findByStudentAndSession(studentId: string, sessionId: string) {
    return (
      this.rows.find(
        (row) => row.studentId === studentId && row.sessionId === sessionId
      ) ?? null
    );
  }

  /** The roster read, so the authorization tests can assert what came back. */
  override async findBySession(sessionId: string) {
    return this.rows
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({
        ...row,
        student: {
          id: row.studentId,
          universityId: `U-${row.studentId}`,
          fullName: "Student",
          email: `${row.studentId}@cu.edu.eg`,
        },
      }));
  }

  /**
   * The same PRESENT/LATE/ABSENT split the real query does, including the
   * `total` that excludes ABSENT and the `roll` that does not — the semantics
   * every `attendanceCount` in the API is now aligned to.
   */
  override async getSessionStats(sessionId: string) {
    const of = (status: AttendanceStatus) =>
      this.rows.filter(
        (row) => row.sessionId === sessionId && row.status === status
      ).length;

    const present = of(AttendanceStatus.PRESENT);
    const late = of(AttendanceStatus.LATE);
    const absent = of(AttendanceStatus.ABSENT);

    return {
      total: present + late,
      present,
      late,
      absent,
      roll: present + late + absent,
    };
  }

  override async create(data: {
    studentId: string;
    sessionId: string;
    status?: "PRESENT" | "LATE";
  }) {
    const row = {
      id: `attendance-${this.rows.length + 1}`,
      studentId: data.studentId,
      sessionId: data.sessionId,
      scanTime: new Date(),
      status: (data.status ?? "PRESENT") as AttendanceStatus,
    };

    this.rows.push(row);

    return row;
  }
}
