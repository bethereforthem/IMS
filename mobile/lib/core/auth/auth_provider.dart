import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';

const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(),
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
);

class AuthState {
  final String accessToken;
  final String refreshToken;
  final String role;
  final String institution;
  final String clearance;
  final String userId;
  final String fullName;
  final String badgeNumber;

  const AuthState({
    required this.accessToken,
    required this.refreshToken,
    required this.role,
    required this.institution,
    required this.clearance,
    required this.userId,
    this.fullName = '',
    this.badgeNumber = '',
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
    final fullName = await _storage.read(key: 'full_name');
    final badgeNumber = await _storage.read(key: 'badge_number');

    if (token == null || role == null) return null;
    return AuthState(
      accessToken: token,
      refreshToken: refresh ?? '',
      role: role,
      institution: institution ?? '',
      clearance: clearance ?? '',
      userId: userId ?? '',
      fullName: fullName ?? '',
      badgeNumber: badgeNumber ?? '',
    );
  }

  Future<void> login({
    required String badgeNumber,
    required String password,
    required String deviceId,
  }) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.login(
        badgeNumber: badgeNumber,
        password: password,
        deviceId: deviceId,
      );

      // Parse JWT claims
      final claims = _parseJwtClaims(response['access_token'] as String);

      final jwtRole = (claims['role'] ?? '') as String;
      final jwtInstitution = (claims['institution'] ?? '') as String;
      final jwtClearance = (claims['clearance'] ?? claims['clearance_level'] ?? '') as String;
      final jwtUserId = (claims['sub'] ?? claims['user_id'] ?? '') as String;
      final jwtFullName = (claims['full_name'] ?? '') as String;
      final jwtBadgeNumber = (claims['badge_number'] ?? badgeNumber) as String;

      await _storage.write(key: 'access_token', value: response['access_token'] as String);
      await _storage.write(key: 'refresh_token', value: response['refresh_token'] as String);
      await _storage.write(key: 'role', value: jwtRole);
      await _storage.write(key: 'institution', value: jwtInstitution);
      await _storage.write(key: 'clearance', value: jwtClearance);
      await _storage.write(key: 'user_id', value: jwtUserId);
      await _storage.write(key: 'full_name', value: jwtFullName);
      await _storage.write(key: 'badge_number', value: jwtBadgeNumber);

      state = AsyncValue.data(AuthState(
        accessToken: response['access_token'] as String,
        refreshToken: response['refresh_token'] as String,
        role: jwtRole,
        institution: jwtInstitution,
        clearance: jwtClearance,
        userId: jwtUserId,
        fullName: jwtFullName,
        badgeNumber: jwtBadgeNumber,
      ));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout() async {
    await _storage.deleteAll();
    state = const AsyncValue.data(null);
  }

  Map<String, dynamic> _parseJwtClaims(String token) {
    final parts = token.split('.');
    if (parts.length != 3) return {};
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    return jsonDecode(payload) as Map<String, dynamic>;
  }
}

final authStateProvider = AsyncNotifierProvider<AuthNotifier, AuthState?>(() => AuthNotifier());
