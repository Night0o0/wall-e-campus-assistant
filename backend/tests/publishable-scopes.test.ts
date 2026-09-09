import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which lectures become publishing scopes — the authorization join.
 *
 * The bug this guards: gating "the instructor teaches this course somewhere"
 * (course → any active offering → any active teaching assignment) does not tie
 * THIS lecture to THAT assignment, so a stale or unrelated schedule for another
 * cohort of the same course could leak in. A scope must be authorized through
 * the lecture's OWN teaching assignment, and the course reported must be the one
 * reached through that assignment's offering.
 *
 * The backend suite is deliberately database-free, so instead of a live query
 * this test mocks `prisma.lectureSchedule.findMany` with a small evaluator that
 * applies the same `where` operators the repository uses (`is`, `{ not: null }`,
 * scalar equality) against an in-memory dataset. The rows that survive prove the
 * gate; what the repository maps out of them proves the authoritative course.
 */

/** Minimal matcher for the exact `where` shapes findPublishableScopes builds. */
const matches = (row: any, where: any): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null;
    if (typeof cond === "object" && cond !== null) {
      if ("not" in cond && cond.not === null) return value !== null && value !== undefined;
      if ("is" in cond) return value != null && matches(value, cond.is);
      // A nested plain object is treated as a relation match (e.g. offering).
      return value != null && matches(value, cond);
    }
    return value === cond;
  });

const applySelect = (row: any, select: any): any => {
  const out: any = {};
  for (const [key, spec] of Object.entries<any>(select)) {
    if (spec === true) out[key] = row[key];
    else if (spec && typeof spec === "object" && spec.select)
      out[key] = row[key] == null ? row[key] : applySelect(row[key], spec.select);
  }
  return out;
};

const dataset = vi.hoisted(() => ({ rows: [] as any[] }));

const prisma = vi.hoisted(() => ({
  lectureSchedule: {
    findMany: vi.fn(),
  },
}));

vi.mock("../src/lib/prisma.js", () => ({ default: prisma }));

const { ScheduleRepository } = await import(
  "../src/repositories/schedule.repository.js"
);

const ORG = "org-a";
const OTHER_ORG = "org-b";
const INSTRUCTOR = "instructor-1";
const OTHER_INSTRUCTOR = "instructor-2";

const COURSE_X = { id: "course-x", courseCode: "CSX", courseName: "Course X" };

/**
 * A lecture row shaped the way the mocked query sees it: the flat academic
 * address, its teachingAssignmentId, and the nested teachingAssignment →
 * offering → course the repository authorizes and reads the course through.
 */
const lecture = (over: {
  id: string;
  section: string;
  organizationId?: string;
  instructorId?: string;
  isActive?: boolean;
  teachingAssignmentId?: string | null;
  taInstructorId?: string;
  taActive?: boolean;
  taOrg?: string;
  offeringActive?: boolean;
  offeringOrg?: string;
  course?: typeof COURSE_X;
}) => {
  // Honor an explicit `teachingAssignmentId: null` — `??` would coalesce it.
  const taId = "teachingAssignmentId" in over ? over.teachingAssignmentId : "ta-1";
  return {
    id: over.id,
    organizationId: over.organizationId ?? ORG,
    instructorId: over.instructorId ?? INSTRUCTOR,
    isActive: over.isActive ?? true,
    faculty: "Faculty of Engineering",
    department: "Mechatronics",
    level: 2,
    semester: 1,
    section: over.section,
    teachingAssignmentId: taId,
    teachingAssignment: taId !== null
      ? {
          instructorId: over.taInstructorId ?? INSTRUCTOR,
          isActive: over.taActive ?? true,
          organizationId: over.taOrg ?? ORG,
          offering: {
            isActive: over.offeringActive ?? true,
            organizationId: over.offeringOrg ?? ORG,
            course: over.course ?? COURSE_X,
          },
        }
      : null,
  };
};

beforeEach(() => {
  dataset.rows = [];
  prisma.lectureSchedule.findMany.mockReset();
  prisma.lectureSchedule.findMany.mockImplementation(async ({ where, select }: any) => {
    const hit = dataset.rows.filter((row) => matches(row, where));
    return select ? hit.map((row) => applySelect(row, select)) : hit;
  });
});

const scopes = () =>
  new ScheduleRepository().findPublishableScopes(ORG, INSTRUCTOR);

describe("findPublishableScopes authorizes through the lecture's own assignment", () => {
  it("returns a correctly linked active lecture, course taken from the offering", async () => {
    dataset.rows = [lecture({ id: "s1", section: "A" })];

    const result = await scopes();

    expect(result).toEqual([
      {
        course: COURSE_X,
        faculty: "Faculty of Engineering",
        department: "Mechatronics",
        level: 2,
        semester: 1,
        section: "A",
      },
    ]);
  });

  it("does not authorize an unrelated cohort's lecture from a sibling assignment", async () => {
    // Cohort A is correctly linked. Cohort B is the SAME course and instructor
    // but its lecture carries no assignment of its own (legacy/stale row). The
    // old course-level gate would have let B ride on A's assignment; the direct
    // link must not.
    dataset.rows = [
      lecture({ id: "s-a", section: "A" }),
      lecture({ id: "s-b", section: "B", teachingAssignmentId: null }),
    ];

    const result = await scopes();

    expect(result.map((s) => s.section)).toEqual(["A"]);
  });

  it("excludes a lecture with a null teachingAssignmentId", async () => {
    dataset.rows = [lecture({ id: "legacy", section: "A", teachingAssignmentId: null })];
    expect(await scopes()).toEqual([]);
  });

  it("excludes a lecture whose teaching assignment is inactive", async () => {
    dataset.rows = [lecture({ id: "s1", section: "A", taActive: false })];
    expect(await scopes()).toEqual([]);
  });

  it("excludes a lecture whose offering is inactive", async () => {
    dataset.rows = [lecture({ id: "s1", section: "A", offeringActive: false })];
    expect(await scopes()).toEqual([]);
  });

  it("excludes a teaching assignment belonging to another instructor", async () => {
    dataset.rows = [lecture({ id: "s1", section: "A", taInstructorId: OTHER_INSTRUCTOR })];
    expect(await scopes()).toEqual([]);
  });

  it("excludes cross-tenant assignments and offerings", async () => {
    dataset.rows = [
      lecture({ id: "s1", section: "A", taOrg: OTHER_ORG }),
      lecture({ id: "s2", section: "B", offeringOrg: OTHER_ORG }),
    ];
    expect(await scopes()).toEqual([]);
  });

  it("returns every distinct linked lecture; the service deduplicates weekly slots", async () => {
    // Two weekly slots of the same cohort both authorize; findPublishableScopes
    // returns both rows (identical audience) and MaterialService collapses them.
    dataset.rows = [
      lecture({ id: "sun", section: "A" }),
      lecture({ id: "tue", section: "A" }),
    ];

    const result = await scopes();

    expect(result).toHaveLength(2);
    expect(result.every((s) => s.section === "A" && s.course.id === COURSE_X.id)).toBe(true);
  });
});
