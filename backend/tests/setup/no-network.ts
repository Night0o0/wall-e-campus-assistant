/**
 * The unit suite may not talk to the network. Full stop.
 *
 * WHY THIS EXISTS
 *
 * The suite was documented as "deliberately database-free", and the repository
 * doubles held that line for Postgres. Nothing held it for HTTP. When
 * AUTH_PROVIDER was flipped to "supabase" in a local .env, the Supabase branch
 * of AdminService.createUser woke up and provisioned three real identities in
 * the live project from test fixtures — a passing-looking test run that quietly
 * wrote to production infrastructure.
 *
 * vitest.config.ts pins AUTH_PROVIDER so that particular branch is not entered
 * by accident. This is the backstop for every other path: a test that reaches
 * for the network fails loudly, naming the call, instead of succeeding against
 * somebody's real project.
 *
 * A test that needs to exercise an HTTP-backed path mocks the client — see
 * tests/campus-account-identity.test.ts, which mocks getSupabaseAdmin, and
 * tests/supabase-auth.test.ts, which serves its own JWKS.
 *
 * Localhost is allowed so a future integration test can talk to a scratch
 * server; a real remote host never is.
 */
import { beforeAll } from "vitest";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export class UnmockedNetworkCallError extends Error {
  constructor(url: string) {
    super(
      `Blocked a network call from the test suite: ${url}\n\n` +
        `Unit tests must not reach real services. This guard exists because the ` +
        `suite once created live Supabase identities from test fixtures.\n` +
        `Mock the client instead — see tests/campus-account-identity.test.ts.`
    );
    this.name = "UnmockedNetworkCallError";
  }
}

const hostOf = (input: unknown): string | null => {
  try {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    return new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    // Unparseable target: fail closed rather than guess it is harmless.
    return null;
  }
};

beforeAll(() => {
  const realFetch = globalThis.fetch;

  globalThis.fetch = ((input: unknown, init?: unknown) => {
    const host = hostOf(input);

    if (host !== null && LOOPBACK.has(host)) {
      return (realFetch as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
    }

    const described =
      typeof input === "string" ? input : host ?? "an unparseable target";

    // Reject rather than throw: fetch always returns a promise, and a
    // synchronous throw would not be caught by callers awaiting it.
    return Promise.reject(new UnmockedNetworkCallError(described));
  }) as typeof globalThis.fetch;
});
