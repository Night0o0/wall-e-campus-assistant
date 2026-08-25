import { describe, expect, it } from "vitest";
import { AttendanceRepository } from "../src/repositories/attendance.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { StudentRepository } from "../src/repositories/student.repository.js";
import { AttendanceService } from "../src/services/attendance.service.js";
import { myAttendanceQuerySchema } from "../src/types/attendance.types.js";

/**
 * The student's achievement pages: attendance tallied per subject and overall.
 *
 * The property that matters most here is a negative one. A lecture nobody
 * opened a session for leaves no attendance row, and nothing in this summary
 * may invent one — so every total is a count of *recorded* lectures, and the
 * field is named to say so.
 */

const CS = { id: "course-cs", courseCode: "CS201", courseName: "Data Structures" };
const EE = { id: "course-ee", courseCode: "EE101", courseName: "Electronics" };

type Status = "PRESENT" | "LATE" | "ABSENT";

const build = (
  rows: { status: Status; course: typeof CS | null }[]
) => {
  class FakeAttendance extends AttendanceRepository {
    override async findStatusesByStudent(_studentId: string) {
      return rows.map((row) => ({
        status: row.status,
        session: { course: row.course },
      })) as never;
    }
  }

  return new AttendanceService(
    new FakeAttendance(),
    new SessionRepository(),
    new StudentRepository()
  );
};

describe("attendance summary", () => {
  it("splits the tally by subject", async () => {
    const service = build([
      { status: "PRESENT", course: CS },
      { status: "PRESENT", course: CS },
      { status: "LATE", course: CS },
      { status: "ABSENT", course: EE },
      { status: "PRESENT", course: EE },
    ]);

    const summary = await service.getMyAttendanceSummary("student-1");

    // Ordered by course code, so the list is stable between requests.
    expect(summary.courses.map((row) => row.course!.courseCode)).toEqual([
      "CS201",
      "EE101",
    ]);

    const cs = summary.courses.find((row) => row.course!.id === CS.id)!;

    expect(cs).toMatchObject({
      present: 2,
      late: 1,
      absent: 0,
      attended: 3,
      recordedLectures: 3,
      attendanceRate: 100,
    });
  });

  it("counts LATE as attended", async () => {
    // A student who turned up late turned up. The distinction is worth
    // recording and worth showing, but it is not an absence.
    const service = build([
      { status: "LATE", course: CS },
      { status: "ABSENT", course: CS },
    ]);

    const summary = await service.getMyAttendanceSummary("student-1");

    expect(summary.overall).toMatchObject({
      attended: 1,
      recordedLectures: 2,
      attendanceRate: 50,
    });
  });

  it("counts recorded lectures, never lectures", async () => {
    // Three sessions were opened for this student's cohort and one was not.
    // The one that was not produced no row, and so is invisible here — the
    // denominator is 3, not 4, and the field name is the only honest way to
    // say that to whoever renders it.
    const service = build([
      { status: "PRESENT", course: CS },
      { status: "PRESENT", course: CS },
      { status: "ABSENT", course: CS },
    ]);

    const summary = await service.getMyAttendanceSummary("student-1");

    expect(summary.overall.recordedLectures).toBe(3);
    expect(summary.overall).not.toHaveProperty("lectures");
    expect(summary.overall).not.toHaveProperty("totalLectures");
  });

  it("returns a null rate rather than 0% when nothing is recorded", async () => {
    // A student with no records has not missed anything, and 0% would say the
    // opposite.
    const service = build([]);

    const summary = await service.getMyAttendanceSummary("student-1");

    expect(summary.overall.attendanceRate).toBeNull();
    expect(summary.overall.recordedLectures).toBe(0);
    expect(summary.courses).toEqual([]);
  });

  it("keeps ad-hoc sessions rather than dropping them", async () => {
    // Session.courseId is nullable: a session can be opened for something with
    // no timetable entry. That attendance was still earned.
    const service = build([
      { status: "PRESENT", course: CS },
      { status: "PRESENT", course: null },
    ]);

    const summary = await service.getMyAttendanceSummary("student-1");

    expect(summary.overall.recordedLectures).toBe(2);

    const uncategorised = summary.courses.find((row) => row.course === null);

    expect(uncategorised).toMatchObject({ present: 1, recordedLectures: 1 });
  });

  it("rounds a rate to one decimal place", async () => {
    const service = build([
      { status: "PRESENT", course: CS },
      { status: "PRESENT", course: CS },
      { status: "ABSENT", course: CS },
    ]);

    const summary = await service.getMyAttendanceSummary("student-1");

    // 2/3 = 66.666…
    expect(summary.overall.attendanceRate).toBe(66.7);
  });
});

describe("the history query", () => {
  it("accepts a course filter and nothing else", () => {
    // Notably no studentId: the student is the token. A history endpoint that
    // accepted one would be an endpoint for reading somebody else's.
    const parsed = myAttendanceQuerySchema.parse({
      courseId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      studentId: "somebody-else",
    } as Record<string, string>);

    expect(parsed).not.toHaveProperty("studentId");
    expect(parsed.courseId).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  });

  it("rejects a courseId that is not an id", () => {
    expect(() => myAttendanceQuerySchema.parse({ courseId: "; DROP TABLE" })).toThrow();
  });
});
