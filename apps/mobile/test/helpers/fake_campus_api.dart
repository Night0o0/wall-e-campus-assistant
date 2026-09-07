// Shared test double for the campus backend.
//
// Extracted from wall_e_app_test.dart so the behavioural tests and the
// golden visual baseline render from exactly the same data. If these two
// drifted apart, a golden could pass against data no behavioural test ever
// exercises, which would make the visual baseline meaningless.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';

class FakeCampusApi implements CampusGateway {
  FakeCampusApi({
    this.restoredSession,
    this.restoreError,
    this.registrationNeedsOtp = false,
  });

  String? changedPassword;
  String? recoveredPassword;
  bool didLogout = false;
  AuthSession? restoredSession;
  ApiException? restoreError;
  final bool registrationNeedsOtp;
  String? verifiedRegistrationEmail;
  String? verifiedRegistrationCode;
  int registrationOtpResends = 0;
  int unreadNotifications = 1;

  @override
  Future<List<RegistrationOption>> getRegistrationOptions(
    String organizationCode,
  ) async {
    if (organizationCode.trim().toUpperCase() != 'NCTU') return const [];
    return const [
      RegistrationOption(
        cohortId: '14f02be0-0b00-4c5f-9dcf-f0f6737de001',
        cohortName: 'Mechatronics L2 — A',
        faculty: 'Faculty of Engineering',
        department: 'Mechatronics',
        level: 2,
        semesterLabel: 'First Semester',
        section: 'A',
        groupName: '',
        academicYear: '2026/2027',
      ),
    ];
  }

  @override
  Future<void> logout() async {
    didLogout = true;
  }

  @override
  Future<AuthSession?> restoreSession() async {
    if (restoreError != null) throw restoreError!;
    return restoredSession;
  }

  @override
  Future<AuthSession> login(String identifier, String password) async {
    if (identifier.contains('owner') ||
        identifier.contains('super') ||
        identifier.contains('department') ||
        identifier.contains('admin') ||
        identifier.contains('instructor')) {
      throw const ApiException(
        'Only student accounts can use the mobile app. Staff sign in on the web console.',
        statusCode: 403,
        code: 'WEB_ONLY_ACCOUNT',
      );
    }

    return AuthSession(
      token: 'test-token',
      id: 'test-id',
      name: 'Ali Mahmoud',
      identifier: identifier,
      organizationId: 'org-1',
    );
  }

  @override
  Future<RegistrationResult> registerStudent({
    required String organizationCode,
    required String universityId,
    required String fullName,
    required String email,
    required String password,
    required String cohortId,
    required String phoneNumber,
    required String nationalId,
    required String dateOfBirth,
  }) async {
    return RegistrationResult(
      emailConfirmationRequired: registrationNeedsOtp,
    );
  }

  @override
  Future<void> verifyStudentRegistration({
    required String email,
    required String code,
  }) async {
    verifiedRegistrationEmail = email;
    verifiedRegistrationCode = code;
  }

  @override
  Future<void> resendStudentRegistrationOtp(String email) async {
    registrationOtpResends += 1;
  }

  @override
  Future<Map<String, dynamic>> get(
    String path,
    AuthSession session, {
    Map<String, String>? query,
  }) async {
    if (path.contains('schedule')) {
      return {
        'criteria': {
          'faculty': 'Faculty of Engineering',
          'department': 'Mechatronics',
          'level': 2,
          'semesterLabel': 'First Semester',
          'section': 'A',
        },
        'count': 2,
        'schedules': [
          {
            'id': 'schedule-1',
            'dayOfWeek': 'MONDAY',
            'startTime': '09:00',
            'endTime': '10:30',
            'room': 'B-204',
            'course': {
              'id': 'course-1',
              'courseCode': 'MEC201',
              'courseName': 'Electronics'
            },
            'instructor': {
              'id': 'admin-1',
              'fullName': 'Adel Mansour',
              'jobTitle': 'Associate Professor'
            },
          },
          {
            'id': 'schedule-2',
            'dayOfWeek': 'MONDAY',
            'startTime': '11:00',
            'endTime': '12:30',
            'room': 'C-101',
            'course': {
              'id': 'course-2',
              'courseCode': 'MEC202',
              'courseName': 'Control Systems'
            },
            'instructor': {
              'id': 'admin-2',
              'fullName': 'Hana Zaki',
              'jobTitle': 'Lecturer'
            },
          },
        ],
      };
    }
    if (path == '/attendance/summary') {
      return {
        'overall': {
          'present': 7,
          'late': 1,
          'absent': 1,
          'attended': 8,
          'recordedLectures': 9,
          'attendanceRate': 88.9,
        },
        'courses': [
          {
            'course': {'courseCode': 'MEC201', 'courseName': 'Electronics'},
            'present': 4,
            'late': 1,
            'absent': 1,
            'attended': 5,
            'recordedLectures': 6,
            'attendanceRate': 83.3,
          },
        ],
      };
    }
    if (path == '/attendance/history') {
      return {
        'data': [
          {
            'status': 'PRESENT',
            'scanTime': '2026-08-18T09:01:00.000Z',
            'session': {
              'title': 'Electronics attendance',
              'startTime': '2026-08-18T09:00:00.000Z',
              'course': {'courseCode': 'MEC201', 'courseName': 'Electronics'},
            },
          },
        ],
      };
    }
    if (path == '/materials/my') {
      return {
        'courses': [
          {
            'course': {'courseCode': 'MEC201', 'courseName': 'Electronics'},
            'materials': [
              {
                'title': 'Electronics lecture slides',
                'createdAt': '2026-08-18T09:00:00.000Z',
                'driveUrl': 'https://drive.google.com/drive/folders/demo-one',
              },
              {
                'title': 'Electronics lab sheets',
                'createdAt': '2026-08-17T09:00:00.000Z',
                'driveUrl': 'https://drive.google.com/drive/folders/demo-two',
              },
            ],
          },
        ],
      };
    }
    if (path == '/notifications') {
      return {
        'data': [
          {
            'id': 'notice-1',
            'title': 'Welcome to Leornian',
            'body': 'Your campus pages are ready.',
            'type': 'ACCOUNT_NOTICE',
            'isRead': unreadNotifications == 0,
            'createdAt': '2026-08-18T09:00:00.000Z',
          }
        ],
        'unreadCount': unreadNotifications,
      };
    }
    if (path == '/notifications/unread-count') {
      return {'unreadCount': unreadNotifications};
    }
    if (path == '/auth/profile') {
      return {
        'user': {
          'fullName': session.name,
          'email': session.identifier,
          'universityId': 'NCTU-DEMO-A1',
        }
      };
    }
    if (path == '/students/me/profile') {
      return {
        'profile': {
          'faculty': 'Faculty of Engineering',
          'department': 'Mechatronics',
          'level': 2,
          'semester': 'First Semester',
          'section': 'A',
          'status': 'COMPLETED',
        }
      };
    }
    return {'data': []};
  }

  @override
  Future<Map<String, dynamic>> patch(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async {
    if (path == '/notifications/read-all' || path.endsWith('/read')) {
      unreadNotifications = 0;
    }
    return {};
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async {
    return {};
  }

  @override
  Future<void> requestPasswordReset(String email) async {}

  @override
  Future<void> changePassword({
    required String email,
    required String currentPassword,
    required String newPassword,
  }) async {
    changedPassword = newPassword;
  }

  @override
  Future<void> finishPasswordRecovery(String newPassword) async {
    recoveredPassword = newPassword;
  }
}

Future<void> signIn(WidgetTester tester, String email) async {
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const ValueKey('login-email')), email);
  await tester.enterText(
    find.byKey(const ValueKey('login-password')),
    'Password@123',
  );
  await tester.tap(find.text('Sign In').last);
  await tester.pumpAndSettle();
}
