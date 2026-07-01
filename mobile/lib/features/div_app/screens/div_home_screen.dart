import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_provider.dart';

class DivHomeScreen extends ConsumerWidget {
  const DivHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('IMS — Identity Verification'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.go('/alerts'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authStateProvider.notifier).logout(),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (authState != null) ...[
              _InstitutionBadge(
                institution: authState.institution,
                role: authState.role,
                clearance: authState.clearance,
              ),
              const SizedBox(height: 24),
            ],
            const Text(
              'Digital Identity Verification',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const Text(
              'Select an identification method',
              style: TextStyle(color: Colors.white54),
            ),
            const SizedBox(height: 24),
            _MethodCard(
              icon: Icons.document_scanner,
              title: 'Scan National ID Card',
              subtitle: 'SOURCE: NID_SCAN — OCR / barcode reader',
              color: const Color(0xFF00438B),
              onTap: () => context.go('/div/nid-scan'),
            ),
            const SizedBox(height: 12),
            _MethodCard(
              icon: Icons.keyboard,
              title: 'Enter ID Number Manually',
              subtitle: 'SOURCE: NID_MANUAL — 16-digit national ID',
              color: const Color(0xFF1B5E20),
              onTap: () => context.go('/div/nid-manual'),
            ),
            const SizedBox(height: 12),
            _MethodCard(
              icon: Icons.face_retouching_natural,
              title: 'Face Scan',
              subtitle: 'SOURCE: FACE_SCAN — AI identification (IMS + NIDA + Interpol)',
              color: const Color(0xFF4A148C),
              onTap: () => context.go('/div/face-scan'),
            ),
            const Spacer(),
            OutlinedButton.icon(
              icon: const Icon(Icons.people_outline),
              label: const Text('Suspect Records'),
              onPressed: () => context.go('/suspects'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InstitutionBadge extends StatelessWidget {
  final String institution, role, clearance;
  const _InstitutionBadge({required this.institution, required this.role, required this.clearance});

  Color get _clearanceColor => switch (clearance) {
    'TOP_SECRET' => Colors.red,
    'SECRET' => Colors.orange,
    'CONFIDENTIAL' => Colors.blue,
    _ => Colors.grey,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white12),
      ),
      child: Row(
        children: [
          const Icon(Icons.shield, color: Color(0xFF00438B)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$institution — $role', style: const TextStyle(fontWeight: FontWeight.bold)),
                Text('Clearance: $clearance', style: TextStyle(color: _clearanceColor, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MethodCard extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final Color color;
  final VoidCallback onTap;

  const _MethodCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.15),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.4)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 12)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.white38),
          ],
        ),
      ),
    );
  }
}
