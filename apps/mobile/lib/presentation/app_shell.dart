import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import '../data/push_service.dart';
import 'brand_logo.dart';
import 'login_page.dart';
import 'student_shell.dart';

/// The mobile application has one authenticated shell: the student experience.
///
/// It is stateful because approval is not a one-shot fact read at login. A
/// student who signs in while still pending must move into the full shell the
/// moment staff approve them — without signing out and back in — so this widget
/// re-checks account state on a timer and whenever the app returns to the
/// foreground, and swaps [_PendingApproval] for [StudentShell] when the flag
/// flips. It also owns the push lifecycle: registering on entry to the verified
/// shell and deactivating the token on logout.
class AppShell extends StatefulWidget {
  const AppShell({
    required this.session,
    required this.api,
    this.pushService,
    super.key,
  });

  final AuthSession session;
  final CampusGateway api;
  final PushService? pushService;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  static const _pollInterval = Duration(seconds: 20);

  late AuthSession _session = widget.session;
  Timer? _poll;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!_session.isVerified) _startPolling();
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // A student often gets approved while the app is backgrounded; catch it the
    // instant they return rather than waiting for the next poll tick.
    if (state == AppLifecycleState.resumed && !_session.isVerified) {
      _refreshApproval();
    }
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(_pollInterval, (_) => _refreshApproval());
  }

  /// Re-reads the account's approval flag. Best effort: a failed check simply
  /// leaves the pending screen in place until the next attempt.
  Future<void> _refreshApproval() async {
    if (_checking || _session.isVerified || !mounted) return;
    _checking = true;
    try {
      final response = await widget.api.get('/auth/profile', _session);
      final user = response['user'];
      final verified = user is Map && user['isVerified'] == true;
      if (verified && mounted) {
        _poll?.cancel();
        setState(() => _session = _session.copyWith(isVerified: true));
      }
    } catch (_) {
      // Ignore; the timer or the next resume will try again.
    } finally {
      _checking = false;
    }
  }

  Future<void> _logout() async {
    // Stop push first so the handset's token is deactivated for this account.
    await widget.pushService?.stop();
    await widget.api.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) =>
            LoginPage(api: widget.api, pushService: widget.pushService),
      ),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_session.isVerified) {
      return _PendingApproval(
        name: _session.name,
        checking: _checking,
        onRefresh: _refreshApproval,
        onLogout: _logout,
      );
    }

    return StudentShell(
      api: widget.api,
      session: _session,
      pushService: widget.pushService,
      onLogout: _logout,
    );
  }
}

class _PendingApproval extends StatelessWidget {
  const _PendingApproval({
    required this.name,
    required this.checking,
    required this.onRefresh,
    required this.onLogout,
  });

  final String name;
  final bool checking;
  final Future<void> Function() onRefresh;
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
                      'Your identity is confirmed. Academic features unlock after authorized university staff verify your student record. This screen updates on its own once you are approved.',
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
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.schedule_rounded,
                              color: AppColors.orange),
                          const SizedBox(width: 10),
                          const Text(
                            'Pending university approval',
                            style: TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (checking) ...[
                            const SizedBox(width: 10),
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextButton.icon(
                      key: const ValueKey('pending-check-again'),
                      onPressed: checking ? null : () => onRefresh(),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Check again'),
                    ),
                    const SizedBox(height: 10),
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
