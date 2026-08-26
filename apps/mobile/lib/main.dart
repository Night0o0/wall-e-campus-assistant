import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_theme.dart';
import 'data/campus_api.dart';
import 'presentation/login_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (CampusApi.supabaseConfigured) {
    await Supabase.initialize(
      url: CampusApi.supabaseUrl,
      anonKey: CampusApi.supabasePublishableKey,
    );
  }
  runApp(const WallEApp());
}

class WallEApp extends StatelessWidget {
  const WallEApp({this.api, super.key});

  final CampusGateway? api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Leornian',
      theme: AppTheme.light,
      home: LoginPage(api: api ?? CampusApi()),
    );
  }
}
