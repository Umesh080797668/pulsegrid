import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:home_widget/home_widget.dart';
import 'package:local_auth/local_auth.dart';
import 'package:dio/dio.dart';
import '../services/fcm_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final LocalAuthentication _localAuth = LocalAuthentication();
  final Dio _dio = Dio();
  final FcmService _fcmService = FcmService();
  bool _authenticated = false;
  bool _widgetSynced = false;
  List<QuickFlow> _quickFlows = [];

  @override
  void initState() {
    super.initState();
    _initializeFcm();
  }

  /// Initialize FCM on app startup
  Future<void> _initializeFcm() async {
    try {
      // Request permissions and register token
      await _fcmService.initialize();
      _showSnackBar('Push notifications enabled');
    } catch (e) {
      print('FCM initialization error: $e');
    }
  }

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

  Future<void> _loadQuickFlows() async {
    try {
      final response = await _dio.get('http://localhost:3001/api/v1/flows?enabled=true');
      final List<dynamic> data = response.data as List<dynamic>;
      setState(() {
        _quickFlows = data
            .map((item) => QuickFlow.fromJson(item as Map<String, dynamic>))
            .toList();
      });
    } catch (e) {
      _showSnackBar('Failed to load flows: $e');
    }
  }

  void _showQuickTriggers() async {
    await _loadQuickFlows();
    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Quick Triggers',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          Flexible(
            child: _quickFlows.isEmpty
                ? const Center(child: Text('No enabled flows'))
                : ListView.builder(
                    itemCount: _quickFlows.length,
                    itemBuilder: (context, index) {
                      final flow = _quickFlows[index];
                      return ListTile(
                        title: Text(flow.name),
                        trailing: ElevatedButton(
                          onPressed: () => _runFlow(flow.id),
                          child: const Text('Run'),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _runFlow(String flowId) async {
    try {
      await _dio.post('http://localhost:3001/api/v1/flows/$flowId/run');
      if (!mounted) return;
      Navigator.pop(context);
      _showSnackBar('Flow triggered successfully');
    } catch (e) {
      _showSnackBar('Failed to run flow: $e');
    }
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
                      icon: Icons.bolt,
                      label: 'Quick Run',
                      onTap: _showQuickTriggers,
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
class QuickFlow {
  final String id;
  final String name;

  QuickFlow({required this.id, required this.name});

  factory QuickFlow.fromJson(Map<String, dynamic> json) {
    return QuickFlow(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Untitled',
    );
  }
}