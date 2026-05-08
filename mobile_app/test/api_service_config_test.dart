import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/config/app_config.dart';
import 'package:mobile_app/config/app_flavor.dart';
import 'package:mobile_app/services/api_service.dart';

void main() {
  group('ApiService Tests', () {
    setUp(() {
      AppConfig.initialize(flavor: AppFlavor.development);
    });

    test('ApiService uses correct base URL for development', () {
      AppConfig.initialize(flavor: AppFlavor.development);
      final service = ApiService();
      expect(service.toString().contains('localhost'), true);
    });

    test('ApiService uses correct base URL for production', () {
      AppConfig.initialize(flavor: AppFlavor.production);
      final service = ApiService();
      expect(service.toString().contains('api.pulsegrid.app'), true);
    });

    test('ApiService uses AppConfig endpoints', () {
      AppConfig.initialize(flavor: AppFlavor.staging);
      final service = ApiService();
      expect(service.toString().contains('api-staging.pulsegrid.app'), true);
    });
  });
}
