import app from "./app.js";
import { env } from "./config/env.js";
import { startNotificationWorker } from "./workers/notification.worker.js";

app.listen(env.PORT, () => {

    console.log(`🚀 Server running on http://localhost:${env.PORT}`);

    // Lecture reminders. Runs in this process; see notification.worker.ts for
    // why that is enough for the pilot, and how to move it out later.
    startNotificationWorker();

});
