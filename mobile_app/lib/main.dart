import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'screens/home_screen.dart';
import 'screens/flow_list_screen.dart';
import 'screens/flow_detail_screen.dart';
import 'screens/builder_screen.dart';
import 'screens/devices_screen.dart';
import 'screens/event_feed_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/market_screen.dart';
import 'screens/approvals_screen.dart';
import 'screens/alert_centre_screen.dart';
import 'services/api_service.dart';
import 'services/home_widget_service.dart';

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final ApiService _apiService = ApiService();
  StreamSubscription<List<SharedMediaFile>>? _shareStreamSubscription;

  @override
  void initState() {
    super.initState();
    _bootstrapSharing();
  }

  Future<void> _bootstrapSharing() async {
    await HomeWidgetService.initialize();

    final initialMedia = await ReceiveSharingIntent.instance.getInitialMedia();
    if (initialMedia.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _handleSharedContent(initialMedia);
      });
    }

    _shareStreamSubscription = ReceiveSharingIntent.instance.getMediaStream().listen(
      _handleSharedContent,
      onError: (error) => debugPrint('Share stream error: $error'),
    );
  }

  Future<void> _handleSharedContent(List<SharedMediaFile> media) async {
    final context = _navigatorKey.currentContext;
    if (!mounted || context == null || media.isEmpty) {
      return;
    }

    final sharedContent = media
        .map((item) => item.path)
        .where((value) => value.isNotEmpty)
        .join('\n');
    if (sharedContent.isEmpty) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return FutureBuilder<dynamic>(
          future: _apiService.getFlows(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Unable to load flows: ${snapshot.error}'),
              );
            }

            final flows = (snapshot.data as List<dynamic>? ?? const []);
            if (flows.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No flows available to trigger.'),
              );
            }

            return SafeArea(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.all(16),
                children: [
                  const Text(
                    'Trigger a flow with shared content',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  ...flows.map((flow) {
                    return ListTile(
                      title: Text(flow.name as String? ?? 'Unknown flow'),
                      subtitle: Text(flow.description as String? ?? ''),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        Navigator.of(sheetContext).pop();
                        try {
                          await _apiService.runFlow(
                            flow.id as String,
                            input: {
                              'shared_content': sharedContent,
                              'shared_files': media
                                  .map((file) => {
                                        'path': file.path,
                                        'type': file.type.name,
                                        'mimeType': file.mimeType,
                                      })
                                  .toList(),
                            },
                          );
                          if (!mounted) {
                            return;
                          }
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Triggered ${flow.name}')),
                          );
                        } catch (error) {
                          if (!mounted) {
                            return;
                          }
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Failed to trigger flow: $error')),
                          );
                        }
                      },
                    );
                  }),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  void dispose() {
    _shareStreamSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      navigatorKey: _navigatorKey,
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
        GoRoute(
          path: '/devices',
          builder: (context, state) => const DevicesScreen(),
        ),
        GoRoute(
          path: '/flows',
          builder: (context, state) => const FlowListScreen(),
        ),
        GoRoute(
          path: '/flows/create',
          builder: (context, state) => const BuilderScreen(),
        ),
        GoRoute(
          path: '/flows/:id',
          builder: (context, state) {
            final id = state.pathParameters['id']!;
            return FlowDetailScreen(flowId: id);
          },
        ),
        GoRoute(
          path: '/events/:flowId',
          builder: (context, state) {
            final flowId = state.pathParameters['flowId']!;
            return EventFeedScreen(flowId: flowId);
          },
        ),
        GoRoute(
          path: '/analytics',
          builder: (context, state) => const AnalyticsScreen(),
        ),
        GoRoute(
          path: '/market',
          builder: (context, state) => const MarketScreen(),
        ),
        GoRoute(
          path: '/approvals',
          builder: (context, state) => const ApprovalsScreen(),
        ),
        GoRoute(
          path: '/alerts',
          builder: (context, state) => const AlertCentreScreen(),
        ),
      ],
    );

    return MaterialApp.router(
      title: 'PulseGrid Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
