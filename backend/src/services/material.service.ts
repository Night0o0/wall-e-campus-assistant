import { CourseRepository } from "../repositories/course.repository.js";
import { MaterialRepository } from "../repositories/material.repository.js";
import { ScheduleRepository } from "../repositories/schedule.repository.js";
import { StudentRepository } from "../repositories/student.repository.js";
import {
  CreateMaterialInput,
  MaterialQuery,
  UpdateMaterialInput,
} from "../types/material.types.js";
import { badRequest, forbidden, notFound } from "../utils/AppError.js";
import { resolveCohort } from "../utils/cohort.js";

/**
 * Where a course's material lives.
 *
 * This service stores addresses, not files. What it is actually responsible for
 * is making sure the right cohort sees the right address, and that the person
 * publishing it had the standing to do so.
 */

/** Just enough of the authenticated user to make an authorization decision. */
export interface MaterialActor {
  id: string;
  role: string;
  organizationId: string;
}

export class MaterialService {
  constructor(
    private readonly materials = new MaterialRepository(),
    private readonly courses = new CourseRepository(),
    private readonly schedules = new ScheduleRepository(),
    private readonly students = new StudentRepository()
  ) {}

  /* -------------------------------- Student ------------------------------- */

  /**
   * The signed-in student's own material, grouped by subject.
   *
   * Takes no filters. The cohort is read off the student's own stored profile
   * through the same `resolveCohort` the timetable and the attendance scan use
   * — a student must not be able to ask for another year's folders by sending a
   * different level, and the only way to guarantee that is for the level never
   * to be a parameter.
   *
   * Grouped here rather than in the client because "my subjects" is the shape
   * of the page: a list of courses, each opening onto its links.
   */
  async listForStudent(actor: MaterialActor) {
    const profile = await this.students.findByUserId(actor.id);
    const resolution = resolveCohort(profile);

    if (!resolution.ok) {
      if (resolution.reason === "MISSING_FIELDS") {
        throw badRequest(
          "Complete your academic profile before requesting your course material",
          {
            profileStatus: profile?.status ?? "INCOMPLETE",
            missingFields: resolution.missingFields,
          }
        );
      }

      throw badRequest(
        `The semester on your profile ("${resolution.semester}") could not be read as a first or second semester — update it before requesting your course material`,
        {
          profileStatus: profile?.status ?? "INCOMPLETE",
          invalidFields: ["semester"],
        }
      );
    }

    const rows = await this.materials.findForCohort(
      actor.organizationId,
      resolution.criteria
    );

    const byCourse = new Map<
      string,
      {
        course: { id: string; courseCode: string; courseName: string };
        materials: {
          id: string;
          title: string;
          driveUrl: string;
          addedBy: { id: string; fullName: string };
          createdAt: Date;
        }[];
      }
    >();

    for (const row of rows) {
      if (!byCourse.has(row.courseId)) {
        byCourse.set(row.courseId, { course: row.course, materials: [] });
      }

      byCourse.get(row.courseId)!.materials.push({
        id: row.id,
        title: row.title,
        driveUrl: row.driveUrl,
        addedBy: row.addedBy,
        createdAt: row.createdAt,
      });
    }

    return {
      cohort: resolution.criteria,
      courses: [...byCourse.values()].sort((a, b) =>
        a.course.courseCode.localeCompare(b.course.courseCode)
      ),
    };
  }

  /* --------------------------------- Staff -------------------------------- */

  /**
   * The staff listing.
   *
   * WHO you see is decided here, from the token, not from the query string.
   *
   *   INSTRUCTOR    only links they published. The page calls this "the links you
   *            publish" and it now is. Before, the service passed the query
   *            straight through with no addedById filter, so an instructor saw
   *            every link in the university and got Edit and Withdraw buttons
   *            on colleagues' rows that loadEditable then answered 403 for
   *            (D-6).
   *
   *   SUPER    the whole university, which IS their job. They may narrow to one
   *   INSTRUCTOR    publisher by passing addedById deliberately.
   *
   * The override is applied LAST and unconditionally for an INSTRUCTOR, so a
   * hand-crafted ?addedById= cannot widen the scope - the same construction the
   * tenant clause uses.
   */
  async list(query: MaterialQuery, actor: MaterialActor) {
    const scoped =
      actor.role === "INSTRUCTOR" ? { ...query, addedById: actor.id } : query;

    return this.materials.findManyInOrganization(actor.organizationId, scoped);
  }

  /**
   * Publish a link.
   *
   * The cohort can be named two ways, and which of them a caller may use is the
   * authorization decision:
   *
   *   * `scheduleId` — the ordinary path. The address is copied off one of the
   *     instructor's own lectures, which simultaneously proves they teach the
   *     cohort. This is the only path open to a plain INSTRUCTOR.
   *
   *   * `cohort` — an explicit address, for a super admin publishing on behalf
   *     of the university. Refused for an INSTRUCTOR, because it is exactly the
   *     parameter through which an instructor could address a year they have
   *     nothing to do with.
   */
  async create(input: CreateMaterialInput, actor: MaterialActor) {
    const course = await this.courses.findById(input.courseId);

    if (!course || course.organizationId !== actor.organizationId) {
      throw notFound("Course not found");
    }

    const cohort = input.scheduleId
      ? await this.cohortFromSchedule(input.scheduleId, input.courseId, actor)
      : this.cohortFromRequest(actor, input.cohort!);

    return this.materials.create({
      organizationId: actor.organizationId,
      courseId: input.courseId,
      addedById: actor.id,
      title: input.title,
      driveUrl: input.driveUrl,
      ...cohort,
    });
  }

  async update(id: string, input: UpdateMaterialInput, actor: MaterialActor) {
    await this.loadEditable(id, actor);
    return this.materials.update(id, input);
  }

  /** Soft delete, like a schedule: it stops appearing, the record survives. */
  async deactivate(id: string, actor: MaterialActor) {
    await this.loadEditable(id, actor);
    return this.materials.update(id, { isActive: false });
  }

  /* ------------------------------ Internals ------------------------------- */

  /**
   * Reads the academic address off a lecture the caller is entitled to publish
   * for, and checks the lecture is actually for the course being published to —
   * otherwise "pick one of your lectures" would let an instructor borrow the
   * cohort of a lecture they teach to address a course they do not.
   */
  private async cohortFromSchedule(
    scheduleId: string,
    courseId: string,
    actor: MaterialActor
  ) {
    const schedule = await this.schedules.findById(scheduleId);

    if (!schedule || schedule.organizationId !== actor.organizationId) {
      throw notFound("Schedule not found");
    }

    if (schedule.courseId !== courseId) {
      throw badRequest(
        "That lecture is not for this course — pick a lecture of the course you are publishing to"
      );
    }

    if (actor.role === "INSTRUCTOR" && schedule.instructorId !== actor.id) {
      // Same wording as a missing schedule would produce, so this cannot be
      // used to discover which lectures exist.
      throw notFound("Schedule not found");
    }

    return {
      faculty: schedule.faculty,
      department: schedule.department,
      level: schedule.level,
      semester: schedule.semester,
      section: schedule.section,
    };
  }

  private cohortFromRequest(
    actor: MaterialActor,
    cohort: NonNullable<CreateMaterialInput["cohort"]>
  ) {
    if (actor.role === "INSTRUCTOR") {
      throw forbidden(
        "Publish against one of your own lectures — an instructor cannot address a cohort directly"
      );
    }

    return {
      faculty: cohort.faculty,
      department: cohort.department,
      level: cohort.level,
      semester: cohort.semester,
      section: cohort.section ?? null,
    };
  }

  /**
   * A link the caller may change.
   *
   * An INSTRUCTOR owns what they published and nothing else — one instructor must
   * not be able to re-point another's folder. A super admin administers the
   * university's material as a whole.
   */
  private async loadEditable(id: string, actor: MaterialActor) {
    const material = await this.materials.findInOrganization(
      id,
      actor.organizationId
    );

    if (!material) {
      throw notFound("Material not found");
    }

    if (actor.role === "INSTRUCTOR" && material.addedById !== actor.id) {
      throw forbidden("You can only change material you published");
    }

    return material;
  }
}
