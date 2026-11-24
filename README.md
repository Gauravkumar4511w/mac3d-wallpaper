# mac3D Wallpaper

Layered, living 3D wallpapers for the Mac — the landing page and the macOS app.

**[Download the latest release](https://github.com/Gauravkumar4511w/mac3d-wallpaper/releases/latest)** · [Website](https://mac3d-wallpaper.vercel.app)

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

The website shows every world as a pre-rendered, hardware-decoded video (so a page full of worlds stays smooth on any Mac); the app still renders them live. After adding or changing a world, re-render its media into `public/media/<id>/`:

```bash
node scripts/render-media.mjs <id> [<id> …]   # hd/card MP4 loops, posters, layer images (needs Chrome + ffmpeg)
node scripts/gl-check.mjs <id> --bench        # GPU worlds: compile check, snapshots, ms per frame
```

Deploy: Vercel, with **Root Directory** set to `landing page` (framework: Vite).

## Mac app

```bash
cd "mac app"
./build.sh --dmg --install   # build, refresh the site's DMG, install to /Applications
```

## License

[MIT](LICENSE) © 2026 Gauravkumar4511w
