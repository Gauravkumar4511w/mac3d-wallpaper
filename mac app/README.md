# mac3D Wallpaper — macOS app

A menu bar app that puts the landing page's layered, living worlds on your
desktop: behind your icons and windows, following your cursor, with the Depth
Clock. Universal (Apple silicon + Intel), macOS 13 or later.

## Build and run

```bash
./build.sh            # → build/mac3D Wallpaper.app
./build.sh --dmg      # also build/mac3D-Wallpaper.dmg, copied to the landing page's public/downloads/
./build.sh --install  # also replace /Applications/mac3D Wallpaper.app and relaunch it
open "build/mac3D Wallpaper.app"
```

Needs the Xcode Command Line Tools (`swiftc`), Node (the landing page's
`node_modules`), and Google Chrome the first time (it renders the app icon from
`icon/icon.html`; delete `build/AppIcon.icns` to re-render).

## How it works

- **Same worlds as the site.** `build.sh` runs the landing page's
  `npm run build:app`, which builds `wallpaper.html` (one world full screen, see
  `landing page/src/wallpaper.jsx`) with every world in its own chunk. The app
  bundles that output in `Contents/Resources/web` and serves it to a `WKWebView`
  under `mac3d://app/…` (`BundleSchemeHandler.swift`), so it works offline.
  Add or change a world on the site, rebuild, and the app has it.
- **Desktop level.** One borderless window per display at the desktop window
  level: above the system wallpaper, below desktop icons and every app. It
  ignores clicks and appears on every Space (`DesktopWallpaper.swift`).
- **Parallax.** The app polls the cursor 60 times a second (no permissions
  needed), sends it to the page only when it moves, and the page eases toward it.
- **Power.** WebKit stops drawing whenever the desktop is fully covered by
  windows, so a hidden wallpaper costs nothing. The app also pauses while the
  displays sleep, the screen is locked or the Mac is in Low Power Mode. GPU
  ("Ultra-real") worlds draw at 30 fps and up to 1.5× resolution on the desktop.
- **Reduce Motion.** With macOS Reduce Motion on, the scene and parallax hold still.

## Menu

Worlds (Ultra-real · Worlds · New · alive), Next World, **Match Time of Day**
(on by default: dawn peaks in the morning, golden-hour dunes, a night city…),
Show Depth Clock, Parallax (Off / Subtle / Normal / Strong), Pause Animations,
Open at Login, About, Quit.

Settings live in `defaults read com.mac3d.wallpaper`.

## Self-test

```bash
"build/mac3D Wallpaper.app/Contents/MacOS/mac3DWallpaper" --self-test /tmp/mac3d-shots [--worlds neon,flowervalley]
```

Shows each world, saves `/tmp/mac3d-shots/<id>.png`, prints frame rate,
running animations and WebGL status, then quits.

## Sharing it

The build is signed ad hoc, which is fine on this Mac. To let other people
download it from the site without Gatekeeper blocking it, sign with a
Developer ID certificate (`codesign --options runtime --sign "Developer ID
Application: …"`) and notarize it (`xcrun notarytool submit … --wait`, then
`xcrun stapler staple`). That needs an Apple Developer account.
