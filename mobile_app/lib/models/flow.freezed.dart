// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'flow.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Flow _$FlowFromJson(Map<String, dynamic> json) {
  return _Flow.fromJson(json);
}

/// @nodoc
mixin _$Flow {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  String get description => throw _privateConstructorUsedError;
  String get status =>
      throw _privateConstructorUsedError; // active, inactive, draft
  List<FlowStep> get steps => throw _privateConstructorUsedError;
  String get triggerType =>
      throw _privateConstructorUsedError; // webhook, schedule, manual
  int get retryCount => throw _privateConstructorUsedError;
  bool get isArchived => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime get updatedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $FlowCopyWith<Flow> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $FlowCopyWith<$Res> {
  factory $FlowCopyWith(Flow value, $Res Function(Flow) then) =
      _$FlowCopyWithImpl<$Res, Flow>;
  @useResult
  $Res call(
      {String id,
      String name,
      String description,
      String status,
      List<FlowStep> steps,
      String triggerType,
      int retryCount,
      bool isArchived,
      DateTime createdAt,
      DateTime updatedAt});
}

/// @nodoc
class _$FlowCopyWithImpl<$Res, $Val extends Flow>
    implements $FlowCopyWith<$Res> {
  _$FlowCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? description = null,
    Object? status = null,
    Object? steps = null,
    Object? triggerType = null,
    Object? retryCount = null,
    Object? isArchived = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      description: null == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      steps: null == steps
          ? _value.steps
          : steps // ignore: cast_nullable_to_non_nullable
              as List<FlowStep>,
      triggerType: null == triggerType
          ? _value.triggerType
          : triggerType // ignore: cast_nullable_to_non_nullable
              as String,
      retryCount: null == retryCount
          ? _value.retryCount
          : retryCount // ignore: cast_nullable_to_non_nullable
              as int,
      isArchived: null == isArchived
          ? _value.isArchived
          : isArchived // ignore: cast_nullable_to_non_nullable
              as bool,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      updatedAt: null == updatedAt
          ? _value.updatedAt
          : updatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$FlowImplCopyWith<$Res> implements $FlowCopyWith<$Res> {
  factory _$$FlowImplCopyWith(
          _$FlowImpl value, $Res Function(_$FlowImpl) then) =
      __$$FlowImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      String description,
      String status,
      List<FlowStep> steps,
      String triggerType,
      int retryCount,
      bool isArchived,
      DateTime createdAt,
      DateTime updatedAt});
}

/// @nodoc
class __$$FlowImplCopyWithImpl<$Res>
    extends _$FlowCopyWithImpl<$Res, _$FlowImpl>
    implements _$$FlowImplCopyWith<$Res> {
  __$$FlowImplCopyWithImpl(_$FlowImpl _value, $Res Function(_$FlowImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? description = null,
    Object? status = null,
    Object? steps = null,
    Object? triggerType = null,
    Object? retryCount = null,
    Object? isArchived = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(_$FlowImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      description: null == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      steps: null == steps
          ? _value._steps
          : steps // ignore: cast_nullable_to_non_nullable
              as List<FlowStep>,
      triggerType: null == triggerType
          ? _value.triggerType
          : triggerType // ignore: cast_nullable_to_non_nullable
              as String,
      retryCount: null == retryCount
          ? _value.retryCount
          : retryCount // ignore: cast_nullable_to_non_nullable
              as int,
      isArchived: null == isArchived
          ? _value.isArchived
          : isArchived // ignore: cast_nullable_to_non_nullable
              as bool,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      updatedAt: null == updatedAt
          ? _value.updatedAt
          : updatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$FlowImpl implements _Flow {
  const _$FlowImpl(
      {required this.id,
      required this.name,
      required this.description,
      required this.status,
      required final List<FlowStep> steps,
      required this.triggerType,
      required this.retryCount,
      this.isArchived = false,
      required this.createdAt,
      required this.updatedAt})
      : _steps = steps;

  factory _$FlowImpl.fromJson(Map<String, dynamic> json) =>
      _$$FlowImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String description;
  @override
  final String status;
// active, inactive, draft
  final List<FlowStep> _steps;
// active, inactive, draft
  @override
  List<FlowStep> get steps {
    if (_steps is EqualUnmodifiableListView) return _steps;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_steps);
  }

  @override
  final String triggerType;
// webhook, schedule, manual
  @override
  final int retryCount;
  @override
  @JsonKey()
  final bool isArchived;
  @override
  final DateTime createdAt;
  @override
  final DateTime updatedAt;

  @override
  String toString() {
    return 'Flow(id: $id, name: $name, description: $description, status: $status, steps: $steps, triggerType: $triggerType, retryCount: $retryCount, isArchived: $isArchived, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$FlowImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other._steps, _steps) &&
            (identical(other.triggerType, triggerType) ||
                other.triggerType == triggerType) &&
            (identical(other.retryCount, retryCount) ||
                other.retryCount == retryCount) &&
            (identical(other.isArchived, isArchived) ||
                other.isArchived == isArchived) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      description,
      status,
      const DeepCollectionEquality().hash(_steps),
      triggerType,
      retryCount,
      isArchived,
      createdAt,
      updatedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$FlowImplCopyWith<_$FlowImpl> get copyWith =>
      __$$FlowImplCopyWithImpl<_$FlowImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$FlowImplToJson(
      this,
    );
  }
}

abstract class _Flow implements Flow {
  const factory _Flow(
      {required final String id,
      required final String name,
      required final String description,
      required final String status,
      required final List<FlowStep> steps,
      required final String triggerType,
      required final int retryCount,
      final bool isArchived,
      required final DateTime createdAt,
      required final DateTime updatedAt}) = _$FlowImpl;

  factory _Flow.fromJson(Map<String, dynamic> json) = _$FlowImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  String get description;
  @override
  String get status;
  @override // active, inactive, draft
  List<FlowStep> get steps;
  @override
  String get triggerType;
  @override // webhook, schedule, manual
  int get retryCount;
  @override
  bool get isArchived;
  @override
  DateTime get createdAt;
  @override
  DateTime get updatedAt;
  @override
  @JsonKey(ignore: true)
  _$$FlowImplCopyWith<_$FlowImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

FlowStep _$FlowStepFromJson(Map<String, dynamic> json) {
  return _FlowStep.fromJson(json);
}

/// @nodoc
mixin _$FlowStep {
  String get id => throw _privateConstructorUsedError;
  int get order => throw _privateConstructorUsedError;
  String get connectorId => throw _privateConstructorUsedError;
  String get actionName => throw _privateConstructorUsedError;
  Map<String, dynamic> get config => throw _privateConstructorUsedError;
  bool get skipOnError => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $FlowStepCopyWith<FlowStep> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $FlowStepCopyWith<$Res> {
  factory $FlowStepCopyWith(FlowStep value, $Res Function(FlowStep) then) =
      _$FlowStepCopyWithImpl<$Res, FlowStep>;
  @useResult
  $Res call(
      {String id,
      int order,
      String connectorId,
      String actionName,
      Map<String, dynamic> config,
      bool skipOnError});
}

/// @nodoc
class _$FlowStepCopyWithImpl<$Res, $Val extends FlowStep>
    implements $FlowStepCopyWith<$Res> {
  _$FlowStepCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? order = null,
    Object? connectorId = null,
    Object? actionName = null,
    Object? config = null,
    Object? skipOnError = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      order: null == order
          ? _value.order
          : order // ignore: cast_nullable_to_non_nullable
              as int,
      connectorId: null == connectorId
          ? _value.connectorId
          : connectorId // ignore: cast_nullable_to_non_nullable
              as String,
      actionName: null == actionName
          ? _value.actionName
          : actionName // ignore: cast_nullable_to_non_nullable
              as String,
      config: null == config
          ? _value.config
          : config // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>,
      skipOnError: null == skipOnError
          ? _value.skipOnError
          : skipOnError // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$FlowStepImplCopyWith<$Res>
    implements $FlowStepCopyWith<$Res> {
  factory _$$FlowStepImplCopyWith(
          _$FlowStepImpl value, $Res Function(_$FlowStepImpl) then) =
      __$$FlowStepImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      int order,
      String connectorId,
      String actionName,
      Map<String, dynamic> config,
      bool skipOnError});
}

/// @nodoc
class __$$FlowStepImplCopyWithImpl<$Res>
    extends _$FlowStepCopyWithImpl<$Res, _$FlowStepImpl>
    implements _$$FlowStepImplCopyWith<$Res> {
  __$$FlowStepImplCopyWithImpl(
      _$FlowStepImpl _value, $Res Function(_$FlowStepImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? order = null,
    Object? connectorId = null,
    Object? actionName = null,
    Object? config = null,
    Object? skipOnError = null,
  }) {
    return _then(_$FlowStepImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      order: null == order
          ? _value.order
          : order // ignore: cast_nullable_to_non_nullable
              as int,
      connectorId: null == connectorId
          ? _value.connectorId
          : connectorId // ignore: cast_nullable_to_non_nullable
              as String,
      actionName: null == actionName
          ? _value.actionName
          : actionName // ignore: cast_nullable_to_non_nullable
              as String,
      config: null == config
          ? _value._config
          : config // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>,
      skipOnError: null == skipOnError
          ? _value.skipOnError
          : skipOnError // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$FlowStepImpl implements _FlowStep {
  const _$FlowStepImpl(
      {required this.id,
      required this.order,
      required this.connectorId,
      required this.actionName,
      required final Map<String, dynamic> config,
      required this.skipOnError})
      : _config = config;

  factory _$FlowStepImpl.fromJson(Map<String, dynamic> json) =>
      _$$FlowStepImplFromJson(json);

  @override
  final String id;
  @override
  final int order;
  @override
  final String connectorId;
  @override
  final String actionName;
  final Map<String, dynamic> _config;
  @override
  Map<String, dynamic> get config {
    if (_config is EqualUnmodifiableMapView) return _config;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_config);
  }

  @override
  final bool skipOnError;

  @override
  String toString() {
    return 'FlowStep(id: $id, order: $order, connectorId: $connectorId, actionName: $actionName, config: $config, skipOnError: $skipOnError)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$FlowStepImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.order, order) || other.order == order) &&
            (identical(other.connectorId, connectorId) ||
                other.connectorId == connectorId) &&
            (identical(other.actionName, actionName) ||
                other.actionName == actionName) &&
            const DeepCollectionEquality().equals(other._config, _config) &&
            (identical(other.skipOnError, skipOnError) ||
                other.skipOnError == skipOnError));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, order, connectorId,
      actionName, const DeepCollectionEquality().hash(_config), skipOnError);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$FlowStepImplCopyWith<_$FlowStepImpl> get copyWith =>
      __$$FlowStepImplCopyWithImpl<_$FlowStepImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$FlowStepImplToJson(
      this,
    );
  }
}

abstract class _FlowStep implements FlowStep {
  const factory _FlowStep(
      {required final String id,
      required final int order,
      required final String connectorId,
      required final String actionName,
      required final Map<String, dynamic> config,
      required final bool skipOnError}) = _$FlowStepImpl;

  factory _FlowStep.fromJson(Map<String, dynamic> json) =
      _$FlowStepImpl.fromJson;

  @override
  String get id;
  @override
  int get order;
  @override
  String get connectorId;
  @override
  String get actionName;
  @override
  Map<String, dynamic> get config;
  @override
  bool get skipOnError;
  @override
  @JsonKey(ignore: true)
  _$$FlowStepImplCopyWith<_$FlowStepImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

FlowRun _$FlowRunFromJson(Map<String, dynamic> json) {
  return _FlowRun.fromJson(json);
}

/// @nodoc
mixin _$FlowRun {
  String get id => throw _privateConstructorUsedError;
  String get flowId => throw _privateConstructorUsedError;
  String get status =>
      throw _privateConstructorUsedError; // pending, running, success, failed
  DateTime get startedAt => throw _privateConstructorUsedError;
  DateTime? get completedAt => throw _privateConstructorUsedError;
  int get stepsExecuted => throw _privateConstructorUsedError;
  int get totalSteps => throw _privateConstructorUsedError;
  String? get errorMessage => throw _privateConstructorUsedError;
  Map<String, dynamic> get inputData => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $FlowRunCopyWith<FlowRun> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $FlowRunCopyWith<$Res> {
  factory $FlowRunCopyWith(FlowRun value, $Res Function(FlowRun) then) =
      _$FlowRunCopyWithImpl<$Res, FlowRun>;
  @useResult
  $Res call(
      {String id,
      String flowId,
      String status,
      DateTime startedAt,
      DateTime? completedAt,
      int stepsExecuted,
      int totalSteps,
      String? errorMessage,
      Map<String, dynamic> inputData});
}

/// @nodoc
class _$FlowRunCopyWithImpl<$Res, $Val extends FlowRun>
    implements $FlowRunCopyWith<$Res> {
  _$FlowRunCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? flowId = null,
    Object? status = null,
    Object? startedAt = null,
    Object? completedAt = freezed,
    Object? stepsExecuted = null,
    Object? totalSteps = null,
    Object? errorMessage = freezed,
    Object? inputData = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      flowId: null == flowId
          ? _value.flowId
          : flowId // ignore: cast_nullable_to_non_nullable
              as String,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      startedAt: null == startedAt
          ? _value.startedAt
          : startedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      completedAt: freezed == completedAt
          ? _value.completedAt
          : completedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      stepsExecuted: null == stepsExecuted
          ? _value.stepsExecuted
          : stepsExecuted // ignore: cast_nullable_to_non_nullable
              as int,
      totalSteps: null == totalSteps
          ? _value.totalSteps
          : totalSteps // ignore: cast_nullable_to_non_nullable
              as int,
      errorMessage: freezed == errorMessage
          ? _value.errorMessage
          : errorMessage // ignore: cast_nullable_to_non_nullable
              as String?,
      inputData: null == inputData
          ? _value.inputData
          : inputData // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$FlowRunImplCopyWith<$Res> implements $FlowRunCopyWith<$Res> {
  factory _$$FlowRunImplCopyWith(
          _$FlowRunImpl value, $Res Function(_$FlowRunImpl) then) =
      __$$FlowRunImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String flowId,
      String status,
      DateTime startedAt,
      DateTime? completedAt,
      int stepsExecuted,
      int totalSteps,
      String? errorMessage,
      Map<String, dynamic> inputData});
}

/// @nodoc
class __$$FlowRunImplCopyWithImpl<$Res>
    extends _$FlowRunCopyWithImpl<$Res, _$FlowRunImpl>
    implements _$$FlowRunImplCopyWith<$Res> {
  __$$FlowRunImplCopyWithImpl(
      _$FlowRunImpl _value, $Res Function(_$FlowRunImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? flowId = null,
    Object? status = null,
    Object? startedAt = null,
    Object? completedAt = freezed,
    Object? stepsExecuted = null,
    Object? totalSteps = null,
    Object? errorMessage = freezed,
    Object? inputData = null,
  }) {
    return _then(_$FlowRunImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      flowId: null == flowId
          ? _value.flowId
          : flowId // ignore: cast_nullable_to_non_nullable
              as String,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      startedAt: null == startedAt
          ? _value.startedAt
          : startedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      completedAt: freezed == completedAt
          ? _value.completedAt
          : completedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      stepsExecuted: null == stepsExecuted
          ? _value.stepsExecuted
          : stepsExecuted // ignore: cast_nullable_to_non_nullable
              as int,
      totalSteps: null == totalSteps
          ? _value.totalSteps
          : totalSteps // ignore: cast_nullable_to_non_nullable
              as int,
      errorMessage: freezed == errorMessage
          ? _value.errorMessage
          : errorMessage // ignore: cast_nullable_to_non_nullable
              as String?,
      inputData: null == inputData
          ? _value._inputData
          : inputData // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$FlowRunImpl implements _FlowRun {
  const _$FlowRunImpl(
      {required this.id,
      required this.flowId,
      required this.status,
      required this.startedAt,
      required this.completedAt,
      required this.stepsExecuted,
      required this.totalSteps,
      required this.errorMessage,
      required final Map<String, dynamic> inputData})
      : _inputData = inputData;

  factory _$FlowRunImpl.fromJson(Map<String, dynamic> json) =>
      _$$FlowRunImplFromJson(json);

  @override
  final String id;
  @override
  final String flowId;
  @override
  final String status;
// pending, running, success, failed
  @override
  final DateTime startedAt;
  @override
  final DateTime? completedAt;
  @override
  final int stepsExecuted;
  @override
  final int totalSteps;
  @override
  final String? errorMessage;
  final Map<String, dynamic> _inputData;
  @override
  Map<String, dynamic> get inputData {
    if (_inputData is EqualUnmodifiableMapView) return _inputData;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_inputData);
  }

  @override
  String toString() {
    return 'FlowRun(id: $id, flowId: $flowId, status: $status, startedAt: $startedAt, completedAt: $completedAt, stepsExecuted: $stepsExecuted, totalSteps: $totalSteps, errorMessage: $errorMessage, inputData: $inputData)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$FlowRunImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.flowId, flowId) || other.flowId == flowId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            (identical(other.stepsExecuted, stepsExecuted) ||
                other.stepsExecuted == stepsExecuted) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage) &&
            const DeepCollectionEquality()
                .equals(other._inputData, _inputData));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      flowId,
      status,
      startedAt,
      completedAt,
      stepsExecuted,
      totalSteps,
      errorMessage,
      const DeepCollectionEquality().hash(_inputData));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$FlowRunImplCopyWith<_$FlowRunImpl> get copyWith =>
      __$$FlowRunImplCopyWithImpl<_$FlowRunImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$FlowRunImplToJson(
      this,
    );
  }
}

abstract class _FlowRun implements FlowRun {
  const factory _FlowRun(
      {required final String id,
      required final String flowId,
      required final String status,
      required final DateTime startedAt,
      required final DateTime? completedAt,
      required final int stepsExecuted,
      required final int totalSteps,
      required final String? errorMessage,
      required final Map<String, dynamic> inputData}) = _$FlowRunImpl;

  factory _FlowRun.fromJson(Map<String, dynamic> json) = _$FlowRunImpl.fromJson;

  @override
  String get id;
  @override
  String get flowId;
  @override
  String get status;
  @override // pending, running, success, failed
  DateTime get startedAt;
  @override
  DateTime? get completedAt;
  @override
  int get stepsExecuted;
  @override
  int get totalSteps;
  @override
  String? get errorMessage;
  @override
  Map<String, dynamic> get inputData;
  @override
  @JsonKey(ignore: true)
  _$$FlowRunImplCopyWith<_$FlowRunImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

CreateFlowRequest _$CreateFlowRequestFromJson(Map<String, dynamic> json) {
  return _CreateFlowRequest.fromJson(json);
}

/// @nodoc
mixin _$CreateFlowRequest {
  String get name => throw _privateConstructorUsedError;
  String get description => throw _privateConstructorUsedError;
  String get triggerType => throw _privateConstructorUsedError;
  List<FlowStep> get steps => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $CreateFlowRequestCopyWith<CreateFlowRequest> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CreateFlowRequestCopyWith<$Res> {
  factory $CreateFlowRequestCopyWith(
          CreateFlowRequest value, $Res Function(CreateFlowRequest) then) =
      _$CreateFlowRequestCopyWithImpl<$Res, CreateFlowRequest>;
  @useResult
  $Res call(
      {String name,
      String description,
      String triggerType,
      List<FlowStep> steps});
}

/// @nodoc
class _$CreateFlowRequestCopyWithImpl<$Res, $Val extends CreateFlowRequest>
    implements $CreateFlowRequestCopyWith<$Res> {
  _$CreateFlowRequestCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? name = null,
    Object? description = null,
    Object? triggerType = null,
    Object? steps = null,
  }) {
    return _then(_value.copyWith(
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      description: null == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String,
      triggerType: null == triggerType
          ? _value.triggerType
          : triggerType // ignore: cast_nullable_to_non_nullable
              as String,
      steps: null == steps
          ? _value.steps
          : steps // ignore: cast_nullable_to_non_nullable
              as List<FlowStep>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$CreateFlowRequestImplCopyWith<$Res>
    implements $CreateFlowRequestCopyWith<$Res> {
  factory _$$CreateFlowRequestImplCopyWith(_$CreateFlowRequestImpl value,
          $Res Function(_$CreateFlowRequestImpl) then) =
      __$$CreateFlowRequestImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String name,
      String description,
      String triggerType,
      List<FlowStep> steps});
}

/// @nodoc
class __$$CreateFlowRequestImplCopyWithImpl<$Res>
    extends _$CreateFlowRequestCopyWithImpl<$Res, _$CreateFlowRequestImpl>
    implements _$$CreateFlowRequestImplCopyWith<$Res> {
  __$$CreateFlowRequestImplCopyWithImpl(_$CreateFlowRequestImpl _value,
      $Res Function(_$CreateFlowRequestImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? name = null,
    Object? description = null,
    Object? triggerType = null,
    Object? steps = null,
  }) {
    return _then(_$CreateFlowRequestImpl(
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      description: null == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String,
      triggerType: null == triggerType
          ? _value.triggerType
          : triggerType // ignore: cast_nullable_to_non_nullable
              as String,
      steps: null == steps
          ? _value._steps
          : steps // ignore: cast_nullable_to_non_nullable
              as List<FlowStep>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$CreateFlowRequestImpl implements _CreateFlowRequest {
  const _$CreateFlowRequestImpl(
      {required this.name,
      required this.description,
      required this.triggerType,
      required final List<FlowStep> steps})
      : _steps = steps;

  factory _$CreateFlowRequestImpl.fromJson(Map<String, dynamic> json) =>
      _$$CreateFlowRequestImplFromJson(json);

  @override
  final String name;
  @override
  final String description;
  @override
  final String triggerType;
  final List<FlowStep> _steps;
  @override
  List<FlowStep> get steps {
    if (_steps is EqualUnmodifiableListView) return _steps;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_steps);
  }

  @override
  String toString() {
    return 'CreateFlowRequest(name: $name, description: $description, triggerType: $triggerType, steps: $steps)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CreateFlowRequestImpl &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.triggerType, triggerType) ||
                other.triggerType == triggerType) &&
            const DeepCollectionEquality().equals(other._steps, _steps));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, name, description, triggerType,
      const DeepCollectionEquality().hash(_steps));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$CreateFlowRequestImplCopyWith<_$CreateFlowRequestImpl> get copyWith =>
      __$$CreateFlowRequestImplCopyWithImpl<_$CreateFlowRequestImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CreateFlowRequestImplToJson(
      this,
    );
  }
}

abstract class _CreateFlowRequest implements CreateFlowRequest {
  const factory _CreateFlowRequest(
      {required final String name,
      required final String description,
      required final String triggerType,
      required final List<FlowStep> steps}) = _$CreateFlowRequestImpl;

  factory _CreateFlowRequest.fromJson(Map<String, dynamic> json) =
      _$CreateFlowRequestImpl.fromJson;

  @override
  String get name;
  @override
  String get description;
  @override
  String get triggerType;
  @override
  List<FlowStep> get steps;
  @override
  @JsonKey(ignore: true)
  _$$CreateFlowRequestImplCopyWith<_$CreateFlowRequestImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
