import 'app_flavor.dart';

/// Environment-specific configuration
class EnvironmentConfig {
  final String apiBaseUrl;
  final String socketUrl;
  final String apiVersion;
  final Duration connectionTimeout;
  final Duration receiveTimeout;
  final bool enableLogging;
  final bool certificatePinning;

  const EnvironmentConfig({
    required this.apiBaseUrl,
    required this.socketUrl,
    required this.apiVersion,
    required this.connectionTimeout,
    required this.receiveTimeout,
    required this.enableLogging,
    required this.certificatePinning,
  });

  /// Get the full API endpoint (base URL + version)
  String get apiEndpoint => '$apiBaseUrl/api/$apiVersion';

  /// Development environment configuration
  static const EnvironmentConfig development = EnvironmentConfig(
    apiBaseUrl: 'http://localhost:3001',
    socketUrl: 'http://localhost:3001',
    apiVersion: 'v1',
    connectionTimeout: Duration(seconds: 10),
    receiveTimeout: Duration(seconds: 10),
    enableLogging: true,
    certificatePinning: false,
  );

  /// Staging environment configuration
  static const EnvironmentConfig staging = EnvironmentConfig(
    apiBaseUrl: 'https://api-staging.pulsegrid.app',
    socketUrl: 'https://api-staging.pulsegrid.app',
    apiVersion: 'v1',
    connectionTimeout: Duration(seconds: 15),
    receiveTimeout: Duration(seconds: 15),
    enableLogging: true,
    certificatePinning: true,
  );

  /// Production environment configuration
  static const EnvironmentConfig production = EnvironmentConfig(
    apiBaseUrl: 'https://api.pulsegrid.app',
    socketUrl: 'https://api.pulsegrid.app',
    apiVersion: 'v1',
    connectionTimeout: Duration(seconds: 15),
    receiveTimeout: Duration(seconds: 15),
    enableLogging: false,
    certificatePinning: true,
  );

  /// Get configuration for a specific flavor
  static EnvironmentConfig forFlavor(AppFlavor flavor) {
    switch (flavor) {
      case AppFlavor.development:
        return development;
      case AppFlavor.staging:
        return staging;
      case AppFlavor.production:
        return production;
    }
  }

  @override
  String toString() {
    return 'EnvironmentConfig('
        'apiBaseUrl: $apiBaseUrl, '
        'socketUrl: $socketUrl, '
        'apiVersion: $apiVersion, '
        'connectionTimeout: $connectionTimeout, '
        'receiveTimeout: $receiveTimeout, '
        'enableLogging: $enableLogging, '
        'certificatePinning: $certificatePinning)';
  }
}
