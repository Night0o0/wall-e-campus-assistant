// Shared test double for the campus backend.
//
// Extracted from wall_e_app_test.dart so the behavioural tests and the
// golden visual baseline render from exactly the same data. If these two
// drifted apart, a golden could pass against data no behavioural test ever
// exercises, which would make the visual baseline meaningless.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/models/account_role.dart';

class FakeCampusApi implements CampusGateway {
  FakeCampusApi({this.restoredSession, this.restoreError});

  String? changedPassword;
  String? recoveredPassword;
  bool didLogout = false;
  AuthSession? restoredSession;
  ApiException? restoreError;
  int qrFetchCount = 0;
  final List<String> postPaths = [];
  final List<String> patchPaths = [];
  final List<Map<String, dynamic>> sessions = [
    {
      'id': 'session-1',
      'title': 'MEC201 - Electronics',
      'status': 'ACTIVE',
      'startTime': '2026-08-18T09:00:00.000Z',
      'room': 'B-204',
      'courseId': 'course-1',
      'course': {
        'id': 'course-1',
        'courseCode': 'MEC201',
        'courseName': 'Electronics',
      },
      'createdBy': {
        'id': 'admin-1',
        'fullName': 'Omar Adel',
      },
      '_count': {'attendances': 12},
    },
    {
      'id': 'session-2',
      'title': 'MEC202 - Control Systems',
      'status': 'CLOSED',
      'startTime': '2026-08-17T11:00:00.000Z',
      'room': 'C-101',
      'courseId': 'course-2',
      'course': {
        'id': 'course-2',
        'courseCode': 'MEC202',
        'courseName': 'Control Systems',
      },
      'createdBy': {
        'id': 'admin-1',
        'fullName': 'Omar Adel',
      },
      '_count': {'attendances': 19},
    },
  ];

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
    if (identifier == 'owner@leornian.local') {
      throw const ApiException(
        'System owner accounts are available on the web console only',
        statusCode: 403,
        code: 'WEB_ONLY_ACCOUNT',
      );
    }

    final role = identifier.contains('super')
        ? AccountRole.universityAdmin
        : identifier.contains('department')
            ? AccountRole.departmentAdmin
            : identifier.contains('admin')
                ? AccountRole.instructor
                : AccountRole.student;
    return AuthSession(
      token: 'test-token',
      role: role,
      id: 'test-id',
      name: switch (role) {
        AccountRole.universityAdmin => 'Salma Hassan',
        AccountRole.departmentAdmin => 'Mona Adel',
        AccountRole.instructor => 'Omar Adel',
        AccountRole.student => 'Ali Mahmoud',
      },
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
  }) async {
    return const RegistrationResult(emailConfirmationRequired: false);
  }

  @override
  Future<Map<String, dynamic>> get(
    String path,
    AuthSession session, {
    Map<String, String>? query,
  }) async {
    if (path == '/admin/overview') {
      return {
        'people': {'activeStudents': 12, 'staff': 3, 'incompleteProfiles': 1},
        'academics': {'courses': 4},
        'sessions': {'active': 1},
        'attendance': {'scansThisWeek': 20},
      };
    }
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
    if (path == '/courses') {
      return {
        'data': [
          {
            'id': 'course-1',
            'courseCode': 'MEC201',
            'courseName': 'Electronics',
            'credits': 3,
          }
        ]
      };
    }
    if (path == '/admin/users') {
      return {
        'data': [
          {
            'id': 'admin-1',
            'fullName': 'Adel Mansour',
            'email': 'admin@campus.edu',
            'role': 'INSTRUCTOR',
          }
        ]
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
            'isRead': false,
            'createdAt': '2026-08-18T09:00:00.000Z',
          }
        ],
        'unreadCount': 1,
      };
    }
    if (path == '/auth/profile') {
      return {
        'user': {
          'fullName': session.name,
          'email': session.identifier,
          'universityId': session.role == AccountRole.student
              ? 'NCTU-DEMO-A1'
              : 'FAC-STAFF-17',
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
    // The paginated envelope GET /sessions now returns (D-2). The Flutter
    // client needed no change for it: _send wraps a bare array as
    // {'data': ...} anyway, so _items finds the same key either way. Shaped
    // like the real response here so that stays true.
    if (path == '/sessions') {
      return {
        'data': sessions,
        'meta': {
          'page': 1,
          'limit': 50,
          'total': sessions.length,
          'totalPages': 1,
          'hasNext': false,
          'hasPrev': false,
        },
      };
    }
    if (path.startsWith('/sessions/') && path.endsWith('/qr')) {
      qrFetchCount++;
      return {
        'token': 'demo-qr-token-$qrFetchCount',
        'expiresIn': 30,
      };
    }
    if (path.startsWith('/sessions/')) {
      final id = path.split('/').last;
      return sessions.firstWhere((row) => row['id'] == id);
    }
    if (path.endsWith('/stats') && path.startsWith('/attendance/session/')) {
      return {
        'total': 12,
        'present': 10,
        'late': 2,
        'absent': 1,
        'roll': 13,
      };
    }
    if (path.startsWith('/attendance/session/')) {
      return {
        'data': [
          {
            'id': 'attendance-1',
            'status': 'PRESENT',
            'scanTime': '2026-08-18T09:03:00.000Z',
            'student': {
              'id': 'student-1',
              'fullName': 'Ali Mahmoud',
              'universityId': 'NCTU-DEMO-A1',
            },
          },
          {
            'id': 'attendance-2',
            'status': 'LATE',
            'scanTime': '2026-08-18T09:14:00.000Z',
            'student': {
              'id': 'student-2',
              'fullName': 'Sara Hany',
              'universityId': 'NCTU-DEMO-A2',
            },
          },
        ],
      };
    }
    if (path.contains('/pending')) return {'data': [], 'total': 0};
    return {'data': []};
  }

  @override
  Future<Map<String, dynamic>> patch(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async {
    patchPaths.add(path);
    if (path.startsWith('/sessions/') && path.endsWith('/close')) {
      final id = path.split('/')[2];
      final index = sessions.indexWhere((row) => row['id'] == id);
      if (index >= 0) {
        sessions[index] = {
          ...sessions[index],
          'status': 'CLOSED',
        };
        return sessions[index];
      }
    }
    return {};
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async {
    postPaths.add(path);
    if (path == '/sessions') {
      final lectureScheduleId = '${body?['lectureScheduleId'] ?? ''}';
      final linkedCourse = lectureScheduleId == 'schedule-2'
          ? {
              'id': 'course-2',
              'courseCode': 'MEC202',
              'courseName': 'Control Systems',
            }
          : {
              'id': 'course-1',
              'courseCode': 'MEC201',
              'courseName': 'Electronics',
            };
      final opened = {
        'id': 'session-${sessions.length + 1}',
        'title': body?['title'] ?? 'Attendance session',
        'status': 'ACTIVE',
        'startTime': '2026-08-18T09:00:00.000Z',
        'room': lectureScheduleId == 'schedule-2' ? 'C-101' : 'B-204',
        'courseId': linkedCourse['id'],
        'course': linkedCourse,
        'lectureSchedule': {
          'id': lectureScheduleId,
          'room': lectureScheduleId == 'schedule-2' ? 'C-101' : 'B-204',
        },
        'createdBy': {
          'id': 'admin-1',
          'fullName': session.name,
        },
        '_count': {'attendances': 0},
      };
      sessions.insert(0, opened);
      return opened;
    }
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
