import 'dart:async';

import 'package:flutter/foundation.dart';

import 'campus_api.dart';

/// Firebase Cloud Messaging, wired to the campus backend.
///
/// The push layer is a thin, testable orchestrator over four seams — the
/// messaging SDK, a local-notification presenter, a "have we asked yet?" store,
/// and the campus API — so every rule below can be exercised without touching
/// Firebase or the network:
///
///   * Permission is requested at most once. A denial is remembered and the
///     student is never nagged again; the in-app inbox keeps working either way.
///   * The FCM token is registered with the backend after login, re-registered
///     on refresh, and deactivated on logout.
///   * Foreground messages are shown through a high-priority local channel;
///     background/terminated taps are routed to the right authenticated page.
///
/// None of this is the source of truth: the database notification/outbox is,
/// and the inbox reads it directly. Push is an extra channel, so when Firebase
/// is absent or permission is denied the app is fully functional.

/// Where a notification tap should take the student.
enum PushDestination { home, timetable, materials, assignments, other }

/// A resolved deep-link target parsed from a message's data payload.
@immutable
class PushRoute {
  const PushRoute(this.destination, this.type);

  final PushDestination destination;
  final String type;
}

/// The parts of an FCM message the app cares about, provider-agnostic.
@immutable
class PushEnvelope {
  const PushEnvelope({this.title, this.body, this.data = const {}});

  final String? title;
  final String? body;
  final Map<String, dynamic> data;
}

/// Notification permission as the OS reports it.
enum PushAuthorization { granted, denied, notDetermined }

/// The messaging SDK seam. The real implementation wraps FirebaseMessaging; the
/// tests provide a fake, so no test ever reaches Firebase or the network.
abstract class PushMessaging {
  Future<PushAuthorization> currentStatus();

  /// Triggers the OS permission prompt (POST_NOTIFICATIONS on Android 13+ via
  /// the Firebase/Android flow). Returns the resulting authorization.
  Future<PushAuthorization> requestPermission();

  Future<String?> getToken();
  Future<void> deleteToken();

  Stream<String> get onTokenRefresh;

  /// Messages delivered while the app is in the foreground.
  Stream<PushEnvelope> get onForegroundMessage;

  /// A tap on a system notification that opened the app from the background.
  Stream<PushEnvelope> get onMessageOpenedApp;

  /// The tap that launched the app from a terminated state, if any.
  Future<PushEnvelope?> initialMessage();

  /// Opens the OS notification settings for this app, so a student who denied
  /// permission can turn it back on without reinstalling.
  Future<void> openNotificationSettings();
}

/// Shows a message as a local notification on a high-priority channel while the
/// app is foregrounded (FCM does not draw a system notification itself then).
abstract class PushLocalPresenter {
  Future<void> ensureChannel();
  Future<void> show(PushEnvelope envelope);
}

/// Remembers whether we have already asked for permission, so the prompt is
/// shown at most once per install.
abstract class PushPromptStore {
  Future<bool> hasRequested();
  Future<void> markRequested();
}

/// Maps a message's `type`/`route` payload to a destination. Pure, so routing is
/// unit-tested directly. Unknown or missing types fall back to `other`, which
/// the shell treats as "just open the app".
PushRoute parsePushRoute(Map<String, dynamic> data) {
  final type = (data['type'] ?? '').toString();

  switch (type) {
    case 'ACCOUNT_APPROVED':
    case 'ACCOUNT_REJECTED':
      return PushRoute(PushDestination.home, type);
    case 'COURSE_MATERIAL_PUBLISHED':
      return PushRoute(PushDestination.materials, type);
    case 'SCHEDULE_CREATED':
    case 'SCHEDULE_UPDATED':
    case 'SCHEDULE_CANCELLED':
    case 'LECTURE_STUDENT_10M':
    case 'LECTURE_INSTRUCTOR_24H':
    case 'LECTURE_INSTRUCTOR_30M':
      return PushRoute(PushDestination.timetable, type);
    case 'ASSIGNMENT_PUBLISHED':
    case 'ASSIGNMENT_DUE_SOON':
    case 'GRADE_PUBLISHED':
      return PushRoute(PushDestination.assignments, type);
  }

  // Fall back to the coarse `route` hint the server also sends.
  switch ((data['route'] ?? '').toString()) {
    case 'materials':
      return PushRoute(PushDestination.materials, type);
    case 'timetable':
      return PushRoute(PushDestination.timetable, type);
    case 'home':
      return PushRoute(PushDestination.home, type);
  }

  return PushRoute(PushDestination.other, type);
}

/// The outcome of starting push for a session — surfaced so the UI can decide
/// whether to offer the "open settings" affordance.
@immutable
class PushStartOutcome {
  const PushStartOutcome(
      {required this.authorization, required this.registered});

  final PushAuthorization authorization;
  final bool registered;

  bool get denied => authorization == PushAuthorization.denied;
}

/// A device token to send to the backend, tagged with this platform.
String pushPlatform() =>
    defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID';

class PushService {
  PushService({
    required this.messaging,
    required this.presenter,
    required this.promptStore,
    required this.api,
    this.onError,
  });

  final PushMessaging messaging;
  final PushLocalPresenter presenter;
  final PushPromptStore promptStore;
  final CampusGateway api;
  final void Function(Object error, StackTrace stack)? onError;

  final List<StreamSubscription<Object?>> _subs = [];
  AuthSession? _session;
  String? _token;
  void Function(PushRoute route)? _onRoute;

  /// Wire push for a signed-in student.
  ///
  /// [explain] shows the branded, pre-permission explanation and returns whether
  /// the student chose to continue; it is only invoked the first time, and only
  /// when the OS has not already decided. Whatever the outcome, the call is
  /// recorded so the student is not asked again.
  Future<PushStartOutcome> start({
    required AuthSession session,
    required Future<bool> Function() explain,
    void Function(PushRoute route)? onRoute,
  }) async {
    _session = session;
    _onRoute = onRoute;

    try {
      await presenter.ensureChannel();

      var status = await messaging.currentStatus();

      if (status == PushAuthorization.notDetermined &&
          !await promptStore.hasRequested()) {
        final wantsToEnable = await explain();
        await promptStore.markRequested();
        if (wantsToEnable) {
          status = await messaging.requestPermission();
        }
      }

      if (status != PushAuthorization.granted) {
        // Denied or dismissed: leave the inbox to carry notifications, and do
        // not subscribe or register. No repeat prompt — markRequested stuck.
        return PushStartOutcome(authorization: status, registered: false);
      }

      final token = await messaging.getToken();
      final registered = await _register(token);
      _listen();
      await _routeInitialMessage();

      return PushStartOutcome(
        authorization: status,
        registered: registered,
      );
    } catch (error, stack) {
      // Push is best effort. A failure here never breaks the shell or the inbox.
      onError?.call(error, stack);
      return const PushStartOutcome(
        authorization: PushAuthorization.notDetermined,
        registered: false,
      );
    }
  }

  void _listen() {
    _subs.add(messaging.onTokenRefresh.listen((token) {
      _register(token);
    }));
    _subs.add(messaging.onForegroundMessage.listen((envelope) {
      presenter.show(envelope);
    }));
    _subs.add(messaging.onMessageOpenedApp.listen(_route));
  }

  Future<void> _routeInitialMessage() async {
    final envelope = await messaging.initialMessage();
    if (envelope != null) _route(envelope);
  }

  void _route(PushEnvelope envelope) {
    _onRoute?.call(parsePushRoute(envelope.data));
  }

  Future<bool> _register(String? token) async {
    final session = _session;
    if (token == null || token.isEmpty || session == null) return false;
    _token = token;
    try {
      await api.post('/notifications/device-tokens', session, {
        'token': token,
        'platform': pushPlatform(),
      });
      return true;
    } catch (error, stack) {
      onError?.call(error, stack);
      return false;
    }
  }

  /// Called on logout: stop listening, deactivate the token on the server and
  /// drop it on the device so the next user does not inherit it.
  Future<void> stop() async {
    for (final sub in _subs) {
      await sub.cancel();
    }
    _subs.clear();

    final session = _session;
    final token = _token;
    if (session != null && token != null) {
      try {
        await api.patch('/notifications/device-tokens/deactivate', session, {
          'token': token,
        });
      } catch (error, stack) {
        onError?.call(error, stack);
      }
    }

    try {
      await messaging.deleteToken();
    } catch (error, stack) {
      onError?.call(error, stack);
    }

    _session = null;
    _token = null;
    _onRoute = null;
  }

  Future<void> openSettings() => messaging.openNotificationSettings();
}
