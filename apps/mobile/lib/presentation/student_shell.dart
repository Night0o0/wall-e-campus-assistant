// The accepted student design is kept here and its cards are populated from
// the authenticated campus API.
// ignore_for_file: unused_element

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import 'brand_logo.dart';
import 'external_links.dart';

const _cs = Color(0xFF4F8EF7);
const _math = Color(0xFFA78BFA);
const _db = Color(0xFFFB923C);
const _net = Color(0xFFF05EAD);
const _ai = Color(0xFFF4C84A);
const _card = Color(0xD9111827);

class StudentShell extends StatefulWidget {
  const StudentShell({
    required this.api,
    required this.session,
    required this.onLogout,
    super.key,
  });

  final CampusGateway api;
  final AuthSession session;
  final VoidCallback onLogout;

  @override
  State<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends State<StudentShell> {
  int _index = 0;
  bool _showProfile = false;
  bool _showNotifications = false;
  int _unreadNotifications = 0;

  List<Widget> get _pages => [
        _TimetablePage(api: widget.api, session: widget.session),
        _AttendancePage(api: widget.api, session: widget.session),
        _ScanQrPage(api: widget.api, session: widget.session),
        _MaterialPage(api: widget.api, session: widget.session),
        _AssignmentsPage(api: widget.api, session: widget.session),
      ];

  @override
  void initState() {
    super.initState();
    _refreshUnreadCount();
  }

  Future<void> _refreshUnreadCount() async {
    try {
      final response = await widget.api.get(
        '/notifications/unread-count',
        widget.session,
      );
      if (mounted) {
        setState(
            () => _unreadNotifications = _integer(response['unreadCount']));
      }
    } catch (_) {
      // The inbox itself still exposes retry UI; a badge failure must not stop
      // the rest of the student shell from loading.
    }
  }

  void _select(int index) {
    setState(() {
      _index = index;
      _showProfile = false;
      _showNotifications = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppColors.backgroundGradient),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: DecoratedBox(
                decoration: const BoxDecoration(color: AppColors.canvas),
                child: Column(
                  children: [
                    _StudentHeader(
                      name: widget.session.name,
                      profileSelected: _showProfile,
                      notificationsSelected: _showNotifications,
                      unreadNotifications: _unreadNotifications,
                      onNotifications: () => setState(() {
                        _showNotifications = true;
                        _showProfile = false;
                      }),
                      onProfile: () => setState(() {
                        _showProfile = true;
                        _showNotifications = false;
                      }),
                    ),
                    Expanded(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        child: KeyedSubtree(
                          key: ValueKey(
                            _showProfile
                                ? 'profile'
                                : _showNotifications
                                    ? 'notifications'
                                    : _index,
                          ),
                          child: _showNotifications
                              ? _InboxPage(
                                  api: widget.api,
                                  session: widget.session,
                                  onUnreadChanged: (value) {
                                    if (mounted &&
                                        value != _unreadNotifications) {
                                      setState(
                                        () => _unreadNotifications = value,
                                      );
                                    }
                                  },
                                )
                              : _showProfile
                                  ? _ProfilePage(
                                      api: widget.api,
                                      session: widget.session,
                                      onLogout: widget.onLogout,
                                    )
                                  : _pages[_index],
                        ),
                      ),
                    ),
                    _StudentBottomNav(index: _index, onSelect: _select),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StudentHeader extends StatelessWidget {
  const _StudentHeader({
    required this.name,
    required this.profileSelected,
    required this.notificationsSelected,
    required this.unreadNotifications,
    required this.onNotifications,
    required this.onProfile,
  });

  final String name;
  final bool profileSelected;
  final bool notificationsSelected;
  final int unreadNotifications;
  final VoidCallback onNotifications;
  final VoidCallback onProfile;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 61,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xD9080C18),
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: .07)),
        ),
      ),
      child: Row(
        children: [
          const LeornianLogo(size: 38),
          const SizedBox(width: 10),
          const Text(
            'Leornian',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              key: const ValueKey('student-notifications'),
              onTap: onNotifications,
              borderRadius: BorderRadius.circular(10),
              child: Ink(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient:
                      notificationsSelected ? AppColors.primaryGradient : null,
                  color: notificationsSelected
                      ? null
                      : Colors.white.withValues(alpha: .07),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Center(
                      child: Icon(
                        Icons.notifications_none_rounded,
                        color: AppColors.ink,
                        size: 20,
                      ),
                    ),
                    if (unreadNotifications > 0)
                      Positioned(
                        right: -5,
                        top: -6,
                        child: Container(
                          constraints: const BoxConstraints(minWidth: 19),
                          height: 19,
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                            color: AppColors.danger,
                            borderRadius: BorderRadius.all(Radius.circular(10)),
                          ),
                          child: Text(
                            unreadNotifications > 99
                                ? '99+'
                                : '$unreadNotifications',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          const Spacer(),
          Material(
            color: Colors.transparent,
            child: InkWell(
              key: const ValueKey('student-profile'),
              onTap: onProfile,
              borderRadius: BorderRadius.circular(10),
              child: Ink(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: profileSelected ? AppColors.primaryGradient : null,
                  color: profileSelected
                      ? null
                      : Colors.white.withValues(alpha: .07),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(
                    name.trim().isEmpty ? 'S' : name.trim()[0].toUpperCase(),
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentBottomNav extends StatelessWidget {
  const _StudentBottomNav({required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  static const _items = [
    ('Timetable', Icons.calendar_month_outlined),
    ('Attendance', Icons.bar_chart_rounded),
    ('Scan QR', Icons.qr_code_2_rounded),
    ('Material', Icons.menu_book_outlined),
    ('Work', Icons.assignment_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 79,
      padding: const EdgeInsets.fromLTRB(0, 10, 0, 11),
      decoration: BoxDecoration(
        color: const Color(0xF20A0E1C),
        border:
            Border(top: BorderSide(color: Colors.white.withValues(alpha: .07))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var itemIndex = 0; itemIndex < _items.length; itemIndex++)
            Expanded(
              child: _NavItem(
                label: _items[itemIndex].$1,
                icon: _items[itemIndex].$2,
                selected: index == itemIndex,
                raised: itemIndex == 2,
                onTap: () => onSelect(itemIndex),
              ),
            ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.selected,
    required this.raised,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final bool raised;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.blue : AppColors.muted;
    if (raised) {
      return SizedBox(
        height: 57,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              right: 0,
              top: -22,
              child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(18),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: AppColors.canvas, width: 4),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x664F8EF7),
                            blurRadius: 18,
                            offset: Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Icon(icon, color: Colors.white, size: 25),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      label,
                      style: const TextStyle(
                        color: AppColors.blue,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 5),
            Text(
              label,
              maxLines: 1,
              style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StudentPage extends StatelessWidget {
  const _StudentPage({
    required this.eyebrow,
    required this.title,
    required this.children,
  });

  final String eyebrow;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            eyebrow,
            style: const TextStyle(
              color: AppColors.muted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 28,
              height: 1.1,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 28),
          ..._separate(children, const SizedBox(height: 16)),
        ],
      ),
    );
  }
}

List<Widget> _separate(List<Widget> children, Widget separator) => [
      for (var index = 0; index < children.length; index++) ...[
        if (index > 0) separator,
        children[index],
      ],
    ];

class _AppCard extends StatelessWidget {
  const _AppCard(
      {required this.child, this.padding = const EdgeInsets.all(18)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: .06)),
      ),
      child: child,
    );
  }
}

class _TimetablePage extends StatefulWidget {
  const _TimetablePage({required this.api, required this.session});

  final CampusGateway api;
  final AuthSession session;

  @override
  State<_TimetablePage> createState() => _TimetablePageState();
}

class _TimetablePageState extends State<_TimetablePage> {
  late Future<Map<String, dynamic>> _future;
  String? _selectedDay;

  static const _days = [
    ('SAT', 'SATURDAY'),
    ('SUN', 'SUNDAY'),
    ('MON', 'MONDAY'),
    ('TUE', 'TUESDAY'),
    ('WED', 'WEDNESDAY'),
    ('THU', 'THURSDAY'),
  ];

  @override
  void initState() {
    super.initState();
    _future = widget.api.get('/students/me/schedule', widget.session);
  }

  Future<void> _refresh() async {
    final next = widget.api.get('/students/me/schedule', widget.session);
    setState(() {
      _future = next;
    });
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _StudentLoadError(error: snapshot.error, onRetry: _refresh);
        }

        final data = snapshot.data ?? const <String, dynamic>{};
        final criteria = _studentMap(data['criteria']);
        final schedules = _studentItems(data, const ['schedules']);
        _selectedDay ??= _defaultScheduleDay(schedules);
        final visible =
            schedules.where((row) => row['dayOfWeek'] == _selectedDay).toList();
        final weekStart = _saturdayOfCurrentWeek(clock.now());

        return RefreshIndicator(
          onRefresh: _refresh,
          child: _StudentPage(
            eyebrow: 'SCHEDULE',
            title: 'My Timetable',
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _MetaChip('${criteria['faculty'] ?? 'Faculty'}'),
                      _MetaChip('${criteria['department'] ?? 'Department'}'),
                      _MetaChip('Level ${criteria['level'] ?? '—'}'),
                      _MetaChip('${criteria['semesterLabel'] ?? 'Semester'}'),
                      _MetaChip('Section ${criteria['section'] ?? '—'}'),
                    ],
                  ),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var index = 0; index < _days.length; index++)
                    _DayPill(
                      _days[index].$1,
                      '${weekStart.add(Duration(days: index)).day}'
                          .padLeft(2, '0'),
                      selected: _selectedDay == _days[index].$2,
                      onTap: () =>
                          setState(() => _selectedDay = _days[index].$2),
                    ),
                ],
              ),
              Row(
                children: [
                  Text(
                    _shortDay(_selectedDay),
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${visible.length} ${visible.length == 1 ? 'lecture' : 'lectures'}',
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 12),
                  ),
                ],
              ),
              if (visible.isEmpty)
                const _StudentEmptyCard('No lectures scheduled for this day.'),
              for (final row in visible)
                _LectureCard(
                  time:
                      '${_displayTime(row['startTime'])} – ${_displayTime(row['endTime'])}',
                  room: '${row['room'] ?? 'No room'}',
                  code:
                      '${_studentMap(row['course'])['courseCode'] ?? 'COURSE'}',
                  title:
                      '${_studentMap(row['course'])['courseName'] ?? 'Lecture'}',
                  initial: _initial(
                      '${_studentMap(row['instructor'])['fullName'] ?? 'I'}'),
                  instructor:
                      '${_studentMap(row['instructor'])['fullName'] ?? 'Instructor'}',
                  rank:
                      '${_studentMap(row['instructor'])['jobTitle'] ?? 'Teaching staff'}',
                  color: _subjectColor(
                      '${_studentMap(row['course'])['courseCode'] ?? ''}'),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .04),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: .08)),
      ),
      child: Text(label,
          style: const TextStyle(color: AppColors.muted, fontSize: 10)),
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill(this.day, this.date, {this.selected = false, this.onTap});

  final String day;
  final String date;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          key: ValueKey('student-day-$day-${selected ? 'selected' : 'idle'}'),
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          width: 54,
          height: 58,
          decoration: BoxDecoration(
            gradient: selected ? AppColors.primaryGradient : null,
            color: selected ? null : Colors.white.withValues(alpha: .05),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected
                  ? AppColors.blue.withValues(alpha: .8)
                  : Colors.white.withValues(alpha: .06),
            ),
            boxShadow: selected
                ? const [
                    BoxShadow(
                      color: Color(0x554F8EF7),
                      blurRadius: 16,
                      offset: Offset(0, 5),
                    ),
                  ]
                : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                day,
                style: TextStyle(
                  color: selected ? Colors.white : AppColors.muted,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                date,
                style: TextStyle(
                  color: selected ? Colors.white : AppColors.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LectureCard extends StatelessWidget {
  const _LectureCard({
    required this.time,
    required this.room,
    required this.code,
    required this.title,
    required this.initial,
    required this.instructor,
    required this.rank,
    required this.color,
  });

  final String time;
  final String room;
  final String code;
  final String title;
  final String initial;
  final String instructor;
  final String rank;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: .06)),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: color),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 18, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          time,
                          style: TextStyle(
                            color: color,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const Spacer(),
                        const Icon(Icons.location_on_outlined,
                            color: AppColors.muted, size: 15),
                        const SizedBox(width: 3),
                        Text(room,
                            style: const TextStyle(
                                color: AppColors.muted, fontSize: 11)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _CourseBadge(code: code, color: color),
                    const SizedBox(height: 9),
                    Text(
                      title,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 11),
                    Row(
                      children: [
                        Container(
                          width: 30,
                          height: 30,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Text(
                            initial,
                            style: TextStyle(
                              color: color,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                instructor,
                                style: const TextStyle(
                                  color: AppColors.ink,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                rank,
                                style: const TextStyle(
                                  color: AppColors.muted,
                                  fontSize: 10,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CourseBadge extends StatelessWidget {
  const _CourseBadge({required this.code, required this.color});

  final String code;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .22),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        code,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _AttendancePage extends StatefulWidget {
  const _AttendancePage({required this.api, required this.session});

  final CampusGateway api;
  final AuthSession session;

  @override
  State<_AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<_AttendancePage> {
  bool _history = false;
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final values = await Future.wait([
      widget.api.get('/attendance/summary', widget.session),
      widget.api.get('/attendance/history', widget.session),
    ]);
    return {'summary': values[0], 'history': values[1]};
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() {
      _future = next;
    });
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _StudentLoadError(error: snapshot.error, onRetry: _refresh);
        }

        final payload = snapshot.data ?? const <String, dynamic>{};
        final summary = _studentMap(payload['summary']);
        final overall = _studentMap(summary['overall']);
        final courseRows = _studentItems(summary, const ['courses']);
        final historyRows = _studentItems(
          _studentMap(payload['history']),
          const ['data'],
        );
        final overallRate = _rate(overall['attendanceRate']);
        final courses = courseRows.map((row) {
          final course = _studentMap(row['course']);
          final code = '${course['courseCode'] ?? 'GENERAL'}';
          return (
            code,
            '${course['courseName'] ?? 'General attendance'}',
            _rate(row['attendanceRate']),
            '${row['attended'] ?? 0}/${row['recordedLectures'] ?? 0} sessions',
            _integer(row['present']),
            _integer(row['late']),
            _integer(row['absent']),
            _subjectColor(code),
          );
        }).toList();
        final history = historyRows.map((row) {
          final session = _studentMap(row['session']);
          final course = _studentMap(session['course']);
          final code = '${course['courseCode'] ?? 'GENERAL'}';
          return (
            code,
            '${course['courseName'] ?? session['title'] ?? 'Attendance session'}',
            _dateAndTime(session['startTime']),
            '${row['status'] ?? 'PRESENT'}',
            _timeFromDate(row['scanTime']),
            _subjectColor(code),
          );
        }).toList();

        return RefreshIndicator(
          onRefresh: _refresh,
          child: _StudentPage(
            eyebrow: 'RECORDS',
            title: 'My Attendance',
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('$overallRate%',
                      style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 38,
                          height: 1,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(width: 8),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 4),
                    child: Text('OVERALL',
                        style: TextStyle(
                            color: AppColors.muted,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1)),
                  ),
                ],
              ),
              SizedBox(
                height: 91,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    _SummaryPill(
                        'ALL COURSES',
                        '$overallRate%',
                        '${overall['attended'] ?? 0} of ${overall['recordedLectures'] ?? 0} sessions',
                        AppColors.blue,
                        wide: true,
                        active: true),
                    for (final course in courses)
                      _SummaryPill(
                        course.$1,
                        '${course.$3}%',
                        '${course.$5 + course.$6} of ${course.$5 + course.$6 + course.$7}',
                        course.$8,
                      ),
                  ],
                ),
              ),
              Container(
                height: 44,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .04),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  children: [
                    _AttendanceTab(
                      label: 'By Course',
                      selected: !_history,
                      onTap: () => setState(() => _history = false),
                    ),
                    _AttendanceTab(
                      label: 'History',
                      selected: _history,
                      onTap: () => setState(() => _history = true),
                    ),
                  ],
                ),
              ),
              if (!_history)
                if (courses.isEmpty)
                  const _StudentEmptyCard(
                      'No attendance has been recorded yet.')
                else
                  ...courses
                      .map((course) => _AttendanceCourseCard(course: course))
              else if (history.isEmpty)
                const _StudentEmptyCard('Attendance history is empty.')
              else
                ...history.map((row) => _HistoryCard(row: row)),
            ],
          ),
        );
      },
    );
  }
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill(this.code, this.percent, this.sessions, this.color,
      {this.wide = false, this.active = false});

  final String code;
  final String percent;
  final String sessions;
  final Color color;
  final bool wide;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: wide ? 116 : 88,
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: active ? AppColors.blue.withValues(alpha: .22) : _card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: active
              ? AppColors.blue.withValues(alpha: .5)
              : Colors.white.withValues(alpha: .06),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(code,
              maxLines: 1,
              style: TextStyle(
                  color: active ? Colors.white70 : color,
                  fontSize: 10,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 5),
          Text(percent,
              style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 20,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(sessions,
              maxLines: 1,
              style: const TextStyle(color: AppColors.muted, fontSize: 9)),
        ],
      ),
    );
  }
}

class _AttendanceTab extends StatelessWidget {
  const _AttendanceTab(
      {required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: AnimatedContainer(
            key: ValueKey(
                'attendance-tab-${label.toLowerCase().replaceAll(' ', '-')}-${selected ? 'selected' : 'idle'}'),
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            decoration: BoxDecoration(
              gradient: selected ? AppColors.primaryGradient : null,
              color: selected ? null : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              boxShadow: selected
                  ? const [
                      BoxShadow(
                        color: Color(0x444F8EF7),
                        blurRadius: 12,
                      ),
                    ]
                  : null,
            ),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : AppColors.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AttendanceCourseCard extends StatelessWidget {
  const _AttendanceCourseCard({required this.course});

  final (String, String, int, String, int, int, int, Color) course;

  @override
  Widget build(BuildContext context) {
    final (code, name, percent, sessions, present, late, absent, color) =
        course;
    return _AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _CourseBadge(code: code, color: color),
              const Spacer(),
              Text('$percent%',
                  style: const TextStyle(
                      color: Color(0xFF4ADE80),
                      fontSize: 28,
                      height: 1,
                      fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 7),
          Row(
            children: [
              Expanded(
                child: Text(name,
                    style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w700)),
              ),
              Text(sessions,
                  style: const TextStyle(color: AppColors.muted, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: percent / 100,
              minHeight: 6,
              color: color,
              backgroundColor: Colors.white.withValues(alpha: .06),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 14,
            children: [
              _AttendanceDot('Present: $present', const Color(0xFF4ADE80)),
              _AttendanceDot('Late: $late', _ai),
              _AttendanceDot('Absent: $absent', AppColors.muted),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttendanceDot extends StatelessWidget {
  const _AttendanceDot(this.label, this.color);

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(color: AppColors.muted, fontSize: 10)),
      ],
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.row});

  final (String, String, String, String, String, Color) row;

  @override
  Widget build(BuildContext context) {
    final (code, name, date, status, scanned, color) = row;
    final late = status == 'LATE';
    final absent = status == 'ABSENT';
    final statusColor = absent
        ? AppColors.danger
        : late
            ? _ai
            : const Color(0xFF4ADE80);
    return _AppCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _CourseBadge(code: code, color: color),
                const SizedBox(height: 8),
                Text(name,
                    style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(date,
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 10)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(status,
                    style: TextStyle(
                        color: statusColor,
                        fontSize: 9,
                        fontWeight: FontWeight.w800)),
              ),
              const SizedBox(height: 7),
              Text(scanned,
                  style: const TextStyle(color: AppColors.muted, fontSize: 10)),
            ],
          ),
        ],
      ),
    );
  }
}

enum _ScanResult { none, success, expired, recorded }

class _ScanQrPage extends StatefulWidget {
  const _ScanQrPage({required this.api, required this.session});

  final CampusGateway api;
  final AuthSession session;

  @override
  State<_ScanQrPage> createState() => _ScanQrPageState();
}

class _ScanQrPageState extends State<_ScanQrPage> {
  _ScanResult _result = _ScanResult.none;
  bool _submitting = false;
  String? _message;
  Map<String, dynamic>? _scan;

  Future<void> _submit(String token) async {
    if (_submitting || _result != _ScanResult.none) return;
    setState(() => _submitting = true);
    try {
      final response = await widget.api.post(
        '/attendance/scan',
        widget.session,
        {'token': token},
      );
      if (!mounted) return;
      setState(() {
        _scan = response;
        _message = '${response['message'] ?? 'Attendance recorded'}';
        _result = _ScanResult.success;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _message = error.message;
        _result = error.code == 'ALREADY_RECORDED'
            ? _ScanResult.recorded
            : _ScanResult.expired;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _reset() {
    setState(() {
      _result = _ScanResult.none;
      _message = null;
      _scan = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return _StudentPage(
      eyebrow: 'ATTENDANCE',
      title: 'Scan QR',
      children: [
        AspectRatio(
          aspectRatio: 1.08,
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF070B16),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: Colors.white.withValues(alpha: .07)),
            ),
            child: Stack(
              children: [
                if (_result == _ScanResult.none)
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: MobileScanner(
                        onDetect: (capture) {
                          final value = capture.barcodes.firstOrNull?.rawValue;
                          if (value != null) _submit(value);
                        },
                      ),
                    ),
                  ),
                const Positioned.fill(
                  child: CustomPaint(painter: _ScannerCornersPainter()),
                ),
                if (_result != _ScanResult.none || _submitting)
                  Center(child: _ScanState(result: _result)),
              ],
            ),
          ),
        ),
        if (_result != _ScanResult.none)
          _AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('SCAN RESULT',
                    style: TextStyle(
                        color: AppColors.muted,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1)),
                const SizedBox(height: 12),
                Text(_message ?? '',
                    style: const TextStyle(color: AppColors.ink, fontSize: 13)),
                if (_scan != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    '${_studentMap(_scan!['course'])['courseCode'] ?? ''} · ${_studentMap(_scan!['course'])['courseName'] ?? _studentMap(_scan!['session'])['title'] ?? ''} · ${_studentMap(_scan!['session'])['room'] ?? ''}',
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 11),
                  ),
                ],
              ],
            ),
          ),
        if (_result != _ScanResult.none)
          _ScanButton(
            label: 'Scan another QR code',
            color: AppColors.blue,
            onTap: _reset,
          ),
      ],
    );
  }
}

class _ScannerCornersPainter extends CustomPainter {
  const _ScannerCornersPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.blue
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.square
      ..style = PaintingStyle.stroke;
    const inset = 28.0;
    const length = 27.0;
    final path = Path()
      ..moveTo(inset, inset + length)
      ..lineTo(inset, inset)
      ..lineTo(inset + length, inset)
      ..moveTo(size.width - inset - length, inset)
      ..lineTo(size.width - inset, inset)
      ..lineTo(size.width - inset, inset + length)
      ..moveTo(inset, size.height - inset - length)
      ..lineTo(inset, size.height - inset)
      ..lineTo(inset + length, size.height - inset)
      ..moveTo(size.width - inset - length, size.height - inset)
      ..lineTo(size.width - inset, size.height - inset)
      ..lineTo(size.width - inset, size.height - inset - length);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ScanState extends StatelessWidget {
  const _ScanState({required this.result});

  final _ScanResult result;

  @override
  Widget build(BuildContext context) {
    if (result == _ScanResult.none) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.qr_code_2_rounded, color: Color(0xFF2B3345), size: 58),
          SizedBox(height: 14),
          Text('Point camera at QR code',
              style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ],
      );
    }

    final color = switch (result) {
      _ScanResult.success => const Color(0xFF4ADE80),
      _ScanResult.expired => _db,
      _ScanResult.recorded => _math,
      _ScanResult.none => AppColors.muted,
    };
    final icon = switch (result) {
      _ScanResult.success => Icons.check_rounded,
      _ScanResult.expired => Icons.timer_off_outlined,
      _ScanResult.recorded => Icons.info_outline_rounded,
      _ScanResult.none => Icons.qr_code_2_rounded,
    };
    final label = switch (result) {
      _ScanResult.success => 'Attendance Recorded!',
      _ScanResult.expired => 'QR Code Expired',
      _ScanResult.recorded => 'Already Recorded',
      _ScanResult.none => '',
    };
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
              color: color.withValues(alpha: .16), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 32),
        ),
        const SizedBox(height: 14),
        Text(label,
            style: TextStyle(
                color: color, fontSize: 16, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _ScanButton extends StatelessWidget {
  const _ScanButton(
      {required this.label, required this.color, required this.onTap});

  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        minimumSize: const Size(double.infinity, 54),
        backgroundColor: color.withValues(alpha: .09),
        side: BorderSide(color: color.withValues(alpha: .35)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
      ),
      child: Text(label),
    );
  }
}

class _MaterialPage extends StatefulWidget {
  const _MaterialPage({required this.api, required this.session});

  final CampusGateway api;
  final AuthSession session;

  @override
  State<_MaterialPage> createState() => _MaterialPageState();
}

class _MaterialPageState extends State<_MaterialPage> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.get('/materials/my', widget.session);
  }

  Future<void> _refresh() async {
    final next = widget.api.get('/materials/my', widget.session);
    setState(() {
      _future = next;
    });
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _StudentLoadError(error: snapshot.error, onRetry: _refresh);
        }
        final rows =
            _studentItems(snapshot.data ?? const {}, const ['courses']);
        final groups = rows.map((row) {
          final course = _studentMap(row['course']);
          final code = '${course['courseCode'] ?? 'COURSE'}';
          final materials = _studentItems(row, const ['materials'])
              .map((material) => (
                    '${material['title'] ?? 'Course material'}',
                    'Google Drive · ${_shortDate(material['createdAt'])}',
                    '${material['driveUrl'] ?? ''}',
                  ))
              .toList();
          return (
            code,
            '${course['courseName'] ?? 'Course material'}',
            _subjectColor(code),
            materials,
          );
        }).toList();

        return RefreshIndicator(
          onRefresh: _refresh,
          child: _StudentPage(
            eyebrow: 'RESOURCES',
            title: 'Material',
            children: [
              if (groups.isEmpty)
                const _StudentEmptyCard('No material has been published yet.'),
              for (final group in groups) _MaterialGroup(group: group),
            ],
          ),
        );
      },
    );
  }
}

class _MaterialGroup extends StatelessWidget {
  const _MaterialGroup({required this.group});

  final (String, String, Color, List<(String, String, String)>) group;

  @override
  Widget build(BuildContext context) {
    final (code, title, color, files) = group;
    return _AppCard(
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(Icons.menu_book_outlined, color: color, size: 21),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _CourseBadge(code: code, color: color),
                    const SizedBox(height: 5),
                    Text(title,
                        style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              Text('${files.length} files',
                  style: const TextStyle(color: AppColors.muted, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 15),
          ..._separate(
            files
                .map((file) => _MaterialFile(
                      title: file.$1,
                      metadata: file.$2,
                      url: file.$3,
                      color: color,
                    ))
                .toList(),
            const SizedBox(height: 8),
          ),
        ],
      ),
    );
  }
}

class _MaterialFile extends StatelessWidget {
  const _MaterialFile(
      {required this.title,
      required this.metadata,
      required this.url,
      required this.color});

  final String title;
  final String metadata;
  final String url;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: url.isEmpty ? null : () => openExternalLink(context, url),
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .035),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: .05)),
          ),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(Icons.open_in_new_rounded, color: color, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 3),
                    Text(metadata,
                        style: const TextStyle(
                            color: AppColors.muted, fontSize: 10)),
                  ],
                ),
              ),
              Icon(
                url.isEmpty
                    ? Icons.link_off_rounded
                    : Icons.chevron_right_rounded,
                color: url.isEmpty ? AppColors.muted : color,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AssignmentsPage extends StatefulWidget {
  const _AssignmentsPage({required this.api, required this.session});

  final CampusGateway api;
  final AuthSession session;

  @override
  State<_AssignmentsPage> createState() => _AssignmentsPageState();
}

class _AssignmentsPageState extends State<_AssignmentsPage> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.get('/assignments', widget.session);
  }

  Future<void> _refresh() async {
    final next = widget.api.get('/assignments', widget.session);
    setState(() {
      _future = next;
    });
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _StudentLoadError(error: snapshot.error, onRetry: _refresh);
        }
        final assignments =
            _studentItems(snapshot.data ?? const {}, const ['assignments']);
        return RefreshIndicator(
          onRefresh: _refresh,
          child: _StudentPage(
            eyebrow: 'COURSEWORK',
            title: 'Assignments',
            children: [
              if (assignments.isEmpty)
                const _StudentEmptyCard('No assignments have been published.'),
              for (final assignment in assignments)
                _AssignmentCard(assignment: assignment),
            ],
          ),
        );
      },
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard({required this.assignment});

  final Map<String, dynamic> assignment;

  @override
  Widget build(BuildContext context) {
    final offering = _studentMap(assignment['offering']);
    final course = _studentMap(offering['course']);
    final code = '${course['courseCode'] ?? 'COURSE'}';
    final color = _subjectColor(code);
    final grades = _studentItems(assignment, const ['grades']);
    final grade = grades.isEmpty ? null : grades.first;
    final deadline = DateTime.tryParse('${assignment['deadline'] ?? ''}');

    return _AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _CourseBadge(code: code, color: color),
              const Spacer(),
              Text(
                deadline == null
                    ? 'No deadline'
                    : _shortDate(deadline.toIso8601String()),
                style: const TextStyle(color: AppColors.muted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '${assignment['title'] ?? 'Assignment'}',
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${assignment['description'] ?? 'No additional instructions.'}',
            style: const TextStyle(color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              grade == null
                  ? 'Result not published · Maximum ${assignment['maxScore']}'
                  : 'Result: ${grade['score']} / ${assignment['maxScore']}${grade['feedback'] == null ? '' : '\n${grade['feedback']}'}',
              style: TextStyle(color: grade == null ? AppColors.muted : color),
            ),
          ),
        ],
      ),
    );
  }
}

class _InboxPage extends StatefulWidget {
  const _InboxPage({
    required this.api,
    required this.session,
    required this.onUnreadChanged,
  });

  final CampusGateway api;
  final AuthSession session;
  final ValueChanged<int> onUnreadChanged;

  @override
  State<_InboxPage> createState() => _InboxPageState();
}

class _InboxPageState extends State<_InboxPage> {
  late Future<Map<String, dynamic>> _future;
  int? _lastReportedUnread;

  @override
  void initState() {
    super.initState();
    _future = widget.api.get('/notifications', widget.session);
  }

  Future<void> _refresh() async {
    final next = widget.api.get('/notifications', widget.session);
    setState(() {
      _future = next;
    });
    await next;
  }

  Future<void> _markAllRead() async {
    try {
      await widget.api.patch('/notifications/read-all', widget.session, {});
      await _refresh();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _markRead(String id) async {
    try {
      await widget.api.patch('/notifications/$id/read', widget.session, {});
      await _refresh();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _openNotification(
    (String, String, String, String, String, IconData, Color, bool) item,
  ) async {
    if (item.$8 && item.$1.isNotEmpty) await _markRead(item.$1);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: Icon(item.$6, color: item.$7, size: 30),
        title: Text(item.$2),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item.$4),
            const SizedBox(height: 16),
            Text(
              item.$5,
              style: const TextStyle(color: AppColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 6),
            Text(
              item.$3,
              style: const TextStyle(color: AppColors.muted, fontSize: 11),
            ),
          ],
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _StudentLoadError(error: snapshot.error, onRetry: _refresh);
        }
        final data = snapshot.data ?? const <String, dynamic>{};
        final rows = _studentItems(data, const ['data']);
        final items = rows.map((row) {
          final lecture = _studentMap(row['lecture']);
          final course = _studentMap(lecture['course']);
          final code = '${course['courseCode'] ?? ''}';
          final type = '${row['type'] ?? ''}';
          final accountNotice = type.startsWith('ACCOUNT_');
          return (
            '${row['id'] ?? ''}',
            '${row['title'] ?? 'Notification'}',
            _shortDate(row['createdAt']),
            '${row['body'] ?? ''}',
            lecture.isEmpty
                ? 'Campus account notice'
                : '$code ${course['courseName'] ?? ''} · ${lecture['dayOfWeek'] ?? ''} · ${lecture['startTime'] ?? ''}',
            accountNotice
                ? Icons.verified_user_outlined
                : Icons.schedule_rounded,
            accountNotice ? const Color(0xFF4ADE80) : _subjectColor(code),
            row['isRead'] != true,
          );
        }).toList();
        final unread = _integer(data['unreadCount']);
        if (_lastReportedUnread != unread) {
          _lastReportedUnread = unread;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) widget.onUnreadChanged(unread);
          });
        }

        return RefreshIndicator(
          onRefresh: _refresh,
          child: _StudentPage(
            eyebrow: 'INBOX',
            title: 'Notifications',
            children: [
              Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.blue.withValues(alpha: .16),
                      shape: BoxShape.circle,
                    ),
                    child: Text('$unread',
                        style: const TextStyle(
                            color: AppColors.blue,
                            fontSize: 12,
                            fontWeight: FontWeight.w800)),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: unread == 0 ? null : _markAllRead,
                    icon: const Icon(Icons.done_all_rounded, size: 17),
                    label: const Text('Mark all read'),
                  ),
                ],
              ),
              if (items.isEmpty)
                const _StudentEmptyCard('Your inbox is empty.')
              else
                ...items.map(
                  (item) => _NotificationCard(
                    item: item,
                    onTap: () => _openNotification(item),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.item, this.onTap});

  final (String, String, String, String, String, IconData, Color, bool) item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (_, title, time, message, metadata, icon, color, unread) = item;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: unread ? AppColors.blue.withValues(alpha: .07) : _card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: unread
                  ? AppColors.blue.withValues(alpha: .22)
                  : Colors.white.withValues(alpha: .06),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(title,
                              style: const TextStyle(
                                  color: AppColors.ink,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700)),
                        ),
                        Text(time,
                            style: const TextStyle(
                                color: AppColors.muted, fontSize: 10)),
                        if (unread) ...[
                          const SizedBox(width: 8),
                          const Padding(
                            padding: EdgeInsets.only(top: 3),
                            child: CircleAvatar(
                                radius: 4, backgroundColor: AppColors.blue),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 7),
                    Text(message,
                        style: const TextStyle(
                            color: AppColors.muted,
                            fontSize: 12,
                            height: 1.45)),
                    const SizedBox(height: 9),
                    Row(
                      children: [
                        const Icon(Icons.calendar_today_outlined,
                            color: AppColors.muted, size: 12),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(metadata,
                              style: const TextStyle(
                                  color: AppColors.muted, fontSize: 9)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfilePage extends StatefulWidget {
  const _ProfilePage({
    required this.api,
    required this.session,
    required this.onLogout,
  });

  final CampusGateway api;
  final AuthSession session;
  final VoidCallback onLogout;

  @override
  State<_ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<_ProfilePage> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final values = await Future.wait([
      widget.api.get('/auth/profile', widget.session),
      widget.api.get('/students/me/profile', widget.session),
    ]);
    return {'user': values[0]['user'], 'profile': values[1]['profile']};
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() {
      _future = next;
    });
    await next;
  }

  Future<void> _editProfile(Map<String, dynamic> profile) async {
    final updated = await showDialog<bool>(
      context: context,
      builder: (_) => _ProfileEditorDialog(
        profile: profile,
        api: widget.api,
        session: widget.session,
      ),
    );
    if (updated != true || !mounted) return;

    try {
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated.')),
        );
      }
    } catch (_) {
      // The refreshed Future is already displayed by FutureBuilder, including
      // its normal retry action. Avoid turning that handled state into an
      // unhandled callback exception as well.
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _StudentLoadError(
            error: snapshot.error,
            onRetry: _refresh,
          );
        }
        final data = snapshot.data ?? const <String, dynamic>{};
        final user = _studentMap(data['user']);
        final profile = _studentMap(data['profile']);
        final fields = [
          ('Faculty', '${profile['faculty'] ?? '—'}'),
          ('Department', '${profile['department'] ?? '—'}'),
          ('Level', '${profile['level'] ?? '—'}'),
          ('Semester', '${profile['semester'] ?? '—'}'),
          ('Section', '${profile['section'] ?? '—'}'),
          ('Group', '${profile['groupName'] ?? '—'}'),
          ('Academic Year', '${profile['academicYear'] ?? '—'}'),
          ('Phone', '${profile['phoneNumber'] ?? '—'}'),
          ('National ID', '${profile['nationalId'] ?? '—'}'),
          ('Date of Birth', _shortDate(profile['dateOfBirth'])),
        ];
        final completed = profile['status'] == 'COMPLETED';

        return _StudentPage(
          eyebrow: 'ACCOUNT',
          title: 'My Profile',
          children: [
            _AppCard(
              padding: const EdgeInsets.all(24),
              child: Row(
                children: [
                  Container(
                    width: 68,
                    height: 68,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: AppColors.primaryGradient,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Text(
                        _initial('${user['fullName'] ?? widget.session.name}'),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${user['fullName'] ?? widget.session.name}',
                            style: const TextStyle(
                                color: AppColors.ink,
                                fontSize: 19,
                                fontWeight: FontWeight.w800)),
                        const SizedBox(height: 5),
                        Text('ID: ${user['universityId'] ?? '—'}',
                            style: const TextStyle(
                                color: AppColors.muted, fontSize: 12)),
                        const SizedBox(height: 10),
                        _CompletedPill(completed: completed),
                      ],
                    ),
                  ),
                  IconButton(
                    key: const ValueKey('profile-edit'),
                    tooltip: 'Edit profile',
                    onPressed: () => _editProfile(profile),
                    icon: const Icon(Icons.edit_rounded),
                    color: AppColors.blue,
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.blue.withValues(alpha: .12),
                    ),
                  ),
                ],
              ),
            ),
            _AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('ACADEMIC INFO',
                      style: TextStyle(
                          color: AppColors.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1)),
                  const SizedBox(height: 16),
                  for (var index = 0; index < fields.length; index++) ...[
                    _ProfileField(
                        label: fields[index].$1, value: fields[index].$2),
                    if (index != fields.length - 1)
                      Divider(
                          color: Colors.white.withValues(alpha: .06),
                          height: 24),
                  ],
                ],
              ),
            ),
            _AppCard(
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 21,
                    backgroundColor: Color(0x2634D399),
                    child: Icon(Icons.check_rounded,
                        color: Color(0xFF4ADE80), size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            completed
                                ? 'Registration Complete'
                                : 'Profile Incomplete',
                            style: const TextStyle(
                                color: AppColors.ink,
                                fontSize: 14,
                                fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(
                            completed
                                ? 'Your academic profile is ready for timetable matching'
                                : 'Complete your details to unlock all student features',
                            style: const TextStyle(
                                color: AppColors.muted, fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: widget.onLogout,
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Sign out'),
            ),
          ],
        );
      },
    );
  }
}

class _ProfileEditorDialog extends StatefulWidget {
  const _ProfileEditorDialog({
    required this.profile,
    required this.api,
    required this.session,
  });

  final Map<String, dynamic> profile;
  final CampusGateway api;
  final AuthSession session;

  @override
  State<_ProfileEditorDialog> createState() => _ProfileEditorDialogState();
}

class _ProfileEditorDialogState extends State<_ProfileEditorDialog> {
  late final Map<String, TextEditingController> values;
  bool saving = false;
  String? formError;

  @override
  void initState() {
    super.initState();
    final profile = widget.profile;
    values = <String, TextEditingController>{
      'faculty': TextEditingController(text: '${profile['faculty'] ?? ''}'),
      'department':
          TextEditingController(text: '${profile['department'] ?? ''}'),
      'level': TextEditingController(text: '${profile['level'] ?? ''}'),
      'semester': TextEditingController(text: '${profile['semester'] ?? ''}'),
      'section': TextEditingController(text: '${profile['section'] ?? ''}'),
      'groupName': TextEditingController(text: '${profile['groupName'] ?? ''}'),
      'academicYear':
          TextEditingController(text: '${profile['academicYear'] ?? ''}'),
      'phoneNumber':
          TextEditingController(text: '${profile['phoneNumber'] ?? ''}'),
      'nationalId':
          TextEditingController(text: '${profile['nationalId'] ?? ''}'),
      'dateOfBirth':
          TextEditingController(text: _profileDate(profile['dateOfBirth'])),
    };
  }

  @override
  void dispose() {
    for (final controller in values.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final level = int.tryParse(values['level']!.text.trim());
    if (level == null) {
      setState(() => formError = 'Level must be a whole number.');
      return;
    }

    final body = <String, dynamic>{'level': level};
    for (final key in values.keys.where((key) => key != 'level')) {
      final value = values[key]!.text.trim();
      if (value.isNotEmpty) body[key] = value;
    }

    setState(() {
      saving = true;
      formError = null;
    });
    try {
      await widget.api.patch(
        '/students/me/profile',
        widget.session,
        body,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        saving = false;
        formError = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        saving = false;
        formError = 'The profile could not be saved. Try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.edit_rounded, color: AppColors.blue),
          SizedBox(width: 10),
          Text('Edit profile'),
        ],
      ),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ProfileInput('Faculty', values['faculty']!),
              _ProfileInput('Department', values['department']!),
              _ProfileInput('Level', values['level']!, number: true),
              _ProfileInput('Semester', values['semester']!),
              _ProfileInput('Section', values['section']!),
              _ProfileInput('Group', values['groupName']!),
              _ProfileInput('Academic year', values['academicYear']!),
              _ProfileInput(
                'Phone number',
                values['phoneNumber']!,
                phone: true,
              ),
              _ProfileInput(
                'National ID',
                values['nationalId']!,
                number: true,
              ),
              _ProfileInput(
                'Date of birth (YYYY-MM-DD)',
                values['dateOfBirth']!,
              ),
              if (formError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    formError!,
                    style: const TextStyle(
                      color: AppColors.orange,
                      fontSize: 12,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton.icon(
          key: const ValueKey('profile-save'),
          onPressed: saving ? null : _save,
          icon: saving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.save_rounded),
          label: Text(saving ? 'Saving…' : 'Save'),
        ),
      ],
    );
  }
}

class _ProfileInput extends StatelessWidget {
  const _ProfileInput(
    this.label,
    this.controller, {
    this.number = false,
    this.phone = false,
  });

  final String label;
  final TextEditingController controller;
  final bool number;
  final bool phone;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: controller,
          keyboardType: phone
              ? TextInputType.phone
              : number
                  ? TextInputType.number
                  : TextInputType.text,
          decoration: InputDecoration(labelText: label),
        ),
      );
}

class _CompletedPill extends StatelessWidget {
  const _CompletedPill({this.completed = true});

  final bool completed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: (completed ? const Color(0xFF4ADE80) : AppColors.orange)
            .withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(completed ? 'COMPLETED' : 'INCOMPLETE',
          style: TextStyle(
              color: completed ? const Color(0xFF4ADE80) : AppColors.orange,
              fontSize: 10,
              fontWeight: FontWeight.w800)),
    );
  }
}

class _ProfileField extends StatelessWidget {
  const _ProfileField({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label,
              style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        ),
        const SizedBox(width: 16),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _StudentEmptyCard extends StatelessWidget {
  const _StudentEmptyCard(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => _AppCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted, fontSize: 12),
          ),
        ),
      );
}

class _StudentLoadError extends StatelessWidget {
  const _StudentLoadError({required this.error, required this.onRetry});

  final Object? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => _StudentPage(
        eyebrow: 'CONNECTION',
        title: 'Could not load this page',
        children: [
          _AppCard(
            child: Column(
              children: [
                const Icon(Icons.cloud_off_rounded,
                    color: AppColors.orange, size: 42),
                const SizedBox(height: 12),
                Text(
                  error is ApiException
                      ? (error! as ApiException).message
                      : 'The campus data could not be loaded.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        ],
      );
}

Map<String, dynamic> _studentMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _studentItems(
  Map<String, dynamic> data,
  List<String> keys,
) {
  for (final key in keys) {
    final value = data[key];
    if (value is List) return value.map(_studentMap).toList();
  }
  return const [];
}

Color _subjectColor(String code) {
  const palette = [_cs, _math, _db, _net, _ai];
  final normalized = code.trim().toUpperCase();
  final explicit = <String, Color>{
    'MEC201': _db,
    'MEC202': _cs,
    'MEC203': _net,
    'MEC204': _math,
    'MEC205': _ai,
  };
  if (explicit.containsKey(normalized)) return explicit[normalized]!;
  final total = normalized.codeUnits.fold<int>(0, (sum, item) => sum + item);
  return palette[total % palette.length];
}

int _integer(Object? value) => value is num ? value.toInt() : 0;
int _rate(Object? value) => value is num ? value.round().clamp(0, 100) : 0;

String _initial(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? '?' : trimmed[0].toUpperCase();
}

String _defaultScheduleDay(List<Map<String, dynamic>> schedules) {
  const names = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ];
  final today = names[clock.now().weekday % 7];
  if (schedules.any((row) => row['dayOfWeek'] == today) && today != 'FRIDAY') {
    return today;
  }
  return schedules
      .map((row) => '${row['dayOfWeek'] ?? ''}')
      .firstWhere((day) => day != 'FRIDAY', orElse: () => 'SUNDAY');
}

DateTime _saturdayOfCurrentWeek(DateTime now) {
  final daysSinceSaturday = (now.weekday + 1) % 7;
  return DateTime(now.year, now.month, now.day)
      .subtract(Duration(days: daysSinceSaturday));
}

String _shortDay(String? day) {
  if (day == null || day.isEmpty) return 'Day';
  final lower = day.toLowerCase();
  return '${lower[0].toUpperCase()}${lower.substring(1, 3)}';
}

String _displayTime(Object? value) {
  final parts = '${value ?? ''}'.split(':');
  if (parts.length < 2) return '${value ?? ''}';
  final hour = int.tryParse(parts[0]);
  if (hour == null) return '${value ?? ''}';
  final display = hour % 12 == 0 ? 12 : hour % 12;
  return '$display:${parts[1]} ${hour >= 12 ? 'PM' : 'AM'}';
}

String _dateAndTime(Object? value) {
  final date = DateTime.tryParse('${value ?? ''}')?.toLocal();
  if (date == null) return '${value ?? ''}';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
  return '${months[date.month - 1]} ${date.day}, ${date.year} · $hour:${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
}

String _timeFromDate(Object? value) {
  final date = DateTime.tryParse('${value ?? ''}')?.toLocal();
  if (date == null) return '';
  final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
  return '$hour:${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
}

String _shortDate(Object? value) {
  final date = DateTime.tryParse('${value ?? ''}')?.toLocal();
  if (date == null) return 'Recently';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  return '${months[date.month - 1]} ${date.day}';
}

String _profileDate(Object? value) {
  final date = DateTime.tryParse('${value ?? ''}');
  if (date == null) return '';
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}
