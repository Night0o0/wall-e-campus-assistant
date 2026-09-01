import 'package:flutter/material.dart';

/// Visual tokens sampled from the supplied Figma Make render.
abstract final class AppColors {
  static const navy = Color(0xFF080C18);
  static const navySoft = Color(0xFF111827);
  static const panel = Color(0xFF0A0E1C);
  static const input = Color(0xFF1B2232);
  static const blue = Color(0xFF4F8EF7);
  static const violet = Color(0xFF6366F1);
  static const cyan = Color(0xFF6BA7FF);
  static const orange = Color(0xFF8B7CF6);
  static const orangeSoft = Color(0xFF252C4B);
  static const canvas = Color(0xFF080C18);
  static const surface = Color(0xFF111827);
  static const ink = Color(0xFFF0F4FF);
  static const muted = Color(0xFF8B95A8);
  static const line = Color(0xFF222B42);
  static const success = Color(0xFF3DD6A4);
  static const danger = Color(0xFFFF6B8A);
  static const warning = Color(0xFFF4B860);

  static const primaryGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [blue, violet],
  );

  static const backgroundGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0B1428), Color(0xFF080C18), Color(0xFF080C18)],
  );
}

abstract final class AppTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.blue,
      brightness: Brightness.dark,
      primary: AppColors.blue,
      secondary: AppColors.violet,
      surface: AppColors.surface,
      error: AppColors.danger,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.canvas,
      canvasColor: AppColors.canvas,
      fontFamily: 'Outfit',
      textTheme: const TextTheme(
        displaySmall: TextStyle(
          color: AppColors.ink,
          fontSize: 32,
          height: 1.12,
          fontWeight: FontWeight.w700,
          letterSpacing: -.8,
        ),
        headlineLarge: TextStyle(
          color: AppColors.ink,
          fontSize: 27,
          height: 1.18,
          fontWeight: FontWeight.w700,
          letterSpacing: -.55,
        ),
        headlineMedium: TextStyle(
          color: AppColors.ink,
          fontSize: 21,
          height: 1.2,
          fontWeight: FontWeight.w700,
        ),
        titleLarge: TextStyle(
          color: AppColors.ink,
          fontSize: 17,
          fontWeight: FontWeight.w600,
        ),
        titleMedium: TextStyle(
          color: AppColors.ink,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: TextStyle(
          color: AppColors.ink,
          fontSize: 15,
          height: 1.45,
        ),
        bodyMedium: TextStyle(
          color: AppColors.muted,
          fontSize: 13,
          height: 1.45,
        ),
        labelLarge: TextStyle(
          color: AppColors.ink,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.ink,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardTheme(
        elevation: 0,
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.blue,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size(0, 46),
          side: const BorderSide(color: AppColors.line),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.cyan),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.input,
        labelStyle: const TextStyle(color: AppColors.muted, fontSize: 12),
        floatingLabelStyle:
            const TextStyle(color: AppColors.cyan, fontSize: 12),
        hintStyle: const TextStyle(color: AppColors.muted, fontSize: 13),
        prefixIconColor: AppColors.muted,
        suffixIconColor: AppColors.muted,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 15, vertical: 15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.blue, width: 1.25),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.panel,
        selectedColor: AppColors.orangeSoft,
        disabledColor: AppColors.panel,
        side: const BorderSide(color: AppColors.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
        labelStyle: const TextStyle(
          color: AppColors.muted,
          fontFamily: 'Outfit',
          fontSize: 11,
        ),
        secondaryLabelStyle: const TextStyle(
          color: AppColors.ink,
          fontFamily: 'Outfit',
          fontSize: 11,
        ),
        iconTheme: const IconThemeData(color: AppColors.muted, size: 17),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),
      dividerColor: AppColors.line,
      dividerTheme: const DividerThemeData(color: AppColors.line, thickness: 1),
      navigationBarTheme: const NavigationBarThemeData(
        elevation: 0,
        height: 68,
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.orangeSoft,
        surfaceTintColor: Colors.transparent,
        iconTheme:
            WidgetStatePropertyAll(IconThemeData(color: AppColors.muted)),
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(
              color: AppColors.muted,
              fontSize: 10,
              fontWeight: FontWeight.w600),
        ),
      ),
      drawerTheme: const DrawerThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
      ),
      iconTheme: const IconThemeData(color: AppColors.muted),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.input,
        contentTextStyle: const TextStyle(color: AppColors.ink),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}
