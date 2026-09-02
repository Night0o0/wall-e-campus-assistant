import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import '../models/account_role.dart';
import 'app_destination.dart';
import 'shared_widgets.dart';
import 'external_links.dart';

List<AppDestination> connectedDestinationsFor(
  AccountRole role,
  CampusGateway api,
  AuthSession session,
  VoidCallback onLogout,
) =>
    switch (role) {
      AccountRole.instructor => [
          AppDestination('Overview', Icons.grid_view_rounded,
              ConnectedDashboard(api: api, session: session)),
          AppDestination('My Teaching', Icons.calendar_month_rounded,
              ConnectedTimetable(api: api, session: session)),
          AppDestination('Sessions', Icons.play_circle_rounded,
              ConnectedSessions(api: api, session: session)),
          AppDestination('Courses', Icons.menu_book_rounded,
              ConnectedCourses(api: api, session: session)),
          AppDestination('Materials', Icons.folder_copy_rounded,
              ConnectedMaterials(api: api, session: session)),
          AppDestination('Pending Students', Icons.how_to_reg_rounded,
              ConnectedPeople(api: api, session: session, pendingOnly: true)),
          AppDestination('Inbox', Icons.notifications_rounded,
              ConnectedInbox(api: api, session: session)),
          AppDestination('Account', Icons.person_rounded,
              ConnectedProfile(api: api, session: session, onLogout: onLogout)),
        ],
      AccountRole.universityAdmin => [
          AppDestination('Dashboard', Icons.grid_view_rounded,
              ConnectedDashboard(api: api, session: session)),
          AppDestination('Timetable', Icons.calendar_month_rounded,
              ConnectedTimetable(api: api, session: session)),
          AppDestination('Courses', Icons.menu_book_rounded,
              ConnectedCourses(api: api, session: session)),
          AppDestination('Sessions', Icons.play_circle_rounded,
              ConnectedSessions(api: api, session: session)),
          AppDestination('Students & Staff', Icons.groups_rounded,
              ConnectedPeople(api: api, session: session)),
          AppDestination('Pending Students', Icons.how_to_reg_rounded,
              ConnectedPeople(api: api, session: session, pendingOnly: true)),
          AppDestination('Materials', Icons.folder_copy_rounded,
              ConnectedMaterials(api: api, session: session)),
          AppDestination('Inbox', Icons.notifications_rounded,
              ConnectedInbox(api: api, session: session)),
          AppDestination('Account', Icons.person_rounded,
              ConnectedProfile(api: api, session: session, onLogout: onLogout)),
        ],
      AccountRole.departmentAdmin => [
          AppDestination('Dashboard', Icons.grid_view_rounded,
              ConnectedDashboard(api: api, session: session)),
          AppDestination('Timetable', Icons.calendar_month_rounded,
              ConnectedTimetable(api: api, session: session)),
          AppDestination('Courses', Icons.menu_book_rounded,
              ConnectedCourses(api: api, session: session)),
          AppDestination('Students', Icons.groups_rounded,
              ConnectedPeople(api: api, session: session)),
          AppDestination('Account', Icons.person_rounded,
              ConnectedProfile(api: api, session: session, onLogout: onLogout)),
        ],
      AccountRole.student => [],
    };

class ConnectedDashboard extends StatelessWidget {
  const ConnectedDashboard(
      {required this.api, required this.session, super.key});

  final CampusGateway api;
  final AuthSession session;

  @override
  Widget build(BuildContext context) {
    if (session.role == AccountRole.instructor) {
      return _DataPage(
        title: 'Good morning, ${_firstName(session.name)}',
        subtitle: 'Your live teaching schedule and attendance sessions.',
        load: () async {
          final values = await Future.wait([
            api.get('/admin/schedule', session),
            api.get('/sessions', session),
            api.get('/admin/students/pending', session),
            api.get('/courses', session),
          ]);
          return {
            'schedule': values[0],
            'sessions': values[1],
            'pending': values[2],
            'courses': values[3],
          };
        },
        builder: (data) {
          final schedule = _map(data['schedule']);
          final sessions = _items(_map(data['sessions']));
          final pending = _map(data['pending']);
          final schedules = _items(schedule, keys: const ['schedules', 'data']);
          final courses = _items(_map(data['courses']));
          return [
            ResponsiveMetricGrid(children: [
              MetricCard(
                  label: 'Classes today',
                  value: '${schedule['count'] ?? _items(schedule).length}',
                  icon: Icons.calendar_month_rounded),
              MetricCard(
                  label: 'Active sessions',
                  value:
                      '${sessions.where((item) => item['status'] == 'ACTIVE').length}',
                  icon: Icons.play_circle_rounded,
                  accent: AppColors.success),
              MetricCard(
                  label: 'My courses',
                  value: '${courses.length}',
                  icon: Icons.menu_book_rounded,
                  accent: AppColors.violet),
              MetricCard(
                  label: 'Pending students',
                  value:
                      '${_map(pending['meta'])['total'] ?? _items(pending).length}',
                  icon: Icons.how_to_reg_rounded,
                  accent: AppColors.orange),
            ]),
            SectionCard(
              title: 'Today’s schedule',
              child: Column(
                children: [
                  if (schedules.isEmpty)
                    const Text('No lectures scheduled.',
                        style: TextStyle(color: AppColors.muted)),
                  for (final row in schedules.take(4)) ...[
                    AppListTile(
                      title:
                          '${_map(row['course'])['courseName'] ?? 'Lecture'}',
                      subtitle:
                          '${row['dayOfWeek'] ?? ''} • ${row['startTime'] ?? ''} – ${row['endTime'] ?? ''} • ${row['room'] ?? ''}',
                      icon: Icons.calendar_month_rounded,
                      iconColor: _connectedSubjectColor(
                          '${_map(row['course'])['courseCode'] ?? ''}'),
                    ),
                    if (row != schedules.take(4).last) const Divider(),
                  ],
                ],
              ),
            ),
          ];
        },
      );
    }

    return _DataPage(
      title: 'Good morning, ${_firstName(session.name)}',
      subtitle: 'Live university operations from the campus backend.',
      load: () async {
        final values = await Future.wait([
          api.get('/admin/overview', session),
          api.get('/schedules', session),
        ]);
        return {'overview': values[0], 'schedule': values[1]};
      },
      builder: (data) {
        final overview = _map(data['overview']);
        final people = _map(overview['people']);
        final academics = _map(overview['academics']);
        final sessions = _map(overview['sessions']);
        final attendance = _map(overview['attendance']);
        final schedules =
            _items(_map(data['schedule']), keys: const ['data', 'schedules']);
        return [
          ResponsiveMetricGrid(children: [
            MetricCard(
                label: 'Active students',
                value: '${people['activeStudents'] ?? 0}',
                icon: Icons.school_rounded),
            MetricCard(
                label: 'Teaching staff',
                value: '${people['staff'] ?? 0}',
                icon: Icons.badge_rounded,
                accent: AppColors.orange),
            MetricCard(
                label: 'Courses',
                value: '${academics['courses'] ?? 0}',
                icon: Icons.menu_book_rounded,
                accent: AppColors.violet),
            MetricCard(
                label: 'Active sessions',
                value: '${sessions['active'] ?? 0}',
                icon: Icons.play_circle_rounded,
                accent: AppColors.success),
            MetricCard(
                label: 'Scans this week',
                value: '${attendance['scansThisWeek'] ?? 0}',
                icon: Icons.qr_code_scanner_rounded),
            MetricCard(
                label: 'Incomplete profiles',
                value: '${people['incompleteProfiles'] ?? 0}',
                icon: Icons.warning_amber_rounded,
                accent: AppColors.orange),
          ]),
          SectionCard(
            title: 'University timetable',
            child: Column(
              children: [
                for (final row in schedules.take(4)) ...[
                  AppListTile(
                    title: '${_map(row['course'])['courseName'] ?? 'Lecture'}',
                    subtitle:
                        '${row['dayOfWeek'] ?? ''} • ${row['startTime'] ?? ''} – ${row['endTime'] ?? ''} • ${row['room'] ?? ''}',
                    icon: Icons.calendar_month_rounded,
                    iconColor: _connectedSubjectColor(
                        '${_map(row['course'])['courseCode'] ?? ''}'),
                  ),
                  if (row != schedules.take(4).last) const Divider(),
                ],
              ],
            ),
          ),
        ];
      },
    );
  }
}

class ConnectedTimetable extends StatefulWidget {
  const ConnectedTimetable(
      {required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  State<ConnectedTimetable> createState() => _ConnectedTimetableState();
}

class _ConnectedTimetableState extends State<ConnectedTimetable> {
  static const days = [
    'SATURDAY',
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
  ];

  var version = 0;
  String? openingScheduleId;

  bool get canManage => widget.session.role == AccountRole.universityAdmin;
  bool get canOpenAttendance => widget.session.role == AccountRole.instructor;

  Future<Map<String, dynamic>> _load() async {
    final schedulePath = widget.session.role == AccountRole.instructor
        ? '/admin/schedule'
        : '/schedules';
    if (!canManage) {
      return {'schedules': await widget.api.get(schedulePath, widget.session)};
    }
    final values = await Future.wait([
      widget.api.get(
        schedulePath,
        widget.session,
        query: const {'limit': '100'},
      ),
      widget.api.get('/courses', widget.session),
      widget.api.get(
        '/admin/users',
        widget.session,
        query: const {'limit': '100'},
      ),
    ]);
    return {
      'schedules': values[0],
      'courses': values[1],
      'users': values[2],
    };
  }

  Future<void> _showScheduleEditor(
    List<Map<String, dynamic>> courses,
    List<Map<String, dynamic>> instructors, {
    Map<String, dynamic>? schedule,
  }) async {
    final course = _map(schedule?['course']);
    final instructor = _map(schedule?['instructor']);
    String? courseId = schedule == null
        ? null
        : '${schedule['courseId'] ?? course['id'] ?? ''}';
    String? instructorId = schedule == null
        ? null
        : '${schedule['instructorId'] ?? instructor['id'] ?? ''}';
    var day = '${schedule?['dayOfWeek'] ?? 'SATURDAY'}';
    var semester = (schedule?['semester'] as num?)?.toInt() ?? 1;
    final faculty =
        TextEditingController(text: '${schedule?['faculty'] ?? ''}');
    final department =
        TextEditingController(text: '${schedule?['department'] ?? ''}');
    final level = TextEditingController(text: '${schedule?['level'] ?? '1'}');
    final section =
        TextEditingController(text: '${schedule?['section'] ?? 'A'}');
    final start =
        TextEditingController(text: '${schedule?['startTime'] ?? '09:00'}');
    final end =
        TextEditingController(text: '${schedule?['endTime'] ?? '10:30'}');
    final room = TextEditingController(text: '${schedule?['room'] ?? ''}');
    var saving = false;
    String? errorText;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title:
              Text(schedule == null ? 'Add timetable lecture' : 'Edit lecture'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: courseId?.isEmpty == true ? null : courseId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Course'),
                    items: [
                      for (final row in courses)
                        DropdownMenuItem(
                          value: '${row['id']}',
                          child: Text(
                            '${row['courseCode'] ?? ''} · ${row['courseName'] ?? ''}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => courseId = value),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue:
                        instructorId?.isEmpty == true ? null : instructorId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Instructor'),
                    items: [
                      for (final row in instructors)
                        DropdownMenuItem(
                          value: '${row['id']}',
                          child: Text(
                            '${row['fullName'] ?? row['email'] ?? 'Admin'}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => instructorId = value),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                      controller: faculty,
                      decoration: const InputDecoration(labelText: 'Faculty')),
                  const SizedBox(height: 12),
                  TextField(
                      controller: department,
                      decoration:
                          const InputDecoration(labelText: 'Department')),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: level,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Level'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: semester,
                          decoration:
                              const InputDecoration(labelText: 'Semester'),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('First')),
                            DropdownMenuItem(value: 2, child: Text('Second')),
                          ],
                          onChanged: (value) => setDialogState(
                              () => semester = value ?? semester),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                      controller: section,
                      decoration: const InputDecoration(labelText: 'Section')),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: days.contains(day) ? day : days.first,
                    decoration: const InputDecoration(labelText: 'Day'),
                    items: [
                      for (final value in days)
                        DropdownMenuItem(
                          value: value,
                          child: Text(_titleCase(value)),
                        ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => day = value ?? day),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: start,
                          decoration:
                              const InputDecoration(labelText: 'Start (HH:MM)'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: end,
                          decoration:
                              const InputDecoration(labelText: 'End (HH:MM)'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                      controller: room,
                      decoration: const InputDecoration(labelText: 'Room')),
                  if (errorText != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(errorText!,
                          style: const TextStyle(
                              color: AppColors.orange, fontSize: 12)),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton.icon(
              onPressed: saving
                  ? null
                  : () async {
                      final levelValue = int.tryParse(level.text.trim());
                      if (courseId == null ||
                          instructorId == null ||
                          levelValue == null ||
                          faculty.text.trim().isEmpty ||
                          department.text.trim().isEmpty ||
                          section.text.trim().isEmpty ||
                          room.text.trim().isEmpty) {
                        setDialogState(() => errorText =
                            'Complete every timetable field before saving.');
                        return;
                      }
                      final body = <String, dynamic>{
                        'courseId': courseId,
                        'instructorId': instructorId,
                        'faculty': faculty.text.trim(),
                        'department': department.text.trim(),
                        'level': levelValue,
                        'semester': semester,
                        'section': section.text.trim(),
                        'dayOfWeek': day,
                        'startTime': start.text.trim(),
                        'endTime': end.text.trim(),
                        'room': room.text.trim(),
                      };
                      setDialogState(() {
                        saving = true;
                        errorText = null;
                      });
                      try {
                        if (schedule == null) {
                          await widget.api
                              .post('/schedules', widget.session, body);
                        } else {
                          await widget.api.patch('/schedules/${schedule['id']}',
                              widget.session, body);
                        }
                        if (!mounted || !dialogContext.mounted) return;
                        Navigator.pop(dialogContext);
                        setState(() => version++);
                        ScaffoldMessenger.of(this.context).showSnackBar(
                          SnackBar(
                            content: Text(schedule == null
                                ? 'Lecture added to the official timetable.'
                                : 'Timetable lecture updated.'),
                          ),
                        );
                      } on ApiException catch (error) {
                        setDialogState(() {
                          saving = false;
                          errorText = error.message;
                        });
                      }
                    },
              icon: const Icon(Icons.save_rounded),
              label: Text(saving ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    );

    for (final controller in [
      faculty,
      department,
      level,
      section,
      start,
      end,
      room
    ]) {
      controller.dispose();
    }
  }

  Future<void> _openAttendance(Map<String, dynamic> schedule) async {
    final scheduleId = '${schedule['id'] ?? ''}';
    if (scheduleId.isEmpty || openingScheduleId != null) return;

    final course = _map(schedule['course']);
    final courseCode = '${course['courseCode'] ?? 'Lecture'}';
    final courseName = '${course['courseName'] ?? 'Attendance'}';

    setState(() => openingScheduleId = scheduleId);
    try {
      final opened = await widget.api.post('/sessions', widget.session, {
        'title': '$courseCode — $courseName',
        'lectureScheduleId': scheduleId,
      });
      if (!mounted) return;
      setState(() => version++);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Attendance is open for this lecture.'),
        ),
      );
      await showDialog<void>(
        context: context,
        builder: (_) => _SessionQrDialog(
          api: widget.api,
          session: widget.session,
          sessionId: '${opened['id'] ?? ''}',
          sessionTitle: '${opened['title'] ?? '$courseCode — $courseName'}',
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => openingScheduleId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return KeyedSubtree(
        key: ValueKey(version),
        child: _DataPage(
          title: 'Timetable',
          subtitle: canManage
              ? 'Manage the official timetable shown automatically to matching students.'
              : canOpenAttendance
                  ? 'Your assigned teaching timetable. Start attendance directly from each lecture.'
                  : 'Your assigned teaching timetable. University super-admins manage changes.',
          load: _load,
          builder: (data) {
            final schedules = _items(_map(data['schedules']),
                keys: const ['schedules', 'data']);
            final courses = _items(_map(data['courses']));
            final instructors = _items(_map(data['users']))
                .where((row) => row['role'] == 'INSTRUCTOR')
                .toList();
            return [
              if (canManage)
                FilledButton.icon(
                  onPressed: courses.isEmpty || instructors.isEmpty
                      ? null
                      : () => _showScheduleEditor(courses, instructors),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add timetable lecture'),
                )
              else if (!canOpenAttendance)
                const SectionCard(
                  child: Row(
                    children: [
                      Icon(Icons.lock_outline_rounded, color: AppColors.muted),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Read-only here. The university super-admin publishes the official timetable.',
                        ),
                      ),
                    ],
                  ),
                ),
              if (schedules.isEmpty)
                const _EmptyMessage('No lectures match this account yet.'),
              for (final schedule in schedules)
                SectionCard(
                  title:
                      '${_map(schedule['course'])['courseCode'] ?? 'Lecture'} — ${_map(schedule['course'])['courseName'] ?? ''}',
                  subtitle:
                      '${_titleCase('${schedule['dayOfWeek'] ?? ''}')} · ${schedule['startTime'] ?? ''}–${schedule['endTime'] ?? ''}',
                  trailing: canManage
                      ? IconButton(
                          tooltip: 'Edit lecture',
                          onPressed: () => _showScheduleEditor(
                            courses,
                            instructors,
                            schedule: schedule,
                          ),
                          icon: const Icon(Icons.edit_rounded),
                          color: AppColors.blue,
                        )
                      : null,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        StatusPill('${schedule['room'] ?? 'No room'}'),
                        StatusPill('Section ${schedule['section'] ?? '—'}',
                            color: AppColors.violet),
                        StatusPill(
                            '${_map(schedule['instructor'])['fullName'] ?? ''}',
                            color: AppColors.orange),
                      ]),
                      if (canOpenAttendance) ...[
                        const SizedBox(height: 14),
                        FilledButton.icon(
                          onPressed: openingScheduleId == null
                              ? () => _openAttendance(schedule)
                              : null,
                          icon: Icon(
                            openingScheduleId == '${schedule['id']}'
                                ? Icons.sync_rounded
                                : Icons.play_circle_rounded,
                          ),
                          label: Text(
                            openingScheduleId == '${schedule['id']}'
                                ? 'Opening…'
                                : 'Open attendance',
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
            ];
          },
        ));
  }
}

class ConnectedCourses extends StatelessWidget {
  const ConnectedCourses({required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  Widget build(BuildContext context) => _DataPage(
        title: 'Courses',
        subtitle: 'Courses available in your university.',
        load: () => api.get('/courses', session),
        builder: (data) {
          final rows = _items(data, keys: const ['courses', 'data']);
          return [
            if (rows.isEmpty) const _EmptyMessage('No courses found.'),
            ResponsiveMetricGrid(
              children: [
                for (final row in rows) _ConnectedCourseCard(course: row),
              ],
            ),
          ];
        },
      );
}

class _ConnectedCourseCard extends StatelessWidget {
  const _ConnectedCourseCard({required this.course});

  final Map<String, dynamic> course;

  @override
  Widget build(BuildContext context) {
    final code = '${course['courseCode'] ?? course['code'] ?? 'COURSE'}';
    final color = _connectedSubjectColor(code);
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(Icons.menu_book_rounded, color: color),
          ),
          const SizedBox(height: 16),
          Text('${course['courseName'] ?? 'Course'}',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 5),
          Text('$code  •  ${course['credits'] ?? '—'} credits',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 14),
          const Row(
            children: [
              StatusPill('Active'),
              Spacer(),
              Icon(Icons.arrow_forward_rounded, color: AppColors.muted),
            ],
          ),
        ],
      ),
    );
  }
}

class ConnectedSessions extends StatefulWidget {
  const ConnectedSessions(
      {required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  State<ConnectedSessions> createState() => _ConnectedSessionsState();
}

class _ConnectedSessionsState extends State<ConnectedSessions> {
  var version = 0;
  String? closingSessionId;

  Future<void> _showSessionDetails(Map<String, dynamic> row) async {
    final sessionId = '${row['id'] ?? ''}';
    if (sessionId.isEmpty) return;

    await showDialog<void>(
      context: context,
      builder: (_) => _SessionDetailDialog(
        api: widget.api,
        session: widget.session,
        sessionId: sessionId,
        sessionTitle: '${row['title'] ?? 'Attendance session'}',
      ),
    );
  }

  Future<void> _showSessionQr(Map<String, dynamic> row) async {
    final sessionId = '${row['id'] ?? ''}';
    if (sessionId.isEmpty) return;

    await showDialog<void>(
      context: context,
      builder: (_) => _SessionQrDialog(
        api: widget.api,
        session: widget.session,
        sessionId: sessionId,
        sessionTitle: '${row['title'] ?? 'Attendance session'}',
      ),
    );
  }

  Future<void> _closeSession(Map<String, dynamic> row) async {
    final sessionId = '${row['id'] ?? ''}';
    if (sessionId.isEmpty || closingSessionId != null) return;

    final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Close this session?'),
            content: const Text(
              'Students will no longer be able to scan into it. Anyone still missing will be recorded absent when the roll is finalized.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Close session'),
              ),
            ],
          ),
        ) ??
        false;

    if (!confirmed) return;

    setState(() => closingSessionId = sessionId);
    try {
      await widget.api.patch('/sessions/$sessionId/close', widget.session, {});
      if (!mounted) return;
      setState(() => version++);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Session closed.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => closingSessionId = null);
    }
  }

  @override
  Widget build(BuildContext context) => KeyedSubtree(
        key: ValueKey(version),
        child: _DataPage(
          title: 'Attendance Sessions',
          subtitle: 'Live and completed sessions visible to this account.',
          load: () => widget.api.get(
            '/sessions',
            widget.session,
            query: const {'limit': '50'},
          ),
          builder: (data) {
            final rows = _items(data, keys: const ['sessions', 'data']);
            final live = rows.where(_sessionIsActive).length;
            final totalScans = rows.fold<int>(
              0,
              (sum, row) => sum + _sessionAttendanceCount(row),
            );

            return [
              if (rows.isEmpty)
                const _EmptyMessage('No attendance sessions found.'),
              ResponsiveMetricGrid(
                children: [
                  MetricCard(
                    label: 'Live now',
                    value: '$live',
                    icon: Icons.wifi_tethering_rounded,
                    accent: AppColors.success,
                  ),
                  MetricCard(
                    label: 'Sessions',
                    value: '${rows.length}',
                    icon: Icons.today_rounded,
                  ),
                  MetricCard(
                    label: 'Recorded scans',
                    value: '$totalScans',
                    icon: Icons.groups_rounded,
                    accent: AppColors.orange,
                  ),
                ],
              ),
              SectionCard(
                title: 'Attendance sessions',
                child: Column(
                  children: [
                    for (var index = 0; index < rows.length; index++) ...[
                      _SessionCard(
                        row: rows[index],
                        closing: closingSessionId == '${rows[index]['id']}',
                        onMonitor: () => _showSessionDetails(rows[index]),
                        onShowCode: _sessionIsActive(rows[index])
                            ? () => _showSessionQr(rows[index])
                            : null,
                        onClose: _sessionIsActive(rows[index])
                            ? () => _closeSession(rows[index])
                            : null,
                      ),
                      if (index < rows.length - 1) const Divider(),
                    ],
                  ],
                ),
              ),
            ];
          },
        ),
      );
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({
    required this.row,
    required this.onMonitor,
    this.onShowCode,
    this.onClose,
    this.closing = false,
  });

  final Map<String, dynamic> row;
  final VoidCallback onMonitor;
  final VoidCallback? onShowCode;
  final VoidCallback? onClose;
  final bool closing;

  @override
  Widget build(BuildContext context) {
    final active = _sessionIsActive(row);
    final course = _map(row['course']);
    final schedule = _map(row['lectureSchedule']);
    final room = '${row['room'] ?? schedule['room'] ?? 'No room'}';
    final statusColor = active ? AppColors.success : AppColors.muted;
    final attendanceCount = _sessionAttendanceCount(row);
    final title = '${row['title'] ?? 'Session'}';
    final courseSummary = course.isEmpty
        ? 'Ad-hoc session — no course linked'
        : '${course['courseCode'] ?? ''} · ${course['courseName'] ?? ''}';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  active
                      ? Icons.play_circle_rounded
                      : Icons.check_circle_rounded,
                  color: statusColor,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(courseSummary,
                        style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 4),
                    Text(
                      '$room · ${_dateText(row['startTime'])}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              StatusPill(
                active ? 'ACTIVE' : '${row['status'] ?? 'CLOSED'}',
                color: statusColor,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusPill('$attendanceCount scans', color: AppColors.orange),
              if ('${_map(row['createdBy'])['fullName'] ?? ''}'
                  .trim()
                  .isNotEmpty)
                StatusPill(
                  '${_map(row['createdBy'])['fullName']}',
                  color: AppColors.violet,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              OutlinedButton.icon(
                onPressed: onMonitor,
                icon: const Icon(Icons.monitor_heart_rounded),
                label: const Text('Monitor'),
              ),
              if (onShowCode != null)
                FilledButton.icon(
                  onPressed: onShowCode,
                  icon: const Icon(Icons.qr_code_2_rounded),
                  label: const Text('Show code'),
                ),
              if (onClose != null)
                OutlinedButton.icon(
                  onPressed: closing ? null : onClose,
                  icon: Icon(
                    closing ? Icons.sync_rounded : Icons.stop_circle_rounded,
                  ),
                  label: Text(closing ? 'Closing…' : 'Close'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SessionDetailDialog extends StatefulWidget {
  const _SessionDetailDialog({
    required this.api,
    required this.session,
    required this.sessionId,
    required this.sessionTitle,
  });

  final CampusGateway api;
  final AuthSession session;
  final String sessionId;
  final String sessionTitle;

  @override
  State<_SessionDetailDialog> createState() => _SessionDetailDialogState();
}

class _SessionDetailDialogState extends State<_SessionDetailDialog> {
  late Future<Map<String, dynamic>> future;

  @override
  void initState() {
    super.initState();
    future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final values = await Future.wait<Map<String, dynamic>>([
      widget.api.get('/sessions/${widget.sessionId}', widget.session),
      widget.api.get('/attendance/session/${widget.sessionId}', widget.session),
      widget.api
          .get('/attendance/session/${widget.sessionId}/stats', widget.session),
    ]);

    return {
      'session': values[0],
      'attendance': values[1],
      'stats': values[2],
    };
  }

  void _refresh() => setState(() => future = _load());

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.sessionTitle),
        content: SizedBox(
          width: 420,
          child: FutureBuilder<Map<String, dynamic>>(
            future: future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              if (snapshot.hasError) {
                final error = snapshot.error;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      error is ApiException
                          ? error.message
                          : 'Could not load attendance details.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _refresh,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Try again'),
                    ),
                  ],
                );
              }

              final data = snapshot.data ?? const <String, dynamic>{};
              final sessionData = _map(data['session']);
              final attendance = _items(
                _map(data['attendance']),
                keys: const ['attendance', 'data', 'items'],
              );
              final stats = _map(data['stats']);
              final room =
                  '${sessionData['room'] ?? _map(sessionData['lectureSchedule'])['room'] ?? 'No room'}';
              final active = _sessionIsActive(sessionData);

              return ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * .62,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _sessionCourseSummary(sessionData),
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '$room · ${_dateText(sessionData['startTime'])}',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 16),
                      ResponsiveMetricGrid(
                        children: [
                          MetricCard(
                            label: 'Turned up',
                            value: '${stats['total'] ?? attendance.length}',
                            icon: Icons.groups_rounded,
                          ),
                          MetricCard(
                            label: 'Late',
                            value: '${stats['late'] ?? 0}',
                            icon: Icons.schedule_rounded,
                            accent: AppColors.orange,
                          ),
                          MetricCard(
                            label: 'Absent',
                            value: '${stats['absent'] ?? 0}',
                            icon: Icons.person_off_rounded,
                            accent: AppColors.danger,
                          ),
                          MetricCard(
                            label: 'Status',
                            value: active ? 'Open' : 'Closed',
                            icon: active
                                ? Icons.play_circle_rounded
                                : Icons.check_circle_rounded,
                            accent:
                                active ? AppColors.success : AppColors.muted,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      if (attendance.isEmpty)
                        _EmptyMessage(
                          active
                              ? 'Nobody has scanned yet.'
                              : 'This session closed with no attendance recorded.',
                        )
                      else
                        SectionCard(
                          title: 'Attendance roster',
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            children: [
                              for (var index = 0;
                                  index < attendance.length;
                                  index++) ...[
                                _AttendanceRowCard(row: attendance[index]),
                                if (index < attendance.length - 1)
                                  const Divider(),
                              ],
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Refresh'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      );
}

class _AttendanceRowCard extends StatelessWidget {
  const _AttendanceRowCard({required this.row});

  final Map<String, dynamic> row;

  @override
  Widget build(BuildContext context) {
    final student = _map(row['student']);
    final status = '${row['status'] ?? 'UNKNOWN'}';
    final color = switch (status) {
      'PRESENT' => AppColors.success,
      'LATE' => AppColors.orange,
      'ABSENT' => AppColors.danger,
      _ => AppColors.muted,
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.school_rounded, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${student['fullName'] ?? 'Student'}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 3),
                Text(
                  '${student['universityId'] ?? 'No university id'} · ${_dateText(row['scanTime'])}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          StatusPill(status, color: color),
        ],
      ),
    );
  }
}

class _SessionQrDialog extends StatefulWidget {
  const _SessionQrDialog({
    required this.api,
    required this.session,
    required this.sessionId,
    required this.sessionTitle,
  });

  final CampusGateway api;
  final AuthSession session;
  final String sessionId;
  final String sessionTitle;

  @override
  State<_SessionQrDialog> createState() => _SessionQrDialogState();
}

class _SessionQrDialogState extends State<_SessionQrDialog> {
  Timer? ticker;
  String? token;
  String? errorText;
  int secondsLeft = 0;
  bool loading = true;
  bool refreshing = false;

  @override
  void initState() {
    super.initState();
    unawaited(_refreshToken());
    ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || loading || refreshing) return;
      if (secondsLeft > 1) {
        setState(() => secondsLeft--);
        return;
      }
      unawaited(_refreshToken());
    });
  }

  @override
  void dispose() {
    ticker?.cancel();
    super.dispose();
  }

  Future<void> _refreshToken() async {
    if (refreshing) return;
    setState(() {
      refreshing = true;
      loading = token == null;
      errorText = null;
    });

    try {
      final payload = await widget.api
          .get('/sessions/${widget.sessionId}/qr', widget.session);
      if (!mounted) return;
      setState(() {
        token = '${payload['token'] ?? ''}';
        secondsLeft = (payload['expiresIn'] as num?)?.toInt() ?? 30;
        loading = false;
        refreshing = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        errorText = error.message;
        loading = false;
        refreshing = false;
      });
    }
  }

  Future<void> _copyToken() async {
    if (token == null || token!.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: token!));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Attendance token copied.')),
    );
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.sessionTitle),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'The mobile app is showing the signed attendance token this session rotates every 30 seconds.',
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xFF0C1324),
                  borderRadius: BorderRadius.circular(18),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: .08)),
                ),
                child: Column(
                  children: [
                    if (loading)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 36),
                        child: CircularProgressIndicator(),
                      )
                    else if (errorText != null)
                      Text(
                        errorText!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.orange),
                      )
                    else
                      SelectableText(
                        token ?? '',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    const SizedBox(height: 14),
                    Text(
                      loading
                          ? 'Requesting token…'
                          : 'Refresh in ${secondsLeft}s',
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: refreshing ? null : _refreshToken,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Refresh'),
          ),
          TextButton.icon(
            onPressed: token == null || token!.isEmpty ? null : _copyToken,
            icon: const Icon(Icons.copy_rounded),
            label: const Text('Copy'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      );
}

class ConnectedPeople extends StatelessWidget {
  const ConnectedPeople(
      {required this.api,
      required this.session,
      this.pendingOnly = false,
      super.key});
  final CampusGateway api;
  final AuthSession session;
  final bool pendingOnly;

  @override
  Widget build(BuildContext context) => _DataPage(
        title: pendingOnly ? 'Pending Students' : 'Students & Staff',
        subtitle: pendingOnly
            ? 'Review students waiting for university approval.'
            : 'Your university account directory.',
        load: () => api.get(
            pendingOnly ? '/admin/students/pending' : '/admin/users', session),
        builder: (data) {
          final rows = _items(data);
          final students = rows.where((row) => row['role'] == 'STUDENT').length;
          final staff = rows.length - students;
          final incomplete = rows
              .where((row) =>
                  _map(row['studentProfile'])['status'] == 'INCOMPLETE')
              .length;
          return [
            if (rows.isEmpty)
              _EmptyMessage(pendingOnly
                  ? 'There are no students waiting for approval.'
                  : 'No accounts found.'),
            if (!pendingOnly)
              ResponsiveMetricGrid(
                children: [
                  MetricCard(
                    label: 'Students on page',
                    value: '$students',
                    icon: Icons.school_rounded,
                  ),
                  MetricCard(
                    label: 'Staff on page',
                    value: '$staff',
                    icon: Icons.badge_rounded,
                    accent: AppColors.orange,
                  ),
                  MetricCard(
                    label: 'Incomplete profiles',
                    value: '$incomplete',
                    icon: Icons.warning_amber_rounded,
                    accent: AppColors.danger,
                  ),
                ],
              ),
            SectionCard(
                title: pendingOnly
                    ? '${rows.length} profiles awaiting review'
                    : 'Directory',
                child: Column(children: [
                  for (final row in rows)
                    AppListTile(
                      title: '${row['fullName'] ?? 'Campus account'}',
                      subtitle:
                          '${row['email'] ?? ''}\n${_friendlyRole(row['role'])}',
                      icon: row['role'] == 'STUDENT'
                          ? Icons.school_rounded
                          : Icons.badge_rounded,
                      trailing: pendingOnly
                          ? _ApprovalButtons(
                              api: api,
                              session: session,
                              studentId: '${row['id']}')
                          : StatusPill(
                              row['isActive'] == false ? 'INACTIVE' : 'ACTIVE',
                              color: row['isActive'] == false
                                  ? AppColors.orange
                                  : AppColors.success),
                    ),
                ])),
          ];
        },
      );
}

class _ApprovalButtons extends StatefulWidget {
  const _ApprovalButtons(
      {required this.api, required this.session, required this.studentId});
  final CampusGateway api;
  final AuthSession session;
  final String studentId;

  @override
  State<_ApprovalButtons> createState() => _ApprovalButtonsState();
}

class _ApprovalButtonsState extends State<_ApprovalButtons> {
  bool busy = false;
  bool completed = false;

  Future<void> _approve() async {
    setState(() => busy = true);
    try {
      await widget.api.patch(
          '/admin/students/${widget.studentId}/approve', widget.session, {});
      if (mounted) setState(() => completed = true);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (completed) return const StatusPill('APPROVED');
    return IconButton(
      tooltip: 'Approve student',
      onPressed: busy ? null : _approve,
      icon: busy
          ? const SizedBox.square(
              dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.check_circle_rounded, color: AppColors.success),
    );
  }
}

class ConnectedMaterials extends StatefulWidget {
  const ConnectedMaterials(
      {required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  State<ConnectedMaterials> createState() => _ConnectedMaterialsState();
}

class _ConnectedMaterialsState extends State<ConnectedMaterials> {
  var version = 0;

  Future<Map<String, dynamic>> _load() async {
    final values = await Future.wait([
      widget.api.get('/materials', widget.session),
      widget.api.get(
        widget.session.role == AccountRole.instructor
            ? '/admin/schedule'
            : '/schedules',
        widget.session,
        query: widget.session.role == AccountRole.universityAdmin
            ? const {'limit': '100'}
            : null,
      ),
    ]);
    return {'materials': values[0], 'schedules': values[1]};
  }

  Future<void> _showMaterialEditor(
    List<Map<String, dynamic>> schedules, {
    Map<String, dynamic>? material,
  }) async {
    final title = TextEditingController(text: '${material?['title'] ?? ''}');
    final link = TextEditingController(text: '${material?['driveUrl'] ?? ''}');
    String? scheduleId;
    var saving = false;
    String? errorText;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(material == null ? 'Add Google Drive link' : 'Edit link'),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (material == null)
                    DropdownButtonFormField<String>(
                      initialValue: scheduleId,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Subject and timetable group',
                      ),
                      items: [
                        for (final schedule in schedules)
                          DropdownMenuItem(
                            value: '${schedule['id']}',
                            child: Text(
                              '${_map(schedule['course'])['courseCode'] ?? 'Course'} · ${schedule['dayOfWeek'] ?? ''} · ${schedule['section'] ?? ''}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (value) =>
                          setDialogState(() => scheduleId = value),
                    ),
                  if (material == null) const SizedBox(height: 12),
                  TextField(
                    controller: title,
                    decoration:
                        const InputDecoration(labelText: 'Material title'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: link,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'Google Drive or Docs link',
                      hintText: 'https://drive.google.com/...',
                    ),
                  ),
                  if (errorText != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(errorText!,
                          style: const TextStyle(
                              color: AppColors.orange, fontSize: 12)),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton.icon(
              onPressed: saving
                  ? null
                  : () async {
                      if (title.text.trim().isEmpty ||
                          link.text.trim().isEmpty ||
                          (material == null && scheduleId == null)) {
                        setDialogState(() => errorText =
                            'Choose a subject and enter a title and Drive link.');
                        return;
                      }
                      setDialogState(() {
                        saving = true;
                        errorText = null;
                      });
                      try {
                        if (material == null) {
                          final schedule = schedules.firstWhere(
                            (row) => '${row['id']}' == scheduleId,
                          );
                          await widget.api.post('/materials', widget.session, {
                            'courseId':
                                '${schedule['courseId'] ?? _map(schedule['course'])['id']}',
                            'scheduleId': scheduleId,
                            'title': title.text.trim(),
                            'driveUrl': link.text.trim(),
                          });
                        } else {
                          await widget.api.patch(
                            '/materials/${material['id']}',
                            widget.session,
                            {
                              'title': title.text.trim(),
                              'driveUrl': link.text.trim(),
                            },
                          );
                        }
                        if (!mounted || !dialogContext.mounted) return;
                        Navigator.pop(dialogContext);
                        setState(() => version++);
                        ScaffoldMessenger.of(this.context).showSnackBar(
                          SnackBar(
                            content: Text(material == null
                                ? 'Material link published.'
                                : 'Material link updated.'),
                          ),
                        );
                      } on ApiException catch (error) {
                        setDialogState(() {
                          saving = false;
                          errorText = error.message;
                        });
                      }
                    },
              icon: const Icon(Icons.save_rounded),
              label: Text(saving ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    );

    title.dispose();
    link.dispose();
  }

  @override
  Widget build(BuildContext context) => KeyedSubtree(
      key: ValueKey(version),
      child: _DataPage(
        title: 'Course Material',
        subtitle: 'Publish real Google Drive links for the subjects you teach.',
        load: _load,
        builder: (data) {
          final materialData = _map(data['materials']);
          final scheduleData = _map(data['schedules']);
          final schedules =
              _items(scheduleData, keys: const ['schedules', 'data', 'items']);
          final courseGroups =
              _items(materialData, keys: const ['courses', 'data']);
          final flattened = <Map<String, dynamic>>[];
          for (final group in courseGroups) {
            final materialRows = _items(_map(group), keys: const ['materials']);
            if (materialRows.isEmpty) {
              flattened.add(group);
            } else {
              for (final material in materialRows) {
                flattened.add({...material, 'course': group['course']});
              }
            }
          }
          return [
            FilledButton.icon(
              onPressed: schedules.isEmpty
                  ? null
                  : () => _showMaterialEditor(schedules),
              icon: const Icon(Icons.add_link_rounded),
              label: const Text('Add Google Drive link'),
            ),
            if (schedules.isEmpty)
              const _EmptyMessage(
                  'Create a timetable lecture before publishing material.'),
            if (flattened.isEmpty)
              const _EmptyMessage('No material links are available yet.'),
            if (flattened.isNotEmpty)
              SectionCard(
                  child: Column(children: [
                for (final row in flattened)
                  AppListTile(
                    title:
                        '${row['title'] ?? _map(row['course'])['courseName'] ?? 'Course material'}',
                    subtitle:
                        '${_map(row['course'])['courseCode'] ?? row['department'] ?? ''}\n${row['driveUrl'] ?? ''}',
                    icon: Icons.folder_copy_rounded,
                    onTap: '${row['driveUrl'] ?? ''}'.isEmpty
                        ? null
                        : () => openExternalLink(
                            context, '${row['driveUrl'] ?? ''}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Edit link',
                          onPressed: () => _showMaterialEditor(
                            schedules,
                            material: row,
                          ),
                          icon: const Icon(Icons.edit_rounded),
                          color: AppColors.blue,
                        ),
                        const Icon(Icons.open_in_new_rounded,
                            color: AppColors.blue, size: 19),
                      ],
                    ),
                  ),
              ])),
          ];
        },
      ));
}

class ConnectedInbox extends StatefulWidget {
  const ConnectedInbox({required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  State<ConnectedInbox> createState() => _ConnectedInboxState();
}

class _ConnectedInboxState extends State<ConnectedInbox> {
  var version = 0;

  Future<void> _markRead(String id) async {
    try {
      await widget.api
          .patch('/notifications/$id/read', widget.session, const {});
      if (mounted) setState(() => version++);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _markAllRead() async {
    try {
      await widget.api
          .patch('/notifications/read-all', widget.session, const {});
      if (mounted) setState(() => version++);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) => KeyedSubtree(
      key: ValueKey(version),
      child: _DataPage(
        title: 'Inbox',
        subtitle: 'Lecture reminders and account notices from the backend.',
        load: () => widget.api.get('/notifications', widget.session),
        builder: (data) {
          final rows = _items(data);
          return [
            if (rows.isEmpty) const _EmptyMessage('Your inbox is empty.'),
            if (rows.any((row) => row['isRead'] != true))
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _markAllRead,
                  icon: const Icon(Icons.done_all_rounded),
                  label: const Text('Mark all read'),
                ),
              ),
            SectionCard(
                child: Column(children: [
              for (final row in rows)
                AppListTile(
                  title: '${row['title'] ?? 'Notification'}',
                  subtitle:
                      '${row['body'] ?? ''}\n${_dateText(row['createdAt'])}',
                  icon: row['isRead'] == true
                      ? Icons.notifications_none_rounded
                      : Icons.notifications_active_rounded,
                  iconColor:
                      row['isRead'] == true ? AppColors.muted : AppColors.blue,
                  onTap: row['isRead'] == true || '${row['id'] ?? ''}'.isEmpty
                      ? null
                      : () => _markRead('${row['id']}'),
                  trailing:
                      row['isRead'] == true ? null : const StatusPill('NEW'),
                ),
            ])),
          ];
        },
      ));
}

class ConnectedAttendance extends StatelessWidget {
  const ConnectedAttendance(
      {required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  Widget build(BuildContext context) => _DataPage(
        title: 'My Attendance',
        subtitle:
            'Recorded attendance by course. Late scans count as attended.',
        load: () => api.get('/attendance/summary', session),
        builder: (data) {
          final overall = _map(data['overall']);
          final courses = _items(data, keys: const ['courses']);
          return [
            ResponsiveMetricGrid(children: [
              MetricCard(
                  label: 'Attendance rate',
                  value: overall['attendanceRate'] == null
                      ? '—'
                      : '${overall['attendanceRate']}%',
                  icon: Icons.insights_rounded),
              MetricCard(
                  label: 'Present',
                  value: '${overall['present'] ?? 0}',
                  icon: Icons.check_circle_rounded,
                  accent: AppColors.success),
              MetricCard(
                  label: 'Late',
                  value: '${overall['late'] ?? 0}',
                  icon: Icons.schedule_rounded,
                  accent: AppColors.orange),
              MetricCard(
                  label: 'Absent',
                  value: '${overall['absent'] ?? 0}',
                  icon: Icons.cancel_rounded,
                  accent: AppColors.danger),
            ]),
            for (final row in courses)
              SectionCard(
                title:
                    '${_map(row['course'])['courseCode'] ?? 'General'} — ${_map(row['course'])['courseName'] ?? 'Ad-hoc sessions'}',
                child: Text(
                    'Present ${row['present'] ?? 0} · Late ${row['late'] ?? 0} · Absent ${row['absent'] ?? 0}',
                    style: Theme.of(context).textTheme.bodyLarge),
              ),
          ];
        },
      );
}

class ConnectedScan extends StatefulWidget {
  const ConnectedScan({required this.api, required this.session, super.key});
  final CampusGateway api;
  final AuthSession session;

  @override
  State<ConnectedScan> createState() => _ConnectedScanState();
}

class _ConnectedScanState extends State<ConnectedScan> {
  bool submitting = false;
  bool handled = false;
  String? result;

  Future<void> _submit(String token) async {
    if (submitting || handled || token.trim().isEmpty) return;
    setState(() => submitting = true);
    try {
      final response = await widget.api
          .post('/attendance/scan', widget.session, {'token': token.trim()});
      final attendance = _map(response['attendance']);
      if (mounted) {
        setState(() {
          handled = true;
          result =
              '${response['message'] ?? 'Attendance recorded'} (${attendance['status'] ?? 'PRESENT'})';
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => result = error.message);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageCanvas(
        title: 'Scan Attendance QR',
        subtitle:
            'Point the camera at the rotating code shown by your instructor.',
        children: [
          SectionCard(
            child: Column(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  height: 310,
                  child: handled
                      ? const Center(
                          child: Icon(Icons.check_circle_rounded,
                              color: AppColors.success, size: 96))
                      : MobileScanner(
                          onDetect: (capture) {
                            final value =
                                capture.barcodes.firstOrNull?.rawValue;
                            if (value != null) _submit(value);
                          },
                        ),
                ),
              ),
              const SizedBox(height: 16),
              if (submitting) const LinearProgressIndicator(),
              if (result != null)
                Text(result!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: handled ? AppColors.success : AppColors.orange,
                        fontWeight: FontWeight.w700)),
              if (handled)
                TextButton(
                    onPressed: () => setState(() {
                          handled = false;
                          result = null;
                        }),
                    child: const Text('Scan another code')),
            ]),
          ),
        ],
      );
}

class ConnectedProfile extends StatelessWidget {
  const ConnectedProfile(
      {required this.api, required this.session, this.onLogout, super.key});
  final CampusGateway api;
  final AuthSession session;
  final VoidCallback? onLogout;

  @override
  Widget build(BuildContext context) {
    return _DataPage(
      title: 'My Account',
      subtitle:
          'Identity and organization details from the authenticated backend.',
      load: () => api.get('/auth/profile', session),
      builder: (data) {
        final value = _map(data['user']);
        return [
          SectionCard(
              child: Column(children: [
            AppListTile(
                title: '${value['fullName'] ?? value['name'] ?? session.name}',
                subtitle: '${value['email'] ?? session.identifier}',
                icon: Icons.person_rounded),
            AppListTile(
                title: session.role.label,
                subtitle: '${value['universityId'] ?? ''}',
                icon: Icons.verified_user_rounded),
            AppListTile(
                title:
                    '${_map(value['organization'])['name'] ?? value['organizationId'] ?? session.organizationId}',
                subtitle: 'Organization',
                icon: Icons.account_balance_rounded),
          ])),
          FilledButton.icon(
              onPressed: () => _showChangePassword(context, api, session),
              icon: const Icon(Icons.lock_outline_rounded),
              label: const Text('Change password')),
          if (onLogout != null)
            FilledButton.icon(
                onPressed: onLogout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Sign out')),
        ];
      },
    );
  }
}

class ConnectedStudentProfile extends StatelessWidget {
  const ConnectedStudentProfile(
      {required this.api,
      required this.session,
      required this.onLogout,
      super.key});
  final CampusGateway api;
  final AuthSession session;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) => _DataPage(
        title: session.name,
        subtitle:
            'Student profile and academic cohort stored by your university.',
        load: () async {
          final values = await Future.wait([
            api.get('/auth/profile', session),
            api.get('/students/me/profile', session),
          ]);
          return {'user': values[0]['user'], 'profile': values[1]['profile']};
        },
        builder: (data) {
          final user = _map(data['user']);
          final profile = _map(data['profile']);
          return [
            SectionCard(
                child: Column(children: [
              AppListTile(
                  title: '${user['fullName'] ?? session.name}',
                  subtitle:
                      '${user['email'] ?? session.identifier}\n${user['universityId'] ?? ''}',
                  icon: Icons.person_rounded),
              AppListTile(
                  title: '${profile['faculty'] ?? 'Profile incomplete'}',
                  subtitle:
                      '${profile['department'] ?? ''} · Level ${profile['level'] ?? '—'} · Section ${profile['section'] ?? '—'}',
                  icon: Icons.school_rounded,
                  trailing: StatusPill('${profile['status'] ?? 'INCOMPLETE'}',
                      color: profile['status'] == 'COMPLETED'
                          ? AppColors.success
                          : AppColors.orange)),
            ])),
            FilledButton.icon(
                onPressed: () => _showChangePassword(context, api, session),
                icon: const Icon(Icons.lock_outline_rounded),
                label: const Text('Change password')),
            FilledButton.icon(
                onPressed: onLogout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Sign out')),
          ];
        },
      );
}

Future<void> _showChangePassword(
  BuildContext context,
  CampusGateway api,
  AuthSession session,
) =>
    showDialog<void>(
      context: context,
      builder: (_) => _ChangePasswordDialog(api: api, session: session),
    );

class _ChangePasswordDialog extends StatefulWidget {
  const _ChangePasswordDialog({required this.api, required this.session});

  final CampusGateway api;
  final AuthSession session;

  @override
  State<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<_ChangePasswordDialog> {
  final current = TextEditingController();
  final next = TextEditingController();
  final confirm = TextEditingController();
  bool submitting = false;
  String? error;

  @override
  void dispose() {
    current.dispose();
    next.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (next.text.length < 8) {
      setState(() => error = 'Use at least eight characters.');
      return;
    }
    if (next.text != confirm.text) {
      setState(() => error = 'Passwords do not match.');
      return;
    }

    setState(() {
      submitting = true;
      error = null;
    });
    try {
      await widget.api.changePassword(
        email: widget.session.identifier,
        currentPassword: current.text,
        newPassword: next.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated.')),
      );
    } on ApiException catch (caught) {
      if (mounted) setState(() => error = caught.message);
    } catch (_) {
      if (mounted) setState(() => error = 'Unable to change the password.');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Change password'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const ValueKey('current-password'),
                controller: current,
                obscureText: true,
                decoration:
                    const InputDecoration(labelText: 'Current password'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('new-password'),
                controller: next,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('confirm-password'),
                controller: confirm,
                obscureText: true,
                decoration:
                    const InputDecoration(labelText: 'Confirm password'),
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(error!,
                    key: const ValueKey('change-password-error'),
                    style: const TextStyle(color: AppColors.orange)),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: submitting ? null : () => Navigator.of(context).pop(),
              child: const Text('Cancel')),
          FilledButton(
              key: const ValueKey('change-password-submit'),
              onPressed: submitting ? null : submit,
              child: Text(submitting ? 'Updating…' : 'Update')),
        ],
      );
}

class _DataPage extends StatefulWidget {
  const _DataPage(
      {required this.title,
      required this.subtitle,
      required this.load,
      required this.builder});
  final String title;
  final String subtitle;
  final Future<Map<String, dynamic>> Function() load;
  final List<Widget> Function(Map<String, dynamic>) builder;

  @override
  State<_DataPage> createState() => _DataPageState();
}

class _DataPageState extends State<_DataPage> {
  late Future<Map<String, dynamic>> future;

  @override
  void initState() {
    super.initState();
    future = widget.load();
  }

  void refresh() => setState(() => future = widget.load());

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorPanel(error: snapshot.error, onRetry: refresh);
          }
          return RefreshIndicator(
            onRefresh: () async {
              refresh();
              await future;
            },
            child: PageCanvas(
              title: widget.title,
              subtitle: widget.subtitle,
              children: widget.builder(snapshot.data ?? const {}),
            ),
          );
        },
      );
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.error, required this.onRetry});
  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded,
                color: AppColors.orange, size: 48),
            const SizedBox(height: 14),
            Text(
                error is ApiException
                    ? (error! as ApiException).message
                    : 'Could not load campus data.',
                textAlign: TextAlign.center),
            const SizedBox(height: 14),
            FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Try again')),
          ]),
        ),
      );
}

class _EmptyMessage extends StatelessWidget {
  const _EmptyMessage(this.message);
  final String message;

  @override
  Widget build(BuildContext context) => SectionCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Text(message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge),
        ),
      );
}

Map<String, dynamic> _map(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _items(Map<String, dynamic> data,
    {List<String> keys = const ['data', 'items', 'users']}) {
  Object? candidate;
  for (final key in keys) {
    if (data[key] is List) {
      candidate = data[key];
      break;
    }
  }
  candidate ??= data['data'] is List ? data['data'] : null;
  if (candidate is! List) return const [];
  return candidate.map(_map).toList();
}

int _sessionAttendanceCount(Map<String, dynamic> row) =>
    ((_map(row['_count'])['attendances'] as num?)?.toInt() ??
        (row['attendanceCount'] as num?)?.toInt() ??
        0);

bool _sessionIsActive(Map<String, dynamic> row) => row['status'] == 'ACTIVE';

String _sessionCourseSummary(Map<String, dynamic> row) {
  final course = _map(row['course']);
  if (course.isEmpty) return 'Ad-hoc session — no course linked';
  return '${course['courseCode'] ?? ''} · ${course['courseName'] ?? ''}';
}

String _firstName(String name) =>
    name.trim().isEmpty ? 'there' : name.trim().split(RegExp(r'\s+')).first;
String _friendlyRole(Object? role) =>
    '${role ?? ''}'.replaceAll('_', ' ').toLowerCase();
String _titleCase(String value) {
  final lower = value.replaceAll('_', ' ').toLowerCase();
  if (lower.isEmpty) return lower;
  return '${lower[0].toUpperCase()}${lower.substring(1)}';
}

String _dateText(Object? value) {
  final parsed = DateTime.tryParse('${value ?? ''}');
  if (parsed == null) return '${value ?? ''}';
  final local = parsed.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

Color _connectedSubjectColor(String code) {
  const palette = [
    AppColors.blue,
    AppColors.violet,
    AppColors.orange,
    AppColors.cyan,
    AppColors.success,
  ];
  final total =
      code.toUpperCase().codeUnits.fold<int>(0, (sum, item) => sum + item);
  return palette[total % palette.length];
}
