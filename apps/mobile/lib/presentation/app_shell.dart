import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import 'brand_logo.dart';
import 'login_page.dart';
import 'student_shell.dart';

/// The mobile application has one authenticated shell: the student experience.
class AppShell extends StatelessWidget {
  const AppShell({required this.session, required this.api, super.key});

  final AuthSession session;
  final CampusGateway api;

  Future<void> _logout(BuildContext context) async {
    await api.logout();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => LoginPage(api: api)),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!session.isVerified) {
      return _PendingApproval(
        name: session.name,
        onLogout: () => _logout(context),
      );
    }

    return StudentShell(
      api: api,
      session: session,
      onLogout: () => _logout(context),
    );
  }
}

class _PendingApproval extends StatelessWidget {
  const _PendingApproval({required this.name, required this.onLogout});

  final String name;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppColors.backgroundGradient),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const LeornianLogo(size: 72),
                    const SizedBox(height: 28),
                    Text(
                      'Thanks, ${name.trim().isEmpty ? 'student' : name.split(' ').first}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Your identity is confirmed. Academic features unlock after authorized university staff verify your student record.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.muted,
                        fontSize: 15,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 28),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppColors.orange.withValues(alpha: .1),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: AppColors.orange.withValues(alpha: .25)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.schedule_rounded, color: AppColors.orange),
                          SizedBox(width: 10),
                          Text(
                            'Pending university approval',
                            style: TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 30),
                    OutlinedButton.icon(
                      onPressed: onLogout,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('Back to sign in'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
