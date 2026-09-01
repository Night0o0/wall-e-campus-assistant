import app from "./app.js";
import { env } from "./config/env.js";
import { startAttendanceWorker } from "./workers/attendance.worker.js";
import { stopAttendanceWorker } from "./workers/attendance.worker.js";
import { startNotificationWorker } from "./workers/notification.worker.js";
import { stopNotificationWorker } from "./workers/notification.worker.js";
import prisma from "./lib/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);

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

  console.log(`[shutdown] ${signal} received; draining requests`);
  stopAttendanceWorker();
  stopNotificationWorker();

  const forceTimer = setTimeout(() => {
    console.error("[shutdown] timed out while draining requests");
    process.exitCode = 1;
    server.closeAllConnections();
  }, 10_000);
  forceTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceTimer);
    await prisma.$disconnect();
    if (error) {
      console.error("[shutdown] server close failed", error);
      process.exitCode = 1;
      return;
    }
    console.log("[shutdown] complete");
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
