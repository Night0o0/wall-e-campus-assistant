import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../models/account_role.dart';
import 'shared_widgets.dart';

class AppDestination {
  const AppDestination(this.label, this.icon, this.page);

  final String label;
  final IconData icon;
  final Widget page;
}

List<AppDestination> destinationsFor(AccountRole role) => switch (role) {
      AccountRole.student => const [
          AppDestination('Timetable', Icons.calendar_month_rounded,
              TimetablePage(student: true)),
          AppDestination(
              'Scan QR', Icons.qr_code_scanner_rounded, ScanQrPage()),
          AppDestination(
              'Materials', Icons.folder_copy_rounded, MaterialsPage()),
          AppDestination(
              'Achievement', Icons.emoji_events_rounded, AchievementPage()),
          AppDestination('Inbox', Icons.notifications_rounded, InboxPage()),
          AppDestination('Profile', Icons.person_rounded,
              ProfilePage(role: AccountRole.student)),
        ],
      AccountRole.admin => const [
          AppDestination('Overview', Icons.grid_view_rounded,
              DashboardPage(role: AccountRole.admin)),
          AppDestination('My Teaching', Icons.calendar_month_rounded,
              TimetablePage(teaching: true)),
          AppDestination('Sessions', Icons.play_circle_rounded, SessionsPage()),
          AppDestination('Courses', Icons.menu_book_rounded, CoursesPage()),
          AppDestination('Materials', Icons.folder_copy_rounded,
              MaterialsPage(manage: true)),
          AppDestination('Pending Students', Icons.how_to_reg_rounded,
              PeoplePage(pendingOnly: true)),
          AppDestination('Inbox', Icons.notifications_rounded, InboxPage()),
          AppDestination('Account', Icons.person_rounded,
              ProfilePage(role: AccountRole.admin)),
        ],
      AccountRole.superAdmin => const [
          AppDestination(
            'Dashboard',
            Icons.grid_view_rounded,
            DashboardPage(role: AccountRole.superAdmin),
          ),
          AppDestination(
              'Timetable', Icons.calendar_month_rounded, TimetablePage()),
          AppDestination(
              'Courses', Icons.menu_book_rounded, CoursesPage(manageAll: true)),
          AppDestination('Sessions', Icons.play_circle_rounded, SessionsPage()),
          AppDestination(
              'Students & Staff', Icons.groups_rounded, PeoplePage()),
          AppDestination('Pending Students', Icons.how_to_reg_rounded,
              PeoplePage(pendingOnly: true)),
          AppDestination('Materials', Icons.folder_copy_rounded,
              MaterialsPage(manage: true)),
          AppDestination(
              'Robot Devices', Icons.smart_toy_rounded, DevicesPage()),
          AppDestination('Exports', Icons.download_rounded, ExportsPage()),
          AppDestination('Inbox', Icons.notifications_rounded, InboxPage()),
          AppDestination(
            'Account',
            Icons.person_rounded,
            ProfilePage(role: AccountRole.superAdmin),
          ),
        ],
      AccountRole.robot => const [
          AppDestination('QR Display', Icons.qr_code_2_rounded, RobotQrPage()),
          AppDestination('Campus Map', Icons.map_rounded, CampusMapPage()),
        ],
    };

class DashboardPage extends StatelessWidget {
  const DashboardPage({required this.role, super.key});

  final AccountRole role;

  @override
  Widget build(BuildContext context) {
    final superAdmin = role == AccountRole.superAdmin;
    return PageCanvas(
      title: superAdmin ? 'Good morning, Dr. Salma' : 'Good morning, Dr. Omar',
      subtitle: superAdmin
          ? 'Here is what is happening across your university today.'
          : 'Your teaching day, sessions, and student approvals at a glance.',
      actions: const [
        EmptyAction(label: 'Create session', icon: Icons.add_rounded)
      ],
      children: [
        ResponsiveMetricGrid(
          children: superAdmin
              ? const [
                  MetricCard(
                    label: 'Active students',
                    value: '2,418',
                    detail: '+48 this month',
                    icon: Icons.school_rounded,
                  ),
                  MetricCard(
                    label: 'Teaching staff',
                    value: '186',
                    detail: '172 active',
                    icon: Icons.badge_rounded,
                    accent: AppColors.orange,
                  ),
                  MetricCard(
                    label: 'Sessions today',
                    value: '24',
                    detail: '7 currently live',
                    icon: Icons.play_circle_rounded,
                    accent: AppColors.success,
                  ),
                  MetricCard(
                    label: 'Pending approval',
                    value: '12',
                    detail: 'Needs attention',
                    icon: Icons.how_to_reg_rounded,
                    accent: AppColors.danger,
                  ),
                ]
              : const [
                  MetricCard(
                    label: 'Classes today',
                    value: '3',
                    detail: 'Next at 11:30',
                    icon: Icons.calendar_month_rounded,
                  ),
                  MetricCard(
                    label: 'Active session',
                    value: '1',
                    detail: '42 students scanned',
                    icon: Icons.qr_code_rounded,
                    accent: AppColors.success,
                  ),
                  MetricCard(
                    label: 'My courses',
                    value: '5',
                    detail: '3 departments',
                    icon: Icons.menu_book_rounded,
                    accent: AppColors.orange,
                  ),
                  MetricCard(
                    label: 'Pending students',
                    value: '7',
                    detail: 'Review profiles',
                    icon: Icons.person_add_alt_1_rounded,
                    accent: AppColors.danger,
                  ),
                ],
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 800;
            final cards = [
              SectionCard(
                title: 'Today’s schedule',
                trailing:
                    TextButton(onPressed: () {}, child: const Text('View all')),
                child: const Column(
                  children: [
                    AppListTile(
                      title: 'Embedded Systems',
                      subtitle: '09:00 – 10:30  •  Room B-204',
                      icon: Icons.memory_rounded,
                      trailing: StatusPill('Completed'),
                    ),
                    Divider(),
                    AppListTile(
                      title: 'Control Systems',
                      subtitle: '11:30 – 13:00  •  Lab C-12',
                      icon: Icons.tune_rounded,
                      trailing: StatusPill('Upcoming', color: AppColors.orange),
                    ),
                    Divider(),
                    AppListTile(
                      title: 'Robotics Lab',
                      subtitle: '14:00 – 16:00  •  Robotics Lab',
                      icon: Icons.precision_manufacturing_rounded,
                    ),
                  ],
                ),
              ),
              SectionCard(
                title: superAdmin ? 'Campus activity' : 'Recent activity',
                subtitle: 'Live updates from the last hour',
                child: const Column(
                  children: [
                    AppListTile(
                      title: 'Attendance session opened',
                      subtitle: 'Control Systems • 12 minutes ago',
                      icon: Icons.qr_code_2_rounded,
                    ),
                    Divider(),
                    AppListTile(
                      title: 'New student registrations',
                      subtitle: '5 profiles are ready for review',
                      icon: Icons.person_add_alt_rounded,
                    ),
                    Divider(),
                    AppListTile(
                      title: 'Material published',
                      subtitle: 'Week 6 lecture notes • 48 minutes ago',
                      icon: Icons.upload_file_rounded,
                    ),
                  ],
                ),
              ),
            ];
            return wide
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: cards[0]),
                      const SizedBox(width: 16),
                      Expanded(child: cards[1]),
                    ],
                  )
                : Column(
                    children: intersperse(cards, const SizedBox(height: 16)));
          },
        ),
      ],
    );
  }
}

class TimetablePage extends StatelessWidget {
  const TimetablePage({this.student = false, this.teaching = false, super.key});

  final bool student;
  final bool teaching;

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: student
          ? 'My timetable'
          : teaching
              ? 'My teaching'
              : 'University timetable',
      subtitle: student
          ? 'Your weekly lectures based on your academic profile.'
          : 'A clear weekly view of lectures, rooms, and instructors.',
      actions: [
        if (!student)
          const EmptyAction(label: 'Add lecture', icon: Icons.add_rounded),
      ],
      children: const [
        SectionCard(
          child: Column(
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _DayChip('Sat', '16'),
                    _DayChip('Sun', '17', selected: true),
                    _DayChip('Mon', '18'),
                    _DayChip('Tue', '19'),
                    _DayChip('Wed', '20'),
                    _DayChip('Thu', '21'),
                  ],
                ),
              ),
            ],
          ),
        ),
        SectionCard(
          title: 'Sunday, 17 August',
          subtitle: '3 scheduled lectures',
          child: Column(
            children: [
              _LectureCard(
                time: '09:00',
                endTime: '10:30',
                title: 'Embedded Systems',
                code: 'MCT 312',
                room: 'B-204',
                instructor: 'Dr. Omar Adel',
                color: AppColors.blue,
              ),
              SizedBox(height: 12),
              _LectureCard(
                time: '11:30',
                endTime: '13:00',
                title: 'Control Systems',
                code: 'MCT 314',
                room: 'Lab C-12',
                instructor: 'Dr. Yara Mostafa',
                color: AppColors.orange,
              ),
              SizedBox(height: 12),
              _LectureCard(
                time: '14:00',
                endTime: '16:00',
                title: 'Robotics Lab',
                code: 'MCT 320',
                room: 'Robotics Lab',
                instructor: 'Eng. Karim Ali',
                color: AppColors.success,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip(this.day, this.date, {this.selected = false});

  final String day;
  final String date;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 68,
      margin: const EdgeInsets.only(right: 10),
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        color: selected ? AppColors.blue : AppColors.panel,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Text(day,
              style: TextStyle(
                  color: selected ? Colors.white70 : AppColors.muted,
                  fontSize: 12)),
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
    );
  }
}

class _LectureCard extends StatelessWidget {
  const _LectureCard({
    required this.time,
    required this.endTime,
    required this.title,
    required this.code,
    required this.room,
    required this.instructor,
    required this.color,
  });

  final String time;
  final String endTime;
  final String title;
  final String code;
  final String room;
  final String instructor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(.07),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 58,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(time,
                    style: const TextStyle(
                        color: AppColors.ink, fontWeight: FontWeight.w800)),
                Text(endTime,
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 5),
                Text('$code  •  $instructor',
                    style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 9),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined,
                        size: 17, color: AppColors.blue),
                    const SizedBox(width: 5),
                    Text(room,
                        style: const TextStyle(
                            color: AppColors.blue,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.more_horiz_rounded, color: AppColors.muted),
        ],
      ),
    );
  }
}

class ScanQrPage extends StatelessWidget {
  const ScanQrPage({super.key});

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: 'Scan attendance QR',
      subtitle: 'Point your camera at the code shown in your lecture room.',
      children: [
        SectionCard(
          child: Column(
            children: [
              AspectRatio(
                aspectRatio: 1.12,
                child: Container(
                  constraints: const BoxConstraints(maxHeight: 490),
                  decoration: BoxDecoration(
                    color: AppColors.navy,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Icon(Icons.qr_code_2_rounded,
                          size: 190, color: Colors.white.withOpacity(.1)),
                      Container(
                        width: 240,
                        height: 240,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(color: AppColors.orange, width: 3),
                        ),
                      ),
                      Positioned(
                        bottom: 26,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.black38,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'Keep the code inside the frame',
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text(
                            'Camera scanning will be connected after design approval.')),
                  ),
                  icon: const Icon(Icons.camera_alt_rounded),
                  label: const Text('Open camera'),
                ),
              ),
            ],
          ),
        ),
        const SectionCard(
          title: 'Last attendance',
          child: AppListTile(
            title: 'Embedded Systems',
            subtitle: 'Today, 09:04  •  Room B-204',
            icon: Icons.check_circle_rounded,
            iconColor: AppColors.success,
            trailing: StatusPill('Present'),
          ),
        ),
      ],
    );
  }
}

class MaterialsPage extends StatelessWidget {
  const MaterialsPage({this.manage = false, super.key});

  final bool manage;

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: 'Course materials',
      subtitle: manage
          ? 'Publish and manage learning resources for your students.'
          : 'Everything shared by your instructors, grouped by subject.',
      actions: [
        if (manage)
          const EmptyAction(label: 'Publish material', icon: Icons.add_rounded)
      ],
      children: const [
        SectionCard(
          title: 'Your subjects',
          child: Column(
            children: [
              _MaterialTile(
                title: 'Embedded Systems',
                code: 'MCT 312',
                files: '8 resources',
                icon: Icons.memory_rounded,
                color: AppColors.blue,
              ),
              Divider(),
              _MaterialTile(
                title: 'Control Systems',
                code: 'MCT 314',
                files: '12 resources',
                icon: Icons.tune_rounded,
                color: AppColors.orange,
              ),
              Divider(),
              _MaterialTile(
                title: 'Robotics Lab',
                code: 'MCT 320',
                files: '6 resources',
                icon: Icons.precision_manufacturing_rounded,
                color: AppColors.success,
              ),
              Divider(),
              _MaterialTile(
                title: 'Digital Control',
                code: 'MCT 316',
                files: '4 resources',
                icon: Icons.developer_board_rounded,
                color: AppColors.cyan,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MaterialTile extends StatelessWidget {
  const _MaterialTile({
    required this.title,
    required this.code,
    required this.files,
    required this.icon,
    required this.color,
  });

  final String title;
  final String code;
  final String files;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AppListTile(
      title: title,
      subtitle: '$code  •  $files',
      icon: icon,
      iconColor: color,
      trailing: const Icon(Icons.folder_open_rounded, color: AppColors.muted),
    );
  }
}

class AchievementPage extends StatelessWidget {
  const AchievementPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PageCanvas(
      title: 'Achievement',
      subtitle: 'Your attendance across recorded lectures this semester.',
      children: [
        ResponsiveMetricGrid(
          children: [
            MetricCard(
              label: 'Overall attendance',
              value: '91%',
              detail: '41 of 45 recorded',
              icon: Icons.track_changes_rounded,
              accent: AppColors.success,
            ),
            MetricCard(
              label: 'Present',
              value: '38',
              detail: 'Recorded lectures',
              icon: Icons.check_circle_rounded,
            ),
            MetricCard(
              label: 'Late',
              value: '3',
              detail: 'Still counted attended',
              icon: Icons.schedule_rounded,
              accent: AppColors.orange,
            ),
            MetricCard(
              label: 'Absent',
              value: '4',
              detail: 'Recorded lectures',
              icon: Icons.cancel_rounded,
              accent: AppColors.danger,
            ),
          ],
        ),
        SectionCard(
          title: 'Attendance by subject',
          child: Column(
            children: [
              _ProgressSubject(
                  'Embedded Systems', '12 / 13 recorded', .92, AppColors.blue),
              Divider(),
              _ProgressSubject(
                  'Control Systems', '11 / 12 recorded', .91, AppColors.orange),
              Divider(),
              _ProgressSubject(
                  'Robotics Lab', '10 / 10 recorded', 1, AppColors.success),
              Divider(),
              _ProgressSubject(
                  'Digital Control', '8 / 10 recorded', .8, AppColors.cyan),
            ],
          ),
        ),
        SectionCard(
          title: 'Recent history',
          child: Column(
            children: [
              AppListTile(
                title: 'Embedded Systems',
                subtitle: 'Today, 09:04  •  Room B-204',
                icon: Icons.check_rounded,
                iconColor: AppColors.success,
                trailing: StatusPill('Present'),
              ),
              Divider(),
              AppListTile(
                title: 'Control Systems',
                subtitle: 'Thursday, 11:38  •  Lab C-12',
                icon: Icons.schedule_rounded,
                iconColor: AppColors.orange,
                trailing: StatusPill('Late', color: AppColors.orange),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProgressSubject extends StatelessWidget {
  const _ProgressSubject(this.title, this.detail, this.progress, this.color);

  final String title;
  final String detail;
  final double progress;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(title,
                      style: Theme.of(context).textTheme.titleMedium)),
              Text('${(progress * 100).round()}%',
                  style: TextStyle(color: color, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 5),
          Align(
              alignment: Alignment.centerLeft,
              child:
                  Text(detail, style: Theme.of(context).textTheme.bodyMedium)),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: progress,
            minHeight: 8,
            borderRadius: BorderRadius.circular(99),
            color: color,
            backgroundColor: color.withOpacity(.12),
          ),
        ],
      ),
    );
  }
}

class InboxPage extends StatelessWidget {
  const InboxPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PageCanvas(
      title: 'Inbox',
      subtitle: 'Lecture reminders, account updates, and campus notices.',
      actions: [
        EmptyAction(label: 'Mark all read', icon: Icons.done_all_rounded)
      ],
      children: [
        SectionCard(
          child: Column(
            children: [
              AppListTile(
                title: 'Control Systems starts in 30 minutes',
                subtitle: 'Lab C-12  •  Today at 11:30',
                icon: Icons.notifications_active_rounded,
                iconColor: AppColors.orange,
                trailing: StatusPill('New', color: AppColors.blue),
              ),
              Divider(),
              AppListTile(
                title: 'Your account has been approved',
                subtitle:
                    'You now have access to timetable, materials, and QR attendance.',
                icon: Icons.verified_user_rounded,
                iconColor: AppColors.success,
              ),
              Divider(),
              AppListTile(
                title: 'New material: Week 6 lecture notes',
                subtitle: 'Embedded Systems  •  Yesterday at 16:20',
                icon: Icons.folder_copy_rounded,
              ),
              Divider(),
              AppListTile(
                title: 'Robotics Lab room updated',
                subtitle: 'The lecture will be held in Robotics Lab 2.',
                icon: Icons.location_on_rounded,
                iconColor: AppColors.cyan,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({required this.role, super.key});

  final AccountRole role;

  @override
  Widget build(BuildContext context) {
    final student = role == AccountRole.student;
    return PageCanvas(
      title: student ? 'My profile' : 'Account settings',
      subtitle: student
          ? 'Keep your personal and academic information up to date.'
          : 'Manage your WALL-E account information and security.',
      actions: const [
        EmptyAction(label: 'Save changes', icon: Icons.save_rounded)
      ],
      children: [
        SectionCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: AppColors.orangeSoft,
                child: Icon(role.icon, color: AppColors.blue, size: 32),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(role.demoName,
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 3),
                    Text(role.demoEmail,
                        style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    StatusPill(student ? 'Profile complete' : role.label),
                  ],
                ),
              ),
            ],
          ),
        ),
        SectionCard(
          title: 'Personal information',
          child: _ProfileForm(student: student),
        ),
        if (student)
          const SectionCard(
            title: 'Academic information',
            child: _AcademicForm(),
          ),
        const SectionCard(
          title: 'Security',
          child: Column(
            children: [
              AppListTile(
                title: 'Change password',
                subtitle: 'Updated 2 months ago',
                icon: Icons.lock_outline_rounded,
              ),
              Divider(),
              AppListTile(
                title: 'Sign-in activity',
                subtitle: 'Last signed in today at 08:12',
                icon: Icons.devices_rounded,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProfileForm extends StatelessWidget {
  const _ProfileForm({required this.student});

  final bool student;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth >= 650
            ? (constraints.maxWidth - 14) / 2
            : constraints.maxWidth;
        return Wrap(
          spacing: 14,
          runSpacing: 14,
          children: [
            SizedBox(
                width: width,
                child: const TextField(
                    decoration: InputDecoration(labelText: 'Full name'))),
            SizedBox(
                width: width,
                child: const TextField(
                    decoration: InputDecoration(labelText: 'Email address'))),
            SizedBox(
                width: width,
                child: const TextField(
                    decoration: InputDecoration(labelText: 'Phone number'))),
            SizedBox(
              width: width,
              child: TextField(
                decoration: InputDecoration(
                    labelText: student ? 'University ID' : 'Job title'),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _AcademicForm extends StatelessWidget {
  const _AcademicForm();

  @override
  Widget build(BuildContext context) {
    const fields = [
      'Faculty',
      'Department',
      'Level',
      'Semester',
      'Section',
      'Academic year'
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth >= 650
            ? (constraints.maxWidth - 14) / 2
            : constraints.maxWidth;
        return Wrap(
          spacing: 14,
          runSpacing: 14,
          children: fields
              .map((label) => SizedBox(
                  width: width,
                  child:
                      TextField(decoration: InputDecoration(labelText: label))))
              .toList(),
        );
      },
    );
  }
}

class SessionsPage extends StatelessWidget {
  const SessionsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PageCanvas(
      title: 'Attendance sessions',
      subtitle: 'Open, monitor, and close attendance sessions.',
      actions: [EmptyAction(label: 'Open session', icon: Icons.add_rounded)],
      children: [
        ResponsiveMetricGrid(
          children: [
            MetricCard(
                label: 'Live now',
                value: '2',
                icon: Icons.wifi_tethering_rounded,
                accent: AppColors.success),
            MetricCard(label: 'Today', value: '8', icon: Icons.today_rounded),
            MetricCard(
                label: 'Average scans',
                value: '46',
                icon: Icons.groups_rounded,
                accent: AppColors.orange),
          ],
        ),
        SectionCard(
          title: 'Today’s sessions',
          child: Column(
            children: [
              AppListTile(
                title: 'Control Systems — Section A',
                subtitle: 'Live • 42 scans • Lab C-12',
                icon: Icons.qr_code_2_rounded,
                iconColor: AppColors.success,
                trailing: StatusPill('Live'),
              ),
              Divider(),
              AppListTile(
                title: 'Embedded Systems — Section B',
                subtitle: 'Closed at 10:32 • 51 scans',
                icon: Icons.check_circle_outline_rounded,
                trailing: StatusPill('Closed', color: AppColors.muted),
              ),
              Divider(),
              AppListTile(
                title: 'Robotics Lab — Section A',
                subtitle: 'Starts at 14:00 • Robotics Lab',
                icon: Icons.schedule_rounded,
                iconColor: AppColors.orange,
                trailing: StatusPill('Upcoming', color: AppColors.orange),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class CoursesPage extends StatelessWidget {
  const CoursesPage({this.manageAll = false, super.key});

  final bool manageAll;

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: manageAll ? 'Course management' : 'My courses',
      subtitle: manageAll
          ? 'Manage every course offered by your university.'
          : 'Courses assigned to your teaching profile.',
      actions: [
        if (manageAll)
          const EmptyAction(label: 'Create course', icon: Icons.add_rounded)
      ],
      children: const [
        ResponsiveMetricGrid(
          children: [
            _CourseCard('Embedded Systems', 'MCT 312', '128 students',
                Icons.memory_rounded, AppColors.blue),
            _CourseCard('Control Systems', 'MCT 314', '112 students',
                Icons.tune_rounded, AppColors.orange),
            _CourseCard('Robotics Lab', 'MCT 320', '96 students',
                Icons.precision_manufacturing_rounded, AppColors.success),
            _CourseCard('Digital Control', 'MCT 316', '104 students',
                Icons.developer_board_rounded, AppColors.cyan),
          ],
        ),
      ],
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard(
      this.title, this.code, this.students, this.icon, this.color);

  final String title;
  final String code;
  final String students;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
                color: color.withOpacity(.12),
                borderRadius: BorderRadius.circular(15)),
            child: Icon(icon, color: color),
          ),
          const SizedBox(height: 16),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 5),
          Text('$code  •  $students',
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

class PeoplePage extends StatelessWidget {
  const PeoplePage({this.pendingOnly = false, super.key});

  final bool pendingOnly;

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: pendingOnly ? 'Pending students' : 'Students & staff',
      subtitle: pendingOnly
          ? 'Review complete profiles before granting campus access.'
          : 'Manage people in your university.',
      actions: [
        if (!pendingOnly)
          const EmptyAction(
              label: 'Add person', icon: Icons.person_add_alt_rounded)
      ],
      children: [
        if (!pendingOnly)
          const ResponsiveMetricGrid(
            children: [
              MetricCard(
                  label: 'Students',
                  value: '2,418',
                  icon: Icons.school_rounded),
              MetricCard(
                  label: 'Staff',
                  value: '186',
                  icon: Icons.badge_rounded,
                  accent: AppColors.orange),
              MetricCard(
                  label: 'Incomplete profiles',
                  value: '31',
                  icon: Icons.warning_amber_rounded,
                  accent: AppColors.danger),
            ],
          ),
        SectionCard(
          title: pendingOnly ? '12 profiles awaiting review' : 'Directory',
          child: const Column(
            children: [
              AppListTile(
                title: 'Mariam Ahmed',
                subtitle: 'Mechatronics • Level 3 • Section A',
                icon: Icons.person_rounded,
                trailing: StatusPill('Pending', color: AppColors.orange),
              ),
              Divider(),
              AppListTile(
                title: 'Youssef Khaled',
                subtitle: 'Computer Engineering • Level 2 • Section B',
                icon: Icons.person_rounded,
                trailing: StatusPill('Pending', color: AppColors.orange),
              ),
              Divider(),
              AppListTile(
                title: 'Nour Tarek',
                subtitle: 'Electrical Engineering • Level 1 • Section A',
                icon: Icons.person_rounded,
                trailing: StatusPill('Pending', color: AppColors.orange),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class DevicesPage extends StatelessWidget {
  const DevicesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PageCanvas(
      title: 'Robot devices',
      subtitle: 'Provision, monitor, and manage WALL-E campus displays.',
      actions: [EmptyAction(label: 'Provision robot', icon: Icons.add_rounded)],
      children: [
        ResponsiveMetricGrid(
          children: [
            MetricCard(
                label: 'Online',
                value: '8',
                icon: Icons.smart_toy_rounded,
                accent: AppColors.success),
            MetricCard(
                label: 'Offline',
                value: '2',
                icon: Icons.portable_wifi_off_rounded,
                accent: AppColors.danger),
            MetricCard(
                label: 'Active displays',
                value: '5',
                icon: Icons.qr_code_2_rounded),
          ],
        ),
        SectionCard(
          title: 'Campus robots',
          child: Column(
            children: [
              AppListTile(
                title: 'WALL-E • Hall A',
                subtitle: 'Main building • Last seen just now',
                icon: Icons.smart_toy_rounded,
                iconColor: AppColors.success,
                trailing: StatusPill('Online'),
              ),
              Divider(),
              AppListTile(
                title: 'WALL-E • Engineering B',
                subtitle: 'Second floor • Last seen 2 min ago',
                icon: Icons.smart_toy_rounded,
                iconColor: AppColors.success,
                trailing: StatusPill('Online'),
              ),
              Divider(),
              AppListTile(
                title: 'WALL-E • Library',
                subtitle: 'Ground floor • Last seen yesterday',
                icon: Icons.smart_toy_rounded,
                iconColor: AppColors.danger,
                trailing: StatusPill('Offline', color: AppColors.danger),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class ExportsPage extends StatelessWidget {
  const ExportsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PageCanvas(
      title: 'Exports',
      subtitle: 'Prepare student rosters and attendance reports.',
      children: [
        SectionCard(
          title: 'Create export',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                  readOnly: true,
                  decoration: InputDecoration(
                      labelText: 'Select course',
                      suffixIcon: Icon(Icons.expand_more_rounded))),
              SizedBox(height: 14),
              TextField(
                  readOnly: true,
                  decoration: InputDecoration(
                      labelText: 'Report type',
                      suffixIcon: Icon(Icons.expand_more_rounded))),
              SizedBox(height: 18),
              EmptyAction(
                  label: 'Generate Excel file', icon: Icons.table_view_rounded),
            ],
          ),
        ),
        SectionCard(
          title: 'Recent exports',
          child: Column(
            children: [
              AppListTile(
                  title: 'Embedded Systems roster',
                  subtitle: 'Excel • Today at 09:44',
                  icon: Icons.description_rounded),
              Divider(),
              AppListTile(
                  title: 'Control Systems attendance',
                  subtitle: 'Excel • 14 August at 13:18',
                  icon: Icons.description_rounded),
            ],
          ),
        ),
      ],
    );
  }
}

class RobotQrPage extends StatelessWidget {
  const RobotQrPage({super.key});

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: 'Attendance display',
      subtitle: 'WALL-E • Hall A is connected and ready.',
      actions: const [StatusPill('Device online')],
      children: [
        SectionCard(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 700;
              final code = Container(
                width: 300,
                height: 300,
                padding: const EdgeInsets.all(26),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: AppColors.line),
                  boxShadow: const [
                    BoxShadow(color: Color(0x12102A43), blurRadius: 24)
                  ],
                ),
                child: const Icon(Icons.qr_code_2_rounded,
                    size: 246, color: AppColors.navy),
              );
              final details = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const StatusPill('Live session'),
                  const SizedBox(height: 16),
                  Text('Control Systems',
                      style: Theme.of(context).textTheme.headlineLarge),
                  const SizedBox(height: 7),
                  Text('MCT 314 • Section A',
                      style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 22),
                  const AppListTile(
                      title: 'Lab C-12',
                      subtitle: '11:30 – 13:00',
                      icon: Icons.location_on_rounded),
                  const Divider(),
                  const AppListTile(
                      title: '42 students scanned',
                      subtitle: 'Code refreshes in 18 seconds',
                      icon: Icons.groups_rounded),
                ],
              );
              return wide
                  ? Row(children: [
                      code,
                      const SizedBox(width: 34),
                      Expanded(child: details)
                    ])
                  : Column(
                      children: [code, const SizedBox(height: 28), details]);
            },
          ),
        ),
      ],
    );
  }
}

class CampusMapPage extends StatelessWidget {
  const CampusMapPage({super.key});

  @override
  Widget build(BuildContext context) {
    return PageCanvas(
      title: 'Campus map',
      subtitle: 'Help visitors find rooms and services around campus.',
      children: [
        SectionCard(
          child: Column(
            children: [
              AspectRatio(
                aspectRatio: 1.55,
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.panel,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: const Stack(
                    children: [
                      Positioned.fill(child: _MapPattern()),
                      Positioned(
                          left: 52,
                          top: 45,
                          child: _MapPin(
                              label: 'Engineering', color: AppColors.blue)),
                      Positioned(
                          right: 70,
                          top: 80,
                          child: _MapPin(
                              label: 'Library', color: AppColors.orange)),
                      Positioned(
                          left: 120,
                          bottom: 45,
                          child: _MapPin(
                              label: 'You are here', color: AppColors.success)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SectionCard(
          title: 'Popular places',
          child: Column(
            children: [
              AppListTile(
                  title: 'Main Library',
                  subtitle: '4 minute walk',
                  icon: Icons.local_library_rounded),
              Divider(),
              AppListTile(
                  title: 'Student Affairs',
                  subtitle: '6 minute walk',
                  icon: Icons.groups_rounded),
              Divider(),
              AppListTile(
                  title: 'Engineering Building B',
                  subtitle: '2 minute walk',
                  icon: Icons.apartment_rounded),
            ],
          ),
        ),
      ],
    );
  }
}

class _MapPattern extends StatelessWidget {
  const _MapPattern();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _MapPainter());
  }
}

class _MapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final road = Paint()
      ..color = AppColors.line.withOpacity(.9)
      ..strokeWidth = 22
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final building = Paint()..color = AppColors.input;
    canvas.drawLine(Offset(0, size.height * .68),
        Offset(size.width, size.height * .28), road);
    canvas.drawLine(Offset(size.width * .42, 0),
        Offset(size.width * .58, size.height), road);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(25, 22, size.width * .25, size.height * .24),
          const Radius.circular(10)),
      building,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(size.width * .68, size.height * .55, size.width * .25,
              size.height * .25),
          const Radius.circular(10)),
      building,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _MapPin extends StatelessWidget {
  const _MapPin({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
              color: Color(0x25102A43), blurRadius: 12, offset: Offset(0, 5))
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.location_on_rounded, color: color, size: 19),
          const SizedBox(width: 5),
          Text(label,
              style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 11,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
