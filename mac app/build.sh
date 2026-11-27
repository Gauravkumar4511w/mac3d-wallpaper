#!/bin/bash
# Builds "build/mac3D Wallpaper.app" (universal: Apple silicon + Intel).
#
#   ./build.sh          build the app
#   ./build.sh --dmg    also make build/mac3D-Wallpaper.dmg and copy it to the
#                       landing page (public/downloads/) for its Download buttons
#   ./build.sh --install   also replace /Applications/mac3D Wallpaper.app and relaunch it
#
# Needs: Xcode Command Line Tools (swiftc), Node (for the web build), and
# Google Chrome (only the first time, to render the app icon).
set -euo pipefail
cd "$(dirname "$0")"

NAME="mac3D Wallpaper"
EXE="mac3DWallpaper"
APP="build/$NAME.app"
SITE="../landing page"
SDK=$(xcrun --sdk macosx --show-sdk-path)

echo "› web: building the wallpaper page from the landing page's worlds"
(cd "$SITE" && npm run --silent build:app >/dev/null)

echo "› swift: compiling (arm64 + x86_64)"
for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.0" -sdk "$SDK" Sources/*.swift -o "build/$EXE-$arch"
done
lipo -create -output "build/$EXE" "build/$EXE-arm64" "build/$EXE-x86_64"

[ -f build/AppIcon.icns ] || ./icon/make-icon.sh

echo "› bundle: $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "build/$EXE" "$APP/Contents/MacOS/$EXE"
cp Info.plist "$APP/Contents/Info.plist"
cp build/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cp -R build/web "$APP/Contents/Resources/web"

# World thumbnails for the window's gallery: the site's card posters, shrunk.
mkdir -p "$APP/Contents/Resources/thumbs"
for card in "$SITE"/public/media/*/card.jpg; do
  id=$(basename "$(dirname "$card")")
  sips -Z 480 -s formatOptions 80 "$card" --out "$APP/Contents/Resources/thumbs/$id.jpg" >/dev/null
done

# Google sign-in + settings sync: the Firebase app config, when present (see
# README.md, "Sign-in and sync"). Without it the app works, sync is just off.
# Looked for here, then in ~/.config/mac3d/ (kept out of git: it holds the
# Firebase API key, which ships inside the app but needn't sit in a public repo).
SYNC_CONFIG=""
for f in GoogleService-Info.plist "$HOME/.config/mac3d/GoogleService-Info.plist"; do
  [ -f "$f" ] && { SYNC_CONFIG="$f"; break; }
done
if [ -n "$SYNC_CONFIG" ]; then
  cp "$SYNC_CONFIG" "$APP/Contents/Resources/GoogleService-Info.plist"
  echo "› sync: bundled $SYNC_CONFIG"
else
  echo "› sync: no GoogleService-Info.plist — Google sign-in is off in this build"
fi

# Ad-hoc signature: fine on this Mac. To share it, sign with a Developer ID
# and notarize (see README.md), or Gatekeeper will block it on other Macs.
codesign --force --deep --sign - "$APP"
echo "✓ $APP ($(du -sh "$APP" | cut -f1))"

if [[ " $* " == *" --dmg "* ]]; then
  DMG="build/mac3D-Wallpaper.dmg"
  STAGE=$(mktemp -d)
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  rm -f "$DMG"
  hdiutil create -quiet -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
  rm -rf "$STAGE"
  mkdir -p "$SITE/public/downloads"
  cp "$DMG" "$SITE/public/downloads/mac3D-Wallpaper.dmg"
  echo "✓ $DMG → landing page/public/downloads/"
fi

if [[ " $* " == *" --install "* ]]; then
  # Replace the whole bundle: copying over it would leave stale files behind
  # and break its signature.
  pkill -f "/Applications/$NAME.app/Contents/MacOS/$EXE" || true
  sleep 1
  rm -rf "/Applications/$NAME.app"
  ditto "$APP" "/Applications/$NAME.app"
  codesign --verify --deep "/Applications/$NAME.app"
  open "/Applications/$NAME.app"
  echo "✓ installed and launched /Applications/$NAME.app"
fi
