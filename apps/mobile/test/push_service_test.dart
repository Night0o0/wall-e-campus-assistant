import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/data/push_service.dart';

import 'helpers/fake_campus_api.dart';

/// Push orchestration, exercised entirely through fakes — no Firebase, no
/// network. Covers permission (accepted/denied/once), token
/// registration/refresh/logout, foreground presentation, and tap routing.

class _FakeMessaging implements PushMessaging {
  _FakeMessaging({
    this.status = PushAuthorization.notDetermined,
    this.requestResult = PushAuthorization.granted,
    this.initial,
  });

  PushAuthorization status;
  PushAuthorization requestResult;
  String? token = 'token-1';
  PushEnvelope? initial;

  int requestCount = 0;
  int deleteCount = 0;
  int settingsCount = 0;

  final refresh = StreamController<String>.broadcast();
  final foreground = StreamController<PushEnvelope>.broadcast();
  final opened = StreamController<PushEnvelope>.broadcast();

  @override
  Future<PushAuthorization> currentStatus() async => status;

  @override
  Future<PushAuthorization> requestPermission() async {
    requestCount++;
    return status = requestResult;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Future<void> deleteToken() async {
    deleteCount++;
  }

  @override
  Stream<String> get onTokenRefresh => refresh.stream;

  @override
  Stream<PushEnvelope> get onForegroundMessage => foreground.stream;

  @override
  Stream<PushEnvelope> get onMessageOpenedApp => opened.stream;

  @override
  Future<PushEnvelope?> initialMessage() async => initial;

  @override
  Future<void> openNotificationSettings() async {
    settingsCount++;
  }
}

class _FakePresenter implements PushLocalPresenter {
  int ensureCount = 0;
  final shown = <PushEnvelope>[];

  @override
  Future<void> ensureChannel() async {
    ensureCount++;
  }

  @override
  Future<void> show(PushEnvelope envelope) async {
    shown.add(envelope);
  }
}

class _FakePromptStore implements PushPromptStore {
  _FakePromptStore({this.requested = false});
  bool requested;

  @override
  Future<bool> hasRequested() async => requested;

  @override
  Future<void> markRequested() async {
    requested = true;
  }
}

class _RecordingApi extends FakeCampusApi {
  final posts = <(String, Map<String, dynamic>?)>[];
  final patches = <(String, Map<String, dynamic>?)>[];

  @override
  Future<Map<String, dynamic>> post(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async {
    posts.add((path, body));
    return {};
  }

  @override
  Future<Map<String, dynamic>> patch(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async {
    patches.add((path, body));
    return {};
  }
}

const _session = AuthSession(
  token: 't',
  id: 'student-1',
  name: 'Ali',
  identifier: 'ali@campus.edu',
  organizationId: 'org-1',
);

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  group('parsePushRoute', () {
    test('routes each notification type to its destination', () {
      expect(parsePushRoute({'type': 'ACCOUNT_APPROVED'}).destination,
          PushDestination.home);
      expect(parsePushRoute({'type': 'COURSE_MATERIAL_PUBLISHED'}).destination,
          PushDestination.materials);
      expect(parsePushRoute({'type': 'SCHEDULE_UPDATED'}).destination,
          PushDestination.timetable);
      expect(parsePushRoute({'type': 'LECTURE_STUDENT_10M'}).destination,
          PushDestination.timetable);
      expect(parsePushRoute({'type': 'ASSIGNMENT_PUBLISHED'}).destination,
          PushDestination.assignments);
    });

    test('falls back to the coarse route hint, then to other', () {
      expect(parsePushRoute({'route': 'materials'}).destination,
          PushDestination.materials);
      expect(parsePushRoute({'type': 'SOMETHING_NEW'}).destination,
          PushDestination.other);
      expect(parsePushRoute(const {}).destination, PushDestination.other);
    });
  });

  group('PushService.start', () {
    test('explains once, then registers the token when permission is granted',
        () async {
      final messaging = _FakeMessaging();
      final api = _RecordingApi();
      var explained = 0;
      final service = PushService(
        messaging: messaging,
        presenter: _FakePresenter(),
        promptStore: _FakePromptStore(),
        api: api,
      );

      final outcome = await service.start(
        session: _session,
        explain: () async {
          explained++;
          return true;
        },
      );

      expect(explained, 1);
      expect(messaging.requestCount, 1);
      expect(outcome.authorization, PushAuthorization.granted);
      expect(outcome.registered, isTrue);
      expect(api.posts, hasLength(1));
      expect(api.posts.first.$1, '/notifications/device-tokens');
      expect(api.posts.first.$2, {'token': 'token-1', 'platform': 'ANDROID'});
    });

    test('does not register and remembers the ask when permission is denied',
        () async {
      final messaging = _FakeMessaging(requestResult: PushAuthorization.denied);
      final api = _RecordingApi();
      final store = _FakePromptStore();
      final service = PushService(
        messaging: messaging,
        presenter: _FakePresenter(),
        promptStore: store,
        api: api,
      );

      final outcome = await service.start(
        session: _session,
        explain: () async => true,
      );

      expect(outcome.denied, isTrue);
      expect(outcome.registered, isFalse);
      expect(api.posts, isEmpty);
      expect(store.requested, isTrue); // will not be asked again
    });

    test('never prompts twice: a prior ask skips the explanation', () async {
      final messaging = _FakeMessaging();
      var explained = 0;
      final service = PushService(
        messaging: messaging,
        presenter: _FakePresenter(),
        promptStore: _FakePromptStore(requested: true),
        api: _RecordingApi(),
      );

      await service.start(
          session: _session,
          explain: () async {
            explained++;
            return true;
          });

      expect(explained, 0);
      expect(messaging.requestCount, 0);
    });

    test('registers without prompting when the OS already granted', () async {
      final messaging = _FakeMessaging(status: PushAuthorization.granted);
      final api = _RecordingApi();
      var explained = 0;

      await PushService(
        messaging: messaging,
        presenter: _FakePresenter(),
        promptStore: _FakePromptStore(),
        api: api,
      ).start(
          session: _session,
          explain: () async {
            explained++;
            return true;
          });

      expect(explained, 0);
      expect(api.posts, hasLength(1));
    });
  });

  group('running push', () {
    Future<
        (
          PushService,
          _FakeMessaging,
          _FakePresenter,
          _RecordingApi,
          List<PushRoute>
        )> started({PushEnvelope? initial}) async {
      final messaging =
          _FakeMessaging(status: PushAuthorization.granted, initial: initial);
      final presenter = _FakePresenter();
      final api = _RecordingApi();
      final routes = <PushRoute>[];
      final service = PushService(
        messaging: messaging,
        presenter: presenter,
        promptStore: _FakePromptStore(requested: true),
        api: api,
      );
      await service.start(
        session: _session,
        explain: () async => true,
        onRoute: routes.add,
      );
      return (service, messaging, presenter, api, routes);
    }

    test('re-registers the token on refresh', () async {
      final (_, messaging, _, api, _) = await started();
      expect(api.posts, hasLength(1));

      messaging.refresh.add('token-2');
      await _settle();

      expect(api.posts, hasLength(2));
      expect(api.posts.last.$2, {'token': 'token-2', 'platform': 'ANDROID'});
    });

    test('shows a foreground message on the local channel', () async {
      final (_, messaging, presenter, _, _) = await started();

      messaging.foreground.add(const PushEnvelope(
        title: 'New course material',
        body: 'Lectures for CS201',
        data: {'type': 'COURSE_MATERIAL_PUBLISHED'},
      ));
      await _settle();

      expect(presenter.ensureCount, greaterThanOrEqualTo(1));
      expect(presenter.shown, hasLength(1));
      expect(presenter.shown.first.title, 'New course material');
    });

    test('routes a background tap to its destination', () async {
      final (_, messaging, _, _, routes) = await started();

      messaging.opened.add(const PushEnvelope(
        data: {'type': 'SCHEDULE_UPDATED'},
      ));
      await _settle();

      expect(routes, hasLength(1));
      expect(routes.first.destination, PushDestination.timetable);
    });

    test('routes the terminated-launch tap from the initial message', () async {
      final (_, _, _, _, routes) = await started(
        initial: const PushEnvelope(data: {'type': 'ACCOUNT_APPROVED'}),
      );

      expect(routes, hasLength(1));
      expect(routes.first.destination, PushDestination.home);
    });

    test('logout deactivates the token, deletes it, and stops listening',
        () async {
      final (service, messaging, _, api, _) = await started();

      await service.stop();

      expect(api.patches, hasLength(1));
      expect(api.patches.first.$1, '/notifications/device-tokens/deactivate');
      expect(api.patches.first.$2, {'token': 'token-1'});
      expect(messaging.deleteCount, 1);

      // After stop, a refresh no longer registers anything.
      messaging.refresh.add('token-3');
      await _settle();
      expect(api.posts, hasLength(1));
    });
  });
}
