# Push Notifications (Firebase Cloud Messaging)

Real Android push for Leornian, layered over the existing in-app notification
outbox. **The database notification is the source of truth**; FCM is an extra
delivery channel. If Firebase is not configured, or a student denies permission,
the in-app inbox and unread badge keep working unchanged.

This PR implements everything that does not depend on secrets. Two artifacts are
provisioned outside the repo and are **required before real devices receive
push** — see [Manual setup](#manual-setup). Until they are in place, do not claim
real-device delivery was verified.

## How it works

### Backend
- `PUSH_PROVIDER=firebase` selects `FirebaseAdminPushProvider`
  (`backend/src/services/push/firebase.provider.ts`), which sends through
  firebase-admin. `log`/`none` remain for development.
- The provider reads the Admin credential from the `FIREBASE_SERVICE_ACCOUNT`
  environment variable (raw JSON or base64). It is **never** committed or logged.
- The delivery worker (`notification.dispatcher.ts`) claims PENDING rows, sends
  via the provider, marks them SENT, and **deactivates tokens** the provider
  reports as unregistered/invalid.
- Notifications are generated — deduplicated by a stable `eventKey` — for:
  account approved/rejected, course material published, and schedule
  created / meaningfully updated / cancelled. Approval/rejection are written
  PENDING (previously SENT, which blocked dispatch) so they are actually pushed.
- Targeting is server-side only: material/schedule notifications reach **active,
  approved** students of the **same organization** whose stored cohort
  (faculty, department, level, semester, optional section) matches. Nothing
  crosses a tenant boundary.

### Mobile (Flutter)
- `firebase_core` + `firebase_messaging` deliver push; `flutter_local_notifications`
  draws foreground messages on a high-priority Android channel
  (`leornian_high_priority`, matching the channel id the backend sets).
- After login a **branded explanation** is shown, then permission is requested
  **once** (POST_NOTIFICATIONS on Android 13+ via the Firebase/Android flow). A
  denial is remembered — no repeat prompts — and a banner offers a one-tap route
  to the OS notification settings.
- The FCM token is registered with `POST /api/notifications/device-tokens` after
  login, re-registered on refresh, and deactivated
  (`PATCH /api/notifications/device-tokens/deactivate`) on logout.
- Foreground, background and terminated messages are handled; a tap deep-links
  to the right page (approval → home, material → Course Material, schedule →
  Timetable, assignment/lecture → their pages).
- The Pending Approval screen polls account state and refreshes on resume, and
  promotes itself into the full student shell once approved — no re-login.

Firebase is **optional at runtime**: `Firebase.initializeApp()` is guarded, and
the Android `google-services` Gradle plugin is applied **only if
`google-services.json` is present**, so a build without it still succeeds.

## Manual setup

### 1. Firebase project & Android app
1. In the [Firebase Console](https://console.firebase.google.com/), create (or
   open) the Leornian project.
2. Add an **Android app** with the package name **`io.leornian.campus`**
   (the app's `applicationId`).
3. Download **`google-services.json`** and place it at exactly:

   ```
   apps/mobile/android/app/google-services.json
   ```

   This file is git-ignored and must never be committed. With it present, the
   Gradle plugin activates automatically. (An iOS build additionally needs
   `GoogleService-Info.plist`; a `firebase_options.dart` from `flutterfire
   configure` is an alternative to the native files if you prefer explicit
   options — not required for the Android google-services.json flow.)
4. Create a **tester group** and distribute the signed APK via Firebase App
   Distribution (build/signing steps: build a signed release APK with the
   permanent upload key, bump versionName + versionCode each release).

### 2. Backend server credential (Render)
1. In the Firebase Console: **Project settings → Service accounts → Generate new
   private key**. This downloads a service-account JSON (contains a private key —
   treat as a secret).
2. In the Render **API service** environment, set:
   - `PUSH_PROVIDER=firebase`
   - `FIREBASE_SERVICE_ACCOUNT` = the full service-account JSON (or its base64).
     Multi-line JSON is accepted; base64 avoids newline issues in the Render UI.
3. Redeploy the API. The provider initializes lazily on first send; a missing or
   malformed credential fails the boot check (`PUSH_PROVIDER=firebase` requires
   `FIREBASE_SERVICE_ACCOUNT`) rather than silently degrading.

### Never commit
`google-services.json`, `GoogleService-Info.plist`, the Admin service-account
JSON / private key, `apps/mobile/mobile.env.json`, or any keystore/password.
These are git-ignored; provide them through the device build and the Render
secret store only.

## Verification status
- Backend: unit-tested with a fake push provider (targeting, tenant isolation,
  dedup, retries, invalid-token deactivation, approval dispatch). Full suite,
  typecheck, build and the CI audit pass.
- Mobile: push orchestration, permission (accepted/denied/once), token
  register/refresh/logout, foreground handling, tap routing and pending-approval
  refresh are unit/widget-tested with fakes — **no test touches Firebase or the
  network**.
- **Not yet verified:** real end-to-end delivery to a physical device. That
  requires the `google-services.json` and the Render `FIREBASE_SERVICE_ACCOUNT`
  above to be installed.
