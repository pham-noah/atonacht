package __PACKAGE__

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hands a downloaded APK to Android's own installer. Called from Rust (src-tauri/src/android_bridge.rs).
 *
 * The APK sits in the app's cache dir, which the generated manifest's FileProvider already exposes under
 * `${applicationId}.fileprovider` (see res/xml/file_paths.xml: `<cache-path path="." />`), so the installer receives a
 * content:// URI it is allowed to read — a file:// URI is refused since Android 7. The manifest also declares
 * REQUEST_INSTALL_PACKAGES (android/permissions-additions.xml), without which the install intent is blocked.
 *
 * Nothing is installed here: the user sees the normal "do you want to update" prompt, and Android only accepts an APK
 * signed with the same key as the installed app, so this cannot replace Atonacht with someone else's build.
 */
object UpdateInstaller {
    private const val TAG = "AtonachtUpdate"

    @JvmStatic
    fun install(context: Context, path: String): Boolean = try {
        val apk = locate(context, path)
        when {
            apk == null -> {
                Log.w(TAG, "no APK at $path")
                false
            }
            else -> {
                val uri: Uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", apk)
                val intent = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            }
        }
    } catch (e: Exception) {
        // An ActivityNotFoundException means the device has no package installer reachable; anything else is a bug
        // worth seeing in logcat rather than a silent "nothing happened".
        Log.w(TAG, "the installer did not open for $path", e)
        false
    }

    /**
     * The file the Rust side downloaded. Tauri's cache dir on Android is `<cacheDir>/<applicationId>`, so if the path
     * Rust named is not there the same file is looked for under both layouts — and that is logged, because it means
     * the two sides disagree about where the cache is.
     */
    private fun locate(context: Context, path: String): File? {
        val named = File(path)
        if (named.isFile && named.length() > 0L) return named
        val roots = listOf(File(context.cacheDir, context.packageName), context.cacheDir)
        for (root in roots) {
            val guess = File(File(root, "updates"), named.name)
            if (guess.isFile && guess.length() > 0L) {
                Log.w(TAG, "using $guess; the path from Rust ($path) did not exist")
                return guess
            }
        }
        return null
    }
}
