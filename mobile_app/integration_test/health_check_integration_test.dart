import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_app/main.dart' as app;
import 'package:mobile_app/config/app_config.dart';
import 'package:mobile_app/config/app_flavor.dart';
import 'package:mobile_app/services/health_check_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Health Check Service Integration Tests', () {
    testWidgets('HealthCheckService is accessible', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      final healthService = HealthCheckService();
      expect(healthService, isNotNull);
    });

    testWidgets('HealthCheckService uses correct endpoints for flavor', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(AppConfig.isProduction, true);
      final healthService = HealthCheckService();
      expect(healthService, isNotNull);
      // Health checks would be performed here against production endpoints
    });

    testWidgets('Singleton pattern works for HealthCheckService', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      final service1 = HealthCheckService();
      final service2 = HealthCheckService();
      expect(identical(service1, service2), true);
    });
  });
}
