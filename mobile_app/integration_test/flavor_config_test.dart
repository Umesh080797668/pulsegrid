import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_app/main.dart' as app;
import 'package:mobile_app/config/app_config.dart';
import 'package:mobile_app/config/app_flavor.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Flavor Configuration Integration Tests', () {
    testWidgets('App initializes with production configuration', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(AppConfig.isProduction, true);
      expect(AppConfig.apiBaseUrl, 'https://api.pulsegrid.app');
      expect(AppConfig.flavorName, 'Production');
    });

    testWidgets('API endpoint is correctly configured', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(
        AppConfig.apiEndpoint,
        'https://api.pulsegrid.app/api/v1',
      );
    });

    testWidgets('Socket URL is correctly configured', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(
        AppConfig.socketUrl,
        'https://api.pulsegrid.app',
      );
    });

    testWidgets('Certificate pinning is enabled in production', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(AppConfig.isCertificatePinningEnabled, true);
    });

    testWidgets('Logging is disabled in production', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(AppConfig.isLoggingEnabled, false);
    });
  });
}
