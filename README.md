# WALL-E Campus Assistant

A multi-tenant SaaS platform for university campus operations. Each university is
a tenant; its staff run QR-based attendance sessions, publish a weekly lecture
timetable, receive automated lecture reminders and export student rosters to
Excel. The platform owner manages every tenant from a single console.

This document describes the repository **as it stands**. Anything not built yet
is marked as such rather than described in the future tense.

---

## Overview

WALL-E is a backend-first platform. The API is complete and tested for the
campus features described below; the only user interface that exists is the
**platform owner console** (`apps/web`), which admits `SYSTEM_OWNER` accounts
only. Staff and students have working APIs but no screens.

Billing exists but is **switched off by default** — see
[Billing](#billing-switched-off). Robots are a planned **extension**; the
platform is fully functional without any hardware.

### Contents

- [Project Goals](#project-goals) · [Current Implementation Status](#current-implementation-status)
- [Features](#features) · [System Architecture](#system-architecture) · [Repository Structure](#repository-structure) · [Backend Architecture](#backend-architecture)
- [Authentication & Authorization](#authentication--authorization) · [Multi-Tenant / Organization Isolation](#multi-tenant--organization-isolation)
- [Database](#database) · [Prisma & Migrations](#prisma--migrations) · [API Documentation](#api-documentation)
- [Notification System](#notification-system) · [Excel Export](#excel-export) · [Testing](#testing) · [Seed / Demo Data](#seed--demo-data)
- [Environment Variables](#environment-variables) · [Local Development Setup](#local-development-setup) · [Database Commands](#database-commands)
- [Current Limitations](#current-limitations) · [Planned / Future Features](#planned--future-features) · [Development Roadmap](#development-roadmap)
- [Security Notes](#security-notes) · [Important Development Rules](#important-development-rules)

---

## Project Goals

From `docs/SRS.md`, the original objectives are:

- Digitize the attendance process using QR codes.
- Provide a secure admin authentication system.
- Improve students' navigation inside the university.
- Offer an interactive robot experience.
- Build a scalable software architecture that can be expanded in the future.

What the repository has actually delivered so far is the **software platform**:
multi-tenant attendance, academic timetabling, lecture reminders and roster
reporting. Navigation, the robot interface and face recognition remain
specification-only — see [Planned / Future Features](#planned--future-features).

---

## Current Implementation Status

| Area | Status |
|------|--------|
| Backend API (Express + Prisma + PostgreSQL) | **Implemented** |
| Auth, organizations, users, platform metrics | **Implemented** |
| Campus attendance (courses, sessions, QR scan) | **Implemented** — API only, no UI |
| **Feature 1** — student self-service academic profile | **Implemented** — API only |
| **Feature 2** — academic timetable / lecture schedules | **Implemented** — API only |
| **Feature 3** — lecture notifications + in-process worker | **Implemented** — API only; push delivery is **partial**, see below |
| **Feature 4** — Excel student export (`.xlsx`) | **Implemented** — API only |
| **Feature 5** — university administration console API | **Implemented** — API only, no UI |
| Owner console (React + Vite + Tailwind) | **Implemented** — platform owner screens only |
| Plans, subscriptions, invoices, payments | **Implemented but switched off** — see [Billing](#billing-switched-off) |
| Automated tests (backend) | **Implemented** — 55 tests, 6 files, Vitest |
| Push delivery (FCM / APNs) | **Partially implemented** — provider abstraction exists; the shipped providers log or no-op. No real push is sent |
| Plan-limit enforcement / subscription gating | **Not implemented** — limits are stored and displayed only |
| Student mobile app (Flutter or otherwise) | **Not implemented** — `apps/mobile/` is an empty directory |
| Robot touch UI | **Not implemented** — `apps/tablet/` is empty |
| ESP32 / Raspberry Pi firmware | **Not implemented** — `hardware/` is empty |
| Campus map / navigation, face recognition | **Not implemented** — no models, no endpoints |
| Staff and student web/mobile UI | **Not implemented** — the console admits `SYSTEM_OWNER` only |

Features 1–5 are backend-only. None of them has a user interface yet.

---

## Features

### Feature 1 — Student Academic Profile

**Status: implemented (API only).**

A student's own academic record, filled in by the student. **No approval step.**

- Created empty and `INCOMPLETE` the moment a student registers, so the row
  exists before the data does; every column is nullable.
- `status` flips to `COMPLETED` when all eight required fields are present:
  `faculty`, `department`, `level`, `semester`, `section`, `phoneNumber`,
  `nationalId`, `dateOfBirth`. It is **derived from what is stored**, never set
  by the client (`REQUIRED_PROFILE_FIELDS` in `src/types/student.types.ts`).
- `completedAt` is stamped when the profile first completes and preserved across
  later edits while it stays complete; it is cleared back to `null` if a field is
  removed and the profile falls back to `INCOMPLETE`.
- Completion is judged on the **merged** result, so a student can fill the profile
  in over several requests and still flip to `COMPLETED` on the last one.
- The university ID is not duplicated here — it lives on `User.universityId`,
  which is already unique and collected at registration.
- Validation: phone is `^\+?[\d\s-]{7,20}$`, national ID is 14 digits kept as a
  string (leading zeros matter), date of birth is `YYYY-MM-DD` and must be in
  the past.
- `dataSource`, `externalStudentId` and `lastSyncedAt` are hooks for a future
  university-database import. Nothing writes them today; every profile is
  `SELF_REPORTED`.
- Tenant-scoped and role-guarded: `STUDENT` only, always their own record.

`GET /api/students/me/profile` · `PATCH /api/students/me/profile`

### Feature 2 — Academic Schedule

**Status: implemented (API only).**

`LectureSchedule` is the source of truth for the timetable — one recurring
weekly lecture: "Electronics, every Sunday 12:00–14:00 in B-204, taught by Dr X
to Engineering / Mechatronics / level 2 / semester 1 / section B".

- **This is not a `Session`.** A `Session` is one attendance-taking occurrence an
  admin opens on the day; a `LectureSchedule` is the standing plan behind it.
- Matching keys: `organizationId`, `faculty`, `department`, `level`, `semester`,
  `section`. A student receives only lectures matching their exact academic
  group.
- Each row carries `dayOfWeek`, `startTime`, `endTime`, `room`, `courseId` and
  `instructorId`.
- The academic address is stored as plain columns because that is exactly how
  `StudentProfile` stores it — there is no normalised Faculty/Department model.
- Times are wall-clock `"HH:MM"`, 24-hour and zero-padded, so string comparison
  is a correct time comparison. `DayOfWeek` is declared Sunday-first, so ordering
  by it already reads as a timetable.
- Creating or moving a lecture is rejected if it clashes with the same
  instructor's or the same room's existing booking (overlap, not equality).
- Deletion is soft (`isActive: false`) so past sessions and attendance still
  resolve the lecture they belonged to.
- `semester` is `1` or `2` on a schedule but free text on a profile
  (`"First Semester"`, `"Fall 2025"`); `parseSemesterNumber` reconciles the two,
  and refuses to guess rather than showing a wrong timetable.

`GET /api/schedules` (role-narrowed) · `GET /api/students/me/schedule` ·
`GET /api/admin/schedule` · `POST/PATCH /api/schedules`

### Feature 3 — Notifications

**Status: implemented (API only). Push delivery partially implemented.**

Automated reminders generated from the Feature 2 timetable and stored in the
database. Full detail in [Notification System](#notification-system).

- Admin/instructor reminders: **24 hours** and **30 minutes** before a lecture.
- Student reminder: **10 minutes** before a lecture.
- Notification worker generates and dispatches; duplicate prevention is enforced
  by a database unique constraint.
- Device token registration and in-app notification APIs exist.
- Development simulation endpoints exist and are **never mounted in production**.
- A push provider abstraction exists, but **there is no real FCM/APNs
  integration** — the shipped providers log the reminder and mark it delivered.

### Feature 4 — Excel Export

**Status: implemented (API only).**

Authorized instructors and admins export a course's student roster as a genuine
`.xlsx` workbook, generated per request from live database data. Full detail in
[Excel Export](#excel-export).

`GET /api/courses/:id/students/export`

### Other Existing Modules

**University administration console API (Feature 5) — implemented, API only.**

One university's own dashboard and its own user directory, for
`UNIVERSITY_SUPER_ADMIN` (and `SYSTEM_OWNER`), scoped to the caller's own
organization.

- `GET /api/admin/overview` returns the organization header plus counts:
  active/inactive students, staff, **incomplete academic profiles** (the students
  who silently receive no timetable and no reminders), courses, active lectures,
  sessions today / active / closed this week, scans this week, and average
  attendees per closed session.
  - The attendance figure is deliberately a **measurement, not a rate**: with no
    enrollment model there is no trustworthy denominator, so no percentage is
    invented. It is `null` when no session has closed.
  - "This week" starts on **Sunday, on the campus clock** — the same convention
    the `DayOfWeek` enum is declared in.
- `GET /api/admin/users` returns that organization's paginated user directory,
  filterable by `role` (`UNIVERSITY_SUPER_ADMIN` / `ADMIN` / `STUDENT` —
  `SYSTEM_OWNER` is deliberately not offered), `isActive` and `profileStatus`.
  Password hashes and national IDs are never selected.

These exist as **separate endpoints** rather than as relaxed guards on
`/api/metrics/overview` and `/api/users`, and that distinction is the point:
those two are platform-owner surfaces — the metrics one aggregates across every
university, and the user one takes its organization from a client-supplied query
parameter. Opening either to a university super admin would hand them another
university's data. Here the tenant comes from the authenticated user, and
`adminUserQuerySchema` has **no `organizationId` field at all**, so
`?organizationId=<another-university>` does not survive Zod validation.

There is currently **no web UI for these endpoints** — `apps/web` contains no
admin API client.

**Attendance (QR flow) — implemented, API only.**

1. An admin opens a session; the server stores a per-session `qrSecret`.
2. `GET /api/sessions/:id/qr` returns a JWT signed with `qrSecret + JWT_SECRET`,
   valid for **30 seconds** — the display polls it, so a photographed code
   expires fast.
3. A student POSTs the token to `/api/attendance/scan`. The server verifies the
   signature and expiry, checks the student belongs to the session's
   organization, and rejects duplicates via the unique `(studentId, sessionId)`
   constraint.

`qrSecret` is stripped from every session response. Attendance data feeds
`/api/attendance/analytics`, the Feature 4 export and the Feature 5 dashboard.
**The seed creates no sessions**, so on freshly seeded data every attendance
figure is legitimately zero until sessions are opened and closed.

**Platform administration — implemented, with UI.**

Organizations, users and cross-tenant metrics, all `SYSTEM_OWNER` only. This is
the one area the web console covers.

### Billing (switched off)

Billing is **disabled by default** so a campus can pilot without any plan,
invoice or payment surface in the way. Nothing was deleted — models, services,
routes, pages and modals are all still here, behind one flag on each side:

```
backend/.env       BILLING_ENABLED=false
apps/web/.env      VITE_BILLING_ENABLED=false
```

Set **both** to `true` to bring it back; enabling one without the other leaves
the console calling routes the API does not mount.

While it is off, `/api/plans`, `/api/subscriptions`, `/api/invoices`,
`/api/payments` and `/api/metrics/revenue` are not mounted and return 404, and
the Revenue, Subscriptions, Plans and Invoices pages are unrouted and hidden.

**Nothing enforces plan limits:** `maxUsers`, `maxRobots` and `maxCourses` are
stored but read only for display, and an `EXPIRED` university works exactly like
a paying one. No payment gateway is integrated; a `UNIVERSITY_SUPER_ADMIN`
cannot pay through the app.

---

## System Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  apps/web                │        │  apps/mobile  (EMPTY)    │
│  Platform owner console  │        │  apps/tablet  (EMPTY)    │
│  React 19 + Vite + TW4   │        │  hardware/    (EMPTY)    │
└────────────┬─────────────┘        └──────────────────────────┘
             │ HTTP + JWT (Bearer)
             ▼
┌──────────────────────────────────────────────────────────────┐
│  backend/  Express 5 API                                     │
│                                                              │
│   routes → controllers → services → repositories → Prisma    │
│                                                              │
│   middleware: authenticate, requireRole, validate, errors    │
│   workers:    in-process notification worker (2 timers)      │
│   services/push: push provider abstraction (log / none)      │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
                   ┌───────────────────┐
                   │  PostgreSQL       │
                   │  (dev: Supabase)  │
                   └───────────────────┘
```

**Technology stack**

*Backend* — Node.js, TypeScript (strict, `NodeNext` modules, CommonJS output),
Express 5, Prisma 6 against PostgreSQL (developed on Supabase), Zod for
validation, `jsonwebtoken`, `bcrypt`, `helmet`, `express-rate-limit`, `exceljs`
for `.xlsx` output. Tests run on Vitest. Dev runner is `tsx`.

*Web console* — React 19, Vite, Tailwind 4, TanStack Query, React Router 7,
axios, Recharts, lucide-react, oxlint.

There is **no monorepo tooling**. `backend/` and `apps/web/` each have their own
`package.json` and are installed and run separately; the root `package.json`
carries nothing but a shared TypeScript version.

No Docker, no CI configuration and no OpenAPI spec are present in the repository.

---

## Repository Structure

```
backend/
  prisma/            schema.prisma, migrations/ (5), seed.ts
  src/
    config/          env.ts (Zod-validated), notification.config.ts
    routes/          HTTP surface — 16 route modules
    controllers/     request/response only
    services/        business rules and data-dependent authorization
      push/          push provider abstraction
    repositories/    all Prisma access
    middleware/      auth, validation, error handling
    workers/         notification worker
    types/           Zod schemas and inferred request types
    utils/           AppError, asyncHandler, pagination, QR, occurrence,
                     Excel, serialize
    lib/             prisma client singleton
  tests/             Vitest suite + in-memory repository doubles
apps/
  web/               platform owner console (React 19 + Vite + Tailwind 4)
  mobile/            EMPTY — student app, not started
  tablet/            EMPTY — robot touch UI, not started
hardware/            EMPTY — firmware, not started
database/            database-design.md
docs/                SRS.md, Architecture.md, Architecture Decisions.md
PAGES_AND_GAPS.txt   UI page plan per account type — PLAN ONLY, nothing built
```

`backend/src/models/`, `src/validators/` and `src/generated/` exist but are
**empty** — leftovers from an earlier layout, superseded by `types/` and Prisma's
generated client in `node_modules`.

The web console's pages are: Login, Dashboard, Organizations,
OrganizationDetail, Users, Settings, Robots (an explicit "Planned" placeholder,
routed but showing no live devices), plus the four billing pages (Revenue,
Subscriptions, Plans, Invoices) that are routed only when
`VITE_BILLING_ENABLED=true`.

---

## Backend Architecture

One layering rule, applied throughout:

```
Route → Controller → Service → Repository → Prisma → PostgreSQL
```

| Layer | Responsibility |
|-------|----------------|
| **routes** | HTTP surface, `authenticate`, role guards, Zod validation via `validate` / `validateQuery` |
| **controllers** | Request/response translation only, wrapped in `asyncHandler`. No business logic |
| **services** | Business rules and **every authorization decision that depends on data** — course assignment, cohort matching, ownership, tenant checks |
| **repositories** | The only layer that touches Prisma |
| **middleware** | `authenticate`, `requireRole` / `requireOwner`, `validate` / `validateQuery`, `notFoundHandler`, `errorHandler` |
| **workers** | The in-process notification worker (generation + delivery timers) |
| **types** | Zod schemas and the request types inferred from them |
| **utils** | `AppError`, `asyncHandler`, pagination, QR tokens, occurrence maths, Excel writing, serialization |

Two deliberate exceptions to "one repository per model":

- `AdminRepository` is a **reporting repository**, not a model repository: a
  dashboard counts across `User`, `Course`, `LectureSchedule`, `Session` and
  `Attendance` at once. Keeping those counts together makes the one property that
  matters visible — every query is filtered by the same `organizationId`, which
  is the required first argument of every method.
- `NotificationDispatcher` and `LectureNotificationService` sit alongside
  `NotificationService`, splitting "deliver due reminders" and "generate
  reminders" from "read my inbox".

---

## Authentication & Authorization

### Authentication

- `POST /api/auth/login` returns a JWT signed with `JWT_SECRET`, expiring after
  `JWT_EXPIRES_IN` (default `7d`).
- Every protected route runs `authenticate`, which verifies the token and then
  **re-reads the user from the database** on each request. The request's role and
  organization therefore come from the stored record, never from token claims —
  a deactivated account (`isActive: false`) stops working immediately, within its
  token's validity window.
- `JWT_SECRET` must be at least 32 characters; the server refuses to boot
  otherwise, and there is no fallback value anywhere.
- Passwords are hashed with bcrypt. `passwordHash` is never selected into any
  response.
- Rate limiting: 300 requests / 15 min per IP across `/api` in production
  (10,000 in development), and a tighter limiter on `/api/auth` — 10 / 15 min in
  production, 1,000 in development — that counts **failed attempts only**
  (`skipSuccessfulRequests`).
- `helmet` and a CORS allow-list (`CORS_ORIGINS`) are applied globally.
- `POST /api/auth/register` **always creates a `STUDENT`**. Elevated roles are
  assigned by the platform owner through `/api/users`.

### Roles

Four roles, from the `UserRole` enum in `backend/prisma/schema.prisma`:

| Role | Belongs to | Can do |
|------|-----------|--------|
| `SYSTEM_OWNER` | The platform | Platform administration (organizations, users, cross-tenant metrics, billing). Confined to its **own** organization on every campus route, exactly like any other user. The only role the web console admits |
| `UNIVERSITY_SUPER_ADMIN` | One university | Manages that university's timetable, courses, sessions and attendance; reads its own dashboard and user directory; can export any course roster in their organization |
| `ADMIN` | One university | Teaching staff — professors, doctors, lecturers, engineers. There is no separate professor role; the academic title lives on `AdminProfile.jobTitle`. Reads their own teaching timetable, receives instructor reminders, exports rosters for courses they are assigned to |
| `STUDENT` | One university | Fills their own academic profile, reads their own timetable, scans QR codes, reads their own attendance and notifications |

### Authorization rules

`requireRole(...)` / `requireOwner` guard routes at the edge; anything that
depends on data is decided in the service layer.

| Surface | Rule |
|---------|------|
| Platform routes (`/organizations`, `/users`, `/metrics`, billing) | `SYSTEM_OWNER` only (`requireOwner`) |
| University console (`GET /admin/overview`, `GET /admin/users`) | `UNIVERSITY_SUPER_ADMIN` or `SYSTEM_OWNER`, always their own organization |
| Timetable writes (`POST/PATCH /schedules`) | `UNIVERSITY_SUPER_ADMIN` or `SYSTEM_OWNER` |
| Timetable reads (`GET /schedules`) | Any authenticated user; the **result set** is narrowed by role — an `ADMIN` sees only lectures they teach, a `STUDENT` only their own cohort's |
| `GET /students/me/*` | `STUDENT` only, always their own record |
| `GET /admin/schedule` | `ADMIN` only, always their own teaching load |
| Notifications inbox | Any authenticated user, scoped to their own id — no role check, because there is nothing to escalate to |
| Notification dev tools | `UNIVERSITY_SUPER_ADMIN` / `SYSTEM_OWNER`, and only outside production |
| Roster export | Staff only. `ADMIN` gets courses they are assigned to or created; `UNIVERSITY_SUPER_ADMIN` gets any course in their organization |
| Attendance scan | `STUDENT` only |
| Session management | Staff only (`ADMIN`, `UNIVERSITY_SUPER_ADMIN`, `SYSTEM_OWNER`); `GET /sessions/:id/qr` is open to any authenticated user so a display can poll it |

Two conventions are used deliberately and consistently:

- **A resource in another organization answers 404, never 403.** "Not found" and
  "belongs to another university" are indistinguishable, so no endpoint can be
  used to probe another tenant for the existence of an id.
- **403 is reserved for a real resource the caller genuinely cannot have** — for
  example an `ADMIN` asking to export a course in their own university that they
  are not assigned to.

---

## Multi-Tenant / Organization Isolation

Every `User` carries an `organizationId`. **The tenant boundary is the
organization.**

- `organizationId` is **never accepted from a request body or query string** on
  a campus route. It is always read from the token-backed user record.
  - The one place a client may name an organization is `GET /api/users`, which is
    `SYSTEM_OWNER`-only by design. Its university-scoped counterpart,
    `GET /api/admin/users`, has no such field in its Zod schema at all, so an
    injected `organizationId` is stripped before it can reach a repository.
- `SYSTEM_OWNER` is not exempt: on campus routes it is scoped to its own
  organization (the platform org) like everyone else.
- Cohort keys (faculty, department, section) are free text that different
  universities reuse, so every cohort query takes `organizationId` as a
  **required argument** rather than an optional filter.
- Generated notifications take their `organizationId` from the **lecture**, not
  from the recipient lookup, so a cross-tenant reminder cannot be expressed.
- The one query that deliberately spans tenants is the reminder generator's scan
  of active lectures — it runs as the system, and each lecture's own
  `organizationId` is carried through to the recipients it resolves.
- Cross-tenant isolation is covered by tests in `admin.service.test.ts`,
  `notification.service.test.ts`, `lecture-notification.service.test.ts` and
  `student-export.service.test.ts`.

---

## Database

PostgreSQL via Prisma 6. **14 models and 13 enums.** Full definitions in
`backend/prisma/schema.prisma`; ERD notes in `database/database-design.md`.

**Tenancy and identity**
- `Organization` — a university. The tenant root.
- `User` — unique on both `email` and `universityId`, scoped by `organizationId`.
- `StudentProfile` / `AdminProfile` — 1:1 extensions. `AdminProfile` holds job
  title, office and `faceEnabled` (a boolean nothing reads yet).

**Campus operations**
- `Course` — unique on `(courseCode, organizationId)`, so two universities can
  both have a "CS101".
- `Session` — an attendance window. Holds the per-session `qrSecret`; `ACTIVE`
  or `CLOSED`.
- `Attendance` — unique on `(studentId, sessionId)`; that constraint is what
  makes double-scanning impossible. `PRESENT`, `LATE` or `ABSENT`.
- `LectureSchedule` — the recurring weekly timetable (Feature 2).

**Notifications**
- `Notification` — one reminder for one person for one lecture occurrence
  (Feature 3).
- `DeviceToken` — push registrations, stored but not yet delivered to.

**Billing**
- `SubscriptionPlan`, `Subscription`, `Invoice`, `Payment`. Money is
  `Decimal(10,2)` throughout, never float.

**Enums** — `UserRole`, `SessionStatus`, `AttendanceStatus`,
`SubscriptionStatus`, `BillingCycle`, `PaymentStatus`, `InvoiceStatus`,
`ProfileStatus`, `DayOfWeek`, `NotificationType`, `NotificationStatus`,
`DevicePlatform`, `ProfileDataSource`.

### Two models that do not exist

There is **no enrollment model and no `CourseInstructor` model.** This matters
and is relied on in several places:

- *Which students are on a course?* The cohort a `LectureSchedule` addresses
  (faculty + department + level + semester + section), plus anyone with recorded
  attendance in the course's sessions.
- *Which staff are assigned to a course?* A `LectureSchedule` row **is** the
  teaching assignment; `Course.createdById` is the other ownership signal, and is
  what `CourseService` uses to decide who may edit or delete a course.
- *Why is there no attendance-rate percentage on the university dashboard?*
  Because the denominator — how many students were expected — would have to be
  re-derived per session from cohort matching, which is both expensive and a
  guess.

### Tenant tree

```
Organization (tenant root)
├── User ── StudentProfile | AdminProfile
├── Course ── Session ── Attendance
├── LectureSchedule ── (course, instructor, cohort, day, time, room)
├── Notification ── (user, lectureSchedule, occurrence)
├── DeviceToken
├── Invoice / Payment
└── Subscription (1:1, via Organization.subscriptionId)
```

The billing entity is the `Organization`, never a user: one subscription covers
every account in that university.

---

## Prisma & Migrations

Five migrations in `backend/prisma/migrations/`, applied in order:

| Migration | Adds |
|-----------|------|
| `20260802073548_init` | Initial schema |
| `20260806120000_complete_schema_and_indexes` | Billing models, indexes |
| `20260807090000_student_academic_profile` | `StudentProfile` academic fields (Feature 1) |
| `20260808012004_lecture_schedule` | `LectureSchedule` + `DayOfWeek` (Feature 2) |
| `20260809010248_lecture_notifications` | `Notification`, `DeviceToken` and their enums (Feature 3) |

Features 4 and 5 added **no migration** — both reuse existing models.

The datasource uses two connection strings: `DATABASE_URL` (pooled, used by the
application) and `DIRECT_URL` (unpooled, used by Prisma Migrate). See
[Environment Variables](#environment-variables).

Create a migration without applying it — worth doing on a shared database, so the
SQL can be reviewed before it runs:

```bash
npx prisma migrate dev --create-only --name your_change
# review prisma/migrations/<timestamp>_your_change/migration.sql
npm run db:deploy
```

---

## API Documentation

All routes are prefixed `/api`. Everything except `/api/health`,
`/api/auth/register` and `/api/auth/login` requires a bearer token.

List endpoints accept `page`, `limit`, `search`, `sortBy`, `sortOrder` plus
resource-specific filters, and return `{ data, meta }`.

**No route anywhere checks subscription status**, so campus operations work
regardless of billing state.

### Health

| Method | Path | Who |
|--------|------|-----|
| GET | `/health` | Public — returns status, project name, version, timestamp |

### Auth

| Method | Path | Who |
|--------|------|-----|
| POST | `/auth/register` | Public — always creates a `STUDENT` |
| POST | `/auth/login` | Public — returns JWT |
| GET | `/auth/profile` | Authenticated |
| PATCH | `/auth/profile` | Authenticated — own name/email |
| PATCH | `/auth/password` | Authenticated — own password |

### Platform administration (`SYSTEM_OWNER` only)

| Method | Path |
|--------|------|
| GET | `/organizations` (paginated), `/organizations/:id` |
| POST | `/organizations` |
| PATCH / DELETE | `/organizations/:id` |
| GET | `/users` (paginated), `/users/stats`, `/users/:id` |
| POST | `/users` |
| PATCH / DELETE | `/users/:id` |
| PATCH | `/users/:id/password` |
| GET | `/metrics/overview` |

### University administration console

`UNIVERSITY_SUPER_ADMIN` or `SYSTEM_OWNER`, scoped to the caller's own
organization.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/overview` | The university's own dashboard counts |
| GET | `/admin/users` | The university's own user directory. Filters: `role`, `isActive`, `profileStatus`, plus pagination |

### Student self-service (`STUDENT`)

| Method | Path |
|--------|------|
| GET | `/students/me/profile` |
| PATCH | `/students/me/profile` |
| GET | `/students/me/schedule` |

### Timetable

| Method | Path | Who |
|--------|------|-----|
| POST | `/schedules` | Super admin / owner |
| GET | `/schedules` | Any authenticated user — result narrowed by role |
| GET | `/schedules/:id` | Any authenticated user — 404 unless it is theirs |
| PATCH | `/schedules/:id` | Super admin / owner |
| PATCH | `/schedules/:id/deactivate` | Super admin / owner — soft delete |
| GET | `/admin/schedule` | `ADMIN` — own teaching timetable |

### Notifications

| Method | Path | Who |
|--------|------|-----|
| GET | `/notifications` | Own inbox, paginated (`status`, `type`, `unreadOnly`) |
| GET | `/notifications/unread-count` | Own |
| PATCH | `/notifications/read-all` | Own |
| PATCH | `/notifications/:id/read` | Own |
| POST | `/notifications/device-tokens` | Own |
| PATCH | `/notifications/device-tokens/deactivate` | Own |
| POST | `/notifications/dev/generate` | **Dev only**, super admin / owner |
| POST | `/notifications/dev/simulate` | **Dev only**, super admin / owner |
| POST | `/notifications/dev/dispatch` | **Dev only**, super admin / owner |

### Campus operations

"Staff" means `ADMIN`, `UNIVERSITY_SUPER_ADMIN` or `SYSTEM_OWNER`.

| Method | Path | Who |
|--------|------|-----|
| POST | `/courses` | Staff |
| GET | `/courses` | Any authenticated user, scoped to their org |
| GET | `/courses/my` | Staff — courses they created |
| GET | `/courses/:id`, `/courses/:id/sessions` | Any authenticated user |
| **GET** | **`/courses/:id/students/export`** | **Staff — `.xlsx` roster** |
| PATCH / DELETE | `/courses/:id` | Staff |
| POST | `/sessions` | Staff |
| GET | `/sessions`, `/sessions/:id` | Staff |
| GET | `/sessions/:id/qr` | Any authenticated user — the display polls it |
| PATCH | `/sessions/:id/close` | Staff |
| POST | `/attendance/scan` | `STUDENT` |
| GET | `/attendance/history` | `STUDENT` — own record |
| GET | `/attendance/session/:sessionId` | Staff |
| GET | `/attendance/session/:sessionId/stats` | Staff |
| GET | `/attendance/analytics` | Staff |

### Billing (`SYSTEM_OWNER` only, requires `BILLING_ENABLED=true`)

| Method | Path |
|--------|------|
| GET | `/plans`, `/plans/:id` |
| POST | `/plans` |
| PATCH / DELETE | `/plans/:id` |
| GET | `/subscriptions`, `/subscriptions/:id` |
| POST | `/subscriptions` |
| PATCH | `/subscriptions/:id`, `/subscriptions/:id/cancel`, `/subscriptions/:id/renew` |
| GET | `/invoices`, `/invoices/:id` |
| POST | `/invoices` |
| PATCH | `/invoices/:id`, `/invoices/:id/pay` |
| DELETE | `/invoices/:id` |
| GET | `/payments`, `/payments/:id` |
| POST | `/payments` |
| PATCH | `/payments/:id`, `/payments/:id/refund` |
| GET | `/metrics/revenue` |

> There is no OpenAPI/Swagger specification in the repository. This table is
> generated from the route files by hand and is the current API reference.

---

## Notification System

### Reminder rules

Defined in exactly one place, `backend/src/config/notification.config.ts`:

```ts
ADMIN_REMINDERS   = [1440, 30]   // minutes before the lecture
STUDENT_REMINDERS = [10]
```

Each lead time is paired with the notification type it produces
(`LECTURE_ADMIN_24H`, `LECTURE_ADMIN_30M`, `LECTURE_STUDENT_10M`), so changing a
number forces a decision about what the stored row should be called. **Nothing
else in the application hardcodes these values.**

### Recipients

- **ADMIN reminder** → only the instructor assigned to that lecture, and only if
  their account is active.
- **STUDENT reminder** → only active students whose profile matches the lecture's
  faculty, department, level, semester and section, within the lecture's own
  organization. (With no enrollment model in the schema, the cohort *is* the
  enrollment.)

### Occurrences

There is **no `LectureOccurrence` table.** A weekly slot's concrete instant is
computed in `utils/occurrence.util.ts` and stored on the notification as
`occurrenceStartsAt`. Wall-clock times are resolved through an IANA time zone
(`NOTIFICATION_TIMEZONE`, default `Africa/Cairo`), so daylight saving is handled
from the zone's own rules.

`scheduledFor` (when the reminder goes out) and `occurrenceStartsAt` (when the
lecture begins) are stored separately, so a lead time can change later without
losing the identity of the occurrence already notified about.

### Duplicate prevention

Enforced by the database, not by an application-level check:

```
@@unique([userId, lectureScheduleId, occurrenceStartsAt, type])
```

Generation uses `createMany({ skipDuplicates: true })`, so there is no
read-then-write to race. Re-running generation over a window already covered is
a no-op.

### Message wording

Rendered once at generation time and stored, so a reminder reads the same in the
inbox as it did when it was sent, even if the room changes afterwards:

```
Upcoming lecture       — Electronics lecture is tomorrow at 12:00 PM. Room B-204.
Lecture starting soon  — Electronics lecture starts in 30 minutes. Room B-204.
Lecture starting soon  — Electronics starts in 10 minutes. Room B-204.
```

### Notification worker

`backend/src/workers/notification.worker.ts`, started from `server.ts`, gated by
`NOTIFICATION_WORKER_ENABLED`. Two timers in the API process — deliberately not a
queue or a job runner, because a notification row is already its own job record
with a due time, a status and a lock:

1. **Generation** (default every 15 min, `NOTIFICATION_GENERATION_INTERVAL_MS`)
   — scans active lectures, computes occurrences inside the horizon
   (`NOTIFICATION_HORIZON_MINUTES`, default 2880) and writes `PENDING` rows.
   Idempotent, so a missed run is caught up by the next.
2. **Delivery** (default every 60 s, `NOTIFICATION_POLL_INTERVAL_MS`) — cancels
   reminders overdue by more than an hour, then *claims* a batch of up to 100:
   candidate ids are selected, an `UPDATE` re-tests the lock in the same
   statement and stamps a per-run token, and each worker reads back only its own
   rows. Two workers polling the same second split the batch instead of both
   delivering it.

Failed deliveries retry up to 3 attempts before being marked `FAILED`; locks held
by a dead worker are reclaimed after 5 minutes. Statuses are `PENDING`, `SENT`,
`FAILED`, `CANCELLED`.

Both timers are `unref`'d, so they never hold a shutting-down process open. A
first pass runs on boot so a restart leaves no gap.

Cancelling a lecture cancels its unsent reminders; editing one discards them so
the next generation pass can rebuild them from the new details.

### Push delivery — partially implemented

`services/push/push.provider.ts` defines the `PushNotificationProvider`
interface. Two implementations ship:

- `LoggingPushProvider` (`PUSH_PROVIDER=log`, the default) — writes each reminder
  to the server log and reports it delivered.
- `InAppOnlyPushProvider` (`PUSH_PROVIDER=none`) — stores the row and does
  nothing else.

**Firebase Cloud Messaging is not configured, no APNs integration exists, and no
mobile client exists.** A notification marked `SENT` means "handed to the
configured provider", which today means "logged". Adding FCM later is one new
implementation of the interface and one line in the factory, with no business
logic change. The in-app notification API works fully either way.

### Device token registration

`DeviceToken` stores a provider-issued token, platform (`ANDROID`/`IOS`/`WEB`),
active flag and `lastSeenAt`. The token is globally unique, so a handset
re-registering after a reinstall moves to its new owner rather than duplicating.
Deactivation is scoped to the owner. **Nothing delivers to these tokens yet** —
they are stored so the mobile client has somewhere to register on the day it
exists.

`POST /api/notifications/device-tokens` · `PATCH /api/notifications/device-tokens/deactivate`

### Development simulation

Waiting 24 hours to see a 24-hour reminder is not a test. Three development-only
endpoints make reminders happen now.

They are gated twice: the whole block is **unmounted** unless
`env.devToolsEnabled` — which is forced `false` when `NODE_ENV=production`
whatever `NOTIFICATION_DEV_TOOLS` says, so in production these paths 404 like any
unknown route — and where mounted they require `UNIVERSITY_SUPER_ADMIN` or
`SYSTEM_OWNER` and are confined to the caller's own organization.

```bash
# 1. Sign in as a university super admin (seeded — development credentials)
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<super-admin-email>","password":"<demo-password>"}'

# 2. Pick a lecture id
curl -s http://localhost:5000/api/schedules -H "Authorization: Bearer $TOKEN"

# 3. Fire its reminders now — real recipients, real wording, brought forward
curl -s -X POST http://localhost:5000/api/notifications/dev/simulate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lectureScheduleId":"<id>","types":["LECTURE_ADMIN_24H","LECTURE_STUDENT_10M"]}'

# 4. Read the inbox as the instructor or a student in the cohort
curl -s http://localhost:5000/api/notifications -H "Authorization: Bearer $RECIPIENT_TOKEN"
```

`types` is optional — omitted, all three rules fire. Also available:
`POST /api/notifications/dev/generate` (run a normal generation pass now) and
`POST /api/notifications/dev/dispatch` (run one delivery pass now).

Simulation changes *when* a reminder is delivered, never who receives it or what
it says. The idempotency key is unchanged, so a reminder that already exists is
brought forward rather than duplicated.

---

## Excel Export

`GET /api/courses/:id/students/export` returns a genuine `.xlsx` workbook built
with `exceljs` — not a CSV with the extension changed. Built per request from
live database data, so nothing is stored and no stale file can be fetched later
by someone who has since lost access.

**Columns** — Student Name · University ID · Department · Academic Level ·
Section · Email · Sessions Attended · Sessions Held · Attendance %

**National ID is never included.** It is not even selected by the queries.

- Attendance % is a real fraction with a `0.0%` cell format, so Excel can sort
  and average it; it is left blank (not `0%`) when no session has closed yet.
- Only `CLOSED` sessions count, in both the numerator and the denominator — an
  open session is one students can still scan into.
- `PRESENT` and `LATE` both count as attended.
- The roster is the cohorts of the course's active lecture schedules, plus anyone
  with recorded attendance in its sessions. Neither is complete alone: a course
  with no timetable row addresses no cohort, and an edited cohort no longer
  describes everyone who attended.
- Headers are frozen and auto-filtered; the filename is course slug + kind +
  the date on the campus clock, ASCII-only and punctuation-free so it survives a
  `Content-Disposition` header (e.g. `electronics_students_2026-08-09.xlsx`).
- The response exposes `Content-Disposition` and `X-Student-Count` via
  `Access-Control-Expose-Headers`, so a browser client can read both.

**Authorization** is decided in `StudentExportService`, not at the route: an
`ADMIN` may export a course they instruct (an active `LectureSchedule`) or
created; a `UNIVERSITY_SUPER_ADMIN` may export any course in their organization;
anything in another organization is a **404**, never a 403.

```bash
curl -s -D - -o roster.xlsx \
  "http://localhost:5000/api/courses/<courseId>/students/export" \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

---

## Testing

```bash
cd backend
npm test                  # 55 tests, 6 files
npm run test:watch
npm run typecheck         # src/
npm run typecheck:tests   # src/ + tests/, via tsconfig.test.json
```

| File | Tests | Covers |
|------|-------|--------|
| `tests/occurrence.util.test.ts` | 7 | Weekly slot → instant, Cairo summer/winter offsets, DST crossing, clock formatting |
| `tests/lecture-notification.service.test.ts` | 15 | 24h/30m/10m reminders, recipient rules, cross-tenant exclusion, duplicate prevention, deactivated lecture and instructor, message contents, delivery, overdue cancellation, dev simulation |
| `tests/student-export.service.test.ts` | 13 | Export authorization matrix, real `.xlsx` (ZIP magic + read back through ExcelJS), no national ID, roster membership, cell values, filename |
| `tests/admin.service.test.ts` | 9 | University dashboard counts scoped to one organization, attendance reported as a measurement not an invented rate, Sunday week start on the campus clock, 404 on a deleted tenant, directory scoping, `organizationId` smuggled through the query string ignored, no password hash or national ID exposed, `SYSTEM_OWNER` refused as a role filter |
| `tests/notification.service.test.ts` | 7 | Inbox scoping, mark-read, mark-all-read, another user's notification, another organization's |
| `tests/schedule.regression.test.ts` | 4 | Feature 2 still works after Feature 3 touched the schedule service |

The suite is **database-free**. Repository doubles in `tests/helpers/` subclass
the real repositories, so a method a double forgets to override reaches Postgres
and fails loudly rather than silently returning nothing. There are **no
HTTP-level or integration tests**, and no frontend tests.

---

## Seed / Demo Data

```bash
cd backend
npm run db:seed
```

> **The seed clears existing data by default.** `wipe()` deletes, in
> child-before-parent order: `Attendance`, `Session`, `LectureSchedule`,
> `Course`, `Payment`, `Invoice`, `StudentProfile`, `AdminProfile`, `User`,
> `Subscription`, `Organization`, `SubscriptionPlan`. `Notification` and
> `DeviceToken` are not deleted explicitly — they are removed as a cascade of
> the `User` delete. Set `SEED_KEEP_EXISTING=true` to skip the wipe entirely.

It creates:

- 4 subscription plans (Free, Basic, Pro, Enterprise) and the platform owner
  organization (`WALLE`)
- 8 universities (`NCTU`, `CU`, `AU`, `ASU`, `MU`, `HU`, `AUN`, `TU`) spanning
  every subscription state, their users, and 8 months of invoices and payments
  so the revenue charts have real history
- A fixed **timetable demo cohort** in two universities (`NCTU` and `CU`) so
  cross-tenant isolation can be demonstrated: identical faculty
  (Faculty of Engineering), department (Mechatronics), level 2, First Semester,
  five courses (`MEC201`–`MEC205`), two instructors, a seven-lecture week, and
  three students — section A, section B, and one a level up so filtering can be
  seen to exclude as well as include
- One **development lecture** (Robotics Lab) in room `DEV-LAB`, placed ~90
  minutes after whenever the seed runs (computed from the clock, not a fixed
  date), with its own instructor `dev.reminder@<domain>.edu.eg`, so lecture
  reminders can be watched being generated

Randomised data comes from a seeded PRNG, so repeated seeds produce the same
dataset. The billing half is still written while `BILLING_ENABLED=false` — it is
simply not reachable until the flag is turned back on.

The seed creates **no sessions and no attendance records**, so attendance
figures are legitimately zero on fresh data.

### Development / demo credentials

> These are **development and demo credentials only**, defined in
> `backend/prisma/seed.ts` for local use. They must never be used on a
> deployment reachable by anyone else. Override the owner pair with
> `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` before seeding.

| Account | Value |
|---------|-------|
| Platform owner email | `owner@wall-e.io` |
| Platform owner password | `Owner@12345` |
| All seeded university accounts | password `Demo@12345` |

The seed prints the full account list on completion, including the demo cohort's
student and instructor addresses for `NCTU` and `CU`.

---

## Environment Variables

> Never commit a real secret. `.env` files are gitignored; only `.env.example`
> is tracked, and it contains placeholders.

### `backend/.env`

Validated by Zod at boot (`src/config/env.ts`) — **the server exits on anything
invalid**, printing which variable failed.

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `JWT_SECRET` | — | **Required**, min 32 chars, no fallback |
| `JWT_EXPIRES_IN` | `7d` | |
| `DATABASE_URL` | — | **Required**. Pooled connection used by the application |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allow-list |
| `BILLING_ENABLED` | `false` | See [Billing](#billing-switched-off) |
| `NOTIFICATION_WORKER_ENABLED` | `true` | Runs generation + delivery in this process |
| `NOTIFICATION_TIMEZONE` | `Africa/Cairo` | IANA zone; the campus clock a lecture's `"12:00"` is read in. Also the date stamped on export filenames and the week boundary on the university dashboard |
| `NOTIFICATION_HORIZON_MINUTES` | `2880` | Min 60. How far ahead reminders are generated; raised automatically if set below the longest lead time + 60 |
| `NOTIFICATION_POLL_INTERVAL_MS` | `60000` | Min 1000. Delivery poll |
| `NOTIFICATION_GENERATION_INTERVAL_MS` | `900000` | Min 1000. Generation pass |
| `PUSH_PROVIDER` | `log` | `log` \| `none`. **No real push provider is implemented** |
| `NOTIFICATION_DEV_TOOLS` | `true` | Exposes `/api/notifications/dev/*`. **Ignored when `NODE_ENV=production`** |

**`DIRECT_URL`** is also required in practice but is **not** part of the Zod
schema — it is read directly by Prisma (`datasource db { directUrl = ... }`) for
migrations. A missing `DIRECT_URL` will not stop the API booting; it will break
`prisma migrate`.

### `apps/web/.env`

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_API_URL` | `/api` | Leave unset in development; Vite proxies instead |
| `VITE_BILLING_ENABLED` | `false` | Must match `BILLING_ENABLED` in the backend |

### Seed-only

`SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_KEEP_EXISTING`. The seed also
reads `NOTIFICATION_TIMEZONE` to place the development lecture.

---

## Local Development Setup

### Requirements

- Node.js 20+
- A PostgreSQL database (developed against Supabase)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env       # fill in DATABASE_URL, DIRECT_URL and JWT_SECRET
npm run db:deploy          # apply migrations
npm run db:seed            # load demo data (CLEARS existing data by default)
npm run dev                # http://localhost:5000
```

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Web console

```bash
cd apps/web
npm install
npm run dev                # http://localhost:3000
```

Vite proxies `/api` to `http://localhost:5000`, so no frontend env vars are
needed in development.

### 3. Sign in

Use the development owner credentials from
[Seed / Demo Data](#development--demo-credentials).

> The console admits `SYSTEM_OWNER` only. A university account that signs in gets
> an access-denied screen — there is no staff or student UI yet.

### Running the Backend

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch mode (`tsx watch`), starts the API **and** the notification worker |
| `npm run build` | Compile to `dist/` (`tsc`) |
| `npm start` | Run the compiled server (`node dist/server.js`) |
| `npm run typecheck` | Types, `src/` only |
| `npm run typecheck:tests` | Types, `src/` + `tests/` |
| `npm test` / `npm run test:watch` | Vitest |

`npm run dev` starts the notification worker in the same process. Disable it
with `NOTIFICATION_WORKER_ENABLED=false` on any instance that must not send.

### Running the Web Dashboard

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Typecheck (`tsc -b`) + production build |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | oxlint |

---

## Database Commands

Run from `backend/`:

| Command | Purpose |
|---------|---------|
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create + apply a migration (development) |
| `npm run db:deploy` | Apply pending migrations (CI / production) |
| `npm run db:seed` | Rebuild demo data — **clears existing data** unless `SEED_KEEP_EXISTING=true` |
| `npm run db:reset` | Drop, re-apply every migration, re-seed |
| `npm run db:studio` | Prisma Studio |
| `npx prisma validate` | Validate `schema.prisma` |
| `npx prisma migrate status` | Show what is applied where |

---

## Current Limitations

**Interface**
- Features 1–5 have **no UI**. The console admits `SYSTEM_OWNER` only; staff and
  students have no screen at all.
- No student mobile app. `apps/mobile/`, `apps/tablet/` and `hardware/` are empty
  directories.
- `PAGES_AND_GAPS.txt` describes the intended student / admin / super-admin page
  set. It is a **plan only** — none of those pages exist.

**Notifications**
- **Push is not actually delivered.** The provider logs and marks the row `SENT`;
  no FCM or APNs integration exists, and `DeviceToken` rows are stored but never
  sent to.
- One time zone platform-wide, not per organization.
- Semester matching happens in application code because profiles store free text;
  a student whose semester text cannot be parsed receives no reminders — the same
  behaviour their timetable already has.
- Reminders overdue by more than an hour are cancelled rather than sent, so a
  long outage drops that window.
- The worker runs in every instance that has it enabled. Claiming makes that
  safe, but each replica polls the table.
- Editing a lecture discards its unsent reminders and waits for the next
  generation pass (≤15 min), so an edit minutes before a lecture can lose that
  occurrence's 10-minute reminder.

**Export and reporting**
- Attendance percentages are zero on seeded data because the seed creates no
  sessions.
- The roster is computed live per request, one cohort query per lecture schedule.
- The university dashboard reports average attendees per session, **not** an
  attendance rate — see [Database](#two-models-that-do-not-exist).

**Data model**
- No enrollment model. Cohort membership stands in for it everywhere.
- No `CourseInstructor` model; a `LectureSchedule` row is the teaching
  assignment.
- `AdminProfile.faceEnabled` exists as a boolean nothing reads.
- No normalised Faculty/Department model — the academic address is free text on
  both `StudentProfile` and `LectureSchedule`.

**Billing**
- No enforcement of plan limits, no subscription gate on any campus route, no
  payment gateway.

**Engineering**
- Tests are unit-level with in-memory repository doubles. No HTTP/integration
  tests, and database constraints are simulated rather than exercised.
- No CI (`.github/` does not exist), no Dockerfile, no OpenAPI spec.
- Platform settings pages in the console (tax rate, currency, notification
  preferences) are display-only.

---

## Planned / Future Features

Not started. Specified in `docs/SRS.md` but with **no models, endpoints or code**
in the repository:

- Campus map, classroom search and turn-by-turn navigation
- Face recognition authentication for admins
- Robot touch UI (`apps/tablet/`) and voice/announcement playback
- ESP32 / Raspberry Pi firmware (`hardware/`)
- Robot fleet registry and device management (the console's Robots page is an
  explicit placeholder)
- Student mobile application (`apps/mobile/`)
- PDF / attendance reporting beyond the Feature 4 roster export
- University-database (SIS) import — the `dataSource`, `externalStudentId` and
  `lastSyncedAt` columns exist as hooks, but nothing writes them

---

## Development Roadmap

Ordered by what blocks a real campus pilot.

1. **University-facing console.** Role-based routing, the university dashboard
   and directory (`/api/admin/*` already exist and are untouched by any UI),
   course and session management, the live QR display (polling
   `GET /sessions/:id/qr` on ~25 s, since tokens expire at 30 s), and a live
   attendance roster. Without this there is no screen for a staff member to open
   a session.
2. **Student experience.** Sign in, scan, view timetable, view notifications,
   view attendance history — every API already exists. A mobile web route inside
   the existing React app would reach a pilot sooner than a native app.
3. **Push delivery.** Implement `PushNotificationProvider` against FCM and wire
   a mobile client to `POST /notifications/device-tokens`.
4. **Reports.** PDF/attendance reporting beyond the Feature 4 roster export.
5. **SRS features not started.** Campus map, classroom search and navigation;
   face recognition for admins; robot touch UI; ESP32 firmware.
6. **Production readiness.** Integration tests, CI, containerisation, an OpenAPI
   spec.
7. **Billing.** Deferred until after the pilot: enforcement guards, a realistic
   zero-price plan for non-paying universities, and self-serve payment if
   universities should ever pay in-app.

---

## Security Notes

- **Secrets never live in the repository.** `.env` is gitignored; only
  `.env.example` is tracked, and every value in it is a placeholder. Generate
  your own `JWT_SECRET`; the one in `.env.example` is not a usable key.
- `JWT_SECRET` has **no fallback**. An empty signing key would silently make
  every token forgeable, so the server refuses to boot without a 32+ character
  value.
- Passwords are bcrypt-hashed. `passwordHash` is never selected into a response
  by any endpoint, and this is asserted by test.
- **National ID is never exported and never listed.** It is excluded from the
  Excel workbook and from the university user directory at the query level, not
  by filtering after the fact.
- Tokens are re-validated against the database on every request, so deactivating
  a user takes effect immediately rather than at token expiry.
- Cross-tenant reads answer **404, not 403**, so no endpoint can be used to probe
  another university for the existence of an id.
- `organizationId` is never taken from a request on a campus route; Zod strips
  unknown keys, so an injected tenant id cannot reach a repository.
- Development simulation endpoints are **unmounted** in production, not merely
  guarded.
- Rate limiting is applied globally and more tightly on credential endpoints,
  counting failed attempts only.
- The seeded credentials in this document are **development/demo values from
  `prisma/seed.ts`**. Change them (or override via `SEED_OWNER_*`) before any
  deployment that is reachable by anyone else.

---

## Important Development Rules

Conventions this codebase relies on. Breaking one of them is a defect even if
the tests still pass.

1. **Respect the layering.** `Route → Controller → Service → Repository →
   Prisma`. Controllers translate request and response only; **repositories are
   the only layer that may touch Prisma**; services own the business rules.
2. **Authorization that depends on data belongs in the service.** Route guards
   (`requireRole`, `requireOwner`) handle only what a role alone can decide.
3. **Never read `organizationId` from a request** on a campus route. Take it from
   the token-backed user record. If a query schema does not need it, it must not
   declare it.
4. **404 for another tenant's resource, 403 only for a real resource the caller
   cannot have.**
5. **Reminder lead times live in `config/notification.config.ts` and nowhere
   else.** Do not hardcode 1440, 30 or 10. Changing a lead time means changing
   its `NotificationType` in the same edit.
6. **Derived state is derived.** `StudentProfile.status` is computed from the
   required fields; a client may never set it.
7. **Soft-delete the timetable.** `LectureSchedule` deactivates rather than
   deletes, so history keeps resolving.
8. **Rely on database constraints for idempotency**, not read-then-write —
   the notification unique key and `skipDuplicates` are the pattern.
9. **Do not invent metrics.** If a denominator is not knowable (attendance rate
   without an enrollment model), report the measurement or `null` instead of an
   estimate.
10. **Keep the two billing flags in sync.** `BILLING_ENABLED` and
    `VITE_BILLING_ENABLED` must match, or the console calls routes the API does
    not mount.
11. **Run `npm run typecheck:tests` as well as `npm test`.** The default
    `typecheck` covers `src/` only.
