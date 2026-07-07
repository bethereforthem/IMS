import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/network/api_client.dart';
import '../widgets/stat_tile.dart';
import '../widgets/alert_card.dart';
import '../../div_app/screens/div_home_screen.dart';

class NISSDashboard extends ConsumerStatefulWidget {
  const NISSDashboard({super.key});

  @override
  ConsumerState<NISSDashboard> createState() => _NISSDashboardState();
}

class _NISSDashboardState extends ConsumerState<NISSDashboard> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  List<dynamic> _alerts = [];
  List<dynamic> _events = [];
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
        api.getAlerts(limit: 8),
        api.getEvents(limit: 12),
      ]);
      if (mounted) {
        setState(() {
          _stats = results[0] as Map<String, dynamic>? ?? {};
          _alerts = results[1] as List<dynamic>;
          _events = results[2] as List<dynamic>;
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
        backgroundColor: const Color(0xFF7C3AED),
        title: const Row(
          children: [
            Icon(Icons.shield, color: Colors.white, size: 20),
            SizedBox(width: 8),
            Text('NISS Command', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () async {
              await ref.read(authStateProvider.notifier).logout();
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED)))
          : IndexedStack(
              index: _tab,
              children: [
                _CommandCenter(stats: _stats, alerts: _alerts, events: _events, user: user),
                _AlertsTab(alerts: _alerts),
                const DivHomeScreen(),
              ],
            ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: const Color(0xFF7C3AED).withValues(alpha: 0.3),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Command'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.fingerprint_outlined), selectedIcon: Icon(Icons.fingerprint), label: 'DIV'),
        ],
      ),
    );
  }
}

class _CommandCenter extends StatelessWidget {
  final Map<String, dynamic>? stats;
  final List alerts;
  final List events;
  final dynamic user;

  const _CommandCenter({this.stats, required this.alerts, required this.events, this.user});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: const Color(0xFF7C3AED),
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // User banner
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF7C3AED).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF7C3AED).withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.verified_user, color: Color(0xFF7C3AED), size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(user?.fullName ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text('${user?.badgeNumber ?? ''} · TOP SECRET', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  ]),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Stats grid
          if (stats != null) ...[
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.4,
              children: [
                StatTile(label: 'Total Suspects', value: '${stats!['total_suspects'] ?? 0}', icon: Icons.people, color: const Color(0xFF7C3AED)),
                StatTile(label: 'Wanted', value: '${stats!['wanted_count'] ?? 0}', icon: Icons.gps_fixed, color: const Color(0xFFDC2626)),
                StatTile(label: 'Alerts Today', value: '${stats!['alerts_today'] ?? 0}', icon: Icons.notifications, color: const Color(0xFFD97706),
                  sub: (stats!['critical_alerts'] ?? 0) > 0 ? '${stats!['critical_alerts']} CRITICAL' : null),
                StatTile(label: 'Cameras Online', value: '${stats!['camera_nodes_online'] ?? 0}/${stats!['camera_nodes_total'] ?? 0}', icon: Icons.videocam, color: const Color(0xFF16A34A)),
              ],
            ),
            const SizedBox(height: 16),
          ],

          // Recent alerts
          const Text('Live Alerts', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...alerts.take(5).map((a) => AlertCard(alert: a as Map<String, dynamic>)),

          const SizedBox(height: 16),
          // Recent events
          const Text('Recent Intel Events', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...events.take(6).map((ev) {
            final e = ev as Map<String, dynamic>;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Row(
                children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(e['suspect_name'] ?? e['ims_reference'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                    Text(e['source_tag'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  ])),
                  if (e['criminal_record_found'] == true)
                    const Text('RECORD', style: TextStyle(color: Color(0xFFDC2626), fontSize: 10, fontWeight: FontWeight.bold)),
                ],
              ),
            );
          }),
        ],
      ),
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
        const Text('All Active Alerts', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (alerts.isEmpty)
          const Center(child: Padding(
            padding: EdgeInsets.all(40),
            child: Text('No active alerts', style: TextStyle(color: Color(0xFF64748B))),
          ))
        else
          ...alerts.map((a) => AlertCard(alert: a as Map<String, dynamic>)),
      ],
    );
  }
}
