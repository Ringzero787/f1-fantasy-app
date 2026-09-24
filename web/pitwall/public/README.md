# Portal static files

`_headers` and `_redirects` are Cloudflare Pages configuration: the content security policy, the
transport security header and the single-page-app fallback.

## Icons

`icon-512.png`, `icon-192.png`, `apple-touch-icon.png` and `favicon-32.png` are scaled copies of
`assets/icon.png` in this repository, the Undercut app icon drawn for this project under F-067. No
third-party artwork, font or trademark is used in them, and they carry no watchlist term. Regenerate
them from the same source if the app icon ever changes, so the portal and the app stay one product:

```
python3 -c "
from PIL import Image
src = Image.open('assets/icon.png').convert('RGB')
for size, name in [(512,'icon-512.png'),(192,'icon-192.png'),(180,'apple-touch-icon.png'),(32,'favicon-32.png')]:
    src.resize((size,size), Image.LANCZOS).save(f'web/pitwall/public/{name}', optimize=True)
"
```
