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

/** Verify signature, issuer, audience and subject using the project's JWKS. */
export const verifySupabaseAccessToken = async (token: string) => {
  if (!env.SUPABASE_URL) {
    throw unauthorized("Supabase authentication is not configured");
  }

  try {
    const { payload } = await jwtVerify(token, keySet(), {
      issuer: issuer(),
      audience: env.SUPABASE_JWT_AUDIENCE,
    });

    if (!payload.sub) throw new Error("Missing subject");
    return payload.sub;
  } catch {
    throw unauthorized("Invalid or expired access token");
  }
};

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
