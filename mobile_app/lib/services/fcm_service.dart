import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';

class FcmService {
  static const String _fcmTokenKey = 'fcm_token';
  static const String _fcmTokenSentKey = 'fcm_token_sent';
  static const String _apiBaseUrl = 'http://localhost:3001/api/v1';

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final Dio _dio = Dio();
  late SharedPreferences _prefs;

  FcmService() {
    _initializeSharedPreferences();
  }

  Future<void> _initializeSharedPreferences() async {
    _prefs = await SharedPreferences.getInstance();
  }

  /// Initialize FCM and request permissions
  Future<void> initialize() async {
    try {
      // Request notification permissions
      NotificationSettings settings = await _messaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        print('User granted notification permission');

        // Get current token and register
        final token = await _messaging.getToken();
        if (token != null) {
          await registerFcmToken(token);
        }

        // Listen for token refresh
        _messaging.onTokenRefresh.listen((newToken) async {
          print('FCM Token refreshed: $newToken');
          await registerFcmToken(newToken);
        });

        // Handle foreground messages
        FirebaseMessaging.onMessage.listen((RemoteMessage message) {
          print('Foreground message: ${message.notification?.title}');
          _handleForegroundMessage(message);
        });

        // Handle background message tap
        FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
          print('Message tapped: ${message.data}');
          _handleMessageTap(message);
        });
      } else if (settings.authorizationStatus == AuthorizationStatus.provisional) {
        print('User granted provisional notification permission');
      } else {
        print('User denied notification permission');
      }
    } catch (e) {
      print('Error initializing FCM: $e');
    }
  }

  /// Register FCM token with backend
  Future<bool> registerFcmToken(String token, {String? jwtToken}) async {
    try {
      await _prefs.reload();

      // Check if token is already registered
      final storedToken = _prefs.getString(_fcmTokenKey);
      if (storedToken == token && (_prefs.getBool(_fcmTokenSentKey) ?? false)) {
        print('FCM token already registered: $token');
        return true;
      }

      // Get device info
      final deviceInfo = DeviceInfoPlugin();
      String deviceName = 'Unknown Device';
      String platform = 'android';

      if (Platform.isAndroid) {
        platform = 'android';
        final androidInfo = await deviceInfo.androidInfo;
        deviceName = androidInfo.model;
      } else if (Platform.isIOS) {
        platform = 'ios';
        final iosInfo = await deviceInfo.iosInfo;
        deviceName = iosInfo.model;
      }

      // Send to backend
      final options = Options(
        headers: jwtToken != null ? {'Authorization': 'Bearer $jwtToken'} : {},
        contentType: Headers.jsonContentType,
      );

      final response = await _dio.post(
        '$_apiBaseUrl/users/fcm-token',
        data: {
          'fcmToken': token,
          'platform': platform,
          'deviceName': deviceName,
        },
        options: options,
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Store token locally
        await _prefs.setString(_fcmTokenKey, token);
        await _prefs.setBool(_fcmTokenSentKey, true);
        print('FCM token registered successfully');
        return true;
      }
    } catch (e) {
      print('Error registering FCM token: $e');
    }
    return false;
  }

  /// Handle foreground message (app is open)
  void _handleForegroundMessage(RemoteMessage message) {
    print('Foreground notification received');
    print('Title: ${message.notification?.title}');
    print('Body: ${message.notification?.body}');
    print('Data: ${message.data}');

    // TODO: Show local notification or update UI based on message content
    // Can dispatch to app state management (Riverpod, etc.)
  }

  /// Handle message tap
  void _handleMessageTap(RemoteMessage message) {
    print('Message tapped');
    print('Data: ${message.data}');

    // TODO: Navigate to relevant screen based on message data
    // e.g., if message.data['type'] == 'daily_digest', navigate to analytics_screen
  }

  /// Get current FCM token
  Future<String?> getToken() async {
    try {
      return await _messaging.getToken();
    } catch (e) {
      print('Error getting FCM token: $e');
      return null;
    }
  }

  /// Unregister FCM token (e.g., on logout)
  Future<bool> unregisterFcmToken({String? jwtToken}) async {
    try {
      final token = await getToken();
      if (token == null) return false;

      final options = Options(
        headers: jwtToken != null ? {'Authorization': 'Bearer $jwtToken'} : {},
        contentType: Headers.jsonContentType,
      );

      final response = await _dio.delete(
        '$_apiBaseUrl/users/fcm-token',
        data: {'token': token},
        options: options,
      );

      if (response.statusCode == 200) {
        await _prefs.remove(_fcmTokenKey);
        await _prefs.remove(_fcmTokenSentKey);
        print('FCM token unregistered successfully');
        return true;
      }
    } catch (e) {
      print('Error unregistering FCM token: $e');
    }
    return false;
  }

  /// Get all registered tokens for current user
  Future<Map<String, dynamic>?> getRegisteredTokens({String? jwtToken}) async {
    try {
      final options = Options(
        headers: jwtToken != null ? {'Authorization': 'Bearer $jwtToken'} : {},
        contentType: Headers.jsonContentType,
      );

      final response = await _dio.get(
        '$_apiBaseUrl/users/fcm-tokens',
        options: options,
      );

      if (response.statusCode == 200) {
        return response.data as Map<String, dynamic>;
      }
    } catch (e) {
      print('Error fetching registered tokens: $e');
    }
    return null;
  }
}
