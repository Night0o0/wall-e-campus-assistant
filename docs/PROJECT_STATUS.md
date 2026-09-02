# Project status — September 2, 2026

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

Connected web workflow verification completed:

- real Supabase sign-in, session restoration and sign-out passed in the rendered app
- owner, university-admin, department-admin, instructor and student routes loaded
  against the live backend with role-safe denial for cross-role pages
- pending students reached approval status/account completion only, and disabled
  accounts remained at sign-in with the expected deactivation error
- instructor session detail and closed-session projector/QR state passed
- responsive university-admin navigation passed at a 390 × 844 viewport
- login return paths are now validated against the authenticated role
- department administrators now use the trusted department-scoped course API and
  server-provided per-course permissions instead of the instructor-only endpoint

Connected mobile implementation and emulator verification completed:

- repository lockfile runs on Flutter 3.44.9 / Dart 3.12.2
- Flutter analysis passes with zero issues; 20 widget/API tests pass
- deterministic runtime verification walks 24 release-facing student, instructor
  and university-admin screens with zero findings
- configured Android debug APK builds successfully against the emulator API URL
- approved-student Supabase login, all six connected destinations, profile and
  logout passed against the live backend
- pending students remain on the approval screen and disabled students remain
  signed out
- instructor Supabase login, overview, teaching schedule, sessions, courses and
  materials passed against the live backend; the deterministic walker covers the
  remaining pending-student, inbox and account destinations
- Android camera permission is granted and the QR scanner displayed a live
  emulator camera preview
- secure session restoration survived emulator restarts; logout cleanup passed
- the mobile HTTP transport is cross-platform and regression-tested for required
  identity/auth headers, backend validation details and retryable network errors
- the unused static/demo role page collection and out-of-scope static Exports tab
  were removed from the release app
- a runtime-only, credential-free live integration harness is committed; its
  approved-student Android case passed
- emulator-only acceptance was explicitly approved on September 2 because no
  physical phone was available; the physical-device run is deferred to the
  pre-release checklist rather than blocking the mobile completion checkpoint

Step 6 release-readiness implementation completed:

- production boot refuses legacy/dual auth, placeholder release identity,
  unsafe HTTP/localhost CORS, missing Supabase service credentials, logging
  email, local sender domains and plaintext SMTP
- SMTP uses pooled TLS connections and has a deployment-network preflight
- push is explicitly deferred for the first release; notifications remain
  available in-app with `PUSH_PROVIDER=none`
- structured JSON request, error, worker, startup and shutdown logs include
  release identity and correlation IDs; credential-shaped fields are redacted
- the broad API limiter verifies Supabase sessions and allocates authenticated
  users independent buckets, preserving lecture-hall traffic behind campus NAT
- GitHub CI scans secrets, replays all migrations on empty PostgreSQL, checks
  backend/web/mobile, audits production dependencies and builds all containers
- Dependabot covers npm, Flutter/Dart and GitHub Actions weekly
- separate immutable API runtime/migration images and a non-root SPA web image
  are defined with health checks and an example release composition
- production-environment validation and public API/database/web/CORS smoke tools
  are implemented and pass locally
- backup/restore, monitoring/alerts, worker ownership, deployment order,
  rollback and final acceptance evidence are defined in `RELEASE_RUNBOOK.md`

Verified:

- backend Prisma schema validates
- backend typecheck passes
- backend source and test typechecks pass
- backend tests pass: 500 tests in 39 files
- web typecheck/production build passes
- web tests pass: 28 tests in 7 files
- rendered browser checks pass for public auth pages and every connected seeded role workflow
- mobile analysis and 20 widget/API tests pass
- mobile runtime walker covers 24 release-facing screens with zero findings
- configured Android debug APK builds successfully

Release gates still requiring the target environment:

- provision staging/production HTTPS, database/Supabase and SMTP credentials
- run the new CI/container jobs on a Docker-enabled runner (Docker is not
  installed on the current workstation)
- receive a real SMTP test message and exercise registration/recovery delivery
- connect the selected log/uptime service and prove alert delivery
- create a real encrypted backup and pass an isolated restore rehearsal
- run the authenticated staging role/account-state/QR matrix
- complete the physical Android-device camera/QR smoke test when a phone is
  available

## What “finished” means

The project is considered finished only when all of the following are true:

1. database schema matches the current code
2. backend starts and all core auth/account APIs work
3. web app starts and core user flows work in browser
4. mobile app starts and core user flows work against the backend
5. role-based authorization works correctly
6. tenant isolation works correctly

## Remaining execution direction

### Next — target-environment staging and final release acceptance

- provision the external services and secrets listed in `RELEASE_RUNBOOK.md`
- execute CI, migration, container deployment, SMTP and backup/restore gates
- run authenticated staging and monitoring/alert checks
- run the final physical-device smoke check, then record release evidence

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

1. create the Step 6 release-readiness checkpoint
2. provision and deploy the target staging environment using the runbook
3. complete target-environment and physical-device acceptance before production
