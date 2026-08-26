import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/main.dart';

import 'helpers/fake_campus_api.dart';


void main() {
  testWidgets('requires both credentials', (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await tester.tap(find.text('Sign In').last);
    await tester.pump();
    expect(find.text('Enter your email and password.'), findsOneWidget);
  });

  testWidgets('routes supported human account types from authenticated role',
      (tester) async {
    final cases = {
      'super@campus.edu': 'Active students',
      'admin@campus.edu': 'Classes today',
      'student@campus.edu': 'My Timetable',
    };

    for (final item in cases.entries) {
      await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
      await signIn(tester, item.key);
      expect(find.text(item.value), findsWidgets);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });

  testWidgets('shows the backend web-only policy for system owner',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'owner@leornian.local');
    expect(
      find.text('System owner accounts are available on the web console only'),
      findsOneWidget,
    );
    expect(find.text('Sign In'), findsWidgets);
  });

  testWidgets('only super admin can manage the official timetable',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'super@campus.edu');
    await tester.tap(find.text('Timetable'));
    await tester.pumpAndSettle();
    expect(find.text('Add timetable lecture'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await tester.pumpAndSettle();
    await signIn(tester, 'admin@campus.edu');
    await tester.tap(find.text('My Teaching'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Read-only here. The university super-admin publishes the official timetable.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('student accepted screens render connected campus data',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'student@campus.edu');

    expect(find.text('My Timetable'), findsOneWidget);
    for (final day in ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU']) {
      expect(find.text(day), findsOneWidget);
    }
    expect(find.text('Faculty of Engineering'), findsOneWidget);
    expect(find.text('MEC201'), findsOneWidget);
    expect(find.text('Electronics'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('student-day-MON-selected')),
      findsOneWidget,
    );
    await tester.tap(find.text('TUE'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('student-day-TUE-selected')),
      findsOneWidget,
    );

    await tester.tap(find.text('Attendance'));
    await tester.pumpAndSettle();
    expect(find.text('My Attendance'), findsOneWidget);
    expect(find.text('89%'), findsWidgets);
    expect(find.text('By Course'), findsOneWidget);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('MEC201'), findsWidgets);
    expect(
      find.byKey(const ValueKey('attendance-tab-by-course-selected')),
      findsOneWidget,
    );
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('attendance-tab-history-selected')),
      findsOneWidget,
    );

    await tester.tap(find.text('Material'));
    await tester.pumpAndSettle();
    expect(find.text('Material'), findsWidgets);
    expect(find.text('Electronics lecture slides'), findsOneWidget);
    expect(find.text('Electronics lab sheets'), findsOneWidget);
    expect(find.text('2 files'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('student-profile')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('profile-edit')), findsOneWidget);
  });
}
