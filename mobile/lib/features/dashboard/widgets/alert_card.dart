import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';

class AlertCard extends StatelessWidget {
  final Map<String, dynamic> alert;

  const AlertCard({super.key, required this.alert});

  Color get _severityColor {
    switch (alert['severity']) {
      case 'CRITICAL': return const Color(0xFFDC2626);
      case 'HIGH':     return const Color(0xFFD97706);
      case 'MEDIUM':   return const Color(0xFFF59E0B);
      default:         return const Color(0xFF6B7280);
    }
  }

  IconData get _severityIcon {
    switch (alert['severity']) {
      case 'CRITICAL': return Icons.error;
      case 'HIGH':     return Icons.warning_amber;
      case 'MEDIUM':   return Icons.notifications;
      default:         return Icons.info_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _severityColor;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_severityIcon, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  alert['title'] ?? '',
                  style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600),
                ),
                if (alert['message'] != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    alert['message'],
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            alert['severity'] ?? '',
            style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
