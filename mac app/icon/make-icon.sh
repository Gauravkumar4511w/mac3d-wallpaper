#!/bin/bash
# Renders icon.html to a 1024 px PNG with headless Chrome and packs every
# macOS icon size into ../build/AppIcon.icns.
set -euo pipefail
cd "$(dirname "$0")"
OUT="../build"
SET="$OUT/AppIcon.iconset"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"
rm -rf "$SET" && mkdir -p "$SET"

PROFILE=$(mktemp -d)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFILE" \
  --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$OUT/icon-1024.png" "file://$PWD/icon.html" >/dev/null 2>&1
rm -rf "$PROFILE"

for size in 16 32 128 256 512; do
  sips -z $size $size "$OUT/icon-1024.png" --out "$SET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$OUT/icon-1024.png" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$OUT/AppIcon.icns"
rm -rf "$SET"
echo "icon: $OUT/AppIcon.icns"
