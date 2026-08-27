/**
 * Stage 11, without a browser: the web client's session lifecycle.
 *
 * This drives the SAME library the web app uses (supabase-js configured exactly
 * as apps/web/src/lib/supabase.ts configures it — persistSession,
 * autoRefreshToken, PKCE) against the SAME live backend, substituting an
 * in-memory store for localStorage. A page refresh is simulated by discarding
 * the client and building a new one over the same storage, which is precisely
 * what a reload does.
 *
 * It is NOT a substitute for clicking through the running app: it exercises the
 * session mechanics, not the React wiring or the rendered UI.
 *
 * No password, token or key is printed.
 */
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS, callApi, check, env, finish, profileOf, section } from "./auth-harness.js";

/** Stands in for window.localStorage, which is all supabase-js needs. */
const makeStorage = () => {
  const map = new Map<string, string>();
  return {
    store: map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

/** Mirrors apps/web/src/lib/supabase.ts, with storage injected. */
const makeClient = (storage: ReturnType<typeof makeStorage>) =>
  createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // no browser URL to read
      storage,
    },
  });

const main = async () => {
  const storage = makeStorage();

  /* Login ---------------------------------------------------------------- */
  section("Stage 11a — login through Supabase, then call the live backend");

  const client = makeClient(storage);
  const { data, error } = await client.auth.signInWithPassword({
    email: ACCOUNTS.universityAdmin,
    password: process.env.SEED_DEMO_PASSWORD ?? "Demo@12345",
  });

  check("login succeeds", !error && !!data.session, error?.message ?? "");
  if (!data.session) return finish();

  check("a session was persisted to storage", storage.store.size > 0, `${storage.store.size} key(s)`);

  const first = await callApi("/api/auth/profile", data.session.access_token);
  check("the backend accepts the browser's access token", first.status === 200, `status ${first.status}`);
  check(
    "it resolves the signed-in user",
    profileOf(first.body)?.email === ACCOUNTS.universityAdmin,
    profileOf(first.body)?.email ?? "no profile"
  );

  /* Restoration ----------------------------------------------------------- */
  section("Stage 11b — session restoration after a page refresh");

  // A reload throws the client away and builds a new one over the same storage.
  const afterReload = makeClient(storage);
  const restored = await afterReload.auth.getSession();

  check("a new client restores the session from storage", !!restored.data.session);
  check(
    "the restored session belongs to the same user",
    restored.data.session?.user.id === data.session.user.id
  );

  const second = await callApi("/api/auth/profile", restored.data.session!.access_token);
  check("the restored token still works against the backend", second.status === 200, `status ${second.status}`);

  /* Refresh --------------------------------------------------------------- */
  section("Stage 11c — access-token refresh");

  const refreshed = await afterReload.auth.refreshSession();
  check("refresh returns a new session", !refreshed.error && !!refreshed.data.session, refreshed.error?.message ?? "");

  const newToken = refreshed.data.session?.access_token;
  check("the access token actually changed", !!newToken && newToken !== data.session.access_token);
  check(
    "the refreshed session is still the same user",
    refreshed.data.session?.user.id === data.session.user.id
  );

  const third = await callApi("/api/auth/profile", newToken);
  check("the backend accepts the refreshed token", third.status === 200, `status ${third.status}`);

  /* Logout ---------------------------------------------------------------- */
  section("Stage 11d — logout clears the session");

  const { error: signOutError } = await afterReload.auth.signOut();
  check("sign-out succeeds", !signOutError, signOutError?.message ?? "");

  const afterLogout = makeClient(storage);
  const gone = await afterLogout.auth.getSession();
  check("no session can be restored after logout", !gone.data.session);
  check("storage no longer holds a session", storage.store.size === 0, `${storage.store.size} key(s) left`);

  // The refresh token is revoked, so a new session cannot be minted.
  const reuse = await afterLogout.auth.refreshSession({
    refresh_token: data.session.refresh_token,
  });
  check("the old refresh token can no longer mint a session", !!reuse.error || !reuse.data.session);

  // Note, deliberately not asserted as a rejection: the ALREADY-ISSUED access
  // token is a stateless JWT and stays valid until it expires. Supabase logout
  // revokes the refresh token, it does not retroactively invalidate a live
  // access token. Immediate revocation is an application-level concern and is
  // what `isActive` / `accountStatus` in auth.middleware.ts exist for — proven
  // separately in stage 7.
  const stale = await callApi("/api/auth/profile", data.session.access_token);
  console.log(
    `  note  the pre-logout access token still returns ${stale.status} until it expires — ` +
      `expected for stateless JWTs; see stage 7 for immediate application-level revocation`
  );

  finish();
};

main().catch((error) => {
  console.error("\nVERIFICATION ABORTED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
