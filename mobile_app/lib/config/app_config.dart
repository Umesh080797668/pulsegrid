import 'package:flutter/material.dart';
import 'app_flavor.dart';
import 'environment_config.dart';

/// Global application configuration singleton
class AppConfig {
  static final AppConfig _instance = AppConfig._internal();

  late AppFlavor _flavor;
  late EnvironmentConfig _environmentConfig;

  factory AppConfig() {
    return _instance;
  }

  AppConfig._internal();

  /// Initialize the application configuration with the specified flavor
  static void initialize({required AppFlavor flavor}) {
    _instance._flavor = flavor;
    _instance._environmentConfig = EnvironmentConfig.forFlavor(flavor);
    
    debugPrint('AppConfig initialized with flavor: ${flavor.displayName}');
    debugPrint('EnvironmentConfig: ${_instance._environmentConfig}');
  }

  /// Get the current flavor
  static AppFlavor get flavor => _instance._flavor;

  /// Get the current environment configuration
  static EnvironmentConfig get environment => _instance._environmentConfig;

  /// Get the API base URL
  static String get apiBaseUrl => _instance._environmentConfig.apiBaseUrl;

  /// Get the Socket URL
  static String get socketUrl => _instance._environmentConfig.socketUrl;

  /// Get the API endpoint (base URL + version)
  static String get apiEndpoint => _instance._environmentConfig.apiEndpoint;

  /// Get the API version
  static String get apiVersion => _instance._environmentConfig.apiVersion;

  /// Get connection timeout
  static Duration get connectionTimeout => _instance._environmentConfig.connectionTimeout;

  /// Get receive timeout
  static Duration get receiveTimeout => _instance._environmentConfig.receiveTimeout;

  /// Check if logging is enabled
  static bool get isLoggingEnabled => _instance._environmentConfig.enableLogging;

  /// Check if certificate pinning is enabled
  static bool get isCertificatePinningEnabled =>
      _instance._environmentConfig.certificatePinning;

  /// Check if this is production flavor
  static bool get isProduction => _instance._flavor == AppFlavor.production;

  /// Check if this is staging flavor
  static bool get isStaging => _instance._flavor == AppFlavor.staging;

  /// Check if this is development flavor
  static bool get isDevelopment => _instance._flavor == AppFlavor.development;

  /// Get flavor display name
  static String get flavorName => _instance._flavor.displayName;
}
