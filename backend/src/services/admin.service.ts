import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import {
  accountApprovedContent,
  accountRejectedContent,
} from "./notification.content.js";
import {
  AdminUserQuery,
  CreateCampusUserInput,
  PendingStudentQuery,
  UpdateCampusUserInput,
} from "../types/admin.types.js";
import { badRequest, conflict, notFound } from "../utils/AppError.js";
import { partsInZone, zonedTimeToUtc } from "../utils/occurrence.util.js";
import { paginate } from "../utils/pagination.js";
import { getSupabaseAdmin } from "../lib/supabase-auth.js";
import prisma from "../lib/prisma.js";

const SALT_ROUNDS = 10;

/**
 * The university administration console: one university's own dashboard and its
 * own user directory.
 *
 * These exist as separate endpoints rather than as relaxed guards on
 * /api/metrics/overview and /api/users, and the distinction is the whole point.
 * Those two are platform-owner surfaces: the metrics one aggregates across every
 * university on the platform, and the user one takes its organization from a
 * client-supplied query parameter. Opening either to a university super admin
 * would hand them other universities' data. Everything below is scoped to the
 * caller's own organization, taken from the token-backed user record.
 */

/** Just enough of the authenticated user to scope a query. */
export interface AdminActor {
  id: string;
  role: string;
  organizationId: string;
  // Optional keeps service-level test doubles and legacy internal callers
  // honest: absence is treated exactly like an unassigned account, never as a
  // wider scope.
  departmentId?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class AdminService {
  constructor(
    private readonly admin = new AdminRepository(),
    private readonly users = new UserRepository(),
    private readonly timeZone: string = env.campusTimeZone
  ) {}

  /** The university's dashboard. Every figure is that university's alone. */
  async getOverview(actor: AdminActor) {
    const organization = await this.admin.findOrganization(actor.organizationId);

    // The token was accepted, so the user exists; a missing organization means
    // the tenant was deleted underneath them.
    if (!organization) {
      throw notFound("Organization not found");
    }

    const window = this.currentWindow();

    const counts = await this.admin.organizationOverview(
      actor.organizationId,
      window
    );

    return {
      organization,
      people: {
        activeStudents: counts.activeStudents,
        inactiveStudents: counts.inactiveStudents,
        staff: counts.staff,
        // Students who registered but never finished their academic profile.
        // They receive no timetable and no reminders, so this is the number
        // worth acting on.
        incompleteProfiles: counts.incompleteProfiles,
      },
      academics: {
        courses: counts.courses,
        activeLectures: counts.activeLectures,
      },
      sessions: {
        today: counts.sessionsToday,
        active: counts.activeSessions,
        closedThisWeek: counts.sessionsClosedThisWeek,
      },
      attendance: {
        scansThisWeek: counts.scansThisWeek,
        // Not a percentage. A rate needs a denominator — how many students were
        // expected — and with no enrollment model in the schema that number
        // would have to be re-derived per session from cohort matching, which is
        // both expensive and a guess. This is a measurement rather than an
        // estimate.
        averageAttendeesPerSession:
          counts.sessionsClosedThisWeek === 0
            ? null
            : Number(
                (counts.scansThisWeek / counts.sessionsClosedThisWeek).toFixed(1)
              ),
      },
      window: {
        timeZone: this.timeZone,
        weekStartedAt: window.startOfWeek,
      },
    };
  }

  /**
   * The university's user directory.
   *
   * The tenant is passed as its own argument, and the query type it is passed
   * alongside has no organizationId field to compete with it.
   */
  async listUsers(query: AdminUserQuery, actor: AdminActor) {
    const { data, total } = await this.users.findManyInOrganization(
      actor.organizationId,
      query
    );

    return paginate(data.map((user) => this.present(user)), total, query);
  }

  /* --------------------------- Student approval --------------------------- */

  /**
   * Students who have registered and are waiting to be let in.
   *
   * Open to a plain INSTRUCTOR as well as a super admin, and that is the point of
   * the feature: vetting a first-year who has just signed up is routine
   * teaching-staff work, not university administration. The route guard admits
   * both; the tenant still comes from the token either way.
   */
  async listPendingStudents(query: PendingStudentQuery, actor: AdminActor) {
    const cohortIds = await this.approvalCohortIds(actor);
    const { data, total } = await this.users.findPendingStudentsInOrganization(
      actor.organizationId,
      query,
      cohortIds
    );

    return paginate(
      data.map((user) => this.presentPending(user)),
      total,
      query
    );
  }

  /**
   * Let a student in.
   *
   * Idempotent by choice rather than by accident: approving an already-approved
   * student is a no-op that returns the same body, because two members of staff
   * working the same queue is the expected case, and the second one should not
   * be shown an error for agreeing with the first.
   */
  async approveStudent(studentId: string, actor: AdminActor) {
    const student = await this.loadPendingCandidate(studentId, actor);

    if (student.isVerified) {
      return { id: student.id, isVerified: true, alreadyApproved: true };
    }

    const updated = await this.decide(student.id, student.organizationId, {
      // Stamped together with the flag, never separately: an approval that
      // records no approver is the thing the audit columns exist to prevent.
      data: {
        isVerified: true,
        accountStatus: "ACTIVE",
        verifiedAt: new Date(),
        verifiedBy: { connect: { id: actor.id } },
      },
      type: "ACCOUNT_APPROVED",
      render: accountApprovedContent,
    });

    return {
      id: updated.id,
      fullName: updated.fullName,
      universityId: updated.universityId,
      isVerified: updated.isVerified,
      alreadyApproved: false,
    };
  }

  /**
   * Turn a student away.
   *
   * Deactivation rather than deletion. A rejected registration is still a
   * record that somebody tried to register with this university ID, and
   * deleting the row would free that ID for whoever claimed it next — the
   * unique constraint on User.universityId is the only thing stopping a second
   * person from registering as the first. `isActive: false` stops the account
   * at `authenticate` on its very next request.
   */
  async rejectStudent(studentId: string, actor: AdminActor) {
    const student = await this.loadPendingCandidate(studentId, actor);

    if (student.isVerified) {
      throw badRequest(
        "This student has already been approved. Deactivate the account instead."
      );
    }

    const updated = await this.decide(student.id, student.organizationId, {
      data: { isActive: false, accountStatus: "REJECTED" },
      type: "ACCOUNT_REJECTED",
      render: accountRejectedContent,
    });

    return {
      id: updated.id,
      fullName: updated.fullName,
      universityId: updated.universityId,
      isActive: updated.isActive,
    };
  }

  /**
   * Write a decision about a registration, and tell the student in the same
   * transaction — see UserRepository.updateWithNotification for why the two
   * cannot be separate writes.
   *
   * The university's name is read before the transaction rather than inside it.
   * It is display copy for one message; holding a transaction open across an
   * extra round trip to render a sentence would be a worse trade than the
   * vanishingly unlikely case of the name changing in between.
   */
  private async decide(
    studentId: string,
    organizationId: string,
    decision: {
      data: Prisma.UserUpdateInput;
      type: "ACCOUNT_APPROVED" | "ACCOUNT_REJECTED";
      render: (organizationName: string) => { title: string; body: string };
    }
  ) {
    const organizationName =
      (await this.users.findOrganizationName(organizationId)) ??
      "your university";

    const content = decision.render(organizationName);

    return this.users.updateWithNotification(studentId, decision.data, {
      organizationId,
      type: decision.type,
      title: content.title,
      body: content.body,
    });
  }

  /* ------------------------ Campus account management --------------------- */

  /** One account in the caller's own university. */
  async getUser(userId: string, actor: AdminActor) {
    const user = await this.users.findInOrganization(
      userId,
      actor.organizationId
    );

    if (!user) {
      throw notFound("User not found");
    }

    return user;
  }

  /**
   * Create a member of staff or a student inside the caller's own university.
   *
   * The role is constrained by the schema to INSTRUCTOR or STUDENT — see
   * createCampusUserSchema — so nothing here can mint a super admin or an
   * owner. The organization is taken from the actor and is not a parameter.
   */
  async createUser(input: CreateCampusUserInput, actor: AdminActor) {
    const [byEmail, byUniversityId] = await Promise.all([
      this.users.findByEmail(input.email),
      this.users.findByUniversityId(input.universityId),
    ]);

    // Both columns are globally unique, so these collisions can cross tenants.
    // The message says which field clashed and nothing about who holds it.
    if (byEmail) {
      throw conflict("Email already exists");
    }

    if (byUniversityId) {
      throw conflict("University ID already exists");
    }

    let authUserId: string | undefined;
    let passwordHash: string | undefined;

    if (env.AUTH_PROVIDER === "legacy") {
      passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
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
      return await this.users.createInOrganization({
        authUserId,
        universityId: input.universityId,
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: input.role,
        organizationId: actor.organizationId,
        // An account an administrator created by hand needs no second approval:
        // the decision was made at the moment of creation. Only self-registration
        // produces a pending student.
        accountStatus: "ACTIVE",
        isVerified: true,
        departmentId: input.departmentId,
        jobTitle: input.jobTitle,
        office: input.office,
      });
    } catch (error) {
      if (authUserId) {
        await getSupabaseAdmin().auth.admin.deleteUser(authUserId);
      }
      throw error;
    }
  }

  async updateUser(
    userId: string,
    input: UpdateCampusUserInput,
    actor: AdminActor
  ) {
    const existing = await this.requireInOrganization(userId, actor);
    let synchronizedIdentity:
      | { authUserId: string; previousEmail: string }
      | undefined;

    if (input.email && input.email !== existing.email) {
      const clash = await this.users.findByEmail(input.email);

      if (clash && clash.id !== userId) {
        throw conflict("Email already in use");
      }

      if (env.AUTH_PROVIDER === "supabase") {
        const identity = await this.users.findAuthUserIdInOrganization(
          userId,
          actor.organizationId
        );
        if (identity?.authUserId) {
          const { error } = await getSupabaseAdmin().auth.admin.updateUserById(
            identity.authUserId,
            { email: input.email, email_confirm: true }
          );
          if (error) throw badRequest("Unable to update the login identity");
          synchronizedIdentity = {
            authUserId: identity.authUserId,
            previousEmail: existing.email,
          };
        }
      }
    }

    const { jobTitle, office, ...userFields } = input;

    if ((jobTitle || office) && existing.role !== "INSTRUCTOR") {
      throw badRequest("jobTitle and office only apply to an INSTRUCTOR");
    }

    if (jobTitle || office) {
      await this.users.updateAdminProfile(userId, { jobTitle, office });
    }

    if (Object.keys(userFields).length === 0) {
      return this.getUser(userId, actor);
    }

    try {
      await this.users.update(userId, userFields);
    } catch (error) {
      // Supabase and Postgres cannot share a transaction. Restore the identity
      // if the application projection fails so the two sign-in addresses do
      // not remain split after a partial write.
      if (synchronizedIdentity) {
        await getSupabaseAdmin().auth.admin.updateUserById(
          synchronizedIdentity.authUserId,
          { email: synchronizedIdentity.previousEmail, email_confirm: true }
        );
      }
      throw error;
    }

    return this.getUser(userId, actor);
  }

  /**
   * Set a new password for somebody else.
   *
   * No current-password check, unlike AuthService.changePassword: this is the
   * "student forgot their password and emailed the department" path, and the
   * administrator proves nothing about the account except authority over it.
   */
  async resetPassword(userId: string, newPassword: string, actor: AdminActor) {
    await this.requireInOrganization(userId, actor);
    const identity = await this.users.findAuthUserIdInOrganization(
      userId,
      actor.organizationId
    );

    if (identity?.authUserId) {
      const { error } = await getSupabaseAdmin().auth.admin.updateUserById(
        identity.authUserId,
        { password: newPassword }
      );
      if (error) throw badRequest("Unable to update the login identity");
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.users.updatePassword(userId, passwordHash);
  }

  /* ------------------------------ Internals ------------------------------- */

  /**
   * The tenant check every campus-scoped write starts with.
   *
   * A user id from another university answers "not found" rather than
   * "forbidden", so an id cannot be confirmed as real by probing this endpoint.
   */
  private async requireInOrganization(userId: string, actor: AdminActor) {
    const user = await this.users.findInOrganization(
      userId,
      actor.organizationId
    );

    if (!user) {
      throw notFound("User not found");
    }

    // A super admin administers staff and students. Editing a peer, or the
    // platform owner's own account, is not part of that job.
    if (user.role !== "INSTRUCTOR" && user.role !== "STUDENT") {
      throw notFound("User not found");
    }

    return user;
  }

  /** Loads a student the approval queue is allowed to act on. */
  private async loadPendingCandidate(studentId: string, actor: AdminActor) {
    const student = await this.users.findInOrganization(
      studentId,
      actor.organizationId
    );

    if (!student || student.role !== "STUDENT") {
      throw notFound("Student not found");
    }

    const cohortIds = await this.approvalCohortIds(actor);
    if (
      cohortIds &&
      (!student.studentProfile?.cohortId ||
        !cohortIds.includes(student.studentProfile.cohortId))
    ) {
      throw notFound("Student not found");
    }

    return student;
  }

  /** Cohorts whose registrations this actor may review; null means university-wide. */
  private async approvalCohortIds(actor: AdminActor): Promise<string[] | null> {
    if (actor.role === "SYSTEM_OWNER" || actor.role === "UNIVERSITY_ADMIN") {
      return null;
    }

    if (actor.role === "DEPARTMENT_ADMIN") {
      if (!actor.departmentId) return [];
      const cohorts = await prisma.cohort.findMany({
        where: {
          organizationId: actor.organizationId,
          departmentId: actor.departmentId,
          isActive: true,
        },
        select: { id: true },
      });
      return cohorts.map(({ id }) => id);
    }

    if (actor.role === "INSTRUCTOR") {
      const assignments = await prisma.teachingAssignment.findMany({
        where: {
          organizationId: actor.organizationId,
          instructorId: actor.id,
          isActive: true,
        },
        select: {
          cohortId: true,
          offering: {
            select: { cohorts: { select: { cohortId: true } } },
          },
        },
      });
      return [
        ...new Set(
          assignments.flatMap((assignment) =>
            assignment.cohortId
              ? [assignment.cohortId]
              : assignment.offering.cohorts.map(({ cohortId }) => cohortId)
          )
        ),
      ];
    }

    return [];
  }

  /**
   * Today and this week on the campus clock.
   *
   * The academic week starts on Sunday — the same convention the DayOfWeek enum
   * is declared in, so "this week" in the dashboard means the same span as a
   * week of the timetable.
   */
  private currentWindow(now: Date = new Date()) {
    const today = partsInZone(now, this.timeZone);

    const startOfToday = zonedTimeToUtc(
      { year: today.year, month: today.month, day: today.day, hour: 0, minute: 0 },
      this.timeZone
    );

    // getUTCDay on a UTC-midnight of the local calendar date gives the local
    // weekday, 0 = Sunday.
    const weekday = new Date(
      Date.UTC(today.year, today.month - 1, today.day)
    ).getUTCDay();

    const weekStartDate = new Date(
      Date.UTC(today.year, today.month - 1, today.day) - weekday * DAY_MS
    );

    const startOfWeek = zonedTimeToUtc(
      {
        year: weekStartDate.getUTCFullYear(),
        month: weekStartDate.getUTCMonth() + 1,
        day: weekStartDate.getUTCDate(),
        hour: 0,
        minute: 0,
      },
      this.timeZone
    );

    return { startOfToday, startOfWeek };
  }

  private present(user: {
    id: string;
    universityId: string;
    fullName: string;
    email: string;
    role: string;
    isVerified: boolean;
    verifiedAt?: Date | null;
    verifiedById?: string | null;
    isActive: boolean;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
    studentProfile: {
      status: string;
      faculty: string | null;
      department: string | null;
      level: number | null;
      semester: string | null;
      section: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      universityId: user.universityId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      // Null is meaningful here: approved, but before there was anywhere to
      // record by whom. It is not backfilled — see the migration.
      verifiedAt: user.verifiedAt ?? null,
      verifiedById: user.verifiedById ?? null,
      isActive: user.isActive,
      createdAt: user.createdAt,

      // Present only for students; staff have an AdminProfile, which carries a
      // job title rather than an academic address and is not part of a
      // directory listing.
      profile: user.studentProfile
        ? {
            status: user.studentProfile.status,
            faculty: user.studentProfile.faculty,
            department: user.studentProfile.department,
            level: user.studentProfile.level,
            semester: user.studentProfile.semester,
            section: user.studentProfile.section,
          }
        : null,
    };
  }

  /**
   * A row in the approval queue.
   *
   * Carries more of the profile than the directory does, because this is the
   * evidence the approver is judging: a name and an email address are not
   * enough to decide whether somebody is a real second-year mechatronics
   * student. `nationalId` and `dateOfBirth` are still withheld — they identify
   * a person rather than qualify them, and are not needed to say yes or no.
   */
  private presentPending(user: {
    id: string;
    universityId: string;
    fullName: string;
    email: string;
    createdAt: Date;
    studentProfile: {
      status: string;
      faculty: string | null;
      department: string | null;
      level: number | null;
      semester: string | null;
      section: string | null;
      groupName: string | null;
      academicYear: string | null;
      phoneNumber: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      universityId: user.universityId,
      fullName: user.fullName,
      email: user.email,
      registeredAt: user.createdAt,

      // A student who has not filled their profile in gives the approver
      // nothing to check. The client should say so rather than presenting an
      // empty card as if it were a complete application.
      profile: user.studentProfile
        ? {
            status: user.studentProfile.status,
            faculty: user.studentProfile.faculty,
            department: user.studentProfile.department,
            level: user.studentProfile.level,
            semester: user.studentProfile.semester,
            section: user.studentProfile.section,
            groupName: user.studentProfile.groupName,
            academicYear: user.studentProfile.academicYear,
            phoneNumber: user.studentProfile.phoneNumber,
          }
        : null,
    };
  }
}
