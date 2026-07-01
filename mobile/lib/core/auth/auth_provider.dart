import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';

const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
);

class AuthState {
  final String accessToken;
  final String refreshToken;
  final String role;
  final String institution;
  final String clearance;
  final String userId;

  const AuthState({
    required this.accessToken,
    required this.refreshToken,
    required this.role,
    required this.institution,
    required this.clearance,
    required this.userId,
  });
}

class AuthNotifier extends AsyncNotifier<AuthState?> {
  @override
  Future<AuthState?> build() async {
    final token = await _storage.read(key: 'access_token');
    final refresh = await _storage.read(key: 'refresh_token');
    final role = await _storage.read(key: 'role');
    final institution = await _storage.read(key: 'institution');
    final clearance = await _storage.read(key: 'clearance');
    final userId = await _storage.read(key: 'user_id');

    if (token == null || role == null) return null;
    return AuthState(
      accessToken: token,
      refreshToken: refresh!,
      role: role,
      institution: institution!,
      clearance: clearance!,
      userId: userId!,
    );
  }

  Future<void> login({
    required String badgeNumber,
    required String password,
    required String totpCode,
    required String deviceId,
  }) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.login(
        badgeNumber: badgeNumber,
        password: password,
        totpCode: totpCode,
        deviceId: deviceId,
      );

      // Parse JWT claims
      final claims = _parseJwtClaims(response['access_token'] as String);

      await _storage.write(key: 'access_token', value: response['access_token'] as String);
      await _storage.write(key: 'refresh_token', value: response['refresh_token'] as String);
      await _storage.write(key: 'role', value: claims['role'] as String);
      await _storage.write(key: 'institution', value: claims['institution'] as String);
      await _storage.write(key: 'clearance', value: claims['clearance'] as String);
      await _storage.write(key: 'user_id', value: claims['sub'] as String);

      state = AsyncValue.data(AuthState(
        accessToken: response['access_token'] as String,
        refreshToken: response['refresh_token'] as String,
        role: claims['role'] as String,
        institution: claims['institution'] as String,
        clearance: claims['clearance'] as String,
        userId: claims['sub'] as String,
      ));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> logout() async {
    await _storage.deleteAll();
    state = const AsyncValue.data(null);
  }

  Map<String, dynamic> _parseJwtClaims(String token) {
    final parts = token.split('.');
    if (parts.length != 3) return {};
    import 'dart:convert';
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    return jsonDecode(payload) as Map<String, dynamic>;
  }
}

final authStateProvider = AsyncNotifierProvider<AuthNotifier, AuthState?>(() => AuthNotifier());
