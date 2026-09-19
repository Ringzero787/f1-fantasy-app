#!/usr/bin/env python3
"""Undercut U-mark assets (F-067): store/launcher icons, splash, and the two
wordmark halves the launch reveal animates. Drawn with Pillow from the app's
own Unbounded Black (SIL OFL, @expo-google-fonts/unbounded). Re-run to regenerate:
    python3 scripts/design/make-u-mark.py [store_out_dir]
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONT = os.path.join(ROOT, 'node_modules/@expo-google-fonts/unbounded/900Black/Unbounded_900Black.ttf')
BG, WHITE, RED = (14, 14, 14), (242, 242, 242), (255, 46, 46)
# The cut: a diagonal across the U's lower right. Expressed relative to the U's
# ink box so the icon and the wordmark U carry the identical mark.
CUT = ((0.156, 1.309), (1.359, 0.291))  # (x, y) pairs in ink-box units; everything right/below is red


def glyph_mask(text, px, canvas):
    f = ImageFont.truetype(FONT, px)
    m = Image.new('L', canvas, 0)
    ImageDraw.Draw(m).text((canvas[0] // 4, canvas[1] // 4), text, font=f, fill=255)
    return m


def cut_mask(size, box):
    l, t, r, b = box; w, h = r - l, b - t
    (ax, ay), (bx, by) = CUT
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(l + ax * w, t + ay * h), (l + bx * w, t + by * h), (l + 1.4 * w, t + 1.4 * h)], fill=255)
    return m


def u_mark(n, u_frac, transparent=False):
    """n x n image with the U (ink width = u_frac * n) centred."""
    S = n * 2  # supersample
    probe = glyph_mask('U', 1000, (4000, 4000)); pl, pt, pr, pb = probe.getbbox()
    px = int(1000 * (u_frac * S) / (pr - pl))
    m = glyph_mask('U', px, (S * 2, S * 2)); l, t, r, b = m.getbbox()
    m = ImageChops.offset(m, S - (l + r) // 2, S - (t + b) // 2).crop((S // 2, S // 2, S // 2 + S, S // 2 + S))
    box = m.getbbox()
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0) if transparent else BG + (255,))
    im.paste(Image.new('RGBA', (S, S), WHITE + (255,)), (0, 0), m)
    im.paste(Image.new('RGBA', (S, S), RED + (255,)), (0, 0), ImageChops.multiply(m, cut_mask((S, S), box)))
    im = im.resize((n, n), Image.LANCZOS)
    return im if transparent else im.convert('RGB')


def wordmark(cap_px):
    """Returns (u_img, rest_img): RGBA, same height, butt-joined they read UNDERCUT."""
    f = ImageFont.truetype(FONT, cap_px)
    track = -int(cap_px * 0.03)
    W, H = cap_px * 9, cap_px * 2
    white = Image.new('L', (W, H), 0); red = Image.new('L', (W, H), 0)
    x, y, edges = cap_px // 2, cap_px // 3, []
    for i, ch in enumerate('UNDERCUT'):
        layer = red if i >= 5 else white
        ImageDraw.Draw(layer).text((x, y), ch, font=f, fill=255)
        if i == 0:
            u_box = white.getbbox()
        x += ImageDraw.Draw(layer).textlength(ch, font=f) + track
    full = ImageChops.lighter(white, red); l, t, r, b = full.getbbox()
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    im.paste(Image.new('RGBA', (W, H), WHITE + (255,)), (0, 0), white)
    im.paste(Image.new('RGBA', (W, H), RED + (255,)), (0, 0), red)
    um = Image.new('L', (W, H), 0); ImageDraw.Draw(um).text((cap_px // 2, cap_px // 3), 'U', font=f, fill=255)
    im.paste(Image.new('RGBA', (W, H), RED + (255,)), (0, 0), ImageChops.multiply(um, cut_mask((W, H), u_box)))
    # split in the gap between U and N
    n_only = Image.new('L', (W, H), 0)
    ImageDraw.Draw(n_only).text((cap_px // 2 + ImageDraw.Draw(n_only).textlength('U', font=f) + track, cap_px // 3), 'N', font=f, fill=255)
    split = (u_box[2] + n_only.getbbox()[0]) // 2
    return im.crop((l, t, split, b)), im.crop((split, t, r, b))


def main():
    a = os.path.join(ROOT, 'assets')
    os.makedirs(os.path.join(a, 'launch'), exist_ok=True)
    u_mark(1024, 0.58).save(os.path.join(a, 'icon.png'))
    u_mark(1024, 0.58).resize((196, 196), Image.LANCZOS).save(os.path.join(a, 'favicon.png'))
    u_mark(1024, 0.40, transparent=True).save(os.path.join(a, 'adaptive-icon.png'))  # inside the 66% safe zone
    # splash: the mark on the brand ground, square so iOS (contain) shows the U at 30% of the short side,
    # the size the launch reveal starts from (SPLASH_U_FRACTION in launchReveal.ts)
    u_mark(1024, 0.30).save(os.path.join(a, 'splash.png'))
    u, rest = wordmark(720)  # drawn at 2x, halved for a smooth cut edge
    u, rest = [i.resize((i.width // 2, i.height // 2), Image.LANCZOS) for i in (u, rest)]
    u.save(os.path.join(a, 'launch', 'wordmark-u.png')); rest.save(os.path.join(a, 'launch', 'wordmark-rest.png'))
    print('wordmark', u.size, rest.size)
    if len(sys.argv) > 1:
        out = sys.argv[1]; os.makedirs(out, exist_ok=True)
        big = u_mark(2048, 0.58)
        for s in (1024, 512, 114):
            big.resize((s, s), Image.LANCZOS).save(os.path.join(out, f'undercut_icon_{s}x{s}.png'))


if __name__ == '__main__':
    main()
