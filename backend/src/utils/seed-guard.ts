/**
 * The one thing standing between `npm run db:seed` and a production database.
 *
 * The seed script is destructive by design: `wipe()` empties every table it owns
 * — attendance, sessions, schedules, courses, users, organizations —
 * so that re-seeding is repeatable. That is correct for a demo dataset and
 * catastrophic anywhere else, and until now the only thing gating it was
 * SEED_KEEP_EXISTING, which is a convenience flag rather than a safety one:
 * it defaults to "wipe", so forgetting it is the destructive outcome.
 *
 * This refusal is deliberately NOT expressed in terms of SEED_KEEP_EXISTING.
 * Even with the wipe skipped, the seed writes demo universities and demo
 * accounts whose passwords are committed to this repository — none of which
 * may exist in a production database.
 *
 * TWO INDEPENDENT CHECKS, because NODE_ENV alone measures the wrong thing.
 *
 *   1. NODE_ENV must not be "production". No override, ever.
 *
 *   2. DATABASE_URL must not point at a remote host — unless the caller names
 *      that exact host in SEED_ALLOW_REMOTE_HOST.
 *
 * The second check exists because the first one missed the case that actually
 * occurs. A developer's machine runs NODE_ENV=development while DATABASE_URL
 * points at a hosted database; the guard sees "development", allows the run,
 * and `wipe()` empties a live instance. NODE_ENV describes the process, not the
 * database, and the thing being protected is the database.
 *
 * The opt-in must NAME THE HOST rather than being a boolean. A truthy flag is
 * the thing that gets set once and then silently authorises whatever database
 * DATABASE_URL happens to point at six months later; a flag that has to match
 * the host stops applying the moment the target changes. It is a way to say
 * "yes, that specific database is a scratch database", not "stop asking me".
 *
 * Lives in `src/utils` rather than inside seed.ts so it can be tested. The seed
 * script itself is not covered by either tsconfig.
 */

/** Thrown rather than `process.exit`, so the failure is testable and catchable. */
export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefusedError";
  }
}

export const SEED_REFUSAL_MESSAGE =
  "Refusing to seed: NODE_ENV=production. This script deletes every " +
  "organization, user, session and attendance record it owns, and creates demo " +
  "accounts whose passwords are committed to this repository. " +
  "There is no override flag — run it against a development or test database.";

/**
 * Hosts that cannot be anybody's shared or hosted database.
 *
 * `host.docker.internal` is here because a containerised seed reaching the
 * developer's own machine is the same situation as localhost.
 */
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

/**
 * The host a connection string points at, or null if it cannot be determined.
 *
 * Note the URL parser takes the userinfo as everything up to the LAST `@` in
 * the authority, so a password containing `@` — which real generated passwords
 * do — still resolves the host correctly.
 */
export const databaseHostOf = (databaseUrl: string): string | null => {
  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    // Strip the brackets the URL parser keeps around IPv6 literals.
    const bare = hostname.replace(/^\[|\]$/g, "");
    return bare.length > 0 ? bare : null;
  } catch {
    return null;
  }
};

export const remoteHostRefusalMessage = (host: string): string =>
  `Refusing to seed: DATABASE_URL points at "${host}", which is not a local ` +
  "database. This script deletes every organization, user, session and " +
  "attendance record it owns, and creates demo accounts whose passwords are " +
  "committed to this repository. NODE_ENV describes the " +
  "process, not the database, so it cannot tell you this is safe. If that host " +
  `really is a scratch database, set SEED_ALLOW_REMOTE_HOST="${host}" — naming ` +
  "it is the point, so the permission stops applying if the target changes.";

export const UNPARSEABLE_URL_REFUSAL_MESSAGE =
  "Refusing to seed: DATABASE_URL is set but its host could not be determined, " +
  "so this script cannot tell whether it is about to wipe a local database or a " +
  "live one. Fix the connection string rather than bypassing this check.";

/**
 * Throws unless it is safe to run the seed.
 *
 * Takes the environment rather than reading `process.env` so a test can ask the
 * question without mutating the process it runs in.
 */
export const assertSeedAllowed = (
  environment: NodeJS.ProcessEnv = process.env
): void => {
  if (environment.NODE_ENV === "production") {
    throw new SeedRefusedError(SEED_REFUSAL_MESSAGE);
  }

  const databaseUrl = environment.DATABASE_URL;

  // Nothing to protect: with no connection string the seed cannot reach a
  // database at all. This is config validation's job, not the guard's.
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return;
  }

  const host = databaseHostOf(databaseUrl);

  // Present but unreadable — fail closed. Not knowing which database this is
  // is precisely the situation the guard exists for.
  if (host === null) {
    throw new SeedRefusedError(UNPARSEABLE_URL_REFUSAL_MESSAGE);
  }

  if (LOCAL_HOSTS.has(host)) {
    return;
  }

  // Exact match, case-insensitive on the host only. Deliberately not a truthy
  // check: "true" must not authorise anything.
  const allowed = environment.SEED_ALLOW_REMOTE_HOST?.trim().toLowerCase();
  if (allowed === host) {
    return;
  }

  throw new SeedRefusedError(remoteHostRefusalMessage(host));
};
