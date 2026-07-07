import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/network/api_client.dart';
import '../widgets/stat_tile.dart';
import '../widgets/alert_card.dart';
import '../../div_app/screens/div_home_screen.dart';

class RNPDashboard extends ConsumerStatefulWidget {
  const RNPDashboard({super.key});

  @override
  ConsumerState<RNPDashboard> createState() => _RNPDashboardState();
}

class _RNPDashboardState extends ConsumerState<RNPDashboard> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  List<dynamic> _wanted = [];
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
        api.getWanted(limit: 20),
        api.getAlerts(limit: 8),
      ]);
      if (mounted) {
        setState(() {
          _stats = results[0] as Map<String, dynamic>? ?? {};
          _wanted = results[1] as List<dynamic>;
          _alerts = results[2] as List<dynamic>;
          _loading = false;
        });
      }
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
        backgroundColor: const Color(0xFF1D4ED8),
        title: const Row(
          children: [
            Icon(Icons.local_police, color: Colors.white, size: 20),
            SizedBox(width: 8),
            Text('RNP Operations', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () async => ref.read(authStateProvider.notifier).logout(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF1D4ED8)))
          : IndexedStack(
              index: _tab,
              children: [
                _OperationsTab(stats: _stats, wanted: _wanted, user: user),
                _WantedTab(wanted: _wanted),
                _AlertsTab(alerts: _alerts),
                const DivHomeScreen(),
              ],
            ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: const Color(0xFF1D4ED8).withValues(alpha: 0.3),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Ops'),
          NavigationDestination(icon: Icon(Icons.gps_fixed_outlined), selectedIcon: Icon(Icons.gps_fixed), label: 'Wanted'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.fingerprint_outlined), selectedIcon: Icon(Icons.fingerprint), label: 'DIV'),
        ],
      ),
    );
  }
}

class _OperationsTab extends StatelessWidget {
  final Map<String, dynamic>? stats;
  final List wanted;
  final dynamic user;
  const _OperationsTab({this.stats, required this.wanted, this.user});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1D4ED8).withValues(alpha:0.15),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF1D4ED8).withValues(alpha:0.3)),
          ),
          child: Row(children: [
            const Icon(Icons.badge, color: Color(0xFF1D4ED8), size: 20),
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
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.4,
            children: [
              StatTile(label: 'Wanted', value: '${stats!['wanted_count'] ?? 0}', icon: Icons.gps_fixed, color: const Color(0xFFDC2626)),
              StatTile(label: 'Active Warrants', value: '${stats!['active_warrants'] ?? 0}', icon: Icons.article, color: const Color(0xFFD97706)),
              StatTile(label: 'Alerts Today', value: '${stats!['alerts_today'] ?? 0}', icon: Icons.notifications, color: const Color(0xFF1D4ED8)),
              StatTile(label: 'Cameras', value: '${stats!['camera_nodes_online'] ?? 0}/${stats!['camera_nodes_total'] ?? 0}', icon: Icons.videocam, color: const Color(0xFF16A34A)),
            ],
          ),
        const SizedBox(height: 16),
        const Text('Top Wanted', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        ...wanted.take(3).map((s) {
          final suspect = s as Map<String, dynamic>;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFDC2626).withValues(alpha:0.3)),
            ),
            child: Row(children: [
              const Icon(Icons.person, color: Color(0xFFDC2626), size: 18),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(suspect['full_name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                Text(suspect['ims_reference'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              ])),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(suspect['threat_level'] as int? ?? 0,
                  (_) => const Icon(Icons.circle, color: Color(0xFFDC2626), size: 6)),
              ),
            ]),
          );
        }),
      ],
    );
  }
}

class _WantedTab extends StatelessWidget {
  final List wanted;
  const _WantedTab({required this.wanted});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: wanted.length,
      itemBuilder: (ctx, i) {
        final s = wanted[i] as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFFDC2626).withValues(alpha:0.15), shape: BoxShape.circle),
              child: const Icon(Icons.person, color: Color(0xFFDC2626), size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s['full_name'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 2),
              Text(s['ims_reference'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              if (s['nationality'] != null) Text(s['nationality'], style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              const Text('WANTED', style: TextStyle(color: Color(0xFFDC2626), fontSize: 10, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(s['threat_level'] as int? ?? 0,
                  (_) => const Icon(Icons.circle, color: Color(0xFFDC2626), size: 7)),
              ),
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
        const Text('Active Alerts', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (alerts.isEmpty)
          const Center(child: Padding(padding: EdgeInsets.all(40), child: Text('No active alerts', style: TextStyle(color: Color(0xFF64748B)))))
        else
          ...alerts.map((a) => AlertCard(alert: a as Map<String, dynamic>)),
      ],
    );
  }
}
