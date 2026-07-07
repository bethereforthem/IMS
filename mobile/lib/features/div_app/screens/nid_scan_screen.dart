import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import '../../../core/network/api_client.dart';

class NidScanScreen extends ConsumerStatefulWidget {
  const NidScanScreen({super.key});

  @override
  ConsumerState<NidScanScreen> createState() => _NidScanScreenState();
}

class _NidScanScreenState extends ConsumerState<NidScanScreen> {
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
    if (cameras.isEmpty) return;
    _camera = CameraController(cameras.first, ResolutionPreset.high);
    await _camera!.initialize();
    if (mounted) setState(() {});
  }

  Future<void> _captureAndScan() async {
    if (_camera == null || _scanning) return;
    setState(() { _scanning = true; _statusMessage = 'Scanning ID card...'; });

    try {
      final image = await _camera!.takePicture();
      final inputImage = InputImage.fromFilePath(image.path);
      final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
      final recognized = await recognizer.processImage(inputImage);
      await recognizer.close();

      // Extract MRZ / national ID from recognized text
      final nid = _extractNidFromText(recognized.text);

      if (nid == null) {
        setState(() { _statusMessage = 'Could not read ID — try again or enter manually'; _scanning = false; });
        return;
      }

      setState(() { _statusMessage = 'ID number extracted — verifying...'; });
      await _submitVerification(nid);
    } catch (e) {
      setState(() { _statusMessage = 'Error: $e'; _scanning = false; });
    }
  }

  String? _extractNidFromText(String text) {
    // Rwanda NID: 16-digit number, sometimes with spaces
    final cleaned = text.replaceAll(RegExp(r'\s'), '');
    final match = RegExp(r'\d{16}').firstMatch(cleaned);
    return match?.group(0);
  }

  Future<void> _submitVerification(String nid) async {
    try {
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
      } catch (_) {}

      final api = ref.read(apiClientProvider);
      final result = await api.nidScan(
        nationalIdNumber: nid,
        lat: position?.latitude,
        lng: position?.longitude,
        accuracyM: position?.accuracy.toInt(),
      );

      if (mounted) {
        _showResult(result);
      }
    } catch (e) {
      setState(() { _statusMessage = 'Verification failed: $e'; });
    } finally {
      setState(() { _scanning = false; });
    }
  }

  void _showResult(Map<String, dynamic> result) {
    final criminalFound = result['criminal_record_found'] as bool? ?? false;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: criminalFound ? Colors.red.shade900 : Colors.green.shade900,
        title: Row(
          children: [
            Icon(criminalFound ? Icons.warning : Icons.check_circle, color: Colors.white),
            const SizedBox(width: 8),
            Text(
              criminalFound ? 'CRIMINAL RECORD FOUND' : 'IDENTITY VERIFIED',
              style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('NID Match (NIDA): ${result['nida_match'] == true ? "YES" : result['nida_match'] == false ? "NO" : "UNKNOWN"}',
                style: const TextStyle(color: Colors.white)),
            if (result['nida_full_name'] != null)
              Text('Name: ${result['nida_full_name']}', style: const TextStyle(color: Colors.white)),
            if (criminalFound)
              const Text('⚠ Alert transmitted at TOP SECRET level', style: TextStyle(color: Colors.yellow)),
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
      appBar: AppBar(title: const Text('Scan National ID — NID_SCAN')),
      body: Column(
        children: [
          if (_camera != null && _camera!.value.isInitialized)
            Expanded(
              flex: 3,
              child: Stack(
                children: [
                  CameraPreview(_camera!),
                  // MRZ viewfinder overlay
                  Center(
                    child: Container(
                      width: 320, height: 100,
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.green, width: 2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 8, left: 0, right: 0,
                    child: Text(
                      'Align the MRZ strip (back of ID) within the green box',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, backgroundColor: Colors.black54),
                    ),
                  ),
                ],
              ),
            )
          else
            const Expanded(flex: 3, child: Center(child: CircularProgressIndicator())),
          Expanded(
            flex: 1,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  if (_statusMessage != null)
                    Text(_statusMessage!, style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: _scanning ? null : _captureAndScan,
                    icon: _scanning
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.document_scanner),
                    label: Text(_scanning ? 'Scanning...' : 'Scan ID Card'),
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
