import { AttendanceRepository } from "../../src/repositories/attendance.repository.js";
import { CourseRepository } from "../../src/repositories/course.repository.js";
import { CohortCriteria, StudentRepository } from "../../src/repositories/student.repository.js";
import { SessionRepository } from "../../src/repositories/session.repository.js";

/**
 * In-memory repositories for the roster export.
 *
 * As in the notification suite, each double extends the repository it replaces,
 * so it is the real type to the service and any method left un-overridden would
 * try to reach Postgres and fail loudly rather than quietly returning nothing.
 */

export const ORG_A = "org-a";
export const ORG_B = "org-b";
export const PLATFORM_ORG = "org-platform";

export interface CourseFixture {
  id: string;
  courseCode: string;
  courseName: string;
  department: string | null;
  semester: string;
  organizationId: string;
  createdById: string;
  lectureSchedules: {
    instructorId: string;
    faculty: string;
    department: string;
    level: number;
    semester: number;
    section: string;
  }[];
}

export interface StudentFixture {
  userId: string;
  organizationId: string;
  fullName: string;
  universityId: string;
  email: string;
  faculty: string;
  department: string;
  level: number;
  /** Free text, exactly as StudentProfile stores it. */
  semester: string;
  section: string;
  isActive?: boolean;
}

export const makeStudent = (
  userId: string,
  overrides: Partial<StudentFixture> = {}
): StudentFixture => ({
  userId,
  organizationId: ORG_A,
  fullName: `Student ${userId}`,
  universityId: `NCTU-${userId.toUpperCase()}`,
  email: `${userId}@student.nctu.edu.eg`,
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: "First Semester",
  section: "B",
  isActive: true,
  ...overrides,
});

export class FakeCourseRepository extends CourseRepository {
  constructor(private readonly courses: CourseFixture[] = []) {
    super();
  }

  override async findByIdForExport(id: string) {
    const course = this.courses.find((candidate) => candidate.id === id);
    return (course ?? null) as never;
  }
}

export class FakeStudentRepository extends StudentRepository {
  constructor(
    private readonly students: StudentFixture[] = [],
    /** studentId -> the courses they have attendance in. */
    private readonly attendedCourses: Record<string, string[]> = {}
  ) {
    super();
  }

  /** Matches on everything the real query matches on, tenant included. */
  private cohort(criteria: CohortCriteria) {
    const same = (a: string, b: string) =>
      a.trim().toLowerCase() === b.trim().toLowerCase();

    return this.students.filter(
      (student) =>
        student.isActive !== false &&
        student.organizationId === criteria.organizationId &&
        same(student.faculty, criteria.faculty) &&
        same(student.department, criteria.department) &&
        same(student.section, criteria.section) &&
        student.level === criteria.level
    );
  }

  override async findCohortProfiles(criteria: CohortCriteria) {
    return this.cohort(criteria).map((student) => ({
      faculty: student.faculty,
      department: student.department,
      level: student.level,
      semester: student.semester,
      section: student.section,
      groupName: null,
      user: {
        id: student.userId,
        universityId: student.universityId,
        fullName: student.fullName,
        email: student.email,
        organizationId: student.organizationId,
      },
    }));
  }

  override async findAttendeesOfCourse(courseId: string, organizationId: string) {
    return this.students
      .filter(
        (student) =>
          student.organizationId === organizationId &&
          (this.attendedCourses[student.userId] ?? []).includes(courseId)
      )
      .map((student) => ({
        id: student.userId,
        universityId: student.universityId,
        fullName: student.fullName,
        email: student.email,
        organizationId: student.organizationId,
        studentProfile: {
          faculty: student.faculty,
          department: student.department,
          level: student.level,
          semester: student.semester,
          section: student.section,
          groupName: null,
        },
      }));
  }
}

export class FakeSessionRepository extends SessionRepository {
  constructor(private readonly closedByCourse: Record<string, number> = {}) {
    super();
  }

  override async countClosedByCourse(courseId: string) {
    return this.closedByCourse[courseId] ?? 0;
  }
}

export class FakeAttendanceRepository extends AttendanceRepository {
  constructor(
    /** courseId -> studentId -> sessions attended. */
    private readonly attended: Record<string, Record<string, number>> = {}
  ) {
    super();
  }

  override async countAttendedByCourse(courseId: string) {
    return new Map(Object.entries(this.attended[courseId] ?? {}));
  }
}
