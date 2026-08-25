import 'package:flutter/material.dart';

enum AccountRole { superAdmin, admin, student, robot }

extension AccountRoleDetails on AccountRole {
  static AccountRole? fromApi(String? role) => switch (role) {
        'UNIVERSITY_SUPER_ADMIN' => AccountRole.superAdmin,
        'ADMIN' => AccountRole.admin,
        'STUDENT' => AccountRole.student,
        'ROBOT' => AccountRole.robot,
        _ => null,
      };

  String get label => switch (this) {
        AccountRole.superAdmin => 'Super Admin',
        AccountRole.admin => 'Admin',
        AccountRole.student => 'Student',
        AccountRole.robot => 'Robot',
      };

  String get description => switch (this) {
        AccountRole.superAdmin => 'University operations and oversight',
        AccountRole.admin => 'Teaching, sessions and attendance',
        AccountRole.student => 'Classes, materials and attendance',
        AccountRole.robot => 'Campus display and assistance',
      };

  IconData get icon => switch (this) {
        AccountRole.superAdmin => Icons.admin_panel_settings_rounded,
        AccountRole.admin => Icons.school_rounded,
        AccountRole.student => Icons.person_rounded,
        AccountRole.robot => Icons.smart_toy_rounded,
      };

  String get demoName => switch (this) {
        AccountRole.superAdmin => 'Dr. Salma Hassan',
        AccountRole.admin => 'Dr. Omar Adel',
        AccountRole.student => 'Ali Mahmoud',
        AccountRole.robot => 'WALL-E • Hall A',
      };

  String get demoEmail => switch (this) {
        AccountRole.superAdmin => 'superadmin@campus.edu',
        AccountRole.admin => 'admin@campus.edu',
        AccountRole.student => 'student@campus.edu',
        AccountRole.robot => 'Device ID: WALLE-A01',
      };
}
