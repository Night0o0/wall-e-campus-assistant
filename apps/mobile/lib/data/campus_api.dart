import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/account_role.dart';

/// A signed-in human or robot principal. Robot tokens are intentionally kept
/// separate from user tokens by the backend; [isDevice] selects the matching
/// API surface.
class AuthSession {
  const AuthSession({
    required this.token,
    required this.role,
    required this.id,
    required this.name,
    required this.identifier,
    required this.organizationId,
    required this.isDevice,
    this.isVerified = true,
  });

  final String token;
  final AccountRole role;
  final String id;
  final String name;
  final String identifier;
  final String organizationId;
  final bool isDevice;
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

abstract class CampusGateway {
  Future<AuthSession> login(String identifier, String password);

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

  static String get _defaultBaseUrl {
    if (_configuredBaseUrl.isNotEmpty) return _configuredBaseUrl;
    return Platform.isAndroid
        ? 'http://10.0.2.2:5000/api'
        : 'http://localhost:5000/api';
  }

  final String baseUrl;
  final HttpClient _client;

  @override
  Future<AuthSession> login(String identifier, String password) async {
    final normalized = identifier.trim().toLowerCase();

    try {
      final response = await _send(
        'POST',
        '/auth/mobile-login',
        body: {'email': normalized, 'password': password},
      );
      final user = _map(response['user']);
      final role = AccountRoleDetails.fromApi(user['role']?.toString());

      if (role == null) {
        throw const ApiException(
            'This account type cannot use the mobile app.');
      }

      return AuthSession(
        token: response['token'] as String,
        role: role,
        id: user['id']?.toString() ?? '',
        name: user['fullName']?.toString() ?? role.label,
        identifier: user['email']?.toString() ?? normalized,
        organizationId: user['organizationId']?.toString() ?? '',
        isDevice: false,
        isVerified: user['isVerified'] == true,
      );
    } on ApiException catch (error) {
      // A web-only account is a valid human login with an explicit product
      // policy response. Never reinterpret it as a robot credential.
      if (error.code == 'WEB_ONLY_ACCOUNT') rethrow;
      if (error.statusCode != 401) rethrow;
    }

    // Robot accounts are device principals. The email-shaped device key and
    // password are exchanged on the isolated device-auth route.
    final response = await _send(
      'POST',
      '/devices/auth',
      body: {'deviceKeyId': normalized, 'deviceSecret': password},
    );
    final device = _map(response['device']);

    return AuthSession(
      token: response['token'] as String,
      role: AccountRole.robot,
      id: device['id']?.toString() ?? '',
      name: device['name']?.toString() ?? 'WALL-E Robot',
      identifier: normalized,
      organizationId: device['organizationId']?.toString() ?? '',
      isDevice: true,
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
    await _send(
      'POST',
      '/auth/forgot-password',
      body: {'email': email.trim().toLowerCase()},
    );
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
