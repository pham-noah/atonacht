package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject

/** "Today" home screen widget: the day's open tasks, a + button for quick capture, tap anywhere else to open the app. */
class TaskListWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
    }

    override fun onEnabled(context: Context) {
        // placed for the first time: draw whatever the app last saved instead of the bare initial layout
        val manager = AppWidgetManager.getInstance(context)
        render(context, manager, manager.getAppWidgetIds(ComponentName(context, TaskListWidget::class.java)))
    }

    companion object {
        private fun link(context: Context, url: String, code: Int): PendingIntent {
            val open = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return PendingIntent.getActivity(context, code, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val raw = context.getSharedPreferences(WidgetBridge.PREFS, Context.MODE_PRIVATE).getString(WidgetBridge.KEY, null)
            val data = try { JSONObject(raw ?: "{}") } catch (e: Exception) { JSONObject() }
            // With no snapshot the widget cannot know anything yet: say why instead of claiming the day is clear.
            val neverLoaded = raw == null
            val date = data.optString("date", "Today")
            val count = data.optInt("count", 0)

            for (id in ids) {
                val views = RemoteViews(context.packageName, R.layout.widget_tasks)
                views.setTextViewText(R.id.widget_date, date)
                views.setTextViewText(
                    R.id.widget_count,
                    when {
                        neverLoaded -> "Open Atonacht to load today’s tasks"
                        count == 0 -> "All clear"
                        else -> "$count open"
                    },
                )

                val service = Intent(context, TaskListService::class.java)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                service.data = Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME))
                views.setRemoteAdapter(R.id.task_list, service)
                views.setEmptyView(R.id.task_list, R.id.widget_empty)

                // Tapping a task opens the app on its task list.
                val template = Intent(Intent.ACTION_VIEW).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                views.setPendingIntentTemplate(
                    R.id.task_list,
                    PendingIntent.getActivity(context, 2, template, PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
                )
                views.setOnClickPendingIntent(R.id.widget_add, link(context, "atonacht://capture", 0))
                views.setOnClickPendingIntent(R.id.widget_header, link(context, "atonacht://home", 1))
                manager.updateAppWidget(id, views)
            }
        }
    }
}
