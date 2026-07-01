import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';

final suspectsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, int>((ref, page) async {
  final api = ref.read(apiClientProvider);
  return api.listSuspects(page: page);
});

class SuspectsScreen extends ConsumerWidget {
  const SuspectsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(suspectsProvider(1));
    return Scaffold(
      appBar: AppBar(title: const Text('Suspect Records')),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (d) {
          final items = d['items'] as List? ?? [];
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(color: Colors.white12),
            itemBuilder: (ctx, i) {
              final s = items[i] as Map<String, dynamic>;
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: const Color(0xFF00438B),
                  child: Text((s['first_name'] as String? ?? '?')[0].toUpperCase()),
                ),
                title: Text('${s['first_name'] ?? ''} ${s['last_name'] ?? ''}'.trim()),
                subtitle: Text('${s['ims_reference']} | ${s['status']}'),
                trailing: _StatusChip(status: s['status'] as String? ?? ''),
                onTap: () => context.go('/suspects/${s['id']}'),
              );
            },
          );
        },
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  Color get _color => switch (status) {
    'WANTED' => Colors.red,
    'IN_CUSTODY' => Colors.orange,
    'CONVICTED' => Colors.purple,
    'RELEASED' => Colors.grey,
    _ => Colors.blue,
  };

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(status, style: const TextStyle(color: Colors.white, fontSize: 10)),
      backgroundColor: _color,
      padding: EdgeInsets.zero,
      visualDensity: VisualDensity.compact,
    );
  }
}
