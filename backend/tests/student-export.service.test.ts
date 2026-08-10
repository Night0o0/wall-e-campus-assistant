import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { StudentExportService } from "../src/services/student-export.service.js";
import {
  CourseFixture,
  FakeAttendanceRepository,
  FakeCourseRepository,
  FakeSessionRepository,
  FakeStudentRepository,
  ORG_A,
  ORG_B,
  PLATFORM_ORG,
  StudentFixture,
  makeStudent,
} from "./helpers/export-fakes.js";

/**
 * The roster export. Most of these tests are the same question from different
 * angles: can this caller pull down a list of students they have no business
 * seeing?
 */

const COURSE_ID = "course-mec201";

const INSTRUCTOR = { id: "instructor-1", role: "ADMIN", organizationId: ORG_A };
const OTHER_ADMIN = { id: "instructor-2", role: "ADMIN", organizationId: ORG_A };
const CREATOR = { id: "course-creator", role: "ADMIN", organizationId: ORG_A };
const SUPER_ADMIN = {
  id: "super-admin",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};
const FOREIGN_SUPER_ADMIN = {
  id: "cu-super-admin",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_B,
};
const FOREIGN_ADMIN = {
  id: "cu-instructor",
  role: "ADMIN",
  organizationId: ORG_B,
};
const SYSTEM_OWNER = {
  id: "platform-owner",
  role: "SYSTEM_OWNER",
  organizationId: PLATFORM_ORG,
};

const electronics: CourseFixture = {
  id: COURSE_ID,
  courseCode: "MEC201",
  courseName: "Electronics",
  department: "Mechatronics",
  semester: "First Semester",
  organizationId: ORG_A,
  createdById: CREATOR.id,
  lectureSchedules: [
    {
      instructorId: INSTRUCTOR.id,
      faculty: "Faculty of Engineering",
      department: "Mechatronics",
      level: 2,
      semester: 1,
      section: "B",
    },
  ],
};

/** Section B, level 2, first semester — the cohort the lecture addresses. */
const inCohort = [
  makeStudent("b1", { fullName: "Youssef Nasser", section: "B" }),
  makeStudent("b2", { fullName: "Aya Sabry", section: "B" }),
];

const outsideCohort = [
  makeStudent("a1", { fullName: "Mariam Fouad", section: "A" }),
  makeStudent("l3", { fullName: "Salma Kamal", level: 3 }),
  makeStudent("s2", { fullName: "Kareem Adel", semester: "Second Semester" }),
  makeStudent("inactive", { fullName: "Gone Away", isActive: false }),
  // Identical academic address, different university.
  makeStudent("cu-b1", {
    fullName: "Cairo Student",
    organizationId: ORG_B,
  }),
];

/** Attends the course but is not in any cohort it addresses. */
const attendeeOnly = makeStudent("transfer", {
  fullName: "Nour Transfer",
  section: "C",
});

const build = (options: { students?: StudentFixture[] } = {}) =>
  new StudentExportService(
    new FakeCourseRepository([electronics]),
    new FakeStudentRepository(
      options.students ?? [...inCohort, ...outsideCohort, attendeeOnly],
      { transfer: [COURSE_ID], b1: [COURSE_ID] }
    ),
    new FakeSessionRepository({ [COURSE_ID]: 4 }),
    new FakeAttendanceRepository({
      [COURSE_ID]: { b1: 3, b2: 4, transfer: 2 },
    }),
    "UTC"
  );

/** Reads a produced workbook back the way Excel would. */
const readWorkbook = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  const sheet = workbook.worksheets[0]!;
  const rows: unknown[][] = [];

  sheet.eachRow((row) => {
    // ExcelJS row values are 1-indexed, with a hole at 0.
    rows.push((row.values as unknown[]).slice(1));
  });

  const headerIndex = rows.findIndex((row) => row[0] === "Student Name");

  return {
    sheet,
    rows,
    header: rows[headerIndex] as string[],
    data: rows.slice(headerIndex + 1),
  };
};

describe("course roster export — authorization", () => {
  let service: StudentExportService;

  beforeEach(() => {
    service = build();
  });

  it("lets an ADMIN export a course they are assigned to", async () => {
    const result = await service.exportCourseStudents(COURSE_ID, INSTRUCTOR);

    expect(result.studentCount).toBeGreaterThan(0);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("refuses an ADMIN a course they are not assigned to", async () => {
    // Same university, real course — they simply do not teach it and did not
    // create it, so the honest answer is 403 rather than a pretend 404.
    await expect(
      service.exportCourseStudents(COURSE_ID, OTHER_ADMIN)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not assigned to this course",
    });
  });

  it("counts creating the course as being assigned to it", async () => {
    // The ownership CourseService already uses to decide who may edit or
    // delete a course.
    const result = await service.exportCourseStudents(COURSE_ID, CREATOR);

    expect(result.studentCount).toBeGreaterThan(0);
  });

  it("lets a UNIVERSITY_SUPER_ADMIN export any course in their organization", async () => {
    // Not the instructor, not the creator — the whole of their own
    // university's timetable is theirs.
    const result = await service.exportCourseStudents(COURSE_ID, SUPER_ADMIN);

    expect(result.studentCount).toBeGreaterThan(0);
  });

  it("rejects a cross-tenant export, whatever the role", async () => {
    // 404, not 403: the endpoint must not confirm that the id exists elsewhere.
    for (const actor of [FOREIGN_SUPER_ADMIN, FOREIGN_ADMIN, SYSTEM_OWNER]) {
      await expect(
        service.exportCourseStudents(COURSE_ID, actor)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Course not found",
      });
    }
  });

  it("reports an unknown course the same way as another tenant's", async () => {
    await expect(
      service.exportCourseStudents("course-does-not-exist", SUPER_ADMIN)
    ).rejects.toMatchObject({ statusCode: 404, message: "Course not found" });
  });
});

describe("course roster export — contents", () => {
  it("produces a real xlsx workbook, not a renamed CSV", async () => {
    const { buffer } = await build().exportCourseStudents(COURSE_ID, INSTRUCTOR);

    // An .xlsx is a ZIP container: it starts with the local file header magic.
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    // And it reads back through a spreadsheet library, which a CSV would not.
    const { sheet, header } = await readWorkbook(buffer);

    expect(sheet.name).toBe("MEC201 Students");
    expect(header).toEqual([
      "Student Name",
      "University ID",
      "Department",
      "Academic Level",
      "Section",
      "Email",
      "Sessions Attended",
      "Sessions Held",
      "Attendance %",
    ]);
  });

  it("never includes the national ID", async () => {
    const { buffer } = await build().exportCourseStudents(COURSE_ID, INSTRUCTOR);
    const { header, rows } = await readWorkbook(buffer);

    expect(header.join(" ").toLowerCase()).not.toContain("national");

    // Nor anywhere else in the sheet: no 14-digit national id in any cell.
    const everyCell = rows.flat().map((value) => String(value ?? ""));
    expect(everyCell.some((value) => /^\d{14}$/.test(value))).toBe(false);
  });

  it("lists the cohort and the people who actually attended, and nobody else", async () => {
    const { buffer } = await build().exportCourseStudents(COURSE_ID, INSTRUCTOR);
    const { data } = await readWorkbook(buffer);

    const names = data.map((row) => row[0]);

    expect(names).toContain("Youssef Nasser"); // cohort
    expect(names).toContain("Aya Sabry"); // cohort
    expect(names).toContain("Nour Transfer"); // attended, outside the cohort

    expect(names).not.toContain("Mariam Fouad"); // another section
    expect(names).not.toContain("Salma Kamal"); // another level
    expect(names).not.toContain("Kareem Adel"); // another semester
    expect(names).not.toContain("Gone Away"); // deactivated account
    expect(names).not.toContain("Cairo Student"); // another university

    expect(data).toHaveLength(3);
  });

  it("writes the columns and the attendance percentage Excel can compute with", async () => {
    const { buffer } = await build().exportCourseStudents(COURSE_ID, INSTRUCTOR);
    const { data, sheet, header } = await readWorkbook(buffer);

    const youssef = data.find((row) => row[0] === "Youssef Nasser")!;

    expect(youssef).toEqual([
      "Youssef Nasser",
      "NCTU-B1",
      "Mechatronics",
      2,
      "B",
      "b1@student.nctu.edu.eg",
      3,
      4,
      // A real fraction, not the string "75%", so a column average works.
      0.75,
    ]);

    const percentColumn = sheet.getColumn(header.length);
    expect(percentColumn.numFmt).toBe("0.0%");
  });

  it("leaves the percentage empty when no session has finished yet", async () => {
    const service = new StudentExportService(
      new FakeCourseRepository([electronics]),
      new FakeStudentRepository(inCohort),
      new FakeSessionRepository({}), // no closed sessions
      new FakeAttendanceRepository({}),
      "UTC"
    );

    const { buffer } = await service.exportCourseStudents(COURSE_ID, INSTRUCTOR);
    const { data, header } = await readWorkbook(buffer);

    // Nobody has missed anything yet, so 0% would be a lie.
    expect(data[0]![header.indexOf("Attendance %")]).toBeUndefined();
    expect(data[0]![header.indexOf("Sessions Held")]).toBe(0);
  });

  it("names the file after the course and the day it was made", async () => {
    const { filename } = await build().exportCourseStudents(
      COURSE_ID,
      INSTRUCTOR
    );

    const today = new Date().toISOString().slice(0, 10);

    expect(filename).toBe(`electronics_students_${today}.xlsx`);
    expect(filename).toMatch(/^[a-z0-9_]+_students_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("still produces a valid workbook for a course with nobody on it", async () => {
    const service = new StudentExportService(
      new FakeCourseRepository([electronics]),
      new FakeStudentRepository([]),
      new FakeSessionRepository({ [COURSE_ID]: 2 }),
      new FakeAttendanceRepository({}),
      "UTC"
    );

    const result = await service.exportCourseStudents(COURSE_ID, INSTRUCTOR);

    expect(result.studentCount).toBe(0);

    const { header, data } = await readWorkbook(result.buffer);

    expect(header).toHaveLength(9);
    expect(data).toHaveLength(0);
  });
});
