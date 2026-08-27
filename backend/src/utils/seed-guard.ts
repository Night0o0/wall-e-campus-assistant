/**
 * The one thing standing between `npm run db:seed` and a production database.
 *
 * WHAT IS BEING GUARDED, AS OF PHASE 2
 *
 * The seed no longer deletes anything. It used to open with `wipe()`, emptying
 * every table it owned so re-seeding was repeatable; that was removed once the
 * seed became idempotent, because upserts give repeatability without the
 * destruction. Earlier revisions of these messages described that wipe, and
 * were left behind by the change.
 *
 * The remaining danger is not deletion but CONTENT, and it is still
 * disqualifying:
 *
 *   - It writes demo universities, demo staff and demo students whose password
 *     is a literal committed to this repository, so anyone who can read the
 *     repository can sign in as any of them.
 *   - Each of those accounts is created in Supabase Auth as well, using the
 *     service-role key. Identities outlive the application rows — dropping the
 *     `public` schema does not remove them — so a mistake here is not undone by
 *     rebuilding the database.
 *   - Every write is an upsert keyed on an email address, organization code or
 *     derived id. Against a real deployment that does not delete rows; it
 *     OVERWRITES any record sharing those keys, which is its own kind of loss.
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
 * and demo accounts land in a live instance. NODE_ENV describes the process,
 * not the database, and the thing being protected is the database.
 *
 * The opt-in must NAME THE HOST rather than being a boolean. A truthy flag is
 * the thing that gets set once and then silently authorises whatever database
 * DATABASE_URL happens to point at six months later; a flag that has to match
 * the host stops applying the moment the target changes. It is a way to say
 * "yes, that specific database is a scratch database", not "stop asking me".
 *
 * Lives in `src/utils` rather than inside the seed so it can be tested.
 */

/** Thrown rather than `process.exit`, so the failure is testable and catchable. */
export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefusedError";
  }
}

export const SEED_REFUSAL_MESSAGE =
  "Refusing to seed: NODE_ENV=production. This script creates demo " +
  "universities and demo accounts whose password is a literal committed to " +
  "this repository, in Supabase Auth as well as in this database, and " +
  "overwrites any existing record that shares their email addresses, " +
  "organization codes or derived ids. Supabase identities survive a database " +
  "rebuild, so this is not undone by re-running migrations. " +
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

/**
 * The database a connection string actually names, which on Supabase is NOT
 * the host.
 *
 * `aws-0-eu-west-1.pooler.supabase.com` is a shared regional pooler: every
 * project in eu-west-1 resolves to it, and the project is identified by the
 * username, `postgres.<project-ref>`. Comparing hosts alone would let
 * permission granted for one project authorise a seed against a different one
 * in the same region — the "permission outlives the target" failure this guard
 * exists to prevent.
 *
 * Falls back to the bare host when the username carries no project ref, which
 * is every direct connection, so existing local and non-Supabase URLs are
 * unaffected. This mirrors `targetOf` in scripts/rebuild-database.mjs; the two
 * guards deliberately behave the same way.
 */
export const databaseTargetOf = (databaseUrl: string): string | null => {
  const host = databaseHostOf(databaseUrl);
  if (host === null) return null;

  try {
    const username = decodeURIComponent(new URL(databaseUrl).username);
    const ref = username.toLowerCase().split(".")[1];
    return ref ? `${ref}@${host}` : host;
  } catch {
    return host;
  }
};

export const remoteHostRefusalMessage = (target: string): string =>
  `Refusing to seed: DATABASE_URL points at "${target}", which is not a local ` +
  "database. This script creates demo universities and demo accounts whose " +
  "password is a literal committed to this repository, in Supabase Auth as " +
  "well as in this database, and overwrites any existing record that shares " +
  "their keys. NODE_ENV describes the process, not the database, so it cannot " +
  "tell you this is safe. If that really is a scratch database, set " +
  `SEED_ALLOW_REMOTE_HOST="${target}" — naming it is the point, so the ` +
  "permission stops applying if the target changes. Note the name is the " +
  "project-qualified target, not just the hostname: one Supabase pooler " +
  "hostname is shared by every project in its region.";

export const UNPARSEABLE_URL_REFUSAL_MESSAGE =
  "Refusing to seed: DATABASE_URL is set but its host could not be determined, " +
  "so this script cannot tell whether it is about to write demo accounts into " +
  "a scratch database or a live one. Fix the connection string rather than " +
  "bypassing this check.";

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

  // Compared against the TARGET, not the host: on a shared Supabase pooler the
  // host names a region, not a database. See databaseTargetOf.
  const target = databaseTargetOf(databaseUrl) ?? host;

  // Exact match, case-insensitive. Deliberately not a truthy check: "true"
  // must not authorise anything.
  const allowed = environment.SEED_ALLOW_REMOTE_HOST?.trim().toLowerCase();
  if (allowed === target) {
    return;
  }

  throw new SeedRefusedError(remoteHostRefusalMessage(target));
};
