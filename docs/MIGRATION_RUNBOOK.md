# Migration runbook

This document is for human execution. It is not an instruction for automatic tools to run blindly.

## Current important migration

As of August 26, 2026, the key pending schema cleanup is:

- `20260826183000_remove_billing_and_robot_data`

It removes legacy billing and retired robot data structures so the database matches the current product scope.

## Safe workflow

1. inspect current migration status

```powershell
cd backend
npx prisma migrate status
```

2. make sure the database history problem is understood before applying anything

- if the migration ledger is missing or out of sync, reconcile that first
- do not blindly run `migrate deploy` against an unknown database state

3. once the migration history is safe, apply pending migrations

```powershell
cd backend
npx prisma migrate deploy
```

4. regenerate Prisma client

```powershell
cd backend
npx prisma generate
```

5. validate the result

```powershell
cd backend
npx prisma validate --schema prisma/schema.prisma
npm run typecheck
npm test -- --run
```

## Notes

- the latest cleanup migration is destructive to legacy billing/robot tables by design
- do not apply it to a database you may still need for legacy feature recovery
- if you need a recovery point, create a backup first

## Current recommendation

Use this migration only as part of the project-finishing sequence:

1. database alignment
2. backend runtime verification
3. web runtime verification
4. mobile runtime verification

---

# Read-only inspection — 26 August 2026

Re-ran `information_schema` and row-count queries against the configured
database. **No writes.** This supersedes the "Safe workflow" section above,
which is wrong in a way that matters: its step 3 says run
`prisma migrate deploy`, and that would fail on the first statement.

## What is actually there

| | |
|---|---|
| Host | `aws-0-eu-west-1.pooler.supabase.com` (Supabase, PostgreSQL 17.6) |
| `_prisma_migrations` | **does not exist** — not empty, absent |
| Tables in `public` | 17 |
| Tables in `schema.prisma` | **27** |
| Rows, across all 17 tables | **0** |
| `auth.users` | **0** |

The database was built by `prisma db push`, which creates schema without
writing a ledger.

## The gap is much wider than "two pending migrations"

`20260826123000_leornian_academic_core` has never been applied. It is 320 lines
and it carries the whole product rename:

- **15 missing tables** — Department, AcademicTerm, Cohort, CourseOffering,
  CourseOfferingCohort, TeachingAssignment, Enrollment, FileAsset, Assignment,
  AssignmentAttachment, AssignmentCohort, AssignmentGrade, GradeItem,
  StudentGrade, AuditLog.
- **4 missing enums** — AccountStatus, TeachingRole, GradeCategory, AuditAction.
- **A `UserRole` rewrite.** The live enum is
  `SYSTEM_OWNER, UNIVERSITY_SUPER_ADMIN, ADMIN, STUDENT`. The schema wants
  `SYSTEM_OWNER, UNIVERSITY_ADMIN, DEPARTMENT_ADMIN, INSTRUCTOR, STUDENT`.
  Only two of five names survive.

Five tables also remain that the code no longer declares: Invoice, Payment,
Subscription, SubscriptionPlan, RobotDevice.

## Why `migrate resolve --applied` is now the WRONG answer

The resolve procedure exists to preserve data. **There is none.**

Resolving would write a ledger asserting migrations 1-10 ran, when all anyone
can verify is that their tables exist — and a table existing does not prove a
later `ALTER` inside the same migration ran. Any such gap gets blessed
permanently and silently, and migrations 11 and 12 then build on a schema
nobody has confirmed.

Replaying all 13 migrations against an empty schema is correct by construction.
That is only true while the database is empty, so the script re-verifies it
rather than trusting this note.

## Migration 11 will apply cleanly

Checked specifically, because it is the one that could have failed:
`ALTER TYPE ... ADD VALUE` adds `DEPARTMENT_ADMIN`, `ASSIGNMENT_PUBLISHED`,
`ASSIGNMENT_DUE_SOON` and `GRADE_PUBLISHED`, and PostgreSQL forbids *using* a
new enum value in the same transaction that added it. Prisma wraps each
migration in one transaction. None of those four values is referenced anywhere
later in the file — the migration is pure DDL with no `INSERT` or `UPDATE` — so
the restriction is not triggered.

## What a rebuild destroys, verified rather than assumed

The 17 empty tables and their enum types, and nothing else:

- `public` carries **no ACL** (`nspacl IS NULL`) — no grants to re-create.
- **No extensions live in `public`** — `pgcrypto`, `uuid-ossp` and
  `pg_stat_statements` are in `extensions`, `supabase_vault` in `vault`.
- No views, routines, sequences, triggers or RLS policies in `public`.
- The `auth`, `storage`, `realtime`, `graphql`, `extensions` and `vault`
  schemas are never referenced and are left untouched.

## Procedure

```powershell
cd backend

# 1. Rebuild. Refuses unless it is handed the target by name, refuses on
#    NODE_ENV=production, and refuses if any table holds a single row.
#
#    The target is <project-ref>@<host>, NOT the bare hostname: the Supabase
#    pooler hostname is shared by every project in the region, so naming only
#    the host would authorise this DROP against any of them.
$env:REBUILD_ALLOW_HOST = "bhzbhmgorilskpgnlzif@aws-0-eu-west-1.pooler.supabase.com"
node scripts/rebuild-database.mjs

# 2. Build the schema from the migration history, creating a real ledger.
npx prisma migrate deploy
npx prisma generate

# 3. Confirm.
npx prisma migrate status        # expect: 13 applied, 0 pending
npx prisma validate --schema prisma/schema.prisma
npm run typecheck
npm test -- --run
```

Seeding is a separate decision: `src/utils/seed-guard.ts` refuses remote hosts
unless `SEED_ALLOW_REMOTE_HOST` names this one, and the seed writes demo
accounts whose passwords are committed to this repository.

## Still true

- No `migrate reset`. It would also run the seed.
- No data migration of any kind. Both pending migrations are pure DDL.
