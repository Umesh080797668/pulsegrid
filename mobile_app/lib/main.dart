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
import 'services/auth_service.dart';

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final ApiService _apiService = ApiService();
  final AuthService _authService = AuthService();
  StreamSubscription<List<SharedMediaFile>>? _shareStreamSubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrapSharing();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // When app comes to foreground, check session validity
    if (state == AppLifecycleState.resumed) {
      debugPrint('App resumed, checking biometric session...');
      _authService.onAppResumed();
      
      // Schedule a check for session expiry after short delay to allow UI to render
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _checkSessionValidity();
      });
    }
  }

  Future<void> _checkSessionValidity() async {
    final context = _navigatorKey.currentContext;
    if (!mounted || context == null) return;

    // Check if session has expired and prompt for re-auth
    if (_authService.biometricEnabled && !await _authService.checkAndPromptIfExpired()) {
      // If re-auth failed, redirect to home
      if (mounted) {
        context.go('/');
      }
    }
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
    WidgetsBinding.instance.removeObserver(this);
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

    return MaterialApp(
      title: 'PulseGrid Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: AuthGate(authService: _authService, router: router),
    );
  }
}

/// Widget that gates app access behind biometric authentication
class AuthGate extends StatefulWidget {
  final AuthService authService;
  final GoRouter router;

  const AuthGate({
    required this.authService,
    required this.router,
    super.key,
  });

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  void initState() {
    super.initState();
    _promptAuthIfNeeded();
  }

  Future<void> _promptAuthIfNeeded() async {
    // Only prompt if biometric auth is enabled
    if (!widget.authService.biometricEnabled || widget.authService.isAuthenticated) {
      return;
    }

    await Future.delayed(const Duration(milliseconds: 500));
    
    if (!mounted) return;
    
    // Prompt for authentication
    final authenticated = await widget.authService.authenticate();
    
    if (mounted && !authenticated && widget.authService.biometricEnabled) {
      // Show a dialog explaining auth is required
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Authentication Required'),
          content: const Text('Biometric authentication is required to access PulseGrid.'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                _promptAuthIfNeeded();
              },
              child: const Text('Try Again'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.authService,
      builder: (context, child) {
        // If biometric is enabled but not authenticated, show lock screen
        if (widget.authService.biometricEnabled && !widget.authService.isAuthenticated) {
          return Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.lock_outline,
                    size: 64,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'PulseGrid',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Biometric authentication required',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 32),
                  FilledButton(
                    onPressed: _promptAuthIfNeeded,
                    child: const Text('Unlock'),
                  ),
                ],
              ),
            ),
          );
        }

        // User is authenticated or biometric is not enabled, render router
        return Router(
          routerDelegate: widget.router.routerDelegate,
          backButtonDispatcher: widget.router.backButtonDispatcher,
        );
      },
    );
  }
}
