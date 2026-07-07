import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/network/api_client.dart';
import '../widgets/stat_tile.dart';
import '../widgets/alert_card.dart';
import '../../div_app/screens/div_home_screen.dart';

class RIBDashboard extends ConsumerStatefulWidget {
  const RIBDashboard({super.key});

  @override
  ConsumerState<RIBDashboard> createState() => _RIBDashboardState();
}

class _RIBDashboardState extends ConsumerState<RIBDashboard> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  List<dynamic> _cases = [];
  List<dynamic> _alerts = [];
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
        api.getDashboardStats(),
        api.getCases(limit: 15),
        api.getAlerts(limit: 8),
      ]);
      if (mounted) setState(() {
        _stats = results[0] as Map<String, dynamic>? ?? {};
        _cases = results[1] as List<dynamic>;
        _alerts = results[2] as List<dynamic>;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).valueOrNull;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F766E),
        title: const Row(children: [
          Icon(Icons.search, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text('RIB Investigations', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ]),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout, color: Colors.white), onPressed: () => ref.read(authStateProvider.notifier).logout()),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF0F766E)))
          : IndexedStack(index: _tab, children: [
              _InvestTab(stats: _stats, cases: _cases, user: user),
              _CasesTab(cases: _cases),
              _AlertsTab(alerts: _alerts),
              const DivHomeScreen(),
            ]),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: const Color(0xFF0F766E).withValues(alpha: 0.3),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Invest.'),
          NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: 'Cases'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.fingerprint_outlined), selectedIcon: Icon(Icons.fingerprint), label: 'DIV'),
        ],
      ),
    );
  }
}

class _InvestTab extends StatelessWidget {
  final Map<String, dynamic>? stats;
  final List cases;
  final dynamic user;
  const _InvestTab({this.stats, required this.cases, this.user});

  @override
  Widget build(BuildContext context) {
    final active = cases.where((c) => (c as Map)['status'] == 'UNDER_INVESTIGATION').length;

    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF0F766E).withValues(alpha:0.15),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF0F766E).withValues(alpha:0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.badge, color: Color(0xFF0F766E), size: 20),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(user?.fullName ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
            Text('${user?.badgeNumber ?? ''} · ${user?.role ?? ''}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
          ])),
        ]),
      ),
      const SizedBox(height: 16),
      if (stats != null)
        GridView.count(
          crossAxisCount: 2, shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.4,
          children: [
            StatTile(label: 'Active Cases', value: '$active', icon: Icons.folder_open, color: const Color(0xFF0F766E)),
            StatTile(label: 'Suspects', value: '${stats!['total_suspects'] ?? 0}', icon: Icons.people, color: const Color(0xFF1D4ED8)),
            StatTile(label: 'Alerts', value: '${stats!['alerts_today'] ?? 0}', icon: Icons.notifications, color: const Color(0xFFD97706)),
            StatTile(label: 'Intel Events', value: '${stats!['events_today'] ?? 0}', icon: Icons.timeline, color: const Color(0xFF7C3AED)),
          ],
        ),
      const SizedBox(height: 16),
      const Text('Recent Cases', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      ...cases.take(4).map((c) {
        final cs = c as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(cs['title'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(cs['case_reference'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
            ])),
            Text(
              (cs['status'] as String? ?? '').replaceAll('_', ' '),
              style: TextStyle(
                color: cs['status'] == 'UNDER_INVESTIGATION' ? const Color(0xFFD97706) : const Color(0xFF64748B),
                fontSize: 10, fontWeight: FontWeight.bold,
              ),
            ),
          ]),
        );
      }),
    ]);
  }
}

class _CasesTab extends StatelessWidget {
  final List cases;
  const _CasesTab({required this.cases});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: cases.length,
      itemBuilder: (ctx, i) {
        final cs = cases[i] as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(cs['case_reference'] ?? '', style: const TextStyle(color: Color(0xFF0F766E), fontSize: 12, fontWeight: FontWeight.bold, fontFamily: 'monospace'))),
              Text(
                (cs['status'] as String? ?? '').replaceAll('_', ' '),
                style: TextStyle(
                  color: cs['status'] == 'UNDER_INVESTIGATION' ? const Color(0xFFD97706) : const Color(0xFF64748B),
                  fontSize: 10, fontWeight: FontWeight.bold,
                ),
              ),
            ]),
            const SizedBox(height: 4),
            Text(cs['title'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(cs['classification'] ?? '', style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
          ]),
        );
      },
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
