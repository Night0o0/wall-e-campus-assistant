import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/main.dart';

import 'helpers/fake_campus_api.dart';
import 'helpers/load_fonts.dart';

/// Deterministic widget-level verification of every release-facing screen.
///
/// This walks every destination in the student shell and records what happens
/// when it renders at a real phone size. It complements the connected Android
/// emulator smoke test while keeping layout and navigation regressions fast and
/// repeatable in the normal test suite.
///
/// The fake gateway is intentionally limited to deterministic test data. Android
/// platform behavior such as camera permission and `mobile_scanner` is covered
/// separately on an emulator or physical device.

const _surface = Size(390, 844);

/// What one screen did when it rendered.
class ScreenReport {
  ScreenReport(this.role, this.label);

  final String role;
  final String label;
  final List<String> overflows = [];
  final List<String> exceptions = [];
  bool reached = false;

  String get verdict {
    if (!reached) return 'UNREACHABLE';
    if (exceptions.isNotEmpty) return 'EXCEPTION';
    if (overflows.isNotEmpty) return 'OVERFLOW';
    return 'OK';
  }
}

final reports = <ScreenReport>[];

/// The screen currently being rendered, so a global error handler can attribute
/// what it catches.
///
/// The first version of this file installed the handler INSIDE each visit, and
/// every screen came back OK - including the student Timetable, which is known
/// to overflow at this exact size. Errors raised while the shell first rendered
/// landed before any handler existed. A verification harness that under-reports
/// is worse than none, so the handler is global and the bucket is swapped.
ScreenReport? current;

/// Errors raised while no screen is current - during sign-in, for instance,
/// which is exactly when the student shell first lays out. Dropping these is
/// what made the first two versions of this harness report every screen OK
/// while the golden suite proved the student Timetable overflows.
final orphaned = <String>[];

void installErrorSink() {
  FlutterError.onError = (details) {
    final text = details.exceptionAsString().split(chr10).first;
    final isOverflow = details.exceptionAsString().contains(chrOverflow);
    final sink = current;
    if (sink == null) {
      orphaned.add(text);
    } else if (isOverflow) {
      sink.overflows.add(text);
    } else {
      sink.exceptions.add(text);
    }
  };
}

/// A newline, without writing one into a sed-edited source file.
final chr10 = String.fromCharCode(10);
const chrOverflow = 'overflowed';

Future<void> _pumpApp(WidgetTester tester) async {
  tester.view.physicalSize = _surface;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  installErrorSink();
  addTearDown(() => FlutterError.onError = FlutterError.presentError);
  await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
  await tester.pumpAndSettle();
}

/// Renders one destination and records every error it produced.
Future<void> _visit(
  WidgetTester tester,
  String role,
  String label, {
  Finder? tapTarget,
  bool alreadyOpen = false,
}) async {
  final report = ScreenReport(role, label);
  current = report;

  // Adopt anything raised before any screen was current - the landing screen
  // laid out during sign-in, so those errors are its.
  for (final text in orphaned) {
    if (text.contains(chrOverflow)) {
      report.overflows.add(text);
    } else {
      report.exceptions.add(text);
    }
  }
  orphaned.clear();

  try {
    if (alreadyOpen) {
      // The landing tab of a shell is already rendered by the time we get
      // here. Pump it again so anything it raises is attributed to it rather
      // than lost before the first tap.
      await tester.pump();
      report.reached = true;
      reports.add(report);
      return;
    }
    final target = tapTarget ?? find.text(label);
    if (target.evaluate().isNotEmpty) {
      // Nav bars scroll horizontally past four items, so a destination can be
      // off-screen and untappable until scrolled to.
      await tester.ensureVisible(target.first);
      await tester.pumpAndSettle();
      await tester.tap(target.first, warnIfMissed: false);
      await tester.pumpAndSettle();
      report.reached = true;
    }
  } catch (error) {
    report.exceptions.add(error.toString().split(chr10).first);
  }

  reports.add(report);
}

void main() {
  // Measure with the app's real font, not the fallback: an overflow in a font
  // the app does not ship is not evidence about the app.
  setUpAll(loadAppFonts);

  tearDownAll(() {
    // ignore: avoid_print
    print('\n=== MOBILE RUNTIME VERIFICATION ===');
    for (final role in ['STUDENT']) {
      final rows = reports.where((r) => r.role == role);
      if (rows.isEmpty) continue;
      // ignore: avoid_print
      print('\n$role');
      for (final row in rows) {
        // ignore: avoid_print
        print('  ${row.verdict.padRight(12)} ${row.label}');
        for (final issue in [...row.overflows, ...row.exceptions]) {
          // ignore: avoid_print
          print('        -> $issue');
        }
      }
    }
    final bad = reports.where((r) => r.verdict != 'OK').length;
    // ignore: avoid_print
    print('\n${reports.length} screens walked, $bad with findings\n');
  });

  testWidgets('STUDENT: every tab', (tester) async {
    await _pumpApp(tester);
    await signIn(tester, 'student@campus.edu');

    // Timetable is the landing tab, so record it without a tap.
    await _visit(tester, 'STUDENT', 'Timetable', alreadyOpen: true);
    for (final tab in ['Attendance', 'Material', 'Work', 'Scan QR']) {
      await _visit(tester, 'STUDENT', tab);
    }
    await _visit(
      tester,
      'STUDENT',
      'Notifications',
      tapTarget: find.byKey(const ValueKey('student-notifications')),
    );
    await _visit(
      tester,
      'STUDENT',
      'Profile',
      tapTarget: find.byKey(const ValueKey('student-profile')),
    );
  });
}
