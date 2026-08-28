import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/account_role.dart';

/// A signed-in university user. Authentication comes from Supabase when it is
/// configured; the legacy endpoint remains a local migration fallback.
class AuthSession {
  const AuthSession({
    required this.token,
    required this.role,
    required this.id,
    required this.name,
    required this.identifier,
    required this.organizationId,
    this.isVerified = true,
  });

  final String token;
  final AccountRole role;
  final String id;
  final String name;
  final String identifier;
  final String organizationId;
  final bool isVerified;
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

abstract class CampusGateway {
  Future<AuthSession> login(String identifier, String password);

  Future<RegistrationResult> registerStudent({
    required String organizationCode,
    required String universityId,
    required String fullName,
    required String email,
    required String password,
  });

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
    HttpClient? client,
  })  : baseUrl = (baseUrl ?? _defaultBaseUrl).replaceFirst(RegExp(r'/$'), ''),
        _client = client ?? HttpClient();

  /// Android emulators reach the host through 10.0.2.2. A physical phone must
  /// be launched with --dart-define=API_BASE_URL=http://<computer-ip>:5000/api.
  static const _configuredBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabasePublishableKey =
      String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  static bool get supabaseConfigured =>
      supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty;

  static String get _defaultBaseUrl {
    if (_configuredBaseUrl.isNotEmpty) return _configuredBaseUrl;
    return Platform.isAndroid
        ? 'http://10.0.2.2:5000/api'
        : 'http://localhost:5000/api';
  }

  final String baseUrl;
  final HttpClient _client;
  static const _registrationStorageKey = 'leornian.pendingRegistration';
  static const _secureStorage = FlutterSecureStorage();

  @override
  Future<AuthSession> login(String identifier, String password) async {
    final normalized = identifier.trim().toLowerCase();

    if (supabaseConfigured) {
      final response = await Supabase.instance.client.auth.signInWithPassword(
        email: normalized,
        password: password,
      );
      final accessToken = response.session?.accessToken;
      if (accessToken == null) {
        throw const ApiException('Sign in did not create a session.');
      }

      await _completePendingRegistration(accessToken);

      final provisional = AuthSession(
        token: accessToken,
        role: AccountRole.student,
        id: response.user?.id ?? '',
        name: '',
        identifier: normalized,
        organizationId: '',
      );
      final profileResponse = await _send(
        'GET',
        '/auth/profile',
        session: provisional,
      );
      final user = _map(profileResponse['user']);
      final role = AccountRoleDetails.fromApi(user['role']?.toString());
      if (role == null) {
        throw const ApiException(
            'This account type cannot use the mobile app.');
      }

      return AuthSession(
        token: accessToken,
        role: role,
        id: user['id']?.toString() ?? '',
        name: user['fullName']?.toString() ?? role.label,
        identifier: user['email']?.toString() ?? normalized,
        organizationId: user['organizationId']?.toString() ?? '',
        isVerified: user['isVerified'] == true,
      );
    }

    final response = await _send(
      'POST',
      '/auth/mobile-login',
      body: {'email': normalized, 'password': password},
    );
    final user = _map(response['user']);
    final role = AccountRoleDetails.fromApi(user['role']?.toString());

    if (role == null) {
      throw const ApiException('This account type cannot use the mobile app.');
    }

    return AuthSession(
      token: response['token'] as String,
      role: role,
      id: user['id']?.toString() ?? '',
      name: user['fullName']?.toString() ?? role.label,
      identifier: user['email']?.toString() ?? normalized,
      organizationId: user['organizationId']?.toString() ?? '',
      isVerified: user['isVerified'] == true,
    );
  }

  @override
  Future<RegistrationResult> registerStudent({
    required String organizationCode,
    required String universityId,
    required String fullName,
    required String email,
    required String password,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final registration = jsonEncode({
      'organizationCode': organizationCode.trim().toUpperCase(),
      'universityId': universityId.trim(),
      'fullName': fullName.trim(),
    });

    if (!supabaseConfigured) {
      await _send('POST', '/auth/register', body: {
        ...jsonDecode(registration) as Map<String, dynamic>,
        'email': normalizedEmail,
        'password': password,
      });
      return const RegistrationResult(emailConfirmationRequired: false);
    }

    await _secureStorage.write(
      key: _registrationStorageKey,
      value: registration,
    );
    final response = await Supabase.instance.client.auth.signUp(
      email: normalizedEmail,
      password: password,
      emailRedirectTo: 'io.leornian.campus://register/complete',
      data: {
        'registration': jsonDecode(registration) as Map<String, dynamic>,
      },
    );
    final accessToken = response.session?.accessToken;
    if (accessToken != null) await _completePendingRegistration(accessToken);

    return RegistrationResult(
      emailConfirmationRequired: accessToken == null,
    );
  }

  Future<void> _completePendingRegistration(String accessToken) async {
    final raw = await _secureStorage.read(key: _registrationStorageKey);
    Map<String, dynamic>? registration;
    if (raw != null) {
      registration = jsonDecode(raw) as Map<String, dynamic>;
    } else {
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
      role: AccountRole.student,
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
        redirectTo: 'io.leornian.campus://reset-password',
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
  }) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);

    try {
      final request = await _client.openUrl(method, uri).timeout(
            const Duration(seconds: 15),
          );
      request.headers.contentType = ContentType.json;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set('X-Client-Platform', 'mobile');
      if (session != null) {
        request.headers
            .set(HttpHeaders.authorizationHeader, 'Bearer ${session.token}');
      }
      if (body != null) request.write(jsonEncode(body));

      final response =
          await request.close().timeout(const Duration(seconds: 20));
      final raw = await utf8.decoder.bind(response).join();
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
