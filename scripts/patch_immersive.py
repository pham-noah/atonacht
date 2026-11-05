#!/usr/bin/env python3
"""Keep the Android window free of the system bars.

`tauri android init` (and every regeneration of gen/android) writes a plain MainActivity that leaves the status bar
and the navigation bar on screen, and that ignores the back gesture. Atonacht is a reading and writing app, so the page
owns the whole screen (immersive sticky, the bars only come in on an edge swipe), and the
back gesture is handed to the app first: it closes a sheet, walks back a screen, returns to Home, and only finishes the
activity when there is nothing left to do. This patch is idempotent and is called from scripts/apply-android.sh.

    python3 scripts/patch_immersive.py [path/to/MainActivity.kt]
"""
import pathlib
import sys

MARKER = "// Atonacht: immersive screen"  # and the back gesture

KOTLIN = '''package app.atonacht.notes

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    hideSystemBars() // Atonacht: immersive screen
  }

  // Coming back from the keyboard, a notification shade pull or another app must not leave the bars on screen.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  /**
   * The system back gesture belongs to the app, not to the activity stack: the web layer closes an open sheet, walks
   * back to the screen you came from, or returns to Home. `window.__atonachtBack` answers "true" when it did
   * something; only then is the app left alone, otherwise this finishes it, which is what an Android user expects.
   */
  override fun onBackPressed() {
    val web = findWebView(window.decorView)
    if (web == null) {
      finish()
      return
    }
    web.evaluateJavascript("(window.__atonachtBack ? window.__atonachtBack() : false) === true ? 'true' : 'false'") { result ->
      if (result?.contains("true") != true) finish()
    }
  }

  private fun findWebView(view: View?): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }

  /**
   * The status bar and the navigation bar stay out of the way: the page gets the full height of the screen and the
   * bars can only be pulled in by swiping the edge, then they hide themselves again (immersive sticky).
   */
  private fun hideSystemBars() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
      window.insetsController?.apply {
        hide(WindowInsets.Type.systemBars())
        systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          or View.SYSTEM_UI_FLAG_FULLSCREEN
          or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        )
    }
  }
}
'''


def main() -> int:
    default = pathlib.Path("src-tauri/gen/android/app/src/main/java/app/atonacht/notes/MainActivity.kt")
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else default
    if not path.exists():
        print(f"no {path}; run `npx tauri android init` first", file=sys.stderr)
        return 1
    current = path.read_text(encoding="utf-8")
    if MARKER in current:
        print(f"Immersive screen: already in {path.name}")
        return 0
    path.write_text(KOTLIN, encoding="utf-8")
    print(f"Immersive screen: patched {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
