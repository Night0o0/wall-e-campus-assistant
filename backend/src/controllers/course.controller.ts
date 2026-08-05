import { Request, Response } from "express";
import { CourseService } from "../services/course.service.js";

const courseService = new CourseService();

export const createCourse = async (req: Request, res: Response) => {
    try {
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const course = await courseService.createCourse(req.body, adminId, orgId);
        res.status(201).json(course);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMyCourses = async (req: Request, res: Response) => {
    try {
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const courses = await courseService.getMyCourses(adminId, orgId);
        res.status(200).json(courses);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getOrgCourses = async (req: Request, res: Response) => {
    try {
        const orgId = req.user!.organizationId;
        const courses = await courseService.getOrgCourses(orgId);
        res.status(200).json(courses);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCourse = async (req: Request, res: Response) => {
    try {
        const courseId = req.params.id as string;
        const orgId = req.user!.organizationId;
        const course = await courseService.getCourse(courseId, orgId);
        res.status(200).json(course);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCourseWithSessions = async (req: Request, res: Response) => {
    try {
        const courseId = req.params.id as string;
        const orgId = req.user!.organizationId;
        const course = await courseService.getCourseWithSessions(courseId, orgId);
        res.status(200).json(course);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const updateCourse = async (req: Request, res: Response) => {
    try {
        const courseId = req.params.id as string;
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const course = await courseService.updateCourse(courseId, req.body, adminId, orgId);
        res.status(200).json(course);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteCourse = async (req: Request, res: Response) => {
    try {
        const courseId = req.params.id as string;
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        await courseService.deleteCourse(courseId, adminId, orgId);
        res.status(200).json({ message: "Course deleted successfully" });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
