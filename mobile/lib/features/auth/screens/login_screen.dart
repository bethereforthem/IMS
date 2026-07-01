import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';

import '../../../core/auth/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _badgeCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _totpCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _badgeCtrl.dispose();
    _passwordCtrl.dispose();
    _totpCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    // Biometric check before network call
    final localAuth = LocalAuthentication();
    final canCheck = await localAuth.canCheckBiometrics;
    if (canCheck) {
      final authenticated = await localAuth.authenticate(
        localizedReason: 'Confirm your identity to access IMS',
        options: const AuthenticationOptions(biometricOnly: true),
      );
      if (!authenticated) {
        setState(() { _loading = false; _error = 'Biometric authentication failed'; });
        return;
      }
    }

    try {
      await ref.read(authStateProvider.notifier).login(
        badgeNumber: _badgeCtrl.text.trim(),
        password: _passwordCtrl.text,
        totpCode: _totpCtrl.text.trim(),
        deviceId: 'device_${_badgeCtrl.text.trim()}',
      );
      if (mounted) context.go('/div');
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF001A3D),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 48),
                _Logo(),
                const SizedBox(height: 48),
                _Field(
                  controller: _badgeCtrl,
                  label: 'Badge Number',
                  icon: Icons.badge_outlined,
                  validator: (v) => (v?.isEmpty ?? true) ? 'Badge number required' : null,
                ),
                const SizedBox(height: 16),
                _Field(
                  controller: _passwordCtrl,
                  label: 'Password',
                  icon: Icons.lock_outline,
                  obscure: _obscurePassword,
                  suffixIcon: IconButton(
                    icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  ),
                  validator: (v) => (v?.isEmpty ?? true) ? 'Password required' : null,
                ),
                const SizedBox(height: 16),
                _Field(
                  controller: _totpCtrl,
                  label: 'MFA Code (6 digits)',
                  icon: Icons.security,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  validator: (v) => (v?.length != 6) ? '6-digit code required' : null,
                ),
                const SizedBox(height: 24),
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade900,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_error!, style: const TextStyle(color: Colors.white)),
                  ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _loading ? null : _login,
                  child: _loading
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('LOGIN + BIOMETRIC', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 24),
                const Text(
                  'RESTRICTED — Law Enforcement Use Only\nUnauthorized access is a criminal offense',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white38, fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 80, height: 80,
          decoration: BoxDecoration(
            color: const Color(0xFF00438B),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(Icons.shield, color: Colors.white, size: 48),
        ),
        const SizedBox(height: 16),
        const Text('IMS Rwanda', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
        const Text('Intelligence Management System v3.0', style: TextStyle(color: Colors.white54, fontSize: 13)),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscure;
  final Widget? suffixIcon;
  final TextInputType? keyboardType;
  final int? maxLength;
  final String? Function(String?)? validator;

  const _Field({
    required this.controller,
    required this.label,
    required this.icon,
    this.obscure = false,
    this.suffixIcon,
    this.keyboardType,
    this.maxLength,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      maxLength: maxLength,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white54),
        prefixIcon: Icon(icon, color: Colors.white54),
        suffixIcon: suffixIcon,
        counterText: '',
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        enabledBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: Colors.white24),
          borderRadius: BorderRadius.circular(8),
        ),
        focusedBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: Color(0xFF00438B)),
          borderRadius: BorderRadius.circular(8),
        ),
        filled: true,
        fillColor: Colors.white.withOpacity(0.05),
      ),
      validator: validator,
    );
  }
}
