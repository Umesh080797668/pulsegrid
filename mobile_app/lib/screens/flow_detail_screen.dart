import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/flow_providers.dart';

class FlowDetailScreen extends ConsumerWidget {
  final String flowId;

  const FlowDetailScreen({super.key, required this.flowId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flowAsync = ref.watch(flowProvider(flowId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Flow Details'),
      ),
      body: flowAsync.when(
        data: (flow) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  flow.name,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(flow.description),
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildDetailRow('Status', flow.status),
                        _buildDetailRow('Trigger Type', flow.triggerType),
                        _buildDetailRow('Retry Count', flow.retryCount.toString()),
                        _buildDetailRow('Steps', flow.steps.length.toString()),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Steps',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: flow.steps.length,
                  itemBuilder: (context, index) {
                    final step = flow.steps[index];
                    return ListTile(
                      title: Text('Step ${index + 1}: ${step.actionName}'),
                      subtitle: Text('Connector: ${step.connectorId}'),
                    );
                  },
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          try {
                            await ref.read(apiServiceProvider).runFlow(flowId);
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Flow execution requested.'),
                              ),
                            );
                            context.push('/events/$flowId');
                          } catch (e) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Run failed: $e')),
                            );
                          }
                        },
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('Run Flow'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton.icon(
                      onPressed: () => context.push('/events/$flowId'),
                      icon: const Icon(Icons.feed),
                      label: const Text('Live events'),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(value),
        ],
      ),
    );
  }
}
