# Leornian Campus Assistant

Leornian Campus Assistant is a multi-tenant university operations platform with:

- a React web app for platform owner, university admin, instructor, and student views
- a Flutter mobile app for student and staff workflows
- an Express + Prisma backend on PostgreSQL

As of August 28, 2026, the active product scope is:

- attendance by QR
- academic structure and timetable management
- course materials
- student approval flow
- notifications
- organization and user management

The following features are no longer part of the active product:

- robot/device features
- billing, subscriptions, invoices, and payments

This README is the current source of truth for the project shape. Older concept documents are kept only as historical context.

## Current status

What is already verified in code:

- backend schema validates
- backend source and test typechecks pass
- backend tests pass: 460 tests in 33 files
- web typecheck/build passes
- web tests pass: 25 tests in 7 files
- payment and robot code paths were removed from the active app
- Supabase registration/account lifecycle is implemented
- the Phase 6 authorization matrix and negative scope tests pass

What still needs runtime finish work:

- run credentialed browser login/restoration/logout after explicit approval
- run full Flutter runtime validation against the live backend
- complete backend domain, deployment, observability, and release phases

## Repository structure

```text
backend/
  prisma/
  src/
  tests/

apps/
  web/
  mobile/

docs/
database/
```

## Product roles

- `SYSTEM_OWNER`
  - platform-wide organizations, users, and metrics

- `UNIVERSITY_ADMIN`
  - university-wide administration
  - timetable, directory, exports, approvals, sessions

- `DEPARTMENT_ADMIN`
  - linked-department users, cohorts, courses, assignments, and approvals
  - no organization-wide or cross-department authority

- `INSTRUCTOR`
  - assigned courses, teaching schedule, sessions, materials, assignments, approvals, notifications

- `STUDENT`
  - account, assignments, materials, attendance-related student flows

## Authentication and authorization

Current direction:

- backend-enforced authentication and authorization
- role checks are enforced on the backend
- tenant isolation is enforced on the backend
- web and mobile clients are consumers of the same API

Important implementation note:

- the project already contains a Supabase-oriented identity transition path
- Clerk is not part of the current implementation
- the recommended path is to finish the current auth flow first, not replace it mid-project

## Current architecture

```text
apps/web  ─┐
           ├──> backend API (Express + TypeScript)
apps/mobile┘            │
                         ├──> Prisma
                         └──> PostgreSQL
```

There is no active robot service or billing subsystem in the current product shape.

## Local development

Backend:

```powershell
cd backend
npm install
npx prisma generate
npm run dev
```

Web:

```powershell
cd apps/web
npm install
npm run dev
```

Mobile:

```powershell
cd apps/mobile
flutter pub get
flutter run
```

## Database and migrations

Important current migration:

- `backend/prisma/migrations/20260826183000_remove_billing_and_robot_data`

Purpose:

- removes legacy billing tables
- removes retired robot/device table
- removes old billing enums and organization subscription link

Do not assume the database is ready just because the code is ready. The database must be migrated to match the current schema.

See:

- [docs/MIGRATION_RUNBOOK.md](docs/MIGRATION_RUNBOOK.md)

## Current execution plan to finish the project

See:

- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)

That file is the operational checklist for “where we are now” and “what remains until the project is fully finished”.

## Key docs

- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — current status and next steps
- [docs/AUTHORIZATION_MATRIX.md](docs/AUTHORIZATION_MATRIX.md) — backend role and scope policy
- [docs/Architecture.md](docs/Architecture.md) — current system architecture
- [docs/MIGRATION_RUNBOOK.md](docs/MIGRATION_RUNBOOK.md) — safe migration workflow
- [apps/web/README.md](apps/web/README.md) — current web app scope
- [apps/mobile/README.md](apps/mobile/README.md) — current mobile app scope

## Historical documents

Some older docs in `docs/` describe earlier concepts, including robot-first planning. Those are not the source of truth for the current shipping product unless they explicitly say they are current.
