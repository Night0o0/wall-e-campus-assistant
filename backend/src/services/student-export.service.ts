import { env } from "../config/env.js";
import { AttendanceRepository } from "../repositories/attendance.repository.js";
import { CourseRepository } from "../repositories/course.repository.js";
import { SessionRepository } from "../repositories/session.repository.js";
import { StudentRepository } from "../repositories/student.repository.js";
import { parseSemesterNumber } from "../types/schedule.types.js";
import { forbidden, notFound } from "../utils/AppError.js";
import {
  CellValue,
  SheetColumn,
  buildWorkbook,
  toExportFilename,
  todayInZone,
} from "../utils/excel.util.js";

/**
 * The student roster of one course, as a real .xlsx workbook.
 *
 * Two questions decide everything here, and they are answered in this order:
 * may this person export this course, and who is actually on it.
 */

/** Just enough of the authenticated user to make an authorization decision. */
export interface ExportActor {
  id: string;
  role: string;
  organizationId: string;
}

/** One line of the roster, before it becomes a spreadsheet row. */
interface RosterEntry {
  userId: string;
  fullName: string;
  universityId: string;
  email: string;
  department: string | null;
  level: number | null;
  section: string | null;
  /** Whether the student was found via the timetable cohort or via attendance. */
  viaCohort: boolean;
}

const COLUMNS: SheetColumn[] = [
  { header: "Student Name", width: 28 },
  { header: "University ID", width: 20 },
  { header: "Department", width: 26 },
  { header: "Academic Level", width: 15 },
  { header: "Section", width: 10 },
  { header: "Email", width: 34 },
  { header: "Sessions Attended", width: 18 },
  { header: "Sessions Held", width: 14 },
  // Stored as a real fraction with a percentage format, so Excel can average
  // and sort it. A string like "83%" would sort alphabetically.
  { header: "Attendance %", width: 14, numberFormat: "0.0%" },
];

export class StudentExportService {
  constructor(
    private readonly courses = new CourseRepository(),
    private readonly students = new StudentRepository(),
    private readonly sessions = new SessionRepository(),
    private readonly attendances = new AttendanceRepository(),
    private readonly timeZone: string = env.campusTimeZone
  ) {}

  async exportCourseStudents(courseId: string, actor: ExportActor) {
    const course = await this.loadAuthorizedCourse(courseId, actor);

    const roster = await this.buildRoster(course);

    const [attended, sessionsHeld] = await Promise.all([
      this.attendances.countAttendedByCourse(course.id, course.organizationId),
      this.sessions.countClosedByCourse(course.id, course.organizationId),
    ]);

    const rows: CellValue[][] = roster.map((student) => {
      const present = attended.get(student.userId) ?? 0;

      return [
        student.fullName,
        student.universityId,
        student.department,
        student.level,
        student.section,
        student.email,
        present,
        sessionsHeld,
        // Left empty rather than shown as 0% when no session has finished:
        // nobody has missed anything yet, and 0% would read as if they had.
        sessionsHeld > 0 ? present / sessionsHeld : null,
      ];
    });

    const generatedOn = todayInZone(this.timeZone);

    const buffer = await buildWorkbook({
      name: `${course.courseCode} Students`,
      columns: COLUMNS,
      rows,
      notes: [
        `${course.courseName} (${course.courseCode}) — student roster`,
        `Generated ${generatedOn} · ${roster.length} student${roster.length === 1 ? "" : "s"} · ${sessionsHeld} completed session${sessionsHeld === 1 ? "" : "s"}`,
        "Attendance % counts completed sessions only; sessions still open are excluded.",
      ],
    });

    return {
      buffer,
      filename: toExportFilename(course.courseName, "students", generatedOn),
      studentCount: roster.length,
    };
  }

  /* ------------------------------ Internals ------------------------------- */

  /**
   * Loads the course and decides whether this caller may export it.
   *
   * The tenant check comes first and applies to every role, SYSTEM_OWNER
   * included — it is confined to its own organization here exactly as it is on
   * every other campus route. A course in another university is reported as
   * missing rather than forbidden, so the endpoint cannot be used to discover
   * that an id exists somewhere else.
   */
  private async loadAuthorizedCourse(courseId: string, actor: ExportActor) {
    const course = await this.courses.findByIdForExport(courseId);

    if (!course || course.organizationId !== actor.organizationId) {
      throw notFound("Course not found");
    }

    if (actor.role === "ADMIN" && !this.isAssignedTo(course, actor.id)) {
      // Inside their own university, so the course does exist for them — the
      // honest answer is that they are not on it.
      throw forbidden("You are not assigned to this course");
    }

    return course;
  }

  /**
   * Whether an ADMIN is assigned to a course.
   *
   * Two relationships count, both already in the schema:
   *  - they instruct an active lecture of it (LectureSchedule is the teaching
   *    assignment — there is no CourseInstructor model), or
   *  - they created the course, which is the ownership CourseService already
   *    uses to decide who may edit or delete it.
   *
   * A UNIVERSITY_SUPER_ADMIN never reaches this check: the whole of their own
   * university's timetable is theirs to administer.
   */
  private isAssignedTo(
    course: { createdById: string; lectureSchedules: { instructorId: string }[] },
    adminId: string
  ) {
    return (
      course.createdById === adminId ||
      course.lectureSchedules.some(
        (schedule) => schedule.instructorId === adminId
      )
    );
  }

  /**
   * Who is on the course.
   *
   * The timetable says which cohorts a course is taught to, and attendance says
   * who actually sat in the room. Neither is complete on its own — a course
   * with no timetable row addresses no cohort at all, and a cohort edited
   * mid-term no longer describes everybody who has been attending — so the
   * roster is the union, de-duplicated by user.
   */
  private async buildRoster(course: {
    id: string;
    organizationId: string;
    lectureSchedules: {
      faculty: string;
      department: string;
      level: number;
      semester: number;
      section: string;
    }[];
  }): Promise<RosterEntry[]> {
    const roster = new Map<string, RosterEntry>();

    for (const schedule of course.lectureSchedules) {
      const cohort = await this.students.findCohortProfiles({
        organizationId: course.organizationId,
        faculty: schedule.faculty,
        department: schedule.department,
        level: schedule.level,
        section: schedule.section,
      });

      for (const profile of cohort) {
        // The database could not compare semesters — a profile stores free
        // text, a schedule stores 1 or 2 — so it is narrowed here with the same
        // reader the timetable uses.
        if (parseSemesterNumber(profile.semester) !== schedule.semester) {
          continue;
        }

        // Belt and braces over the tenant filter already in the query.
        if (profile.user.organizationId !== course.organizationId) {
          continue;
        }

        roster.set(profile.user.id, {
          userId: profile.user.id,
          fullName: profile.user.fullName,
          universityId: profile.user.universityId,
          email: profile.user.email,
          department: profile.department,
          level: profile.level,
          section: profile.section,
          viaCohort: true,
        });
      }
    }

    const attendees = await this.students.findAttendeesOfCourse(
      course.id,
      course.organizationId
    );

    for (const attendee of attendees) {
      if (roster.has(attendee.id)) {
        continue;
      }

      if (attendee.organizationId !== course.organizationId) {
        continue;
      }

      roster.set(attendee.id, {
        userId: attendee.id,
        fullName: attendee.fullName,
        universityId: attendee.universityId,
        email: attendee.email,
        department: attendee.studentProfile?.department ?? null,
        level: attendee.studentProfile?.level ?? null,
        section: attendee.studentProfile?.section ?? null,
        viaCohort: false,
      });
    }

    // Section first, then name: the order a register is read in.
    return [...roster.values()].sort(
      (a, b) =>
        (a.section ?? "").localeCompare(b.section ?? "") ||
        a.fullName.localeCompare(b.fullName)
    );
  }
}
