import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a session projection actually SENDS.
 *
 * D-1 and D-3. Three of the four session projections included lectureSchedule
 * but not course, so /sessions and /sessions/:id never sent a `course` at all.
 * The web pages read session.course and fell back to "Ad-hoc session - no
 * course behind it", which meant EVERY session was mislabelled ad-hoc for both
 * staff roles, including ones opened straight from a lecture.
 *
 * Nothing caught it. The backend suite was green because it tests service
 * logic, not response shape; the web build was green because CampusSession
 * declared `course` optional, so a server that never sends it type-checks
 * perfectly. That is the whole class of defect: a contract both sides agree
 * about in writing and disagree about in fact.
 *
 * These tests assert the include object handed to Prisma, so a projection that
 * silently drops `course` fails here rather than in a user's browser.
 */

const calls: { model: string; method: string; args: any }[] = [];

const record = (model: string, method: string) => (args: any) => {
  calls.push({ model, method, args });
  return Promise.resolve([]);
};

vi.mock("../src/lib/prisma.js", () => ({
  default: {
    session: {
      findUnique: record("session", "findUnique"),
      findMany: record("session", "findMany"),
      findFirst: record("session", "findFirst"),
      // The list projections are paginated, so they issue a count alongside
      // the findMany. Not what these tests assert, but they will not run
      // without it.
      count: () => Promise.resolve(0),
    },
  },
}));

const { SessionRepository } = await import(
  "../src/repositories/session.repository.js"
);

/** The include of the last findMany or findUnique - never the count. */
const lastInclude = () =>
  calls.filter((call) => call.method !== "count").at(-1)?.args?.include;

/** The shape every session projection must name a course with. */
const COURSE_SUMMARY = {
  select: { id: true, courseCode: true, courseName: true },
};

describe("every session projection a client reads includes the course", () => {
  let repo: InstanceType<typeof SessionRepository>;

  beforeEach(() => {
    calls.length = 0;
    repo = new SessionRepository();
  });

  it("findById - GET /api/sessions/:id (D-3)", async () => {
    await repo.findById("session-1");
    expect(lastInclude()).toHaveProperty("course");
    expect(lastInclude().course).toEqual(COURSE_SUMMARY);
  });

  it("findByOrganization - GET /api/sessions for a super admin (D-1)", async () => {
    await repo.findByOrganization("org-a");
    expect(lastInclude()).toHaveProperty("course");
    expect(lastInclude().course).toEqual(COURSE_SUMMARY);
  });

  it("findByCreator - GET /api/sessions for an instructor (D-1)", async () => {
    await repo.findByCreator("instructor-1", "org-a");
    expect(lastInclude()).toHaveProperty("course");
    expect(lastInclude().course).toEqual(COURSE_SUMMARY);
  });

  it("names the course identically everywhere", async () => {
    // The robot's screen, the instructor's list and the super admin's list must
    // not be able to describe the same course with different fields.
    calls.length = 0;
    await repo.findById("session-1");
    await repo.findByOrganization("org-a");
    await repo.findByCreator("instructor-1", "org-a");

    const shapes = calls
      .filter((call) => call.args?.include)
      .map((call) => call.args.include.course);
    for (const shape of shapes) {
      expect(shape).toEqual(COURSE_SUMMARY);
    }
  });

  it("still carries the lecture behind the session", async () => {
    // course was ADDED alongside lectureSchedule, not swapped for it. The
    // schedule is what says which timetable slot this occurrence belongs to.
    await repo.findByOrganization("org-a");
    expect(lastInclude()).toHaveProperty("lectureSchedule");
  });

  it("keeps createdBy on the super admin list", async () => {
    // Drives the "Opened by" column, which only that role sees.
    await repo.findByOrganization("org-a");
    expect(lastInclude()).toHaveProperty("createdBy");
  });
});
