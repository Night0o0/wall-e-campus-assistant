import { describe, expect, it } from "vitest";
import {
  SEED_REFUSAL_MESSAGE,
  SeedRefusedError,
  assertSeedAllowed,
} from "../src/utils/seed-guard.js";

/**
 * The seed script empties every table it owns and then writes demo accounts
 * whose passwords, and a robot credential whose secret, are committed to this
 * repository. Until this guard existed the only thing standing in front of that
 * was SEED_KEEP_EXISTING — a convenience flag that defaults to the destructive
 * outcome, so forgetting it is what causes the damage.
 *
 * These tests are deliberately about the *absence* of an escape hatch as much
 * as the presence of the check.
 */

describe("refusing to seed a production database", () => {
  it("throws when NODE_ENV is production", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production" })).toThrow(
      SeedRefusedError
    );
  });

  it("says why, and names what the script would have destroyed", () => {
    // The message is the whole user interface of this failure: whoever sees it
    // is one keystroke from a production wipe and needs to know it.
    expect(() => assertSeedAllowed({ NODE_ENV: "production" })).toThrow(
      SEED_REFUSAL_MESSAGE
    );
  });

  it("refuses regardless of SEED_KEEP_EXISTING", () => {
    // Skipping the wipe is not enough to make seeding safe: the demo
    // organizations, demo students and the committed device secret are as
    // unwelcome in a production database as the deletion is.
    for (const keep of ["true", "false", undefined]) {
      expect(() =>
        assertSeedAllowed({ NODE_ENV: "production", SEED_KEEP_EXISTING: keep })
      ).toThrow(SeedRefusedError);
    }
  });

  it("has no override flag at all", () => {
    // An escape hatch here is the thing that eventually gets set in the
    // deployment that needed protecting. If somebody adds one, this fails.
    const withEveryPlausibleOverride = {
      NODE_ENV: "production",
      SEED_FORCE: "true",
      FORCE: "true",
      SEED_ALLOW_PRODUCTION: "true",
      I_KNOW_WHAT_I_AM_DOING: "true",
      CI: "true",
    };

    expect(() => assertSeedAllowed(withEveryPlausibleOverride)).toThrow(
      SeedRefusedError
    );
  });

  it("allows development and test, which is where the seed belongs", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(() => assertSeedAllowed({ NODE_ENV: nodeEnv })).not.toThrow();
    }
  });

  it("does not treat a production-ish value as production", () => {
    // Exact match only. Guessing at "prod" or "PRODUCTION" would be a different
    // check with a different failure mode; NODE_ENV is a closed enum in
    // config/env.ts and this mirrors it.
    expect(() => assertSeedAllowed({ NODE_ENV: "staging" })).not.toThrow();
  });
});
