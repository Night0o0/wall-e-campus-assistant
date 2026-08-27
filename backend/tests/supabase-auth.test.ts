import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * What the backend must refuse, proven with tokens it cannot get from Supabase.
 *
 * The live runtime check (scripts/verify-supabase-auth.ts) proves a real
 * Supabase session is accepted and that garbage is refused. It cannot prove
 * WHY: every tampered token fails on the signature first, so issuer, audience,
 * expiry and subject are never reached. Testing those individually needs tokens
 * that are correctly SIGNED but wrong in exactly one respect, which means
 * holding the signing key — so these tests generate their own keypair and serve
 * it as the project's JWKS.
 *
 * Each case below changes exactly one thing away from a token that is otherwise
 * valid, so a passing test names the single check that rejected it.
 */

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let privateKey: PrivateKey;
let publicJwk: JWK;

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return {
    ...actual,
    // Serve the locally generated key instead of fetching the project's JWKS.
    createRemoteJWKSet: () => async () =>
      actual.importJWK(publicJwk, "ES256"),
  };
});

// Static imports: vitest hoists vi.mock above them, so these still get the mock.
import { env } from "../src/config/env.js";
import { looksLikeSupabaseToken, verifySupabaseAccessToken } from "../src/lib/supabase-auth.js";

const ISSUER = `${env.SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`;
const AUDIENCE = env.SUPABASE_JWT_AUDIENCE;
const SUBJECT = "11111111-2222-4333-8444-555555555555";

interface TokenOverrides {
  issuer?: string;
  audience?: string;
  subject?: string | null;
  expiresIn?: number;
  issuedAt?: number;
}

const makeToken = async (overrides: TokenOverrides = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const {
    issuer = ISSUER,
    audience = AUDIENCE,
    subject = SUBJECT,
    expiresIn = 3600,
    issuedAt = now,
  } = overrides;

  let builder = new SignJWT({ email: "someone@leornian.dev", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(now + expiresIn);

  if (subject !== null) builder = builder.setSubject(subject);

  return builder.sign(privateKey);
};

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
  publicJwk.alg = "ES256";
});

describe("a token that is correct in every respect", () => {
  it("is accepted, and yields the subject the backend looks the user up by", async () => {
    await expect(verifySupabaseAccessToken(await makeToken())).resolves.toBe(SUBJECT);
  });
});

describe("signature validation", () => {
  it("refuses a token signed by a different key", async () => {
    const other = await generateKeyPair("ES256");
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(SUBJECT)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(other.privateKey);

    await expect(verifySupabaseAccessToken(forged)).rejects.toThrow();
  });

  it("refuses a token whose payload was edited after signing", async () => {
    const token = await makeToken();
    const [header, , signature] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: "somebody-else", exp: 9999999999 })
    ).toString("base64url");

    await expect(
      verifySupabaseAccessToken(`${header}.${tampered}.${signature}`)
    ).rejects.toThrow();
  });

  it("refuses an unsigned token even when every claim is right", async () => {
    // alg:none is the classic bypass. It must not be honoured.
    const payload = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: SUBJECT, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");

    await expect(verifySupabaseAccessToken(`${header}.${payload}.`)).rejects.toThrow();
  });
});

describe("issuer validation", () => {
  it("refuses a correctly signed token from another issuer", async () => {
    await expect(
      verifySupabaseAccessToken(await makeToken({ issuer: "https://evil.example.com/auth/v1" }))
    ).rejects.toThrow();
  });

  it("refuses another Supabase project in the same region", async () => {
    // The pooler hostname is shared; the issuer is what separates projects.
    await expect(
      verifySupabaseAccessToken(
        await makeToken({ issuer: "https://someoneelsesproject.supabase.co/auth/v1" })
      )
    ).rejects.toThrow();
  });

  it("refuses a near-miss issuer", async () => {
    await expect(
      verifySupabaseAccessToken(await makeToken({ issuer: `${ISSUER}/` }))
    ).rejects.toThrow();
  });
});

describe("audience validation", () => {
  it("refuses a token minted for a different audience", async () => {
    await expect(
      verifySupabaseAccessToken(await makeToken({ audience: "some-other-service" }))
    ).rejects.toThrow();
  });
});

describe("expiration validation", () => {
  it("refuses an expired token", async () => {
    await expect(
      verifySupabaseAccessToken(await makeToken({ expiresIn: -60, issuedAt: Math.floor(Date.now() / 1000) - 3600 }))
    ).rejects.toThrow();
  });

  it("accepts a token that has not expired yet", async () => {
    await expect(
      verifySupabaseAccessToken(await makeToken({ expiresIn: 30 }))
    ).resolves.toBe(SUBJECT);
  });
});

describe("subject validation", () => {
  it("refuses a token with no subject, which identifies nobody", async () => {
    await expect(verifySupabaseAccessToken(await makeToken({ subject: null }))).rejects.toThrow();
  });
});

describe("failures do not leak", () => {
  it("reports every rejection the same way, whatever went wrong", async () => {
    // Distinguishing "wrong issuer" from "expired" in the response would tell an
    // attacker which knob to turn next.
    const messages = new Set<string>();

    for (const token of [
      await makeToken({ issuer: "https://evil.example.com/auth/v1" }),
      await makeToken({ audience: "other" }),
      await makeToken({ expiresIn: -60, issuedAt: Math.floor(Date.now() / 1000) - 3600 }),
      await makeToken({ subject: null }),
    ]) {
      await verifySupabaseAccessToken(token).catch((error: Error) =>
        messages.add(error.message)
      );
    }

    expect(messages.size).toBe(1);
    expect([...messages][0]).toMatch(/invalid or expired/i);
  });
});

describe("routing a token to the right verifier", () => {
  it("recognises this project's tokens", async () => {
    expect(looksLikeSupabaseToken(await makeToken())).toBe(true);
  });

  it("does not claim a legacy application JWT", () => {
    // No `iss` at all: this is what the legacy signer produces, and it must
    // fall through to the legacy branch (which AUTH_PROVIDER=supabase refuses).
    const legacy = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ id: "some-user-id" })).toString("base64url"),
      "signature",
    ].join(".");

    expect(looksLikeSupabaseToken(legacy)).toBe(false);
  });

  it("does not claim another issuer's token", async () => {
    expect(
      looksLikeSupabaseToken(await makeToken({ issuer: "https://evil.example.com/auth/v1" }))
    ).toBe(false);
  });

  it("does not throw on garbage", () => {
    expect(looksLikeSupabaseToken("not-a-token")).toBe(false);
    expect(looksLikeSupabaseToken("")).toBe(false);
  });
});
