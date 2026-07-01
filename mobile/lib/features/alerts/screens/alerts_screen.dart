import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final alertsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  return ref.read(apiClientProvider).listAlerts(acknowledged: false);
});

class AlertsScreen extends ConsumerWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(alertsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Alerts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(alertsProvider),
          ),
        ],
      ),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (alerts) {
          if (alerts.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.notifications_none, size: 64, color: Colors.white24),
                  SizedBox(height: 12),
                  Text('No pending alerts', style: TextStyle(color: Colors.white38)),
                ],
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: alerts.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (ctx, i) {
              final a = alerts[i] as Map<String, dynamic>;
              return _AlertCard(
                alert: a,
                onAcknowledge: () async {
                  await ref.read(apiClientProvider).acknowledgeAlert(a['id'] as String);
                  ref.invalidate(alertsProvider);
                },
              );
            },
          );
        },
      ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  final Map<String, dynamic> alert;
  final VoidCallback onAcknowledge;
  const _AlertCard({required this.alert, required this.onAcknowledge});

  Color get _priorityColor => switch (alert['priority'] as String? ?? '') {
    'CRITICAL' => Colors.red,
    'HIGH' => Colors.orange,
    'MEDIUM' => Colors.yellow,
    _ => Colors.blue,
  };

  IconData get _sourceIcon => switch (alert['source_tag'] as String? ?? '') {
    'CCTV_NODE' => Icons.videocam,
    'FACE_SCAN' => Icons.face_retouching_natural,
    'NID_SCAN' => Icons.document_scanner,
    'NID_MANUAL' => Icons.keyboard,
    'INTERPOL_FEED' => Icons.public,
    'SYSTEM_ALERT' => Icons.notifications_active,
    _ => Icons.warning_amber,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _priorityColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _priorityColor.withOpacity(0.4)),
      ),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: _priorityColor, shape: BoxShape.circle),
          child: Icon(_sourceIcon, color: Colors.white, size: 20),
        ),
        title: Text(
          alert['title'] as String? ?? 'Alert',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              alert['source_tag'] as String? ?? '',
              style: TextStyle(color: _priorityColor, fontSize: 11, fontWeight: FontWeight.bold),
            ),
            Text(
              alert['classification'] as String? ?? '',
              style: const TextStyle(color: Colors.white38, fontSize: 11),
            ),
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.check_circle_outline, color: Colors.green),
          tooltip: 'Acknowledge',
          onPressed: onAcknowledge,
        ),
        isThreeLine: true,
      ),
    );
  }
}
