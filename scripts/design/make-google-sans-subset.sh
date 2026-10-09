#!/usr/bin/env bash
# Regenerates assets/fonts/GoogleSans_500Medium.ttf: Google Sans Medium (OFL-1.1, The Google Sans
# Project Authors), the face Google's Sign in with Google guidelines name for the button label.
# It is used for that one label, so it is subset to Latin: the full file is 2 MB, the subset about
# 65 KB. Needs python3 with fonttools (`pip install fonttools`).
set -euo pipefail
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# pinned to one published package and checked, so the committed subset can always be re-derived
PKG=https://registry.npmjs.org/@expo-google-fonts/google-sans/-/google-sans-0.4.3.tgz
SHA256=56cfc0939de77ec0195a28c5d7fbdc2bfd7e8b9c2c1e8d48d5e76b64e2e940a0
curl -sS -f -L -o "$tmp/gs.tgz" "$PKG"
echo "$SHA256  $tmp/gs.tgz" | sha256sum -c --quiet
tar xzf "$tmp/gs.tgz" -C "$tmp" package/500Medium/GoogleSans_500Medium.ttf package/LICENSE_FONT
cp "$tmp/package/LICENSE_FONT" assets/fonts/OFL-GoogleSans.txt
python3 -m fontTools.subset "$tmp/package/500Medium/GoogleSans_500Medium.ttf" \
  --unicodes='U+0020-007E,U+00A0-00FF,U+2026' --layout-features='*' --name-IDs='*' --notdef-outline \
  --output-file=assets/fonts/GoogleSans_500Medium.ttf
ls -l assets/fonts/GoogleSans_500Medium.ttf
