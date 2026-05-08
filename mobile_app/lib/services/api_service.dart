import 'package:dio/dio.dart';
import '../models/flow.dart';
import '../config/app_config.dart';

class ApiService {
  late Dio _dio;
  bool _initialized = false;

  ApiService() {
    _initializeDio();
  }

  void _initializeDio() {
    if (_initialized) return;
    
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiEndpoint,
      connectTimeout: AppConfig.connectionTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
    ));
    
    _initialized = true;
  }

  Dio get _dioInstance {
    if (!_initialized) {
      _initializeDio();
    }
    return _dio;
  }

  Future<List<Flow>> getFlows() async {
    try {
      final response = await _dio.get('/flows');
      final List<dynamic> flowsData = response.data['data'] ?? [];
      return flowsData.map((flow) => Flow.fromJson(flow)).toList();
    } catch (e) {
      rethrow;
    }
  }

  Future<Flow> getFlow(String id) async {
    try {
      final response = await _dio.get('/flows/$id');
      return Flow.fromJson(response.data['data']);
    } catch (e) {
      rethrow;
    }
  }

  Future<Flow> createFlow(CreateFlowRequest request) async {
    try {
      final response = await _dio.post('/flows', data: request.toJson());
      return Flow.fromJson(response.data['data']);
    } catch (e) {
      rethrow;
    }
  }

  Future<void> deleteFlow(String id) async {
    try {
      await _dio.delete('/flows/$id');
    } catch (e) {
      rethrow;
    }
  }

  Future<List<FlowRun>> getFlowRuns(String flowId) async {
    try {
      final response = await _dio.get('/flows/$flowId/runs');
      final List<dynamic> runsData = response.data['data'] ?? [];
      return runsData.map((run) => FlowRun.fromJson(run)).toList();
    } catch (e) {
      rethrow;
    }
  }

  Future<FlowRun> getFlowRunDetails(String flowId, String runId) async {
    try {
      final response = await _dio.get('/flows/$flowId/runs/$runId');
      return FlowRun.fromJson(response.data['data']);
    } catch (e) {
      rethrow;
    }
  }

  Future<Map<String, dynamic>> runFlow(
    String flowId, {
    Map<String, dynamic>? input,
  }) async {
    try {
      final response = await _dio.post(
        '/flows/$flowId/run',
        data: {
          'input': input ?? <String, dynamic>{},
        },
      );
      final data = response.data;
      if (data is Map<String, dynamic>) {
        return data;
      }
      return <String, dynamic>{'data': data};
    } catch (e) {
      rethrow;
    }
  }
}
