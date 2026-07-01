import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final suspectDetailProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) async {
  return ref.read(apiClientProvider).getSuspect(id);
});

class SuspectDetailScreen extends ConsumerWidget {
  final String suspectId;
  const SuspectDetailScreen({super.key, required this.suspectId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(suspectDetailProvider(suspectId));
    return Scaffold(
      appBar: AppBar(title: const Text('Suspect Profile')),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (s) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(suspect: s),
              const SizedBox(height: 24),
              _Section(title: 'Identity', rows: [
                _row('IMS Reference', s['ims_reference']),
                _row('Status', s['status']),
                _row('Clearance', s['clearance_level']),
                _row('Nationality', s['nationality']),
                _row('Date of Birth', s['date_of_birth']),
              ]),
              const SizedBox(height: 16),
              _Section(title: 'Physical', rows: [
                _row('Height', s['height_cm'] != null ? '${s['height_cm']} cm' : null),
                _row('Weight', s['weight_kg'] != null ? '${s['weight_kg']} kg' : null),
                _row('Eye Color', s['eye_color']),
              ]),
              if (s['interpol_file_no'] != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade900,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.warning, color: Colors.yellow),
                      const SizedBox(width: 8),
                      Text('Interpol ${s['interpol_notice']} Notice: ${s['interpol_file_no']}',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  MapEntry<String, String?> _row(String k, dynamic v) => MapEntry(k, v?.toString());
}

class _Header extends StatelessWidget {
  final Map<String, dynamic> suspect;
  const _Header({required this.suspect});

  @override
  Widget build(BuildContext context) {
    final name = '${suspect['first_name'] ?? ''} ${suspect['last_name'] ?? ''}'.trim();
    return Row(
      children: [
        CircleAvatar(
          radius: 36,
          backgroundColor: const Color(0xFF00438B),
          child: Text(
            name.isEmpty ? '?' : name[0].toUpperCase(),
            style: const TextStyle(color: Colors.white, fontSize: 28),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name.isEmpty ? 'Unknown' : name,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              Text(suspect['owning_institution'] as String? ?? '',
                  style: const TextStyle(color: Colors.white54)),
              if ((suspect['threat_level'] as int? ?? 0) > 0)
                Row(
                  children: List.generate(suspect['threat_level'] as int, (_) =>
                      const Icon(Icons.star, color: Colors.red, size: 16)),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<MapEntry<String, String?>> rows;
  const _Section({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white70)),
        const Divider(color: Colors.white12),
        ...rows.where((e) => e.value != null).map((e) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              SizedBox(width: 120, child: Text(e.key, style: const TextStyle(color: Colors.white54, fontSize: 13))),
              Expanded(child: Text(e.value!, style: const TextStyle(fontSize: 13))),
            ],
          ),
        )),
      ],
    );
  }
}
