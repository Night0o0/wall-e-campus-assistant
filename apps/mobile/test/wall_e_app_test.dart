import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/main.dart';

import 'helpers/fake_campus_api.dart';

void main() {
  testWidgets('restores an existing student session', (tester) async {
    final api = FakeCampusApi(
      restoredSession: const AuthSession(
        token: 'restored-token',
        id: 'student-1',
        name: 'Ali Mahmoud',
        identifier: 'student@campus.edu',
        organizationId: 'org-1',
      ),
    );
    await tester.pumpWidget(WallEApp(api: api));
    await tester.pumpAndSettle();
    expect(find.text('My Timetable'), findsOneWidget);
    expect(find.text('Sign In'), findsNothing);
  });

  testWidgets('shows restore failures on the sign-in screen', (tester) async {
    final api = FakeCampusApi(
      restoreError: const ApiException(
        'The campus server did not respond. Check the API address and try again.',
      ),
    );
    await tester.pumpWidget(WallEApp(api: api));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('campus server did not respond'), findsOneWidget);
    expect(find.text('Sign In'), findsWidgets);
  });

  testWidgets('requires both credentials', (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign In').last);
    await tester.pump();
    expect(find.text('Enter your email and password.'), findsOneWidget);
  });

  testWidgets('refuses every staff account and stays on sign in',
      (tester) async {
    for (final email in [
      'owner@campus.edu',
      'university-admin@campus.edu',
      'department-admin@campus.edu',
      'instructor@campus.edu',
    ]) {
      await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
      await signIn(tester, email);
      expect(find.textContaining('Only student accounts'), findsOneWidget);
      expect(find.text('Sign In'), findsWidgets);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });

  testWidgets('student screens render connected campus data', (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'student@campus.edu');

    expect(find.text('My Timetable'), findsOneWidget);
    expect(find.text('MEC201'), findsOneWidget);
    await tester.tap(find.text('Attendance'));
    await tester.pumpAndSettle();
    expect(find.text('My Attendance'), findsOneWidget);
    await tester.tap(find.text('Material'));
    await tester.pumpAndSettle();
    expect(find.text('Electronics lecture slides'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('student-profile')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('profile-edit')), findsOneWidget);
  });
}
