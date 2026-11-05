package __PACKAGE__

import android.app.Activity
import android.content.Context
import android.os.Build
import android.view.WindowManager

/**
 * Privacy options for the app window.
 *  - hide in recents: the recent-apps card shows a blank instead of your notes (Android 13+; older versions use the screenshot block)
 *  - block screenshots: also stops screenshots and screen recording
 */
object PrivacyBridge {
    private const val PREFS = "atonacht_privacy"

    @Volatile
    var current: Activity? = null

    /** Called from Rust when the person changes a setting. */
    @JvmStatic
    fun set(context: Context, blockScreenshots: Boolean, hideInRecents: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("block", blockScreenshots)
            .putBoolean("recents", hideInRecents)
            .apply()
        current?.let { apply(it, blockScreenshots, hideInRecents) }
    }

    fun applySaved(activity: Activity) {
        val p = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        apply(activity, p.getBoolean("block", false), p.getBoolean("recents", false))
    }

    private fun apply(activity: Activity, block: Boolean, recents: Boolean) {
        activity.runOnUiThread {
            val secure = block || (recents && Build.VERSION.SDK_INT < 33)
            if (secure) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            if (Build.VERSION.SDK_INT >= 33) activity.setRecentsScreenshotEnabled(!recents)
        }
    }
}
