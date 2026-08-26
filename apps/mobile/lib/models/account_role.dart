import 'package:flutter/material.dart';

enum AccountRole { universityAdmin, departmentAdmin, instructor, student }

extension AccountRoleDetails on AccountRole {
  static AccountRole? fromApi(String? role) => switch (role) {
        'UNIVERSITY_ADMIN' => AccountRole.universityAdmin,
        'DEPARTMENT_ADMIN' => AccountRole.departmentAdmin,
        'INSTRUCTOR' => AccountRole.instructor,
        'STUDENT' => AccountRole.student,
        _ => null,
      };

  String get label => switch (this) {
        AccountRole.universityAdmin => 'University Admin',
        AccountRole.departmentAdmin => 'Department Admin',
        AccountRole.instructor => 'Instructor',
        AccountRole.student => 'Student',
      };

  String get description => switch (this) {
        AccountRole.universityAdmin => 'University operations and oversight',
        AccountRole.departmentAdmin => 'Department students, staff and courses',
        AccountRole.instructor => 'Teaching, sessions and attendance',
        AccountRole.student => 'Classes, materials and attendance',
      };

  IconData get icon => switch (this) {
        AccountRole.universityAdmin => Icons.admin_panel_settings_rounded,
        AccountRole.departmentAdmin => Icons.account_tree_rounded,
        AccountRole.instructor => Icons.school_rounded,
        AccountRole.student => Icons.person_rounded,
      };

  String get demoName => switch (this) {
        AccountRole.universityAdmin => 'Dr. Salma Hassan',
        AccountRole.departmentAdmin => 'Dr. Mona Adel',
        AccountRole.instructor => 'Dr. Omar Adel',
        AccountRole.student => 'Ali Mahmoud',
      };

  String get demoEmail => switch (this) {
        AccountRole.universityAdmin => 'university-admin@campus.edu',
        AccountRole.departmentAdmin => 'department-admin@campus.edu',
        AccountRole.instructor => 'instructor@campus.edu',
        AccountRole.student => 'student@campus.edu',
      };
}
