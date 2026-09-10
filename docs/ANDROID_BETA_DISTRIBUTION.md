# Android Beta Distribution

How the Leornian student Android app is built, signed, and distributed to
testers through **Firebase App Distribution**, and how the public web landing
page links to it.

The APK is never hosted in this repository or on Render. The website only holds
a **tester-invite link** (a Firebase App Distribution URL), configured through an
environment variable — see [The website invite link](#the-website-invite-link).

## Never commit these

The release process depends on secrets that must stay out of version control.
The repository already ignores them (`apps/mobile/android/.gitignore`,
`apps/mobile/.gitignore`); do not force-add any of them:

- the upload/signing **keystore** (`*.jks`, `*.keystore`)
- `apps/mobile/android/key.properties` (keystore path, alias, and passwords)
- any keystore or key **password**
- the Firebase **service-account JSON** used for CI uploads
- `apps/mobile/mobile.env.json`
- `google-services.json` / `GoogleService-Info.plist` or any Firebase credential
- the signed **APK** or **AAB** artifact itself

If any of these must be shared, use a secret manager or the CI secret store —
never a commit, and never the static-site build.

## The permanent signing key

Every beta build is signed with the **same permanent release key**. Firebase App
Distribution (and Android itself, for in-place updates) identifies the app by its
signing certificate, so re-signing with a different key would produce an app
testers cannot update over the top of the one they have.

- The keystore and its `key.properties` live only on the release machine / CI
  secret store, never in the repo.
- `apps/mobile/android/app/build.gradle` reads the signing config from
  `key.properties`; a build without it produces an unsigned/debug build that must
  not be distributed.
- Back the keystore up securely and independently. Losing it means testers must
  uninstall and reinstall from a freshly keyed build.

## Per-release version bump

Bump **both** the version name and the version code for every release, in
`apps/mobile/pubspec.yaml`:

```yaml
version: 1.0.0+1
#        ^^^^^ ^  versionName (+) versionCode
```

- **versionName** (e.g. `1.0.0`) is the human-facing label testers see.
- **versionCode** (the integer after `+`) must **strictly increase** on every
  build. Android refuses to install a build whose version code is not higher
  than the installed one, and App Distribution uses it to order releases.

Flutter maps these to Android's `versionName` / `versionCode` automatically
(`flutter.versionName` / `flutter.versionCode` in `build.gradle`).

## Build, sign, and distribute

1. Bump the version in `pubspec.yaml` (above) and commit that change (the
   version bump is not a secret).
2. Build the signed release APK with the permanent key:

   ```bash
   cd apps/mobile
   flutter build apk --release
   ```

   The output is `build/app/outputs/flutter-apk/app-release.apk`. Confirm it is
   signed with the release key (`apksigner verify --print-certs app-release.apk`)
   before uploading.
3. Upload the signed APK to **Firebase App Distribution** — via the Firebase
   console, the `firebase` CLI (`firebase appdistribution:distribute`), or the
   Gradle plugin. Authenticate with the service-account JSON (kept out of the
   repo).
4. Distribute the release to the **tester group** (e.g. `beta-testers`). Add
   short release notes.
5. **Existing testers** in that group automatically receive the
   new-release email from Firebase and can update in place — no new invite link
   is needed for them.

## The website invite link

The public landing page (`/login`) shows a **Download Android beta** button that
opens the tester-invite link. It is wired through the web app's Vite environment
convention:

```
VITE_ANDROID_BETA_DOWNLOAD_URL=https://appdistribution.firebase.dev/i/<invite-id>
```

- The value is a **Firebase App Distribution invite link**, not a raw APK URL,
  and **not** release-specific: it continues to onboard new testers to whatever
  the **latest distributed release** is.
- It is **not a secret**. It is still validated in the browser — https only, no
  embedded credentials — and the button hides itself when the variable is unset
  or invalid (`apps/web/src/lib/androidBeta.ts`).
- The link opens with `target="_blank"` and `rel="noopener noreferrer"`.

What a first-time tester sees after clicking: they may be asked to sign in with a
Google account, accept the tester invitation, then download and install the app —
and Android may prompt for permission to install the test application.

### Updating the invite link on Render

The web app is a Render **static site**, so `VITE_*` variables are baked in at
build time.

- Set/update `VITE_ANDROID_BETA_DOWNLOAD_URL` in the Render static site's
  **Environment** settings, then trigger a rebuild.
- Do this **only when the invite link itself changes** (for example, a new
  tester group or a regenerated invite). A routine new release reuses the same
  invite link, so **no website change or rebuild is required** for an ordinary
  release — you only rebuild the mobile app and distribute it.

## Release checklist

- [ ] Version name and version code bumped in `pubspec.yaml`
- [ ] Signed release APK built with the permanent key and verified
- [ ] No secret staged (`git status` clean of keystore / `key.properties` /
      service-account JSON / `mobile.env.json` / `google-services.json` / APK)
- [ ] APK uploaded to Firebase App Distribution with release notes
- [ ] Distributed to the tester group; existing testers emailed automatically
- [ ] Website invite link updated on Render **only if** the invite link changed
