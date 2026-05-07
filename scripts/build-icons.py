#!/usr/bin/env python3
"""Regenerate all icon assets from src-tauri/icons/icon.svg.

Outputs:
  - src-tauri/icons/icon.png  (1024×1024 master)
  - src-tauri/icons/32x32.png
  - src-tauri/icons/128x128.png
  - src-tauri/icons/128x128@2x.png  (256×256)
  - src-tauri/icons/Square{30,44,71,89,107,142,150,284,310}x*Logo.png  (Windows Store)
  - src-tauri/icons/StoreLogo.png  (50×50)
  - src-tauri/icons/icon.ico  (multi-size ICO for Windows)
  - src-tauri/icons/icon.icns  (macOS bundle icon, via iconutil)
  - public/nootle-icon.png  (1024×1024 in-app sidebar logo)
  - public/nootle-icon.svg  (synced to source)
  - site/public/nootle-icon.png  (1024×1024 marketing)
  - site/public/nootle-icon.svg  (synced to source)

Requires: cairosvg, Pillow, iconutil (macOS).
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cairosvg
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC_SVG = REPO / "src-tauri/icons/icon.svg"
ICON_DIR = REPO / "src-tauri/icons"
PUBLIC_DIR = REPO / "public"
SITE_PUBLIC_DIR = REPO / "site/public"


def render(svg_path: Path, out_path: Path, size: int) -> None:
    cairosvg.svg2png(url=str(svg_path), write_to=str(out_path), output_width=size, output_height=size)


def main() -> None:
    if not SRC_SVG.exists():
        sys.exit(f"missing source: {SRC_SVG}")

    print(f"source: {SRC_SVG}")

    render(SRC_SVG, ICON_DIR / "icon.png", 1024)
    render(SRC_SVG, ICON_DIR / "32x32.png", 32)
    render(SRC_SVG, ICON_DIR / "128x128.png", 128)
    render(SRC_SVG, ICON_DIR / "128x128@2x.png", 256)

    windows_sizes = {
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }
    for name, size in windows_sizes.items():
        render(SRC_SVG, ICON_DIR / name, size)

    ico_path = ICON_DIR / "icon.ico"
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = []
    with tempfile.TemporaryDirectory() as td:
        for size in ico_sizes:
            tmp = Path(td) / f"{size}.png"
            render(SRC_SVG, tmp, size)
            ico_images.append(Image.open(tmp).convert("RGBA"))
        ico_images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in ico_sizes])

    icns_path = ICON_DIR / "icon.icns"
    iconset_sizes = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]
    with tempfile.TemporaryDirectory() as td:
        iconset = Path(td) / "icon.iconset"
        iconset.mkdir()
        for name, size in iconset_sizes:
            render(SRC_SVG, iconset / name, size)
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns_path)], check=True)

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    SITE_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    render(SRC_SVG, PUBLIC_DIR / "nootle-icon.png", 1024)
    render(SRC_SVG, SITE_PUBLIC_DIR / "nootle-icon.png", 1024)
    shutil.copyfile(SRC_SVG, PUBLIC_DIR / "nootle-icon.svg")
    shutil.copyfile(SRC_SVG, SITE_PUBLIC_DIR / "nootle-icon.svg")

    print("done")


if __name__ == "__main__":
    main()
