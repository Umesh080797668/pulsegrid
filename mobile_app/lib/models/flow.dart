import 'package:freezed_annotation/freezed_annotation.dart';

part 'flow.freezed.dart';
part 'flow.g.dart';

@freezed
class Flow with _$Flow {
  const factory Flow({
    required String id,
    required String name,
    required String description,
    required String status, // active, inactive, draft
    required List<FlowStep> steps,
    required String triggerType, // webhook, schedule, manual
    required int retryCount,
    @Default(false) bool isArchived,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Flow;

  factory Flow.fromJson(Map<String, dynamic> json) => _$FlowFromJson(json);
}

@freezed
class FlowStep with _$FlowStep {
  const factory FlowStep({
    required String id,
    required int order,
    required String connectorId,
    required String actionName,
    required Map<String, dynamic> config,
    required bool skipOnError,
  }) = _FlowStep;

  factory FlowStep.fromJson(Map<String, dynamic> json) =>
      _$FlowStepFromJson(json);
}

@freezed
class FlowRun with _$FlowRun {
  const factory FlowRun({
    required String id,
    required String flowId,
    required String status, // pending, running, success, failed
    required DateTime startedAt,
    required DateTime? completedAt,
    required int stepsExecuted,
    required int totalSteps,
    required String? errorMessage,
    required Map<String, dynamic> inputData,
  }) = _FlowRun;

  factory FlowRun.fromJson(Map<String, dynamic> json) =>
      _$FlowRunFromJson(json);
}

@freezed
class CreateFlowRequest with _$CreateFlowRequest {
  const factory CreateFlowRequest({
    required String name,
    required String description,
    required String triggerType,
    required List<FlowStep> steps,
  }) = _CreateFlowRequest;

  factory CreateFlowRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateFlowRequestFromJson(json);
}
