import app from "./app.js";
import { env } from "./config/env.js";
import { startAttendanceWorker } from "./workers/attendance.worker.js";
import { startNotificationWorker } from "./workers/notification.worker.js";

app.listen(env.PORT, () => {

    console.log(`🚀 Server running on http://localhost:${env.PORT}`);

    // Lecture reminders. Runs in this process; see notification.worker.ts for
    // why that is enough for the pilot, and how to move it out later.
    startNotificationWorker();

    // Attendance lifecycle: auto-close stale sessions, then write the ABSENT
    // rows for sessions that have closed. This one writes rows about named
    // students, so it is separately gated — see ATTENDANCE_WORKER_ENABLED.
    startAttendanceWorker();

});
