# Migration runbook — reconciling the Prisma history

**Status: NOT EXECUTED. Every command below is for a human to run.**

Nothing in this document has been run against the database, and nothing in the
repository will run it for you. Read the whole thing before typing anything.

---

## The problem, stated precisely

`prisma migrate status` reports **all ten migrations as unapplied**, including
`20260802073548_init`. The `_prisma_migrations` table on the Supabase database
is **empty**.

That combination has exactly one meaning: the database schema was created by
some route other than the migration history — almost certainly `prisma db push`
early in the project. The tables exist; the ledger that says who made them does
not.

So this is **not** "ten migrations are pending". It is "the ledger is empty and
we do not yet know which of the ten are already reflected in the schema."

### Why you must not just run `migrate deploy`

`migrate deploy` reads the empty ledger, concludes nothing has ever been
applied, and starts replaying from `init`. `init` contains `CREATE TABLE "User"`.
Against a database that already has a `User` table, that fails — and it fails
*part way through the transaction of the first migration*, which is the least
informative place for it to stop.

### Why you must not just run `resolve --applied` on all ten

`prisma migrate resolve --applied <name>` writes a row into the ledger claiming
that migration ran. It **checks nothing**. If you mark a migration applied whose
columns are not actually in the database, you have permanently told Prisma a
lie: that migration will never run, the columns will never exist, and the first
symptom will be a runtime error from a query selecting a column that is not
there.

The two newest migrations are the live question. `CourseMaterial` and
`EmailChallenge` may or may not be in the database. **Marking those applied
without checking would silently break the Material page and the entire email
verification flow.**

---

## Step 1 — Take a backup

Supabase dashboard → Database → Backups. Take one now, note the timestamp.

Everything below is either read-only or additive, and you should still have a
backup, because the one time you skip it is the time you need it.

---

## Step 2 — Read what is actually there (READ ONLY)

Run this in the Supabase SQL editor. It changes nothing.

```sql
-- Which tables exist?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

```sql
-- The four columns that tell the newest migrations apart.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'User'  AND column_name IN ('verifiedAt', 'verifiedById'))
    OR table_name IN ('CourseMaterial', 'EmailChallenge')
  )
ORDER BY table_name, column_name;
```

```sql
-- Enum values, for the notification types the newest migration adds.
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('NotificationType', 'EmailChallengePurpose')
ORDER BY t.typname, e.enumsortorder;
```

```sql
-- Confirm the ledger really is empty.
SELECT count(*) FROM "_prisma_migrations";
```

### Reading the results

| Migration | Reflected if… |
|---|---|
| `20260802073548_init` | `User`, `Organization` tables exist |
| `20260806120000_complete_schema_and_indexes` | core tables + their indexes exist |
| `20260807090000_student_academic_profile` | `StudentProfile` exists |
| `20260808012004_lecture_schedule` | `LectureSchedule` exists |
| `20260809010248_lecture_notifications` | `Notification` exists |
| `20260812090000_robot_device_auth` | `RobotDevice` exists |
| `20260813000000_session_lecture_schedule_link` | `Session.lectureScheduleId` exists |
| `20260813120000_attendance_lifecycle` | `Session.closeReason` exists |
| `20260814090000_course_materials_and_approval_audit` | `CourseMaterial` **and** `User.verifiedAt` **and** `User.verifiedById` |
| `20260816090000_email_challenges_and_account_notices` | `EmailChallenge` **and** `NotificationType` has `ACCOUNT_APPROVED` |

**A migration counts as reflected only if _everything_ it creates is present.**
A partial match is the dangerous case: it means somebody applied part of it by
hand, and it needs fixing by hand before you mark anything.

If you hit a partial match, stop and work out what is missing before continuing.
Do not mark it applied and do not re-run it.

---

## Step 3 — Write the ledger for what is genuinely there

For **each migration your Step 2 results proved is fully reflected**, and only
those, run from `backend/`:

```bash
npx prisma migrate resolve --applied 20260802073548_init
npx prisma migrate resolve --applied 20260806120000_complete_schema_and_indexes
npx prisma migrate resolve --applied 20260807090000_student_academic_profile
npx prisma migrate resolve --applied 20260808012004_lecture_schedule
npx prisma migrate resolve --applied 20260809010248_lecture_notifications
npx prisma migrate resolve --applied 20260812090000_robot_device_auth
npx prisma migrate resolve --applied 20260813000000_session_lecture_schedule_link
npx prisma migrate resolve --applied 20260813120000_attendance_lifecycle
```

**Stop before the last two.** Whether they belong in this list is exactly what
Step 2 was for. Add them only if the query proved their tables and columns are
present.

Order matters — run them oldest first, so the ledger reads sensibly afterwards.

---

## Step 4 — Check the ledger agrees with you

```bash
npx prisma migrate status
```

Expected: the ones you resolved are applied, and only the genuinely missing ones
are pending. If anything surprises you here, stop.

---

## Step 5 — Apply what is genuinely new

```bash
npx prisma migrate deploy
```

This should apply only the migrations Step 2 proved are missing — in most
likely-case scenarios, `20260814090000` and/or `20260816090000`.

Both are strictly additive: new tables, new nullable columns, new enum values.
Nothing is dropped, nothing is narrowed, no existing row is read or written.

### One PostgreSQL rule worth knowing before you run it

`20260816090000` contains `ALTER TYPE "NotificationType" ADD VALUE`. On
PostgreSQL 12 and later this may run inside a transaction — which is what Prisma
does — but the new value **cannot be used in that same transaction**. The
migration therefore adds the labels and writes no rows; the first row carrying
`ACCOUNT_APPROVED` is written later by the application. Supabase runs
PostgreSQL 15, so this is fine as written. On PG 11 or older those two
statements would need to run outside a transaction.

---

## Step 6 — Verify

```bash
npx prisma migrate status     # everything applied
npx prisma generate           # client matches the schema
npm run typecheck
npm test
```

Then check the two things this was really about:

1. **Material page** — open `/materials` as a super admin. It should load an
   empty list, not a 500.
2. **Approval** — approve a test student and confirm they receive a
   notification (`GET /api/notifications` as that student).

---

## What is explicitly NOT in this runbook

- **No backfill of `isVerified`.** Every student currently in the database reads
  `false`, and that is correct: nobody has approved them. Admitting an existing
  cohort in bulk is an operational decision with a name and a date attached, not
  a side effect of a schema change. If you want it, write it as its own script
  and record who authorised it.
- **No data migration of any kind.** Both new migrations are pure DDL.
- **No `migrate reset`.** It drops the database. It is never the answer here.
