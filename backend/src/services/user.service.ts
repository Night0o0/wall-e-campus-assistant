import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { UserRepository } from "../repositories/user.repository.js";
import {
  CreateUserInput,
  UpdateUserInput,
  UserQuery,
} from "../types/user.types.js";
import { badRequest, conflict, notFound } from "../utils/AppError.js";
import { paginate } from "../utils/pagination.js";

const userRepo = new UserRepository();

export class UserService {
  async list(query: UserQuery) {
    const { data, total } = await userRepo.findMany(query);
    return paginate(data, total, query);
  }

  async stats() {
    const [byRole, active, inactive] = await Promise.all([
      userRepo.countByRole(),
      userRepo.countActive(true),
      userRepo.countActive(false),
    ]);

    const admins =
      (byRole.ADMIN ?? 0) + (byRole.UNIVERSITY_SUPER_ADMIN ?? 0);

    return {
      total: active + inactive,
      active,
      inactive,
      admins,
      students: byRole.STUDENT ?? 0,
      owners: byRole.SYSTEM_OWNER ?? 0,
      byRole,
    };
  }

  async getById(id: string) {
    const user = await userRepo.findByIdSafe(id);

    if (!user) {
      throw notFound("User not found");
    }

    return user;
  }

  async create(input: CreateUserInput) {
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
    });

    if (!organization) {
      throw notFound("Organization not found");
    }

    const [emailTaken, universityIdTaken] = await Promise.all([
      userRepo.findByEmail(input.email),
      userRepo.findByUniversityId(input.universityId),
    ]);

    if (emailTaken) {
      throw conflict("Email already exists");
    }

    if (universityIdTaken) {
      throw conflict("University ID already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await userRepo.create({
      universityId: input.universityId,
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      role: input.role,
      organizationId: input.organizationId,
      isVerified: input.isVerified,
      jobTitle: input.jobTitle,
      office: input.office,
    });

    return userRepo.findByIdSafe(user.id);
  }

  async update(id: string, input: UpdateUserInput, actingUserId: string) {
    const user = await userRepo.findById(id);

    if (!user) {
      throw notFound("User not found");
    }

    if (input.email && input.email !== user.email) {
      const emailTaken = await userRepo.findByEmail(input.email);

      if (emailTaken) {
        throw conflict("Email already exists");
      }
    }

    if (input.organizationId && input.organizationId !== user.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: input.organizationId },
      });

      if (!organization) {
        throw notFound("Organization not found");
      }
    }

    // Guard against an owner locking themselves out of the platform. Roles are
    // immutable after creation, so self-demotion is not a possible edit.
    if (id === actingUserId) {
      if (input.isActive === false) {
        throw badRequest("You cannot deactivate your own account");
      }
    }

    await this.assertNotLastOwner(user.id, user.role, input);

    await userRepo.update(id, input);

    return userRepo.findByIdSafe(id);
  }

  async resetPassword(id: string, password: string) {
    const user = await userRepo.findById(id);

    if (!user) {
      throw notFound("User not found");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await userRepo.updatePassword(id, passwordHash);
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw badRequest("You cannot delete your own account");
    }

    const user = await userRepo.findByIdSafe(id);

    if (!user) {
      throw notFound("User not found");
    }

    await this.assertNotLastOwner(user.id, user.role, { isActive: false });

    // Attendance and authored content reference the user; make the operator
    // deal with it explicitly instead of silently cascading.
    if (
      user._count.attendances > 0 ||
      user._count.createdCourses > 0 ||
      user._count.createdSessions > 0
    ) {
      throw badRequest(
        "This user has attendance or course history. Deactivate the account instead of deleting it."
      );
    }

    await userRepo.delete(id);
  }

  /** The platform must always retain at least one active SYSTEM_OWNER. */
  private async assertNotLastOwner(
    userId: string,
    currentRole: string,
    input: Pick<UpdateUserInput, "isActive">
  ) {
    if (currentRole !== "SYSTEM_OWNER") return;

    const losingOwnerStatus = input.isActive === false;

    if (!losingOwnerStatus) return;

    const remainingOwners = await prisma.user.count({
      where: {
        role: "SYSTEM_OWNER",
        isActive: true,
        id: { not: userId },
      },
    });

    if (remainingOwners === 0) {
      throw badRequest(
        "This is the last active system owner. Create another owner first."
      );
    }
  }
}
