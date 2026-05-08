import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/config/app_config.dart';
import 'package:mobile_app/config/app_flavor.dart';
import 'package:mobile_app/services/realtime_service.dart';

void main() {
  group('RealtimeService Tests', () {
    setUp(() {
      AppConfig.initialize(flavor: AppFlavor.development);
    });

    test('RealtimeService uses AppConfig socket URL by default', () {
      final service = RealtimeService();
      expect(service.socketUrl, AppConfig.socketUrl);
    });

    test('RealtimeService respects custom socket URL', () {
      const customUrl = 'https://custom.example.com';
      final service = RealtimeService(socketUrl: customUrl);
      expect(service.socketUrl, customUrl);
    });

    test('RealtimeService uses production URL in production flavor', () {
      AppConfig.initialize(flavor: AppFlavor.production);
      final service = RealtimeService();
      expect(service.socketUrl, 'https://api.pulsegrid.app');
    });

    test('RealtimeService uses staging URL in staging flavor', () {
      AppConfig.initialize(flavor: AppFlavor.staging);
      final service = RealtimeService();
      expect(service.socketUrl, 'https://api-staging.pulsegrid.app');
    });

    test('RealtimeService uses localhost in development flavor', () {
      AppConfig.initialize(flavor: AppFlavor.development);
      final service = RealtimeService();
      expect(service.socketUrl, 'http://localhost:3001');
    });
  });
}
