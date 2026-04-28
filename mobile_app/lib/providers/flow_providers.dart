import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/flow.dart';
import '../services/api_service.dart';

final apiServiceProvider = Provider((ref) => ApiService());

// State notifier for flows
class FlowsNotifier extends StateNotifier<AsyncValue<List<Flow>>> {
  final ApiService apiService;

  FlowsNotifier(this.apiService) : super(const AsyncValue.loading());

  Future<void> loadFlows() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => apiService.getFlows());
  }

  Future<void> refreshFlows() async {
    state = await AsyncValue.guard(() => apiService.getFlows());
  }

  Future<void> deleteFlow(String id) async {
    await apiService.deleteFlow(id);
    await refreshFlows();
  }

  Future<Flow> createFlow(CreateFlowRequest request) async {
    final flow = await apiService.createFlow(request);
    await refreshFlows();
    return flow;
  }
}

final flowsProvider =
    StateNotifierProvider<FlowsNotifier, AsyncValue<List<Flow>>>((ref) {
  final apiService = ref.watch(apiServiceProvider);
  final notifier = FlowsNotifier(apiService);
  notifier.loadFlows();
  return notifier;
});

// Provider for single flow
final flowProvider =
    FutureProvider.family<Flow, String>((ref, id) async {
  final apiService = ref.watch(apiServiceProvider);
  return apiService.getFlow(id);
});

// Provider for flow runs
final flowRunsProvider =
    FutureProvider.family<List<FlowRun>, String>((ref, flowId) async {
  final apiService = ref.watch(apiServiceProvider);
  return apiService.getFlowRuns(flowId);
});

// State for create flow form
class CreateFlowFormState {
  final String name;
  final String description;
  final String triggerType;
  final List<FlowStep> steps;

  CreateFlowFormState({
    this.name = '',
    this.description = '',
    this.triggerType = 'webhook',
    this.steps = const [],
  });

  CreateFlowFormState copyWith({
    String? name,
    String? description,
    String? triggerType,
    List<FlowStep>? steps,
  }) {
    return CreateFlowFormState(
      name: name ?? this.name,
      description: description ?? this.description,
      triggerType: triggerType ?? this.triggerType,
      steps: steps ?? this.steps,
    );
  }
}

class CreateFlowFormNotifier extends StateNotifier<CreateFlowFormState> {
  CreateFlowFormNotifier() : super(CreateFlowFormState());

  void updateName(String name) {
    state = state.copyWith(name: name);
  }

  void updateDescription(String description) {
    state = state.copyWith(description: description);
  }

  void updateTriggerType(String triggerType) {
    state = state.copyWith(triggerType: triggerType);
  }

  void addStep(FlowStep step) {
    state = state.copyWith(steps: [...state.steps, step]);
  }

  void removeStep(int index) {
    final newSteps = List<FlowStep>.from(state.steps);
    newSteps.removeAt(index);
    state = state.copyWith(steps: newSteps);
  }
}

final createFlowFormProvider =
    StateNotifierProvider<CreateFlowFormNotifier, CreateFlowFormState>((ref) {
  return CreateFlowFormNotifier();
});
