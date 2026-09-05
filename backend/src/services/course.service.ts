import { CourseRepository } from "../repositories/course.repository.js";
import {
    CourseQuery,
    CreateCourseInput,
    UpdateCourseInput,
    defaultCourseQuery,
} from "../types/course.types.js";
import { conflict, forbidden, notFound } from "../utils/AppError.js";
import { paginate } from "../utils/pagination.js";
import {
    CourseActor,
    canExportCourse,
    canManageCourse,
} from "../utils/course-access.js";
import type { Prisma } from "@prisma/client";

const courseRepo = new CourseRepository();

export class CourseService {

    async createCourse(data: CreateCourseInput, adminId: string, organizationId: string) {
        // Check if course code already exists in this organization
        const existingCourse = await courseRepo.findByCode(data.courseCode, organizationId);
        if (existingCourse) {
            throw conflict("Course code already exists in this organization");
        }

        return courseRepo.create({
            ...data,
            createdById: adminId,
            organizationId,
        });
    }

    async getCourse(courseId: string, actor: CourseActor, organizationId: string) {
        const course = await courseRepo.findAccessibleById(
            courseId,
            organizationId,
            this.readScope(actor)
        );
        if (!course) {
            throw notFound("Course not found");
        }
        return this.withPermissions(course, actor);
    }

    async getCourseWithSessions(courseId: string, actor: CourseActor, organizationId: string) {
        if (
            actor.role !== "INSTRUCTOR" &&
            actor.role !== "UNIVERSITY_ADMIN" &&
            actor.role !== "SYSTEM_OWNER"
        ) {
            throw forbidden("Course session history is restricted to authorized staff");
        }

        const course = await courseRepo.findAccessibleWithSessions(
            courseId,
            organizationId,
            this.readScope(actor)
        );
        if (!course) {
            throw notFound("Course not found");
        }
        return course;
    }

    /**
     * The courses this member of staff is responsible for.
     *
     * "Assigned to OR created" - see CourseRepository.findAssignedTo. This is
     * what /courses/my now means, and what the web My Courses page now calls
     * instead of the university-wide list (D-4).
     */
    async getMyCourses(
        actor: CourseActor,
        organizationId: string,
        query: CourseQuery = defaultCourseQuery
    ) {
        const { data, total } = await courseRepo.findAssignedTo(
            actor.id,
            organizationId,
            query
        );
        return paginate(
            data.map((course) => this.withPermissions(course, actor)),
            total,
            query
        );
    }

    async getOrgCourses(
        actor: CourseActor,
        organizationId: string,
        query: CourseQuery = defaultCourseQuery
    ) {
        const { data, total } = await courseRepo.findByOrganization(
            organizationId,
            query,
            this.readScope(actor)
        );
        return paginate(
            data.map((course) => this.withPermissions(course, actor)),
            total,
            query
        );
    }

    /** Scope is derived only from the authenticated database user. */
    private readScope(actor: CourseActor): Prisma.CourseWhereInput {
        if (actor.role === "STUDENT") {
            return {
                offerings: {
                    some: {
                        enrollments: {
                            some: { studentId: actor.id, isActive: true },
                        },
                    },
                },
            };
        }

        if (actor.role === "INSTRUCTOR") {
            return {
                OR: [
                    { createdById: actor.id },
                    { lectureSchedules: { some: { instructorId: actor.id, isActive: true } } },
                    {
                        offerings: {
                            some: {
                                teachingAssignments: {
                                    some: { instructorId: actor.id, isActive: true },
                                },
                            },
                        },
                    },
                ],
            };
        }

        if (actor.role === "DEPARTMENT_ADMIN") {
            if (!actor.departmentId) {
                return { id: { in: [] } };
            }
            return { departmentId: actor.departmentId };
        }

        return {};
    }

    /**
     * Tell the client what it may do with this row.
     *
     * Without this the Courses page rendered a roster-download button on every
     * row and produced a 403 toast on the ones the caller was not assigned to
     * (D-5). Deciding it here means one source of truth - the same policy the
     * export endpoint itself enforces - rather than the client reimplementing
     * the rule and drifting from it.
     */
    private withPermissions<T extends { createdById: string; lectureSchedules?: { instructorId: string }[] }>(
        course: T,
        actor: CourseActor
    ) {
        return {
            ...course,
            canExport: canExportCourse(course, actor),
            canManage: canManageCourse(course, actor),
        };
    }

    /**
     * Edit a course.
     *
     * The tenant check comes first and reports a foreign course as MISSING, so
     * the endpoint cannot be used to discover that an id exists in another
     * university. Only then does the role policy decide.
     */
    async updateCourse(courseId: string, data: UpdateCourseInput, actor: CourseActor, organizationId: string) {
        const course = await courseRepo.findById(courseId);
        if (!course || course.organizationId !== organizationId) {
            throw notFound("Course not found");
        }
        if (!canManageCourse(course, actor)) {
            throw forbidden("Unauthorized to modify this course");
        }

        return courseRepo.update(courseId, data);
    }

    async deleteCourse(courseId: string, actor: CourseActor, organizationId: string) {
        const course = await courseRepo.findWithSessions(courseId);
        if (!course || course.organizationId !== organizationId) {
            throw notFound("Course not found");
        }
        if (!canManageCourse(course, actor)) {
            throw forbidden("Unauthorized to delete this course");
        }
        // Check if course has active sessions
        const hasActiveSessions = course.sessions.some(session => session.status === 'ACTIVE');
        if (hasActiveSessions) {
            throw conflict("Cannot delete course with active sessions");
        }

        return courseRepo.delete(courseId);
    }

}
