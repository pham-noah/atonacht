#!/usr/bin/env python3
"""Adds Atonacht's widgets, share receiver, privacy hook and permissions to the generated AndroidManifest.xml.
Safe to run again: each component and permission is added only if it is missing."""
import pathlib, re, sys

manifest = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parent.parent / "android"
text = manifest.read_text()
if "</application>" not in text:
    sys.exit("AndroidManifest.xml has no </application>; is this the generated Tauri manifest?")

# a component is either a self-closing tag, or an opening tag through its matching closing tag
pattern = re.compile(r"(?s)<(receiver|activity|service|provider)\b[^>]*?(?:/>|>.*?</\1>)")
added = []
for m in pattern.finditer((root / "manifest-additions.xml").read_text()):
    block = m.group(0)
    name = re.search(r'android:name="([^"]+)"', block).group(1)
    if f'android:name="{name}"' not in text:
        added.append("    " + block.strip().replace("\n", "\n    "))
if added:
    text = text.replace("</application>", "\n".join(added) + "\n    </application>", 1)

perms = [l.strip() for l in (root / "permissions-additions.xml").read_text().splitlines() if l.strip().startswith("<uses-permission")]
missing = [p for p in perms if p.split('"')[1] not in text]
if missing:
    i = text.index("<application")
    text = text[:i] + "\n    ".join(missing) + "\n    " + text[i:]

# Android's automatic backup would copy the app's own note cache into Google's cloud. The notes folder is the user's
# own (Syncthing backs it up); the cache should not be a second, invisible copy.
m = re.search(r"<application\b[^>]*?>", text)
if m and "android:allowBackup" not in m.group(0):
    tag = m.group(0)[:-1].rstrip() + '\n        android:allowBackup="false"\n        android:fullBackupContent="false">'
    text = text.replace(m.group(0), tag, 1)

# The keyboard must not resize or slide the page: with adjustNothing the window keeps its size, so the note and the
# lists stay exactly where they were and only a dialog (or the caret) is lifted above the keyboard by the web layer.
m = re.search(r"<activity\b[^>]*?android:name=\"\.MainActivity\"[^>]*?>", text)
if m and "android:windowSoftInputMode" not in m.group(0):
    tag = m.group(0)[:-1] + '\n            android:windowSoftInputMode="adjustNothing">'
    text = text.replace(m.group(0), tag, 1)
    soft_input = True
else:
    soft_input = False

manifest.write_text(text)
print(f"Patched {manifest}: {len(added)} components, {len(missing)} permissions added, soft input {'set' if soft_input else 'already there'}")
