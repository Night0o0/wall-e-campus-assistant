import { describe, expect, it } from "vitest";
import {
  SeedIdentityOrphanError,
  ensureIdentity,
  normaliseEmail,
  provisionAccount,
  supabaseIdentityAdmin,
  type IdentityAdmin,
  type IdentityRecord,
} from "../src/utils/seed-identity.js";

/**
 * The seed writes into two systems that cannot share a transaction: Supabase
 * Auth over HTTP, and Postgres. These tests are about what happens when the
 * second write fails after the first succeeded, and about the fact that
 * dropping the `public` schema leaves `auth.users` untouched — so a re-run
 * always meets identities that already exist.
 *
 * The distinction that matters throughout: an identity this run CREATED may be
 * deleted to compensate; an identity this run ADOPTED may not, because it
 * predates the run and belongs to somebody else.
 */

interface FakeAdmin extends IdentityAdmin {
  readonly created: string[];
  readonly deleted: string[];
  readonly lookups: string[];
}

const fakeAdmin = (
  seededEmails: string[] = [],
  overrides: Partial<IdentityAdmin> = {}
): FakeAdmin => {
  const store = new Map<string, IdentityRecord>();
  let counter = 0;

  for (const email of seededEmails) {
    counter += 1;
    const key = normaliseEmail(email);
    store.set(key, { id: `existing-${counter}`, email: key });
  }

  const created: string[] = [];
  const deleted: string[] = [];
  const lookups: string[] = [];

  const base: IdentityAdmin = {
    async findByEmail(email) {
      lookups.push(normaliseEmail(email));
      return store.get(normaliseEmail(email)) ?? null;
    },
    async create({ email }) {
      const key = normaliseEmail(email);
      if (store.has(key)) throw new Error("email already registered");
      counter += 1;
      const record = { id: `new-${counter}`, email: key };
      store.set(key, record);
      created.push(key);
      return record;
    },
    async delete(id) {
      deleted.push(id);
      for (const [key, record] of store) {
        if (record.id === id) store.delete(key);
      }
    },
  };

  return { ...base, ...overrides, created, deleted, lookups };
};

const ACCOUNT = { email: "Student.Approved@Leornian.dev", password: "Demo@12345" };

describe("the idempotency key", () => {
  it("is the address, trimmed and lowercased", () => {
    expect(normaliseEmail("  Owner@Leornian.DEV ")).toBe("owner@leornian.dev");
  });
});

describe("ensuring an identity exists", () => {
  it("creates one when the address is unknown", async () => {
    const admin = fakeAdmin();

    const { identity, created } = await ensureIdentity(admin, ACCOUNT);

    expect(created).toBe(true);
    expect(identity.email).toBe("student.approved@leornian.dev");
    expect(admin.created).toEqual(["student.approved@leornian.dev"]);
  });

  it("adopts the existing identity rather than creating a second", async () => {
    const admin = fakeAdmin([ACCOUNT.email]);

    const { identity, created } = await ensureIdentity(admin, ACCOUNT);

    expect(created).toBe(false);
    expect(identity.id).toBe("existing-1");
    expect(admin.created).toEqual([]);
  });

  it("adopts across a change of case, which Supabase treats as one address", async () => {
    const admin = fakeAdmin(["STUDENT.APPROVED@LEORNIAN.DEV"]);

    const { created } = await ensureIdentity(admin, ACCOUNT);

    expect(created).toBe(false);
    expect(admin.created).toEqual([]);
  });

  it("adopts when it loses a race, rather than failing", async () => {
    // create() fails because something else won; the re-read then finds it.
    const admin = fakeAdmin();
    let racedIn = false;
    const racing = fakeAdmin([], {
      async findByEmail(email) {
        if (!racedIn) {
          racedIn = true;
          return null; // first look: absent
        }
        return { id: "won-the-race", email: normaliseEmail(email) };
      },
      async create() {
        throw new Error("email already registered");
      },
    });
    void admin;

    const { identity, created } = await ensureIdentity(racing, ACCOUNT);

    expect(created).toBe(false);
    expect(identity.id).toBe("won-the-race");
  });

  it("rethrows a genuine creation failure", async () => {
    const admin = fakeAdmin([], {
      async findByEmail() {
        return null;
      },
      async create() {
        throw new Error("Supabase createUser failed: service unavailable");
      },
    });

    await expect(ensureIdentity(admin, ACCOUNT)).rejects.toThrow(
      /service unavailable/
    );
  });
});

describe("repeated seed runs", () => {
  it("creates the identity once and adopts it every time after", async () => {
    const admin = fakeAdmin();
    const write = async (identity: IdentityRecord) => identity.id;

    const first = await provisionAccount(admin, ACCOUNT, write);
    const second = await provisionAccount(admin, ACCOUNT, write);
    const third = await provisionAccount(admin, ACCOUNT, write);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);

    // One identity, ever. And nothing deleted along the way.
    expect(admin.created).toHaveLength(1);
    expect(admin.deleted).toEqual([]);
    expect(second.identity.id).toBe(first.identity.id);
    expect(third.identity.id).toBe(first.identity.id);
  });

  it("survives the rebuild case: identities remain, application rows are gone", async () => {
    // Dropping `public` does not touch `auth.users`, so the second run meets a
    // full set of identities and an empty set of users. It must adopt, not fail.
    const admin = fakeAdmin([ACCOUNT.email]);
    let writes = 0;

    const result = await provisionAccount(admin, ACCOUNT, async (identity) => {
      writes += 1;
      return identity.id;
    });

    expect(result.created).toBe(false);
    expect(result.result).toBe("existing-1");
    expect(writes).toBe(1);
    expect(admin.created).toEqual([]);
  });

  it("passes the adopted identity's id to the write, so authUserId stays correct", async () => {
    const admin = fakeAdmin([ACCOUNT.email]);
    let seen: string | null = null;

    await provisionAccount(admin, ACCOUNT, async (identity) => {
      seen = identity.id;
      return identity.id;
    });

    expect(seen).toBe("existing-1");
  });
});

describe("partial failure: the database write fails", () => {
  it("deletes an identity this run created, leaving nothing behind", async () => {
    const admin = fakeAdmin();
    const failure = new Error("Prisma: unique constraint violated");

    await expect(
      provisionAccount(admin, ACCOUNT, async () => {
        throw failure;
      })
    ).rejects.toThrow(failure);

    expect(admin.created).toHaveLength(1);
    expect(admin.deleted).toHaveLength(1);
    // And the store is genuinely empty again, so a retry can create cleanly.
    await expect(admin.findByEmail(ACCOUNT.email)).resolves.toBeNull();
  });

  it("does NOT delete an identity it merely adopted", async () => {
    // The identity predates this run. An unrelated database error is not a
    // licence to destroy an account the seed does not own.
    const admin = fakeAdmin([ACCOUNT.email]);
    const failure = new Error("Prisma: connection reset");

    await expect(
      provisionAccount(admin, ACCOUNT, async () => {
        throw failure;
      })
    ).rejects.toThrow(failure);

    expect(admin.deleted).toEqual([]);
    await expect(admin.findByEmail(ACCOUNT.email)).resolves.not.toBeNull();
  });

  it("rethrows the original failure, not a wrapper, so the cause survives", async () => {
    const admin = fakeAdmin();
    const failure = new Error("Prisma: null constraint on organizationId");

    await expect(
      provisionAccount(admin, ACCOUNT, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
  });

  it("leaves a retry able to succeed after a failed run", async () => {
    const admin = fakeAdmin();
    let attempt = 0;

    const write = async (identity: IdentityRecord) => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient");
      return identity.id;
    };

    await expect(provisionAccount(admin, ACCOUNT, write)).rejects.toThrow("transient");
    const second = await provisionAccount(admin, ACCOUNT, write);

    expect(second.created).toBe(true);
    expect(admin.created).toHaveLength(2);
    expect(admin.deleted).toHaveLength(1);
  });
});

describe("partial failure: the compensating delete also fails", () => {
  it("raises an orphan error naming the identity that must be removed by hand", async () => {
    const admin = fakeAdmin([], {
      async findByEmail() {
        return null;
      },
      async create({ email }) {
        return { id: "orphan-1", email: normaliseEmail(email) };
      },
      async delete() {
        throw new Error("Supabase deleteUser failed: 503");
      },
    });

    const failure = new Error("Prisma: deadlock detected");

    await expect(
      provisionAccount(admin, ACCOUNT, async () => {
        throw failure;
      })
    ).rejects.toBeInstanceOf(SeedIdentityOrphanError);
  });

  it("carries both the original failure and the cleanup failure", async () => {
    const admin = fakeAdmin([], {
      async findByEmail() {
        return null;
      },
      async create({ email }) {
        return { id: "orphan-1", email: normaliseEmail(email) };
      },
      async delete() {
        throw new Error("Supabase deleteUser failed: 503");
      },
    });

    const failure = new Error("Prisma: deadlock detected");

    const error = await provisionAccount(admin, ACCOUNT, async () => {
      throw failure;
    }).then(
      () => null,
      (thrown: unknown) => thrown as SeedIdentityOrphanError
    );

    expect(error).toBeInstanceOf(SeedIdentityOrphanError);
    expect(error!.identity.id).toBe("orphan-1");
    expect(error!.cause).toBe(failure);
    expect(error!.message).toMatch(/deadlock detected/);
    expect(error!.message).toMatch(/deleteUser failed: 503/);
    expect(error!.message).toMatch(/orphan-1/);
  });
});

describe("the Supabase adapter", () => {
  const clientWith = (pages: Array<Array<{ id: string; email: string }>>) => {
    const calls: Array<{ page?: number; perPage?: number }> = [];
    return {
      calls,
      client: {
        auth: {
          admin: {
            async listUsers(params?: { page?: number; perPage?: number }) {
              calls.push(params ?? {});
              return { data: { users: pages[(params?.page ?? 1) - 1] ?? [] }, error: null };
            },
            async createUser(input: { email: string }) {
              return { data: { user: { id: "created-1", email: input.email } }, error: null };
            },
            async deleteUser() {
              return { error: null };
            },
          },
        },
      },
    };
  };

  it("finds an identity regardless of the case Supabase stored it in", async () => {
    const { client } = clientWith([[{ id: "u1", email: "Owner@Leornian.DEV" }]]);

    const found = await supabaseIdentityAdmin(client).findByEmail("owner@leornian.dev");

    expect(found).toEqual({ id: "u1", email: "owner@leornian.dev" });
  });

  it("returns null on a short page rather than paging forever", async () => {
    const { client, calls } = clientWith([[{ id: "u1", email: "someone@else.dev" }]]);

    const found = await supabaseIdentityAdmin(client).findByEmail("owner@leornian.dev");

    expect(found).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("surfaces a listUsers error instead of reporting the address as absent", async () => {
    const client = {
      auth: {
        admin: {
          async listUsers() {
            return { data: { users: [] }, error: { message: "invalid service role key" } };
          },
          async createUser() {
            return { data: { user: null }, error: null };
          },
          async deleteUser() {
            return { error: null };
          },
        },
      },
    };

    await expect(
      supabaseIdentityAdmin(client).findByEmail("owner@leornian.dev")
    ).rejects.toThrow(/invalid service role key/);
  });

  it("confirms the seeded address so a seeded account can log in immediately", async () => {
    let confirmed: boolean | undefined;
    const client = {
      auth: {
        admin: {
          async listUsers() {
            return { data: { users: [] }, error: null };
          },
          async createUser(input: { email: string; email_confirm?: boolean }) {
            confirmed = input.email_confirm;
            return { data: { user: { id: "created-1", email: input.email } }, error: null };
          },
          async deleteUser() {
            return { error: null };
          },
        },
      },
    };

    await supabaseIdentityAdmin(client).create({
      email: "owner@leornian.dev",
      password: "Demo@12345",
    });

    expect(confirmed).toBe(true);
  });
});
