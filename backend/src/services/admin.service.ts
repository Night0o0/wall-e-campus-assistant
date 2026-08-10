import { env } from "../config/env.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { AdminUserQuery } from "../types/admin.types.js";
import { notFound } from "../utils/AppError.js";
import { partsInZone, zonedTimeToUtc } from "../utils/occurrence.util.js";
import { paginate } from "../utils/pagination.js";

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

  /* ------------------------------ Internals ------------------------------- */

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
}
