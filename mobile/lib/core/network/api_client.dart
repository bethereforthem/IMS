import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _baseUrl = String.fromEnvironment('IMS_API_URL', defaultValue: 'http://10.0.2.2:8000/api/v1');

class IMSApiClient {
  final Dio _dio;
  static const _storage = FlutterSecureStorage();

  IMSApiClient() : _dio = _buildDio();

  static Dio _buildDio() {
    final dio = Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Attempt token refresh
          final refreshed = await _tryRefresh();
          if (refreshed) {
            final token = await _storage.read(key: 'access_token');
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            handler.resolve(await Dio().fetch(error.requestOptions));
            return;
          }
        }
        handler.next(error);
      },
    ));
    return dio;
  }

  static Future<bool> _tryRefresh() async {
    try {
      final refresh = await _storage.read(key: 'refresh_token');
      if (refresh == null) return false;
      final r = await Dio().post('$_baseUrl/auth/refresh', data: {'refresh_token': refresh});
      await _storage.write(key: 'access_token', value: r.data['access_token'] as String);
      await _storage.write(key: 'refresh_token', value: r.data['refresh_token'] as String);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ---- Auth ----

  Future<Map<String, dynamic>> login({
    required String badgeNumber,
    required String password,
    required String totpCode,
    required String deviceId,
  }) async {
    final r = await _dio.post('/auth/login', data: {
      'badge_number': badgeNumber,
      'password': password,
      'totp_code': totpCode,
      'device_id': deviceId,
    });
    return r.data as Map<String, dynamic>;
  }

  // ---- DIV App ----

  Future<Map<String, dynamic>> nidScan({
    required String nationalIdNumber,
    double? lat,
    double? lng,
    int? accuracyM,
    String? deviceId,
  }) async {
    final r = await _dio.post('/identity/nid/scan', data: {
      'national_id_number': nationalIdNumber,
      if (lat != null) 'officer_location_lat': lat,
      if (lng != null) 'officer_location_lng': lng,
      if (accuracyM != null) 'officer_location_accuracy_m': accuracyM,
      if (deviceId != null) 'device_id': deviceId,
    });
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> nidManual({
    required String nationalIdNumber,
    double? lat,
    double? lng,
    int? accuracyM,
  }) async {
    final r = await _dio.post('/identity/nid/manual', data: {
      'national_id_number': nationalIdNumber,
      if (lat != null) 'officer_location_lat': lat,
      if (lng != null) 'officer_location_lng': lng,
      if (accuracyM != null) 'officer_location_accuracy_m': accuracyM,
    });
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> faceScan({
    required String imageBase64,
    double? lat,
    double? lng,
    int? accuracyM,
    String? linkedNidVerificationId,
  }) async {
    final r = await _dio.post('/identity/face/scan', data: {
      'image_base64': imageBase64,
      if (lat != null) 'officer_location_lat': lat,
      if (lng != null) 'officer_location_lng': lng,
      if (accuracyM != null) 'officer_location_accuracy_m': accuracyM,
      if (linkedNidVerificationId != null) 'linked_nid_verification_id': linkedNidVerificationId,
    });
    return r.data as Map<String, dynamic>;
  }

  // ---- Suspects ----

  Future<Map<String, dynamic>> listSuspects({int page = 1, String? name, String? status}) async {
    final r = await _dio.get('/suspects', queryParameters: {
      'page': page,
      if (name != null) 'name': name,
      if (status != null) 'status': status,
    });
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getSuspect(String id) async {
    final r = await _dio.get('/suspects/$id');
    return r.data as Map<String, dynamic>;
  }

  // ---- Alerts ----

  Future<List<dynamic>> listAlerts({bool acknowledged = false}) async {
    final r = await _dio.get('/admin/alerts', queryParameters: {'acknowledged': acknowledged});
    return r.data as List<dynamic>;
  }

  Future<void> acknowledgeAlert(String alertId) async {
    await _dio.post('/admin/alerts/$alertId/acknowledge');
  }

  // Generic REST helpers used by dashboard screens
  Future<Response<dynamic>> get(String path, {Map<String, dynamic>? queryParameters}) =>
      _dio.get(path, queryParameters: queryParameters);

  Future<Response<dynamic>> post(String path, {dynamic data}) =>
      _dio.post(path, data: data);

  Future<Response<dynamic>> patch(String path, {dynamic data}) =>
      _dio.patch(path, data: data);
}

final apiClientProvider = Provider<IMSApiClient>((ref) => IMSApiClient());
