#!/usr/bin/env bash
# Regenerates assets/fonts/ArchivoExpanded_*.ttf: static instances of the Archivo variable font
# (OFL-1.1, Omnibus-Type) at width 125, the same face the Pit Wall portal loads from Google Fonts.
# React Native cannot set font-stretch, so each weight is instanced at the wide width and loaded
# as its own family (F-099). Needs python3 with fonttools (`pip install fonttools`).
set -euo pipefail
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# pinned to one google/fonts commit and checked, so the committed instances can always be re-derived
REF=6c70c829f09ea345d3590406693220ea35c6553f
SHA256=0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053
curl -sS -f -L -o "$tmp/Archivo.ttf" "https://raw.githubusercontent.com/google/fonts/$REF/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"
echo "$SHA256  $tmp/Archivo.ttf" | sha256sum -c --quiet
curl -sS -f -L -o assets/fonts/OFL-Archivo.txt "https://raw.githubusercontent.com/google/fonts/$REF/ofl/archivo/OFL.txt"
for w in 400:Regular 700:Bold 900:Black; do
  python3 -m fontTools.varLib.instancer "$tmp/Archivo.ttf" wdth=125 "wght=${w%%:*}" --update-name-table --quiet -o "assets/fonts/ArchivoExpanded_${w%%:*}${w##*:}.ttf"
done
ls -l assets/fonts/ArchivoExpanded_*.ttf
