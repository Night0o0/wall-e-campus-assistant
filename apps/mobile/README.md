# Leornian mobile app

Flutter client for four campus account types:

- `UNIVERSITY_SUPER_ADMIN`
- `ADMIN`
- `STUDENT`
- Robot devices (authenticated as a separate device principal)

`SYSTEM_OWNER` is intentionally web-only. The backend enforces that policy on
`POST /api/auth/mobile-login`; it is not just a Flutter navigation rule.

## Run locally

Start the API first:

```powershell
cd backend
npm run dev
```

For the Android emulator, the default API URL is already
`http://10.0.2.2:5000/api`:

```powershell
cd apps/mobile
flutter pub get
flutter run
```

For a physical Android phone, use the computer's LAN address and keep the phone
on the same network:

```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:5000/api
```

Replace `192.168.1.10` with the computer's actual address. The development
Android manifest permits local HTTP. A production build should use HTTPS and
remove `android:usesCleartextTraffic="true"`.

## Demo accounts

Run the non-destructive credential setup against a development database:

```powershell
cd backend
npm run db:seed:mobile
```

It refreshes the four known NCTU credentials and non-destructively prepares a
mobile showcase: timetable and attendance history, course materials, inbox
notices, pending students, staff data, and a fresh B-204 robot QR session. Run
it again whenever the live robot session has expired; it does not wipe data.

| App account | Email | Password |
|---|---|---|
| Super admin | `ahmed.hassan@nctu.edu.eg` | `Demo@12345` |
| Admin | `adel.mansour@nctu.edu.eg` | `Demo@12345` |
| Student | `mechatronics.a@student.nctu.edu.eg` | `Demo@12345` |
| Robot | `robot@nctu.edu.eg` | `Robot@12345-Demo-Only` |

The robot's email is an email-shaped device key. Its token is signed with the
device key and can access only the robot endpoints; it never becomes a human
user account.

## Connected flows

- Real role-aware login and backend error handling
- University overview, teaching schedule, courses and sessions
- User directory and student approval
- Notifications and account/profile data
- Student timetable, materials and attendance summary
- Camera QR scanning to record attendance
- Robot active-session discovery and rotating QR display
- Student password-reset request

Run checks with:

```powershell
flutter analyze
flutter test
```
