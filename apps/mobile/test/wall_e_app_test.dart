import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wall_e_mobile/data/campus_api.dart';
import 'package:wall_e_mobile/main.dart';
import 'package:wall_e_mobile/models/account_role.dart';

class FakeCampusApi implements CampusGateway {
  @override
  Future<AuthSession> login(String identifier, String password) async {
    if (identifier == 'owner@wall-e.io') {
      throw const ApiException(
        'System owner accounts are available on the web console only',
        statusCode: 403,
        code: 'WEB_ONLY_ACCOUNT',
      );
    }

    final role = identifier.contains('super')
        ? AccountRole.superAdmin
        : identifier.contains('admin')
            ? AccountRole.admin
            : identifier.contains('robot')
                ? AccountRole.robot
                : AccountRole.student;
    return AuthSession(
      token: 'test-token',
      role: role,
      id: 'test-id',
      name: switch (role) {
        AccountRole.superAdmin => 'Salma Hassan',
        AccountRole.admin => 'Omar Adel',
        AccountRole.student => 'Ali Mahmoud',
        AccountRole.robot => 'WALL-E Hall A',
      },
      identifier: identifier,
      organizationId: 'org-1',
      isDevice: role == AccountRole.robot,
    );
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
            'role': 'ADMIN',
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
          'fullName': 'Ali Mahmoud',
          'email': 'student@campus.edu',
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
    if (path == '/sessions') return {'data': []};
    if (path.contains('/pending')) return {'data': [], 'total': 0};
    if (path == '/devices/me/sessions/active') {
      return {'room': 'B-204', 'count': 0, 'sessions': []};
    }
    return {'data': []};
  }

  @override
  Future<Map<String, dynamic>> patch(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async =>
      {};

  @override
  Future<Map<String, dynamic>> post(
    String path,
    AuthSession session, [
    Map<String, dynamic>? body,
  ]) async =>
      {};

  @override
  Future<void> requestPasswordReset(String email) async {}
}

Future<void> signIn(WidgetTester tester, String email) async {
  await tester.enterText(find.byKey(const ValueKey('login-email')), email);
  await tester.enterText(
    find.byKey(const ValueKey('login-password')),
    'Password@123',
  );
  await tester.tap(find.text('Sign In').last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('requires both credentials', (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await tester.tap(find.text('Sign In').last);
    await tester.pump();
    expect(find.text('Enter your email and password.'), findsOneWidget);
  });

  testWidgets('routes all four supported account types from authenticated role',
      (tester) async {
    final cases = {
      'super@campus.edu': 'Active students',
      'admin@campus.edu': 'Classes today',
      'student@campus.edu': 'My Timetable',
      'robot@campus.edu': 'Attendance display',
    };

    for (final item in cases.entries) {
      await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
      await signIn(tester, item.key);
      expect(find.text(item.value), findsWidgets);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });

  testWidgets('shows the backend web-only policy for system owner',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'owner@wall-e.io');
    expect(
      find.text('System owner accounts are available on the web console only'),
      findsOneWidget,
    );
    expect(find.text('Sign In'), findsWidgets);
  });

  testWidgets('only super admin can manage the official timetable',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'super@campus.edu');
    await tester.tap(find.text('Timetable'));
    await tester.pumpAndSettle();
    expect(find.text('Add timetable lecture'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await tester.pumpAndSettle();
    await signIn(tester, 'admin@campus.edu');
    await tester.tap(find.text('My Teaching'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Read-only here. The university super-admin publishes the official timetable.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('student accepted screens render connected campus data',
      (tester) async {
    await tester.pumpWidget(WallEApp(api: FakeCampusApi()));
    await signIn(tester, 'student@campus.edu');

    expect(find.text('My Timetable'), findsOneWidget);
    for (final day in ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU']) {
      expect(find.text(day), findsOneWidget);
    }
    expect(find.text('Faculty of Engineering'), findsOneWidget);
    expect(find.text('MEC201'), findsOneWidget);
    expect(find.text('Electronics'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('student-day-MON-selected')),
      findsOneWidget,
    );
    await tester.tap(find.text('TUE'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('student-day-TUE-selected')),
      findsOneWidget,
    );

    await tester.tap(find.text('Attendance'));
    await tester.pumpAndSettle();
    expect(find.text('My Attendance'), findsOneWidget);
    expect(find.text('89%'), findsWidgets);
    expect(find.text('By Course'), findsOneWidget);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('MEC201'), findsWidgets);
    expect(
      find.byKey(const ValueKey('attendance-tab-by-course-selected')),
      findsOneWidget,
    );
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('attendance-tab-history-selected')),
      findsOneWidget,
    );

    await tester.tap(find.text('Material'));
    await tester.pumpAndSettle();
    expect(find.text('Material'), findsWidgets);
    expect(find.text('Electronics lecture slides'), findsOneWidget);
    expect(find.text('Electronics lab sheets'), findsOneWidget);
    expect(find.text('2 files'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('student-profile')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('profile-edit')), findsOneWidget);
  });
}
