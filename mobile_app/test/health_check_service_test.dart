import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/config/app_config.dart';
import 'package:mobile_app/config/app_flavor.dart';
import 'package:mobile_app/services/health_check_service.dart';

void main() {
  group('HealthStatus Tests', () {
    test('HealthStatus creation with success', () {
      final status = HealthStatus(
        isHealthy: true,
        status: 'ok',
        message: 'Service is healthy',
        checkedAt: DateTime.now(),
        statusCode: 200,
        responseTime: const Duration(milliseconds: 100),
      );

      expect(status.isHealthy, true);
      expect(status.status, 'ok');
      expect(status.statusCode, 200);
    });

    test('HealthStatus creation from JSON', () {
      final json = {
        'isHealthy': true,
        'status': 'ok',
        'message': 'All systems operational',
        'statusCode': 200,
      };

      final status = HealthStatus.fromJson(json);
      expect(status.isHealthy, true);
      expect(status.status, 'ok');
    });

    test('HealthStatus creation from error', () {
      final status = HealthStatus.error('Connection timeout');
      expect(status.isHealthy, false);
      expect(status.status, 'error');
      expect(status.message, 'Connection timeout');
    });
  });

  group('HealthCheckService Tests', () {
    setUp(() {
      AppConfig.initialize(flavor: AppFlavor.development);
    });

    test('HealthCheckService singleton works correctly', () {
      final service1 = HealthCheckService();
      final service2 = HealthCheckService();
      expect(identical(service1, service2), true);
    });

    test('HealthCheckService initializes correctly', () {
      final service = HealthCheckService();
      expect(service.lastApiStatus, isNull);
      expect(service.lastSocketStatus, isNull);
    });
  });
}
