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
