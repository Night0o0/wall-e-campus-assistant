import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/main.dart';

import 'helpers/fake_campus_api.dart';
import 'helpers/load_fonts.dart';

/// The targeted golden subset from plan.txt Phase 0.8.
///
/// Deliberately FIVE screens, not thirty: login, plus one representative screen
/// from each release-facing role shell. Every other screen is covered by the
/// manual screenshot comparison described in Phase 0.9.
///
/// Keeping this small is the point. Flutter goldens are sensitive to font
/// rasterisation and engine version, so a large golden suite tends to fail for
/// reasons unrelated to the change under review, and a suite that cries wolf
/// gets regenerated on autopilot - which is the same as having no suite. Five
/// screens is enough to catch a theme-level regression: a changed colour token,
/// a changed radius, a broken shell. That is the damage the design-preservation
/// rule is actually worried about.
///
/// These load the app's REAL Outfit font (see helpers/load_fonts.dart), which
/// matters more than it sounds. The fallback test font renders the same string
/// roughly twice as wide - '09:00 - 10:30' measures 182px in the fallback and
/// 88px in Outfit - and that difference invented a 13px overflow on the student
/// timetable that does not exist in the shipped app. Goldens taken in a font
/// the app does not ship are evidence about nothing.
///
/// Regenerate deliberately, never reflexively:
///
///     flutter test --update-goldens test/visual_baseline_test.dart
///
/// A diff in these files means the theme or a shell changed. If that was
/// intended, update them in the same commit as the change and say so in the
/// message. If it was not, it is the regression this suite exists to find.
///
/// The figma_theme_*.png files already in test/goldens/ are unrelated
/// reference renders from the original design pass. Nothing asserts against
/// them; they are kept as design references only.

/// One phone-sized surface for every golden, so a device-pixel-ratio change
/// cannot silently alter every image at once. 390x844 is iPhone 12/13/14.
const _surface = Size(390, 844);

Future<void> _pumpAt(WidgetTester tester, Widget app) async {
  tester.view.physicalSize = _surface;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadAppFonts);

  testWidgets('golden: login', (tester) async {
    await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
    await expectLater(
      find.byType(WallEApp),
      matchesGoldenFile('goldens/baseline_login.png'),
    );
  });

  // The timetable renders the live calendar week, so this golden is only
  // reproducible against a fixed clock. Without it the image drifts every week
  // and the suite fails for reasons unrelated to the change under review.
  // 2026-08-31 is the Monday the approved baseline was captured on.
  testWidgets('golden: student shell', (tester) async {
    await withClock(Clock.fixed(DateTime(2026, 8, 31, 9)), () async {
      await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
      await signIn(tester, 'student@campus.edu');
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(WallEApp),
        matchesGoldenFile('goldens/baseline_student_shell.png'),
      );
    });
  });
}
