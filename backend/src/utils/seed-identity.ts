/**
 * Provisioning seed accounts that exist in BOTH Supabase Auth and the
 * application database, without leaving one side dangling.
 *
 * Two facts drive every decision here.
 *
 * FIRST: dropping the `public` schema does not clear `auth.users`. The rebuild
 * script only ever touches `public`; identities live in the `auth` schema and
 * survive it. So "rebuild, then seed" does NOT give a clean slate for
 * identities — the second seed run meets a full set of identities and an empty
 * set of application rows. The seed therefore cannot assume it is creating
 * anything, and idempotency is keyed on the email address, which is the only
 * identifier stable across both systems.
 *
 * SECOND: the two writes cannot be one transaction. Supabase Auth is a separate
 * service reached over HTTP; Postgres cannot roll it back. The identity is
 * created FIRST because the application row needs its id (`User.authUserId`),
 * which means there is a window where an identity exists and its user does not.
 * `provisionAccount` closes that window by compensating: if the database write
 * fails, an identity THIS RUN created is deleted again.
 *
 * The "this run created" qualifier is the whole point. Deleting an adopted
 * identity — one that already existed when the seed started — would destroy an
 * account the seed does not own, on the strength of an unrelated database
 * error. So `created` is tracked per account and cleanup is gated on it.
 *
 * Lives in `src/utils` rather than inside seed.ts so it can be tested against
 * fakes, the same reason seed-guard.ts lives here.
 */

/** The minimum an identity provider has to tell us about an account. */
export interface IdentityRecord {
  id: string;
  email: string;
}

/**
 * The slice of an identity provider the seed needs, as a port.
 *
 * Narrow on purpose: the tests drive the real logic through fakes, with no
 * network and no Supabase project. The Supabase implementation is
 * `supabaseIdentityAdmin` below.
 */
export interface IdentityAdmin {
  /** The existing identity for this email, or null. Must be case-insensitive. */
  findByEmail(email: string): Promise<IdentityRecord | null>;
  create(input: { email: string; password: string }): Promise<IdentityRecord>;
  delete(id: string): Promise<void>;
}

/**
 * The idempotency key. Supabase treats addresses case-insensitively, so the
 * seed must too, or a re-run with different casing would try to create a
 * duplicate and fail.
 */
export const normaliseEmail = (email: string): string =>
  email.trim().toLowerCase();

/**
 * Raised when the application write failed AND the compensating delete also
 * failed, which is the one case that leaves a real orphan behind.
 *
 * It carries both errors and the identity id, because recovering needs the id
 * and diagnosing needs the original failure. Swallowing the cleanup error and
 * rethrowing the original would hide the orphan entirely.
 */
export class SeedIdentityOrphanError extends Error {
  constructor(
    readonly identity: IdentityRecord,
    readonly cause: unknown,
    readonly cleanupFailure: unknown
  ) {
    super(
      `Seeding "${identity.email}" failed, and the Supabase identity created ` +
        `for it could not be removed. Identity ${identity.id} now exists with ` +
        `no application user. Delete it manually before re-running.\n` +
        `  original failure: ${describe(cause)}\n` +
        `  cleanup failure : ${describe(cleanupFailure)}`
    );
    this.name = "SeedIdentityOrphanError";
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export interface EnsuredIdentity {
  identity: IdentityRecord;
  /** True only when THIS call created it. Gates cleanup — see the header. */
  created: boolean;
}

/**
 * Get the identity for an email, creating it only if it is not already there.
 *
 * Looks before it leaps rather than creating and interpreting the failure:
 * provider error messages for "already registered" are not a stable contract,
 * and a lookup is unambiguous. The create is still wrapped, because another
 * process could create the same address in between — in which case the loser
 * of the race adopts rather than failing.
 */
export const ensureIdentity = async (
  admin: IdentityAdmin,
  account: { email: string; password: string }
): Promise<EnsuredIdentity> => {
  const email = normaliseEmail(account.email);

  const existing = await admin.findByEmail(email);
  if (existing) {
    return { identity: existing, created: false };
  }

  try {
    const identity = await admin.create({ email, password: account.password });
    return { identity, created: true };
  } catch (error) {
    // Either a genuine failure or a lost race. A re-read distinguishes them.
    const afterRace = await admin.findByEmail(email);
    if (afterRace) {
      return { identity: afterRace, created: false };
    }
    throw error;
  }
};

/**
 * Create (or adopt) the identity, then write the application row, undoing the
 * identity if the write fails and this run is the one that created it.
 *
 * `write` receives the identity so the caller can store `authUserId`. Anything
 * it returns is passed back untouched.
 */
export const provisionAccount = async <T>(
  admin: IdentityAdmin,
  account: { email: string; password: string },
  write: (identity: IdentityRecord) => Promise<T>
): Promise<{ identity: IdentityRecord; created: boolean; result: T }> => {
  const { identity, created } = await ensureIdentity(admin, account);

  try {
    return { identity, created, result: await write(identity) };
  } catch (error) {
    if (!created) {
      // Adopted. The identity predates this run, so it is not ours to delete.
      throw error;
    }

    try {
      await admin.delete(identity.id);
    } catch (cleanupFailure) {
      throw new SeedIdentityOrphanError(identity, error, cleanupFailure);
    }

    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/* Supabase adapter                                                            */
/* -------------------------------------------------------------------------- */

/** Just enough of supabase-js's admin API to satisfy the port. */
interface SupabaseAdminLike {
  auth: {
    admin: {
      listUsers(params?: { page?: number; perPage?: number }): Promise<{
        data: { users: Array<{ id: string; email?: string | null }> };
        error: { message: string } | null;
      }>;
      createUser(input: {
        email: string;
        password: string;
        email_confirm?: boolean;
      }): Promise<{
        data: { user: { id: string; email?: string | null } | null };
        error: { message: string } | null;
      }>;
      deleteUser(id: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

/** Pages to scan before giving up, so a bad response cannot loop forever. */
const MAX_LOOKUP_PAGES = 50;
const LOOKUP_PAGE_SIZE = 200;

/**
 * Adapts the Supabase admin client to `IdentityAdmin`.
 *
 * `listUsers` is paginated with no server-side email filter in this version of
 * supabase-js, so lookup scans pages. That is acceptable for a seed of a dozen
 * accounts against a development project; it is not a general-purpose lookup.
 *
 * Seeded identities are created with `email_confirm: true`. A seeded account
 * that cannot log in until someone opens a mailbox would defeat the point of
 * seeding it, and confirmation is exercised for real by the Phase 4
 * registration flow instead.
 */
export const supabaseIdentityAdmin = (
  client: SupabaseAdminLike
): IdentityAdmin => ({
  async findByEmail(email) {
    const wanted = normaliseEmail(email);

    for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
      const { data, error } = await client.auth.admin.listUsers({
        page,
        perPage: LOOKUP_PAGE_SIZE,
      });

      if (error) {
        throw new Error(`Supabase listUsers failed: ${error.message}`);
      }

      const users = data?.users ?? [];
      const match = users.find(
        (user) => user.email && normaliseEmail(user.email) === wanted
      );
      if (match) {
        return { id: match.id, email: normaliseEmail(match.email!) };
      }

      // A short page is the last page.
      if (users.length < LOOKUP_PAGE_SIZE) {
        return null;
      }
    }

    throw new Error(
      `Supabase listUsers did not terminate within ${MAX_LOOKUP_PAGES} pages ` +
        `while looking for "${wanted}".`
    );
  },

  async create({ email, password }) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Supabase createUser failed: ${error.message}`);
    }
    if (!data?.user) {
      throw new Error("Supabase createUser returned no user");
    }

    return { id: data.user.id, email: normaliseEmail(data.user.email ?? email) };
  },

  async delete(id) {
    const { error } = await client.auth.admin.deleteUser(id);
    if (error) {
      throw new Error(`Supabase deleteUser failed: ${error.message}`);
    }
  },
});
