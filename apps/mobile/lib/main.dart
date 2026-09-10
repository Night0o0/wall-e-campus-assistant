import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_theme.dart';
import 'data/campus_api.dart';
import 'data/push_service.dart';
import 'data/push_service_firebase.dart';
import 'presentation/app_shell.dart';
import 'presentation/login_page.dart';
import 'presentation/password_recovery_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (CampusApi.supabaseConfigured) {
    await Supabase.initialize(
      url: CampusApi.supabaseUrl,
      publishableKey: CampusApi.supabasePublishableKey,
    );
  }
  final api = CampusApi();
  // Firebase is optional: this returns null (and push is simply disabled) on a
  // build with no google-services.json, so the app always launches.
  final pushService = await createFirebasePushService(api);
  runApp(WallEApp(api: api, pushService: pushService));
}

class WallEApp extends StatefulWidget {
  const WallEApp({this.api, this.pushService, super.key});

  final CampusGateway? api;
  final PushService? pushService;

  @override
  State<WallEApp> createState() => _WallEAppState();
}

class _WallEAppState extends State<WallEApp> {
  final navigatorKey = GlobalKey<NavigatorState>();
  StreamSubscription<AuthState>? authSubscription;
  late final CampusGateway api = widget.api ?? CampusApi();
  bool recoveryOpen = false;
  bool pendingRecoveryRoute = false;

  @override
  void initState() {
    super.initState();
    if (CampusApi.supabaseConfigured) {
      authSubscription = Supabase.instance.client.auth.onAuthStateChange.listen(
        (state) {
          if (state.event != AuthChangeEvent.passwordRecovery) {
            return;
          }
          pendingRecoveryRoute = true;
          _openRecoveryWhenReady();
        },
      );
    }
  }

  @override
  void dispose() {
    authSubscription?.cancel();
    super.dispose();
  }

  void _openRecoveryWhenReady() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || recoveryOpen || !pendingRecoveryRoute) return;

      final navigator = navigatorKey.currentState;
      if (navigator == null) {
        _openRecoveryWhenReady();
        return;
      }

      recoveryOpen = true;
      pendingRecoveryRoute = false;
      navigator
          .push(MaterialPageRoute<void>(
              builder: (_) => PasswordRecoveryPage(api: api)))
          .whenComplete(() => recoveryOpen = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Leornian',
      theme: AppTheme.light,
      home: _LaunchGate(api: api, pushService: widget.pushService),
    );
  }
}

class _LaunchGate extends StatefulWidget {
  const _LaunchGate({required this.api, this.pushService});

  final CampusGateway api;
  final PushService? pushService;

  @override
  State<_LaunchGate> createState() => _LaunchGateState();
}

class _LaunchGateState extends State<_LaunchGate> {
  late Future<AuthSession?> restoreFuture;

  @override
  void initState() {
    super.initState();
    restoreFuture = widget.api.restoreSession();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AuthSession?>(
      future: restoreFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _LaunchScreen();
        }

        if (snapshot.hasError) {
          final message = snapshot.error is ApiException
              ? (snapshot.error! as ApiException).message
              : 'Could not restore your session. Sign in again.';
          return LoginPage(api: widget.api, initialError: message);
        }

        final session = snapshot.data;
        if (session != null) {
          return AppShell(
            session: session,
            api: widget.api,
            pushService: widget.pushService,
          );
        }

        return LoginPage(api: widget.api, pushService: widget.pushService);
      },
    );
  }
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(gradient: AppColors.backgroundGradient),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 18),
                Text(
                  'Restoring your session…',
                  style: TextStyle(
                    color: AppColors.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
