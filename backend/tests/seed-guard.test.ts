import { describe, expect, it } from "vitest";
import {
  SEED_REFUSAL_MESSAGE,
  SeedRefusedError,
  UNPARSEABLE_URL_REFUSAL_MESSAGE,
  assertSeedAllowed,
  databaseHostOf,
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

/**
 * The second check, added after the first one was found to miss the case that
 * actually happens: NODE_ENV=development on a developer's machine while
 * DATABASE_URL points at a hosted database. The guard saw "development",
 * allowed the run, and `wipe()` would have emptied a live instance.
 *
 * NODE_ENV describes the process. The thing being protected is the database.
 */

const LOCAL = "postgresql://u:p@localhost:5432/postgres";
const REMOTE = "postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

describe("refusing to seed a database that is not local", () => {
  it("refuses a remote host even when NODE_ENV is development", () => {
    // The exact situation this check was added for.
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "development", DATABASE_URL: REMOTE })
    ).toThrow(SeedRefusedError);
  });

  it("names the host it refused, so the message identifies the database", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "development", DATABASE_URL: REMOTE })
    ).toThrow(/aws-0-eu-west-1\.pooler\.supabase\.com/);
  });

  it("allows local hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "host.docker.internal",
    ]) {
      expect(() =>
        assertSeedAllowed({
          NODE_ENV: "development",
          DATABASE_URL: `postgresql://u:p@${host}:5432/postgres`,
        })
      ).not.toThrow();
    }
  });

  it("allows a remote host only when that exact host is named", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE,
        SEED_ALLOW_REMOTE_HOST: "aws-0-eu-west-1.pooler.supabase.com",
      })
    ).not.toThrow();
  });

  it("does not accept a truthy value as permission", () => {
    // The whole point of naming the host: a boolean is what gets set once and
    // then silently authorises whatever DATABASE_URL points at later.
    for (const value of ["true", "1", "yes", "*", "all"]) {
      expect(() =>
        assertSeedAllowed({
          NODE_ENV: "development",
          DATABASE_URL: REMOTE,
          SEED_ALLOW_REMOTE_HOST: value,
        })
      ).toThrow(SeedRefusedError);
    }
  });

  it("does not let permission for one host authorise another", () => {
    // A stale value carried over from a different project must not apply.
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE,
        SEED_ALLOW_REMOTE_HOST: "some-other-db.example.com",
      })
    ).toThrow(SeedRefusedError);
  });

  it("still refuses production even when the host is named", () => {
    // The two checks are independent. Naming a host is not a production
    // override, and must never become one.
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        DATABASE_URL: REMOTE,
        SEED_ALLOW_REMOTE_HOST: "aws-0-eu-west-1.pooler.supabase.com",
      })
    ).toThrow(SEED_REFUSAL_MESSAGE);
  });

  it("fails closed when DATABASE_URL is set but unreadable", () => {
    // Not knowing which database this is, is the situation the guard exists
    // for. Refuse rather than guess.
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "development", DATABASE_URL: "not a url" })
    ).toThrow(UNPARSEABLE_URL_REFUSAL_MESSAGE);
  });

  it("allows an absent DATABASE_URL, which can reach nothing", () => {
    for (const value of [undefined, "", "   "]) {
      expect(() =>
        assertSeedAllowed({ NODE_ENV: "development", DATABASE_URL: value })
      ).not.toThrow();
    }
  });

  it("keeps the local check working when NODE_ENV is unset", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: LOCAL })).not.toThrow();
    expect(() => assertSeedAllowed({ DATABASE_URL: REMOTE })).toThrow(
      SeedRefusedError
    );
  });
});

describe("reading the host out of a connection string", () => {
  it("resolves an ordinary connection string", () => {
    expect(databaseHostOf(LOCAL)).toBe("localhost");
  });

  it("resolves a host when the password contains an @", () => {
    // Real generated passwords do. The URL parser takes userinfo up to the LAST
    // @ in the authority, so this must still find the host - getting it wrong
    // here would make the guard read the wrong hostname and let a remote
    // database through.
    expect(
      databaseHostOf("postgresql://user:pa@ss@db.example.com:5432/postgres")
    ).toBe("db.example.com");
  });

  it("lowercases the host so case cannot defeat the comparison", () => {
    expect(databaseHostOf("postgresql://u:p@LocalHost:5432/postgres")).toBe(
      "localhost"
    );
  });

  it("strips the brackets around an IPv6 literal", () => {
    expect(databaseHostOf("postgresql://u:p@[::1]:5432/postgres")).toBe("::1");
  });

  it("returns null rather than throwing on nonsense", () => {
    expect(databaseHostOf("not a url")).toBeNull();
  });
});
