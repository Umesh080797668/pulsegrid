// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'flow.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$FlowImpl _$$FlowImplFromJson(Map<String, dynamic> json) => _$FlowImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      status: json['status'] as String,
      steps: (json['steps'] as List<dynamic>)
          .map((e) => FlowStep.fromJson(e as Map<String, dynamic>))
          .toList(),
      triggerType: json['triggerType'] as String,
      retryCount: (json['retryCount'] as num).toInt(),
      isArchived: json['isArchived'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$$FlowImplToJson(_$FlowImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'description': instance.description,
      'status': instance.status,
      'steps': instance.steps,
      'triggerType': instance.triggerType,
      'retryCount': instance.retryCount,
      'isArchived': instance.isArchived,
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt.toIso8601String(),
    };

_$FlowStepImpl _$$FlowStepImplFromJson(Map<String, dynamic> json) =>
    _$FlowStepImpl(
      id: json['id'] as String,
      order: (json['order'] as num).toInt(),
      connectorId: json['connectorId'] as String,
      actionName: json['actionName'] as String,
      config: json['config'] as Map<String, dynamic>,
      skipOnError: json['skipOnError'] as bool,
    );

Map<String, dynamic> _$$FlowStepImplToJson(_$FlowStepImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'order': instance.order,
      'connectorId': instance.connectorId,
      'actionName': instance.actionName,
      'config': instance.config,
      'skipOnError': instance.skipOnError,
    };

_$FlowRunImpl _$$FlowRunImplFromJson(Map<String, dynamic> json) =>
    _$FlowRunImpl(
      id: json['id'] as String,
      flowId: json['flowId'] as String,
      status: json['status'] as String,
      startedAt: DateTime.parse(json['startedAt'] as String),
      completedAt: json['completedAt'] == null
          ? null
          : DateTime.parse(json['completedAt'] as String),
      stepsExecuted: (json['stepsExecuted'] as num).toInt(),
      totalSteps: (json['totalSteps'] as num).toInt(),
      errorMessage: json['errorMessage'] as String?,
      inputData: json['inputData'] as Map<String, dynamic>,
    );

Map<String, dynamic> _$$FlowRunImplToJson(_$FlowRunImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'flowId': instance.flowId,
      'status': instance.status,
      'startedAt': instance.startedAt.toIso8601String(),
      'completedAt': instance.completedAt?.toIso8601String(),
      'stepsExecuted': instance.stepsExecuted,
      'totalSteps': instance.totalSteps,
      'errorMessage': instance.errorMessage,
      'inputData': instance.inputData,
    };

_$CreateFlowRequestImpl _$$CreateFlowRequestImplFromJson(
        Map<String, dynamic> json) =>
    _$CreateFlowRequestImpl(
      name: json['name'] as String,
      description: json['description'] as String,
      triggerType: json['triggerType'] as String,
      steps: (json['steps'] as List<dynamic>)
          .map((e) => FlowStep.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$CreateFlowRequestImplToJson(
        _$CreateFlowRequestImpl instance) =>
    <String, dynamic>{
      'name': instance.name,
      'description': instance.description,
      'triggerType': instance.triggerType,
      'steps': instance.steps,
    };
