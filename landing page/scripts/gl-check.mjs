// Dev tool: compile-check, screenshot and benchmark GPU worlds headlessly.
//
//   node scripts/gl-check.mjs <id> [<id> …] [options]
//
//   --out <dir>        where PNGs go (default: /tmp/gl-check)
//   --t 14,40,90       times (seconds) to snapshot; default: the world's stillTime or 14
//   --size 1600x1000   snapshot size (16:10); use 3840x2400 to eyeball 4K detail
//   --par 0,0          fixed parallax for snapshots
//   --layers           also snapshot every isolated layer (on a checkerboard)
//   --bench            time the full scene at 2560×1600 (ms per frame)
//   --url <base>       use a running dev server instead of starting one
//
// Prints one line per world/time: OK / ERROR (with the compile log) and the
// PNG path; with --bench, the median ms per frame (an M2 should stay well under
// ~16 ms at 2560×1600 for the desktop app's 30 fps cap at 1.5× scale).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args.splice(i, 1), true) : false
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args.splice(i, 2)[1] : def
}
const OUT = resolve(opt('out', join(tmpdir(), 'gl-check')))
const TIMES = opt('t', '')
const [W, H] = opt('size', '1600x1000').split('x').map(Number)
const PAR = opt('par', '0,0')
const LAYERS = flag('layers')
const BENCH = flag('bench')
let BASE = opt('url', '')
const ids = args
if (!ids.length) {
  console.error('usage: node scripts/gl-check.mjs <world-id> [...] [--t 14,40] [--size 1600x1000] [--layers] [--bench]')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- dev server ---------- */
let server = null
if (!BASE) {
  const { createServer } = await import('vite')
  server = await createServer({ root, logLevel: 'error', server: { port: 5300 + Math.floor(Math.random() * 400), hmr: false } })
  await server.listen()
  BASE = server.resolvedUrls.local[0].replace(/\/$/, '')
}

/* ---------- headless Chrome on the GPU (Metal) ---------- */
const port = 9300 + Math.floor(Math.random() * 600)
const profile = mkdtempSync(join(tmpdir(), 'gl-check-'))
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H + 48}`,
    '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-first-run',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank',
  ],
  { stdio: 'ignore' },
)
const quit = async (code) => {
  try { chrome.kill('SIGKILL') } catch { /* gone */ }
  await server?.close().catch(() => {})
  rmSync(profile, { recursive: true, force: true })
  process.exit(code)
}
process.on('SIGINT', () => quit(130))
process.on('SIGTERM', () => quit(143))

let ws
for (let i = 0; i < 80 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl)
  } catch { /* not up yet */ }
  if (!ws) await sleep(150)
}
if (!ws) {
  console.error('Chrome did not start')
  await quit(1)
}
if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++seq
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H + 48, deviceScaleFactor: 1, mobile: false })

async function load(query, timeout = 120000) {
  await send('Page.navigate', { url: `${BASE}/lab.html?${query}` })
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    await sleep(250)
    const s = await evaluate(
      `(() => { const el = document.getElementById('status'); return el ? { ready: el.hasAttribute('data-ready'), error: el.getAttribute('data-error'), text: el.textContent } : null })()`,
    )
    if (s?.error) return { error: s.error }
    if (s?.ready) {
      if (query.includes('bench=1')) return { text: s.text }
      // a still is drawn once its canvas is resized from the 300×150 default
      const c = await evaluate(
        `(() => { const cs = [...document.querySelectorAll('canvas.shader-canvas')]; const bad = cs.find((c) => c.hasAttribute('data-shader-error')); return { n: cs.length, drawn: cs.filter((c) => c.width !== 300 || c.height !== 150).length, error: bad ? bad.getAttribute('title') : null } })()`,
      )
      if (c?.error) return { error: c.error }
      if (c && c.n > 0 && c.drawn === c.n) {
        await sleep(150)
        return { text: s.text }
      }
    }
  }
  return { error: 'timed out' }
}

async function shot(file, clipTop = 48) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: clipTop, width: W, height: H, scale: 1 } })
  writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  return file
}

let failed = 0
for (const id of ids) {
  const mod = await evaluate('1') // keep the socket warm
  void mod
  let times = TIMES ? TIMES.split(',').map(Number) : null
  if (!times) {
    // the world's own stillTime, if it has one
    const r = await load(`world=${id}&snap=1&t=14&par=${PAR}`)
    if (r.error) {
      console.log(`${id}: ERROR ${r.error}`)
      failed++
      continue
    }
    times = [14]
  }
  for (const t of times) {
    const t0 = Date.now()
    const r = await load(`world=${id}&snap=1&t=${t}&par=${PAR}`)
    if (r.error) {
      console.log(`${id} t=${t}: ERROR ${r.error}`)
      failed++
      break
    }
    const f = await shot(join(OUT, `${id}-t${t}-${W}x${H}.png`))
    console.log(`${id} t=${t}: OK ${f} (${Date.now() - t0} ms)`)
  }
  if (LAYERS) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false })
    const r = await load(`world=${id}&layers=1&t=${times[0]}&par=${PAR}`)
    if (r.error) console.log(`${id} layers: ERROR ${r.error}`)
    else {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      const f = join(OUT, `${id}-layers.png`)
      writeFileSync(f, Buffer.from(res.result.data, 'base64'))
      console.log(`${id} layers: OK ${f}`)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H + 48, deviceScaleFactor: 1, mobile: false })
  }
  if (BENCH) {
    const r = await load(`world=${id}&bench=1`, 180000)
    console.log(`${id} ${r.error ? `bench ERROR ${r.error}` : r.text.replace(/^.*?bench/, 'bench')}`)
  }
}
await quit(failed ? 1 : 0)
