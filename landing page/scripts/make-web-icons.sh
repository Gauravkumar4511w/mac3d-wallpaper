#!/bin/bash
# Renders the site's icon files from the one brand mark, public/icon.svg:
#   public/icon-32.png, public/favicon.ico (16 + 32), public/apple-touch-icon.png
#   (180 px, full-bleed: iOS rounds it itself) and the mark on public/og.jpg
#   (painted over the 56 px logo tile at 72,144 on the share image).
# The Mac app icon is rendered from the same SVG by "mac app/icon/make-icon.sh".
# Needs Google Chrome, sips, python3 and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/../public"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

shot() { # svg → 1024 px png, transparent outside the tile
  local P; P=$(mktemp -d)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$P" \
    --default-background-color=00000000 --window-size=1024,1024 --screenshot="$2" "file://$1" >/dev/null 2>&1
  rm -rf "$P"
}
shot "$PWD/icon.svg" "$T/tile.png"
# the touch icon fills its square: drop the tile's rounded corners
grep -q 'rx="22.5"' icon.svg || { echo "icon.svg: no rx=\"22.5\" tile clip found" >&2; exit 1; }
sed 's/rx="22.5"/rx="0"/' icon.svg > "$T/bleed.svg"
shot "$T/bleed.svg" "$T/bleed.png"

sips -z 32 32 "$T/tile.png" --out icon-32.png >/dev/null
sips -z 16 16 "$T/tile.png" --out "$T/16.png" >/dev/null
sips -z 180 180 "$T/bleed.png" --out apple-touch-icon.png >/dev/null
python3 -I - "$T/16.png" icon-32.png favicon.ico <<'PY'
import struct, sys
pngs = [open(p, 'rb').read() for p in sys.argv[1:3]]
entries, off = b'', 6 + 16 * len(pngs)
for size, data in zip((16, 32), pngs):
    entries += struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(data), off)
    off += len(data)
open(sys.argv[3], 'wb').write(struct.pack('<HHH', 0, 1, len(pngs)) + entries + b''.join(pngs))
PY

sips -z 58 58 "$T/tile.png" --out "$T/og-mark.png" >/dev/null
ffmpeg -hide_banner -loglevel error -y -i og.jpg -i "$T/og-mark.png" -filter_complex "overlay=71:143" -q:v 2 "$T/og.jpg"
cp "$T/og.jpg" og.jpg
echo "✓ icon-32.png favicon.ico apple-touch-icon.png og.jpg"
