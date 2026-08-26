# Leornian web app

This is the React + Vite web client for the current Leornian Campus Assistant product.

## Current scope

Implemented role experiences:

- `SYSTEM_OWNER`
- `UNIVERSITY_ADMIN`
- `INSTRUCTOR`
- `STUDENT`

The active web product does not include:

- robot/device console
- billing/payment pages

## Main areas

- authentication and registration
- account/profile pages
- owner console for organizations and users
- university admin console for timetable, directory, sessions, exports
- instructor console for teaching, sessions, materials, notifications
- student-facing web routes currently present in this app

## Commands

```powershell
cd apps/web
npm install
npm run dev
npm test -- --run
npx tsc -b
```

## Backend dependency

The web app expects the backend API to be running and aligned with the latest Prisma schema and migrations.

## Source of truth

For overall product status and remaining work, see:

- [../../docs/PROJECT_STATUS.md](../../docs/PROJECT_STATUS.md)
