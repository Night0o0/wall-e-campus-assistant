import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../data/campus_api.dart';
import '../models/account_role.dart';
import 'connected_pages.dart';
import 'brand_logo.dart';
import 'login_page.dart';
import 'role_pages.dart';
import 'student_shell.dart';

class AppShell extends StatefulWidget {
  const AppShell({required this.session, required this.api, super.key});

  final AuthSession session;
  final CampusGateway api;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  List<AppDestination> get _destinations => connectedDestinationsFor(
        widget.session.role,
        widget.api,
        widget.session,
        _logout,
      );

  Future<void> _logout() async {
    await widget.api.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => LoginPage(api: widget.api)),
      (_) => false,
    );
  }

  void _showAccount() {
    final index = _destinations.indexWhere(
      (item) => item.label == 'Account' || item.label == 'Profile',
    );
    if (index >= 0) setState(() => _index = index);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.session.role == AccountRole.student &&
        !widget.session.isVerified) {
      return _PendingApproval(
        name: widget.session.name,
        onLogout: _logout,
      );
    }

    if (widget.session.role == AccountRole.student) {
      return StudentShell(
        api: widget.api,
        session: widget.session,
        onLogout: _logout,
      );
    }

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
                    _RoleHeader(
                      role: widget.session.role,
                      name: widget.session.name,
                      onAccount: _showAccount,
                    ),
                    Expanded(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        child: KeyedSubtree(
                          key: ValueKey(_destinations[_index].label),
                          child: _destinations[_index].page,
                        ),
                      ),
                    ),
                    _RoleBottomNav(
                      destinations: _destinations,
                      selectedIndex: _index,
                      onSelect: (index) => setState(() => _index = index),
                    ),
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

class _PendingApproval extends StatelessWidget {
  const _PendingApproval({required this.name, required this.onLogout});

  final String name;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppColors.backgroundGradient),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const LeornianLogo(size: 72),
                    const SizedBox(height: 28),
                    Text(
                      'Thanks, ${name.trim().isEmpty ? 'student' : name.split(' ').first}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Your identity is confirmed. Academic features unlock after authorized university staff verify your student record.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.muted,
                        fontSize: 15,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 28),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppColors.orange.withOpacity(.1),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.orange.withOpacity(.25)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.schedule_rounded, color: AppColors.orange),
                          SizedBox(width: 10),
                          Text(
                            'Pending university approval',
                            style: TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 30),
                    OutlinedButton.icon(
                      onPressed: onLogout,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('Back to sign in'),
                    ),
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

class _RoleHeader extends StatelessWidget {
  const _RoleHeader({
    required this.role,
    required this.name,
    required this.onAccount,
  });

  final AccountRole role;
  final String name;
  final VoidCallback onAccount;

  String get _initial =>
      name.trim().isEmpty ? role.label[0] : name.trim()[0].toUpperCase();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 61,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xD9080C18),
        border: Border(
          bottom: BorderSide(color: Colors.white.withOpacity(.07)),
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
          const Spacer(),
          Text(
            role.label.toUpperCase(),
            style: const TextStyle(
              color: AppColors.muted,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: .7,
            ),
          ),
          const SizedBox(width: 10),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onAccount,
              borderRadius: BorderRadius.circular(10),
              child: Ink(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(.07),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(
                    _initial,
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

class _RoleBottomNav extends StatelessWidget {
  const _RoleBottomNav({
    required this.destinations,
    required this.selectedIndex,
    required this.onSelect,
  });

  final List<AppDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  int get _primaryIndex {
    final sessions =
        destinations.indexWhere((item) => item.label == 'Sessions');
    if (sessions >= 0) return sessions;
    final qr = destinations.indexWhere((item) => item.label.contains('QR'));
    return qr >= 0 ? qr : 0;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 79,
      decoration: BoxDecoration(
        color: const Color(0xF20A0E1C),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(.07))),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 430),
          child: Row(
            mainAxisAlignment: destinations.length <= 4
                ? MainAxisAlignment.spaceEvenly
                : MainAxisAlignment.start,
            children: [
              for (var index = 0; index < destinations.length; index++)
                SizedBox(
                  width:
                      destinations.length <= 4 ? 430 / destinations.length : 82,
                  child: _RoleNavItem(
                    destination: destinations[index],
                    selected: selectedIndex == index,
                    raised: _primaryIndex == index,
                    onTap: () => onSelect(index),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleNavItem extends StatelessWidget {
  const _RoleNavItem({
    required this.destination,
    required this.selected,
    required this.raised,
    required this.onTap,
  });

  final AppDestination destination;
  final bool selected;
  final bool raised;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (raised) {
      return SizedBox(
        height: 79,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              right: 0,
              top: -12,
              child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(18),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(17),
                        border: Border.all(color: AppColors.canvas, width: 4),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x664F8EF7),
                            blurRadius: 18,
                            offset: Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Icon(
                        destination.icon,
                        color: Colors.white,
                        size: 23,
                      ),
                    ),
                    Text(
                      destination.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.blue,
                        fontSize: 9,
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

    final color = selected ? AppColors.blue : AppColors.muted;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(destination.icon, color: color, size: 21),
            const SizedBox(height: 5),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 9,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
