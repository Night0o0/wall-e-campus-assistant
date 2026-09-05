import app from "./app.js";
import { env } from "./config/env.js";
import { startAttendanceWorker } from "./workers/attendance.worker.js";
import { stopAttendanceWorker } from "./workers/attendance.worker.js";
import { startNotificationWorker } from "./workers/notification.worker.js";
import { stopNotificationWorker } from "./workers/notification.worker.js";
import prisma from "./lib/prisma.js";
import { logger } from "./utils/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info("server.started", { port: env.PORT });

  // Lecture reminders. Runs in this process; see notification.worker.ts for
  // why that is enough for the pilot, and how to move it out later.
  startNotificationWorker();

  // Attendance lifecycle: auto-close stale sessions, then write the ABSENT
  // rows for sessions that have closed. This one writes rows about named
  // students, so it is separately gated — see ATTENDANCE_WORKER_ENABLED.
  startAttendanceWorker();
});

let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("server.shutdown_started", { signal });
  stopAttendanceWorker();
  stopNotificationWorker();

  const forceTimer = setTimeout(() => {
    logger.error("server.shutdown_timeout");
    process.exitCode = 1;
    server.closeAllConnections();
  }, 10_000);
  forceTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceTimer);
    await prisma.$disconnect();
    if (error) {
      logger.error("server.shutdown_failed", { error });
      process.exitCode = 1;
      return;
    }
    logger.info("server.shutdown_complete");
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
