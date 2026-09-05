import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { getSupabaseAdmin } from "../src/lib/supabase-auth.js";

/**
 * That the suite cannot reach a real service.
 *
 * This is a regression test for an incident, not a hypothetical. Flipping
 * AUTH_PROVIDER to "supabase" in a local .env made the unit suite provision
 * three real identities in the live Supabase project from test fixtures. The
 * run looked like an ordinary set of failures; the writes were silent.
 *
 * Two things now prevent it, and this file asserts both, because either one
 * alone would leave a way through:
 *
 *   1. vitest pins AUTH_PROVIDER, so the Supabase branch is not entered by a
 *      developer's ambient configuration.
 *   2. A fetch guard blocks any non-loopback request, so a path that reaches
 *      for the network fails loudly wherever it lives.
 *
 * The first without the second would let a future test that sets
 * AUTH_PROVIDER=supabase itself hit the live project — which is precisely the
 * mistake being guarded against.
 */

describe("the suite runs against a pinned configuration", () => {
  it("uses the legacy provider regardless of the developer's .env", () => {
    // vitest.config.ts sets this; dotenv does not overwrite an existing value.
    expect(env.AUTH_PROVIDER).toBe("legacy");
  });
});

describe("the suite cannot reach the network", () => {
  it("blocks an unmocked Supabase Admin call", async () => {
    // The real client, unmocked, exactly as the incident had it.
    //
    // Note supabase-js does NOT throw on a transport failure: it catches and
    // returns { data, error }. So a blocked call surfaces as an error field
    // beside an EMPTY user list.
    const result = await getSupabaseAdmin().auth.admin.listUsers();

    expect(result.error).toBeTruthy();
    expect(result.data.users).toEqual([]);
  });

  it("is why callers must check the error and not an empty result", async () => {
    // Stated explicitly so the dangerous misreading is not reintroduced: a
    // blocked or failed call is indistinguishable from "no such user" unless
    // the error is checked. seed-identity.ts throws on it for exactly this
    // reason — treating it as absence would make the seed create a duplicate
    // identity for an account that already exists.
    const result = await getSupabaseAdmin().auth.admin.listUsers();

    const looksLikeNobodyFound = result.data.users.length === 0;
    expect(looksLikeNobodyFound).toBe(true);
    expect(result.error).toBeTruthy();
  });

  it("blocks a plain fetch to a remote host", async () => {
    await expect(fetch("https://example.com/anything")).rejects.toThrow(
      /Blocked a network call/
    );
  });

  it("blocks the Supabase project host specifically", async () => {
    await expect(fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`)).rejects.toThrow(
      /Blocked a network call/
    );
  });

  it("explains how to do it properly rather than just failing", async () => {
    const error = await fetch("https://example.com").catch((e: Error) => e);
    expect((error as Error).message).toMatch(/Mock the client instead/);
  });

  it("fails closed on a target it cannot parse", async () => {
    await expect(fetch("::::not-a-url::::")).rejects.toThrow(/Blocked a network call/);
  });
});
