import 'dart:async';

import 'package:app_settings/app_settings.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'campus_api.dart';
import 'push_service.dart';

/// The Firebase-backed wiring for [PushService].
///
/// This is the ONLY file that imports firebase_messaging and
/// flutter_local_notifications for delivery. It is constructed at runtime, and
/// only after `Firebase.initializeApp` has succeeded, so a build with no
/// google-services.json simply never reaches it — the app runs, and the inbox
/// keeps working. The pure orchestration lives in [PushService], which is what
/// the tests exercise with fakes.

/// Must match the channel id the backend sets on the FCM Android payload
/// (see backend push/firebase.provider.ts ANDROID_NOTIFICATION_CHANNEL).
const String kHighPriorityChannelId = 'leornian_high_priority';
const String _channelName = 'Leornian alerts';
const String _channelDescription =
    'Account decisions, course material and timetable changes.';

PushEnvelope _envelopeFromRemote(RemoteMessage message) => PushEnvelope(
      title: message.notification?.title,
      body: message.notification?.body,
      data: message.data,
    );

PushAuthorization _authorizationFrom(AuthorizationStatus status) {
  switch (status) {
    case AuthorizationStatus.authorized:
    case AuthorizationStatus.provisional:
      return PushAuthorization.granted;
    case AuthorizationStatus.denied:
      return PushAuthorization.denied;
    case AuthorizationStatus.notDetermined:
      return PushAuthorization.notDetermined;
  }
}

class FirebasePushMessaging implements PushMessaging {
  FirebasePushMessaging(this._messaging);

  final FirebaseMessaging _messaging;

  @override
  Future<PushAuthorization> currentStatus() async {
    final settings = await _messaging.getNotificationSettings();
    return _authorizationFrom(settings.authorizationStatus);
  }

  @override
  Future<PushAuthorization> requestPermission() async {
    final settings = await _messaging.requestPermission();
    return _authorizationFrom(settings.authorizationStatus);
  }

  @override
  Future<String?> getToken() => _messaging.getToken();

  @override
  Future<void> deleteToken() => _messaging.deleteToken();

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Stream<PushEnvelope> get onForegroundMessage =>
      FirebaseMessaging.onMessage.map(_envelopeFromRemote);

  @override
  Stream<PushEnvelope> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp.map(_envelopeFromRemote);

  @override
  Future<PushEnvelope?> initialMessage() async {
    final message = await _messaging.getInitialMessage();
    return message == null ? null : _envelopeFromRemote(message);
  }

  @override
  Future<void> openNotificationSettings() =>
      AppSettings.openAppSettings(type: AppSettingsType.notification);
}

class FlutterLocalPushPresenter implements PushLocalPresenter {
  FlutterLocalPushPresenter(this._plugin);

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;

  @override
  Future<void> ensureChannel() async {
    if (_initialized) return;

    await _plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );

    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            kHighPriorityChannelId,
            _channelName,
            description: _channelDescription,
            importance: Importance.high,
          ),
        );

    _initialized = true;
  }

  @override
  Future<void> show(PushEnvelope envelope) async {
    final title = envelope.title ?? 'Leornian';
    final body = envelope.body ?? '';

    await _plugin.show(
      // A stable-ish id from the payload keeps repeats from stacking endlessly.
      envelope.data['type'].hashCode & 0x7fffffff,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          kHighPriorityChannelId,
          _channelName,
          channelDescription: _channelDescription,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }
}

class SecureStoragePushPromptStore implements PushPromptStore {
  const SecureStoragePushPromptStore(this._storage);

  final FlutterSecureStorage _storage;
  static const _key = 'leornian.pushPermissionRequested';

  @override
  Future<bool> hasRequested() async =>
      (await _storage.read(key: _key)) == 'true';

  @override
  Future<void> markRequested() => _storage.write(key: _key, value: 'true');
}

/// Handles a data/notification message that arrives while the app is in the
/// background or terminated. Must be a top-level function.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // The system tray shows the notification itself for background messages; the
  // record already exists in the backend outbox, so there is nothing to do here
  // beyond ensuring Firebase is initialized for this isolate.
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
  } catch (_) {
    // No config in this isolate: nothing to do, the in-app inbox still has it.
  }
}

/// Builds a [PushService] backed by Firebase, or returns null when Firebase is
/// not configured on this build/device (no google-services.json). Callers treat
/// null as "push unavailable" and carry on with the in-app inbox.
Future<PushService?> createFirebasePushService(CampusGateway api) async {
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }

    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

    return PushService(
      messaging: FirebasePushMessaging(FirebaseMessaging.instance),
      presenter: FlutterLocalPushPresenter(FlutterLocalNotificationsPlugin()),
      promptStore: const SecureStoragePushPromptStore(FlutterSecureStorage()),
      api: api,
      onError: (error, stack) => debugPrint('[push] non-fatal: $error'),
    );
  } catch (error) {
    // Firebase is not set up for this build — implement-what-is-safe: the app
    // runs without push. See docs/ANDROID_BETA_DISTRIBUTION and the PR notes
    // for the google-services.json / firebase_options.dart steps.
    debugPrint('[push] Firebase unavailable, push disabled: $error');
    return null;
  }
}
