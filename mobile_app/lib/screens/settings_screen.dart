import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/home_widget_service.dart';
import '../services/auth_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _widgetUpdated = false;

  Future<void> _refreshWidgetPayload() async {
    try {
      await HomeWidgetService.syncSnapshot(
        title: 'PulseGrid',
        message: 'Settings updated with latest data.',
        status: 'Updated at ${DateTime.now().toLocal().toIso8601String()}',
      );

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

  Future<void> _logout(AuthService authService) async {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout? You will need to authenticate again.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              await authService.logout();
              if (mounted) {
                Navigator.pop(context);
                context.go('/');
              }
            },
            child: const Text('Logout'),
          ),
        ],
      ),
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
              leading: const Icon(Icons.lock_outline),
              title: const Text('Biometric authentication'),
              subtitle: const Text('Your app access is protected by biometric authentication.'),
              trailing: TextButton(
                onPressed: () {
                  final authService = AuthService();
                  _logout(authService);
                },
                child: const Text('Logout'),
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
