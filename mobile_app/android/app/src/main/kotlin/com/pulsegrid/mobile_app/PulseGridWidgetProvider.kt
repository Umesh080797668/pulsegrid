package com.pulsegrid.mobile_app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetProvider
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

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
                    "You saved 0 hours across 0 runs",
                )
                val status = widgetData.getString(
                    WIDGET_STATUS_KEY,
                    "Top flow: N/A",
                )
                val updatedAtIso = widgetData.getString(WIDGET_UPDATED_AT_KEY, null)
                
                // Metrics data
                val hoursSaved = widgetData.getString(WIDGET_HOURS_SAVED_KEY, "0")
                val totalRuns = widgetData.getString(WIDGET_TOTAL_RUNS_KEY, "0")
                val successRate = widgetData.getString(WIDGET_SUCCESS_RATE_KEY, "0")
                val topFlow = widgetData.getString(WIDGET_TOP_FLOW_KEY, "N/A")
                val topFlowRuns = widgetData.getString(WIDGET_TOP_FLOW_RUNS_KEY, "0")

                // Format the updated at timestamp
                val formattedUpdatedAt = formatUpdatedAt(updatedAtIso)

                // Set text views
                setTextViewText(R.id.widget_title, title)
                setTextViewText(R.id.widget_message, message)
                setTextViewText(R.id.widget_status, "Top flow: $topFlow • $topFlowRuns runs")
                setTextViewText(R.id.widget_updated_at, formattedUpdatedAt)
                
                // Set metrics
                setTextViewText(R.id.widget_hours_saved, "${hoursSaved}h")
                setTextViewText(R.id.widget_total_runs, totalRuns)
                setTextViewText(R.id.widget_success_rate, "$successRate%")
                
                setOnClickPendingIntent(
                    R.id.widget_container,
                    HomeWidgetLaunchIntent.getActivity(context, MainActivity::class.java),
                )
            }

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    private fun formatUpdatedAt(isoString: String?): String {
        return try {
            if (isoString.isNullOrBlank()) {
                return "Updated just now"
            }
            
            val instant = Instant.parse(isoString)
            val now = Instant.now()
            val diffMillis = now.toEpochMilli() - instant.toEpochMilli()
            
            return when {
                diffMillis < 60000 -> "Just updated"
                diffMillis < 3600000 -> "${diffMillis / 60000}m ago"
                diffMillis < 86400000 -> "${diffMillis / 3600000}h ago"
                else -> {
                    val formatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
                        .withZone(ZoneId.systemDefault())
                    "Updated ${formatter.format(instant)}"
                }
            }
        } catch (e: Exception) {
            "Updated just now"
        }
    }

    private companion object {
        const val WIDGET_TITLE_KEY = "pulsegrid_widget_title"
        const val WIDGET_MESSAGE_KEY = "pulsegrid_widget_message"
        const val WIDGET_STATUS_KEY = "pulsegrid_widget_status"
        const val WIDGET_UPDATED_AT_KEY = "pulsegrid_widget_updated_at"
        
        // New metrics keys
        const val WIDGET_HOURS_SAVED_KEY = "pulsegrid_widget_hours_saved"
        const val WIDGET_TOTAL_RUNS_KEY = "pulsegrid_widget_total_runs"
        const val WIDGET_SUCCESS_RATE_KEY = "pulsegrid_widget_success_rate"
        const val WIDGET_TOP_FLOW_KEY = "pulsegrid_widget_top_flow"
        const val WIDGET_TOP_FLOW_RUNS_KEY = "pulsegrid_widget_top_flow_runs"
    }
}
