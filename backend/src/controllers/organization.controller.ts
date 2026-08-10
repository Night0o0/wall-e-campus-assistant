import { Request, Response } from "express";
import { OrganizationService } from "../services/organization.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";
import { OrganizationQuery } from "../types/organization.types.js";

const organizationService = new OrganizationService();

export const listOrganizations = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await organizationService.list(
      req.validatedQuery as OrganizationQuery
    );
    res.status(200).json(serialize(result));
  }
);

export const getOrganization = asyncHandler(
  async (req: Request, res: Response) => {
    const organization = await organizationService.getById(
      req.params.id as string
    );
    res.status(200).json(serialize(organization));
  }
);

export const createOrganization = asyncHandler(
  async (req: Request, res: Response) => {
    const organization = await organizationService.create(req.body);
    res.status(201).json(serialize(organization));
  }
);

export const updateOrganization = asyncHandler(
  async (req: Request, res: Response) => {
    const organization = await organizationService.update(
      req.params.id as string,
      req.body
    );
    res.status(200).json(serialize(organization));
  }
);

export const deleteOrganization = asyncHandler(
  async (req: Request, res: Response) => {
    await organizationService.remove(req.params.id as string);
    res.status(200).json({ message: "Organization deleted successfully" });
  }
);
