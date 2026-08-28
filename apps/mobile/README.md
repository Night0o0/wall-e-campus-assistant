# Leornian mobile app

Flutter client for four campus account types:

- `UNIVERSITY_ADMIN`
- `DEPARTMENT_ADMIN`
- `INSTRUCTOR`
- `STUDENT`

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
```

Use the Flutter/Dart version that resolves the committed `pubspec.lock`. Flutter
3.24.5 is too old for its current native-assets dependencies.
