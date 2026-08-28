import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import 'app_shell.dart';
import 'brand_logo.dart';
import 'register_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({required this.api, super.key});

  final CampusGateway api;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (_submitting) return;
    if (_emailController.text.trim().isEmpty ||
        _passwordController.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final session = await widget.api.login(
        _emailController.text,
        _passwordController.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => AppShell(session: session, api: widget.api),
        ),
      );
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Sign in failed. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: _FigmaBackground()),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 430),
                      child: SizedBox(
                        height: constraints.maxHeight < 785
                            ? 785
                            : constraints.maxHeight,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 32, 24, 26),
                          child: Column(
                            children: [
                              const Spacer(),
                              const _BrandLockup(),
                              const SizedBox(height: 48),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(28),
                                decoration: BoxDecoration(
                                  color: const Color(0xD9111827),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: Colors.white.withOpacity(.06),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    const Text(
                                      'Sign In',
                                      style: TextStyle(
                                        color: AppColors.ink,
                                        fontSize: 22,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 24),
                                    const _FieldLabel('EMAIL'),
                                    const SizedBox(height: 8),
                                    TextField(
                                      key: const ValueKey('login-email'),
                                      controller: _emailController,
                                      keyboardType: TextInputType.emailAddress,
                                      textInputAction: TextInputAction.next,
                                      decoration: const InputDecoration(
                                        hintText: 'name@university.edu',
                                      ),
                                    ),
                                    const SizedBox(height: 18),
                                    const _FieldLabel('PASSWORD'),
                                    const SizedBox(height: 8),
                                    TextField(
                                      key: const ValueKey('login-password'),
                                      controller: _passwordController,
                                      obscureText: _obscure,
                                      onSubmitted: (_) => _signIn(),
                                      decoration: InputDecoration(
                                        hintText: '••••••••',
                                        suffixIcon: IconButton(
                                          onPressed: () => setState(
                                            () => _obscure = !_obscure,
                                          ),
                                          icon: Icon(
                                            _obscure
                                                ? Icons.visibility_outlined
                                                : Icons.visibility_off_outlined,
                                            size: 19,
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 28),
                                    if (_error != null) ...[
                                      Text(
                                        _error!,
                                        key: const ValueKey('login-error'),
                                        style: const TextStyle(
                                          color: AppColors.orange,
                                          fontSize: 12,
                                        ),
                                      ),
                                      const SizedBox(height: 12),
                                    ],
                                    _GradientButton(
                                      label: _submitting
                                          ? 'Signing in…'
                                          : 'Sign In',
                                      onPressed: _submitting ? null : _signIn,
                                    ),
                                    const SizedBox(height: 12),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: TextButton(
                                        onPressed: _submitting
                                            ? null
                                            : _forgotPassword,
                                        style: TextButton.styleFrom(
                                          visualDensity: VisualDensity.compact,
                                          padding: EdgeInsets.zero,
                                        ),
                                        child: const Text(
                                          'Forgot password?',
                                          style: TextStyle(fontSize: 12),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    TextButton(
                                      key: const ValueKey('open-registration'),
                                      onPressed: _submitting
                                          ? null
                                          : () => Navigator.of(context).push(
                                                MaterialPageRoute<void>(
                                                  builder: (_) => RegisterPage(
                                                    api: widget.api,
                                                  ),
                                                ),
                                              ),
                                      child: const Text(
                                        'New student? Create an account',
                                        style: TextStyle(fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Spacer(),
                              const Text(
                                'Leornian v2.0 · Semester 2 · 2025/2026',
                                style: TextStyle(
                                  color: AppColors.muted,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _forgotPassword() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your student email first.');
      return;
    }

    try {
      await widget.api.requestPasswordReset(email);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'If the address can recover an account, a secure reset link is on its way.',
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        color: AppColors.muted,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1,
      ),
    );
  }
}

class _GradientButton extends StatelessWidget {
  const _GradientButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.blue, AppColors.violet],
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(
            color: Color(0x594F8EF7),
            blurRadius: 24,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 56,
            child: Center(
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandLockup extends StatelessWidget {
  const _BrandLockup();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        LeornianLogo(size: 72),
        SizedBox(height: 22),
        Text(
          'Leornian',
          style: TextStyle(
            color: AppColors.ink,
            fontSize: 28,
            fontWeight: FontWeight.w800,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'Student Attendance Portal',
          style: TextStyle(color: AppColors.muted, fontSize: 14),
        ),
      ],
    );
  }
}

class _FigmaBackground extends StatelessWidget {
  const _FigmaBackground();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppColors.backgroundGradient),
      child: Stack(
        children: [
          Positioned(
            left: -170,
            top: -120,
            child: _Glow(size: 430, color: AppColors.blue.withOpacity(.07)),
          ),
          Positioned(
            right: -190,
            bottom: -180,
            child: _Glow(size: 520, color: AppColors.violet.withOpacity(.07)),
          ),
        ],
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}
