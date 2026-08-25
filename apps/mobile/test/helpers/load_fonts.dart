import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Loads the app's real Outfit font into the test binding.
///
/// Widget tests otherwise render every glyph in a fallback test font whose
/// metrics are nothing like Outfit's. That matters for two things this suite
/// cares about:
///
///   * overflow measurements - a 13px overflow in the fallback font is not
///     evidence of a 13px overflow on a device, in either direction;
///   * goldens - they are more useful when they look like the app.
///
/// Called from tests that measure or capture layout, so what they report is
/// what a user would actually see.
Future<void> loadAppFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  final file = File('assets/fonts/Outfit-Variable.ttf');
  if (!file.existsSync()) return;

  final bytes = file.readAsBytesSync();
  final loader = FontLoader('Outfit')
    ..addFont(Future.value(ByteData.view(bytes.buffer)));
  await loader.load();
}
