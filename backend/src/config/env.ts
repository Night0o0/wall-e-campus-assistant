import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // No fallback: an empty signing key silently makes every token forgeable.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  JWT_EXPIRES_IN: z.string().default("7d"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Comma-separated list of origins allowed to call the API.
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Billing is off by default so a campus can pilot attendance without any
  // plan, invoice or payment surface. Set to "true" to bring it back.
  BILLING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  /* ----------------------------- Notifications ----------------------------- */

  // Runs the in-process reminder worker (generate upcoming + deliver due).
  // Turn it off on any instance that must not send, e.g. a second replica or a
  // machine only serving the dashboard.
  NOTIFICATION_WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  // The campus clock a lecture's "12:00" is read in. IANA zone name.
  NOTIFICATION_TIMEZONE: z.string().min(1).default("Africa/Cairo"),

  // How far ahead reminders are generated. Raised automatically if it is ever
  // set below the longest lead time — see notification.config.ts.
  NOTIFICATION_HORIZON_MINUTES: z.coerce.number().int().min(60).default(2880),

  NOTIFICATION_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60_000),

  NOTIFICATION_GENERATION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(15 * 60_000),

  // Delivery back end. "log" writes the notification to the server log and is
  // the pilot default; "none" stores it in-app only. Firebase goes here when
  // the Flutter client is wired up.
  PUSH_PROVIDER: z.enum(["log", "none"]).default("log"),

  // Exposes /api/notifications/dev/*, which can conjure reminders on demand.
  // Ignored in production — see `devToolsEnabled` below.
  NOTIFICATION_DEV_TOOLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
  console.error("Copy .env.example to .env and fill in the missing values.\n");
  process.exit(1);
}

const isProduction = parsed.data.NODE_ENV === "production";

export const env = {
  ...parsed.data,
  isProduction,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  /**
   * The notification simulation endpoints, which create and deliver reminders
   * on demand. Off in production whatever the variable says: the flag is a
   * convenience for developers, not a switch a production deploy may flip.
   */
  devToolsEnabled: !isProduction && parsed.data.NOTIFICATION_DEV_TOOLS,

  /**
   * The campus wall clock, used wherever a local date or time has to be
   * decided — lecture occurrences, and the date stamped on an export filename.
   * It is configured through NOTIFICATION_TIMEZONE, which is where it was first
   * needed; this alias is what non-notification code should read, so the
   * variable can be renamed later without touching every caller.
   */
  campusTimeZone: parsed.data.NOTIFICATION_TIMEZONE,
};
