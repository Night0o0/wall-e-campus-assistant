/**
 * When a session's lecture is over, and when the session itself has gone stale.
 *
 * Every lifecycle state in this system is decided by comparing the clock to one
 * of two instants, and both of them are computed here. Keeping that in one pure
 * function — no database, no time zone, no configuration read at a distance —
 * is what makes PENDING and AUTO_STALE testable as arithmetic rather than as
 * behaviour of a worker.
 *
 * The anchor is `session.startTime`: when attendance actually opened, not when
 * the timetable says the lecture was supposed to begin. An instructor who opens
 * ten minutes late has a lecture that ends ten minutes late, and their students
 * are not marked late for the delay. The timetable contributes the *duration*
 * and nothing else, which is also why no time zone appears here: the difference
 * between two wall clocks on the same day is the same number of minutes in
 * every zone, so "10:00 to 12:00" is two hours without needing to know where.
 */

const MINUTE_MS = 60_000;

/** "HH:MM" → minutes past midnight. Null if it is not a clock. */
const clockMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
};

/**
 * How long the lecture behind a session runs, in minutes.
 *
 * Falls back to `defaultMinutes` whenever the schedule cannot answer: there is
 * no schedule (an ad-hoc session), or its times do not parse, or they do not
 * describe a forward interval. A session must always have a window — one that
 * never expires would never go stale, and an instructor's forgotten session
 * would hold attendance open indefinitely.
 */
export const lectureDurationMinutes = (
  schedule: { startTime: string; endTime: string } | null | undefined,
  defaultMinutes: number
): number => {
  if (!schedule) {
    return defaultMinutes;
  }

  const start = clockMinutes(schedule.startTime);
  const end = clockMinutes(schedule.endTime);

  if (start === null || end === null || end <= start) {
    return defaultMinutes;
  }

  return end - start;
};

export interface SessionWindowInput {
  startTime: Date;
  lectureSchedule?: { startTime: string; endTime: string } | null;
}

export interface SessionWindowConfig {
  /** Assumed length of a session with no timetable entry behind it. */
  defaultSessionMinutes: number;
  /** How long past its end a session may stay open before it is stale. */
  staleGraceMinutes: number;
}

export interface SessionWindow {
  /** When the lecture itself is over. */
  endsAt: Date;
  /** When an still-open session becomes eligible for automatic closure. */
  staleAt: Date;
}

export const sessionWindow = (
  session: SessionWindowInput,
  config: SessionWindowConfig
): SessionWindow => {
  const minutes = lectureDurationMinutes(
    session.lectureSchedule,
    config.defaultSessionMinutes
  );

  const endsAt = new Date(session.startTime.getTime() + minutes * MINUTE_MS);

  return {
    endsAt,
    staleAt: new Date(endsAt.getTime() + config.staleGraceMinutes * MINUTE_MS),
  };
};

/**
 * The lifecycle state of a session that exists.
 *
 * NOT_RECORDED is deliberately absent: it is the state of an occurrence with no
 * session at all, so nothing here can return it. See
 * AttendanceLifecycleService.occurrenceStates, which is the only place that
 * distinction can be drawn, because it is the only place that looks at
 * occurrences rather than at rows.
 */
export type SessionLifecycleState =
  /** Open, but its window has not begun. Nothing may scan into it yet. */
  | "UPCOMING"
  /** Open, and the lecture is still running. Students may scan. */
  | "IN_PROGRESS"
  /** Open, but the lecture is over. Nobody has closed it yet. */
  | "PENDING"
  /** Closed. Its roll may or may not have been called yet. */
  | "RECORDED";

export const sessionState = (
  session: SessionWindowInput & { status: "ACTIVE" | "CLOSED" },
  now: Date,
  config: SessionWindowConfig
): SessionLifecycleState => {
  if (session.status === "CLOSED") {
    return "RECORDED";
  }

  // A session's startTime defaults to the moment it is opened, so UPCOMING is
  // not reachable through the API today. It is still decided here rather than
  // assumed away: `startTime` is a writable column, and a state machine that
  // silently treats "not yet" as "now" is one seed script away from letting
  // somebody scan into a lecture that has not begun.
  if (now < session.startTime) {
    return "UPCOMING";
  }

  return now > sessionWindow(session, config).endsAt ? "PENDING" : "IN_PROGRESS";
};

/**
 * Whether attendance may be recorded against this session right now.
 *
 * THIS IS THE ONLY DEFINITION OF "SCANNABLE" IN THE SYSTEM. QR projection and
 * the student scan path both call it, so the code staff display and the code
 * the server will accept cannot disagree — and neither depends on the
 * attendance worker having run. The worker closes expired sessions for the sake
 * of the record; it is not what stops them being scanned.
 *
 * Exactly one state passes: IN_PROGRESS.
 */
export const isScannable = (
  session: SessionWindowInput & { status: "ACTIVE" | "CLOSED" },
  now: Date,
  config: SessionWindowConfig
): boolean => sessionState(session, now, config) === "IN_PROGRESS";

/* -------------------------- Occurrence adjacency -------------------------- */

/**
 * How near a session must start to a lecture occurrence to be that occurrence's,
 * and — the same question asked the other way round — how near two sessions must
 * start to each other to be two sessions of the SAME occurrence.
 *
 * THIS IS THE ONLY PLACE EITHER DISTANCE IS DEFINED. They were previously
 * written out as literals inside AttendanceLifecycleService, which meant the
 * rule deciding "this session belongs to that occurrence" and the rule deciding
 * "these two sessions are duplicates" could drift apart — and a disagreement
 * between them is precisely how a duplicate session escapes the guard and then
 * gets its own roll called.
 *
 * Generous on both sides on purpose. An instructor may open attendance a few
 * minutes early while the room fills, or an hour late having forgotten.
 *
 * ── Why 12 hours cannot reach the wrong week ──────────────────────────────────
 *
 * A LectureSchedule is a weekly slot, so consecutive occurrences are 7 days
 * apart. One occurrence's sessions span [O − 1h, O + 12h). The next occurrence's
 * span [O + 7d − 1h, O + 7d + 12h). The closest a session of one can come to a
 * session of the other is 7d − 13h ≈ 6.46 days. A ±12h band around any session
 * therefore cannot contain a session of a different occurrence, which is what
 * makes `isSameOccurrence` a safe test without needing a time zone, a calendar,
 * or the occurrence instant itself.
 */
export const OCCURRENCE_OPEN_EARLY_MS = 60 * MINUTE_MS;
export const OCCURRENCE_OPEN_LATE_MS = 12 * 60 * MINUTE_MS;

/** Whether a session that started at `startTime` belongs to this occurrence. */
export const belongsToOccurrence = (
  startTime: Date,
  occurrenceStartsAt: Date
): boolean =>
  startTime.getTime() >= occurrenceStartsAt.getTime() - OCCURRENCE_OPEN_EARLY_MS &&
  startTime.getTime() < occurrenceStartsAt.getTime() + OCCURRENCE_OPEN_LATE_MS;

/**
 * The window around an instant inside which any session of the same lecture is
 * a session of the same occurrence. See the 7-day proof above.
 */
export const sameOccurrenceWindow = (anchor: Date) => ({
  from: new Date(anchor.getTime() - OCCURRENCE_OPEN_LATE_MS),
  to: new Date(anchor.getTime() + OCCURRENCE_OPEN_LATE_MS),
});

/** Whether an open session has outlived its lecture by more than the grace. */
export const isStale = (
  session: SessionWindowInput & { status: "ACTIVE" | "CLOSED" },
  now: Date,
  config: SessionWindowConfig
): boolean =>
  session.status === "ACTIVE" && now > sessionWindow(session, config).staleAt;

/**
 * PRESENT or LATE, measured from when attendance opened.
 *
 * The boundary is explicit and inclusive of PRESENT: a scan at exactly the
 * threshold is PRESENT, and only a scan strictly past it is LATE. Somebody
 * arriving on the fifteenth minute has arrived on the fifteenth minute, and a
 * rule that rounded against them would be arbitrary in the one direction that
 * costs a student something.
 *
 * ABSENT is not reachable here by construction — this function only runs
 * because somebody scanned. Absence is decided after the session closes, by
 * AttendanceLifecycleService.
 */
export const punctuality = (
  openedAt: Date,
  scannedAt: Date,
  lateAfterMinutes: number
): "PRESENT" | "LATE" =>
  scannedAt.getTime() - openedAt.getTime() > lateAfterMinutes * MINUTE_MS
    ? "LATE"
    : "PRESENT";
