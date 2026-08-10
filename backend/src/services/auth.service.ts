import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository.js";
import { env } from "../config/env.js";
import { conflict, notFound, unauthorized, badRequest } from "../utils/AppError.js";

const SALT_ROUNDS = 10;

export class AuthService {
  private userRepository = new UserRepository();

  async register(data: {
    universityId: string;
    fullName: string;
    email: string;
    password: string;
    organizationCode: string;
  }) {
    const organization = await this.userRepository.findOrganizationByCode(
      data.organizationCode
    );

    if (!organization) {
      throw notFound("Organization not found");
    }

    const existingUniversityId = await this.userRepository.findByUniversityId(
      data.universityId
    );

    if (existingUniversityId) {
      throw conflict("University ID already exists");
    }

    const existingUser = await this.userRepository.findByEmail(data.email);

    if (existingUser) {
      throw conflict("Email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    return this.userRepository.create({
      universityId: data.universityId,
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      role: "STUDENT",
      organizationId: organization.id,
    });
  }

  async login(data: { email: string; password: string }) {
    const user = await this.userRepository.findByEmail(data.email);

    if (!user) {
      throw unauthorized("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw unauthorized("This account has been deactivated");
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
    );

    return {
      token,
      user: {
        id: user.id,
        universityId: user.universityId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        isActive: user.isActive,
        organizationId: user.organizationId,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findByIdWithOrganization(userId);

    if (!user) {
      throw notFound("User not found");
    }

    return {
      id: user.id,
      universityId: user.universityId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive,
      organizationId: user.organizationId,
      organization: user.organization,
      createdAt: user.createdAt,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw notFound("User not found");
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw badRequest("Current password is incorrect");
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

    if (isSamePassword) {
      throw badRequest("New password must be different from the current one");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.userRepository.updatePassword(userId, passwordHash);
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string; email?: string }
  ) {
    if (data.email) {
      const existing = await this.userRepository.findByEmail(data.email);

      if (existing && existing.id !== userId) {
        throw conflict("Email already in use");
      }
    }

    const user = await this.userRepository.update(userId, data);

    return {
      id: user.id,
      universityId: user.universityId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive,
      organizationId: user.organizationId,
    };
  }
}
