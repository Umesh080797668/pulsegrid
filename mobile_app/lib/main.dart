import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/flow_list_screen.dart';
import 'screens/flow_detail_screen.dart';
import 'screens/builder_screen.dart';
import 'screens/devices_screen.dart';
import 'screens/event_feed_screen.dart';
import 'screens/settings_screen.dart';

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = GoRouter(
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
