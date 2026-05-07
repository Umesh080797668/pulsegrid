import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService extends ChangeNotifier {
  static const String _biometricEnabledKey = 'pulsegrid_biometric_enabled';
  static const String _sessionExpiryKey = 'pulsegrid_session_expiry';
  static const int _sessionDurationMinutes = 30; // Re-auth after 30 minutes of background

  final LocalAuthentication _localAuth = LocalAuthentication();
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  bool _isAuthenticated = false;
  bool _biometricAvailable = false;
  bool _biometricEnabled = false;
  DateTime? _lastAuthTime;

  bool get isAuthenticated => _isAuthenticated;
  bool get biometricAvailable => _biometricAvailable;
  bool get biometricEnabled => _biometricEnabled;

  AuthService() {
    _initializeAuth();
  }

  Future<void> _initializeAuth() async {
    await _checkBiometricAvailability();
    await _restoreSessionIfValid();
  }

  Future<void> _checkBiometricAvailability() async {
    try {
      final canCheckBiometrics = await _localAuth.canCheckBiometrics;
      final isSupported = await _localAuth.isDeviceSupported();
      _biometricAvailable = canCheckBiometrics && isSupported;

      final enabledStr = await _secureStorage.read(key: _biometricEnabledKey);
      _biometricEnabled = enabledStr == 'true';
      notifyListeners();
    } catch (e) {
      debugPrint('Error checking biometric availability: $e');
      _biometricAvailable = false;
      _biometricEnabled = false;
    }
  }

  /// Restore session if it's still valid (not expired)
  Future<void> _restoreSessionIfValid() async {
    try {
      if (!_biometricEnabled) {
        return;
      }

      final expiryStr = await _secureStorage.read(key: _sessionExpiryKey);
      if (expiryStr == null) {
        return;
      }

      final expiry = DateTime.parse(expiryStr);
      if (DateTime.now().isBefore(expiry)) {
        _isAuthenticated = true;
        _lastAuthTime = DateTime.now().subtract(Duration(minutes: _sessionDurationMinutes));
        debugPrint('Session restored: user still authenticated');
      } else {
        await _clearSession();
        debugPrint('Session expired, requiring re-authentication');
      }
      notifyListeners();
    } catch (e) {
      debugPrint('Error restoring session: $e');
      await _clearSession();
    }
  }

  /// Check if session has expired due to background activity
  Future<bool> _isSessionExpired() async {
    if (!_isAuthenticated || _lastAuthTime == null) {
      return true;
    }

    // If user has been backgrounded for more than 30 minutes, require re-auth
    final elapsed = DateTime.now().difference(_lastAuthTime!);
    return elapsed.inMinutes >= _sessionDurationMinutes;
  }

  /// Authenticate user with biometrics or request setup if not enabled
  Future<bool> authenticate() async {
    try {
      // If biometrics are not enabled, set it up first
      if (!_biometricEnabled) {
        return await _setupBiometricAuth();
      }

      // Attempt biometric authentication
      final success = await _localAuth.authenticate(
        localizedReason: 'Unlock PulseGrid with biometrics',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );

      if (success) {
        await _createSession();
        debugPrint('Biometric authentication successful');
      }

      return success;
    } catch (e) {
      debugPrint('Authentication error: $e');
      return false;
    }
  }

  /// Setup biometric authentication for the first time
  Future<bool> _setupBiometricAuth() async {
    try {
      if (!_biometricAvailable) {
        debugPrint('Biometrics not available on this device');
        return false;
      }

      final success = await _localAuth.authenticate(
        localizedReason: 'Set up biometric authentication for PulseGrid',
        options: const AuthenticationOptions(
          biometricOnly: false,
        ),
      );

      if (success) {
        await _secureStorage.write(key: _biometricEnabledKey, value: 'true');
        _biometricEnabled = true;
        await _createSession();
        debugPrint('Biometric authentication setup successful');
      }

      notifyListeners();
      return success;
    } catch (e) {
      debugPrint('Biometric setup error: $e');
      return false;
    }
  }

  /// Create a new authenticated session
  Future<void> _createSession() async {
    _isAuthenticated = true;
    _lastAuthTime = DateTime.now();

    // Store session expiry time (30 minutes from now)
    final expiryTime = DateTime.now().add(Duration(minutes: _sessionDurationMinutes));
    await _secureStorage.write(key: _sessionExpiryKey, value: expiryTime.toIso8601String());

    notifyListeners();
  }

  /// Clear the current session
  Future<void> _clearSession() async {
    _isAuthenticated = false;
    _lastAuthTime = null;
    await _secureStorage.delete(key: _sessionExpiryKey);
    notifyListeners();
  }

  /// Logout user completely
  Future<void> logout() async {
    _biometricEnabled = false;
    _isAuthenticated = false;
    _lastAuthTime = null;
    await _secureStorage.delete(key: _biometricEnabledKey);
    await _secureStorage.delete(key: _sessionExpiryKey);
    notifyListeners();
  }

  /// Check if re-authentication is needed and prompt if necessary
  Future<bool> checkAndPromptIfExpired() async {
    if (await _isSessionExpired()) {
      debugPrint('Session expired, prompting for re-authentication');
      await _clearSession();
      return await authenticate();
    }
    return true;
  }

  /// Refresh session timestamp when app comes to foreground
  void onAppResumed() {
    if (_isAuthenticated && _lastAuthTime != null) {
      _lastAuthTime = DateTime.now();
    }
  }
}
