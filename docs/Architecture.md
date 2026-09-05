# Current architecture

This document describes the current implemented architecture, not the original concept phase.

## System view

```text
apps/web  ─┐
           ├──> Express API (backend/src)
apps/mobile┘          │
                      ├──> Prisma ORM
                      └──> PostgreSQL
```

## Active components

### Web

- React
- Vite
- role-aware routing
- owner, university admin, department admin, and instructor web flows

### Mobile

- Flutter client
- connects to the same backend API
- student registration, approval status, and academic workflows only

### Backend

- Express
- TypeScript
- Prisma
- PostgreSQL
- role-based authorization
- tenant isolation
- academic/timetable/attendance domain logic

## Removed from active scope

These are no longer active architecture components:

- robot/device subsystem
- billing/payment subsystem

Legacy references may still exist in historical documents, but they are not part of the target product.

## Design rules

1. backend is the source of truth for authorization
2. tenant isolation is enforced server-side
3. web and mobile are clients of the same API
4. current finish work should stabilize the existing auth approach, not replace it
5. students use mobile only; every staff and administrator role uses web only
