#!/usr/bin/env bash
# Align and sign the release APK with the real Atonacht key (not the debug key).
#
#   bash scripts/sign-release.sh            # aarch64 build already produced by `npm run android:build`
#
# The keystore and its password live in Atonacht-keys/ (git-ignored). Keep them: an APK signed with a different key
# cannot update an installed one, so losing this file means every user has to uninstall and reinstall.
set -euo pipefail
cd "$(dirname "$0")/.."

KS="Atonacht-keys/atonacht-release.jks"
PW="Atonacht-keys/release-password.txt"
ALIAS="atonacht"
BT="${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}/build-tools/36.1.0"
UNSIGNED="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
VERSION=$(node -p "require('./package.json').version")
OUT="Atonacht-transfer/Atonacht-${VERSION}-release.apk"

[ -f "$KS" ] || { echo "no keystore at $KS" >&2; exit 1; }
[ -f "$UNSIGNED" ] || { echo "no unsigned APK; run npx tauri android build --apk first" >&2; exit 1; }

# The build regenerates tauri.properties with the version it compiled. If it does not match package.json, the unsigned
# APK is left over from an earlier build and signing it would publish the old app under the new number.
BUILT=$(sed -n 's/^tauri.android.versionName=//p' src-tauri/gen/android/app/tauri.properties 2>/dev/null | tr -d '')
if [ "$BUILT" != "$VERSION" ]; then
  echo "the unsigned APK is version '$BUILT', not '$VERSION' - run the Android build again" >&2
  exit 1
fi
mkdir -p Atonacht-transfer
TMP="Atonacht-transfer/.signing"   # inside the project: native tools cannot read MSYS /tmp paths
mkdir -p "$TMP"

"$BT/zipalign.exe" -f -p 4 "$UNSIGNED" "$TMP/aligned.apk"
"$BT/apksigner.bat" sign --ks "$KS" --ks-key-alias "$ALIAS" --ks-pass "file:$PW" --out "$OUT" "$TMP/aligned.apk"
"$BT/apksigner.bat" verify --print-certs "$OUT" | head -3
rm -rf "$TMP"

echo "signed: $OUT"
echo "size:   $(stat -c %s "$OUT") bytes"
echo "sha256: $(sha256sum "$OUT" | cut -d' ' -f1)"
