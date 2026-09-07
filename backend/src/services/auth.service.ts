import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository.js";
import { EmailChallengeService } from "./email-challenge.service.js";
import {
  accountExistsEmail,
  passwordResetEmail,
  staffResetUnavailableEmail,
  verificationEmail,
} from "./mail/mail.content.js";
import { env } from "../config/env.js";
import {
  AppError,
  conflict,
  notFound,
  unauthorized,
  badRequest,
} from "../utils/AppError.js";
import {
  studentRegistrationDetailsSchema,
  type CompleteSupabaseRegistrationInput,
} from "../types/auth.types.js";
import {
  MOBILE_ONLY_MESSAGE,
  WEB_ONLY_MESSAGE,
} from "../utils/client-platform.js";

const SALT_ROUNDS = 10;

/**
 * What a registration ticket asserts, and nothing more: that whoever holds it
 * proved control of this address, recently. It is not a session, it grants no
 * access to anything, and it is signed with its own key so it cannot be
 * mistaken for one — see env.ticketJwtSecret.
 */
interface RegistrationTicket {
  email: string;
  typ: "registration";
}

export class AuthService {
  /** Injected so tests can drive registration and recovery without a database. */
  constructor(
    private userRepository = new UserRepository(),
    private challenges = new EmailChallengeService()
  ) {}

  async getRegistrationOptions(rawOrganizationCode: string) {
    const organizationCode = rawOrganizationCode.trim().toUpperCase();
    const organization =
      await this.userRepository.findRegistrationOptionsByOrganizationCode(
        organizationCode
      );

    if (!organization) throw notFound("Organization not found");

    const currentTerm = organization.academicTerms[0];
    const options = organization.cohorts.flatMap((cohort) => {
      const uniqueSchedules = new Map(
        cohort.lectureSchedules.map((schedule) => [
          `${schedule.faculty}\u0000${schedule.department}\u0000${schedule.semester}`,
          schedule,
        ])
      );

      return [...uniqueSchedules.values()].flatMap((schedule) => {
        if (!cohort.section) return [];
        const semester = currentTerm?.semester ?? schedule.semester;
        return [{
          cohortId: cohort.id,
          cohortName: cohort.name,
          faculty: schedule.faculty,
          department: cohort.department.name,
          departmentCode: schedule.department || cohort.department.code,
          level: cohort.level,
          semester,
          semesterLabel:
            currentTerm?.name ??
            (semester === 1 ? "First Semester" : "Second Semester"),
          section: cohort.section,
          groupName: cohort.groupName || "",
          academicYear: currentTerm?.academicYear ?? cohort.academicYear,
        }];
      });
    });

    return {
      organization: {
        id: organization.id,
        code: organization.code,
        name: organization.name,
      },
      options,
    };
  }

  /* ----------------------- Student email verification ---------------------- */

  /**
   * Step 1 of registration: prove the address.
   *
   * Answers identically whether or not the address already has an account, and
   * mails a different message in each case. The alternative — a 409 here —
   * would turn this endpoint into a checker for which addresses hold accounts
   * at this university, which is a list worth having if you intend to phish it.
   *
   * Note the asymmetry with `register` below, which still answers 409 for a
   * taken address. That is not an oversight left standing: once
   * STUDENT_EMAIL_VERIFICATION_REQUIRED is on, `register` is unreachable
   * without a ticket, and a ticket cannot be obtained for an address that
   * already has an account — so the oracle closes when the flag flips.
   */
  async startEmailVerification(rawEmail: string, requestIp: string | null) {
    const email = this.challenges.normalizeEmail(rawEmail);
    const existing = await this.userRepository.findByEmail(email);

    if (existing) {
      await this.challenges.notifyWithoutCode(
        email,
        "EMAIL_VERIFICATION",
        accountExistsEmail(),
        requestIp
      );

      return;
    }

    await this.challenges.issue(
      email,
      "EMAIL_VERIFICATION",
      verificationEmail,
      requestIp
    );
  }

  /**
   * Step 2: spend the code, receive a ticket.
   *
   * The ticket is what carries "this address was proven" into the registration
   * request that follows, because HTTP will not carry it for us. It is not
   * single-use and does not need to be: the only thing it unlocks is creating
   * an account with that exact address, and User.email is unique, so a second
   * use collides with the account the first one made.
   */
  async confirmEmailVerification(rawEmail: string, code: string) {
    const email = this.challenges.normalizeEmail(rawEmail);

    await this.challenges.verify(email, "EMAIL_VERIFICATION", code);

    const payload: RegistrationTicket = { email, typ: "registration" };

    const verificationTicket = jwt.sign(payload, env.ticketJwtSecret, {
      expiresIn: `${env.REGISTRATION_TICKET_TTL_MINUTES}m`,
    } as SignOptions);

    return {
      verificationTicket,
      expiresInMinutes: env.REGISTRATION_TICKET_TTL_MINUTES,
    };
  }

  /**
   * Enforced only when the flag is on, so the Flutter client that predates this
   * feature keeps registering students while it is adopted. See
   * STUDENT_EMAIL_VERIFICATION_REQUIRED in config/env.ts for why that is a flag
   * rather than a breaking change.
   */
  private assertEmailProven(email: string, ticket: string | undefined) {
    if (!env.STUDENT_EMAIL_VERIFICATION_REQUIRED) {
      return;
    }

    if (!ticket) {
      throw new AppError(
        "Verify your email address before registering",
        400,
        undefined,
        "EMAIL_VERIFICATION_REQUIRED"
      );
    }

    let payload: RegistrationTicket;

    try {
      payload = jwt.verify(ticket, env.ticketJwtSecret) as RegistrationTicket;
    } catch {
      throw new AppError(
        "That verification has expired. Verify your email address again.",
        400,
        undefined,
        "EMAIL_VERIFICATION_EXPIRED"
      );
    }

    // The ticket proves an address, so it must be checked against the address
    // actually being registered. Without this, a ticket for an attacker's own
    // mailbox would register an account under somebody else's.
    if (payload.typ !== "registration" || payload.email !== email) {
      throw new AppError(
        "That verification does not match this email address",
        400,
        undefined,
        "EMAIL_VERIFICATION_MISMATCH"
      );
    }
  }

  async register(data: {
    universityId: string;
    fullName: string;
    email: string;
    password: string;
    organizationCode: string;
    verificationTicket?: string;
  }) {
    const email = this.challenges.normalizeEmail(data.email);

    this.assertEmailProven(email, data.verificationTicket);

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

    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw conflict("Email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    return this.userRepository.create({
      universityId: data.universityId,
      fullName: data.fullName,
      email,
      passwordHash,
      role: "STUDENT",
      organizationId: organization.id,
      accountStatus: "PENDING",
    });
  }

  /**
   * Finish student registration after Supabase has verified the identity.
   * Role and email are never accepted from the form: the public flow can only
   * create a pending STUDENT and the email comes from the signed access token.
   */
  async completeSupabaseRegistration(
    identity: {
      authUserId: string;
      email: string;
      registration?: unknown;
    },
    data: CompleteSupabaseRegistrationInput
  ) {
    const existingIdentity = await this.userRepository.findByAuthUserId(
      identity.authUserId
    );
    if (existingIdentity) {
      return { user: existingIdentity, created: false };
    }

    const metadata =
      identity.registration &&
      typeof identity.registration === "object" &&
      !Array.isArray(identity.registration)
        ? identity.registration
        : {};
    const parsed = studentRegistrationDetailsSchema.safeParse({
      ...metadata,
      ...data,
    });

    if (!parsed.success) {
      throw new AppError(
        "Registration details are missing or invalid. Start registration again.",
        400,
        parsed.error.flatten().fieldErrors,
        "REGISTRATION_DETAILS_REQUIRED"
      );
    }

    const registration = {
      ...parsed.data,
      organizationCode: parsed.data.organizationCode.toUpperCase(),
    };

    const organization = await this.userRepository.findOrganizationByCode(
      registration.organizationCode
    );

    if (!organization) throw notFound("Organization not found");

    const cohort = await this.userRepository.findRegistrationCohort(
      registration.cohortId,
      organization.id
    );
    if (!cohort || !cohort.section || cohort.lectureSchedules.length === 0) {
      throw badRequest("The selected academic group is no longer available");
    }
    const academicAddress = cohort.lectureSchedules[0]!;

    const [byEmail, byUniversityId] = await Promise.all([
      this.userRepository.findByEmail(identity.email),
      this.userRepository.findByUniversityId(registration.universityId),
    ]);

    if (byEmail) throw conflict("Email already registered");
    if (byUniversityId) throw conflict("University ID already registered");

    try {
      const user = await this.userRepository.create({
        authUserId: identity.authUserId,
        universityId: registration.universityId,
        fullName: registration.fullName,
        email: identity.email,
        passwordHash: undefined,
        role: "STUDENT",
        organizationId: organization.id,
        accountStatus: "PENDING",
        isVerified: false,
        departmentId: cohort.departmentId,
        studentProfile: {
          faculty: academicAddress.faculty,
          department: academicAddress.department,
          level: cohort.level,
          semester:
            academicAddress.semester === 1
              ? "First Semester"
              : "Second Semester",
          section: cohort.section,
          ...(cohort.groupName ? { groupName: cohort.groupName } : {}),
          academicYear: cohort.academicYear,
          cohortId: cohort.id,
          phoneNumber: registration.phoneNumber,
          nationalId: registration.nationalId,
          dateOfBirth: new Date(`${registration.dateOfBirth}T00:00:00.000Z`),
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      return { user, created: true };
    } catch (error) {
      // Two confirmation callbacks can race. The unique authUserId constraint
      // chooses one winner; the loser returns the same account rather than a
      // spurious conflict. A genuine email/university-ID collision still
      // rethrows because it produces no row for this identity.
      const winner = await this.userRepository.findByAuthUserId(
        identity.authUserId
      );
      if (winner) return { user: winner, created: false };
      throw error;
    }
  }

  /* ---------------------------- Password recovery -------------------------- */

  /**
   * Ask for a reset code.
   *
   * Returns the same thing for every address — no account, a student account, a
   * staff account, a deactivated account — and decides what to mail privately.
   * A caller can learn nothing from the response; only the inbox learns
   * anything, which is the correct audience.
   *
   * Staff are answered with an explanation rather than a code, by decision:
   * a staff account approves registrations and publishes to whole cohorts, so
   * recovering one is a human decision made by the university administrator
   * through /api/admin/users/:id/password.
   */
  async requestPasswordReset(rawEmail: string, requestIp: string | null) {
    const email = this.challenges.normalizeEmail(rawEmail);
    const user = await this.userRepository.findByEmail(email);

    // No account, or a deactivated one. Nothing is sent: mailing an address
    // that has never registered would make this endpoint a way to send mail to
    // arbitrary strangers, and a deactivated account has nothing to recover.
    if (!user || !user.isActive) {
      return;
    }

    if (user.role !== "STUDENT") {
      await this.challenges.notifyWithoutCode(
        email,
        "PASSWORD_RESET",
        staffResetUnavailableEmail(),
        requestIp
      );

      return;
    }

    await this.challenges.issue(
      email,
      "PASSWORD_RESET",
      passwordResetEmail,
      requestIp
    );
  }

  /**
   * Spend a reset code and set a new password.
   *
   * The code is verified before the account is looked at, so a wrong code
   * cannot be told apart from an address with no account: both fail identically
   * inside EmailChallengeService.verify.
   *
   * KNOWN LIMITATION, recorded here rather than in a tracker: existing access
   * tokens survive a reset. Tokens are stateless JWTs with a 7-day expiry and
   * there is no token-version column to bump, so a session opened with the old
   * password stays usable until it expires. Closing that needs a revocation
   * column on User and a check in the auth middleware — a deliberate change,
   * not something to smuggle in here.
   */
  async resetPassword(rawEmail: string, code: string, newPassword: string) {
    const email = this.challenges.normalizeEmail(rawEmail);

    await this.challenges.verify(email, "PASSWORD_RESET", code);

    const user = await this.userRepository.findByEmail(email);

    // Only reachable if the account was deactivated between the code being
    // issued and being spent. The code was valid, so this is not an enumeration
    // surface — the caller already proved control of the address.
    if (!user || !user.isActive || user.role !== "STUDENT") {
      throw badRequest("This account cannot be recovered by email");
    }

    if (!user.passwordHash) {
      throw badRequest("This account password is managed by the identity provider");
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

    if (isSamePassword) {
      throw badRequest("New password must be different from the current one");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.userRepository.updatePassword(user.id, passwordHash);
  }

  async login(data: { email: string; password: string }) {
    const user = await this.userRepository.findByEmail(data.email);

    if (!user || !user.passwordHash) {
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
        accountStatus: user.accountStatus,
        isVerified: user.isVerified,
        isActive: user.isActive,
        organizationId: user.organizationId,
        departmentId: user.departmentId,
      },
    };
  }

  /** Native-app login. Only students are permitted in the mobile app. */
  async loginForMobile(data: { email: string; password: string }) {
    const result = await this.login({
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });

    if (result.user.role !== "STUDENT") {
      throw new AppError(
        WEB_ONLY_MESSAGE,
        403,
        undefined,
        "WEB_ONLY_ACCOUNT"
      );
    }

    return result;
  }

  /** Browser login. Student identities belong exclusively to the mobile app. */
  async loginForWeb(data: { email: string; password: string }) {
    const result = await this.login(data);

    if (result.user.role === "STUDENT") {
      throw new AppError(
        MOBILE_ONLY_MESSAGE,
        403,
        undefined,
        "MOBILE_ONLY_ACCOUNT"
      );
    }

    return result;
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
      accountStatus: user.accountStatus,
      isVerified: user.isVerified,
      isActive: user.isActive,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
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

    if (!user.passwordHash) {
      throw badRequest("This account password is managed by the identity provider");
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
    const current = await this.userRepository.findById(userId);

    if (!current) {
      throw notFound("User not found");
    }

    // In Supabase mode the sign-in address belongs to the identity provider.
    // Accepting a request-body email here would let the application projection
    // drift away from Auth before the new address has been confirmed. The web
    // and mobile clients update Supabase instead; authenticate() copies a
    // changed address into User only after it appears in a verified token.
    if (
      env.AUTH_PROVIDER === "supabase" &&
      data.email !== undefined &&
      data.email !== current.email
    ) {
      throw badRequest(
        "Change your sign-in email through the identity provider"
      );
    }

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
      accountStatus: user.accountStatus,
      isVerified: user.isVerified,
      isActive: user.isActive,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
    };
  }
}
