import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/network/api_client.dart';
import '../widgets/alert_card.dart';
import '../../div_app/screens/div_home_screen.dart';

class PatrolDashboard extends ConsumerStatefulWidget {
  const PatrolDashboard({super.key});

  @override
  ConsumerState<PatrolDashboard> createState() => _PatrolDashboardState();
}

class _PatrolDashboardState extends ConsumerState<PatrolDashboard> {
  int _tab = 0;
  List<dynamic> _alerts = [];
  List<dynamic> _myEvents = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    try {
      final results = await Future.wait([
        api.getAlerts(limit: 8),
        api.getEvents(limit: 10),
      ]);
      if (mounted) setState(() {
        _alerts = results[0];
        _myEvents = results[1];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).valueOrNull;
    final isIrondo = user?.role == 'IRONDO_PATROL';
    final color = const Color(0xFF6B7280);
    final label = isIrondo ? 'Irondo Patrol' : 'Dasso Officer';

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: color,
        title: Row(children: [
          const Icon(Icons.person_pin, color: Colors.white, size: 20),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ]),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout, color: Colors.white), onPressed: () => ref.read(authStateProvider.notifier).logout()),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : IndexedStack(index: _tab, children: [
              _HomeTab(user: user, alerts: _alerts, events: _myEvents, color: color),
              const DivHomeScreen(),
              _AlertsTab(alerts: _alerts),
            ]),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: color.withValues(alpha: 0.3),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.fingerprint_outlined), selectedIcon: Icon(Icons.fingerprint), label: 'Verify'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
        ],
      ),
    );
  }
}

class _HomeTab extends StatelessWidget {
  final dynamic user;
  final List alerts;
  final List events;
  final Color color;
  const _HomeTab({this.user, required this.alerts, required this.events, required this.color});

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      // User banner
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha:0.15), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha:0.3)),
        ),
        child: Row(children: [
          Icon(Icons.badge, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(user?.fullName ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
            Text('${user?.badgeNumber ?? ''} · ${user?.role ?? ''}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
          ])),
        ]),
      ),
      const SizedBox(height: 16),

      // Access scope info
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF1E3A5F).withValues(alpha:0.5), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF1D4ED8).withValues(alpha:0.3)),
        ),
        child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, color: Color(0xFF60A5FA), size: 18),
          SizedBox(width: 10),
          Expanded(child: Text(
            'Limited access: You can verify NID and faces via the Verify tab. '
            'Results show only whether a criminal record exists — no suspect profiles or locations.',
            style: TextStyle(color: Color(0xFF93C5FD), fontSize: 12, height: 1.4),
          )),
        ]),
      ),
      const SizedBox(height: 16),

      // Quick actions
      const Text('Quick Actions', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _ActionCard(icon: Icons.credit_card, label: 'NID Scan', color: const Color(0xFF0F766E))),
        const SizedBox(width: 10),
        Expanded(child: _ActionCard(icon: Icons.face, label: 'Face Scan', color: const Color(0xFF7C3AED))),
        const SizedBox(width: 10),
        Expanded(child: _ActionCard(icon: Icons.report, label: 'Report', color: const Color(0xFFD97706))),
      ]),
      const SizedBox(height: 16),

      // My recent events
      const Text('My Activity Today', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      if (events.isEmpty)
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: Text('No verifications yet today', style: TextStyle(color: Color(0xFF64748B)))),
        )
      else
        ...events.take(6).map((ev) {
          final e = ev as Map<String, dynamic>;
          final found = e['criminal_record_found'] == true;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(10),
              border: Border.all(color: found ? const Color(0xFF7F1D1D).withValues(alpha:0.6) : const Color(0xFF334155)),
            ),
            child: Row(children: [
              Icon(Icons.circle, color: found ? const Color(0xFFDC2626) : const Color(0xFF16A34A), size: 8),
              const SizedBox(width: 10),
              Text(e['source_tag'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              const Spacer(),
              Text(found ? 'RECORD FOUND' : 'No record', style: TextStyle(
                color: found ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
                fontSize: 11, fontWeight: FontWeight.w600,
              )),
            ]),
          );
        }),
    ]);
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _ActionCard({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha:0.1), borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha:0.3)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 6),
        Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
      ]),
    );
  }
}

class _AlertsTab extends StatelessWidget {
  final List alerts;
  const _AlertsTab({required this.alerts});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Alerts', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (alerts.isEmpty)
          const Center(child: Padding(padding: EdgeInsets.all(40), child: Text('No active alerts', style: TextStyle(color: Color(0xFF64748B)))))
        else
          ...alerts.map((a) => AlertCard(alert: a as Map<String, dynamic>)),
      ],
    );
  }
}
