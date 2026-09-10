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
 * And an instructor publishes only to audiences they actually teach: the
 * submitted faculty/department/level/semester/section is checked against the
 * set derived from their own active lectures, and the record is written from
 * the matched authorized audience rather than from the request body — so
 * material is targeted at a course and academic audience, never at a single
 * lecture occurrence, and the audience cannot be widened by editing the request.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";

const INSTRUCTOR = { id: "instructor-1", role: "INSTRUCTOR", organizationId: ORG_A };
const OTHER_INSTRUCTOR = { id: "instructor-2", role: "INSTRUCTOR", organizationId: ORG_A };
const SUPER_ADMIN = {
  id: "super-1",
  role: "UNIVERSITY_ADMIN",
  organizationId: ORG_A,
};
const STUDENT = { id: "student-1", role: "STUDENT", organizationId: ORG_A };

const COURSE = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  organizationId: ORG_A,
  courseCode: "CS201",
  courseName: "Data Structures",
};

/** A second real course, taught by nobody in TAUGHT_AUDIENCE. */
const OTHER_COURSE = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: ORG_A,
  courseCode: "EE101",
  courseName: "Electronics",
};

/**
 * The one audience INSTRUCTOR teaches — CS201, level 2, semester 1, section B.
 * The shape mirrors ScheduleRepository.findPublishableScopes: the academic
 * address with the course, and no day or time.
 */
const TAUGHT_AUDIENCE = {
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: 1,
  section: "B",
  course: {
    id: COURSE.id,
    courseCode: COURSE.courseCode,
    courseName: COURSE.courseName,
  },
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
  /** Audiences INSTRUCTOR teaches; defaults to the single TAUGHT_AUDIENCE. */
  audiences?: Record<string, unknown>[];
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
      // The real repository returns the row with its course relation; the
      // publish path reads course.courseCode/courseName to notify the cohort.
      return {
        id: "new-material",
        ...data,
        course: {
          id: COURSE.id,
          courseCode: COURSE.courseCode,
          courseName: COURSE.courseName,
        },
      } as never;
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
    // Stands in for the offering/teaching-assignment-gated derivation: the real
    // query only returns a course's audience while the instructor holds an
    // active teaching assignment for it, so the doubles hand back the already
    // authorized scopes. Only INSTRUCTOR, in ORG_A, is authorized for anything;
    // everyone else — OTHER_INSTRUCTOR, a cross-tenant caller — gets nothing, so
    // no scope matches and publishing is refused.
    override async findPublishableScopes(
      organizationId: string,
      instructorId: string
    ) {
      if (organizationId !== ORG_A || instructorId !== INSTRUCTOR.id) {
        return [] as never;
      }
      return (options.audiences ?? [TAUGHT_AUDIENCE]) as never;
    }
  }

  class FakeStudents extends StudentRepository {
    override async findByUserId(_userId: string) {
      return (options.profile === undefined
        ? COMPLETE_PROFILE
        : options.profile) as never;
    }
  }

  // A stub event notifier: publishing a material now also notifies the cohort,
  // but that path is covered by campus-events.notifier.test.ts. Here it must
  // simply not reach the database, and its calls are recorded so the publish
  // path can be shown to trigger exactly one notification.
  const materialEvents: unknown[] = [];
  const events = {
    async materialPublished(event: unknown) {
      materialEvents.push(event);
      return 0;
    },
  } as unknown as import("../src/services/campus-events.notifier.js").CampusEventNotifier;

  return {
    created,
    updated,
    cohortQueries,
    materialEvents,
    service: new MaterialService(
      new FakeMaterials(),
      new FakeCourses(),
      new FakeSchedules(),
      new FakeStudents(),
      events
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
        audience: {
          faculty: "Faculty of Engineering",
          department: "Mechatronics",
          level: 2,
          semester: 1,
          section: "B",
        },
      })
    ).toThrow();
  });

  it("requires an audience", () => {
    // Material must name a course and an academic audience; there is no other
    // way to say who a link is for.
    expect(() =>
      createMaterialSchema.parse({
        courseId: COURSE.id,
        title: "Lectures",
        driveUrl: "https://drive.google.com/drive/folders/abc",
      })
    ).toThrow();
  });

  it("rejects a structurally invalid audience", () => {
    const base = {
      courseId: COURSE.id,
      title: "Lectures",
      driveUrl: "https://drive.google.com/drive/folders/abc",
    };

    // Semester is 1 or 2, level is 1-7 — an out-of-range combination is a 400
    // from the validator before any authorization check is reached.
    expect(() =>
      createMaterialSchema.parse({
        ...base,
        audience: {
          faculty: "Faculty of Engineering",
          department: "Mechatronics",
          level: 9,
          semester: 3,
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
  /** The audience INSTRUCTOR actually teaches, as the client would send it. */
  const TAUGHT = {
    faculty: "Faculty of Engineering",
    department: "Mechatronics",
    level: 2,
    semester: 1,
    section: "B",
  };

  const input = (overrides: Record<string, unknown> = {}) =>
    createMaterialSchema.parse({
      courseId: COURSE.id,
      title: "Lectures",
      driveUrl: "https://drive.google.com/drive/folders/abc",
      audience: TAUGHT,
      ...overrides,
    });

  it("writes the audience off the instructor's own teaching", async () => {
    const { service, created, materialEvents } = build();

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

    // Publishing notifies the cohort exactly once, with the STORED audience.
    expect(materialEvents).toHaveLength(1);
    expect(materialEvents[0]).toMatchObject({
      materialId: "new-material",
      organizationId: ORG_A,
      courseId: COURSE.id,
      faculty: "Faculty of Engineering",
      department: "Mechatronics",
      level: 2,
      semester: 1,
      section: "B",
    });
  });

  it("takes the stored audience from teaching, not from the request body", async () => {
    // The submitted strings only SELECT which taught audience is meant — the
    // record is written from the authorized side, so casing or whitespace a
    // caller sends cannot end up addressing anyone. The student lookup matches
    // case-insensitively anyway, but this proves the request text is discarded.
    const { service, created } = build();

    await service.create(
      input({
        audience: { ...TAUGHT, faculty: "  faculty OF engineering ", section: " b " },
      }),
      INSTRUCTOR
    );

    expect(created[0]).toMatchObject({
      faculty: "Faculty of Engineering",
      section: "B",
    });
  });

  it("refuses an instructor publishing to an audience they do not teach", async () => {
    const { service, created } = build();

    // OTHER_INSTRUCTOR teaches nothing, so no audience matches. A 403 rather
    // than a 404: the course exists and is theirs to see, but this cohort is
    // not one they teach.
    await expect(service.create(input(), OTHER_INSTRUCTOR)).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(created).toEqual([]);
  });

  it("refuses an instructor addressing a cohort adjacent to one they teach", async () => {
    const { service, created } = build();

    // INSTRUCTOR teaches CS201 level 2 section B. Level 3 of the same course,
    // or section C, is a different audience they were never assigned — a
    // hand-edited request body must not reach it.
    await expect(
      service.create(input({ audience: { ...TAUGHT, level: 3 } }), INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.create(input({ audience: { ...TAUGHT, section: "C" } }), INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(created).toEqual([]);
  });

  it("refuses an instructor addressing a course they do not teach", async () => {
    const { service, created } = build();

    // EE101 is a real course in this university, but no lecture of it is taught
    // by INSTRUCTOR — so borrowing the audience of a course they do teach in
    // order to publish to one they do not is refused.
    await expect(
      service.create(input({ courseId: OTHER_COURSE.id }), INSTRUCTOR)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(created).toEqual([]);
  });

  it("lets a super admin name an audience directly", async () => {
    const { service, created } = build();

    // A super admin is not scoped to their own teaching; an audience they were
    // never assigned is accepted as-is.
    await service.create(
      input({
        audience: {
          faculty: "Faculty of Engineering",
          department: "Mechatronics",
          level: 4,
          semester: 1,
          section: "A",
        },
      }),
      SUPER_ADMIN
    );

    expect(created[0]).toMatchObject({ level: 4, section: "A" });
  });

  it("defaults a super admin's omitted section to every section", async () => {
    const { service, created } = build();

    await service.create(
      input({
        audience: {
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

  it("404s on a course from another university", async () => {
    const { service } = build();

    await expect(
      service.create(input(), { ...INSTRUCTOR, organizationId: ORG_B })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("the audiences an instructor may publish to", () => {
  it("collapses lectures of one course and cohort into a single audience", async () => {
    // Two weekly slots — the same course to the same cohort — are one
    // publishable audience, with no day or time.
    const { service } = build({
      audiences: [
        TAUGHT_AUDIENCE,
        { ...TAUGHT_AUDIENCE },
        {
          ...TAUGHT_AUDIENCE,
          level: 3,
          section: "A",
          course: {
            id: OTHER_COURSE.id,
            courseCode: OTHER_COURSE.courseCode,
            courseName: OTHER_COURSE.courseName,
          },
        },
      ],
    });

    const { audiences } = await service.listTeachableAudiences(INSTRUCTOR);

    expect(audiences).toHaveLength(2);
    expect(audiences[0]).toMatchObject({
      course: { id: COURSE.id },
      level: 2,
      section: "B",
    });
    // Never a day, time or room — an audience is occurrence-independent.
    expect(audiences[0]).not.toHaveProperty("dayOfWeek");
    expect(audiences[0]).not.toHaveProperty("startTime");
  });

  it("is empty for someone who teaches nothing", async () => {
    const { service } = build();

    const { audiences } = await service.listTeachableAudiences(OTHER_INSTRUCTOR);

    expect(audiences).toEqual([]);
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
