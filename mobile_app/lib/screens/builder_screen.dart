import 'package:bloc/bloc.dart';
import 'package:flutter/material.dart' hide Flow;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';
import '../models/flow.dart';
import '../providers/flow_providers.dart';
import '../services/api_service.dart';

class FlowBuilderState {
  final String triggerType;
  final List<FlowStep> steps;
  final bool isSaving;

  const FlowBuilderState({
    this.triggerType = 'webhook',
    this.steps = const [],
    this.isSaving = false,
  });

  FlowBuilderState copyWith({
    String? triggerType,
    List<FlowStep>? steps,
    bool? isSaving,
  }) {
    return FlowBuilderState(
      triggerType: triggerType ?? this.triggerType,
      steps: steps ?? this.steps,
      isSaving: isSaving ?? this.isSaving,
    );
  }
}

class FlowBuilderCubit extends Cubit<FlowBuilderState> {
  final ApiService _apiService;
  final Uuid _uuid;

  FlowBuilderCubit({required ApiService apiService, Uuid? uuid})
      : _apiService = apiService,
        _uuid = uuid ?? const Uuid(),
        super(
          FlowBuilderState(
            steps: [
              FlowStep(
                id: (uuid ?? const Uuid()).v4(),
                order: 1,
                connectorId: 'WEBHOOK',
                actionName: 'Capture payload',
                config: const {},
                skipOnError: false,
              ),
            ],
          ),
        );

  void updateTriggerType(String triggerType) {
    emit(state.copyWith(triggerType: triggerType));
  }

  void addStep() {
    emit(
      state.copyWith(
        steps: [
          ...state.steps,
          FlowStep(
            id: _uuid.v4(),
            order: state.steps.length + 1,
            connectorId: 'HTTP',
            actionName: 'Perform action ${state.steps.length + 1}',
            config: const {'method': 'POST'},
            skipOnError: true,
          ),
        ],
      ),
    );
  }

  void removeStep(int index) {
    final updatedSteps = List<FlowStep>.from(state.steps)..removeAt(index);
    final normalizedSteps = [
      for (var i = 0; i < updatedSteps.length; i++)
        updatedSteps[i].copyWith(order: i + 1),
    ];

    emit(state.copyWith(steps: normalizedSteps));
  }

  Future<Flow> saveFlow({
    required String name,
    required String description,
  }) async {
    emit(state.copyWith(isSaving: true));

    try {
      final created = await _apiService.createFlow(
        CreateFlowRequest(
          name: name,
          description: description,
          triggerType: state.triggerType,
          steps: List<FlowStep>.from(state.steps),
        ),
      );

      emit(state.copyWith(isSaving: false));
      return created;
    } catch (_) {
      emit(state.copyWith(isSaving: false));
      rethrow;
    }
  }
}

class BuilderScreen extends ConsumerStatefulWidget {
  const BuilderScreen({super.key});

  @override
  ConsumerState<BuilderScreen> createState() => _BuilderScreenState();
}

class _BuilderScreenState extends ConsumerState<BuilderScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  late final FlowBuilderCubit _cubit;

  @override
  void initState() {
    super.initState();
    _cubit = FlowBuilderCubit(
      apiService: ref.read(apiServiceProvider),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _cubit.close();
    super.dispose();
  }

  Future<void> _saveFlow() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    try {
      final created = await _cubit.saveFlow(
        name: _nameController.text.trim(),
        description: _descriptionController.text.trim(),
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
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: BlocBuilder<FlowBuilderCubit, FlowBuilderState>(
        builder: (context, state) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('Mobile Flow Builder'),
              actions: [
                TextButton.icon(
                  onPressed: state.isSaving ? null : _saveFlow,
                  icon: state.isSaving
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
                            initialValue: state.triggerType,
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
                                context.read<FlowBuilderCubit>().updateTriggerType(value);
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
                        onPressed: state.isSaving
                            ? null
                            : () => context.read<FlowBuilderCubit>().addStep(),
                        icon: const Icon(Icons.add),
                        label: const Text('Add step'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (state.steps.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('Add at least one step to define the automation.'),
                      ),
                    )
                  else
                    ...state.steps.asMap().entries.map(
                          (entry) => Card(
                            child: ListTile(
                              leading: CircleAvatar(child: Text('${entry.key + 1}')),
                              title: Text(entry.value.actionName),
                              subtitle: Text(
                                'Connector: ${entry.value.connectorId} • Trigger: ${state.triggerType}',
                              ),
                              trailing: IconButton(
                                onPressed: state.steps.length == 1 || state.isSaving
                                    ? null
                                    : () => context.read<FlowBuilderCubit>().removeStep(entry.key),
                                icon: const Icon(Icons.delete_outline),
                              ),
                            ),
                          ),
                        ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: state.isSaving ? null : _saveFlow,
                    icon: const Icon(Icons.playlist_add),
                    label: const Text('Create flow'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
