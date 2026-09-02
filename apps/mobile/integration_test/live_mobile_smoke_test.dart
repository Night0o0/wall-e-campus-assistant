import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:wall_e_mobile/core/app_theme.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/presentation/app_shell.dart';

const _studentEmail = String.fromEnvironment('MOBILE_E2E_STUDENT_EMAIL');
const _instructorEmail = String.fromEnvironment('MOBILE_E2E_INSTRUCTOR_EMAIL');
const _password = String.fromEnvironment('MOBILE_E2E_PASSWORD');

Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 250));
  }
  if (finder.evaluate().isEmpty) {
    final visibleText = tester
        .widgetList<Text>(find.byType(Text))
        .map((widget) => widget.data)
        .whereType<String>()
        .where((text) => text.isNotEmpty)
        .take(20)
        .join(' | ');
    fail('Timed out waiting for $finder. Visible text: $visibleText');
  }
}

Future<void> _openAuthenticatedShell(
  WidgetTester tester,
  CampusApi api,
  String email,
  Finder landingPage,
) async {
  final session = await api.login(email, _password);
  await tester.pumpWidget(MaterialApp(
    theme: AppTheme.light,
    home: AppShell(api: api, session: session),
  ));
  await _pumpUntil(tester, landingPage);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late CampusApi api;

  setUpAll(() async {
    expect(CampusApi.supabaseConfigured, isTrue,
        reason: 'Pass SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
    expect(_studentEmail, isNotEmpty, reason: 'Pass MOBILE_E2E_STUDENT_EMAIL.');
    expect(_instructorEmail, isNotEmpty,
        reason: 'Pass MOBILE_E2E_INSTRUCTOR_EMAIL.');
    expect(_password, isNotEmpty, reason: 'Pass MOBILE_E2E_PASSWORD.');

    await Supabase.initialize(
      url: CampusApi.supabaseUrl,
      publishableKey: CampusApi.supabasePublishableKey,
    );
    api = CampusApi();
    await api.logout();
  });

  tearDown(() async {
    await api.logout();
  });

  testWidgets('approved student reaches every connected mobile area',
      (tester) async {
    await _openAuthenticatedShell(
      tester,
      api,
      _studentEmail,
      find.text('My Timetable'),
    );

    for (final label in ['Attendance', 'Material', 'Work', 'Inbox']) {
      await tester.tap(find.text(label).last);
      await tester.pumpAndSettle();
      expect(find.text(label), findsWidgets);
    }

    await tester.tap(find.byKey(const ValueKey('student-profile')));
    await _pumpUntil(tester, find.text('My Profile'));
  });

  testWidgets('instructor reaches every connected teaching area',
      (tester) async {
    await _openAuthenticatedShell(
      tester,
      api,
      _instructorEmail,
      find.textContaining('Good morning'),
    );

    for (final label in [
      'My Teaching',
      'Sessions',
      'Courses',
      'Materials',
      'Pending Students',
      'Inbox',
      'Account',
    ]) {
      final target = find.text(label).last;
      await tester.ensureVisible(target);
      await tester.tap(target, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.text(label), findsWidgets);
    }
  });
}
