/**
 * Phase 3 runtime verification: the whole Supabase authentication path, against
 * a running backend and the live Supabase project.
 *
 *   npm run verify:auth        (backend must be running, AUTH_PROVIDER=supabase)
 *
 * Every session here is obtained the way a real client obtains one: an email
 * and password exchanged through Supabase using the PUBLISHABLE key. The
 * service-role key is used for exactly one thing — creating and then deleting a
 * throwaway identity to prove an identity with no application user is refused —
 * and never leaves this file.
 *
 * No password, token or key is printed.
 */
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import {
  ACCOUNTS,
  callApi,
  check,
  claimsOf,
  env,
  finish,
  section,
  signIn,
  profileOf,
  DEMO_PASSWORD,
} from "./auth-harness.js";

const main = async () => {
  /* ---------------------------------------------------------------- 4 & 5 */
  section("Stages 4-5 — active accounts authenticate and load the right Prisma user");

  const active: Array<[string, string, string]> = [
    ["SYSTEM_OWNER", ACCOUNTS.owner, "SYSTEM_OWNER"],
    ["UNIVERSITY_ADMIN", ACCOUNTS.universityAdmin, "UNIVERSITY_ADMIN"],
    ["UNIVERSITY_ADMIN (other tenant)", ACCOUNTS.otherUniversityAdmin, "UNIVERSITY_ADMIN"],
    ["DEPARTMENT_ADMIN", ACCOUNTS.departmentAdmin, "DEPARTMENT_ADMIN"],
    ["INSTRUCTOR", ACCOUNTS.instructorA, "INSTRUCTOR"],
    ["INSTRUCTOR (other tenant)", ACCOUNTS.instructorCu, "INSTRUCTOR"],
    ["STUDENT (approved)", ACCOUNTS.studentApproved, "STUDENT"],
    ["STUDENT (other tenant)", ACCOUNTS.studentCu, "STUDENT"],
  ];

  const orgs = new Set<string>();

  for (const [label, email, expectedRole] of active) {
    const session = await signIn(email);
    const result = await callApi("/api/auth/profile", session.accessToken);
    const profile = profileOf(result.body);

    check(
      `${label} authenticates`,
      result.status === 200,
      result.status === 200 ? "" : `status ${result.status} ${result.code ?? ""}`
    );
    check(`${label} resolves the right user`, profile?.email === email, profile?.email ?? "no profile");
    check(`${label} has role ${expectedRole}`, profile?.role === expectedRole, profile?.role ?? "?");

    // The Supabase subject is what the backend looked the user up by.
    check(
      `${label} token subject matches its Supabase identity`,
      claimsOf(session.accessToken).sub === session.userId
    );

    if (profile?.organizationId) orgs.add(profile.organizationId);
  }

  check("the two tenants resolve to different organizations", orgs.size === 2, `${orgs.size} distinct`);

  /* -------------------------------------------------------------------- 6 */
  section("Stage 6 — a PENDING student may complete a profile and nothing else");

  const pending = await signIn(ACCOUNTS.studentPending);

  const pendingProfile = await callApi("/api/auth/profile", pending.accessToken);
  check("pending student authenticates", pendingProfile.status === 200, `status ${pendingProfile.status}`);
  check(
    "pending student resolves to the right user",
    profileOf(pendingProfile.body)?.email === ACCOUNTS.studentPending
  );

  const ownProfile = await callApi("/api/students/me/profile", pending.accessToken);
  check(
    "pending student CAN reach profile completion",
    ownProfile.status === 200,
    `status ${ownProfile.status} ${ownProfile.code ?? ""}`
  );

  const gated: Array<[string, string]> = [
    ["timetable", "/api/students/me/schedule"],
    ["attendance history", "/api/attendance/history"],
    ["attendance summary", "/api/attendance/summary"],
    ["materials", "/api/materials/my"],
    ["assignments", "/api/assignments"],
  ];

  for (const [label, path] of gated) {
    const result = await callApi(path, pending.accessToken);
    check(
      `pending student is refused ${label} with ACCOUNT_PENDING_APPROVAL`,
      result.status === 403 && result.code === "ACCOUNT_PENDING_APPROVAL",
      `status ${result.status} code ${result.code ?? "none"}`
    );
  }

  /* -------------------------------------------------------------------- 7 */
  section("Stage 7 — rejected and disabled accounts are refused immediately");

  for (const [label, email] of [
    ["rejected", ACCOUNTS.studentRejected],
    ["disabled", ACCOUNTS.studentDisabled],
  ] as const) {
    // Supabase itself still issues a session: the account is disabled in the
    // application, not in the identity provider. That is exactly the case the
    // backend has to catch on its own.
    const session = await signIn(email);
    check(`${label} account still gets a Supabase session`, !!session.accessToken);

    const result = await callApi("/api/auth/profile", session.accessToken);
    check(
      `${label} account is refused by the backend`,
      result.status === 401,
      `status ${result.status}`
    );
    check(
      `${label} refusal does not leak a profile`,
      profileOf(result.body) === null
    );
  }

  /* -------------------------------------------------------------------- 8 */
  section("Stage 8 — a Supabase identity with no application user is refused");

  const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const strayEmail = `phase3-stray-${Date.now()}@leornian.dev`;
  const created = await admin.auth.admin.createUser({
    email: strayEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    check("could create a throwaway identity for the test", false, created.error?.message ?? "no user");
  } else {
    try {
      const strayId = created.data.user.id;
      const straySession = await signIn(strayEmail);
      check("the stray identity can sign in to Supabase", !!straySession.accessToken);

      const result = await callApi("/api/auth/profile", straySession.accessToken);
      check(
        "backend refuses an identity with no application user",
        result.status === 401,
        `status ${result.status}`
      );
      check("no profile is returned for it", profileOf(result.body) === null);

      const removed = await admin.auth.admin.deleteUser(strayId);
      check("throwaway identity deleted again", !removed.error, removed.error?.message ?? "");
    } catch (error) {
      check("stray identity test completed", false, error instanceof Error ? error.message : String(error));
      await admin.auth.admin.deleteUser(created.data.user.id).catch(() => {});
    }
  }

  /* -------------------------------------------------------------------- 9 */
  section("Stage 9 — malformed, tampered and absent tokens are refused");

  const good = await signIn(ACCOUNTS.studentApproved);
  const [h, p, s] = good.accessToken.split(".");

  const cases: Array<[string, string | undefined]> = [
    ["no Authorization header", undefined],
    ["empty token", ""],
    ["not a JWT at all", "not-a-token"],
    ["two segments only", `${h}.${p}`],
    ["tampered signature", `${h}.${p}.${s!.slice(0, -3)}AAA`],
    ["tampered payload (claims rewritten)", `${h}.${Buffer.from(JSON.stringify({ ...claimsOf(good.accessToken), sub: "00000000-0000-4000-8000-000000000000" })).toString("base64url")}.${s}`],
    ["signature removed", `${h}.${p}.`],
  ];

  for (const [label, token] of cases) {
    const result = await callApi("/api/auth/profile", token);
    check(`refused: ${label}`, result.status === 401, `status ${result.status}`);
  }

  /* ------------------------------------------------------------------- 10 */
  section("Stage 10 — legacy application JWTs are rejected while AUTH_PROVIDER=supabase");

  const realProfile = profileOf((await callApi("/api/auth/profile", good.accessToken)).body);

  const legacyToken = jwt.sign({ id: realProfile?.id ?? "unknown" }, env.JWT_SECRET!, {
    expiresIn: "1h",
  });

  const legacyResult = await callApi("/api/auth/profile", legacyToken);
  check(
    "a validly-signed legacy JWT for a REAL user is refused",
    legacyResult.status === 401,
    `status ${legacyResult.status}`
  );
  check(
    "the refusal says legacy sessions are no longer accepted",
    /legacy/i.test(legacyResult.message ?? ""),
    legacyResult.message ?? "(no message)"
  );
  check("no profile is returned for a legacy token", profileOf(legacyResult.body) === null);

  /* ------------------------------------------------------------------- 12 */
  section("Stage 12 — students are mobile-only and staff are web-only");

  const ownerSession = await signIn(ACCOUNTS.owner);
  const asMobile = { headers: { "X-Client-Platform": "mobile" } };
  const asWeb = { headers: { "X-Client-Platform": "web" } };

  const ownerOnMobile = await callApi("/api/auth/profile", ownerSession.accessToken, asMobile);
  check(
    "owner is refused from mobile with WEB_ONLY_ACCOUNT",
    ownerOnMobile.status === 403 && ownerOnMobile.code === "WEB_ONLY_ACCOUNT",
    `status ${ownerOnMobile.status} code ${ownerOnMobile.code ?? "none"}`
  );
  check("that refusal leaks no profile", profileOf(ownerOnMobile.body) === null);

  const ownerElsewhere = await callApi("/api/organizations", ownerSession.accessToken, asMobile);
  check(
    "the block applies to every route, not just profile",
    ownerElsewhere.status === 403 && ownerElsewhere.code === "WEB_ONLY_ACCOUNT",
    `status ${ownerElsewhere.status}`
  );

  const ownerOnWeb = await callApi("/api/auth/profile", ownerSession.accessToken, asWeb);
  check("owner still works on web", ownerOnWeb.status === 200, `status ${ownerOnWeb.status}`);

  const ownerUndeclared = await callApi("/api/auth/profile", ownerSession.accessToken);
  check("owner still works when no platform is declared", ownerUndeclared.status === 200);

  for (const [label, email] of [
    ["university admin", ACCOUNTS.universityAdmin],
    ["instructor", ACCOUNTS.instructorA],
  ] as const) {
    const session = await signIn(email);
    const result = await callApi("/api/auth/profile", session.accessToken, asMobile);
    check(
      `${label} is refused from mobile`,
      result.status === 403 && result.code === "WEB_ONLY_ACCOUNT",
      `status ${result.status} code ${result.code ?? "none"}`
    );
  }

  const studentSession = await signIn(ACCOUNTS.studentApproved);
  const studentOnMobile = await callApi(
    "/api/auth/profile",
    studentSession.accessToken,
    asMobile
  );
  check("student works on mobile", studentOnMobile.status === 200);

  const studentOnWeb = await callApi(
    "/api/auth/profile",
    studentSession.accessToken,
    asWeb
  );
  check(
    "student is refused from web with MOBILE_ONLY_ACCOUNT",
    studentOnWeb.status === 403 && studentOnWeb.code === "MOBILE_ONLY_ACCOUNT",
    `status ${studentOnWeb.status} code ${studentOnWeb.code ?? "none"}`
  );

  finish();
};

main().catch((error) => {
  console.error("\nVERIFICATION ABORTED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
