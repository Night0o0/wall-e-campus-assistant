import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
  final _phoneController = TextEditingController();
  final _nationalIdController = TextEditingController();
  final _dateOfBirthController = TextEditingController();
  final _otpController = TextEditingController();
  final _otpFocusNode = FocusNode();
  bool _submitting = false;
  bool _obscure = true;
  String? _error;
  bool _awaitingOtp = false;
  bool _verifyingOtp = false;
  bool _resendingOtp = false;
  String? _otpError;
  String? _pendingEmail;
  List<RegistrationOption> _registrationOptions = const [];
  RegistrationOption? _selectedOption;
  bool _loadingOptions = false;
  String? _optionsError;
  bool _registrationComplete = false;

  @override
  void dispose() {
    _organizationController.dispose();
    _universityIdController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    _nationalIdController.dispose();
    _dateOfBirthController.dispose();
    _otpController.dispose();
    _otpFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadRegistrationOptions() async {
    final code = _organizationController.text.trim();
    if (code.length < 2 || _loadingOptions) {
      setState(() => _optionsError = 'Enter your university code first.');
      return;
    }
    setState(() {
      _loadingOptions = true;
      _optionsError = null;
      _selectedOption = null;
      _registrationOptions = const [];
    });
    try {
      final options = await widget.api.getRegistrationOptions(code);
      if (!mounted) return;
      setState(() {
        _registrationOptions = options;
        _optionsError = options.isEmpty
            ? 'No registration groups are configured for this university.'
            : null;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _optionsError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _optionsError = 'Could not load university options.');
      }
    } finally {
      if (mounted) setState(() => _loadingOptions = false);
    }
  }

  Future<void> _register() async {
    if (_submitting || !_formKey.currentState!.validate()) return;
    if (_selectedOption == null) {
      setState(() => _optionsError = 'Select your academic group.');
      return;
    }
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
        cohortId: _selectedOption!.cohortId,
        phoneNumber: _phoneController.text,
        nationalId: _nationalIdController.text,
        dateOfBirth: _dateOfBirthController.text,
      );
      if (!mounted) return;
      if (result.emailConfirmationRequired) {
        setState(() {
          _pendingEmail = _emailController.text.trim().toLowerCase();
          _awaitingOtp = true;
          _otpError = null;
          _otpController.clear();
        });
        return;
      }
      _showRegistrationComplete();
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

  Future<void> _verifyOtp() async {
    if (_verifyingOtp) return;
    final code = _otpController.text.trim();
    if (!RegExp(r'^\d{8}$').hasMatch(code)) {
      setState(() => _otpError = 'Enter the 8-digit code from your email.');
      return;
    }

    setState(() {
      _verifyingOtp = true;
      _otpError = null;
    });
    try {
      await widget.api.verifyStudentRegistration(
        email: _pendingEmail!,
        code: code,
      );
      if (!mounted) return;
      _showRegistrationComplete();
    } on ApiException catch (error) {
      if (mounted) setState(() => _otpError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() {
          _otpError = 'The code could not be verified. Check it and try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _verifyingOtp = false);
    }
  }

  Future<void> _resendOtp() async {
    if (_resendingOtp || _verifyingOtp) return;
    setState(() {
      _resendingOtp = true;
      _otpError = null;
    });
    try {
      await widget.api.resendStudentRegistrationOtp(_pendingEmail!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('A new verification code was sent.')),
        );
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _otpError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _otpError = 'Could not resend the code. Try again.');
      }
    } finally {
      if (mounted) setState(() => _resendingOtp = false);
    }
  }

  void _showRegistrationComplete() {
    if (!mounted) return;
    setState(() {
      _registrationComplete = true;
      _awaitingOtp = false;
    });
  }

  Future<void> _chooseDateOfBirth() async {
    final now = DateTime.now();
    final selected = await showDatePicker(
      context: context,
      firstDate: DateTime(1901),
      lastDate: DateTime(now.year - 10, now.month, now.day),
      initialDate: DateTime(now.year - 18, now.month, now.day),
    );
    if (selected == null || !mounted) return;
    _dateOfBirthController.text =
        '${selected.year.toString().padLeft(4, '0')}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}';
  }

  void _changeEmail() {
    setState(() {
      _awaitingOtp = false;
      _pendingEmail = null;
      _otpError = null;
      _otpController.clear();
    });
  }

  String? _required(String? value, String label, {int min = 1}) {
    if ((value ?? '').trim().length < min) return 'Enter $label.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    if (_registrationComplete) return _buildRegistrationComplete();
    if (_awaitingOtp) return _buildOtpVerification();

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
                      validator: (value) =>
                          _required(value, 'your university code', min: 2),
                    ),
                    OutlinedButton.icon(
                      key: const ValueKey('load-registration-options'),
                      onPressed:
                          _loadingOptions ? null : _loadRegistrationOptions,
                      icon: _loadingOptions
                          ? const SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.school_outlined),
                      label: Text(_loadingOptions
                          ? 'Loading university…'
                          : 'Load university options'),
                    ),
                    const SizedBox(height: 18),
                    if (_registrationOptions.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 18),
                        child: DropdownButtonFormField<RegistrationOption>(
                          key: const ValueKey('register-academic-group'),
                          initialValue: _selectedOption,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Academic group',
                          ),
                          hint: const Text('Choose from university records'),
                          items: _registrationOptions
                              .map(
                                (option) => DropdownMenuItem(
                                  value: option,
                                  child: Text(
                                    '${option.faculty} · ${option.department} · Level ${option.level} · ${option.semesterLabel} · Section ${option.section}${option.groupName.isEmpty ? '' : ' · ${option.groupName}'}',
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (value) => setState(() {
                            _selectedOption = value;
                            _optionsError = null;
                          }),
                        ),
                      ),
                    if (_selectedOption case final option?) ...[
                      Container(
                        key: const ValueKey('selected-academic-details'),
                        margin: const EdgeInsets.only(bottom: 18),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.blue.withValues(alpha: .08),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: AppColors.blue.withValues(alpha: .2),
                          ),
                        ),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            option.faculty,
                            option.department,
                            'Level ${option.level}',
                            option.semesterLabel,
                            'Section ${option.section}',
                            option.academicYear,
                            if (option.groupName.isNotEmpty) option.groupName,
                          ]
                              .map(
                                (label) => Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text(
                                    label,
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    ],
                    if (_optionsError != null) ...[
                      Text(
                        _optionsError!,
                        key: const ValueKey('registration-options-error'),
                        style: const TextStyle(color: AppColors.danger),
                      ),
                      const SizedBox(height: 14),
                    ],
                    _field(
                      key: 'register-university-id',
                      controller: _universityIdController,
                      label: 'University ID',
                      hint: 'Your official student ID',
                      validator: (value) =>
                          _required(value, 'your university ID', min: 4),
                    ),
                    _field(
                      key: 'register-name',
                      controller: _nameController,
                      label: 'Full name',
                      hint: 'As shown on university records',
                      validator: (value) =>
                          _required(value, 'your full name', min: 3),
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
                      key: 'register-phone',
                      controller: _phoneController,
                      label: 'Phone number',
                      hint: '+20 10 1234 5678',
                      keyboardType: TextInputType.phone,
                      validator: (value) => RegExp(r'^\+?[\d\s-]{7,20}$')
                              .hasMatch((value ?? '').trim())
                          ? null
                          : 'Enter a valid phone number.',
                    ),
                    _field(
                      key: 'register-national-id',
                      controller: _nationalIdController,
                      label: 'National ID',
                      hint: '14 digits',
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      validator: (value) =>
                          RegExp(r'^\d{14}$').hasMatch((value ?? '').trim())
                              ? null
                              : 'National ID must be 14 digits.',
                    ),
                    _field(
                      key: 'register-date-of-birth',
                      controller: _dateOfBirthController,
                      label: 'Date of birth',
                      hint: 'YYYY-MM-DD',
                      readOnly: true,
                      onTap: _chooseDateOfBirth,
                      suffixIcon: const Icon(Icons.calendar_month_outlined),
                      validator: (value) =>
                          _required(value, 'your date of birth', min: 10),
                    ),
                    _field(
                      key: 'register-password',
                      controller: _passwordController,
                      label: 'Password',
                      hint: 'At least 8 characters',
                      obscureText: _obscure,
                      validator: (value) => _required(
                          value, 'a password of at least 8 characters',
                          min: 8),
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
                        style: const TextStyle(color: AppColors.danger),
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

  Widget _buildOtpVerification() {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _changeEmail();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Verify your email'),
          leading: IconButton(
            tooltip: 'Change email',
            onPressed: _changeEmail,
            icon: const Icon(Icons.arrow_back_rounded),
          ),
        ),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: LeornianLogo(size: 58)),
                    const SizedBox(height: 18),
                    const Text(
                      'Enter the verification code',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'We sent a verification code to\n${_pendingEmail ?? ''}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.muted,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 28),
                    GestureDetector(
                      onTap: () => _otpFocusNode.requestFocus(),
                      child: SizedBox(
                        height: 58,
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: Opacity(
                                opacity: 0,
                                child: TextField(
                                  key: const ValueKey('registration-otp'),
                                  controller: _otpController,
                                  focusNode: _otpFocusNode,
                                  autofocus: true,
                                  enabled: !_verifyingOtp,
                                  keyboardType: TextInputType.number,
                                  textInputAction: TextInputAction.done,
                                  maxLength: 8,
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly,
                                  ],
                                  onChanged: (_) => setState(() {}),
                                  onSubmitted: (_) => _verifyOtp(),
                                  decoration:
                                      const InputDecoration(counterText: ''),
                                ),
                              ),
                            ),
                            Row(
                              children: List.generate(8, (index) {
                                final value = _otpController.text;
                                final filled = index < value.length;
                                final active = index == value.length;
                                return Expanded(
                                  child: Container(
                                    margin: EdgeInsets.only(
                                      right: index == 7 ? 0 : 6,
                                    ),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: AppColors.input,
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(
                                        color: active
                                            ? AppColors.blue
                                            : AppColors.line,
                                        width: active ? 1.5 : 1,
                                      ),
                                    ),
                                    child: Text(
                                      filled ? value[index] : '',
                                      style: const TextStyle(
                                        color: AppColors.ink,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                );
                              }),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_otpError != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _otpError!,
                        key: const ValueKey('registration-otp-error'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.danger),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      key: const ValueKey('registration-otp-submit'),
                      onPressed: _verifyingOtp ? null : _verifyOtp,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        child: Text(
                          _verifyingOtp ? 'Verifying…' : 'Verify email',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextButton(
                      key: const ValueKey('registration-otp-resend'),
                      onPressed:
                          _resendingOtp || _verifyingOtp ? null : _resendOtp,
                      child: Text(
                        _resendingOtp ? 'Sending…' : 'Resend code',
                      ),
                    ),
                    TextButton(
                      onPressed: _verifyingOtp ? null : _changeEmail,
                      child: const Text('Use a different email'),
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
    List<TextInputFormatter>? inputFormatters,
    bool readOnly = false,
    VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: TextFormField(
        key: ValueKey(key),
        controller: controller,
        keyboardType: keyboardType,
        obscureText: obscureText,
        inputFormatters: inputFormatters,
        readOnly: readOnly,
        onTap: onTap,
        validator: validator,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          suffixIcon: suffixIcon,
        ),
      ),
    );
  }

  Widget _buildRegistrationComplete() {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppColors.backgroundGradient),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Container(
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Center(child: LeornianLogo(size: 58)),
                      const SizedBox(height: 24),
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: .14),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 38,
                          color: AppColors.success,
                        ),
                      ),
                      const SizedBox(height: 22),
                      const Text(
                        'Email verified',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.ink,
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Your registration has been submitted. Your university will review the account before campus access is enabled.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.muted, height: 1.5),
                      ),
                      const SizedBox(height: 26),
                      FilledButton.icon(
                        key: const ValueKey('registration-go-to-login'),
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.login_rounded),
                        label: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 15),
                          child: Text('Go to sign in'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
