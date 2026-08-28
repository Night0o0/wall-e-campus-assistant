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
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase-auth.js";

export class UserService {
  constructor(
    private users = new UserRepository(),
    private db = prisma
  ) {}

  async list(query: UserQuery) {
    const { data, total } = await this.users.findMany(query);
    return paginate(data, total, query);
  }

  async stats() {
    const [byRole, active, inactive] = await Promise.all([
      this.users.countByRole(),
      this.users.countActive(true),
      this.users.countActive(false),
    ]);

    const admins =
      (byRole.INSTRUCTOR ?? 0) + (byRole.UNIVERSITY_ADMIN ?? 0);

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
    const user = await this.users.findByIdSafe(id);

    if (!user) {
      throw notFound("User not found");
    }

    return user;
  }

  async create(input: CreateUserInput) {
    const organization = await this.db.organization.findUnique({
      where: { id: input.organizationId },
    });

    if (!organization) {
      throw notFound("Organization not found");
    }

    const [emailTaken, universityIdTaken] = await Promise.all([
      this.users.findByEmail(input.email),
      this.users.findByUniversityId(input.universityId),
    ]);

    if (emailTaken) {
      throw conflict("Email already exists");
    }

    if (universityIdTaken) {
      throw conflict("University ID already exists");
    }

    let authUserId: string | undefined;
    let passwordHash: string | undefined;

    if (env.AUTH_PROVIDER === "legacy") {
      passwordHash = await bcrypt.hash(input.password, 10);
    } else {
      const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { fullName: input.fullName },
      });
      if (error || !data.user) {
        throw badRequest("Unable to provision the login identity");
      }
      authUserId = data.user.id;
    }

    try {
      const user = await this.users.create({
        universityId: input.universityId,
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        authUserId,
        role: input.role,
        organizationId: input.organizationId,
        accountStatus: input.isVerified ? "ACTIVE" : "PENDING",
        isVerified: input.isVerified,
        jobTitle: input.jobTitle,
        office: input.office,
      });

      return this.users.findByIdSafe(user.id);
    } catch (error) {
      if (authUserId) {
        await getSupabaseAdmin().auth.admin.deleteUser(authUserId);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserInput, actingUserId: string) {
    const user = await this.users.findById(id);

    if (!user) {
      throw notFound("User not found");
    }

    if (input.email && input.email !== user.email) {
      const emailTaken = await this.users.findByEmail(input.email);

      if (emailTaken) {
        throw conflict("Email already exists");
      }
    }

    if (input.organizationId && input.organizationId !== user.organizationId) {
      const organization = await this.db.organization.findUnique({
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

    let synchronizedEmail: string | undefined;
    if (
      env.AUTH_PROVIDER === "supabase" &&
      user.authUserId &&
      input.email &&
      input.email !== user.email
    ) {
      const { error } = await getSupabaseAdmin().auth.admin.updateUserById(
        user.authUserId,
        { email: input.email, email_confirm: true }
      );
      if (error) throw badRequest("Unable to update the login identity");
      synchronizedEmail = user.email;
    }

    try {
      await this.users.update(id, input);
    } catch (error) {
      if (synchronizedEmail && user.authUserId) {
        await getSupabaseAdmin().auth.admin.updateUserById(user.authUserId, {
          email: synchronizedEmail,
          email_confirm: true,
        });
      }
      throw error;
    }

    return this.users.findByIdSafe(id);
  }

  async resetPassword(id: string, password: string) {
    const user = await this.users.findById(id);

    if (!user) {
      throw notFound("User not found");
    }

    if (user.authUserId) {
      const { error } = await getSupabaseAdmin().auth.admin.updateUserById(
        user.authUserId,
        { password }
      );
      if (error) throw badRequest("Unable to update the login identity");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.users.updatePassword(id, passwordHash);
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw badRequest("You cannot delete your own account");
    }

    const user = await this.users.findByIdSafe(id);

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

    await this.users.delete(id);
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

    const remainingOwners = await this.db.user.count({
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
