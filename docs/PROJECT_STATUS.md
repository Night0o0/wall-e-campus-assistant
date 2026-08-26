# Project status — August 26, 2026

This file is the operational source of truth for the current project state.

## Current state

Completed in code:

- robot/device feature removed from active app scope
- billing/payment/subscription/invoice feature removed from active app scope
- backend aligned to the reduced product scope
- web app aligned to the reduced product scope
- seed script aligned to the reduced product scope
- migration prepared to remove legacy robot/billing data

Verified:

- backend Prisma schema validates
- backend typecheck passes
- backend tests pass
- web typecheck/build passes
- web tests pass

Not yet fully verified end-to-end:

- real database after applying latest migration
- browser runtime flows against live backend
- Flutter runtime flows against live backend

## What “finished” means

The project is considered finished only when all of the following are true:

1. database schema matches the current code
2. backend starts and all core auth/account APIs work
3. web app starts and core user flows work in browser
4. mobile app starts and core user flows work against the backend
5. role-based authorization works correctly
6. tenant isolation works correctly

## Remaining execution phases

### Phase 1 — database alignment

- inspect migration status
- apply the latest Prisma migration safely
- regenerate Prisma client
- reseed development data if needed

### Phase 2 — backend runtime verification

- start backend locally
- verify env values
- verify health endpoint
- manually verify:
  - login
  - register
  - register complete
  - profile/account
  - password flows

### Phase 3 — web runtime verification

- start web app locally
- test these flows in browser:
  - login
  - register
  - complete registration
  - account page
  - logout
- verify role-based navigation and protected routes
- verify owner, university admin, instructor, and student screens

### Phase 4 — mobile runtime verification

- run Flutter app on emulator/device
- verify backend connectivity
- verify auth flows
- verify account/profile flow
- verify student core flows
- verify staff core flows

### Phase 5 — authorization hardening

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

1. apply the latest database migration
2. start backend and web together
3. run live auth/account smoke tests
4. then validate Flutter against the same backend
