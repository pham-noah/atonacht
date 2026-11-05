#!/usr/bin/env python3
"""Stop the white flash at launch on Android.

Out of the box the generated project uses the stock Material theme: a white window background, and on Android 12+ a
splash screen drawn on that white. The WebView paints a few hundred milliseconds later, so launching Atonacht flashed
white and then showed a half-built screen. This paints the launch window and the splash in the app's own night colour,
with the app's own mark, so the first frame is already the app.

Idempotent; called from scripts/apply-android.sh so a regenerated gen/android keeps it.
"""
import pathlib
import sys

BG = "#0F1330"   # the darkest stop of the glass theme's gradient
MARK = "@mipmap/ic_launcher_foreground"

THEME = """<resources xmlns:tools="http://schemas.android.com/tools">
    <!-- Base application theme. -->
    <style name="Theme.atonacht" parent="Theme.Material3.DayNight.NoActionBar">
        <!-- The launch window and the splash use the app's night colour, so nothing flashes white before the
             WebView paints its first frame. -->
        <item name="android:windowBackground">@color/atonacht_boot</item>
        <item name="android:statusBarColor">@color/atonacht_boot</item>
        <item name="android:navigationBarColor">@color/atonacht_boot</item>
        <item name="android:windowSplashScreenBackground" tools:targetApi="31">@color/atonacht_boot</item>
        <item name="android:windowSplashScreenAnimatedIcon" tools:targetApi="31">__MARK__</item>
        <item name="android:windowSplashScreenIconBackgroundColor" tools:targetApi="31">@color/atonacht_boot</item>
    </style>
</resources>
"""

COLORS = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="atonacht_boot">__BG__</color>
    <color name="purple_200">#FFBB86FC</color>
    <color name="purple_500">#FF6200EE</color>
    <color name="purple_700">#FF3700B3</color>
    <color name="teal_200">#FF03DAC5</color>
    <color name="teal_700">#FF018786</color>
    <color name="black">#FF000000</color>
    <color name="white">#FFFFFFFF</color>
</resources>
"""


def main() -> int:
    root = pathlib.Path("src-tauri/gen/android/app/src/main/res")
    if not root.exists():
        print(f"no {root}; run `npx tauri android init` first", file=sys.stderr)
        return 1
    theme = THEME.replace("__MARK__", MARK)
    written = []
    for folder in ("values", "values-night"):
        path = root / folder / "themes.xml"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or "atonacht_boot" not in path.read_text(encoding="utf-8"):
            path.write_text(theme, encoding="utf-8")
            written.append(str(path))
    colors = root / "values" / "colors.xml"
    current = colors.read_text(encoding="utf-8") if colors.exists() else ""
    if "atonacht_boot" not in current:
        colors.write_text(COLORS.replace("__BG__", BG), encoding="utf-8")
        written.append(str(colors))
    print("Boot background: " + (", ".join(pathlib.Path(w).name for w in written) if written else "already set"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
