import { Request, Response } from "express";
import { CourseService } from "../services/course.service.js";
import { CourseQuery } from "../types/course.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const courseService = new CourseService();

export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await courseService.createCourse(
    req.body,
    req.user!.id,
    req.user!.organizationId
  );
  res.status(201).json(course);
});

export const getMyCourses = asyncHandler(async (req: Request, res: Response) => {
  const courses = await courseService.getMyCourses(
    req.user!.id,
    req.user!.organizationId
  );
  res.status(200).json(courses);
});

export const getOrgCourses = asyncHandler(
  async (req: Request, res: Response) => {
    const courses = await courseService.getOrgCourses(
      req.user!.organizationId,
      (req.validatedQuery ?? {}) as CourseQuery
    );

    res.status(200).json(courses);
  }
);

export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await courseService.getCourse(
    req.params.id as string,
    req.user!.organizationId
  );
  res.status(200).json(course);
});

export const getCourseWithSessions = asyncHandler(
  async (req: Request, res: Response) => {
    const course = await courseService.getCourseWithSessions(
      req.params.id as string,
      req.user!.organizationId
    );
    res.status(200).json(course);
  }
);

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await courseService.updateCourse(
    req.params.id as string,
    req.body,
    req.user!.id,
    req.user!.organizationId
  );
  res.status(200).json(course);
});

export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  await courseService.deleteCourse(
    req.params.id as string,
    req.user!.id,
    req.user!.organizationId
  );
  res.status(200).json({ message: "Course deleted successfully" });
});
