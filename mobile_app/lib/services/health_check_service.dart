import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../config/app_config.dart';

/// Health status response model
class HealthStatus {
  final bool isHealthy;
  final String status;
  final String? message;
  final DateTime checkedAt;
  final int? statusCode;
  final Duration? responseTime;

  HealthStatus({
    required this.isHealthy,
    required this.status,
    this.message,
    required this.checkedAt,
    this.statusCode,
    this.responseTime,
  });

  factory HealthStatus.fromJson(Map<String, dynamic> json) {
    return HealthStatus(
      isHealthy: json['isHealthy'] == true || json['status'] == 'ok',
      status: json['status'] ?? 'unknown',
      message: json['message'],
      checkedAt: DateTime.now(),
      statusCode: json['statusCode'],
      responseTime: null,
    );
  }

  factory HealthStatus.error(String message) {
    return HealthStatus(
      isHealthy: false,
      status: 'error',
      message: message,
      checkedAt: DateTime.now(),
      statusCode: null,
      responseTime: null,
    );
  }

  @override
  String toString() {
    return 'HealthStatus('
        'isHealthy: $isHealthy, '
        'status: $status, '
        'message: $message, '
        'statusCode: $statusCode, '
        'responseTime: $responseTime)';
  }
}

/// Service for checking API and Socket health status
class HealthCheckService {
  static final HealthCheckService _instance = HealthCheckService._internal();

  late Dio _dio;
  bool _initialized = false;
  HealthStatus? _lastHealthStatus;
  HealthStatus? _lastSocketStatus;

  factory HealthCheckService() {
    return _instance;
  }

  HealthCheckService._internal() {
    _initialize();
  }

  void _initialize() {
    if (_initialized) {
      return;
    }

    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: AppConfig.connectionTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        validateStatus: (status) => true, // Accept all status codes
      ),
    );

    _initialized = true;
  }

  /// Check API health status
  Future<HealthStatus> checkApiHealth() async {
    try {
      final startTime = DateTime.now();

      final response = await _dio.get('/health');

      final responseTime = DateTime.now().difference(startTime);

      if (response.statusCode == 200 || response.statusCode == 204) {
        _lastHealthStatus = HealthStatus(
          isHealthy: true,
          status: 'ok',
          message: 'API is healthy',
          checkedAt: DateTime.now(),
          statusCode: response.statusCode,
          responseTime: responseTime,
        );

        if (AppConfig.isLoggingEnabled) {
          debugPrint('API Health Check: OK ($responseTime)');
        }

        return _lastHealthStatus!;
      } else {
        _lastHealthStatus = HealthStatus(
          isHealthy: false,
          status: 'unhealthy',
          message: 'API returned status ${response.statusCode}',
          checkedAt: DateTime.now(),
          statusCode: response.statusCode,
          responseTime: responseTime,
        );

        if (AppConfig.isLoggingEnabled) {
          debugPrint('API Health Check: FAILED - Status ${response.statusCode}');
        }

        return _lastHealthStatus!;
      }
    } catch (e) {
      _lastHealthStatus = HealthStatus.error('API health check failed: $e');

      if (AppConfig.isLoggingEnabled) {
        debugPrint('API Health Check Exception: $e');
      }

      return _lastHealthStatus!;
    }
  }

  /// Check Socket connectivity (basic check)
  /// Note: Full socket health check requires active connection
  Future<HealthStatus> checkSocketHealth() async {
    try {
      // Try to establish a basic connection to the socket endpoint
      final startTime = DateTime.now();

      final response = await _dio.get('/socket.io/', queryParameters: {
        'EIO': '4',
        'transport': 'polling',
      });

      final responseTime = DateTime.now().difference(startTime);

      if (response.statusCode == 200) {
        _lastSocketStatus = HealthStatus(
          isHealthy: true,
          status: 'ok',
          message: 'Socket endpoint is reachable',
          checkedAt: DateTime.now(),
          statusCode: response.statusCode,
          responseTime: responseTime,
        );

        if (AppConfig.isLoggingEnabled) {
          debugPrint('Socket Health Check: OK ($responseTime)');
        }

        return _lastSocketStatus!;
      } else {
        _lastSocketStatus = HealthStatus(
          isHealthy: false,
          status: 'unreachable',
          message: 'Socket endpoint returned status ${response.statusCode}',
          checkedAt: DateTime.now(),
          statusCode: response.statusCode,
          responseTime: responseTime,
        );

        if (AppConfig.isLoggingEnabled) {
          debugPrint('Socket Health Check: FAILED - Status ${response.statusCode}');
        }

        return _lastSocketStatus!;
      }
    } catch (e) {
      _lastSocketStatus = HealthStatus.error('Socket health check failed: $e');

      if (AppConfig.isLoggingEnabled) {
        debugPrint('Socket Health Check Exception: $e');
      }

      return _lastSocketStatus!;
    }
  }

  /// Check all services health status
  Future<Map<String, HealthStatus>> checkAllHealth() async {
    final results = <String, HealthStatus>{};

    results['api'] = await checkApiHealth();
    results['socket'] = await checkSocketHealth();

    return results;
  }

  /// Get last API health status
  HealthStatus? get lastApiStatus => _lastHealthStatus;

  /// Get last Socket health status
  HealthStatus? get lastSocketStatus => _lastSocketStatus;

  /// Check if API is currently healthy (based on last check)
  bool get isApiHealthy => _lastHealthStatus?.isHealthy ?? false;

  /// Check if Socket is currently healthy (based on last check)
  bool get isSocketHealthy => _lastSocketStatus?.isHealthy ?? false;
}
