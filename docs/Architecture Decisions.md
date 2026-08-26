# Architecture decisions

## Status

This file records the current product decisions as of August 26, 2026.

## Decision 1 — remove robot/device scope

The robot/device feature is no longer part of the active product.

Reason:

- it is not part of the target release
- it increases finish risk
- the academic and attendance platform can ship without it

## Decision 2 — remove billing/payment scope

Billing, subscriptions, invoices, and payments are no longer part of the active product.

Reason:

- not needed for the intended project direction
- removing it simplifies the schema, APIs, and UI
- it reduces end-to-end validation scope

## Decision 3 — backend-enforced authorization

Authorization remains enforced on the backend.

Reason:

- role checks must not depend on client behavior
- tenant isolation must be guaranteed server-side

## Decision 4 — finish current auth path before changing providers

The project should finish on its current auth direction before considering Clerk or another provider migration.

Reason:

- the codebase already contains the current auth flow
- swapping auth providers now would create a separate migration project
- finish risk is lower when stabilizing the existing system
