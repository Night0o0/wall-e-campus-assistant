/**
 * Who may do what to a course.
 *
 * This exists because the same question was being answered in two places with
 * two different answers. StudentExportService worked out that a
 * UNIVERSITY_ADMIN administers their whole university and wrote the role
 * branch; CourseService was written earlier, compared `createdById` to the
 * caller with no role branch at all, and so refused a super admin the edit and
 * delete that PAGES_AND_GAPS.txt promises them ("Create / edit / delete any
 * course"). A course created by a departed instructor became permanently
 * uneditable by the person whose job it is to administer the catalogue.
 *
 * Both policies are expressed here, together, so the next person changing one
 * has to look at the other.
 *
 * THE TENANT CHECK IS NOT HERE, DELIBERATELY. Confinement to one organization
 * is not a permission, it is the shape of the whole API, and it is applied by
 * the caller before either of these is consulted — a course in another
 * university must be reported as MISSING, not forbidden, so that the endpoint
 * cannot be used to discover that an id exists somewhere else. A policy that
 * returned false for a foreign course would invite exactly the 403 that leaks
 * it. These functions assume the course is already known to be in the actor's
 * organization, and their doc comments say so.
 */

/** Roles that administer a whole university's catalogue. */
const CATALOGUE_ADMINISTRATORS = new Set(["UNIVERSITY_ADMIN", "SYSTEM_OWNER"]);

/** The caller, reduced to what an authorization decision actually needs. */
export interface CourseActor {
  id: string;
  role: string;
}

/**
 * The parts of a course either policy reads.
 *
 * `lectureSchedules` is the teaching assignment — there is no CourseInstructor
 * model — and only ACTIVE rows count, so a course dropped from this year's
 * timetable stops being "yours" the way it stops being taught.
 */
export interface CourseForAccess {
  createdById: string;
  lectureSchedules?: { instructorId: string }[];
}

/**
 * May this actor edit or delete this course?
 *
 * Assumes the course has already been confirmed to be in the actor's
 * organization.
 *
 *   - UNIVERSITY_ADMIN and SYSTEM_OWNER: any course. This is the
 *     documented rule and the defect this module was written to fix.
 *   - INSTRUCTOR: only a course they created. Teaching a course is deliberately NOT
 *     enough to delete it — an instructor assigned to one lecture of a shared
 *     subject should not be able to remove the subject from the catalogue.
 *     Note this is narrower than canExportCourse on purpose.
 */
export const canManageCourse = (
  course: CourseForAccess,
  actor: CourseActor
): boolean => {
  if (CATALOGUE_ADMINISTRATORS.has(actor.role)) {
    return true;
  }
  return course.createdById === actor.id;
};

/**
 * May this actor export this course's student roster?
 *
 * Assumes the course has already been confirmed to be in the actor's
 * organization.
 *
 *   - UNIVERSITY_ADMIN and SYSTEM_OWNER: any course.
 *   - INSTRUCTOR: a course they created, OR one they instruct an active lecture of.
 *
 * Wider than canManageCourse because reading your own students' names is not
 * the same act as deleting the subject they are enrolled in.
 */
export const canExportCourse = (
  course: CourseForAccess,
  actor: CourseActor
): boolean => {
  if (CATALOGUE_ADMINISTRATORS.has(actor.role)) {
    return true;
  }
  if (course.createdById === actor.id) {
    return true;
  }
  return (course.lectureSchedules ?? []).some(
    (schedule) => schedule.instructorId === actor.id
  );
};
