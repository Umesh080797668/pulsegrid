import 'package:home_widget/home_widget.dart';
import 'package:dio/dio.dart';

class HomeWidgetService {
  static const String appGroupId = 'group.com.pulsegrid.mobileApp';
  static const String androidWidgetName = 'PulseGridWidgetProvider';
  static const String iosWidgetName = 'PulseGridWidget';

  static const String titleKey = 'pulsegrid_widget_title';
  static const String messageKey = 'pulsegrid_widget_message';
  static const String statusKey = 'pulsegrid_widget_status';
  static const String updatedAtKey = 'pulsegrid_widget_updated_at';
  
  // Additional keys for usage metrics
  static const String hoursSavedKey = 'pulsegrid_widget_hours_saved';
  static const String totalRunsKey = 'pulsegrid_widget_total_runs';
  static const String successRateKey = 'pulsegrid_widget_success_rate';
  static const String topFlowKey = 'pulsegrid_widget_top_flow';
  static const String topFlowRunsKey = 'pulsegrid_widget_top_flow_runs';

  static bool _initialized = false;
  static final Dio _dio = Dio(
    BaseOptions(
      baseUrl: 'http://localhost:3001/api/v1',
      connectTimeout: const Duration(seconds: 5),
      receiveTimeout: const Duration(seconds: 5),
    ),
  );

  static Future<void> initialize() async {
    if (_initialized) {
      return;
    }

    await HomeWidget.setAppGroupId(appGroupId);
    _initialized = true;
  }

  /// Sync basic snapshot data (backward compatible)
  static Future<void> syncSnapshot({
    required String title,
    required String message,
    required String status,
    DateTime? updatedAt,
  }) async {
    await initialize();

    final now = (updatedAt ?? DateTime.now()).toUtc();
    await Future.wait([
      HomeWidget.saveWidgetData<String>(titleKey, title),
      HomeWidget.saveWidgetData<String>(messageKey, message),
      HomeWidget.saveWidgetData<String>(statusKey, status),
      HomeWidget.saveWidgetData<String>(updatedAtKey, now.toIso8601String()),
      HomeWidget.updateWidget(
        name: iosWidgetName,
        androidName: androidWidgetName,
        iOSName: iosWidgetName,
        qualifiedAndroidName: 'com.pulsegrid.mobile_app.$androidWidgetName',
      ),
    ]);
  }

  /// Fetch weekly digest snapshot from backend and sync to widget
  static Future<bool> syncWeeklyDigestWidget({
    String? workspaceId,
  }) async {
    try {
      await initialize();

      // Fetch weekly digest data from backend
      String endpoint = '/users/digest/widget-snapshot';
      if (workspaceId != null && workspaceId.isNotEmpty) {
        endpoint = '$endpoint?workspaceId=$workspaceId';
      }

      final response = await _dio.get(endpoint);
      
      if (response.statusCode != 200) {
        print('Failed to fetch widget snapshot: HTTP ${response.statusCode}');
        return false;
      }

      final data = response.data as Map<String, dynamic>?;
      if (data == null) {
        print('Empty widget snapshot response');
        return false;
      }

      final title = data['title'] as String? ?? 'PulseGrid';
      final message = data['message'] as String? ?? '';
      final status = data['status'] as String? ?? '';
      final updatedAt = data['updatedAt'] as String?;
      final hoursSaved = data['hoursSaved'] as String? ?? '0';
      final totalRuns = data['totalRuns'] as String? ?? '0';
      final successRate = data['successRate'] as String? ?? '0';
      final topFlow = data['topFlow'] as String? ?? 'N/A';
      final topFlowRuns = data['topFlowRuns'] as String? ?? '0';

      // Save all widget data at once
      await Future.wait([
        HomeWidget.saveWidgetData<String>(titleKey, title),
        HomeWidget.saveWidgetData<String>(messageKey, message),
        HomeWidget.saveWidgetData<String>(statusKey, status),
        HomeWidget.saveWidgetData<String>(updatedAtKey, updatedAt ?? DateTime.now().toUtc().toIso8601String()),
        HomeWidget.saveWidgetData<String>(hoursSavedKey, hoursSaved),
        HomeWidget.saveWidgetData<String>(totalRunsKey, totalRuns),
        HomeWidget.saveWidgetData<String>(successRateKey, successRate),
        HomeWidget.saveWidgetData<String>(topFlowKey, topFlow),
        HomeWidget.saveWidgetData<String>(topFlowRunsKey, topFlowRuns),
        HomeWidget.updateWidget(
          name: iosWidgetName,
          androidName: androidWidgetName,
          iOSName: iosWidgetName,
          qualifiedAndroidName: 'com.pulsegrid.mobile_app.$androidWidgetName',
        ),
      ]);

      print('Widget snapshot synced successfully: $title');
      return true;
    } catch (e) {
      print('Error syncing weekly digest widget: $e');
      return false;
    }
  }

  /// Clear all widget data
  static Future<void> clearWidgetData() async {
    await initialize();

    await Future.wait([
      HomeWidget.saveWidgetData<String>(titleKey, 'PulseGrid'),
      HomeWidget.saveWidgetData<String>(messageKey, ''),
      HomeWidget.saveWidgetData<String>(statusKey, ''),
      HomeWidget.saveWidgetData<String>(updatedAtKey, ''),
      HomeWidget.saveWidgetData<String>(hoursSavedKey, '0'),
      HomeWidget.saveWidgetData<String>(totalRunsKey, '0'),
      HomeWidget.saveWidgetData<String>(successRateKey, '0'),
      HomeWidget.saveWidgetData<String>(topFlowKey, ''),
      HomeWidget.saveWidgetData<String>(topFlowRunsKey, '0'),
      HomeWidget.updateWidget(
        name: iosWidgetName,
        androidName: androidWidgetName,
        iOSName: iosWidgetName,
        qualifiedAndroidName: 'com.pulsegrid.mobile_app.$androidWidgetName',
      ),
    ]);
  }
}
