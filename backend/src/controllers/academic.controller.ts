import { Request, Response } from "express";
import { AcademicService } from "../services/academic.service.js";
import type {
  AcademicTermQuery,
  CohortQuery,
  EnrollmentQuery,
  OfferingQuery,
  TeachingAssignmentQuery,
} from "../types/academic.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const service = new AcademicService();
const query = <T>(req: Request) => (req.validatedQuery ?? {}) as T;

export const listTerms = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await service.listTerms(query<AcademicTermQuery>(req), req.user!));
});

export const getTerm = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.getTerm(req.params.id as string, req.user!) });
});

export const createTerm = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await service.createTerm(req.body, req.user!) });
});

export const updateTerm = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.updateTerm(req.params.id as string, req.body, req.user!) });
});

export const listCohorts = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await service.listCohorts(query<CohortQuery>(req), req.user!));
});

export const getCohort = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.getCohort(req.params.id as string, req.user!) });
});

export const createCohort = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await service.createCohort(req.body, req.user!) });
});

export const updateCohort = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.updateCohort(req.params.id as string, req.body, req.user!) });
});

export const listOfferings = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await service.listOfferings(query<OfferingQuery>(req), req.user!));
});

export const getOffering = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.getOffering(req.params.id as string, req.user!) });
});

export const createOffering = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await service.createOffering(req.body, req.user!) });
});

export const updateOffering = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.updateOffering(req.params.id as string, req.body, req.user!) });
});

export const listTeachingAssignments = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(
    await service.listTeachingAssignments(query<TeachingAssignmentQuery>(req), req.user!)
  );
});

export const getTeachingAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    data: await service.getTeachingAssignment(req.params.id as string, req.user!),
  });
});

export const createTeachingAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await service.createTeachingAssignment(req.body, req.user!) });
});

export const updateTeachingAssignment = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    data: await service.updateTeachingAssignment(req.params.id as string, req.body, req.user!),
  });
});

export const listEnrollments = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await service.listEnrollments(query<EnrollmentQuery>(req), req.user!));
});

export const getEnrollment = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await service.getEnrollment(req.params.id as string, req.user!) });
});

export const createEnrollment = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await service.createEnrollment(req.body, req.user!) });
});

export const updateEnrollment = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    data: await service.updateEnrollment(req.params.id as string, req.body, req.user!),
  });
});
