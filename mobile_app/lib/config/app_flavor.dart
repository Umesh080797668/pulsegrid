/// Enumeration of application flavors (build variants)
enum AppFlavor {
  development,
  staging,
  production,
}

/// Extension to get string representation of flavor
extension AppFlavorExt on AppFlavor {
  String get name {
    switch (this) {
      case AppFlavor.development:
        return 'development';
      case AppFlavor.staging:
        return 'staging';
      case AppFlavor.production:
        return 'production';
    }
  }

  String get displayName {
    switch (this) {
      case AppFlavor.development:
        return 'Development';
      case AppFlavor.staging:
        return 'Staging';
      case AppFlavor.production:
        return 'Production';
    }
  }
}
