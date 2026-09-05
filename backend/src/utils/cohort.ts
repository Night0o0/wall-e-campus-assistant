import {
  SCHEDULE_MATCH_FIELDS,
  ScheduleMatchField,
  parseSemesterNumber,
} from "../types/schedule.types.js";

/**
 * Which students a lecture is addressed to, and whether a given student is one
 * of them.
 *
 * THIS IS THE ONLY DEFINITION OF THAT COMPARISON. It was previously private to
 * ScheduleService, which was fine while the timetable was the only thing that
 * asked the question. The scan path now asks it too — "is this student entitled
 * to be in this lecture" — and the two must give the same answer, because a
 * timetable that shows a student a lecture they cannot then scan into, or a
 * scan that accepts somebody the timetable never showed it to, are both bugs
 * that would take a term to notice.
 *
 * Faculty, department and section are free text on both sides — a schedule
 * stores what an administrator typed and a profile stores what a student typed
 * — so they are compared case-insensitively and trimmed, exactly as the
 * database query does. Level and semester are numbers and are compared exactly.
 *
 * Semester is the awkward one, and deliberately so: a schedule stores 1 or 2,
 * a profile stores free text ("First Semester", "Fall 2025", "1"). No SQL
 * comparison can reconcile those, which is why `parseSemesterNumber` exists and
 * why a profile whose semester cannot be read is treated as unresolvable rather
 * than guessed at. Guessing here would put a student in a cohort they are not
 * in, and the absence sweep would then mark them absent from its lectures.
 */

/** The academic address a lecture is addressed to, fully resolved. */
export interface ScheduleCriteria {
  faculty: string;
  department: string;
  level: number;
  semester: number;
  section: string;
}

/** The subset of a StudentProfile the address is read from. */
export interface CohortProfileFields {
  faculty?: string | null;
  department?: string | null;
  level?: number | null;
  semester?: string | null;
  section?: string | null;
}

export type CohortResolution =
  | { ok: true; criteria: ScheduleCriteria }
  /** The profile has not been filled in far enough to place the student. */
  | { ok: false; reason: "MISSING_FIELDS"; missingFields: ScheduleMatchField[] }
  /** Every field is present but the semester text cannot be read as 1 or 2. */
  | { ok: false; reason: "UNREADABLE_SEMESTER"; semester: string | null };

const isFilled = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.trim() === "");

/**
 * Reads a student's cohort off their own profile.
 *
 * Returns a result rather than throwing, because the two callers need to say
 * different things about the same failure: the timetable asks the student to
 * complete their profile before it can build one, and the scan path has to
 * explain why a code that is perfectly valid was nonetheless refused. Sharing
 * the *logic* while letting each own its *wording* is the point of the shape.
 *
 * Takes a profile rather than a user id, so it is pure and needs no database.
 */
export const resolveCohort = (
  profile: CohortProfileFields | null | undefined
): CohortResolution => {
  if (!profile) {
    return {
      ok: false,
      reason: "MISSING_FIELDS",
      missingFields: [...SCHEDULE_MATCH_FIELDS],
    };
  }

  const missingFields = SCHEDULE_MATCH_FIELDS.filter(
    (field) => !isFilled(profile[field])
  );

  if (missingFields.length > 0) {
    return { ok: false, reason: "MISSING_FIELDS", missingFields };
  }

  const semester = parseSemesterNumber(profile.semester);

  if (semester === null) {
    return {
      ok: false,
      reason: "UNREADABLE_SEMESTER",
      semester: profile.semester ?? null,
    };
  }

  return {
    ok: true,
    criteria: {
      faculty: profile.faculty!,
      department: profile.department!,
      level: profile.level!,
      semester,
      section: profile.section!,
    },
  };
};

/** The academic address of a lecture, as the schedule stores it. */
export interface CohortScheduleFields {
  faculty: string;
  department: string;
  level: number;
  semester: number;
  section: string;
}

/** Whether this lecture is addressed to this cohort. */
export const cohortMatches = (
  schedule: CohortScheduleFields,
  criteria: ScheduleCriteria
): boolean => {
  const same = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase();

  return (
    same(schedule.faculty, criteria.faculty) &&
    same(schedule.department, criteria.department) &&
    same(schedule.section, criteria.section) &&
    schedule.level === criteria.level &&
    schedule.semester === criteria.semester
  );
};
