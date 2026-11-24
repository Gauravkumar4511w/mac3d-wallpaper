# mac3D Wallpaper

Layered, living 3D wallpapers for the Mac — the landing page and the macOS app.

| Folder | What it is |
| --- | --- |
| [`landing page/`](landing%20page) | The website (React + Vite). Every world lives in `src/worlds/` (SVG/CSS) or `src/gl/worlds/` (GPU shaders). |
| [`mac app/`](mac%20app) | The menu bar app (Swift). It bundles the site's worlds and shows them on the desktop. See its [README](mac%20app/README.md). |

## Website

```bash
cd "landing page"
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (regenerates src/world-meta.json first)
```

Dev-only pages: `preview.html?world=<file>` (one SVG world, with card / layers / parallax modes) and `lab.html?world=<id>` (GPU shader lab).

Deploy: Vercel, with **Root Directory** set to `landing page` (framework: Vite).

## Mac app

```bash
cd "mac app"
./build.sh --dmg --install   # build, refresh the site's DMG, install to /Applications
```
