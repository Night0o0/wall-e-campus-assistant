# WALL-E Campus Assistant

A multi-tenant SaaS platform for university campus operations. Each university is
a tenant; its staff run QR-based attendance sessions, publish a weekly lecture
timetable, receive automated lecture reminders and export student rosters to
Excel. The platform owner manages every tenant from a single console.

Billing exists but is currently switched off — see [Billing](#billing). Robots
are a planned **extension**; the platform is fully functional without any
hardware.

This document describes the repository **as it stands**. Anything not built yet
is marked as such rather than described in the future tense.

---

## Contents

- [What's built](#whats-built) · [Architecture](#architecture) · [Stack](#technology-stack)
- [Roles and tenancy](#roles-and-tenancy) · [Authentication](#authentication) · [Authorization rules](#authorization-rules) · [Tenant isolation](#tenant-isolation)
- [Data model](#data-model) · [Migrations](#migrations) · [Seed data](#seed-data)
- Features: [Student profile](#feature-1--student-self-service-profile) · [Timetable](#feature-2--academic-timetable) · [Notifications](#feature-3--lecture-notifications) · [Excel export](#feature-4--excel-student-export) · [Attendance](#attendance)
- [API reference](#api-reference) · [Billing](#billing)
- [Getting started](#getting-started) · [Environment variables](#environment-variables) · [Scripts](#scripts) · [Tests](#tests)
- [Limitations](#current-limitations) · [Roadmap](#roadmap)

---

## What's built

| Area | Status |
|------|--------|
| Backend API (Express + Prisma + PostgreSQL) | Working |
| Auth, organizations, users, metrics | Working |
| Campus attendance (courses, sessions, QR scan) | Working — API only, no UI |
| **Feature 1** — student self-service academic profile | Working — API only |
| **Feature 2** — academic timetable / lecture schedules | Working — API only |
| **Feature 3** — lecture notifications + in-process worker | Working — API only |
| **Feature 4** — Excel student export (`.xlsx`) | Working — API only |
| Owner console (React + Vite + Tailwind) | Working — platform owner screens only |
| Plans, subscriptions, invoices, payments | Built, **switched off** — see [Billing](#billing) |
| Automated tests (backend) | 46 tests, Vitest — see [Tests](#tests) |
| **Student mobile app (Flutter or otherwise)** | **NOT YET IMPLEMENTED** — `apps/mobile/` is an empty directory |
| **Robot touch UI** | **NOT YET IMPLEMENTED** — `apps/tablet/` is empty |
| **ESP32 / Raspberry Pi firmware** | **NOT YET IMPLEMENTED** — `hardware/` is empty |
| Push delivery (Firebase or other provider) | **NOT YET IMPLEMENTED** — abstraction in place, no provider wired |
| Campus map / navigation, face recognition | **NOT YET IMPLEMENTED** — no models, no endpoints |

Features 1–4 are backend-only. None of them has a user interface yet: the web
console admits `SYSTEM_OWNER` accounts only.

---

## Architecture

One layering rule, applied throughout the backend:

```
routes → controllers → services → repositories → Prisma
```

- **routes** — HTTP surface, authentication, role guards, Zod validation
- **controllers** — request/response translation only, wrapped in `asyncHandler`
- **services** — business rules and every authorization decision that depends on
  data (course assignment, cohort matching, ownership)
- **repositories** — the only layer that touches Prisma
- **middleware** — `authenticate`, `requireRole`/`requireOwner`, `validate`/`validateQuery`, error handling
- **workers** — the in-process notification worker
- **types** — Zod schemas and inferred request types
- **utils** — `AppError`, pagination, QR tokens, occurrence maths, Excel writing

There is no monorepo tooling. `backend/` and `apps/web/` each have their own
`package.json` and are installed and run separately; the root `package.json`
carries nothing but a shared TypeScript version.

### Project layout

```
backend/
  prisma/            schema.prisma, migrations/, seed.ts
  src/
    config/          env.ts (Zod-validated), notification.config.ts
    routes/          HTTP surface
    controllers/     request/response only
    services/        business rules
      push/          push provider abstraction
    repositories/    all Prisma access
    middleware/      auth, validation, error handling
    workers/         notification worker
    types/           Zod schemas
    utils/           AppError, pagination, QR, occurrence, Excel
    lib/             prisma client singleton
  tests/             Vitest suite + in-memory repository doubles
apps/
  web/               platform owner console (React 19 + Vite + Tailwind 4)
  mobile/            EMPTY — student app, not started
  tablet/            EMPTY — robot touch UI, not started
hardware/            EMPTY — firmware, not started
database/            database-design.md
docs/                SRS.md, Architecture.md, Architecture Decisions.md
```

`backend/src/models/`, `src/validators/` and `src/generated/` exist but are
empty — leftovers from an earlier layout, superseded by `types/` and Prisma's
generated client in `node_modules`.

---

## Technology stack

**Backend** — Node.js, TypeScript (strict, `NodeNext` modules, CommonJS output),
Express 5, Prisma 6 against PostgreSQL (developed on Supabase), Zod for
validation, `jsonwebtoken`, `bcrypt`, `helmet`, `express-rate-limit`, `exceljs`
for `.xlsx` output. Tests run on Vitest. Dev runner is `tsx`.

**Web console** — React 19, Vite, Tailwind 4, TanStack Query, React Router 7,
axios, Recharts, oxlint.

No Docker, no CI configuration and no OpenAPI spec are present in the repository.

---

## Roles and tenancy

Four roles, from the `UserRole` enum in `backend/prisma/schema.prisma`:

| Role | Belongs to | Can do |
|------|-----------|--------|
| `SYSTEM_OWNER` | The platform | Platform administration (organizations, users, metrics, billing). Confined to its **own** organization on every campus route, exactly like any other user. The only role the web console admits. |
| `UNIVERSITY_SUPER_ADMIN` | One university | Manages that university's timetable, courses, sessions and attendance; can export any course roster in their organization |
| `ADMIN` | One university | Teaching staff — professors, doctors, lecturers, engineers. There is no separate professor role; the academic title lives on `AdminProfile.jobTitle`. Reads their own teaching timetable, receives instructor reminders, exports rosters for courses they are assigned to |
| `STUDENT` | One university | Fills their own academic profile, reads their own timetable, scans QR codes, reads their own attendance and notifications |

Every `User` carries an `organizationId`. **The tenant boundary is the
organization.**

`POST /api/auth/register` always creates a `STUDENT`. Elevated roles are assigned
by the platform owner through `/api/users`.

---

## Authentication

- `POST /api/auth/login` returns a JWT signed with `JWT_SECRET`, carrying
  `{ id, email, role }` and expiring after `JWT_EXPIRES_IN` (default `7d`).
- Every protected route runs `authenticate`, which verifies the token and then
  **re-reads the user from the database** on each request. The request's role and
  organization therefore come from the stored record, never from token claims —
  a deactivated account (`isActive: false`) stops working immediately, within its
  token's validity window.
- `JWT_SECRET` must be at least 32 characters; the server refuses to boot
  otherwise, and there is no fallback value anywhere.
- Passwords are hashed with bcrypt. `passwordHash` is never selected into any
  response (`safeUserSelect`).
- Rate limiting: 300 requests / 15 min per IP across `/api` in production
  (10,000 in development), and a tighter 10 / 15 min on `/api/auth` that only
  counts failed attempts.
- `helmet` and a CORS allow-list (`CORS_ORIGINS`) are applied globally.

### Authorization rules

`requireRole(...)` / `requireOwner` guard routes at the edge; anything that
depends on data is decided in the service layer.

| Surface | Rule |
|---------|------|
| Platform routes (`/organizations`, `/users`, `/metrics`, billing) | `SYSTEM_OWNER` only (`requireOwner`) |
| Timetable writes (`POST/PATCH /schedules`) | `UNIVERSITY_SUPER_ADMIN` or `SYSTEM_OWNER` |
| Timetable reads (`GET /schedules`) | Any authenticated user; the **result set** is narrowed by role — an `ADMIN` sees only lectures they teach, a `STUDENT` only their own cohort's |
| `GET /students/me/*` | `STUDENT` only, always their own record |
| `GET /admin/schedule` | `ADMIN` only, always their own teaching load |
| Notifications inbox | Any authenticated user, scoped to their own id — no role check, because there is nothing to escalate to |
| Notification dev tools | `UNIVERSITY_SUPER_ADMIN`/`SYSTEM_OWNER`, and only outside production |
| Roster export | Staff only. `ADMIN` gets courses they are assigned to; `UNIVERSITY_SUPER_ADMIN` gets any course in their organization |
| Attendance scan | `STUDENT` only |

Two conventions are used deliberately and consistently:

- **A resource in another organization answers 404, never 403.** "Not found" and
  "belongs to another university" are indistinguishable, so no endpoint can be
  used to probe another tenant for the existence of an id.
- **403 is reserved for a real resource the caller genuinely cannot have** — for
  example an `ADMIN` asking to export a course in their own university that they
  are not assigned to.

### Tenant isolation

- `organizationId` is **never accepted from a request body or query string**. It
  is always read from the token-backed user record.
- `SYSTEM_OWNER` is not exempt: on campus routes it is scoped to its own
  organization (the platform org) like everyone else.
- Cohort keys (faculty, department, section) are free text that different
  universities reuse, so every cohort query takes `organizationId` as a required
  argument rather than an optional filter.
- Generated notifications take their `organizationId` from the **lecture**, not
  from the recipient lookup, so a cross-tenant reminder cannot be expressed.
- The one query that deliberately spans tenants is the reminder generator's scan
  of active lectures — it runs as the system, and each lecture's own
  `organizationId` is carried through to the recipients it resolves.

---

## Data model

14 models and 13 enums. Full definitions in `backend/prisma/schema.prisma`; ERD
notes in `database/database-design.md`.

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

There is **no enrollment model and no `CourseInstructor` model.** This matters
and is relied on in two places:

- *Which students are on a course?* The cohort a `LectureSchedule` addresses
  (faculty + department + level + semester + section), plus anyone with recorded
  attendance in the course's sessions.
- *Which staff are assigned to a course?* A `LectureSchedule` row **is** the
  teaching assignment; `Course.createdById` is the other ownership signal, and is
  what `CourseService` already uses to decide who may edit or delete a course.

### Multi-tenant model

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

## Feature 1 — student self-service profile

A student's own academic record, filled in by the student. **No approval step.**

- Created empty and `INCOMPLETE` the moment a student registers, so the row
  exists before the data does; every column is nullable.
- `status` flips to `COMPLETED` when all of `faculty`, `department`, `level`,
  `semester`, `section`, `phoneNumber`, `nationalId` and `dateOfBirth` are
  present. It is **derived from what is stored**, never set by the client.
- The university ID is not duplicated here — it lives on `User.universityId`,
  which is already unique and collected at registration.
- `dataSource`, `externalStudentId` and `lastSyncedAt` are the hooks a future
  university-database import would use. Nothing writes them today; every profile
  is `SELF_REPORTED`.

`GET /api/students/me/profile` · `PATCH /api/students/me/profile`

---

## Feature 2 — academic timetable

`LectureSchedule` is one recurring weekly lecture — "Electronics, every Sunday
12:00–14:00 in B-204, taught by Dr X to Engineering / Mechatronics / level 2 /
semester 1 / section B".

- **This is not a `Session`.** A `Session` is one attendance-taking occurrence an
  admin opens on the day; a `LectureSchedule` is the standing plan behind it.
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
`GET /api/admin/schedule`

---

## Feature 3 — lecture notifications

Automated reminders generated from the Feature 2 timetable.

### Reminder rules

Defined in exactly one place, `backend/src/config/notification.config.ts`:

```ts
ADMIN_REMINDERS   = [1440, 30]   // minutes before the lecture
STUDENT_REMINDERS = [10]
```

Each lead time is paired with the notification type it produces
(`LECTURE_ADMIN_24H`, `LECTURE_ADMIN_30M`, `LECTURE_STUDENT_10M`), so changing a
number forces a decision about what the stored row should be called. Nothing
else in the application hardcodes these values.

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
   reminders overdue by more than an hour, then *claims* a batch: candidate ids
   are selected, an `UPDATE` re-tests the lock in the same statement and stamps a
   per-run token, and each worker reads back only its own rows. Two workers
   polling the same second split the batch instead of both delivering it.

Failed deliveries retry up to 3 attempts before being marked `FAILED`; locks held
by a dead worker are reclaimed after 5 minutes. Statuses are `PENDING`, `SENT`,
`FAILED`, `CANCELLED`.

Both timers are `unref`'d, so they never hold a shutting-down process open. A
first pass runs on boot so a restart leaves no gap.

Cancelling a lecture cancels its unsent reminders; editing one discards them so
the next generation pass can rebuild them from the new details.

### Push delivery — not yet wired

`services/push/push.provider.ts` defines `PushNotificationProvider`. Two
implementations ship: `LoggingPushProvider` (writes each reminder to the server
log — the default) and `InAppOnlyPushProvider`. **Firebase Cloud Messaging is not
configured and no mobile client exists**; adding FCM later is one new
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

---

## Feature 4 — Excel student export

`GET /api/courses/:id/students/export` returns a genuine `.xlsx` workbook built
with `exceljs` — not a CSV with the extension changed. Built per request from
live data, so nothing is stored and no stale file can be fetched later by someone
who has since lost access.

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
- Headers are frozen and auto-filtered; the file is named
  `electronics_students_2026-08-09.xlsx` — course slug, kind, and the date on the
  campus clock.

Authorization is decided in `StudentExportService`: an `ADMIN` may export a
course they instruct (an active `LectureSchedule`) or created; a
`UNIVERSITY_SUPER_ADMIN` may export any course in their organization; anything in
another organization is a 404.

---

## Attendance

The QR flow, unchanged and working:

1. An admin opens a session; the server stores a per-session `qrSecret`.
2. `GET /api/sessions/:id/qr` returns a JWT signed with `qrSecret + JWT_SECRET`,
   valid for **30 seconds** — the display polls it, so a photographed code
   expires fast.
3. A student POSTs the token to `/api/attendance/scan`. The server verifies the
   signature and expiry, checks the student belongs to the session's
   organization, and rejects duplicates via the unique `(studentId, sessionId)`
   constraint.

`qrSecret` is stripped from every session response.

Attendance data feeds two other features: `/api/attendance/analytics` (per-admin
session statistics) and the Feature 4 export's attendance columns. **The seed
creates no sessions**, so on freshly seeded data every attendance figure is
legitimately zero until sessions are opened and closed.

---

## API reference

All routes are prefixed `/api`. Everything except `/auth/register`,
`/auth/login` and `/health` requires a bearer token.

### Auth
| Method | Path | Who |
|--------|------|-----|
| POST | `/auth/register` | Public — always creates a `STUDENT` |
| POST | `/auth/login` | Public — returns JWT |
| GET | `/auth/profile` | Authenticated |
| PATCH | `/auth/profile` | Authenticated — name/email |
| PATCH | `/auth/password` | Authenticated — own password |

### Platform (`SYSTEM_OWNER` only)
| Method | Path |
|--------|------|
| GET/POST | `/organizations`, `/users` |
| GET | `/organizations/:id`, `/users/:id`, `/users/stats` |
| PATCH/DELETE | the same resources by `:id` |
| PATCH | `/users/:id/password` |
| GET | `/metrics/overview` |

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
| PATCH | `/schedules/:id/deactivate` | Super admin / owner |
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
| PATCH/DELETE | `/courses/:id` | Staff |
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
| GET/POST | `/plans`, `/subscriptions`, `/invoices`, `/payments` |
| PATCH/DELETE | the same resources by `:id` |
| PATCH | `/subscriptions/:id/cancel`, `/subscriptions/:id/renew` |
| PATCH | `/invoices/:id/pay`, `/payments/:id/refund` |
| GET | `/metrics/revenue` |

List endpoints accept `page`, `limit`, `search`, `sortBy`, `sortOrder` plus
resource-specific filters, and return `{ data, meta }`.

No route anywhere checks subscription status, so campus operations work
regardless of billing state.

---

## Billing

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

Nothing enforces plan limits: `maxUsers`, `maxRobots` and `maxCourses` are stored
but read only for display, and an `EXPIRED` university works exactly like a
paying one. A `UNIVERSITY_SUPER_ADMIN` cannot pay through the app — no payment
gateway is integrated.

---

## Getting started

### Requirements

- Node.js 20+
- A PostgreSQL database (developed against Supabase)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env       # fill in DATABASE_URL, DIRECT_URL and JWT_SECRET
npm run db:deploy          # apply migrations
npm run db:seed            # load demo data (WIPES application tables)
npm run dev                # http://localhost:5000
```

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`npm run dev` also starts the notification worker in the same process. Disable it
with `NOTIFICATION_WORKER_ENABLED=false` on any instance that must not send.

### 2. Web console

```bash
cd apps/web
npm install
npm run dev                # http://localhost:3000
```

Vite proxies `/api` to `http://localhost:5000`, so no frontend env vars are
needed in development.

### 3. Sign in

```
Email     owner@wall-e.io
Password  Owner@12345
```

Seeded university accounts all use `Demo@12345`. Override the owner credentials
with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` before seeding.

> The console admits `SYSTEM_OWNER` only. A university account that signs in gets
> an access-denied screen — there is no staff or student UI yet.

---

## Migrations

Five migrations in `backend/prisma/migrations/`, applied in order:

| Migration | Adds |
|-----------|------|
| `20260802073548_init` | Initial schema |
| `20260806120000_complete_schema_and_indexes` | Billing models, indexes |
| `20260807090000_student_academic_profile` | `StudentProfile` academic fields (Feature 1) |
| `20260808012004_lecture_schedule` | `LectureSchedule` + `DayOfWeek` (Feature 2) |
| `20260809010248_lecture_notifications` | `Notification`, `DeviceToken` and their enums (Feature 3) |

Feature 4 added **no migration** — it reuses existing models.

```bash
npm run db:migrate         # create + apply a migration (development)
npm run db:deploy          # apply pending migrations (CI / production)
npm run db:generate        # regenerate the Prisma client
npm run db:reset           # drop, re-apply everything, re-seed
npx prisma validate        # validate schema.prisma
npx prisma migrate status  # what is applied where
```

Create a migration without applying it — worth doing on a shared database, so the
SQL can be reviewed before it runs:

```bash
npx prisma migrate dev --create-only --name your_change
# review prisma/migrations/<timestamp>_your_change/migration.sql
npm run db:deploy
```

---

## Seed data

```bash
npm run db:seed
```

> **The seed wipes and rebuilds every application table** so the demo data is
> reproducible. Set `SEED_KEEP_EXISTING=true` to skip the wipe.

It creates:

- 4 subscription plans (Free, Basic, Pro, Enterprise) and the platform owner
- 8 universities spanning every subscription state, ~160 users, and 8 months of
  invoices and payments so the revenue charts have real history
- A fixed **timetable demo cohort** in two universities (NCTU and CU) so
  cross-tenant isolation can be demonstrated: identical faculty, department,
  level, semester and section, five courses (`MEC201`–`MEC205`), two instructors,
  a seven-lecture week, and three students — section A, section B, and one a
  level up so filtering can be seen to exclude as well as include
- One **development lecture** in room `DEV-LAB`, placed ~90 minutes after
  whenever the seed runs (computed from the clock, not a fixed date), with its
  own instructor `dev.reminder@<domain>.edu.eg`, so lecture reminders can be
  watched being generated

Randomised data comes from a seeded PRNG, so repeated seeds produce the same
dataset. The billing half is still written while `BILLING_ENABLED=false` — it is
simply not reachable until the flag is turned back on.

The seed creates **no sessions and no attendance records**.

---

## Tests

```bash
cd backend
npm test              # 46 tests, 5 files
npm run test:watch
npm run typecheck     # src/
npm run typecheck:tests   # src/ + tests/, via tsconfig.test.json
```

| File | Covers |
|------|--------|
| `tests/occurrence.util.test.ts` | Weekly slot → instant, Cairo summer/winter offsets, DST crossing, clock formatting |
| `tests/lecture-notification.service.test.ts` | 24h/30m/10m reminders, recipient rules, cross-tenant exclusion, duplicate prevention, deactivated lecture and instructor, message contents, delivery, overdue cancellation, dev simulation |
| `tests/notification.service.test.ts` | Inbox scoping, mark-read, mark-all-read, another user's notification, another organization's |
| `tests/schedule.regression.test.ts` | Feature 2 still works after Feature 3 touched the schedule service |
| `tests/student-export.service.test.ts` | Export authorization matrix, real `.xlsx` (ZIP magic + read back through ExcelJS), no national ID, roster membership, cell values, filename |

The suite is **database-free**. Repository doubles in `tests/helpers/` subclass
the real repositories, so a method a double forgets to override reaches Postgres
and fails loudly rather than silently returning nothing. There are no HTTP-level
or integration tests.

---

## Environment variables

**backend/.env** — validated by Zod at boot; the server exits on anything invalid.

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `JWT_SECRET` | — | **Required**, min 32 chars |
| `JWT_EXPIRES_IN` | `7d` | |
| `DATABASE_URL` | — | **Required**. Pooled connection |
| `DIRECT_URL` | — | Unpooled, used for migrations |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated |
| `BILLING_ENABLED` | `false` | See [Billing](#billing) |
| `NOTIFICATION_WORKER_ENABLED` | `true` | Runs generation + delivery in this process |
| `NOTIFICATION_TIMEZONE` | `Africa/Cairo` | IANA zone; the campus clock a lecture's `"12:00"` is read in. Also the date stamped on export filenames |
| `NOTIFICATION_HORIZON_MINUTES` | `2880` | How far ahead reminders are generated. Raised automatically if set below the longest lead time |
| `NOTIFICATION_POLL_INTERVAL_MS` | `60000` | Delivery poll |
| `NOTIFICATION_GENERATION_INTERVAL_MS` | `900000` | Generation pass |
| `PUSH_PROVIDER` | `log` | `log` \| `none`. No real provider is implemented |
| `NOTIFICATION_DEV_TOOLS` | `true` | Exposes `/api/notifications/dev/*`. **Ignored when `NODE_ENV=production`** |

**apps/web/.env**

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_API_URL` | `/api` | Unset in dev; Vite proxies instead |
| `VITE_BILLING_ENABLED` | `false` | Must match `BILLING_ENABLED` |

**Seed-only** — `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_KEEP_EXISTING`.

---

## Testing notification simulation

Waiting 24 hours to see a 24-hour reminder is not a test. Three development-only
endpoints make reminders happen now.

They are gated twice: the whole block is **unmounted** unless
`env.devToolsEnabled` — which is forced `false` when `NODE_ENV=production`
whatever `NOTIFICATION_DEV_TOOLS` says, so in production these paths 404 like any
unknown route — and where mounted they require `UNIVERSITY_SUPER_ADMIN` or
`SYSTEM_OWNER` and are confined to the caller's own organization.

```bash
# 1. Sign in as a university super admin (seeded; password Demo@12345)
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<super-admin-email>","password":"Demo@12345"}'

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

### Downloading an export

```bash
curl -s -D - -o roster.xlsx \
  "http://localhost:5000/api/courses/<courseId>/students/export" \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

The filename is in the `Content-Disposition` header and the row count in
`X-Student-Count`.

---

## Scripts

**backend**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch mode (`tsx watch`), starts the API and the notification worker |
| `npm run build` / `start` | Compile to `dist/` and run |
| `npm run typecheck` | Types, `src/` only |
| `npm run typecheck:tests` | Types, `src/` + `tests/` |
| `npm test` / `test:watch` | Vitest |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create + apply a migration |
| `npm run db:deploy` | Apply migrations (CI / production) |
| `npm run db:seed` | Rebuild demo data |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run db:studio` | Prisma Studio |

**apps/web**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | oxlint |

---

## Current limitations

**Interface**
- Features 1–4 have **no UI**. The console admits `SYSTEM_OWNER` only; staff and
  students have no screen at all.
- No student mobile app. `apps/mobile/`, `apps/tablet/` and `hardware/` are empty
  directories.

**Notifications**
- **Push is not actually delivered.** The provider logs and marks the row `SENT`;
  no FCM or APNs integration exists, and `DeviceToken` rows are stored but never
  sent to.
- One time zone platform-wide, not per organization.
- Semester matching happens in application code because profiles store free text;
  a student whose semester text cannot be read receives no reminders — the same
  behaviour their timetable already has.
- Reminders overdue by more than an hour are cancelled rather than sent, so a
  long outage drops that window.
- The worker runs in every instance that has it enabled. Claiming makes that
  safe, but each replica polls the table.
- Editing a lecture discards its unsent reminders and waits for the next
  generation pass (≤15 min), so an edit minutes before a lecture can lose that
  occurrence's 10-minute reminder.

**Export**
- Attendance percentages are zero on seeded data because the seed creates no
  sessions.
- The roster is computed live per request, one cohort query per lecture schedule.

**Data model**
- No enrollment model. Cohort membership stands in for it everywhere.
- No `CourseInstructor` model; a `LectureSchedule` row is the teaching
  assignment.
- `AdminProfile.faceEnabled` exists as a boolean nothing reads.

**Billing**
- No enforcement of plan limits, no subscription gate on any campus route, no
  payment gateway.

**Engineering**
- Tests are unit-level with in-memory repository doubles. No HTTP/integration
  tests, and database constraints are simulated rather than exercised.
- No CI (`.github/` does not exist), no Dockerfile, no OpenAPI spec.
- Platform settings (tax rate, currency, notification preferences) in the console
  are display-only.

---

## Roadmap

Ordered by what blocks a real campus pilot.

1. **University-facing console.** Role-based routing, course and session
   management, the live QR display (polling `GET /sessions/:id/qr` on ~25s, since
   tokens expire at 30s), and a live attendance roster. Without this there is no
   screen for a staff member to open a session.
2. **Student experience.** Sign in, scan, view timetable, view notifications,
   view attendance history — every API already exists. A mobile web route inside
   the existing React app would reach a pilot sooner than a native app.
3. **Push delivery.** Implement `PushNotificationProvider` against FCM and wire
   the Flutter/mobile client to `POST /notifications/device-tokens`.
4. **Reports.** PDF/attendance reporting beyond the Feature 4 roster export.
5. **Specified in `docs/SRS.md`, not started.** Campus map, classroom search and
   navigation; face recognition for admins; robot touch UI (`apps/tablet/`);
   ESP32 firmware (`hardware/`).
6. **Production readiness.** Integration tests, CI, containerisation, an OpenAPI
   spec.
7. **Billing.** Deferred until after the pilot: enforcement guards, a realistic
   zero-price plan for non-paying universities, and self-serve payment if
   universities should ever pay in-app.
