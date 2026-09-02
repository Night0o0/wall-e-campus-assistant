import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/models/account_role.dart';

const _session = AuthSession(
  token: 'test-token',
  role: AccountRole.student,
  id: 'student-1',
  name: 'Test Student',
  identifier: 'student@example.edu',
  organizationId: 'org-1',
);

void main() {
  test('connected requests carry mobile identity and authorization headers',
      () async {
    final client = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.toString(),
          'https://campus.example/api/notifications?page=2');
      expect(request.headers['x-client-platform'], 'mobile');
      expect(request.headers['authorization'], 'Bearer test-token');

      return http.Response(jsonEncode({'data': <Object>[]}), 200,
          headers: {'content-type': 'application/json'});
    });
    final api =
        CampusApi(baseUrl: 'https://campus.example/api', client: client);

    final response =
        await api.get('/notifications', _session, query: {'page': '2'});

    expect(response['data'], isEmpty);
  });

  test('backend errors retain their status, code, and validation details',
      () async {
    final client = MockClient((_) async => http.Response(
          jsonEncode({
            'message': 'Validation failed',
            'code': 'VALIDATION_ERROR',
            'errors': {'room': 'Room is required'},
          }),
          400,
          headers: {'content-type': 'application/json'},
        ));
    final api =
        CampusApi(baseUrl: 'https://campus.example/api', client: client);

    await expectLater(
      api.post('/sessions', _session, const {}),
      throwsA(isA<ApiException>()
          .having((error) => error.statusCode, 'statusCode', 400)
          .having((error) => error.code, 'code', 'VALIDATION_ERROR')
          .having((error) => error.details, 'details',
              {'room': 'Room is required'})),
    );
  });

  test('transport failures become a retryable campus-server message', () async {
    final client = MockClient((request) async {
      throw http.ClientException('offline', request.url);
    });
    final api =
        CampusApi(baseUrl: 'https://campus.example/api', client: client);

    await expectLater(
      api.get('/notifications', _session),
      throwsA(isA<ApiException>().having(
        (error) => error.message,
        'message',
        contains('Cannot reach the campus server'),
      )),
    );
  });
}
