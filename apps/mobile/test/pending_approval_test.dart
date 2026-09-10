import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/presentation/app_shell.dart';

import 'helpers/fake_campus_api.dart';

/// The pending-approval screen must lift itself into the full student shell the
/// moment staff approve the account — without a sign-out/sign-in — by
/// re-checking account state. Here approval is driven by a fake whose
/// `/auth/profile` flips `isVerified` to true on demand.

class _ApprovingApi extends FakeCampusApi {
  bool approved = false;
  int profileChecks = 0;

  @override
  Future<Map<String, dynamic>> get(
    String path,
    AuthSession session, {
    Map<String, String>? query,
  }) async {
    if (path == '/auth/profile') {
      profileChecks++;
      return {
        'user': {
          'fullName': session.name,
          'email': session.identifier,
          'isVerified': approved,
        }
      };
    }
    return super.get(path, session, query: query);
  }
}

const _pendingSession = AuthSession(
  token: 't',
  id: 'student-1',
  name: 'Ali Mahmoud',
  identifier: 'ali@campus.edu',
  organizationId: 'org-1',
  isVerified: false,
);

void main() {
  testWidgets('shows the pending screen and stays there while unapproved',
      (tester) async {
    final api = _ApprovingApi();
    await tester.pumpWidget(MaterialApp(
      home: AppShell(session: _pendingSession, api: api),
    ));
    await tester.pump();

    expect(find.text('Pending university approval'), findsOneWidget);
    expect(find.text('My Timetable'), findsNothing);

    // A manual re-check while still unapproved keeps the pending screen.
    await tester.tap(find.byKey(const ValueKey('pending-check-again')));
    await tester.pumpAndSettle();
    expect(find.text('Pending university approval'), findsOneWidget);
    expect(api.profileChecks, greaterThanOrEqualTo(1));
  });

  testWidgets('transitions into the student shell once approved, no re-login',
      (tester) async {
    final api = _ApprovingApi();
    await tester.pumpWidget(MaterialApp(
      home: AppShell(session: _pendingSession, api: api),
    ));
    await tester.pump();
    expect(find.text('Pending university approval'), findsOneWidget);

    // Staff approve the account; the next re-check should promote the shell.
    api.approved = true;
    await tester.tap(find.byKey(const ValueKey('pending-check-again')));
    await tester.pumpAndSettle();

    expect(find.text('Pending university approval'), findsNothing);
    expect(find.text('My Timetable'), findsOneWidget);
    expect(api.didLogout, isFalse); // promoted without a sign-out
  });
}
