import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/config/app_config.dart';
import 'package:mobile_app/config/app_flavor.dart';
import 'package:mobile_app/config/environment_config.dart';

void main() {
  group('AppConfig Tests', () {
    test('AppConfig initializes with development flavor', () {
      AppConfig.initialize(flavor: AppFlavor.development);
      expect(AppConfig.flavor, AppFlavor.development);
      expect(AppConfig.isDevelopment, true);
      expect(AppConfig.isStaging, false);
      expect(AppConfig.isProduction, false);
    });

    test('AppConfig initializes with staging flavor', () {
      AppConfig.initialize(flavor: AppFlavor.staging);
      expect(AppConfig.flavor, AppFlavor.staging);
      expect(AppConfig.isStaging, true);
      expect(AppConfig.isDevelopment, false);
      expect(AppConfig.isProduction, false);
    });

    test('AppConfig initializes with production flavor', () {
      AppConfig.initialize(flavor: AppFlavor.production);
      expect(AppConfig.flavor, AppFlavor.production);
      expect(AppConfig.isProduction, true);
      expect(AppConfig.isDevelopment, false);
      expect(AppConfig.isStaging, false);
    });

    test('Development environment configuration is correct', () {
      final config = EnvironmentConfig.development;
      expect(config.apiBaseUrl, 'http://localhost:3001');
      expect(config.socketUrl, 'http://localhost:3001');
      expect(config.apiVersion, 'v1');
      expect(config.enableLogging, true);
      expect(config.certificatePinning, false);
    });

    test('Staging environment configuration is correct', () {
      final config = EnvironmentConfig.staging;
      expect(config.apiBaseUrl, 'https://api-staging.pulsegrid.app');
      expect(config.socketUrl, 'https://api-staging.pulsegrid.app');
      expect(config.apiVersion, 'v1');
      expect(config.enableLogging, true);
      expect(config.certificatePinning, true);
    });

    test('Production environment configuration is correct', () {
      final config = EnvironmentConfig.production;
      expect(config.apiBaseUrl, 'https://api.pulsegrid.app');
      expect(config.socketUrl, 'https://api.pulsegrid.app');
      expect(config.apiVersion, 'v1');
      expect(config.enableLogging, false);
      expect(config.certificatePinning, true);
    });

    test('AppConfig provides correct API endpoint', () {
      AppConfig.initialize(flavor: AppFlavor.development);
      expect(
        AppConfig.apiEndpoint,
        'http://localhost:3001/api/v1',
      );

      AppConfig.initialize(flavor: AppFlavor.production);
      expect(
        AppConfig.apiEndpoint,
        'https://api.pulsegrid.app/api/v1',
      );
    });

    test('AppConfig provides correct timeouts for each flavor', () {
      AppConfig.initialize(flavor: AppFlavor.development);
      expect(
        AppConfig.connectionTimeout,
        const Duration(seconds: 10),
      );

      AppConfig.initialize(flavor: AppFlavor.staging);
      expect(
        AppConfig.connectionTimeout,
        const Duration(seconds: 15),
      );

      AppConfig.initialize(flavor: AppFlavor.production);
      expect(
        AppConfig.connectionTimeout,
        const Duration(seconds: 15),
      );
    });

    test('Flavor display names are correct', () {
      expect(AppFlavor.development.displayName, 'Development');
      expect(AppFlavor.staging.displayName, 'Staging');
      expect(AppFlavor.production.displayName, 'Production');
    });
  });
}
