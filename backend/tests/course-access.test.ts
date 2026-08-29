import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canExportCourse,
  canManageCourse,
} from "../src/utils/course-access.js";

/**
 * Who may edit, delete or export a course.
 *
 * The defect these tests pin down (D-10): CourseService compared createdById to
 * the caller with no role branch, so a UNIVERSITY_ADMIN could not edit or
 * delete a course somebody else had created - contradicting the documented rule
 * "Create / edit / delete any course", and contradicting the branch
 * StudentExportService had already got right. A course left behind by a
 * departed instructor was permanently uneditable by the person whose job it is
 * to administer the catalogue.
 *
 * Both policies now live in one module, and these tests exist to stop them
 * drifting apart again.
 */

const ORG_A = "org-a";

const CREATOR = { id: "instructor-1", role: "INSTRUCTOR" };
const OTHER_INSTRUCTOR = { id: "instructor-2", role: "INSTRUCTOR" };
const TEACHING_INSTRUCTOR = { id: "instructor-3", role: "INSTRUCTOR" };
const SUPER_ADMIN = { id: "super-1", role: "UNIVERSITY_ADMIN" };
const SYSTEM_OWNER = { id: "owner-1", role: "SYSTEM_OWNER" };
const DEPARTMENT_ADMIN = {
  id: "department-admin-1",
  role: "DEPARTMENT_ADMIN",
  departmentId: "department-a",
};

/** Created by CREATOR, with an active lecture taught by TEACHING_INSTRUCTOR. */
const COURSE = {
  createdById: CREATOR.id,
  departmentId: "department-a",
  lectureSchedules: [{ instructorId: TEACHING_INSTRUCTOR.id }],
};

describe("canManageCourse - who may edit or delete", () => {
  it("lets a super admin manage a course they did not create", () => {
    // The whole point of D-10.
    expect(canManageCourse(COURSE, SUPER_ADMIN)).toBe(true);
  });

  it("lets a system owner manage a course they did not create", () => {
    expect(canManageCourse(COURSE, SYSTEM_OWNER)).toBe(true);
  });

  it("does not turn course creation history into catalogue authority", () => {
    expect(canManageCourse(COURSE, CREATOR)).toBe(false);
  });

  it("refuses an instructor who neither created nor teaches it", () => {
    expect(canManageCourse(COURSE, OTHER_INSTRUCTOR)).toBe(false);
  });

  it("refuses an instructor who only TEACHES it", () => {
    // Deliberately narrower than export. Being assigned to one lecture of a
    // shared subject must not let you delete the subject from the catalogue.
    expect(canManageCourse(COURSE, TEACHING_INSTRUCTOR)).toBe(false);
  });

  it("lets a department admin manage only their linked department", () => {
    expect(canManageCourse(COURSE, DEPARTMENT_ADMIN)).toBe(true);
    expect(
      canManageCourse(COURSE, {
        ...DEPARTMENT_ADMIN,
        departmentId: "department-b",
      })
    ).toBe(false);
    expect(
      canManageCourse(COURSE, { ...DEPARTMENT_ADMIN, departmentId: null })
    ).toBe(false);
  });

  it("does not depend on lectureSchedules being loaded", () => {
    expect(canManageCourse({ createdById: CREATOR.id }, SUPER_ADMIN)).toBe(true);
    expect(canManageCourse({ createdById: CREATOR.id }, CREATOR)).toBe(false);
    expect(canManageCourse({ createdById: CREATOR.id }, OTHER_INSTRUCTOR)).toBe(
      false
    );
  });

  it("does not grant a student anything", () => {
    expect(canManageCourse(COURSE, { id: "s-1", role: "STUDENT" })).toBe(false);
  });
});

describe("canExportCourse - who may download the roster", () => {
  it("lets a super admin export any course", () => {
    expect(canExportCourse(COURSE, SUPER_ADMIN)).toBe(true);
  });

  it("lets a system owner export any course", () => {
    expect(canExportCourse(COURSE, SYSTEM_OWNER)).toBe(true);
  });

  it("lets the creating instructor export", () => {
    expect(canExportCourse(COURSE, CREATOR)).toBe(true);
  });

  it("limits a department admin export to their linked department", () => {
    expect(canExportCourse(COURSE, DEPARTMENT_ADMIN)).toBe(true);
    expect(
      canExportCourse(COURSE, {
        ...DEPARTMENT_ADMIN,
        departmentId: "department-b",
      })
    ).toBe(false);
  });

  it("lets an instructor who teaches an active lecture export", () => {
    // Wider than manage: reading the names of students you teach is not the
    // same act as deleting the subject they are enrolled in.
    expect(canExportCourse(COURSE, TEACHING_INSTRUCTOR)).toBe(true);
  });

  it("refuses an instructor with no relationship to the course", () => {
    expect(canExportCourse(COURSE, OTHER_INSTRUCTOR)).toBe(false);
  });

  it("treats an absent lectureSchedules list as no teaching assignment", () => {
    expect(
      canExportCourse({ createdById: CREATOR.id }, TEACHING_INSTRUCTOR)
    ).toBe(false);
  });
});

describe("the two policies are deliberately different", () => {
  it("export is wider than manage for a teaching instructor", () => {
    // If these two ever agree for this actor, one has been changed without
    // reading the other - the exact failure that produced D-10.
    expect(canExportCourse(COURSE, TEACHING_INSTRUCTOR)).toBe(true);
    expect(canManageCourse(COURSE, TEACHING_INSTRUCTOR)).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
/* Service wiring: the tenant check must come FIRST, then the policy.        */
/* ------------------------------------------------------------------------ */

const mocks = {
  findById: vi.fn(),
  findWithSessions: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../src/repositories/course.repository.js", () => ({
  CourseRepository: class {
    findById = mocks.findById;
    findWithSessions = mocks.findWithSessions;
    update = mocks.update;
    delete = mocks.delete;
  },
}));

const { CourseService } = await import("../src/services/course.service.js");

const IN_ORG = {
  id: "course-1",
  organizationId: ORG_A,
  createdById: CREATOR.id,
  sessions: [],
};

const IN_OTHER_ORG = { ...IN_ORG, organizationId: "org-b" };

describe("CourseService applies tenant first, then the policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ id: IN_ORG.id });
    mocks.delete.mockResolvedValue({ id: IN_ORG.id });
  });

  it("lets a super admin update a course another instructor created", async () => {
    mocks.findById.mockResolvedValue(IN_ORG);
    const service = new CourseService();

    await expect(
      service.updateCourse(IN_ORG.id, { courseName: "New" }, SUPER_ADMIN, ORG_A)
    ).resolves.toBeDefined();

    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("lets a super admin delete a course another instructor created", async () => {
    mocks.findWithSessions.mockResolvedValue(IN_ORG);
    const service = new CourseService();

    await expect(
      service.deleteCourse(IN_ORG.id, SUPER_ADMIN, ORG_A)
    ).resolves.toBeDefined();

    expect(mocks.delete).toHaveBeenCalledOnce();
  });

  it("still refuses an unrelated instructor", async () => {
    mocks.findById.mockResolvedValue(IN_ORG);
    const service = new CourseService();

    await expect(
      service.updateCourse(IN_ORG.id, { courseName: "X" }, OTHER_INSTRUCTOR, ORG_A)
    ).rejects.toThrow(/Unauthorized/);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports a course in another university as MISSING, not forbidden", async () => {
    // Tenant isolation. A super admin has full authority inside their own
    // university and none at all outside it, and the failure must not reveal
    // that the id exists elsewhere.
    mocks.findById.mockResolvedValue(IN_OTHER_ORG);
    const service = new CourseService();

    await expect(
      service.updateCourse(IN_OTHER_ORG.id, { courseName: "X" }, SUPER_ADMIN, ORG_A)
    ).rejects.toThrow(/not found/i);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports the same for delete across tenants", async () => {
    mocks.findWithSessions.mockResolvedValue(IN_OTHER_ORG);
    const service = new CourseService();

    await expect(
      service.deleteCourse(IN_OTHER_ORG.id, SUPER_ADMIN, ORG_A)
    ).rejects.toThrow(/not found/i);

    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("still refuses to delete a course with an active session", async () => {
    // Authority over the catalogue is not authority to delete a course while a
    // lecture of it is being taken.
    mocks.findWithSessions.mockResolvedValue({
      ...IN_ORG,
      sessions: [{ status: "ACTIVE" }],
    });
    const service = new CourseService();

    await expect(
      service.deleteCourse(IN_ORG.id, SUPER_ADMIN, ORG_A)
    ).rejects.toThrow(/active session/i);

    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
