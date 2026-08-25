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
