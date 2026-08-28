import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';

class PasswordRecoveryPage extends StatefulWidget {
  const PasswordRecoveryPage({required this.api, super.key});

  final CampusGateway api;

  @override
  State<PasswordRecoveryPage> createState() => _PasswordRecoveryPageState();
}

class _PasswordRecoveryPageState extends State<PasswordRecoveryPage> {
  final password = TextEditingController();
  final confirm = TextEditingController();
  bool submitting = false;
  String? error;

  @override
  void dispose() {
    password.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (submitting) return;
    if (password.text.length < 8) {
      setState(() => error = 'Use at least eight characters.');
      return;
    }
    if (password.text != confirm.text) {
      setState(() => error = 'Passwords do not match.');
      return;
    }

    setState(() {
      submitting = true;
      error = null;
    });
    try {
      await widget.api.finishPasswordRecovery(password.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated. Sign in again.')),
      );
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on ApiException catch (caught) {
      if (mounted) setState(() => error = caught.message);
    } catch (_) {
      if (mounted) setState(() => error = 'Unable to update the password.');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Reset password')),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.lock_reset_rounded,
                        color: AppColors.blue, size: 64),
                    const SizedBox(height: 20),
                    const Text('Choose a new password',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 24, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 24),
                    TextField(
                      key: const ValueKey('recovery-password'),
                      controller: password,
                      obscureText: true,
                      decoration:
                          const InputDecoration(labelText: 'New password'),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      key: const ValueKey('recovery-confirm'),
                      controller: confirm,
                      obscureText: true,
                      decoration: const InputDecoration(
                          labelText: 'Confirm new password'),
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 14),
                      Text(error!,
                          key: const ValueKey('recovery-error'),
                          style: const TextStyle(color: AppColors.orange)),
                    ],
                    const SizedBox(height: 22),
                    FilledButton(
                      key: const ValueKey('recovery-submit'),
                      onPressed: submitting ? null : submit,
                      child: Text(submitting ? 'Updating…' : 'Update password'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
