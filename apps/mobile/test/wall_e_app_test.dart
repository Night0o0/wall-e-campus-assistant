import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/main.dart';
import 'package:wall_e_mobile/models/account_role.dart';
import 'package:wall_e_mobile/presentation/connected_pages.dart';

import 'helpers/fake_campus_api.dart';

void main() {
  testWidgets('restores an existing session into the correct shell',
      (tester) async {
    final api = FakeCampusApi(
      restoredSession: const AuthSession(
        token: 'restored-token',
        role: AccountRole.student,
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
      find.text(
        'The campus server did not respond. Check the API address and try again.',
      ),
      findsOneWidget,
    );
    expect(find.text('Sign In'), findsWidgets);
  });

  testWidgets('requires both credentials', (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await tester.pumpAndSettle();
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
    expect(find.text('Open attendance'), findsWidgets);
    expect(find.text('Add timetable lecture'), findsNothing);
  });

  testWidgets('instructor can open, monitor, and close attendance sessions',
      (tester) async {
    final api = FakeCampusApi();
    const instructorSession = AuthSession(
      token: 'test-token',
      role: AccountRole.instructor,
      id: 'admin-1',
      name: 'Omar Adel',
      identifier: 'admin@campus.edu',
      organizationId: 'org-1',
    );
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ConnectedTimetable(api: api, session: instructorSession),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Open attendance').first);
    await tester.pumpAndSettle();

    expect(api.postPaths, contains('/sessions'));
    expect(find.text('Attendance is open for this lecture.'), findsOneWidget);
    expect(find.text('Refresh in 30s'), findsOneWidget);
    expect(find.text('Copy'), findsOneWidget);

    await tester.tap(find.text('Close').last);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 4));

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ConnectedSessions(api: api, session: instructorSession),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Show code'), findsWidgets);
    expect(find.text('Monitor'), findsWidgets);

    await tester.ensureVisible(find.text('Monitor').first);
    await tester.tap(find.text('Monitor').first);
    await tester.pumpAndSettle();
    expect(find.text('Attendance roster'), findsOneWidget);
    expect(find.text('Ali Mahmoud'), findsWidgets);
    expect(find.text('Sara Hany'), findsWidgets);

    await tester.tap(find.text('Close').last);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Close').first);
    await tester.tap(find.text('Close').first);
    await tester.pumpAndSettle();
    expect(find.text('Close this session?'), findsOneWidget);
    await tester.tap(find.text('Close session'));
    await tester.pumpAndSettle();

    expect(api.patchPaths, contains('/sessions/session-3/close'));
    expect(find.text('Session closed.'), findsOneWidget);
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
