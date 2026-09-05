# Leornian Campus Assistant

Leornian Campus Assistant is a multi-tenant university operations platform with:

- a React web app for platform owner, university admin, department admin, and instructor views
- a Flutter mobile app exclusively for student registration and student workflows
- an Express + Prisma backend on PostgreSQL

As of September 2, 2026, the active product scope is:

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
- backend tests pass: 504 tests in 39 files
- web typecheck/build passes
- web tests pass: 24 tests in 6 files
- payment and robot code paths were removed from the active app
- Supabase registration/account lifecycle is implemented
- the Phase 6 authorization matrix and negative scope tests pass
- Phase 7 backend domain completion is implemented: academic terms, cohorts,
  offerings, teaching assignments and enrollments now have tenant-scoped APIs
- route-parameter/query validation, stable API errors, pagination, database
  readiness and graceful worker shutdown are verified
- the live Supabase/PostgreSQL environment has all 14 migrations applied and
  passes database, authentication, registration, session and academic API checks
- connected rendered web workflows pass for every staff role, account-state
  gating, session restoration/sign-out, instructor session/QR state, and the
  responsive university-admin shell
- Flutter 3.44.9/Dart 3.12.2 analysis, 13 widget/API tests, a 7-screen runtime
  walk, and the configured Android debug build pass
- live Android emulator checks pass for approved/pending/disabled students,
  secure restart/logout, and
  camera permission with a live QR-scanner preview
- release-facing mobile demo pages and the out-of-scope static Exports tab were
  removed; every remaining navigation destination uses connected data
- production configuration hardening, SMTP/TLS preflight, structured/redacted
  logs, correlation IDs and release-aware health endpoints are implemented
- CI now scans secrets, replays migrations, verifies backend/web/mobile,
  audits production dependencies and builds deployment containers
- release containers, public smoke tests and the backup/deployment/monitoring/
  rollback runbook are complete

What still needs target-environment acceptance:

- provision staging/production services and secrets, execute CI/container
  deployment, verify real SMTP, monitoring/alerts and a backup restore, run the
  authenticated staging matrix, and complete the final physical-device check

The September 2 mobile checkpoint uses emulator-only acceptance because a
physical phone was unavailable. Physical-device validation remains a recommended
pre-release check, but it does not block the current completion sequence.

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
- students register and sign in only on mobile
- staff and administrators sign in only on web
- the backend enforces this first-party client boundary on authenticated requests

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
- [docs/RELEASE_RUNBOOK.md](docs/RELEASE_RUNBOOK.md) — CI, deployment, monitoring, backup, smoke and rollback gates
- [apps/web/README.md](apps/web/README.md) — current web app scope
- [apps/mobile/README.md](apps/mobile/README.md) — current mobile app scope

## Historical documents

Some older docs in `docs/` describe earlier concepts, including robot-first planning. Those are not the source of truth for the current shipping product unless they explicitly say they are current.
