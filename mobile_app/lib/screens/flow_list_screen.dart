import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final flowsProvider = FutureProvider<List<dynamic>>((ref) async {
  // TODO: Fetch flows from API
  return [];
});

class FlowListScreen extends ConsumerWidget {
  const FlowListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flows = ref.watch(flowsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Flows'),
      ),
      body: flows.when(
        data: (flowList) => ListView.builder(
          itemCount: flowList.length,
          itemBuilder: (context, index) {
            return ListTile(
                title: Text('Flow $index'),
              onTap: () {
                 Navigator.of(context).pushNamed('/flows/$index');
              },
            );
          },
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: Navigate to create flow
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
