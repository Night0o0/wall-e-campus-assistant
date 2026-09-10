import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A signed-in student. Authentication comes from Supabase when it is
/// configured; the legacy endpoint remains a local migration fallback.
class AuthSession {
  const AuthSession({
    required this.token,
    required this.id,
    required this.name,
    required this.identifier,
    required this.organizationId,
    this.isVerified = true,
  });

  final String token;
  final String id;
  final String name;
  final String identifier;
  final String organizationId;
  final bool isVerified;

  AuthSession copyWith({bool? isVerified}) => AuthSession(
        token: token,
        id: id,
        name: name,
        identifier: identifier,
        organizationId: organizationId,
        isVerified: isVerified ?? this.isVerified,
      );
}

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.code, this.details});

  final String message;
  final int? statusCode;
  final String? code;
  final Object? details;

  @override
  String toString() => message;
}

class RegistrationResult {
  const RegistrationResult({required this.emailConfirmationRequired});
  final bool emailConfirmationRequired;
}

class RegistrationOption {
  const RegistrationOption({
    required this.cohortId,
    required this.cohortName,
    required this.faculty,
    required this.department,
    required this.level,
    required this.semesterLabel,
    required this.section,
    required this.groupName,
    required this.academicYear,
  });

  final String cohortId;
  final String cohortName;
  final String faculty;
  final String department;
  final int level;
  final String semesterLabel;
  final String section;
  final String groupName;
  final String academicYear;

  factory RegistrationOption.fromJson(Map<String, dynamic> json) {
    return RegistrationOption(
      cohortId: json['cohortId']?.toString() ?? '',
      cohortName: json['cohortName']?.toString() ?? '',
      faculty: json['faculty']?.toString() ?? '',
      department: json['department']?.toString() ?? '',
      level: int.tryParse(json['level']?.toString() ?? '') ?? 0,
      semesterLabel: json['semesterLabel']?.toString() ?? '',
      section: json['section']?.toString() ?? '',
      groupName: json['groupName']?.toString() ?? '',
      academicYear: json['academicYear']?.toString() ?? '',
    );
  }
}

abstract class CampusGateway {
  Future<AuthSession> login(String identifier, String password);

  Future<AuthSession?> restoreSession();

  Future<List<RegistrationOption>> getRegistrationOptions(
    String organizationCode,
  );

  Future<RegistrationResult> registerStudent({
    required String organizationCode,
    required String universityId,
    required String fullName,
    required String email,
    required String password,
    required String cohortId,
    required String phoneNumber,
    required String nationalId,
    required String dateOfBirth,
  });

  Future<void> verifyStudentRegistration({
    required String email,
    required String code,
  });

  Future<void> resendStudentRegistrationOtp(String email);

  Future<Map<String, dynamic>> get(
    String path,
    AuthSession session, {
    Map<String, String>? query,
  });

  Future<Map<String, dynamic>> post(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]);

  Future<Map<String, dynamic>> patch(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]);

  Future<void> requestPasswordReset(String email);

  Future<void> changePassword({
    required String email,
    required String currentPassword,
    required String newPassword,
  });

  Future<void> finishPasswordRecovery(String newPassword);

  Future<void> logout();
}

class CampusApi implements CampusGateway {
  CampusApi({
    String? baseUrl,
    http.Client? client,
  })  : baseUrl = (baseUrl ?? _defaultBaseUrl).replaceFirst(RegExp(r'/$'), ''),
        _client = client ?? http.Client();

  /// Android emulators reach the host through 10.0.2.2. A physical phone must
  /// be launched with --dart-define=API_BASE_URL=http://<computer-ip>:5000/api.
  static const _configuredBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabasePublishableKey =
      String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  static const _deepLinkScheme = String.fromEnvironment(
    'DEEP_LINK_SCHEME',
    defaultValue: 'io.leornian.campus',
  );
  static const _registrationDeepLinkHost = String.fromEnvironment(
    'REGISTRATION_DEEP_LINK_HOST',
    defaultValue: 'register',
  );
  static const _recoveryDeepLinkHost = String.fromEnvironment(
    'RECOVERY_DEEP_LINK_HOST',
    defaultValue: 'reset-password',
  );
  static bool get supabaseConfigured =>
      supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty;

  static String get _defaultBaseUrl {
    if (_configuredBaseUrl.isNotEmpty) return _configuredBaseUrl;
    if (kIsWeb) return 'http://localhost:5000/api';
    return Platform.isAndroid
        ? 'http://10.0.2.2:5000/api'
        : 'http://localhost:5000/api';
  }

  final String baseUrl;
  final http.Client _client;
  static const _registrationStorageKey = 'leornian.pendingRegistration';
  static const _secureStorage = FlutterSecureStorage();

  @override
  Future<AuthSession> login(String identifier, String password) async {
    final normalized = identifier.trim().toLowerCase();

    if (supabaseConfigured) {
      late final AuthResponse response;
      try {
        response = await Supabase.instance.client.auth.signInWithPassword(
          email: normalized,
          password: password,
        );
      } on AuthException catch (error) {
        final message = error.message.toLowerCase();
        if (message.contains('invalid login credentials') ||
            message.contains('invalid credentials')) {
          throw const ApiException(
            'Email or password is incorrect.',
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
          );
        }
        throw ApiException(error.message);
      }
      final accessToken = response.session?.accessToken;
      if (accessToken == null) {
        throw const ApiException('Sign in did not create a session.');
      }

      try {
        await _completePendingRegistration(accessToken);
        return await _sessionFromSupabaseToken(
          accessToken,
          fallbackIdentifier: normalized,
          fallbackUserId: response.user?.id ?? '',
        );
      } catch (_) {
        await Supabase.instance.client.auth.signOut();
        rethrow;
      }
    }

    final response = await _send(
      'POST',
      '/auth/mobile-login',
      body: {'email': normalized, 'password': password},
    );
    final user = _map(response['user']);
    if (user['role']?.toString() != 'STUDENT') {
      throw const ApiException(
        'Only student accounts can use the mobile app. Staff sign in on the web console.',
        statusCode: 403,
        code: 'WEB_ONLY_ACCOUNT',
      );
    }

    return AuthSession(
      token: response['token'] as String,
      id: user['id']?.toString() ?? '',
      name: user['fullName']?.toString() ?? 'Student',
      identifier: user['email']?.toString() ?? normalized,
      organizationId: user['organizationId']?.toString() ?? '',
      isVerified: user['isVerified'] == true,
    );
  }

  @override
  Future<List<RegistrationOption>> getRegistrationOptions(
    String organizationCode,
  ) async {
    final response = await _send(
      'GET',
      '/auth/registration-options',
      query: {'organizationCode': organizationCode.trim().toUpperCase()},
      mobileClient: true,
    );
    final rawOptions = response['options'];
    if (rawOptions is! List) return const [];
    return rawOptions
        .whereType<Map>()
        .map((value) => RegistrationOption.fromJson(_map(value)))
        .where((option) => option.cohortId.isNotEmpty)
        .toList();
  }

  @override
  Future<RegistrationResult> registerStudent({
    required String organizationCode,
    required String universityId,
    required String fullName,
    required String email,
    required String password,
    required String cohortId,
    required String phoneNumber,
    required String nationalId,
    required String dateOfBirth,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final registration = <String, dynamic>{
      'organizationCode': organizationCode.trim().toUpperCase(),
      'universityId': universityId.trim(),
      'fullName': fullName.trim(),
      'cohortId': cohortId,
      'phoneNumber': phoneNumber.trim(),
      'nationalId': nationalId.trim(),
      'dateOfBirth': dateOfBirth,
    };

    if (!supabaseConfigured) {
      await _send('POST', '/auth/register', body: {
        ...registration,
        'email': normalizedEmail,
        'password': password,
      });
      return const RegistrationResult(emailConfirmationRequired: false);
    }

    await _secureStorage.write(
      key: _registrationStorageKey,
      value: jsonEncode({...registration, 'email': normalizedEmail}),
    );
    late final AuthResponse response;
    try {
      response = await Supabase.instance.client.auth.signUp(
        email: normalizedEmail,
        password: password,
        emailRedirectTo: Uri(
          scheme: _deepLinkScheme,
          host: _registrationDeepLinkHost,
          path: '/complete',
        ).toString(),
        // Keep personal identity data out of Supabase user metadata. The full
        // pending registration is encrypted in this device's secure storage.
        data: {
          'registration': {
            'organizationCode': registration['organizationCode'],
            'universityId': registration['universityId'],
            'fullName': registration['fullName'],
            'cohortId': registration['cohortId'],
          },
        },
      );
    } on AuthException catch (error) {
      final message = error.message.toLowerCase();
      if (message.contains('already registered') ||
          message.contains('already exists')) {
        await _secureStorage.delete(key: _registrationStorageKey);
        throw const ApiException(
          'Email already exists.',
          statusCode: 409,
          code: 'EMAIL_ALREADY_EXISTS',
        );
      }
      throw ApiException(error.message);
    }
    if (response.user?.identities?.isEmpty == true) {
      await _secureStorage.delete(key: _registrationStorageKey);
      throw const ApiException(
        'Email already exists.',
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
      );
    }
    final accessToken = response.session?.accessToken;
    if (accessToken != null) await _completePendingRegistration(accessToken);

    return RegistrationResult(
      emailConfirmationRequired: accessToken == null,
    );
  }

  @override
  Future<void> verifyStudentRegistration({
    required String email,
    required String code,
  }) async {
    if (!supabaseConfigured) {
      throw const ApiException(
        'Email verification is not configured for this app.',
      );
    }

    final normalizedEmail = email.trim().toLowerCase();
    var session = Supabase.instance.client.auth.currentSession;
    final currentEmail =
        Supabase.instance.client.auth.currentUser?.email?.toLowerCase();

    // If verification succeeded but completing the campus registration failed
    // because the network dropped, retain and reuse that proven Supabase
    // session. OTPs are one-time, so asking the student to spend it twice would
    // make a recoverable backend failure look like an invalid code.
    if (session == null || currentEmail != normalizedEmail) {
      try {
        final response = await Supabase.instance.client.auth.verifyOTP(
          type: OtpType.email,
          email: normalizedEmail,
          token: code.trim(),
        );
        session = response.session;
      } on AuthException catch (error) {
        throw ApiException(error.message);
      }
    }

    if (session == null) {
      throw const ApiException(
        'The verification code did not create a session. Request a new code.',
      );
    }

    await _completePendingRegistration(session.accessToken);
    await Supabase.instance.client.auth.signOut();
  }

  @override
  Future<void> resendStudentRegistrationOtp(String email) async {
    if (!supabaseConfigured) {
      throw const ApiException(
        'Email verification is not configured for this app.',
      );
    }

    try {
      await Supabase.instance.client.auth.resend(
        type: OtpType.signup,
        email: email.trim().toLowerCase(),
      );
    } on AuthException catch (error) {
      throw ApiException(error.message);
    }
  }

  @override
  Future<AuthSession?> restoreSession() async {
    if (!supabaseConfigured) return null;

    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) return null;

    try {
      await _completePendingRegistration(session.accessToken);
      return await _sessionFromSupabaseToken(
        session.accessToken,
        fallbackIdentifier:
            Supabase.instance.client.auth.currentUser?.email ?? '',
        fallbackUserId: session.user.id,
      );
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await Supabase.instance.client.auth.signOut();
        return null;
      }
      rethrow;
    }
  }

  Future<void> _completePendingRegistration(String accessToken) async {
    final raw = await _secureStorage.read(key: _registrationStorageKey);
    Map<String, dynamic>? registration;
    if (raw != null) {
      registration = jsonDecode(raw) as Map<String, dynamic>;
      final intendedEmail = registration.remove('email')?.toString();
      final sessionEmail =
          Supabase.instance.client.auth.currentUser?.email?.toLowerCase();
      if (intendedEmail != null &&
          intendedEmail.toLowerCase() != sessionEmail) {
        registration = null;
      }
    }
    if (registration == null) {
      final metadata = Supabase.instance.client.auth.currentUser?.userMetadata;
      final candidate = metadata?['registration'];
      if (candidate is Map) {
        registration = candidate.map(
          (key, value) => MapEntry(key.toString(), value),
        );
      }
    }
    if (registration == null) return;

    final provisional = AuthSession(
      token: accessToken,
      id: '',
      name: '',
      identifier: '',
      organizationId: '',
    );
    await _send(
      'POST',
      '/auth/register/supabase',
      session: provisional,
      body: registration,
    );
    await _secureStorage.delete(key: _registrationStorageKey);
  }

  Future<AuthSession> _sessionFromSupabaseToken(
    String accessToken, {
    required String fallbackIdentifier,
    required String fallbackUserId,
  }) async {
    final provisional = AuthSession(
      token: accessToken,
      id: fallbackUserId,
      name: '',
      identifier: fallbackIdentifier,
      organizationId: '',
    );
    final profileResponse = await _send(
      'GET',
      '/auth/profile',
      session: provisional,
    );
    final user = _map(profileResponse['user']);
    if (user['role']?.toString() != 'STUDENT') {
      throw const ApiException(
        'Only student accounts can use the mobile app. Staff sign in on the web console.',
        statusCode: 403,
        code: 'WEB_ONLY_ACCOUNT',
      );
    }

    return AuthSession(
      token: accessToken,
      id: user['id']?.toString() ?? fallbackUserId,
      name: user['fullName']?.toString() ?? 'Student',
      identifier: user['email']?.toString() ?? fallbackIdentifier,
      organizationId: user['organizationId']?.toString() ?? '',
      isVerified: user['isVerified'] == true,
    );
  }

  @override
  Future<Map<String, dynamic>> get(
    String path,
    AuthSession session, {
    Map<String, String>? query,
  }) {
    return _send('GET', path, session: session, query: query);
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) {
    return _send('POST', path, session: session, body: body);
  }

  @override
  Future<Map<String, dynamic>> patch(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) {
    return _send('PATCH', path, session: session, body: body);
  }

  @override
  Future<void> requestPasswordReset(String email) async {
    if (supabaseConfigured) {
      await Supabase.instance.client.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        redirectTo: Uri(
          scheme: _deepLinkScheme,
          host: _recoveryDeepLinkHost,
        ).toString(),
      );
      return;
    }
    await _send(
      'POST',
      '/auth/forgot-password',
      body: {'email': email.trim().toLowerCase()},
    );
  }

  @override
  Future<void> changePassword({
    required String email,
    required String currentPassword,
    required String newPassword,
  }) async {
    if (!supabaseConfigured) {
      throw const ApiException(
        'Password changes require Supabase authentication.',
      );
    }

    await Supabase.instance.client.auth.signInWithPassword(
      email: email.trim().toLowerCase(),
      password: currentPassword,
    );
    await Supabase.instance.client.auth.updateUser(
      UserAttributes(password: newPassword),
    );
  }

  @override
  Future<void> finishPasswordRecovery(String newPassword) async {
    if (!supabaseConfigured ||
        Supabase.instance.client.auth.currentSession == null) {
      throw const ApiException(
        'This password-reset link is invalid or has expired.',
      );
    }

    await Supabase.instance.client.auth.updateUser(
      UserAttributes(password: newPassword),
    );
    await Supabase.instance.client.auth.signOut();
  }

  @override
  Future<void> logout() async {
    if (supabaseConfigured) {
      await Supabase.instance.client.auth.signOut();
    }
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    AuthSession? session,
    Map<String, String>? query,
    Map<String, dynamic>? body,
    bool mobileClient = false,
  }) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);

    try {
      final request = http.Request(method, uri);
      request.headers[HttpHeaders.contentTypeHeader] =
          ContentType.json.mimeType;
      request.headers[HttpHeaders.acceptHeader] = ContentType.json.mimeType;
      if (mobileClient || session != null || path.startsWith('/auth/')) {
        request.headers['X-Client-Platform'] = 'mobile';
      }
      if (session != null) {
        request.headers[HttpHeaders.authorizationHeader] =
            'Bearer ${session.token}';
      }
      if (body != null) request.body = jsonEncode(body);

      final response =
          await _client.send(request).timeout(const Duration(seconds: 15));
      final raw = await response.stream
          .bytesToString()
          .timeout(const Duration(seconds: 20));
      final decoded = raw.isEmpty ? <String, dynamic>{} : jsonDecode(raw);
      final payload = decoded is Map
          ? decoded.map((key, value) => MapEntry(key.toString(), value))
          : <String, dynamic>{'data': decoded};

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(
          payload['message']?.toString() ?? 'The server rejected this request.',
          statusCode: response.statusCode,
          code: payload['code']?.toString(),
          details: payload['errors'],
        );
      }

      return payload;
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
        'The campus server did not respond. Check the API address and try again.',
      );
    } on SocketException {
      throw const ApiException(
        'Cannot reach the campus server. Check that the backend is running and the phone is on the same network.',
      );
    } on http.ClientException {
      throw const ApiException(
        'Cannot reach the campus server. Check that the backend is running and the phone is on the same network.',
      );
    } on FormatException {
      throw const ApiException(
          'The campus server returned an invalid response.');
    }
  }
}

Map<String, dynamic> _map(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return <String, dynamic>{};
}
