# Project status — September 1, 2026

This file is the operational source of truth for the current project state.

## Current state

Completed and checkpointed before this phase:

- robot/device feature removed from active app scope
- billing/payment/subscription/invoice feature removed from active app scope
- backend aligned to the reduced product scope
- web app aligned to the reduced product scope
- all 14 migrations applied and verified against the Supabase public schema
- idempotent Supabase-aware seed with 12 linked development accounts
- direct verified Supabase JWT authentication

Phase 4 implemented in the current checkpoint:

- Supabase student sign-up and email confirmation callback
- token-derived email and `authUserId`
- public registration forced to `STUDENT` / `PENDING`
- idempotent completion, including concurrent callbacks
- cross-device completion through non-authoritative user metadata and completion on login/restoration
- pending profile access with protected academic features still gated
- explicit pending, active, rejected and disabled behavior
- web password recovery/reset and signed-in password changes
- Android password-reset deep link and mobile password-change/recovery APIs and UI
- Supabase Admin password resets for linked campus accounts
- confirmed-token email synchronization and coordinated administrator email changes

Phase 6 authorization implemented in the current checkpoint:

- route-permission matrix recorded in `docs/AUTHORIZATION_MATRIX.md`
- QR issuance permanently limited to instructor/university-admin/system-owner
- robot-dependent QR flag and stale billing example removed
- pending students blocked from generic course and schedule reads
- course list/read scope derived from active enrollment, teaching assignment, or trusted department id
- instructors cannot mutate the course catalogue
- department administrators can update/export only linked-department courses
- session services repeat route authorization as defense in depth

Phase 7 backend domain completion implemented in the current checkpoint:

- tenant-scoped APIs for academic terms, cohorts, course offerings, teaching
  assignments and enrollments
- reference-integrity checks and audit events for every new academic mutation
- bounded UUID, body and query validation across backend route surfaces
- consistent pagination for academic resources and staff materials
- stable machine-readable API errors without unexpected exception leakage
- separate liveness and database readiness endpoints
- graceful worker stop, HTTP request draining and Prisma disconnect on shutdown

Live database and authentication verification completed:

- all 14 migrations deployed with zero pending migrations
- 12 application users linked to Supabase identities with no local password hashes
- every role, account state and both tenant scopes verified against the running backend
- real Supabase login, restoration, token refresh and logout passed
- invalid, tampered and legacy tokens rejected; pending/rejected/disabled gates passed
- real registration completion proved forced `STUDENT/PENDING`, idempotency and cleanup
- normalized academic APIs, pagination, validation and cross-tenant safe-404 behavior
  passed against populated live data

Verified:

- backend Prisma schema validates
- backend typecheck passes
- backend source and test typechecks pass
- backend tests pass: 495 tests in 39 files
- web typecheck/production build passes
- web tests pass: 25 tests in 7 files
- rendered browser checks pass for login, registration, forgot-password and reset-callback pages
- mobile runtime walker covers 25 screens with zero reported findings

Still outstanding:

- rendered connected browser role workflows
- full Flutter suite with the repository's committed lockfile on its matching newer Flutter/Dart SDK; this machine has Flutter 3.24.5
- connected-client, deployment, observability and release phases in `plan.txt`

## What “finished” means

The project is considered finished only when all of the following are true:

1. database schema matches the current code
2. backend starts and all core auth/account APIs work
3. web app starts and core user flows work in browser
4. mobile app starts and core user flows work against the backend
5. role-based authorization works correctly
6. tenant isolation works correctly

## Remaining execution direction

### Next — connected web workflows

- run the React app against the verified live backend
- exercise credentialed role routing and the owner/admin/instructor/student dashboards
- verify connected loading, empty, error and mutation states in the browser
- close any remaining web API-contract gaps and add regression coverage

## Scope guardrails

Do not expand scope while finishing unless explicitly approved.

Specifically out of scope for the active product:

- robot/device product flows
- billing and payment flows
- replacing auth with Clerk mid-finish

## Recommended auth direction

Finish the current backend-led auth system first.

Reason:

- it is already wired into the current codebase
- backend role and tenant enforcement already exist around it
- switching to Clerk now would create a separate migration project

## Next recommended action

The next best practical step is:

1. finish the connected rendered web workflows
2. run Flutter on the matching SDK and a device/emulator
3. continue deployment, observability, security and release phases in `plan.txt`
