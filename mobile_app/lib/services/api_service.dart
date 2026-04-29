import 'package:dio/dio.dart';
import '../models/flow.dart';

class ApiService {
  late Dio _dio;
  static const String baseUrl = 'http://localhost:3001/api';

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ));
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

  Future<Map<String, dynamic>> runFlow(String flowId) async {
    try {
      final response = await _dio.post('/flows/$flowId/run');
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
