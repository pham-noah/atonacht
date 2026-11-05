#!/usr/bin/env bash
# Installs the home screen widget, share-sheet receiver and permissions into the generated Android project,
# and puts the app's own launcher icon in place of the one `tauri android init` ships.
# Run after `npm run tauri android init`, from the project root.
set -euo pipefail
APP="src-tauri/gen/android/app/src/main"
[ -d "$APP" ] || { echo "No Android project yet. Run: npm run tauri android init"; exit 1; }

MAIN=$(find "$APP/java" -name 'MainActivity.kt' | head -n1)
[ -n "$MAIN" ] || { echo "Could not find MainActivity.kt under $APP/java"; exit 1; }
PKG=$(grep -m1 '^package ' "$MAIN" | awk '{print $2}')
DIR=$(dirname "$MAIN")

for f in android/kotlin/*.kt; do
  sed "s/__PACKAGE__/$PKG/" "$f" > "$DIR/$(basename "$f")"
done
mkdir -p "$APP/res/layout" "$APP/res/xml" "$APP/res/drawable"
cp android/res/layout/*.xml "$APP/res/layout/"
cp android/res/xml/*.xml "$APP/res/xml/"
cp android/res/drawable/*.xml "$APP/res/drawable/"

# `tauri android init` writes Tauri's own launcher icon into the project. Replace the whole set (plain, round and
# adaptive, plus the background colour the adaptive icon names) with the one `npm run icon` cut from app-icon.png,
# otherwise the APK shows the Tauri logo on the home screen.
if [ -d src-tauri/icons/android ]; then
  for d in src-tauri/icons/android/*/; do
    name=$(basename "$d")
    mkdir -p "$APP/res/$name"
    cp "$d"* "$APP/res/$name/"
  done
  # the vector leftovers of the default icon would otherwise win as @drawable/ic_launcher_foreground
  rm -f "$APP/res/drawable/ic_launcher_background.xml" "$APP/res/drawable-v24/ic_launcher_foreground.xml"
  echo "Launcher icon: src-tauri/icons/android -> $APP/res"
else
  echo "No src-tauri/icons/android yet. Run: npm run icon" >&2
fi

python3 scripts/patch_manifest.py "$APP/AndroidManifest.xml"
python3 scripts/patch_immersive.py "$APP/java/app/atonacht/notes/MainActivity.kt"
python3 scripts/patch_splash.py
echo "Done. Package: $PKG"
