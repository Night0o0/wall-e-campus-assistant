import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { unauthorized } from "../utils/AppError.js";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let adminClient: SupabaseClient | null = null;

const issuer = () => `${env.SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`;

const keySet = () => {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${issuer()}/.well-known/jwks.json`)
    );
  }

  return jwks;
};

/** Decode only to select the verifier; no claim from this function is trusted. */
export const looksLikeSupabaseToken = (token: string) => {
  if (!env.SUPABASE_URL) return false;

  try {
    return decodeJwt(token).iss === issuer();
  } catch {
    return false;
  }
};

export interface SupabaseIdentityClaims {
  authUserId: string;
  email: string | null;
  userMetadata: Record<string, unknown>;
}

/**
 * Verify every identity claim the application consumes.
 *
 * Callers must use this result rather than decoding the token a second time:
 * the payload returned here is the one whose signature, issuer, audience and
 * lifetime were verified by jose.
 */
export const verifySupabaseIdentity = async (
  token: string
): Promise<SupabaseIdentityClaims> => {
  if (!env.SUPABASE_URL) {
    throw unauthorized("Supabase authentication is not configured");
  }

  try {
    const { payload } = await jwtVerify(token, keySet(), {
      issuer: issuer(),
      audience: env.SUPABASE_JWT_AUDIENCE,
    });

    if (!payload.sub) throw new Error("Missing subject");

    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : null;
    const userMetadata =
      payload.user_metadata &&
      typeof payload.user_metadata === "object" &&
      !Array.isArray(payload.user_metadata)
        ? (payload.user_metadata as Record<string, unknown>)
        : {};

    return { authUserId: payload.sub, email, userMetadata };
  } catch {
    throw unauthorized("Invalid or expired access token");
  }
};

/** Backward-compatible subject-only verifier used by existing callers/tests. */
export const verifySupabaseAccessToken = async (token: string) =>
  (await verifySupabaseIdentity(token)).authUserId;

/**
 * Server-only administrative client used to provision staff identities.
 * Domain data is still read and written through Prisma and the policy layer.
 */
export const getSupabaseAdmin = () => {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase Admin is not configured; set URL, publishable key and service role key"
    );
  }

  if (!adminClient) {
    adminClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
  }

  return adminClient;
};
