package __PACKAGE__

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONObject

/** Supplies the rows of the "Today" widget from the snapshot the app last saved. */
class TaskListService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

    private class Factory(private val context: Context) : RemoteViewsFactory {
        private var rows: List<Pair<String, String>> = emptyList()

        override fun onCreate() {}
        override fun onDestroy() {}

        override fun onDataSetChanged() {
            val raw = context.getSharedPreferences(WidgetBridge.PREFS, Context.MODE_PRIVATE).getString(WidgetBridge.KEY, null)
            rows = try {
                val list = JSONObject(raw ?: "{}").optJSONArray("tasks")
                (0 until (list?.length() ?: 0)).map {
                    val t = list!!.getJSONObject(it)
                    t.optString("t") to t.optString("d")
                }
            } catch (e: Exception) {
                emptyList()
            }
        }

        override fun getCount() = rows.size

        override fun getViewAt(position: Int): RemoteViews {
            val (title, due) = rows[position]
            val v = RemoteViews(context.packageName, R.layout.widget_task_row)
            v.setTextViewText(R.id.row_title, title)
            v.setTextViewText(R.id.row_due, due)
            v.setOnClickFillInIntent(R.id.row_root, Intent().setData(Uri.parse("atonacht://tasks")))
            return v
        }

        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        override fun getItemId(position: Int) = position.toLong()
        override fun hasStableIds() = true
    }
}
