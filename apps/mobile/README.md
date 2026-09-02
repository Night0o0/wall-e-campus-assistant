# Leornian mobile app

Flutter client for four campus account types:

- `UNIVERSITY_ADMIN`
- `DEPARTMENT_ADMIN`
- `INSTRUCTOR`
- `STUDENT`

`SYSTEM_OWNER` is intentionally web-only. The backend enforces that policy on
every request carrying the mobile client header; it is not just a Flutter
navigation rule.

## Run locally

Start the API first:

```powershell
cd backend
npm run dev
```

Copy `mobile.env.example.json` to the ignored `mobile.env.json`, then replace
the two Supabase placeholders with the development project's URL and
publishable key. Direct Supabase configuration is required because seeded
accounts do not have legacy backend password hashes.

For the Android emulator, keep the example API URL at
`http://10.0.2.2:5000/api`:

```powershell
cd apps/mobile
flutter pub get --enforce-lockfile
flutter run --dart-define-from-file=mobile.env.json
```

For a physical Android phone, use the computer's LAN address and keep the phone
on the same network:

```powershell
flutter run --dart-define-from-file=mobile.env.json
```

Before the physical-device command, change `API_BASE_URL` in `mobile.env.json`
to the computer's LAN address, such as `http://192.168.1.10:5000/api`, and keep
the phone on the same network. The development Android manifest permits local
HTTP. A production build should use HTTPS and remove
`android:usesCleartextTraffic="true"`.

## Development accounts

Run the non-destructive credential setup against a development database:

```powershell
cd backend
npm run db:seed
```

It prepares a development showcase with timetable and attendance history,
course materials, inbox notices, pending students, and staff data. Account
addresses are defined by the seed fixtures; the shared development password is
provided at runtime and must not be committed to documentation or source.

## Connected flows

- Real role-aware login and backend error handling
- University overview, teaching schedule, courses and sessions
- User directory and student approval
- Notifications and account/profile data
- Student timetable, materials and attendance summary
- Camera QR scanning to record attendance
- Student password-reset request
- Supabase password-reset deep link and new-password screen
- Signed-in password change with current-password reauthentication
- Cross-device registration completion on the next confirmed sign-in

Run checks with:

```powershell
flutter analyze
flutter test
flutter build apk --debug --dart-define-from-file=mobile.env.json
```

The deterministic suite walks all 24 release-facing student, instructor, and
university-admin destinations. The live Android integration harness is
`integration_test/live_mobile_smoke_test.dart`; pass seeded student/instructor
emails and their password only through the runtime defines
`MOBILE_E2E_STUDENT_EMAIL`, `MOBILE_E2E_INSTRUCTOR_EMAIL`, and
`MOBILE_E2E_PASSWORD`. Never commit those values.

Use Flutter 3.44 or newer with Dart 3.12 or newer, as recorded by the committed
`pubspec.lock`. Flutter 3.24.5 is too old for its native-assets dependencies.
