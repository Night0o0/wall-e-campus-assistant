/**
 * Rebuilds an EMPTY `public` schema so that schema and migration ledger both
 * match the code, then hands over to `prisma migrate deploy`.
 *
 * WHY THIS EXISTS, and why it is not `migrate resolve --applied`.
 *
 * The runbook's resolve procedure was written to protect data. A read-only
 * inspection on 26 Aug 2026 established there is none:
 *
 *   - `_prisma_migrations` does not exist at all. The database was built by
 *     `prisma db push`, which creates schema without writing a ledger.
 *   - `public` holds 17 tables. `schema.prisma` declares 27. The entire
 *     academic core (migration 11 - 15 tables, 4 enums, a UserRole rewrite
 *     where only 2 of 5 value names survive) has never been applied.
 *   - Every one of those 17 tables has ZERO rows. So does `auth.users`.
 *
 * With no data, `resolve --applied` is the more dangerous option, not the
 * safer one: it writes a ledger asserting that migrations 1-10 ran, when all
 * anyone can verify is that their tables exist. A table existing does not
 * prove a later ALTER inside the same migration ran. Any such gap would be
 * blessed permanently and silently, and every later migration would build on
 * a schema nobody has actually confirmed.
 *
 * Replaying all 12 migrations against an empty schema produces a database that
 * is correct by construction. That is only true while the database is empty,
 * which is why this script verifies that itself rather than trusting the note
 * above to still be accurate when someone runs it.
 *
 * WHAT IT DESTROYS, established by inspection rather than assumed:
 *
 *   - 17 empty tables and their enum types.
 *
 * and nothing else. `public` carries no ACL (nspacl IS NULL), hosts no
 * extensions (pgcrypto, uuid-ossp, pg_stat_statements live in `extensions`;
 * supabase_vault in `vault`), and has no views, routines, sequences,
 * triggers or RLS policies. The `auth`, `storage`, `realtime`, `graphql`,
 * `extensions` and `vault` schemas are never referenced here and are left
 * exactly as they are.
 *
 * THREE GUARDS, all fail-closed, deliberately mirroring src/utils/seed-guard.ts.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Reads backend/.env without adding a dotenv dependency to a one-shot script. */
const readEnvFile = () => {
  try {
    return Object.fromEntries(
      readFileSync(join(here, "..", ".env"), "utf8")
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
        })
    );
  } catch {
    return {};
  }
};

const fileEnv = readEnvFile();
const env = { ...fileEnv, ...process.env };

const fail = (message) => {
  console.error("\n" + message + "\n");
  process.exit(1);
};

/**
 * Migrations must run over a direct connection. pgbouncer in transaction mode
 * cannot hold the session-level state DDL needs, and DATABASE_URL here is a
 * pooler URL on :6543.
 */
const url = env.DIRECT_URL ?? env.DATABASE_URL;
if (!url) fail("Refusing to rebuild: neither DIRECT_URL nor DATABASE_URL is set.");

/**
 * Identify the TARGET, not just the host.
 *
 * On Supabase the hostname is NOT the project. `aws-0-eu-west-1.pooler.
 * supabase.com` is a shared regional pooler: every project in eu-west-1
 * resolves to that same name, and the project is identified by the username
 * (`postgres.<project-ref>`). Guarding on the hostname alone would authorise
 * this DROP against any project in the region the connection string happens
 * to point at - precisely the "permission outlives the target" failure GUARD 2
 * exists to prevent.
 *
 * So the identity is the project ref when there is one, qualified by host:
 *
 *     bhzbhmgorilskpgnlzif@aws-0-eu-west-1.pooler.supabase.com
 *
 * and falls back to the bare host for a direct (non-pooled) connection, where
 * the host really does name one database.
 */
const targetOf = (connectionString) => {
  try {
    const u = new URL(connectionString);
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host.length === 0) return null;

    // `postgres.<ref>` on the pooler; a bare role name on a direct connection.
    const ref = decodeURIComponent(u.username).toLowerCase().split(".")[1];
    return ref ? `${ref}@${host}` : host;
  } catch {
    return null;
  }
};

const target = targetOf(url);
if (target === null) {
  fail(
    "Refusing to rebuild: the connection string's target could not be determined, " +
      "so this script cannot tell which database it is about to drop. Fix the " +
      "connection string rather than bypassing this check."
  );
}

// GUARD 1 - never production, no override, ever.
if (env.NODE_ENV === "production") {
  fail(
    "Refusing to rebuild: NODE_ENV=production. This script drops the entire " +
      "public schema. There is no override flag."
  );
}

/**
 * GUARD 2 - the operator must NAME the target.
 *
 * A boolean would be set once and then silently authorise whatever database
 * the connection string happens to point at six months later. Naming the
 * target is the point: the permission stops applying the moment it changes -
 * including a swap to a different Supabase project behind the same pooler
 * hostname, which a host-only check would not notice.
 */
if (env.REBUILD_ALLOW_HOST?.trim().toLowerCase() !== target) {
  fail(
    `Refusing to rebuild: this would DROP the public schema on "${target}".\n` +
      `If that is genuinely the database you mean, name it:\n\n` +
      `    REBUILD_ALLOW_HOST="${target}" node scripts/rebuild-database.mjs\n\n` +
      `Naming it is the point - the permission stops applying if the target changes.`
  );
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const q = (sql) => prisma.$queryRawUnsafe(sql);

try {
  const tables = (
    await q(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE'
       ORDER BY table_name`
    )
  ).map((r) => r.table_name);

  // GUARD 3 - the emptiness claim is re-verified here, not trusted from a doc.
  // This is the whole justification for preferring a rebuild over `resolve`,
  // so it is checked at the moment of use. A single row anywhere is a refusal
  // with no override: a data-bearing database needs a backup and a real
  // migration path, not this script.
  const populated = [];
  for (const t of tables) {
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM "public"."${t}"`);
    if (n > 0) populated.push(`${t} (${n} rows)`);
  }

  if (populated.length > 0) {
    fail(
      "Refusing to rebuild: the public schema is NOT empty.\n\n" +
        populated.map((p) => "    " + p).join("\n") +
        "\n\nThis script is only correct against an empty database. Take a backup " +
        "and use the `migrate resolve --applied` procedure in " +
        "docs/MIGRATION_RUNBOOK.md instead. There is no override flag."
    );
  }

  console.log(`Target        : ${target}`);
  console.log(`Tables to drop: ${tables.length} (all empty, verified just now)`);
  console.log(tables.map((t) => "  - " + t).join("\n"));
  console.log("\nDropping and recreating the public schema...");

  // CASCADE is required: the enum types and foreign keys depend on the schema.
  await prisma.$executeRawUnsafe(`DROP SCHEMA "public" CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "public"`);

  // Restore the schema to the exact ownership it had. Grants are deliberately
  // NOT re-added: `nspacl` was NULL before this ran, meaning no explicit grants
  // existed. Adding anon/authenticated/service_role grants here would hand
  // PostgREST access this project never gave it - the app reaches Postgres
  // through Prisma as `postgres`, not through the Supabase data API.
  await prisma.$executeRawUnsafe(`ALTER SCHEMA "public" OWNER TO postgres`);

  const [{ n }] = await q(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`
  );
  console.log(`\nDone. public now holds ${n} tables.`);
  console.log("\nNext, and this is the step that actually builds the schema:\n");
  console.log("    npx prisma migrate deploy");
  console.log("    npx prisma generate");
  console.log("    npx prisma migrate status   # expect: 12 applied, 0 pending\n");
} catch (error) {
  fail("Rebuild failed: " + error.message);
} finally {
  await prisma.$disconnect();
}
