#!/usr/bin/env python3
"""Rebuild the Android adaptive icon so the mark sits inside the mask.

`tauri icon` writes `ic_launcher_foreground.png` as the whole app icon stretched over the full 108dp canvas. Android
only guarantees the middle 72dp of that canvas, so launchers that apply their own shape (circle, squircle, teardrop)
cut the moon and its dot at the edges - the icon looks like it is overflowing. This script takes the plain icon, keys
its flat backdrop out to transparency, and re-centers the mark at 60% of the canvas, which keeps it inside every mask.
The backdrop colour becomes the adaptive background instead of a stretched picture.

    python3 scripts/fix_adaptive_icon.py            # rewrite src-tauri/icons/android
"""
import pathlib
import sys

import numpy as np
from PIL import Image

DENSITIES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
MARK_SHARE = 0.60  # of the canvas; the mask-safe zone is the middle 72/108 = 0.667
KEY = 46.0  # colour distance from the backdrop that counts as "not backdrop"


def keyed_mark(src: Image.Image) -> tuple[Image.Image, tuple[int, int, int]]:
    """The art with a transparent backdrop, plus the backdrop colour that was removed."""
    rgba = np.asarray(src.convert("RGBA")).astype(np.float32)
    rgb = rgba[:, :, :3]
    # the plain icon has transparent padding around a rounded square, so the corner is NOT the backdrop: the
    # backdrop is whatever colour covers most of the opaque pixels (the night navy behind the moon)
    opaque = rgba[rgba[:, :, 3] > 200][:, :3]
    backdrop = np.median(opaque.reshape(-1, 3), axis=0)
    dist = np.linalg.norm(rgb - backdrop, axis=2)
    # start well above the backdrop so the soft shadow around the art is not left behind as a grey ghost
    alpha = np.clip((dist - 30.0) / KEY, 0.0, 1.0)
    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    mark = Image.fromarray(out, "RGBA")
    box = mark.split()[-1].point(lambda v: 255 if v > 40 else 0).getbbox()
    return mark.crop(box), tuple(int(round(v)) for v in backdrop)


def main() -> int:
    root = pathlib.Path("src-tauri/icons/android")
    if not (root / "mipmap-xxxhdpi/ic_launcher.png").exists():
        print(f"no icons under {root}; run `npm run icon` first", file=sys.stderr)
        return 1
    backdrop = None
    for density, canvas in DENSITIES.items():
        plain = root / f"mipmap-{density}/ic_launcher.png"
        if not plain.exists():
            continue
        mark, backdrop = keyed_mark(Image.open(plain))
        target = int(canvas * MARK_SHARE)
        scale = target / max(mark.size)
        art = mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.LANCZOS)
        out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        out.paste(art, ((canvas - art.width) // 2, (canvas - art.height) // 2), art)
        out.save(root / f"mipmap-{density}/ic_launcher_foreground.png")
        print(f"{density:7s} foreground {canvas}x{canvas}, mark {art.width}x{art.height}")
    if backdrop:
        hexed = "#%02X%02X%02X" % backdrop
        values = root / "values/ic_launcher_background.xml"
        values.parent.mkdir(parents=True, exist_ok=True)
        values.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'  <color name="ic_launcher_background">{hexed}</color>\n'
            "</resources>\n",
            encoding="utf-8",
        )
        print(f"background colour {hexed}")
    print("Done. Run scripts/apply-android.sh to copy these into the project.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
