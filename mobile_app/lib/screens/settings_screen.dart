import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:home_widget/home_widget.dart';
import 'package:local_auth/local_auth.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final LocalAuthentication _localAuth = LocalAuthentication();
  bool _biometricReady = false;
  bool _widgetUpdated = false;

  Future<void> _enableBiometrics() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final hasBiometrics = await _localAuth.canCheckBiometrics;

      if (!supported || !hasBiometrics) {
        _showSnackBar('This device does not support biometrics.');
        return;
      }

      final success = await _localAuth.authenticate(
        localizedReason: 'Confirm biometric access for PulseGrid settings',
        options: const AuthenticationOptions(biometricOnly: false),
      );

      setState(() {
        _biometricReady = success;
      });

      _showSnackBar(
        success ? 'Biometric protection enabled.' : 'Authentication cancelled.',
      );
    } catch (e) {
      _showSnackBar('Biometric auth error: $e');
    }
  }

  Future<void> _refreshWidgetPayload() async {
    try {
      await HomeWidget.saveWidgetData<String>(
        'pulsegrid_settings_status',
        'Biometrics ${_biometricReady ? 'enabled' : 'inactive'}',
      );
      await HomeWidget.saveWidgetData<String>(
        'pulsegrid_settings_updated_at',
        DateTime.now().toIso8601String(),
      );
      await HomeWidget.updateWidget(name: 'PulseGridWidgetProvider');

      setState(() {
        _widgetUpdated = true;
      });
      _showSnackBar('Widget payload refreshed.');
    } catch (e) {
      _showSnackBar('Widget refresh failed: $e');
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.fingerprint),
              title: const Text('Biometric authentication'),
              subtitle: Text(
                _biometricReady
                    ? 'Biometrics are enabled on this device.'
                    : 'Use local_auth to protect sensitive actions.',
              ),
              trailing: FilledButton(
                onPressed: _enableBiometrics,
                child: Text(_biometricReady ? 'Re-check' : 'Enable'),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.home_work_outlined),
              title: const Text('Home widget sync'),
              subtitle: Text(
                _widgetUpdated
                    ? 'The latest widget payload has been stored.'
                    : 'Refresh the home widget payload for glanceable data.',
              ),
              trailing: OutlinedButton(
                onPressed: _refreshWidgetPayload,
                child: const Text('Sync now'),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.bluetooth_searching),
              title: const Text('BLE devices'),
              subtitle: const Text('Scan and pair nearby IoT devices.'),
              trailing: TextButton(
                onPressed: () => context.push('/devices'),
                child: const Text('Open scanner'),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: const ListTile(
              leading: Icon(Icons.notifications_active_outlined),
              title: Text('Push notifications'),
              subtitle: Text('Configured through Firebase Messaging on mobile.'),
            ),
          ),
        ],
      ),
    );
  }
}
