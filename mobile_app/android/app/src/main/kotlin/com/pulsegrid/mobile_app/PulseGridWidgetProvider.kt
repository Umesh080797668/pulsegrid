package com.pulsegrid.mobile_app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetProvider

class PulseGridWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.pulsegrid_widget_layout).apply {
                val title = widgetData.getString(WIDGET_TITLE_KEY, "PulseGrid")
                val message = widgetData.getString(
                    WIDGET_MESSAGE_KEY,
                    "Pair IoT devices, unlock with biometrics, and sync quick actions.",
                )
                val status = widgetData.getString(
                    WIDGET_STATUS_KEY,
                    "Open PulseGrid to refresh this snapshot.",
                )
                val updatedAt = widgetData.getString(WIDGET_UPDATED_AT_KEY, null)

                setTextViewText(R.id.widget_title, title)
                setTextViewText(R.id.widget_message, message)
                setTextViewText(
                    R.id.widget_status,
                    if (updatedAt.isNullOrBlank()) status else "$status • $updatedAt",
                )
                setOnClickPendingIntent(
                    R.id.widget_container,
                    HomeWidgetLaunchIntent.getActivity(context, MainActivity::class.java),
                )
            }

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    private companion object {
        const val WIDGET_TITLE_KEY = "pulsegrid_widget_title"
        const val WIDGET_MESSAGE_KEY = "pulsegrid_widget_message"
        const val WIDGET_STATUS_KEY = "pulsegrid_widget_status"
        const val WIDGET_UPDATED_AT_KEY = "pulsegrid_widget_updated_at"
    }
}
