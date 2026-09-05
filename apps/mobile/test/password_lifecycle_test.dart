import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/presentation/password_recovery_page.dart';

import 'helpers/fake_campus_api.dart';

void main() {
  testWidgets('recovery refuses mismatched passwords', (tester) async {
    final api = FakeCampusApi();
    await tester.pumpWidget(MaterialApp(home: PasswordRecoveryPage(api: api)));

    await tester.enterText(
      find.byKey(const ValueKey('recovery-password')),
      'new-password-123',
    );
    await tester.enterText(
      find.byKey(const ValueKey('recovery-confirm')),
      'different-password',
    );
    await tester.tap(find.byKey(const ValueKey('recovery-submit')));
    await tester.pump();

    expect(find.text('Passwords do not match.'), findsOneWidget);
    expect(api.recoveredPassword, isNull);
  });

  testWidgets('recovery sends the validated password to the identity gateway',
      (tester) async {
    final api = FakeCampusApi();
    await tester.pumpWidget(MaterialApp(home: PasswordRecoveryPage(api: api)));

    await tester.enterText(
      find.byKey(const ValueKey('recovery-password')),
      'new-password-123',
    );
    await tester.enterText(
      find.byKey(const ValueKey('recovery-confirm')),
      'new-password-123',
    );
    await tester.tap(find.byKey(const ValueKey('recovery-submit')));
    await tester.pumpAndSettle();

    expect(api.recoveredPassword, 'new-password-123');
  });
}
