/**
 * The one thing standing between `npm run db:seed` and a production database.
 *
 * The seed script is destructive by design: `wipe()` empties every table it owns
 * — attendance, sessions, schedules, courses, devices, users, organizations —
 * so that re-seeding is repeatable. That is correct for a demo dataset and
 * catastrophic anywhere else, and until now the only thing gating it was
 * SEED_KEEP_EXISTING, which is a convenience flag rather than a safety one:
 * it defaults to "wipe", so forgetting it is the destructive outcome.
 *
 * This refusal is deliberately NOT expressed in terms of SEED_KEEP_EXISTING.
 * Even with the wipe skipped, the seed writes demo universities, demo students
 * and a robot credential whose secret is a constant committed to this
 * repository — none of which may exist in a production database. So the check
 * is on NODE_ENV alone, and there is no environment variable that overrides it:
 * an escape hatch here would be the thing that eventually gets set in the
 * deployment that needed protecting.
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
  "accounts whose passwords and device secret are committed to this repository. " +
  "There is no override flag — run it against a development or test database.";

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
};
