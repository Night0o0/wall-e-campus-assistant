import { ProfileStatus } from "@prisma/client";
import {
  StudentRepository,
  StudentProfileWithUser,
} from "../repositories/student.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import {
  REQUIRED_PROFILE_FIELDS,
  RequiredProfileField,
  UpdateStudentProfileInput,
} from "../types/student.types.js";
import { forbidden, notFound } from "../utils/AppError.js";

const studentRepo = new StudentRepository();
const userRepo = new UserRepository();

/** A @db.Date column is stored at UTC midnight; emit the calendar day only. */
const toDateString = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

const isFilled = (value: unknown) =>
  value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");

export class StudentService {
  /**
   * The profile is created at registration, but students who registered before
   * this feature existed have none — create the shell on first read rather than
   * making them hit a 404 they cannot fix.
   */
  async getMyProfile(userId: string) {
    return this.present(await this.loadOrCreate(userId));
  }

  async updateMyProfile(userId: string, input: UpdateStudentProfileInput) {
    const current = await this.loadOrCreate(userId);

    // Completion is judged on the merged result, so a student can fill the
    // profile in over several requests and still flip to COMPLETED on the last.
    const merged = { ...current, ...input };
    const status = this.deriveStatus(merged);

    const completedAt =
      status === ProfileStatus.COMPLETED
        ? (current.completedAt ?? new Date())
        : null;

    const updated = await studentRepo.update(userId, {
      ...input,
      status,
      completedAt,
    });

    return this.present(updated);
  }

  private async loadOrCreate(userId: string) {
    const existing = await studentRepo.findByUserId(userId);

    if (existing) {
      return existing;
    }

    const user = await userRepo.findById(userId);

    if (!user) {
      throw notFound("User not found");
    }

    // Only students carry an academic profile; nothing should silently create
    // one for an admin or owner account.
    if (user.role !== "STUDENT") {
      throw forbidden("Only students have an academic profile");
    }

    return studentRepo.create(userId);
  }

  private missingFields(
    profile: Record<string, unknown>
  ): RequiredProfileField[] {
    return REQUIRED_PROFILE_FIELDS.filter(
      (field) => !isFilled(profile[field])
    );
  }

  private deriveStatus(profile: Record<string, unknown>): ProfileStatus {
    return this.missingFields(profile).length === 0
      ? ProfileStatus.COMPLETED
      : ProfileStatus.INCOMPLETE;
  }

  private present(profile: StudentProfileWithUser) {
    const { user, ...rest } = profile;

    return {
      id: rest.id,
      userId: rest.userId,

      // Identity, read from User — not duplicated onto the profile.
      universityId: user.universityId,
      fullName: user.fullName,
      email: user.email,
      organizationId: user.organizationId,

      faculty: rest.faculty,
      department: rest.department,
      level: rest.level,
      semester: rest.semester,
      section: rest.section,
      groupName: rest.groupName,
      academicYear: rest.academicYear,

      phoneNumber: rest.phoneNumber,
      nationalId: rest.nationalId,
      dateOfBirth: toDateString(rest.dateOfBirth),

      status: rest.status,
      completedAt: rest.completedAt,
      missingFields: this.missingFields(rest),

      dataSource: rest.dataSource,
      externalStudentId: rest.externalStudentId,
      lastSyncedAt: rest.lastSyncedAt,

      createdAt: rest.createdAt,
      updatedAt: rest.updatedAt,
    };
  }
}
