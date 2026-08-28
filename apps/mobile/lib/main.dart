import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_theme.dart';
import 'data/campus_api.dart';
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
  runApp(const WallEApp());
}

class WallEApp extends StatefulWidget {
  const WallEApp({this.api, super.key});

  final CampusGateway? api;

  @override
  State<WallEApp> createState() => _WallEAppState();
}

class _WallEAppState extends State<WallEApp> {
  final navigatorKey = GlobalKey<NavigatorState>();
  StreamSubscription<AuthState>? authSubscription;
  late final CampusGateway api = widget.api ?? CampusApi();
  bool recoveryOpen = false;

  @override
  void initState() {
    super.initState();
    if (CampusApi.supabaseConfigured) {
      authSubscription = Supabase.instance.client.auth.onAuthStateChange.listen(
        (state) {
          if (state.event != AuthChangeEvent.passwordRecovery || recoveryOpen) {
            return;
          }
          recoveryOpen = true;
          final navigator = navigatorKey.currentState;
          if (navigator == null) {
            recoveryOpen = false;
            return;
          }
          navigator
              .push(MaterialPageRoute<void>(
                  builder: (_) => PasswordRecoveryPage(api: api)))
              .whenComplete(() => recoveryOpen = false);
        },
      );
    }
  }

  @override
  void dispose() {
    authSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Leornian',
      theme: AppTheme.light,
      home: LoginPage(api: api),
    );
  }
}
