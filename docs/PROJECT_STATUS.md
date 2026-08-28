# Project status — August 28, 2026

This file is the operational source of truth for the current project state.

## Current state

Completed and checkpointed before this phase:

- robot/device feature removed from active app scope
- billing/payment/subscription/invoice feature removed from active app scope
- backend aligned to the reduced product scope
- web app aligned to the reduced product scope
- all 13 migrations applied and verified against the rebuilt Supabase public schema
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

Verified:

- backend Prisma schema validates
- backend typecheck passes
- backend tests pass: 443 tests in 32 files
- web typecheck/production build passes
- web tests pass: 25 tests in 7 files
- rendered browser checks pass for login, registration, forgot-password and reset-callback pages
- mobile runtime walker covers 25 screens with zero reported findings

Still outstanding:

- browser login/restoration/logout with a real seeded password (requires action-time approval before credential transmission)
- full Flutter suite with the repository's committed lockfile on its matching newer Flutter/Dart SDK; this machine has Flutter 3.24.5
- later authorization, connected-client, deployment and release phases in `plan.txt`

## What “finished” means

The project is considered finished only when all of the following are true:

1. database schema matches the current code
2. backend starts and all core auth/account APIs work
3. web app starts and core user flows work in browser
4. mobile app starts and core user flows work against the backend
5. role-based authorization works correctly
6. tenant isolation works correctly

## Remaining execution direction

### Next — authorization hardening (plan Phase 6)

- confirm backend remains the source of truth
- verify forbidden routes and forbidden API access fail correctly
- verify cross-tenant access is blocked

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

1. finish the approved credentialed browser smoke test
2. run Flutter on the matching SDK and a device/emulator
3. execute the route-permission matrix and negative tenant/department/course/cohort tests
4. continue the remaining phases in `plan.txt`
