# Leornian web app

React + Vite console for staff and administrators only.

Supported web roles:

- `SYSTEM_OWNER`
- `UNIVERSITY_ADMIN`
- `DEPARTMENT_ADMIN`
- `INSTRUCTOR`

Student registration and student sign-in belong exclusively to the mobile app.
The web client declares `X-Client-Platform: web`, and the backend refuses a
student profile even if a student obtains or reuses an identity token.

## Main areas

- staff authentication and account management
- owner console for organizations and users
- university administration for timetable, directory, sessions, and exports
- instructor teaching, sessions, materials, assignments, and notifications
- student approval and academic record administration

## Commands

```powershell
cd apps/web
npm install
npm run dev
npm test -- --run
npx tsc -b
```

For overall product status, see [../../docs/PROJECT_STATUS.md](../../docs/PROJECT_STATUS.md).
