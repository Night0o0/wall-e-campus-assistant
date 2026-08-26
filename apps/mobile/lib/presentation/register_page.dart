import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import 'brand_logo.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({required this.api, super.key});

  final CampusGateway api;

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _organizationController = TextEditingController();
  final _universityIdController = TextEditingController();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _organizationController.dispose();
    _universityIdController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (_submitting || !_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final result = await widget.api.registerStudent(
        organizationCode: _organizationController.text,
        universityId: _universityIdController.text,
        fullName: _nameController.text,
        email: _emailController.text,
        password: _passwordController.text,
      );
      if (!mounted) return;
      final message = result.emailConfirmationRequired
          ? 'Check your email to confirm your address, then sign in. Your university will review the account.'
          : 'Registration received. Sign in to see your approval status.';
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Registration submitted'),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Registration failed. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String? _required(String? value, String label, {int min = 1}) {
    if ((value ?? '').trim().length < min) return 'Enter $label.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Student registration')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: LeornianLogo(size: 58)),
                    const SizedBox(height: 18),
                    const Text(
                      'Create your student account',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Only students self-register. Staff accounts are created by university administrators.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.muted, height: 1.45),
                    ),
                    const SizedBox(height: 28),
                    _field(
                      key: 'register-organization',
                      controller: _organizationController,
                      label: 'University code',
                      hint: 'Example: CU',
                      validator: (value) => _required(value, 'your university code', min: 2),
                    ),
                    _field(
                      key: 'register-university-id',
                      controller: _universityIdController,
                      label: 'University ID',
                      hint: 'Your official student ID',
                      validator: (value) => _required(value, 'your university ID', min: 4),
                    ),
                    _field(
                      key: 'register-name',
                      controller: _nameController,
                      label: 'Full name',
                      hint: 'As shown on university records',
                      validator: (value) => _required(value, 'your full name', min: 3),
                    ),
                    _field(
                      key: 'register-email',
                      controller: _emailController,
                      label: 'University email',
                      hint: 'name@university.edu',
                      keyboardType: TextInputType.emailAddress,
                      validator: (value) {
                        final email = (value ?? '').trim();
                        if (!RegExp(r'^\S+@\S+\.\S+$').hasMatch(email)) {
                          return 'Enter a valid email.';
                        }
                        return null;
                      },
                    ),
                    _field(
                      key: 'register-password',
                      controller: _passwordController,
                      label: 'Password',
                      hint: 'At least 8 characters',
                      obscureText: _obscure,
                      validator: (value) => _required(value, 'a password of at least 8 characters', min: 8),
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    if (_error != null) ...[
                      Text(
                        _error!,
                        key: const ValueKey('register-error'),
                        style: const TextStyle(color: AppColors.orange),
                      ),
                      const SizedBox(height: 12),
                    ],
                    FilledButton(
                      key: const ValueKey('register-submit'),
                      onPressed: _submitting ? null : _register,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        child: Text(
                          _submitting ? 'Submitting…' : 'Create account',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'After email verification, the account remains pending until authorized university staff approve it.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.muted, fontSize: 12),
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

  Widget _field({
    required String key,
    required TextEditingController controller,
    required String label,
    required String hint,
    required String? Function(String?) validator,
    TextInputType? keyboardType,
    bool obscureText = false,
    Widget? suffixIcon,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: TextFormField(
        key: ValueKey(key),
        controller: controller,
        keyboardType: keyboardType,
        obscureText: obscureText,
        validator: validator,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          suffixIcon: suffixIcon,
        ),
      ),
    );
  }
}
