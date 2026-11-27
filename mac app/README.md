# mac3D Wallpaper — macOS app

A Mac app that puts the landing page's layered, living worlds on your
desktop: behind your icons and windows, following your cursor, with the Depth
Clock. It has a window for choosing and setting things up, and otherwise lives
in the menu bar. Universal (Apple silicon + Intel), macOS 13 or later.

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

## Window, menu and settings

**The window** opens whenever you open the app yourself (Finder, Launchpad,
Spotlight, or again while it's running), so it never seems to do nothing, even
when its menu bar icon is hidden behind the notch. On first launch it walks you
through a short setup (welcome → choose a world or "Match the time of day" →
open at login, clock, parallax, optional sign-in). After that it's Settings:

- **Wallpaper**: the world on your desktop, a gallery of every world (click to
  set, ♥ to favourite), and **Changes automatically**: keep my pick / match the
  time of day / a new world every hour / every day (hourly and daily cycle
  through your favourites, or every world if there are none).
- **Motion & Clock**: Depth Clock, parallax (Off / Subtle / Normal / Strong), pause.
- **General**: open at login, show the menu bar icon, show the setup again.
- **Account & Sync**: optional Google sign-in (below).

While the window is open the app is in the Dock and ⌘-Tab; closing it returns
it to the menu bar. Opened by Open at Login, it starts quietly without the window.

**The menu bar menu** has the same controls: Open mac3D Wallpaper… (⌘,),
Worlds, Next World, Change Automatically, Show Depth Clock, Parallax, Pause
Animations, Open at Login, About, Quit.

Settings live in `defaults read com.mac3d.wallpaper`.

`--render-ui <dir> [--dark]` renders every page of the window and the setup
steps to PNGs (off screen, nothing changed) — handy for checking the design.

## Sign-in and sync

Optional: sign in with Google and the world, automatic changes, favourites,
clock and parallax follow you to every Mac (pause, open at login and the menu
bar icon stay per Mac). Google sign-in runs in the system's web sign-in sheet
with PKCE; the Google ID token signs in to Firebase Auth, and the settings are
one Firestore document, `users/{uid}`, readable and writable only by that
person (`firebase/firestore.rules`). The newest change wins; a new Mac takes
the cloud copy on first sign-in. The Firebase refresh token is kept in
`~/Library/Application Support/mac3D Wallpaper/account.json` (mode 600).

To turn it on (once, in the [Firebase console](https://console.firebase.google.com)):

1. Create a project (Analytics not needed).
2. **Add app → Apple (iOS+)**, bundle ID `com.mac3d.wallpaper`, and download
   `GoogleService-Info.plist` into this folder (`mac app/`).
3. **Authentication → Sign-in method → Google → Enable**.
4. **Firestore Database → Create database** (production mode), then paste
   `firebase/firestore.rules` into **Rules** and publish.
5. `./build.sh --dmg`. The build bundles the plist; without it the Account page
   says sync isn't set up and everything else works the same.

The plist's keys identify the app, they aren't secrets: access is guarded by
the Firestore rules.

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
