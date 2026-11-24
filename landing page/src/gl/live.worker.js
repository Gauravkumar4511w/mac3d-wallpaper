// Renders one live shader world on an OffscreenCanvas, off the page's main
// thread. Shader compiles, the expensive first draw, and every frame happen
// here, so neither the page nor the desktop app ever freezes.
//
// A GPU governor keeps the GPU from being swamped:
//   • at most one frame in flight — a new frame is only queued once the GPU
//     has finished the last one (checked with a fence, never by waiting);
//   • a frame still unfinished when the next one is due counts as "over
//     budget" (the GPU can't sustain the frame rate). If that happens often,
//     resolution steps down, then frame rate. Frames that finish within ~60%
//     of the frame time count as "calm"; after a few calm seconds resolution,
//     then frame rate, climb back;
//   • if even the lowest settings can't keep up, the last frame is held and
//     the page is told ({ type: 'slow' }) so it can prefer lighter worlds.
//
// Messages in:  { type: 'init', canvas, frag, layer, maxScale, maxFps, reduce, time, state }
//               { type: 'update', state: { cssW?, cssH?, dpr?, par?, paused?, time? } }
// Messages out: { type: 'ready' } { type: 'stats', … } { type: 'error', message } { type: 'slow' }
import { CONTEXT_ATTRS, createProgramAsync, drawFrame, setupQuad, warmUp } from './runtime.js'

const MIN_SCALE = 0.35
const FPS_STEPS = [60, 30, 20, 15]
const raf = self.requestAnimationFrame
  ? (fn) => self.requestAnimationFrame(fn)
  : (fn) => setTimeout(() => fn(performance.now()), 16)

let canvas = null
let gl = null
let prog = null
let cfg = null
const st = { cssW: 0, cssH: 0, dpr: 1, par: [0, 0], paused: false, time: undefined }

self.onmessage = ({ data: m }) => {
  if (m.type === 'init') init(m)
  else if (m.type === 'update') Object.assign(st, m.state)
}

async function init(m) {
  canvas = m.canvas
  cfg = { frag: m.frag, layer: m.layer ?? -1, maxScale: m.maxScale ?? 2, maxFps: m.maxFps || 60, reduce: !!m.reduce }
  Object.assign(st, m.state, { time: m.time })
  gl = canvas.getContext('webgl2', CONTEXT_ATTRS)
  if (!gl) return self.postMessage({ type: 'error', message: 'WebGL2 is not available' })
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault())
  setupQuad(gl)
  try {
    prog = await createProgramAsync(gl, cfg.frag)
    await warmUp(gl, prog)
  } catch (e) {
    return self.postMessage({ type: 'error', message: e.message })
  }
  self.postMessage({ type: 'ready' })
  raf(frame)
}

let scale = 0
let fpsCap = 60
let t0 = performance.now()
let pausedAt = 0
let lastDraw = 0
let fence = null
let issuedAt = 0
let judged = true // has the in-flight frame been counted as over / ok yet?
let firstLook = true // is this the first time we look at its fence?
let windowCalm = 0
let held = false // static: lowest settings still too slow
let drawnW = 0
let drawnH = 0
let windowFrames = 0
let windowOver = 0
let calm = 0
let statsT = 0
let statsN = 0

function frame(now) {
  raf(frame)
  if (!scale) {
    scale = Math.min(st.dpr || 1, cfg.maxScale)
    fpsCap = FPS_STEPS.find((f) => f <= cfg.maxFps) ?? cfg.maxFps
  }
  if (st.paused || !st.cssW || !st.cssH) {
    if (!pausedAt) pausedAt = now
    return
  }
  if (pausedAt) {
    t0 += now - pausedAt
    pausedAt = 0
  }

  // GPU still on the last frame? Don't add work. Judge the frame once: over
  // budget if unfinished when the next frame is due, calm if it was already
  // done the first time we looked, early in its slot.
  const interval = 1000 / fpsCap
  if (fence) {
    const done = gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED
    const age = now - issuedAt
    if (!judged && (done || age >= interval - 4)) {
      judged = true
      windowFrames++
      if (!done) windowOver++
      else if (firstLook && (age <= interval * 0.6 || fpsCap >= 60)) windowCalm++
    }
    firstLook = false
    if (!done) return
    gl.deleteSync(fence)
    fence = null
  }

  const w = Math.max(1, Math.round(st.cssW * scale))
  const h = Math.max(1, Math.round(st.cssH * scale))
  const sized = w !== drawnW || h !== drawnH
  // Held (too slow) or reduced motion: draw only when the size changes.
  if ((held || cfg.reduce) && !sized && lastDraw) return
  if (!sized && lastDraw && now - lastDraw < interval - 4) return

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const time = st.time != null ? st.time : cfg.reduce ? 14 : (now - t0) / 1000 + 4
  gl.viewport(0, 0, w, h)
  drawFrame(gl, prog, { w, h, time, par: st.par, layer: cfg.layer })
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  issuedAt = now
  judged = false
  firstLook = true
  gl.flush()
  lastDraw = now
  drawnW = w
  drawnH = h
  statsN++

  if (windowFrames >= Math.max(12, fpsCap)) govern()
  if (now - statsT > 500) {
    self.postMessage({ type: 'stats', fps: Math.round((statsN * 1000) / (now - statsT || 1)), w, h, scale, fpsCap, held })
    statsT = now
    statsN = 0
  }
}

function govern() {
  const overRatio = windowOver / windowFrames
  const allCalm = windowCalm === windowFrames
  windowFrames = 0
  windowOver = 0
  windowCalm = 0
  if (overRatio > 0.3) {
    calm = 0
    if (scale > MIN_SCALE + 0.01) {
      scale = Math.max(MIN_SCALE, scale * 0.8)
    } else {
      const next = FPS_STEPS.find((f) => f < fpsCap)
      if (next) fpsCap = next
      else if (!held) {
        held = true
        self.postMessage({ type: 'slow' })
      }
    }
  } else if (!allCalm) {
    calm = 0
  } else if (++calm >= 3) {
    calm = 0
    const top = Math.min(st.dpr || 1, cfg.maxScale)
    if (scale < top) scale = Math.min(top, scale * 1.08)
    else {
      const up = [...FPS_STEPS].reverse().find((f) => f > fpsCap && f <= cfg.maxFps)
      if (up) fpsCap = up
    }
  }
}
