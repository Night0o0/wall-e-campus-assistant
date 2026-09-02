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

  Future<AuthSession?> restoreSession();

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
      final response = await Supabase.instance.client.auth.signInWithPassword(
        email: normalized,
        password: password,
      );
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
      final request = http.Request(method, uri);
      request.headers[HttpHeaders.contentTypeHeader] =
          ContentType.json.mimeType;
      request.headers[HttpHeaders.acceptHeader] = ContentType.json.mimeType;
      request.headers['X-Client-Platform'] = 'mobile';
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
