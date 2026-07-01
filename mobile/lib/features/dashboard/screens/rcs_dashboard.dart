import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/network/api_client.dart';
import '../widgets/stat_tile.dart';
import '../widgets/alert_card.dart';
import '../../div_app/screens/div_home_screen.dart';

class RCSDashboard extends ConsumerStatefulWidget {
  const RCSDashboard({super.key});

  @override
  ConsumerState<RCSDashboard> createState() => _RCSDashboardState();
}

class _RCSDashboardState extends ConsumerState<RCSDashboard> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  List<dynamic> _custody = [];
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
        api.get('/dashboard/stats'),
        api.get('/suspects?status=IN_CUSTODY&limit=20'),
        api.get('/alerts?limit=8&unread_only=true'),
      ]);
      if (mounted) setState(() {
        _stats = results[0].data as Map<String, dynamic>;
        final cdata = results[1].data;
        _custody = (cdata is Map ? cdata['suspects'] : cdata) as List? ?? [];
        _alerts = results[2].data as List? ?? [];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).valueOrNull;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFFB45309),
        title: const Row(children: [
          Icon(Icons.lock, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text('RCS Custody', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ]),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout, color: Colors.white), onPressed: () => ref.read(authProvider.notifier).logout()),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFB45309)))
          : IndexedStack(index: _tab, children: [
              _CustodyTab(stats: _stats, custody: _custody, user: user),
              _InmatesTab(custody: _custody),
              _AlertsTab(alerts: _alerts),
              const DIVHomeScreen(),
            ]),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: const Color(0xFFB45309).withOpacity(0.3),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Overview'),
          NavigationDestination(icon: Icon(Icons.person_pin_outlined), selectedIcon: Icon(Icons.person_pin), label: 'Inmates'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.fingerprint_outlined), selectedIcon: Icon(Icons.fingerprint), label: 'DIV'),
        ],
      ),
    );
  }
}

class _CustodyTab extends StatelessWidget {
  final Map<String, dynamic>? stats;
  final List custody;
  final dynamic user;
  const _CustodyTab({this.stats, required this.custody, this.user});

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFB45309).withOpacity(0.15), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFB45309).withOpacity(0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.badge, color: Color(0xFFB45309), size: 20),
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
            StatTile(label: 'In Custody', value: '${stats!['in_custody_count'] ?? 0}', icon: Icons.lock, color: const Color(0xFFB45309)),
            StatTile(label: 'Active Warrants', value: '${stats!['active_warrants'] ?? 0}', icon: Icons.article, color: const Color(0xFFD97706)),
            StatTile(label: 'Alerts Today', value: '${stats!['alerts_today'] ?? 0}', icon: Icons.notifications,
              color: (stats!['critical_alerts'] ?? 0) > 0 ? const Color(0xFFDC2626) : const Color(0xFF16A34A)),
            StatTile(label: 'My Inmates', value: '${custody.length}', icon: Icons.people, color: const Color(0xFF1D4ED8)),
          ],
        ),
      const SizedBox(height: 16),

      // Escape protocol notice
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFD97706).withOpacity(0.1), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFD97706).withOpacity(0.4)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.warning_amber, color: Color(0xFFD97706), size: 18),
          const SizedBox(width: 10),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Escape Reporting', style: TextStyle(color: Color(0xFFD97706), fontSize: 13, fontWeight: FontWeight.bold)),
            SizedBox(height: 4),
            Text('Any escape must be reported immediately through the system. Auto-generates CRITICAL alert to RNP, NISS, and RDF.',
              style: TextStyle(color: Color(0xFFD97706), fontSize: 11, height: 1.4)),
          ])),
        ]),
      ),
      const SizedBox(height: 16),
      const Text('Currently In Custody', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      ...custody.take(5).map((s) {
        final suspect = s as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(children: [
            const Icon(Icons.person, color: Color(0xFFB45309), size: 18),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(suspect['full_name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
              Text(suspect['ims_reference'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
            ])),
            Text('Threat ${suspect['threat_level'] ?? 0}/5', style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
          ]),
        );
      }),
    ]);
  }
}

class _InmatesTab extends StatelessWidget {
  final List custody;
  const _InmatesTab({required this.custody});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: custody.length,
      itemBuilder: (ctx, i) {
        final s = custody[i] as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF334155))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFFB45309).withOpacity(0.15), shape: BoxShape.circle),
              child: const Icon(Icons.person, color: Color(0xFFB45309), size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s['full_name'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 2),
              Text(s['ims_reference'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              Text(s['nationality'] ?? '', style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              const Text('IN CUSTODY', style: TextStyle(color: Color(0xFFB45309), fontSize: 10, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text('Threat ${s['threat_level'] ?? 0}/5', style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
            ]),
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
