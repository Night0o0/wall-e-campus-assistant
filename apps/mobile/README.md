# Leornian mobile app

Flutter client for students only. Students can create an account, sign in,
complete their profile, wait for university approval, and use their academic
features here. All staff and administrator roles use the web console.

The mobile client declares `X-Client-Platform: mobile`, and the backend rejects
every non-student role. The Flutter application also validates that a returned
profile has the `STUDENT` role and signs out a refused Supabase session.

## Run locally

Start the API, copy `mobile.env.example.json` to the ignored `mobile.env.json`,
and supply the development Supabase URL and publishable key.

```powershell
cd backend
npm run dev
```

```powershell
cd apps/mobile
flutter pub get --enforce-lockfile
flutter run --dart-define-from-file=mobile.env.json
```

The Android emulator uses `http://10.0.2.2:5000/api`. A physical phone must use
the computer's LAN address and be on the same network.

## Student flows

- Student registration and Supabase confirmation
- Student sign-in and pending-approval state
- Timetable, materials, assignments, notifications, and attendance history
- Camera QR scanning to record attendance
- Student password reset and signed-in password change

Run checks with:

```powershell
flutter analyze
flutter test
flutter build apk --debug --dart-define-from-file=mobile.env.json
```

The live Android integration harness uses `MOBILE_E2E_STUDENT_EMAIL` and
`MOBILE_E2E_PASSWORD`. Never commit those values.

Use Flutter 3.44 or newer with Dart 3.12 or newer, as recorded by the committed
`pubspec.lock`.
