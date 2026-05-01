import 'package:home_widget/home_widget.dart';

class HomeWidgetService {
  static const String appGroupId = 'group.com.pulsegrid.mobileApp';
  static const String androidWidgetName = 'PulseGridWidgetProvider';
  static const String iosWidgetName = 'PulseGridWidget';

  static const String titleKey = 'pulsegrid_widget_title';
  static const String messageKey = 'pulsegrid_widget_message';
  static const String statusKey = 'pulsegrid_widget_status';
  static const String updatedAtKey = 'pulsegrid_widget_updated_at';

  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized) {
      return;
    }

    await HomeWidget.setAppGroupId(appGroupId);
    _initialized = true;
  }

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
}
