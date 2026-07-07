import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/network/api_client.dart';

class NidManualScreen extends ConsumerStatefulWidget {
  const NidManualScreen({super.key});

  @override
  ConsumerState<NidManualScreen> createState() => _NidManualScreenState();
}

class _NidManualScreenState extends ConsumerState<NidManualScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nidCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nidCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    try {
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      } catch (_) {}

      final api = ref.read(apiClientProvider);
      final result = await api.nidManual(
        nationalIdNumber: _nidCtrl.text.trim(),
        lat: position?.latitude,
        lng: position?.longitude,
        accuracyM: position?.accuracy.toInt(),
      );

      if (mounted) _showResult(result);
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  void _showResult(Map<String, dynamic> result) {
    final criminalFound = result['criminal_record_found'] as bool? ?? false;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: criminalFound ? Colors.red.shade900 : Colors.green.shade900,
        title: Text(
          criminalFound ? 'CRIMINAL RECORD FOUND' : 'IDENTITY VERIFIED',
          style: const TextStyle(color: Colors.white),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('NIDA Match: ${result['nida_match'] == true ? "YES" : "NO"}',
                style: const TextStyle(color: Colors.white)),
            if (result['nida_full_name'] != null)
              Text('Name: ${result['nida_full_name']}', style: const TextStyle(color: Colors.white)),
            if (result['nida_photo_url'] != null)
              const Text('⚠ Verify photo shown matches person in front of you',
                  style: TextStyle(color: Colors.yellow, fontSize: 12)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Enter ID Number — NID_MANUAL')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Enter the 16-digit Rwanda national ID number',
                  style: TextStyle(color: Colors.white70)),
              const SizedBox(height: 24),
              TextFormField(
                controller: _nidCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 20, letterSpacing: 2),
                keyboardType: TextInputType.number,
                maxLength: 16,
                decoration: InputDecoration(
                  labelText: 'National ID Number',
                  hintText: '1234567890123456',
                  counterText: '${_nidCtrl.text.length}/16',
                  prefixIcon: const Icon(Icons.credit_card, color: Colors.white54),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha:0.05),
                ),
                onChanged: (_) => setState(() {}),
                validator: (v) {
                  if (v == null || v.trim().length != 16) return 'Must be exactly 16 digits';
                  if (!RegExp(r'^\d{16}$').hasMatch(v.trim())) return 'Numbers only';
                  return null;
                },
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Colors.red.shade300)),
              ],
              const Spacer(),
              ElevatedButton.icon(
                onPressed: _loading ? null : _submit,
                icon: _loading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.search),
                label: Text(_loading ? 'Checking...' : 'Check Identity'),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
