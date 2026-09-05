/**
 * Live, self-cleaning Supabase registration verification.
 *
 * Creates one uniquely named throwaway identity, completes registration twice
 * through the public backend endpoint, proves authority is forced to a pending
 * STUDENT, then removes both the application row and Supabase identity. No
 * credential, key, token, identity id, or generated email is printed.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import {
  API,
  DEMO_PASSWORD,
  check,
  env,
  finish,
  profileOf,
  section,
} from "./auth-harness.js";

const prisma = new PrismaClient();

const main = async () => {
  const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const browser = createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `phase3-registration-${suffix}@leornian.dev`;
  const universityId = `PHASE3-${suffix}`.slice(0, 50);
  let identityId: string | null = null;
  let applicationCreated = false;

  section("Live registration — create, complete, repeat, and clean up");

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        registration: {
          universityId,
          fullName: "Phase Three Verification",
          organizationCode: "NCTU",
        },
        // Deliberately hostile authority metadata: the backend must ignore it.
        role: "SYSTEM_OWNER",
        accountStatus: "ACTIVE",
      },
    });

    check("throwaway Supabase identity was created", !created.error && !!created.data.user);
    if (created.error || !created.data.user) return;
    identityId = created.data.user.id;

    const signedIn = await browser.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    });
    check("confirmed identity can obtain a browser session", !signedIn.error && !!signedIn.data.session);
    if (!signedIn.data.session) return;

    const complete = async () => {
      const response = await fetch(`${API}/api/auth/register/supabase`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${signedIn.data.session!.access_token}`,
          "content-type": "application/json",
          "X-Client-Platform": "mobile",
        },
        body: "{}",
      });
      return { status: response.status, body: await response.json() };
    };

    const first = await complete();
    const firstBody = first.body as Record<string, unknown>;
    const firstUser = profileOf(first.body);
    applicationCreated = first.status === 201 && firstBody.created === true;
    check("first completion creates the application account", first.status === 201 && firstBody.created === true);
    check("registration is forced to STUDENT", firstUser?.role === "STUDENT");
    check("registration is forced to PENDING", firstUser?.accountStatus === "PENDING");

    const second = await complete();
    const secondBody = second.body as Record<string, unknown>;
    const secondUser = profileOf(second.body);
    check("repeated completion is idempotent", second.status === 200 && secondBody.created === false);
    check("repeated completion returns the same account", secondUser?.id === firstUser?.id);

    const stored = await prisma.user.findUnique({
      where: { authUserId: identityId },
      select: {
        role: true,
        accountStatus: true,
        isVerified: true,
        passwordHash: true,
        studentProfile: { select: { status: true } },
      },
    });
    check(
      "stored account has the safe pending-student projection",
      stored?.role === "STUDENT" &&
        stored.accountStatus === "PENDING" &&
        stored.isVerified === false &&
        stored.passwordHash === null &&
        stored.studentProfile?.status === "INCOMPLETE"
    );
  } finally {
    const removedRows = await prisma.user.deleteMany({
      where: {
        email,
        ...(identityId ? { authUserId: identityId } : {}),
      },
    });
    check(
      "throwaway application account was removed",
      removedRows.count === (applicationCreated ? 1 : 0)
    );
    check("no throwaway application row remains", (await prisma.user.count({ where: { email } })) === 0);

    if (identityId) {
      const removedIdentity = await admin.auth.admin.deleteUser(identityId);
      check("throwaway Supabase identity was removed", !removedIdentity.error);
    }
  }
};

main()
  .then(() => finish())
  .catch((error) => {
    console.error("\nVERIFICATION ABORTED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
