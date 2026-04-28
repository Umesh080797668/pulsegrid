import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/flow_providers.dart';

class FlowListScreen extends ConsumerWidget {
  const FlowListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flows = ref.watch(flowsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Flows'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(flowsProvider);
            },
          ),
        ],
      ),
      body: flows.when(
        data: (flowList) {
          if (flowList.isEmpty) {
            return const Center(
              child: Text('No flows yet. Create one to get started!'),
            );
          }
          return ListView.builder(
            itemCount: flowList.length,
            itemBuilder: (context, index) {
              final flow = flowList[index];
              return ListTile(
                title: Text(flow.name),
                subtitle: Text(flow.description),
                trailing: Chip(
                  label: Text(flow.status),
                  backgroundColor: flow.status == 'active' || flow.status == 'Active'
                      ? Colors.green
                      : Colors.grey,
                ),
                onTap: () {
                  context.push('/flows/${flow.id}');
                },
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error: $error'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  ref.invalidate(flowsProvider);
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          context.push('/flows/create');
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
