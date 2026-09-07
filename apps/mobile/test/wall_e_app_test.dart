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

  testWidgets('student registration verifies the emailed OTP before finishing',
      (tester) async {
    final api = FakeCampusApi(registrationNeedsOtp: true);
    await tester.pumpWidget(WallEApp(api: api));
    await tester.pumpAndSettle();

    final openRegistration = find.byKey(const ValueKey('open-registration'));
    await tester.ensureVisible(openRegistration);
    await tester.tap(openRegistration);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('register-organization')),
      'NCTU',
    );
    await tester.tap(find.byKey(const ValueKey('load-registration-options')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('register-academic-group')));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Faculty of Engineering').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('register-university-id')),
      'NCTU-OTP-1',
    );
    await tester.enterText(
      find.byKey(const ValueKey('register-name')),
      'OTP Student',
    );
    await tester.enterText(
      find.byKey(const ValueKey('register-email')),
      'Otp.Student@example.edu',
    );
    await tester.enterText(
      find.byKey(const ValueKey('register-phone')),
      '+201012345678',
    );
    await tester.enterText(
      find.byKey(const ValueKey('register-national-id')),
      '30001011234567',
    );
    final dateOfBirth = find.byKey(const ValueKey('register-date-of-birth'));
    await tester.ensureVisible(dateOfBirth);
    await tester.tap(dateOfBirth);
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('register-password')),
      'Password@123',
    );
    final registerSubmit = find.byKey(const ValueKey('register-submit'));
    await tester.ensureVisible(registerSubmit);
    await tester.tap(registerSubmit);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('registration-otp')), findsOneWidget);
    expect(find.textContaining('otp.student@example.edu'), findsOneWidget);

    final resendOtp = find.byKey(const ValueKey('registration-otp-resend'));
    await tester.ensureVisible(resendOtp);
    await tester.tap(resendOtp);
    await tester.pumpAndSettle();
    expect(api.registrationOtpResends, 1);

    await tester.enterText(
      find.byKey(const ValueKey('registration-otp')),
      '12345678',
    );
    final submitOtp = find.byKey(const ValueKey('registration-otp-submit'));
    await tester.ensureVisible(submitOtp);
    await tester.tap(submitOtp);
    await tester.pumpAndSettle();

    expect(api.verifiedRegistrationEmail, 'otp.student@example.edu');
    expect(api.verifiedRegistrationCode, '12345678');
    expect(find.text('Email verified'), findsOneWidget);
    expect(find.text('Go to sign in'), findsOneWidget);
  });

  testWidgets('notification bell shows unread count and opens a read popup',
      (tester) async {
    final api = FakeCampusApi();
    await tester.pumpWidget(WallEApp(api: api));
    await signIn(tester, 'student@campus.edu');

    expect(find.text('Inbox'), findsNothing);
    expect(find.text('1'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('student-notifications')));
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);

    await tester.tap(find.text('Welcome to Leornian'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('Your campus pages are ready.'), findsWidgets);
    expect(api.unreadNotifications, 0);
  });

  testWidgets('profile editor closes and refreshes without framework errors',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'student@campus.edu');
    await tester.tap(find.byKey(const ValueKey('student-profile')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('profile-edit')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('profile-save')));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Profile updated.'), findsOneWidget);
    expect(find.byKey(const ValueKey('profile-edit')), findsOneWidget);
  });
}
