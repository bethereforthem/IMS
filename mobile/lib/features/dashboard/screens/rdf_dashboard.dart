import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/network/api_client.dart';
import '../widgets/stat_tile.dart';
import '../widgets/alert_card.dart';
import '../../div_app/screens/div_home_screen.dart';

class RDFDashboard extends ConsumerStatefulWidget {
  const RDFDashboard({super.key});

  @override
  ConsumerState<RDFDashboard> createState() => _RDFDashboardState();
}

class _RDFDashboardState extends ConsumerState<RDFDashboard> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  List<dynamic> _cameras = [];
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
        api.getEvents(limit: 10),
      ]);
      if (mounted) setState(() {
        _stats = results[0] as Map<String, dynamic>? ?? {};
        _cameras = [];
        _alerts = results[1] as List<dynamic>;
        _events = (results[2] as List<dynamic>).where((e) => (e as Map)['source_tag'] == 'CCTV_NODE').toList();
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
        backgroundColor: const Color(0xFF15803D),
        title: const Row(children: [
          Icon(Icons.security, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text('RDF Border Ops', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ]),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
          IconButton(icon: const Icon(Icons.logout, color: Colors.white), onPressed: () => ref.read(authStateProvider.notifier).logout()),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF15803D)))
          : IndexedStack(index: _tab, children: [
              _BorderTab(stats: _stats, cameras: _cameras, events: _events, user: user),
              _CameraTab(cameras: _cameras),
              _AlertsTab(alerts: _alerts),
              const DivHomeScreen(),
            ]),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: const Color(0xFF15803D).withValues(alpha: 0.3),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'Border'),
          NavigationDestination(icon: Icon(Icons.videocam_outlined), selectedIcon: Icon(Icons.videocam), label: 'Cameras'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.fingerprint_outlined), selectedIcon: Icon(Icons.fingerprint), label: 'DIV'),
        ],
      ),
    );
  }
}

class _BorderTab extends StatelessWidget {
  final Map<String, dynamic>? stats;
  final List cameras;
  final List events;
  final dynamic user;
  const _BorderTab({this.stats, required this.cameras, required this.events, this.user});

  @override
  Widget build(BuildContext context) {
    final online = cameras.where((c) => (c as Map)['is_active'] == true).length;

    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF15803D).withValues(alpha:0.15), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF15803D).withValues(alpha:0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.military_tech, color: Color(0xFF15803D), size: 20),
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
            StatTile(label: 'Border Cams Online', value: '$online/${cameras.length}', icon: Icons.videocam,
              color: online < cameras.length ? const Color(0xFFD97706) : const Color(0xFF16A34A)),
            StatTile(label: 'CCTV Detections', value: '${events.length}', icon: Icons.remove_red_eye, color: const Color(0xFF15803D)),
            StatTile(label: 'Alerts', value: '${stats!['alerts_today'] ?? 0}', icon: Icons.notifications, color: const Color(0xFFD97706)),
            StatTile(label: 'Border Suspects', value: '${stats!['total_suspects'] ?? 0}', icon: Icons.people, color: const Color(0xFF1D4ED8)),
          ],
        ),
      const SizedBox(height: 16),

      // Pi camera preview placeholder
      const Text('Pi Camera — Live Preview', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      Container(
        height: 200,
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF15803D).withValues(alpha:0.4)),
        ),
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.videocam, color: Color(0xFF334155), size: 40),
            const SizedBox(height: 8),
            const Text('Connect Pi edge node', style: TextStyle(color: Color(0xFF64748B), fontSize: 13)),
            const SizedBox(height: 4),
            Text('GTN-BORDER-01 MJPEG stream', style: TextStyle(color: const Color(0xFF64748B).withValues(alpha:0.6), fontSize: 11)),
          ]),
        ),
      ),
      const SizedBox(height: 16),

      // Recent CCTV detections
      const Text('Recent Detections', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      ...events.take(5).map((ev) {
        final e = ev as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(children: [
            Icon(Icons.circle, color: e['criminal_record_found'] == true ? const Color(0xFFDC2626) : const Color(0xFF16A34A), size: 8),
            const SizedBox(width: 10),
            Expanded(child: Text(e['suspect_name'] ?? e['camera_node_id'] ?? '—', style: const TextStyle(color: Colors.white, fontSize: 13))),
            if (e['confidence_score'] != null)
              Text('${((e['confidence_score'] as double) * 100).toStringAsFixed(1)}%', style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
            if (e['criminal_record_found'] == true)
              const Padding(
                padding: EdgeInsets.only(left: 8),
                child: Text('RECORD', style: TextStyle(color: Color(0xFFDC2626), fontSize: 10, fontWeight: FontWeight.bold)),
              ),
          ]),
        );
      }),
    ]);
  }
}

class _CameraTab extends StatelessWidget {
  final List cameras;
  const _CameraTab({required this.cameras});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: cameras.length,
      itemBuilder: (ctx, i) {
        final cam = cameras[i] as Map<String, dynamic>;
        final online = cam['is_active'] == true;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(12),
            border: Border.all(color: online ? const Color(0xFF166534).withValues(alpha:0.5) : const Color(0xFF7F1D1D).withValues(alpha:0.5)),
          ),
          child: Row(children: [
            Icon(online ? Icons.wifi : Icons.wifi_off, color: online ? const Color(0xFF16A34A) : const Color(0xFFDC2626), size: 20),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(cam['node_identifier'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
              Text(cam['location_name'] ?? '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
            ])),
            Text(online ? 'ONLINE' : 'OFFLINE', style: TextStyle(color: online ? const Color(0xFF16A34A) : const Color(0xFFDC2626), fontSize: 10, fontWeight: FontWeight.bold)),
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
        const Text('Border Alerts', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (alerts.isEmpty)
          const Center(child: Padding(padding: EdgeInsets.all(40), child: Text('No active alerts', style: TextStyle(color: Color(0xFF64748B)))))
        else
          ...alerts.map((a) => AlertCard(alert: a as Map<String, dynamic>)),
      ],
    );
  }
}
