"""
Resize v2 screenshots for Amazon Appstore.

Amazon accepted sizes (landscape):
  1920x1080, 1920x1200, 2560x1600

Phone screenshots (portrait 1080x2424) are placed side-by-side on a dark
background at 1920x1080.  Tablet screenshots (2560x1600) are already the
right size — just copy them.

Usage:  python scripts/amazon_screenshots.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path("pics/v2_screenshots")
OUT = Path("pics/amazon_appstore")
BG_COLOR = (13, 17, 23)  # #0D1117

# Phone screenshots to use (portrait)
PHONE_SCREENS = [
    "phone_01_login.png",
    "phone_02_myteam.png",
    "phone_03_newteam.png",
    "phone_04_adddriver.png",
    "phone_06_teamfull.png",
    "phone_08_standings.png",
    "phone_09_profile.png",
    "phone_10_market.png",
]

# Tablet screenshots (landscape, already 2560x1600)
TABLET_SCREENS = [
    "tablet_01_myteam.png",
    "tablet_02_newteam.png",
    "tablet_03_market.png",
    "tablet_04_adddriver.png",
    "tablet_05_teamfull.png",
    "tablet_07_standings.png",
    "tablet_09_profile.png",
]

AMAZON_SIZES = [
    (1920, 1080),
    (1920, 1200),
    (2560, 1600),
]


def fit_on_background(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Scale img to fit inside target dimensions, centered on BG_COLOR."""
    bg = Image.new("RGB", (target_w, target_h), BG_COLOR)
    ratio = min(target_w / img.width, target_h / img.height)
    new_w = int(img.width * ratio)
    new_h = int(img.height * ratio)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    x = (target_w - new_w) // 2
    y = (target_h - new_h) // 2
    bg.paste(resized, (x, y))
    return bg


def pair_phones_on_landscape(left: Image.Image, right: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Place two phone screenshots side-by-side on a landscape background."""
    bg = Image.new("RGB", (target_w, target_h), BG_COLOR)
    # Scale each phone to fit in half the width with some padding
    pad = int(target_w * 0.03)
    half_w = (target_w - pad * 3) // 2
    avail_h = target_h - pad * 2

    for i, img in enumerate([left, right]):
        ratio = min(half_w / img.width, avail_h / img.height)
        new_w = int(img.width * ratio)
        new_h = int(img.height * ratio)
        resized = img.resize((new_w, new_h), Image.LANCZOS)
        x = pad + i * (half_w + pad) + (half_w - new_w) // 2
        y = (target_h - new_h) // 2
        bg.paste(resized, (x, y))
    return bg


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0

    # --- Phone pairs at 1920x1080 ---
    for i in range(0, len(PHONE_SCREENS) - 1, 2):
        left_path = SRC / PHONE_SCREENS[i]
        right_path = SRC / PHONE_SCREENS[i + 1]
        if not left_path.exists() or not right_path.exists():
            print(f"  Skipping missing: {PHONE_SCREENS[i]} / {PHONE_SCREENS[i+1]}")
            continue
        left = Image.open(left_path)
        right = Image.open(right_path)
        pair_idx = i // 2 + 1
        for tw, th in AMAZON_SIZES:
            out_name = f"phone_pair{pair_idx}_{tw}x{th}.png"
            result = pair_phones_on_landscape(left, right, tw, th)
            result.save(OUT / out_name, "PNG")
            print(f"  Created {out_name}")
            count += 1

    # --- Tablet screenshots resized to each Amazon size ---
    for fname in TABLET_SCREENS:
        src_path = SRC / fname
        if not src_path.exists():
            print(f"  Skipping missing: {fname}")
            continue
        img = Image.open(src_path)
        stem = Path(fname).stem
        for tw, th in AMAZON_SIZES:
            out_name = f"{stem}_{tw}x{th}.png"
            if img.width == tw and img.height == th:
                img.save(OUT / out_name, "PNG")
            else:
                result = fit_on_background(img, tw, th)
                result.save(OUT / out_name, "PNG")
            print(f"  Created {out_name}")
            count += 1

    print(f"\nDone! {count} images saved to {OUT}/")


if __name__ == "__main__":
    main()
