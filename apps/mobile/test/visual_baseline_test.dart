import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/main.dart';

import 'helpers/fake_campus_api.dart';

/// The targeted golden subset from plan.txt Phase 0.8.
///
/// Deliberately FIVE screens, not thirty: login, plus one representative screen
/// from each of the four role shells. Every other screen is covered by the
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
/// These are NOT pixel-perfect renders of the shipped app. Widget tests do not
/// load the bundled 'Outfit' font, so text here uses the test font. That is
/// fine for the purpose: the comparison is against the previous run of this
/// same harness, not against a design file.
///
/// Regenerate deliberately, never reflexively:
///
///     flutter test --update-goldens test/visual_baseline_test.dart
///
/// A diff in these files means the theme or a shell changed. If that was
/// intended, update them in the same commit as the change and say so in the
/// message. If it was not, it is the regression this suite exists to find.
///
/// The five figma_theme_*.png files already in test/goldens/ are unrelated
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
  testWidgets('golden: login', (tester) async {
    await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
    await expectLater(
      find.byType(WallEApp),
      matchesGoldenFile('goldens/baseline_login.png'),
    );
  });

  // KNOWN DEFECT, captured deliberately.
  //
  // _LectureCard overflows its Row by 13px at this width
  // (student_shell.dart:644). 390pt is iPhone 12/13/14/14 Pro, so this is
  // visible to a large share of real users. It was not in review.txt because
  // that review never compiled or ran the app.
  //
  // The golden records the app as it actually renders, striping and all. When
  // the overflow is fixed the golden changes, and that change is the proof.
  testWidgets('golden: student shell', (tester) async {
    final overflows = <String>[];
    final priorOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('overflowed')) {
        overflows.add(details.exceptionAsString());
        return;
      }
      priorOnError?.call(details);
    };
    addTearDown(() => FlutterError.onError = priorOnError);

    await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'student@campus.edu');
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(WallEApp),
      matchesGoldenFile('goldens/baseline_student_shell.png'),
    );

    // Tripwire. Asserts the DEFECT is still present, so that fixing the
    // overflow fails HERE and forces the golden to be regenerated in the same
    // commit as the fix. When you fix student_shell.dart:644: delete this
    // block, drop the FlutterError.onError suppression above, and rerun with
    // --update-goldens.
    expect(
      overflows,
      isNotEmpty,
      reason: 'student_shell.dart:644 _LectureCard no longer overflows at '
          '390pt - fix confirmed. Remove this tripwire and regenerate the '
          'golden.',
    );
  });

  testWidgets('golden: admin shell', (tester) async {
    await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'admin@campus.edu');
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(WallEApp),
      matchesGoldenFile('goldens/baseline_admin_shell.png'),
    );
  });

  testWidgets('golden: super admin shell', (tester) async {
    await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'super@campus.edu');
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(WallEApp),
      matchesGoldenFile('goldens/baseline_super_admin_shell.png'),
    );
  });

  testWidgets('golden: robot QR display', (tester) async {
    await _pumpAt(tester, WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'robot@campus.edu');
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(WallEApp),
      matchesGoldenFile('goldens/baseline_robot_qr.png'),
    );
  });
}
