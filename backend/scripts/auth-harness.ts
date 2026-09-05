/**
 * Shared helpers for the Phase 3 authentication verification.
 *
 * Signs seeded accounts in through Supabase with the PUBLISHABLE key — the same
 * key a browser or handset would use — and calls the backend with the resulting
 * access token, exactly as a real client does. The service-role key is never
 * loaded here.
 *
 * Run these scripts from the backend/ directory: the .env path is relative to
 * the working directory.
 *
 * Nothing in this file prints a password, an access token, a refresh token or
 * any key. Tokens are returned to callers as values, never logged; helpers that
 * describe a token emit claims and booleans only.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

export const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
) as Record<string, string>;

export const API = process.env.API_BASE ?? `http://localhost:${env.PORT ?? 5000}`;
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo@12345";

/** A browser-equivalent client: publishable key only, no session persistence. */
export const anonClient = () =>
  createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Sign in through Supabase. Throws with the provider's message on failure. */
export const signIn = async (email: string): Promise<Session> => {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });

  if (error) throw new Error(`Supabase sign-in failed for ${email}: ${error.message}`);
  if (!data.session) throw new Error(`Supabase returned no session for ${email}`);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.user!.id,
  };
};

/** Claims only — never the token itself. */
export const claimsOf = (token: string) => {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload!, "base64url").toString()) as {
    iss: string;
    aud: string | string[];
    sub: string;
    exp: number;
    iat: number;
    email?: string;
    role?: string;
  };
};

export const headerOf = (token: string) => {
  const [header] = token.split(".");
  return JSON.parse(Buffer.from(header!, "base64url").toString()) as {
    alg: string;
    kid?: string;
    typ?: string;
  };
};

export interface ApiResult {
  status: number;
  body: unknown;
  code?: string;
  message?: string;
}

export const callApi = async (
  path: string,
  token?: string,
  init: RequestInit = {}
): Promise<ApiResult> => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let body: unknown = null;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  const record = (body ?? {}) as Record<string, unknown>;
  return {
    status: response.status,
    body,
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
};

export interface Profile {
  id: string;
  email: string;
  role: string;
  accountStatus?: string;
  organizationId?: string;
}

/**
 * Pulls the user out of a profile response.
 *
 * /api/auth/profile answers { user: {...} }; other endpoints answer { data }
 * or the object itself. Accepting all three keeps a shape difference from
 * being reported as an authentication failure.
 */
export const profileOf = (body: unknown): Profile | null => {
  const b = (body ?? {}) as Record<string, unknown>;
  const candidate = (b.user ?? b.data ?? b) as Profile | undefined;
  return candidate && typeof candidate.email === "string" ? candidate : null;
};

/* Reporting -------------------------------------------------------------- */

let failures = 0;

export const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

export const section = (title: string) => console.log(`\n=== ${title} ===`);

export const finish = () => {
  console.log(
    failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
  );
  process.exitCode = failures === 0 ? 0 : 1;
};

export const ACCOUNTS = {
  owner: "owner@leornian.dev",
  universityAdmin: "admin.nctu@leornian.dev",
  otherUniversityAdmin: "admin.cu@leornian.dev",
  departmentAdmin: "dept.mechatronics@leornian.dev",
  instructorA: "instructor.a@leornian.dev",
  instructorB: "instructor.b@leornian.dev",
  instructorCu: "instructor.cu@leornian.dev",
  studentApproved: "student.approved@leornian.dev",
  studentPending: "student.pending@leornian.dev",
  studentRejected: "student.rejected@leornian.dev",
  studentDisabled: "student.disabled@leornian.dev",
  studentCu: "student.cu@leornian.dev",
} as const;
