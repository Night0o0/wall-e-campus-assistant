import 'package:flutter/material.dart';

import 'core/app_theme.dart';
import 'data/campus_api.dart';
import 'presentation/login_page.dart';

void main() {
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
