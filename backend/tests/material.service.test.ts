import { describe, expect, it } from "vitest";
import { CourseRepository } from "../src/repositories/course.repository.js";
import { MaterialRepository } from "../src/repositories/material.repository.js";
import { ScheduleRepository } from "../src/repositories/schedule.repository.js";
import { StudentRepository } from "../src/repositories/student.repository.js";
import { MaterialService } from "../src/services/material.service.js";
import {
  createMaterialSchema,
  isAllowedMaterialUrl,
  updateMaterialSchema,
} from "../src/types/material.types.js";

/**
 * Course material links.
 *
 * Two properties carry the feature. A student sees their own cohort's folders
 * and cannot ask for anybody else's, because the cohort is never a parameter.
 * And an instructor publishes to cohorts they actually teach, because the
 * academic address is copied off one of their own lectures rather than typed.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";

const INSTRUCTOR = { id: "instructor-1", role: "ADMIN", organizationId: ORG_A };
const OTHER_INSTRUCTOR = { id: "instructor-2", role: "ADMIN", organizationId: ORG_A };
const SUPER_ADMIN = {
  id: "super-1",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG_A,
};
const STUDENT = { id: "student-1", role: "STUDENT", organizationId: ORG_A };

const COURSE = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  organizationId: ORG_A,
  courseCode: "CS201",
  courseName: "Data Structures",
};

/** A second real course, taught by nobody in SCHEDULE. */
const OTHER_COURSE = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: ORG_A,
  courseCode: "EE101",
  courseName: "Electronics",
};

const SCHEDULE = {
  id: "8f14e45f-ceea-467a-9575-9c1f9c1f9c1f",
  organizationId: ORG_A,
  courseId: COURSE.id,
  instructorId: INSTRUCTOR.id,
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: 1,
  section: "B",
};

const COMPLETE_PROFILE = {
  status: "COMPLETED",
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: "First Semester",
  section: "B",
};

const build = (options: {
  profile?: Record<string, unknown> | null;
  cohortRows?: Record<string, unknown>[];
  existing?: Record<string, unknown> | null;
} = {}) => {
  const created: Record<string, unknown>[] = [];
  const updated: { id: string; data: Record<string, unknown> }[] = [];
  const cohortQueries: unknown[] = [];

  class FakeMaterials extends MaterialRepository {
    override async findForCohort(organizationId: string, criteria: unknown) {
      cohortQueries.push({ organizationId, criteria });
      return (options.cohortRows ?? []) as never;
    }

    override async findInOrganization(id: string, organizationId: string) {
      const row = options.existing;

      if (!row || row.organizationId !== organizationId || row.id !== id) {
        return null as never;
      }

      return row as never;
    }

    override async create(data: Record<string, unknown>) {
      created.push(data);
      return { id: "new-material", ...data } as never;
    }

    override async update(id: string, data: Record<string, unknown>) {
      updated.push({ id, data });
      return { id, ...data } as never;
    }
  }

  class FakeCourses extends CourseRepository {
    override async findById(id: string) {
      if (id === COURSE.id) return COURSE as never;
      if (id === OTHER_COURSE.id) return OTHER_COURSE as never;
      return null as never;
    }
  }

  class FakeSchedules extends ScheduleRepository {
    override async findById(id: string) {
      return (id === SCHEDULE.id ? SCHEDULE : null) as never;
    }
  }

  class FakeStudents extends StudentRepository {
    override async findByUserId(_userId: string) {
      return (options.profile === undefined
        ? COMPLETE_PROFILE
        : options.profile) as never;
    }
  }

  return {
    created,
    updated,
    cohortQueries,
    service: new MaterialService(
      new FakeMaterials(),
      new FakeCourses(),
      new FakeSchedules(),
      new FakeStudents()
    ),
  };
};

describe("the Drive link policy", () => {
  it("accepts Google Drive and Docs over https", () => {
    expect(isAllowedMaterialUrl("https://drive.google.com/drive/folders/abc")).toBe(true);
    expect(isAllowedMaterialUrl("https://docs.google.com/document/d/abc")).toBe(true);
  });

  it("refuses http, other hosts, and lookalike subdomains", () => {
    expect(isAllowedMaterialUrl("http://drive.google.com/x")).toBe(false);
    expect(isAllowedMaterialUrl("https://evil.test/x")).toBe(false);
    // The classic: a hostile host wearing a familiar prefix.
    expect(isAllowedMaterialUrl("https://drive.google.com.evil.test/x")).toBe(false);
    expect(isAllowedMaterialUrl("https://user:pass@drive.google.com/x")).toBe(false);
    expect(isAllowedMaterialUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedMaterialUrl("not a url")).toBe(false);
  });

  it("is enforced by the create schema", () => {
    expect(() =>
      createMaterialSchema.parse({
        courseId: COURSE.id,
        title: "Lectures",
        driveUrl: "https://evil.test/x",
        scheduleId: SCHEDULE.id,
      })
    ).toThrow();
  });

  it("requires exactly one way of naming the cohort", () => {
    const base = {
      courseId: COURSE.id,
      title: "Lectures",
      driveUrl: "https://drive.google.com/drive/folders/abc",
    };

    expect(() => createMaterialSchema.parse(base)).toThrow();

    expect(() =>
      createMaterialSchema.parse({
        ...base,
        scheduleId: SCHEDULE.id,
        cohort: {
          faculty: "Faculty of Engineering",
          department: "Mechatronics",
          level: 2,
          semester: 1,
        },
      })
    ).toThrow();
  });

  it("does not let an edit re-address the cohort", () => {
    // Moving a link to a different year is a different link, not an edit.
    const parsed = updateMaterialSchema.parse({
      title: "Lectures",
      level: 3,
      department: "Civil",
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty("level");
    expect(parsed).not.toHaveProperty("department");
  });
});

describe("publishing material", () => {
  const input = (overrides: Record<string, unknown> = {}) =>
    createMaterialSchema.parse({
      courseId: COURSE.id,
      title: "Lectures",
      driveUrl: "https://drive.google.com/drive/folders/abc",
      scheduleId: SCHEDULE.id,
      ...overrides,
    });

  it("copies the cohort off the instructor's own lecture", async () => {
    const { service, created } = build();

    await service.create(input(), INSTRUCTOR);

    expect(created[0]).toMatchObject({
      organizationId: ORG_A,
      courseId: COURSE.id,
      addedById: INSTRUCTOR.id,
      faculty: "Faculty of Engineering",
      department: "Mechatronics",
      level: 2,
      semester: 1,
      section: "B",
    });
  });

  it("refuses an instructor publishing against somebody else's lecture", async () => {
    const { service, created } = build();

    // 404 rather than 403, so this cannot be used to discover which lectures
    // exist and who teaches them.
    await expect(service.create(input(), OTHER_INSTRUCTOR)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(created).toEqual([]);
  });

  it("refuses an instructor naming a cohort directly", async () => {
    const { service, created } = build();

    // This is the parameter through which an instructor could address a year
    // they have nothing to do with, so it is closed to them entirely.
    await expect(
      service.create(
        input({
          scheduleId: undefined,
          cohort: {
            faculty: "Faculty of Engineering",
            department: "Mechatronics",
            level: 4,
            semester: 1,
          },
        }),
        INSTRUCTOR
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(created).toEqual([]);
  });

  it("lets a super admin name a cohort, defaulting the section to every section", async () => {
    const { service, created } = build();

    await service.create(
      input({
        scheduleId: undefined,
        cohort: {
          faculty: "Faculty of Engineering",
          department: "Mechatronics",
          level: 4,
          semester: 1,
        },
      }),
      SUPER_ADMIN
    );

    expect(created[0]).toMatchObject({ level: 4, section: null });
  });

  it("refuses a lecture that is not for the course being published to", async () => {
    const { service, created } = build();

    // Both the course and the lecture are real and both belong to this
    // university — but the lecture teaches CS201, and the link is being
    // published to EE101. Without this check, "pick one of your lectures" would
    // let an instructor borrow the cohort of a lecture they teach in order to
    // address a course they do not.
    await expect(
      service.create(
        createMaterialSchema.parse({
          courseId: OTHER_COURSE.id,
          title: "Lectures",
          driveUrl: "https://drive.google.com/drive/folders/abc",
          scheduleId: SCHEDULE.id,
        }),
        INSTRUCTOR
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(created).toEqual([]);
  });

  it("404s on a course from another university", async () => {
    const { service } = build();

    await expect(
      service.create(input(), { ...INSTRUCTOR, organizationId: ORG_B })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("editing material", () => {
  const MINE = {
    id: "mat-1",
    organizationId: ORG_A,
    addedById: INSTRUCTOR.id,
  };

  it("lets an instructor change what they published", async () => {
    const { service, updated } = build({ existing: MINE });

    await service.update("mat-1", { title: "Labs" }, INSTRUCTOR);

    expect(updated).toEqual([{ id: "mat-1", data: { title: "Labs" } }]);
  });

  it("stops an instructor re-pointing another instructor's folder", async () => {
    const { service, updated } = build({ existing: MINE });

    await expect(
      service.update("mat-1", { driveUrl: "https://drive.google.com/x" }, OTHER_INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(updated).toEqual([]);
  });

  it("lets a super admin administer anybody's material", async () => {
    const { service, updated } = build({ existing: MINE });

    await service.update("mat-1", { title: "Renamed" }, SUPER_ADMIN);

    expect(updated).toHaveLength(1);
  });

  it("deactivates rather than deletes", async () => {
    const { service, updated } = build({ existing: MINE });

    await service.deactivate("mat-1", INSTRUCTOR);

    expect(updated).toEqual([{ id: "mat-1", data: { isActive: false } }]);
  });

  it("404s across universities", async () => {
    const { service } = build({ existing: { ...MINE, organizationId: ORG_B } });

    await expect(
      service.update("mat-1", { title: "Labs" }, INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("what a student sees", () => {
  it("reads the cohort off their own profile, not off the request", async () => {
    const { service, cohortQueries } = build({ cohortRows: [] });

    await service.listForStudent(STUDENT);

    expect(cohortQueries).toEqual([
      {
        organizationId: ORG_A,
        criteria: {
          faculty: "Faculty of Engineering",
          department: "Mechatronics",
          level: 2,
          semester: 1,
          section: "B",
        },
      },
    ]);
  });

  it("groups the links by subject", async () => {
    const { service } = build({
      cohortRows: [
        {
          id: "m1",
          courseId: COURSE.id,
          course: COURSE,
          title: "Lectures",
          driveUrl: "https://drive.google.com/1",
          addedBy: { id: INSTRUCTOR.id, fullName: "Adel Mansour" },
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        {
          id: "m2",
          courseId: COURSE.id,
          course: COURSE,
          title: "Past papers",
          driveUrl: "https://drive.google.com/2",
          addedBy: { id: INSTRUCTOR.id, fullName: "Adel Mansour" },
          createdAt: new Date("2026-08-02T00:00:00.000Z"),
        },
      ],
    });

    const result = await service.listForStudent(STUDENT);

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].course.courseCode).toBe("CS201");
    expect(result.courses[0].materials.map((m) => m.title)).toEqual([
      "Lectures",
      "Past papers",
    ]);
  });

  it("asks for a profile rather than guessing at a cohort", async () => {
    const { service, cohortQueries } = build({ profile: null });

    await expect(service.listForStudent(STUDENT)).rejects.toMatchObject({
      statusCode: 400,
    });

    // Nothing was looked up: an unplaceable student gets no folders at all
    // rather than somebody else's.
    expect(cohortQueries).toEqual([]);
  });

  it("refuses a semester it cannot read", async () => {
    const { service } = build({
      profile: { ...COMPLETE_PROFILE, semester: "2026" },
    });

    // A bare year must not resolve to "second semester" — see
    // parseSemesterNumber.
    await expect(service.listForStudent(STUDENT)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
