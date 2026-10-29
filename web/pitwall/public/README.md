# Portal static files

`_headers` and `_redirects` are Cloudflare Pages configuration: the content security policy, the
transport security header and the single-page-app fallback.

## Icons

`icon-512.png`, `icon-192.png`, `apple-touch-icon.png` and `favicon-32.png` are scaled copies of
`assets/icon.png` in this repository, the Undercut app icon drawn for this project under F-067, with
the red sweep of the mark hue-shifted to Pit Wall's gold (`#F0C64A`, a bright warm gold, F-131). No third-party artwork,
font or trademark is used in them, and they carry no watchlist term. Regenerate them from the same
source if the app icon ever changes, so the portal and the app stay one product:

```
python3 -c "
import colorsys
from PIL import Image
src = Image.open('assets/icon.png').convert('RGB'); px = src.load()
gh, gs, gv = colorsys.rgb_to_hsv(0xF0/255, 0xC6/255, 0x4A/255)
for y in range(src.height):
    for x in range(src.width):
        h, s, v = colorsys.rgb_to_hsv(*(c/255 for c in px[x, y]))
        if s > 0.25 and (h < 0.06 or h > 0.94):  # the red sweep, edges included
            px[x, y] = tuple(round(c*255) for c in colorsys.hsv_to_rgb(gh, min(s, gs), v * gv))
for size, name in [(512,'icon-512.png'),(192,'icon-192.png'),(180,'apple-touch-icon.png'),(32,'favicon-32.png')]:
    src.resize((size,size), Image.LANCZOS).save(f'web/pitwall/public/{name}', optimize=True)
"
```
