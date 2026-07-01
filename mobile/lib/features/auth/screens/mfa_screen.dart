import 'package:flutter/material.dart';

class MfaScreen extends StatelessWidget {
  const MfaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('MFA Setup')),
      body: const Center(
        child: Text('TOTP QR code setup screen — scan with authenticator app'),
      ),
    );
  }
}
