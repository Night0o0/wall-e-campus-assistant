import { createHash } from "crypto";
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

  /* ------------------------- Robot / tablet devices ------------------------ */

  /**
   * Signing key for robot/tablet access tokens. Deliberately NOT the same key
   * as JWT_SECRET: a device token must be unusable as a user token and vice
   * versa, and separate key material makes that true by construction rather
   * than by a claim check that somebody could forget to write.
   *
   * Optional so that adding this feature does not stop an existing deployment
   * from booting. When it is absent the key is derived from JWT_SECRET (see
   * `deviceJwtSecret` below), which is still independent key material — but set
   * it explicitly in production so the two can be rotated separately.
   */
  DEVICE_JWT_SECRET: z
    .string()
    .min(32, "DEVICE_JWT_SECRET must be at least 32 characters")
    .optional(),

  /**
   * How long a device access token stays valid. Short by design: it is a
   * performance optimisation, not a security boundary — the device row is
   * re-read on every request, so revocation takes effect immediately whatever
   * this is set to.
   */
  DEVICE_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  /**
   * How a room-bound device treats a session with no room recorded.
   *
   * A device bound to B-204 never sees a session in C-101 — that much is
   * unconditional. The question this answers is narrower: what to do with a
   * session whose room is null, which is every session opened before the
   * Session ↔ LectureSchedule link existed, plus any opened ad hoc without one.
   *
   * Such a session is not in another room; it is in no known room, so a binding
   * has nothing to exclude it by. Ships false — they stay visible — because
   * hiding them would take attendance offline for every session already in the
   * database.
   *
   * ── The exact condition for setting this to true ──────────────────────────
   *
   * All three must hold, and the first is the one that matters:
   *
   *   1. `unlocatedCount` is 0 on GET /api/devices/me/sessions/active for every
   *      provisioned device, observed across a full teaching week rather than
   *      once. That is the direct measurement of "no open session lacks a
   *      room", and it is reported by the endpoint precisely so this decision
   *      does not have to be made from a SQL query somebody writes by hand.
   *
   *   2. Every session-opening path in use sends `lectureScheduleId` (or an
   *      explicit `room`). If any client still posts a bare title, sessions with
   *      no room will keep appearing, and flipping this hides them the moment
   *      they are opened — during the lecture they were opened for.
   *
   *   3. Every device that must serve a room has `room` set. A device left
   *      unbound is unaffected by this flag and will keep serving the whole
   *      university, which may not be what its operator assumes.
   *
   * Until all three hold, `false` is the correct value and `room = null` is a
   * migration state being worked through — not a permanently acceptable one.
   *
   * No effect on a device with no room binding: an unbound device serves every
   * open session in its university either way.
   */
  DEVICE_ROOM_FILTER_STRICT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  /**
   * Restricts GET /api/sessions/:id/qr to staff.
   *
   * Ships OFF so the existing robot keeps working while it is migrated onto the
   * device-auth path. Turn it ON once the robot has been provisioned and
   * verified against /api/devices/me/sessions/:id/qr — at which point students
   * lose the ability to mint their own attendance QR tokens, which is the whole
   * point. Kept as a flag rather than a code change so the cutover is instant
   * and reversible without a redeploy.
   */
  QR_ENDPOINT_STAFF_ONLY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  /**
   * Whether a student may scan into a session with no lecture behind it.
   *
   * Phase 3 binds scanning to the student's own cohort: a session linked to a
   * LectureSchedule is scannable only by the students that lecture is addressed
   * to. An ad-hoc session has no lecture and therefore no cohort, so there is
   * nothing to compare a student against — the check is undefined rather than
   * passed, which is the same shape of problem DEVICE_ROOM_FILTER_STRICT exists
   * for and it is answered the same way.
   *
   * Ships true — ad-hoc sessions stay scannable — because a makeup class and a
   * one-off seminar are approved Phase 2 behaviour, and flipping this by
   * default would make every one of them silently unscannable on the day it was
   * being held. Set it to false once every session-opening path in use sends
   * `lectureScheduleId`, at which point cohort binding is total.
   *
   * While it is true, an ad-hoc session remains scannable by any student in the
   * university that opened it — which is exactly the pre-Phase-3 rule, confined
   * to the sessions that cannot be checked any other way.
   */
  SCAN_ALLOW_UNLINKED_SESSIONS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  /* --------------------------- Attendance lifecycle ------------------------ */

  /**
   * A scan arriving more than this long after attendance opened is LATE rather
   * than PRESENT. Measured from the session's own start — when the instructor
   * actually opened it — so students are not penalised for an instructor who
   * started ten minutes behind the timetable.
   */
  ATTENDANCE_LATE_AFTER_MINUTES: z.coerce.number().int().min(1).default(15),

  /**
   * How long a session with no timetable entry behind it is assumed to run.
   * Only used when the duration cannot be read from a LectureSchedule; a linked
   * session takes its length from the lecture.
   */
  SESSION_DEFAULT_MINUTES: z.coerce.number().int().min(5).default(120),

  /**
   * How long past its lecture's end an open session may sit before the sweep
   * closes it as AUTO_STALE. This is the width of the PENDING window: a session
   * is PENDING from the moment the lecture ends until this grace runs out.
   *
   * Not zero, on purpose. An instructor who runs five minutes over and then
   * closes the session by hand should get a MANUAL close, not a race with a
   * worker.
   */
  SESSION_STALE_GRACE_MINUTES: z.coerce.number().int().min(1).default(30),

  /**
   * Runs the in-process attendance sweep: auto-closing stale sessions, then
   * writing the ABSENT rows for sessions that have closed.
   *
   * Turn it off on any instance that must not write attendance — a second
   * replica, or a machine only serving the dashboard. Off also means no ABSENT
   * row is ever created, which is the safe state for a deployment that has not
   * yet decided its grace period.
   */
  ATTENDANCE_WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  ATTENDANCE_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(5 * 60_000),

  /* ------------------------------ Rate limits ------------------------------ */

  /**
   * Requests per 15 minutes for a request that carries a verifiable token,
   * counted per principal rather than per IP.
   *
   * Per-IP counting is wrong for this product: an entire campus shares one NAT
   * address, so a 200-student lecture scanning at once — or ten robots polling
   * for a QR code — exhausts a shared bucket and attendance stops. See
   * utils/rate-limit.ts.
   */
  RATE_LIMIT_AUTHENTICATED: z.coerce.number().int().min(1).default(1000),

  /** Requests per 15 minutes for traffic with no usable token. Per IP. */
  RATE_LIMIT_ANONYMOUS: z.coerce.number().int().min(1).default(300),

  /** Attendance scans per 15 minutes, per student. */
  RATE_LIMIT_SCAN: z.coerce.number().int().min(1).default(30),

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

  /* --------------------------------- Email -------------------------------- */

  /**
   * Delivery back end for transactional email.
   *
   * "log" prints the message to the server log and reports success, which is
   * what development and the test suite run on — the same shape as
   * PUSH_PROVIDER, and for the same reason: the flow above the provider must be
   * exercisable without an account at a mail vendor. "smtp" sends for real.
   *
   * A student cannot register or recover a password without receiving mail, so
   * unlike push this is not an optional channel in production. `mailProviderOk`
   * below refuses to let a production instance boot on the logging provider.
   */
  MAIL_PROVIDER: z.enum(["log", "smtp"]).default("log"),

  /** RFC 5322 From header. A display name is allowed: `Wall-E <no-reply@…>`. */
  MAIL_FROM: z.string().min(3).default("Wall-E Campus <no-reply@wall-e.local>"),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /** True for implicit TLS on 465. Port 587 negotiates STARTTLS and wants false. */
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),

  /* --------------------------- Email challenges --------------------------- */

  /**
   * The one-time codes behind student email verification and password reset.
   *
   * Six digits is a million-way guess, which is only safe because it is paired
   * with the three limits below. A code is worthless without them: without an
   * expiry it can be brute-forced at leisure, without an attempt ceiling it can
   * be brute-forced quickly, and without a per-email issue ceiling an attacker
   * can mint fresh codes faster than they can be guessed wrong.
   */
  OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),

  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),

  /** Wrong guesses before the code is burned and a new one must be requested. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),

  /** Minimum gap between two sends to the same address. */
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3600)
    .default(60),

  /** Codes one address may be sent per hour, whatever the cooldown allows. */
  OTP_MAX_PER_EMAIL_PER_HOUR: z.coerce.number().int().min(1).max(50).default(5),

  /** OTP requests per 15 minutes from one unauthenticated IP. */
  RATE_LIMIT_OTP: z.coerce.number().int().min(1).default(20),

  /**
   * How long a proven email stays spendable at /api/auth/register.
   *
   * The ticket issued by a successful verification is what carries "this
   * address was proven" from one request to the next. Long enough to finish a
   * signup form, short enough that a ticket lifted from a client's storage is
   * usually already dead.
   */
  REGISTRATION_TICKET_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(1440)
    .default(30),

  /**
   * Whether /api/auth/register demands a verification ticket.
   *
   * Ships OFF, and the reason is the same one QR_ENDPOINT_STAFF_ONLY ships off:
   * the client that has to change is not in this repository. The Flutter
   * student app registers with no ticket today, and turning this on before that
   * app implements the OTP screens would stop student registration outright.
   *
   * Turn it on once the Flutter app sends `verificationTicket`. Until then the
   * endpoints exist, are tested, and can be adopted at the client's own pace —
   * which is what makes this an additive change rather than a breaking one.
   */
  STUDENT_EMAIL_VERIFICATION_REQUIRED: z
    .enum(["true", "false"])
    .default("false")
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

/**
 * The device signing key, explicit or derived.
 *
 * The derivation is a one-way hash of the user key under a fixed label, so the
 * result is independent key material: a token signed with it cannot verify
 * against JWT_SECRET, and a user token cannot verify against it. That is the
 * property the two-principal model actually depends on. Setting
 * DEVICE_JWT_SECRET explicitly is still better, because it lets the two keys be
 * rotated on their own schedules.
 */
const deviceJwtSecret =
  parsed.data.DEVICE_JWT_SECRET ??
  createHash("sha256")
    .update(`wall-e:device-token:${parsed.data.JWT_SECRET}`)
    .digest("hex");

if (isProduction && !parsed.data.DEVICE_JWT_SECRET) {
  console.warn(
    "⚠️  DEVICE_JWT_SECRET is not set — deriving it from JWT_SECRET. " +
      "Set it explicitly so device and user keys can be rotated separately."
  );
}

/**
 * Signing key for registration tickets, derived the same way and for the same
 * reason as the device key: a ticket that proves "this address was verified"
 * must not be usable as a session token, and separate key material makes that
 * structural rather than a claim check somebody could forget.
 */
const ticketJwtSecret = createHash("sha256")
  .update(`wall-e:registration-ticket:${parsed.data.JWT_SECRET}`)
  .digest("hex");

/**
 * SMTP is only half-configured without a host, and a half-configured mailer
 * fails at the worst possible moment — when a student is waiting on a code.
 * Fail at boot instead, where somebody is watching.
 */
if (parsed.data.MAIL_PROVIDER === "smtp" && !parsed.data.SMTP_HOST) {
  console.error(
    "\n❌ MAIL_PROVIDER is \"smtp\" but SMTP_HOST is not set.\n" +
      "   Set SMTP_HOST (and SMTP_USER / SMTP_PASSWORD if your relay needs them).\n"
  );
  process.exit(1);
}

/**
 * The logging provider is a development convenience. In production it would
 * print one-time codes into the server log and tell the caller they were sent,
 * so a student would wait forever for mail that was never addressed to anyone —
 * and anyone with log access could read every code. Refuse to start.
 */
if (isProduction && parsed.data.MAIL_PROVIDER === "log") {
  console.error(
    "\n❌ MAIL_PROVIDER=log is not permitted in production.\n" +
      "   Student email verification and password reset both depend on real\n" +
      "   delivery. Configure SMTP_HOST and set MAIL_PROVIDER=smtp.\n"
  );
  process.exit(1);
}

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
   * Signing key for robot/tablet access tokens. Always populated — explicitly
   * configured, or derived from JWT_SECRET. Never equal to JWT_SECRET.
   */
  deviceJwtSecret,

  /** Signing key for registration tickets. Never equal to JWT_SECRET. */
  ticketJwtSecret,

  /**
   * The campus wall clock, used wherever a local date or time has to be
   * decided — lecture occurrences, and the date stamped on an export filename.
   * It is configured through NOTIFICATION_TIMEZONE, which is where it was first
   * needed; this alias is what non-notification code should read, so the
   * variable can be renamed later without touching every caller.
   */
  campusTimeZone: parsed.data.NOTIFICATION_TIMEZONE,
};
