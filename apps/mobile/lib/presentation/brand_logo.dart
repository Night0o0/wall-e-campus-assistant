import 'package:flutter/material.dart';

class LeornianLogo extends StatelessWidget {
  const LeornianLogo({required this.size, super.key});

  static const assetPath = 'assets/branding/leornian-icon.png';

  final double size;

  @override
  Widget build(BuildContext context) => Image.asset(
        assetPath,
        width: size,
        height: size,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
      );
}
