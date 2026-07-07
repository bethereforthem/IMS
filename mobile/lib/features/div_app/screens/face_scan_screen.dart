import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/network/api_client.dart';

class FaceScanScreen extends ConsumerStatefulWidget {
  const FaceScanScreen({super.key});

  @override
  ConsumerState<FaceScanScreen> createState() => _FaceScanScreenState();
}

class _FaceScanScreenState extends ConsumerState<FaceScanScreen> {
  CameraController? _camera;
  bool _scanning = false;
  String? _statusMessage;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  @override
  void dispose() {
    _camera?.dispose();
    super.dispose();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    // Prefer front camera for face scan
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );
    _camera = CameraController(front, ResolutionPreset.medium);
    await _camera!.initialize();
    if (mounted) setState(() {});
  }

  Future<void> _captureAndScan() async {
    if (_camera == null || _scanning) return;
    setState(() { _scanning = true; _statusMessage = 'Capturing face...'; });

    try {
      final image = await _camera!.takePicture();
      final bytes = await image.readAsBytes();
      final base64Image = base64Encode(bytes);

      setState(() { _statusMessage = 'Identifying (IMS + NIDA + Interpol)...'; });

      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      } catch (_) {}

      final api = ref.read(apiClientProvider);
      final result = await api.faceScan(
        imageBase64: base64Image,
        lat: position?.latitude,
        lng: position?.longitude,
        accuracyM: position?.accuracy.toInt(),
      );

      if (mounted) _showResult(result);
    } catch (e) {
      setState(() { _statusMessage = 'Error: $e'; });
    } finally {
      if (mounted) setState(() { _scanning = false; });
    }
  }

  void _showResult(Map<String, dynamic> result) {
    final tier = result['confidence_tier'] as String? ?? 'NO_MATCH';
    final criminalFound = result['criminal_record_found'] as bool? ?? false;
    final matches = result['matches'] as List? ?? [];

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: criminalFound
            ? Colors.red.shade900
            : tier == 'NO_MATCH' ? Colors.grey.shade800 : Colors.blue.shade900,
        title: Text(
          'FACE SCAN — $tier',
          style: const TextStyle(color: Colors.white),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Criminal record: ${criminalFound ? "⚠ YES" : "NO"}',
                  style: TextStyle(color: criminalFound ? Colors.yellow : Colors.green)),
              const SizedBox(height: 8),
              if (result['pending_human_review'] == true)
                const Text('⏳ Pending human review (POSSIBLE match)',
                    style: TextStyle(color: Colors.orange, fontSize: 12)),
              ...matches.map((m) => Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Source: ${m['source']}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    Text('Confidence: ${((m['confidence'] as double) * 100).toStringAsFixed(1)}%',
                        style: const TextStyle(color: Colors.white)),
                    if (m['name'] != null) Text('Name: ${m['name']}', style: const TextStyle(color: Colors.white)),
                    if (m['interpol_file_no'] != null)
                      Text('Interpol: ${m['interpol_file_no']}', style: const TextStyle(color: Colors.red)),
                  ],
                ),
              )),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('CLOSE', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Face Scan — FACE_SCAN')),
      body: Column(
        children: [
          if (_camera != null && _camera!.value.isInitialized)
            Expanded(
              flex: 3,
              child: Stack(
                children: [
                  CameraPreview(_camera!),
                  Center(
                    child: Container(
                      width: 240, height: 300,
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFF00438B), width: 2),
                        borderRadius: BorderRadius.circular(120),
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            const Expanded(flex: 3, child: Center(child: CircularProgressIndicator())),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  if (_statusMessage != null)
                    Text(_statusMessage!, style: const TextStyle(color: Colors.white70), textAlign: TextAlign.center),
                  const Text(
                    'Queries IMS + NIDA + Interpol simultaneously',
                    style: TextStyle(color: Colors.white38, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: _scanning ? null : _captureAndScan,
                    icon: _scanning
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.face_retouching_natural),
                    label: Text(_scanning ? 'Scanning...' : 'Identify Person'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
