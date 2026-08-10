import { env } from "../config/env.js";
import { notificationConfig } from "../config/notification.config.js";
import { LectureNotificationService } from "../services/lecture-notification.service.js";
import { NotificationDispatcher } from "../services/notification.dispatcher.js";

/**
 * The reminder worker: two timers in the API process.
 *
 * Deliberately not a queue, a cron container or a job runner. The state that
 * matters already lives in the database — a reminder row is its own job record,
 * with a due time, a status and a lock — so an interval that polls it is the
 * whole scheduler, and the pilot gains nothing from another moving part. If
 * this outgrows one process, the same rows can be drained by a real worker
 * without changing anything above the repository.
 *
 * Restarting is free: generation is idempotent, and delivery claims rows one
 * batch at a time rather than holding them in memory.
 */

const generator = new LectureNotificationService();
const dispatcher = new NotificationDispatcher();

let generationTimer: NodeJS.Timeout | null = null;
let deliveryTimer: NodeJS.Timeout | null = null;
let generating = false;
let delivering = false;

/** Runs one generation pass, unless the previous one is still going. */
const generate = async () => {
  if (generating) {
    return;
  }

  generating = true;

  try {
    const result = await generator.generateUpcoming();

    if (result.created > 0) {
      console.log(
        `[notification-worker] generated ${result.created} reminder(s) from ${result.occurrences} upcoming occurrence(s)`
      );
    }
  } catch (error) {
    // A failed pass is not fatal: the next one covers the same window, because
    // generation is driven by the horizon rather than by what it last did.
    console.error("[notification-worker] generation failed", error);
  } finally {
    generating = false;
  }
};

const deliver = async () => {
  if (delivering) {
    return;
  }

  delivering = true;

  try {
    const result = await dispatcher.tick();

    if (result.claimed > 0 || result.cancelled > 0) {
      console.log(
        `[notification-worker] sent ${result.sent}, failed ${result.failed}, retrying ${result.retrying}, cancelled ${result.cancelled}`
      );
    }
  } catch (error) {
    console.error("[notification-worker] delivery failed", error);
  } finally {
    delivering = false;
  }
};

export const startNotificationWorker = () => {
  if (!env.NOTIFICATION_WORKER_ENABLED) {
    console.log("[notification-worker] disabled (NOTIFICATION_WORKER_ENABLED=false)");
    return;
  }

  if (generationTimer || deliveryTimer) {
    return;
  }

  // `unref` so the timers never hold a shutting-down process open.
  generationTimer = setInterval(generate, notificationConfig.generationIntervalMs);
  generationTimer.unref();

  deliveryTimer = setInterval(deliver, notificationConfig.pollIntervalMs);
  deliveryTimer.unref();

  console.log(
    `[notification-worker] started — generating every ${Math.round(
      notificationConfig.generationIntervalMs / 1000
    )}s over a ${notificationConfig.horizonMinutes}-minute horizon, delivering every ${Math.round(
      notificationConfig.pollIntervalMs / 1000
    )}s (${notificationConfig.timeZone})`
  );

  // A first pass on boot, so a restart does not leave a gap the length of the
  // interval. Errors are already contained inside both functions.
  void generate();
  void deliver();
};

export const stopNotificationWorker = () => {
  if (generationTimer) {
    clearInterval(generationTimer);
    generationTimer = null;
  }

  if (deliveryTimer) {
    clearInterval(deliveryTimer);
    deliveryTimer = null;
  }
};
