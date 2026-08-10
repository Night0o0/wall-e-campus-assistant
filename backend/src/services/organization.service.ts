import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { OrganizationRepository } from "../repositories/organization.repository.js";
import {
  CreateOrganizationInput,
  OrganizationQuery,
  UpdateOrganizationInput,
} from "../types/organization.types.js";
import { conflict, notFound, badRequest } from "../utils/AppError.js";
import { paginate } from "../utils/pagination.js";

const orgRepo = new OrganizationRepository();

/** Empty strings from optional form fields should be stored as null. */
const blankToNull = <T extends Record<string, unknown>>(data: T) => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value === "" ? null : value;
  }
  return out as T;
};

export class OrganizationService {
  async list(query: OrganizationQuery) {
    const { data, total } = await orgRepo.findMany(query);

    const revenue = await orgRepo.revenueByOrganization(
      data.map((org) => org.id)
    );

    const enriched = data.map((org) => ({
      ...org,
      revenue: revenue.get(org.id) ?? 0,
      planName: org.subscription?.plan.name ?? null,
      status: org.subscription?.status ?? "NONE",
    }));

    return paginate(enriched, total, query);
  }

  async getById(id: string) {
    const organization = await orgRepo.findById(id);

    if (!organization) {
      throw notFound("Organization not found");
    }

    const [revenue, userBreakdown] = await Promise.all([
      orgRepo.revenueByOrganization([id]),
      orgRepo.userBreakdown(id),
    ]);

    return {
      ...organization,
      revenue: revenue.get(id) ?? 0,
      userBreakdown,
      planName: organization.subscription?.plan.name ?? null,
      status: organization.subscription?.status ?? "NONE",
    };
  }

  async create(input: CreateOrganizationInput) {
    const existing = await orgRepo.findByCode(input.code);

    if (existing) {
      throw conflict(`An organization with code ${input.code} already exists`);
    }

    const { admin, ...orgData } = input;

    if (admin) {
      const [emailTaken, universityIdTaken] = await Promise.all([
        prisma.user.findUnique({ where: { email: admin.email } }),
        prisma.user.findUnique({ where: { universityId: admin.universityId } }),
      ]);

      if (emailTaken) {
        throw conflict("Admin email already exists");
      }

      if (universityIdTaken) {
        throw conflict("Admin university ID already exists");
      }
    }

    // Organization and its first admin must both exist, or neither.
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: blankToNull(orgData),
      });

      if (admin) {
        await tx.user.create({
          data: {
            universityId: admin.universityId,
            fullName: admin.fullName,
            email: admin.email,
            passwordHash: await bcrypt.hash(admin.password, 10),
            role: "UNIVERSITY_SUPER_ADMIN",
            isVerified: true,
            organizationId: organization.id,
          },
        });
      }

      return tx.organization.findUniqueOrThrow({
        where: { id: organization.id },
        include: {
          subscription: { include: { plan: true } },
          _count: {
            select: { users: true, courses: true, sessions: true, invoices: true },
          },
        },
      });
    });
  }

  async update(id: string, input: UpdateOrganizationInput) {
    const existing = await orgRepo.findById(id);

    if (!existing) {
      throw notFound("Organization not found");
    }

    return orgRepo.update(id, blankToNull(input));
  }

  async remove(id: string) {
    const organization = await orgRepo.findById(id);

    if (!organization) {
      throw notFound("Organization not found");
    }

    // Deleting an org with members would orphan their data; make the operator
    // clear it out first rather than cascading silently.
    if (organization._count.users > 0) {
      throw badRequest(
        `Cannot delete an organization with ${organization._count.users} user(s). Remove its users first.`
      );
    }

    if (organization._count.invoices > 0 || organization._count.payments > 0) {
      throw badRequest(
        "Cannot delete an organization that has billing history. Cancel its subscription instead."
      );
    }

    await orgRepo.delete(id);
  }
}
