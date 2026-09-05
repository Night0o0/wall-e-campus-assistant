import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What "My Courses" means, and what the client is told it may do (D-4, D-5).
 *
 * Two defects, one cause: the rule for which courses belong to an instructor
 * lived in the export endpoint and nowhere else.
 *
 *   D-4  getMyCourses used findByCreator - created-by only - and the web page
 *        did not call it at all. It called the university-wide list, so an
 *        instructor saw every course in the university under a heading saying
 *        "My Courses".
 *
 *   D-5  the page then rendered a roster-download button on every one of those
 *        rows, and the server answered 403 on all the ones the instructor did
 *        not teach.
 *
 * The fix makes the server answer both questions: which courses are yours, and
 * what may you do with each.
 */

const mocks = {
  findAssignedTo: vi.fn(),
  findByOrganization: vi.fn(),
};

vi.mock("../src/repositories/course.repository.js", () => ({
  CourseRepository: class {
    findAssignedTo = mocks.findAssignedTo;
    findByOrganization = mocks.findByOrganization;
  },
}));

const { CourseService } = await import("../src/services/course.service.js");

const ORG = "org-a";
const CREATOR = { id: "instructor-1", role: "INSTRUCTOR" };
const TEACHER = { id: "instructor-3", role: "INSTRUCTOR" };
const STRANGER = { id: "instructor-9", role: "INSTRUCTOR" };
const SUPER_ADMIN = { id: "super-1", role: "UNIVERSITY_ADMIN" };
const QUERY = { page: 1, limit: 100, sortOrder: "desc" as const };

/** Created by CREATOR, taught by TEACHER. */
const COURSE = {
  id: "course-1",
  organizationId: ORG,
  createdById: CREATOR.id,
  lectureSchedules: [{ instructorId: TEACHER.id }],
};

describe("getMyCourses asks for assigned-OR-created", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAssignedTo.mockResolvedValue({ data: [COURSE], total: 1 });
  });

  it("no longer uses the created-by-only query", async () => {
    const service = new CourseService();
    await service.getMyCourses(TEACHER, ORG);

    // The whole of D-4: an instructor who teaches a course but did not create
    // it must still see it here.
    expect(mocks.findAssignedTo).toHaveBeenCalledWith(TEACHER.id, ORG, QUERY);
  });

  it("scopes the query to the caller's own organization", async () => {
    const service = new CourseService();
    await service.getMyCourses(CREATOR, ORG);

    expect(mocks.findAssignedTo).toHaveBeenCalledWith(CREATOR.id, ORG, QUERY);
  });
});

describe("every listing tells the client what it may do", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAssignedTo.mockResolvedValue({ data: [COURSE], total: 1 });
    mocks.findByOrganization.mockResolvedValue({ data: [COURSE], total: 1 });
  });

  it("grants export to the instructor who teaches it", async () => {
    const service = new CourseService();
    const course = (await service.getMyCourses(TEACHER, ORG)).data[0]!;

    expect(course.canExport).toBe(true);
    // Teaching is not owning: they must not get the delete button.
    expect(course.canManage).toBe(false);
  });

  it("lets a creating instructor export but not mutate the catalogue", async () => {
    const service = new CourseService();
    const course = (await service.getMyCourses(CREATOR, ORG)).data[0]!;

    expect(course.canExport).toBe(true);
    expect(course.canManage).toBe(false);
  });

  it("grants both to a super admin on the university-wide list", async () => {
    const service = new CourseService();
    const course = (await service.getOrgCourses(SUPER_ADMIN, ORG, QUERY)).data[0]!;

    expect(course.canExport).toBe(true);
    expect(course.canManage).toBe(true);
  });

  it("denies an instructor with no relationship to the course", async () => {
    // This is the row that used to render a download button and then 403.
    const service = new CourseService();
    const course = (await service.getOrgCourses(STRANGER, ORG, QUERY)).data[0]!;

    expect(course.canExport).toBe(false);
    expect(course.canManage).toBe(false);
  });

  it("keeps the rest of the course row intact", async () => {
    const service = new CourseService();
    const course = (await service.getOrgCourses(SUPER_ADMIN, ORG, QUERY)).data[0]!;

    expect(course.id).toBe(COURSE.id);
    expect(course.createdById).toBe(CREATOR.id);
  });

  it("agrees with the policy the export endpoint enforces", async () => {
    // The flags exist so the button matches the answer. If these ever diverge
    // the button is lying again, which is exactly D-5.
    const { canExportCourse } = await import("../src/utils/course-access.js");
    const service = new CourseService();

    for (const actor of [CREATOR, TEACHER, STRANGER, SUPER_ADMIN]) {
      const course = (await service.getOrgCourses(actor, ORG, QUERY)).data[0]!;
      expect(course.canExport).toBe(canExportCourse(COURSE, actor));
    }
  });

  it("passes an instructor-derived scope to the university course query", async () => {
    const service = new CourseService();
    await service.getOrgCourses(TEACHER, ORG, QUERY);

    expect(mocks.findByOrganization).toHaveBeenCalledWith(
      ORG,
      QUERY,
      expect.objectContaining({ OR: expect.any(Array) })
    );
  });

  it("passes an enrollment-derived scope for a student", async () => {
    const service = new CourseService();
    await service.getOrgCourses({ id: "student-1", role: "STUDENT" }, ORG, QUERY);

    expect(mocks.findByOrganization).toHaveBeenCalledWith(
      ORG,
      QUERY,
      expect.objectContaining({ offerings: expect.any(Object) })
    );
  });

  it("passes only the trusted department id for a department admin", async () => {
    const service = new CourseService();
    await service.getOrgCourses(
      { id: "department-admin-1", role: "DEPARTMENT_ADMIN", departmentId: "department-a" },
      ORG,
      { ...QUERY, department: "client-supplied-other-department" }
    );

    expect(mocks.findByOrganization).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        page: 1,
        limit: 100,
        sortOrder: "desc",
        department: "client-supplied-other-department",
      }),
      { departmentId: "department-a" }
    );
  });

  it("returns pagination metadata for the client", async () => {
    const service = new CourseService();
    const result = await service.getOrgCourses(SUPER_ADMIN, ORG, QUERY);

    expect(result.meta).toMatchObject({
      page: 1,
      limit: 100,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });
});
