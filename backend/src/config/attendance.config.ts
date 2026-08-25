import { env } from "./env.js";
import { SessionWindowConfig } from "../utils/session-window.js";

/**
 * The attendance lifecycle's numbers, in one place.
 *
 * THIS IS THE ONLY PLACE THE GRACE PERIOD AND THE LATE THRESHOLD ARE DEFINED,
 * for the same reason the reminder lead times live only in
 * notification.config.ts: a threshold duplicated between the thing that applies
 * it and the thing that reports it will eventually disagree with itself, and
 * here the disagreement would be between "this student was marked late" and
 * "this student was not late".
 */
export const attendanceConfig = {
  /** A scan later than this after attendance opened is LATE. */
  lateAfterMinutes: env.ATTENDANCE_LATE_AFTER_MINUTES,

  /** Assumed length of a session with no lecture behind it. */
  defaultSessionMinutes: env.SESSION_DEFAULT_MINUTES,

  /** The PENDING window: how long an ended lecture may stay open. */
  staleGraceMinutes: env.SESSION_STALE_GRACE_MINUTES,

  /**
   * Sessions closed per sweep pass, and rolls called per sweep pass. Bounded so
   * a first run against a database full of never-closed sessions does its work
   * over several passes instead of one very long transaction.
   */
  batchSize: 100,
} as const;

/** The subset the pure window functions take. */
export const sessionWindowConfig: SessionWindowConfig = {
  defaultSessionMinutes: attendanceConfig.defaultSessionMinutes,
  staleGraceMinutes: attendanceConfig.staleGraceMinutes,
};
