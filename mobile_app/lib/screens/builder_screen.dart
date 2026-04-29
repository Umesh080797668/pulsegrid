import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';
import '../models/flow.dart';
import '../providers/flow_providers.dart';

class BuilderScreen extends ConsumerStatefulWidget {
  const BuilderScreen({super.key});

  @override
  ConsumerState<BuilderScreen> createState() => _BuilderScreenState();
}

class _BuilderScreenState extends ConsumerState<BuilderScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _uuid = const Uuid();

  String _triggerType = 'webhook';
  final List<FlowStep> _steps = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _steps.add(
      FlowStep(
        id: _uuid.v4(),
        order: 1,
        connectorId: 'WEBHOOK',
        actionName: 'Capture payload',
        config: const {},
        skipOnError: false,
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _saveFlow() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _saving = true;
    });

    try {
      final flowsNotifier = ref.read(flowsProvider.notifier);
      final created = await flowsNotifier.createFlow(
        CreateFlowRequest(
          name: _nameController.text.trim(),
          description: _descriptionController.text.trim(),
          triggerType: _triggerType,
          steps: List<FlowStep>.from(_steps),
        ),
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Flow "${created.name}" created successfully.')),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to create flow: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  void _addStep() {
    setState(() {
      _steps.add(
        FlowStep(
          id: _uuid.v4(),
          order: _steps.length + 1,
          connectorId: 'HTTP',
          actionName: 'Perform action ${_steps.length + 1}',
          config: const {'method': 'POST'},
          skipOnError: true,
        ),
      );
    });
  }

  void _removeStep(int index) {
    setState(() {
      _steps.removeAt(index);
      for (var i = 0; i < _steps.length; i++) {
        final step = _steps[i];
        _steps[i] = step.copyWith(order: i + 1);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mobile Flow Builder'),
        actions: [
          TextButton.icon(
            onPressed: _saving ? null : _saveFlow,
            icon: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save),
            label: const Text('Save'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextFormField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        labelText: 'Flow name',
                        prefixIcon: Icon(Icons.title),
                      ),
                      validator: (value) =>
                          (value == null || value.trim().isEmpty)
                              ? 'Flow name is required'
                              : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _descriptionController,
                      decoration: const InputDecoration(
                        labelText: 'Description',
                        prefixIcon: Icon(Icons.notes),
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _triggerType,
                      decoration: const InputDecoration(
                        labelText: 'Trigger type',
                        prefixIcon: Icon(Icons.flash_on),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'webhook', child: Text('Webhook')),
                        DropdownMenuItem(value: 'schedule', child: Text('Schedule')),
                        DropdownMenuItem(value: 'manual', child: Text('Manual')),
                      ],
                      onChanged: (value) {
                        if (value != null) {
                          setState(() {
                            _triggerType = value;
                          });
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Flow steps',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                OutlinedButton.icon(
                  onPressed: _addStep,
                  icon: const Icon(Icons.add),
                  label: const Text('Add step'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_steps.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Add at least one step to define the automation.'),
                ),
              )
            else
              ..._steps.asMap().entries.map(
                    (entry) => Card(
                      child: ListTile(
                        leading: CircleAvatar(child: Text('${entry.key + 1}')),
                        title: Text(entry.value.actionName),
                        subtitle: Text(
                          'Connector: ${entry.value.connectorId} • Trigger: $_triggerType',
                        ),
                        trailing: IconButton(
                          onPressed: _steps.length == 1
                              ? null
                              : () => _removeStep(entry.key),
                          icon: const Icon(Icons.delete_outline),
                        ),
                      ),
                    ),
                  ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _saving ? null : _saveFlow,
              icon: const Icon(Icons.playlist_add),
              label: const Text('Create flow'),
            ),
          ],
        ),
      ),
    );
  }
}
