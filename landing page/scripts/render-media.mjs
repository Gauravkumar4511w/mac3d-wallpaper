// Renders the landing page's media for each world into public/media/<id>/:
//   hd.mp4   1920×1200 H.264, seamless loop  (hero, desktop mock-ups)
//   card.mp4  960×600  H.264, seamless loop  (cards)
//   hd.jpg / card.jpg  posters (first frame)
//   layer-<i>.webp     each depth layer alone, 1280×800, transparent — the
//                      "How it works" view (i = index in the scene's layers)
//
// Frames come from render.html in headless Chrome on the GPU and are encoded
// with ffmpeg (libx264). render.html is built and served on its own (no dev
// server, so nothing can hot-reload it mid-render).
//
//   node scripts/render-media.mjs                 all worlds
//   node scripts/render-media.mjs ocean blossom   just these
//   options: --seconds 8 --fps 30 --only video|layers
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args.splice(i, 2)[1] : def
}
const SECONDS = Number(opt('seconds', 8))
const FPS = Number(opt('fps', 30))
const ONLY = opt('only', '')
const FADE = FPS // 1 s cross-fade makes the loop seamless
// Start time inside each world: a GPU world's stillTime (its best moment) when
// it has one, else 20 s (every SVG animation is running by then).
const startOf = (info) => info.stillTime ?? 20
const meta = JSON.parse(readFileSync(join(root, 'src/world-meta.json'), 'utf8'))
const all = [...Object.keys(meta.gl), ...Object.keys(meta.svg)].map((k) => (meta.gl[k] ?? meta.svg[k]).id)
const ids = args.length ? args : all

/* ---------- a private static build of render.html ---------- */
const site = mkdtempSync(join(tmpdir(), 'render-site-'))
await build({
  root,
  logLevel: 'error',
  base: './',
  publicDir: false,
  build: { outDir: site, emptyOutDir: true, rollupOptions: { input: join(root, 'render.html') } },
})
const server = await preview({ root, logLevel: 'error', build: { outDir: site }, preview: { port: 4321, strictPort: false } })
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '')

/* ---------- headless Chrome (Metal GPU) over the DevTools protocol ---------- */
const port = 9600 + Math.floor(Math.random() * 300)
const profile = mkdtempSync(join(tmpdir(), 'render-media-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1920,1200',
  '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-first-run',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' })
const quit = async (code) => {
  try { chrome.kill() } catch {}
  await server.close().catch(() => {})
  rmSync(profile, { recursive: true, force: true })
  rmSync(site, { recursive: true, force: true })
  process.exit(code)
}
process.on('SIGINT', () => quit(130))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl)
  } catch {}
  if (!ws) await sleep(200)
}
if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') console.error('  page error:', m.params.exceptionDetails.exception?.description?.slice(0, 300))
})
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed')
  return r.result?.result?.value
}
const capture = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png', fromSurface: true })).result.data, 'base64')
await send('Runtime.enable')
await send('Page.enable')

async function open(id, width, height, transparent) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {})
  await send('Page.navigate', { url: `${BASE}/render.html` })
  for (let i = 0; i < 300; i++) {
    if (await evaluate('!!window.render').catch(() => false)) return evaluate(`render.setup(${JSON.stringify(id)})`)
    await sleep(100)
  }
  throw new Error('render.html did not load')
}

const ffmpeg = (argv) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('ffmpeg failed')
}

// The first FADE frames blend from the frames that follow the loop's end, so
// the last frame flows straight into the first: a seamless loop.
function encode(frames, out, { scale, crf }) {
  const L = SECONDS * FPS
  const f = FADE
  const sz = scale ? `,scale=${scale}:flags=lanczos` : ''
  const graph =
    `[0:v]split[a][b];` +
    `[a]trim=start_frame=0:end_frame=${L},setpts=PTS-STARTPTS[main];` +
    `[b]trim=start_frame=${L}:end_frame=${L + f},setpts=PTS-STARTPTS[tail];` +
    `[main]split[m1][m2];` +
    `[m1]trim=start_frame=0:end_frame=${f},setpts=PTS-STARTPTS[head];` +
    `[m2]trim=start_frame=${f},setpts=PTS-STARTPTS[rest];` +
    `[head][tail]blend=all_expr='A*(N/${f})+B*(1-N/${f})'[mix];` +
    // hqdn3d strips the shaders' dither grain, which is invisible at video
    // bitrates but otherwise doubles the file size
    `[mix][rest]concat=n=2:v=1,hqdn3d=2:2:4:4,format=yuv420p${sz}[out]`
  ffmpeg(['-framerate', String(FPS), '-i', join(frames, 'f_%04d.png'), '-filter_complex', graph, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'film', '-crf', String(crf), '-profile:v', 'high',
    '-movflags', '+faststart', '-r', String(FPS), out])
}

const mb = (file) => (statSync(file).size / 1048576).toFixed(1) + ' MB'

async function renderWorld(id) {
  const out = join(root, 'public/media', id)
  mkdirSync(out, { recursive: true })

  if (ONLY !== 'layers') {
    const info = await open(id, 1920, 1200, false)
    const frames = mkdtempSync(join(tmpdir(), `frames-${id}-`))
    try {
      const total = SECONDS * FPS + FADE
      for (let i = 0; i < total; i++) {
        await evaluate(`render.seek(${startOf(info) + i / FPS})`)
        writeFileSync(join(frames, `f_${String(i).padStart(4, '0')}.png`), await capture())
        if (i % 60 === 0) process.stdout.write(`  frames ${i}/${total}\r`)
      }
      encode(frames, join(out, 'hd.mp4'), { crf: 26 })
      encode(frames, join(out, 'card.mp4'), { scale: '960:600', crf: 26 })
      ffmpeg(['-i', join(out, 'hd.mp4'), '-frames:v', '1', '-q:v', '3', join(out, 'hd.jpg')])
      ffmpeg(['-i', join(out, 'card.mp4'), '-frames:v', '1', '-q:v', '4', join(out, 'card.jpg')])
    } finally {
      rmSync(frames, { recursive: true, force: true })
    }
    console.log(`  video: hd ${mb(join(out, 'hd.mp4'))} · card ${mb(join(out, 'card.mp4'))} (${info.shader ? 'GPU' : 'SVG'})`)
  }

  if (ONLY !== 'video') {
    const info = await open(id, 1280, 800, true)
    let n = 0
    for (const [i, l] of info.layers.entries()) {
      if (l.clock) continue
      await evaluate(`render.layer(${i})`)
      await evaluate(`render.seek(${startOf(info) + 3})`)
      const png = 'data:image/png;base64,' + (await capture()).toString('base64')
      const webp = await evaluate(`render.webp(${JSON.stringify(png)})`)
      writeFileSync(join(out, `layer-${i}.webp`), Buffer.from(webp.split(',')[1], 'base64'))
      n++
    }
    console.log(`  layers: ${n} images`)
  }
}

// One retry per world (a busy GPU can crash a tab); a failure doesn't stop the rest.
const failed = []
for (const id of ids) {
  const t = Date.now()
  console.log(`▸ ${id}`)
  for (let attempt = 1; ; attempt++) {
    try {
      await renderWorld(id)
      console.log(`  done in ${Math.round((Date.now() - t) / 1000)} s`)
      break
    } catch (e) {
      console.log(`  attempt ${attempt} failed: ${e.message.split('\n')[0]}`)
      if (attempt >= 2) {
        failed.push(id)
        break
      }
    }
  }
}
if (failed.length) console.log(`FAILED: ${failed.join(' ')}`)
await quit(failed.length ? 1 : 0)
