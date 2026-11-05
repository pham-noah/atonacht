package __PACKAGE__

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/** Called from Rust (src-tauri/src/android_bridge.rs) whenever the app's task list changes. */
object WidgetBridge {
    const val PREFS = "atonacht_widget"
    const val KEY = "tasks"

    @JvmStatic
    fun update(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, TaskListWidget::class.java))
        if (ids.isEmpty()) return
        TaskListWidget.render(context, manager, ids)
        manager.notifyAppWidgetViewDataChanged(ids, R.id.task_list)
    }
}
