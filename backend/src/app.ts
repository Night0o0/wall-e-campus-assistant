import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { apiLimiter } from "./utils/rate-limit.js";
import authRoutes from "./routes/auth.routes.js";
import healthRoutes from "./routes/health.routes.js";
import departmentRoutes from "./routes/department.routes.js";
import assignmentRoutes from "./routes/assignment.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import courseRoutes from "./routes/course.routes.js";
import studentRoutes from "./routes/student.routes.js";
import materialRoutes from "./routes/material.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import organizationRoutes from "./routes/organization.routes.js";
import userRoutes from "./routes/user.routes.js";
import metricsRoutes from "./routes/metrics.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

/**
 * Broad limiter for the whole API, counted per caller rather than per address.
 *
 * A campus leaves through one NAT gateway, so an IP-keyed bucket is shared by
 * every student on the WiFi. A lecture hall scanning attendance at the same
 * minute would exhaust it quickly and start receiving 429s, so the key is the
 * authenticated principal wherever one can be established, and the IP only when
 * it cannot. See utils/rate-limit.ts.
 */
app.use("/api", apiLimiter);

// Tighter limiter for credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 10 : 1000,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
});

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/auth", authLimiter, authRoutes);

// Campus operations
app.use("/api/sessions", sessionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

// Platform administration
app.use("/api/organizations", organizationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/metrics", metricsRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
