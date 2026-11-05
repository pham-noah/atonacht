package __PACKAGE__

import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle

/**
 * Runs before the app starts, so it can watch every activity from the first one and apply the saved privacy options
 * without changing the generated MainActivity. It serves no data.
 */
class AtonachtInit : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext as? Application ?: return true
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, state: Bundle?) {
                if (activity is ShareReceiverActivity) return
                PrivacyBridge.current = activity
                PrivacyBridge.applySaved(activity)
            }
            override fun onActivityResumed(activity: Activity) {
                if (activity !is ShareReceiverActivity) PrivacyBridge.current = activity
            }
            override fun onActivityDestroyed(activity: Activity) {
                if (PrivacyBridge.current === activity) PrivacyBridge.current = null
            }
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        })
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
