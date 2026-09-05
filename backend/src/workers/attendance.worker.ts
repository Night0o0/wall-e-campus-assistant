import { env } from "../config/env.js";
import { attendanceConfig } from "../config/attendance.config.js";
import { AttendanceLifecycleService } from "../services/attendance-lifecycle.service.js";
import { logger } from "../utils/logger.js";

/**
 * The attendance sweep: one timer in the API process.
 *
 * Same shape and same reasoning as the reminder worker — the state that matters
 * is already in the database (`Session.status` and `Session.absencesSweptAt`
 * are the job record), so a poll over it is the whole scheduler.
 *
 * Restarting is free, and unusually so here: both halves of a pass are
 * idempotent, so a crash mid-sweep loses nothing and repeats nothing. A pass
 * that dies after closing a session but before calling its roll leaves that
 * session CLOSED with `absencesSweptAt` still null, which is exactly the state
 * the next pass looks for.
 */

const lifecycle = new AttendanceLifecycleService();

let sweepTimer: NodeJS.Timeout | null = null;
let sweeping = false;

const sweep = async () => {
  if (sweeping) {
    return;
  }

  sweeping = true;

  try {
    const { stale, absences } = await lifecycle.runSweep();

    if (stale.closed > 0 || absences.swept > 0) {
      logger.info("attendance_worker.swept", {
        sessionsClosed: stale.closed,
        sessionsSwept: absences.swept,
        absencesCreated: absences.absencesCreated,
        unlinkedSessions: absences.unlinked,
      });
    }
  } catch (error) {
    // A failed pass is not fatal. Nothing is lost: the next pass selects on the
    // same two conditions, so whatever this one did not finish is simply still
    // outstanding.
    logger.error("attendance_worker.sweep_failed", { error });
  } finally {
    sweeping = false;
  }
};

export const startAttendanceWorker = () => {
  if (!env.ATTENDANCE_WORKER_ENABLED) {
    logger.info("attendance_worker.disabled");
    return;
  }

  if (sweepTimer) {
    return;
  }

  // `unref` so the timer never holds a shutting-down process open.
  sweepTimer = setInterval(sweep, env.ATTENDANCE_SWEEP_INTERVAL_MS);
  sweepTimer.unref();

  logger.info("attendance_worker.started", {
    sweepIntervalMs: env.ATTENDANCE_SWEEP_INTERVAL_MS,
    staleGraceMinutes: attendanceConfig.staleGraceMinutes,
  });

  // A first pass on boot, so a restart does not leave a gap the length of the
  // interval. Errors are already contained inside `sweep`.
  void sweep();
};

export const stopAttendanceWorker = () => {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
};
