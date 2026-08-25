# Mobile Design Baseline

Reference for the design-preservation rule in `plan.txt`. Captured at the start
of the remediation work, from the tree at commit `ad98995`
(`feat(mobile): Flutter client for student, staff, and robot roles`).

Any change to a value in this document is a design regression unless it was
explicitly approved. New screens must be built from these tokens and widgets.

## Toolchain at baseline

| Item | Value |
| --- | --- |
| Flutter | 3.44.0 stable |
| Dart SDK constraint | `^3.5.4` (`pubspec.yaml`) |
| Platforms scaffolded | `android/`, `web/` — **no `ios/`** |
| `flutter analyze` | 0 errors, 0 warnings, 54 info |
| `flutter test` | 5/5 passing |

## Colour tokens

From `lib/core/app_theme.dart`, `AppColors`. Sampled from the supplied Figma
render — these are the source of truth, not the Material scheme derived from
them.

| Token | Hex | Role |
| --- | --- | --- |
| `navy` | `#080C18` | deepest background |
| `navySoft` | `#111827` | raised background |
| `panel` | `#0A0E1C` | panel background |
| `input` | `#1B2232` | field fill |
| `blue` | `#4F8EF7` | primary |
| `violet` | `#6366F1` | secondary |
| `cyan` | `#6BA7FF` | accent |
| `orange` | `#8B7CF6` | accent (named orange, renders violet) |
| `orangeSoft` | `#252C4B` | accent surface |
| `canvas` | `#080C18` | scaffold background |
| `surface` | `#111827` | card surface |
| `ink` | `#F0F4FF` | primary text |
| `muted` | `#8B95A8` | secondary text |
| `line` | `#222B42` | borders and dividers |
| `success` | `#3DD6A4` | present / approved |
| `danger` | `#FF6B8A` | absent / rejected / destructive |
| `warning` | `#F4B860` | late / pending |

### Gradients

- `primaryGradient` — left→right, `blue` → `violet`
- `backgroundGradient` — topLeft→bottomRight, `#0B1428` → `#080C18` → `#080C18`

## Theme

- `useMaterial3: true`, `brightness: Brightness.dark`
- `fontFamily: 'Outfit'`
- `scaffoldBackgroundColor` and `canvasColor`: `canvas`
- `ColorScheme.fromSeed(seedColor: blue, brightness: dark, primary: blue,
  secondary: violet, surface: surface, error: danger)`
- `appBarTheme`: elevation 0, `scrolledUnderElevation` 0, `centerTitle: false`,
  transparent surface tint
- `cardTheme`: elevation 0, `surface` fill, transparent surface tint, zero
  margin, 16px radius, 1px `line` border
- `filledButtonTheme`: `blue` on white text, min height 48, horizontal padding
  20 / vertical 13, weight 600

Note the class is named `AppTheme.light` but returns a **dark** theme. Left as
found; renaming it is a readability change, not a design one.

## Reusable widgets

`lib/presentation/shared_widgets.dart` — use these before writing new ones:

| Widget | Purpose |
| --- | --- |
| `PageCanvas` | page scaffold with the background gradient |
| `SectionCard` | titled content card |
| `MetricCard` | single statistic tile |
| `ResponsiveMetricGrid` | breakpoint-aware grid of `MetricCard` |
| `StatusPill` | small coloured status label |
| `AppListTile` | standard row |
| `EmptyAction` | empty-state icon + label |

`lib/presentation/brand_logo.dart` — `LeornianLogo`.

### Shell structure

- `app_shell.dart` — staff/robot shell: `AppShell`, `_RoleHeader`,
  `_RoleBottomNav`, `_RoleNavItem`
- `student_shell.dart` — student shell: `StudentShell`, `_StudentHeader`,
  `_StudentBottomNav`, `_NavItem`, plus page-level widgets `_AppCard`,
  `_DayPill`, `_LectureCard`, `_MetaChip`, `_CourseBadge`

New student screens reuse `_AppCard` and the student header/nav. New staff
screens reuse `SectionCard` and the role header/nav.

## Pre-existing analyzer findings (do not treat as new)

54 `info`-level items, all pre-existing:

- 48 × `withOpacity` deprecated → `withValues`
- 5 × `DropdownButtonFormField.value` deprecated → `initialValue`
- 1 × other

**These are deliberately not fixed during remediation.** `withOpacity` →
`withValues` changes alpha precision and would produce sub-pixel colour
differences across ~48 sites, which the design-preservation rule would flag as
regressions. Track separately.

## Fix applied to reach a compiling baseline

`lib/core/app_theme.dart:109` — `CardTheme(` → `CardThemeData(`.

Flutter 3.44 changed `ThemeData.cardTheme` to accept `CardThemeData`. The app
did not compile before this. `CardThemeData` carries identical fields, so the
rendered result is unchanged.

---

# Visual verification procedure

Two tiers, per `plan.txt` Phase 0.8 / 0.9 and Phase 6.

## Tier 1 — targeted goldens (automated)

`apps/mobile/test/visual_baseline_test.dart`, five screens:

| Golden | Screen |
| --- | --- |
| `baseline_login.png` | login |
| `baseline_student_shell.png` | student shell — timetable |
| `baseline_admin_shell.png` | admin shell — overview |
| `baseline_super_admin_shell.png` | super admin shell — dashboard |
| `baseline_robot_qr.png` | robot QR display |

Run: `flutter test`
Regenerate: `flutter test --update-goldens test/visual_baseline_test.dart`

Surface is fixed at 390×844 (iPhone 12/13/14), devicePixelRatio 1.0.

These render with the **test font**, not bundled `Outfit` — widget tests do not
load app fonts. They compare against the previous run of this harness, not
against a design file. They catch theme-level regressions: a changed colour
token, a changed radius, a broken shell.

**Do not expand this set** during remediation unless a screen proves too risky
to verify by manual comparison. A golden suite that fails for font and engine
reasons gets regenerated on autopilot, which is the same as having none.

The five `figma_theme_*.png` files in the same directory are unrelated
reference renders from the original design pass. Nothing asserts against them.

## Tier 2 — manual screenshot comparison (everything else)

For every screen outside the golden subset, per feature touched:

1. Screenshot before the change, on the emulator, at 390×844.
2. Make the change.
3. Screenshot again at the same size.
4. Compare side by side against the token table above.
5. Check the Phase 6 list: text scaling, overflow, keyboard, dialogs on small
   screens, gradients, spacing, navigation, animations.
6. Record the pair in the PR.

**Blocked at time of writing.** Capturing the Phase 0.6 screenshot baseline
needs the emulator plus a backend with seeded data, and the only configured
database is a live hosted Supabase instance which is being treated as
production. See "Outstanding" below.

---

# Defects found while establishing this baseline

None of these are in `review.txt`. That review explicitly did not compile or run
the Flutter app, so no runtime or layout defect could have been in it.

## M-1 — `_LectureCard` overflows on 390pt phones

`apps/mobile/lib/presentation/student_shell.dart:644`

A `Row` overflows by 13px at 390pt width — iPhone 12, 13, 14 and 14 Pro. The
student timetable is the most-used student screen, so this is visible to a
large share of users.

Captured deliberately in `baseline_student_shell.png`, striping and all. The
golden test carries a **tripwire** that asserts the overflow is still present,
so fixing it fails the test and forces the golden to be regenerated in the same
commit as the fix.

To fix: give the offending child an `Expanded`/`Flexible`, delete the tripwire
block, drop the `FlutterError.onError` suppression, and regenerate.

Severity: medium. Cosmetic, but on the highest-traffic student screen.

## M-2 — Android 6.0 support dropped by the toolchain

The Flutter 3.44 migrator rewrote `minSdk = 23` to
`minSdkVersion = flutter.minSdkVersion`; the effective merged-manifest value is
**24**. Restoring the pin by hand does not hold — the migrator reverts it on
every `flutter build`. `mobile_scanner` needs only 21, so the floor comes from
the Flutter toolchain.

Decision needed: accept 24 and state the supported floor in the release notes,
or pin an older Flutter SDK if Android 6.0 devices are actually in the fleet.

## M-3 — `mobile_scanner` applies the Kotlin Gradle Plugin

Flutter warns that future versions will fail to build for this reason. A
dependency-upgrade task, not urgent, but it has a deadline set by someone else.

## B-1 — seed guard could not protect the live database *(fixed)*

`assertSeedAllowed()` refused only on `NODE_ENV=production`. This working copy
has `NODE_ENV=development` and `DATABASE_URL` pointing at hosted Supabase, so
`npm run db:seed` would have called `wipe()` against a live database.

Fixed: the guard now also requires `DATABASE_URL` to resolve to a local host
unless `SEED_ALLOW_REMOTE_HOST` names that exact host. Verified against the real
`.env` — allowed before, refused after.

---

# Outstanding

| Step | Blocker |
| --- | --- |
| 0.6 screenshot baseline | needs emulator + seeded DB |
| 1.4 emulator smoke test | needs emulator + seeded DB |
| 1.6 migration ledger | needs read-only access to the live DB, pending approval |
| 1.7 deployment config | needs the real deployment environment |

No Docker and no local Postgres are installed on this machine, so a throwaway
local database needs a system-level install first.
