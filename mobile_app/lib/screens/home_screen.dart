import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:home_widget/home_widget.dart';
import 'package:local_auth/local_auth.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final LocalAuthentication _localAuth = LocalAuthentication();
  bool _authenticated = false;
  bool _widgetSynced = false;

  Future<void> _authenticate() async {
    try {
      final canCheckBiometrics = await _localAuth.canCheckBiometrics;
      final isSupported = await _localAuth.isDeviceSupported();
      if (!canCheckBiometrics || !isSupported) {
        _showSnackBar('Biometrics are not available on this device.');
        return;
      }

      final success = await _localAuth.authenticate(
        localizedReason: 'Unlock PulseGrid with biometrics',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );

      setState(() {
        _authenticated = success;
      });

      _showSnackBar(
        success ? 'Biometric authentication succeeded.' : 'Authentication cancelled.',
      );
    } catch (e) {
      _showSnackBar('Biometric auth failed: $e');
    }
  }

  Future<void> _syncWidget() async {
    try {
      await HomeWidget.saveWidgetData<String>(
        'pulsegrid_last_sync',
        DateTime.now().toIso8601String(),
      );
      await HomeWidget.saveWidgetData<String>(
        'pulsegrid_widget_message',
        'PulseGrid is ready for quick actions',
      );
      await HomeWidget.updateWidget(name: 'PulseGridWidgetProvider');

      setState(() {
        _widgetSynced = true;
      });
      _showSnackBar('Home widget payload synced.');
    } catch (e) {
      _showSnackBar('Widget sync failed: $e');
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('PulseGrid'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            onPressed: () => context.push('/settings'),
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  theme.colorScheme.primary,
                  theme.colorScheme.primaryContainer,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PulseGrid Smart Home',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Manage flows, pair devices, unlock with biometrics, and sync widgets.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onPrimary.withValues(alpha: 0.9),
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _ActionChip(
                      icon: Icons.playlist_play,
                      label: 'Flows',
                      onTap: () => context.push('/flows'),
                    ),
                    _ActionChip(
                      icon: Icons.auto_awesome,
                      label: 'Builder',
                      onTap: () => context.push('/flows/create'),
                    ),
                    _ActionChip(
                      icon: Icons.devices,
                      label: 'Devices',
                      onTap: () => context.push('/devices'),
                    ),
                    _ActionChip(
                      icon: Icons.settings,
                      label: 'Settings',
                      onTap: () => context.push('/settings'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _FeatureCard(
            icon: Icons.fingerprint,
            title: 'Biometric auth',
            subtitle: _authenticated
                ? 'Unlocked successfully on this device.'
                : 'Tap to enable local_auth verification for sensitive actions.',
            trailing: FilledButton(
              onPressed: _authenticate,
              child: Text(_authenticated ? 'Re-authenticate' : 'Unlock'),
            ),
          ),
          const SizedBox(height: 12),
          _FeatureCard(
            icon: Icons.home_work_outlined,
            title: 'Home widget sync',
            subtitle: _widgetSynced
                ? 'Widget payload updated for quick glance data.'
                : 'Persist a widget payload and refresh the home screen widget.',
            trailing: OutlinedButton(
              onPressed: _syncWidget,
              child: const Text('Sync widget'),
            ),
          ),
          const SizedBox(height: 12),
          _FeatureCard(
            icon: Icons.bluetooth,
            title: 'BLE device pairing',
            subtitle:
                'Use the Devices screen to scan nearby peripherals with flutter_blue_plus.',
            trailing: OutlinedButton(
              onPressed: () => context.push('/devices'),
              child: const Text('Open scanner'),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Today',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          const _TimelineCard(
            icon: Icons.schedule,
            title: 'Scheduled flows',
            subtitle: '2 automations due in the next hour',
          ),
          const SizedBox(height: 8),
          const _TimelineCard(
            icon: Icons.warning_amber_rounded,
            title: 'Recent alert',
            subtitle: 'Webhook retry spike detected on the marketing workspace',
          ),
          const SizedBox(height: 8),
          const _TimelineCard(
            icon: Icons.analytics_outlined,
            title: 'AI suggestion',
            subtitle: 'Create a follow-up flow from the latest support events',
          ),
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      onPressed: onTap,
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget trailing;

  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.55),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: theme.colorScheme.primaryContainer,
              foregroundColor: theme.colorScheme.onPrimaryContainer,
              child: Icon(icon),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(subtitle),
                ],
              ),
            ),
            const SizedBox(width: 12),
            trailing,
          ],
        ),
      ),
    );
  }
}

class _TimelineCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _TimelineCard({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
      ),
    );
  }
}
