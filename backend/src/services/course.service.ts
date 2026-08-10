import { CourseRepository } from "../repositories/course.repository.js";
import { CreateCourseInput, UpdateCourseInput } from "../types/course.types.js";
import { conflict, forbidden, notFound } from "../utils/AppError.js";

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

    async getCourse(courseId: string, organizationId: string) {
        const course = await courseRepo.findById(courseId);
        // Same error for missing and out-of-org so the API can't be used to probe other tenants
        if (!course || course.organizationId !== organizationId) {
            throw notFound("Course not found");
        }
        return course;
    }

    async getCourseWithSessions(courseId: string, organizationId: string) {
        const course = await courseRepo.findWithSessions(courseId);
        if (!course || course.organizationId !== organizationId) {
            throw notFound("Course not found");
        }
        return course;
    }

    async getMyCourses(adminId: string, organizationId: string) {
        return courseRepo.findByCreator(adminId, organizationId);
    }

    async getOrgCourses(organizationId: string) {
        return courseRepo.findByOrganization(organizationId);
    }

    async updateCourse(courseId: string, data: UpdateCourseInput, adminId: string, organizationId: string) {
        const course = await courseRepo.findById(courseId);
        if (!course || course.organizationId !== organizationId) {
            throw notFound("Course not found");
        }
        if (course.createdById !== adminId) {
            throw forbidden("Unauthorized to modify this course");
        }

        return courseRepo.update(courseId, data);
    }

    async deleteCourse(courseId: string, adminId: string, organizationId: string) {
        const course = await courseRepo.findWithSessions(courseId);
        if (!course || course.organizationId !== organizationId) {
            throw notFound("Course not found");
        }
        if (course.createdById !== adminId) {
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
