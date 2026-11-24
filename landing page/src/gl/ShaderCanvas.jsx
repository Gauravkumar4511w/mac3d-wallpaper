import { useEffect, useRef, useState } from 'react'
import './shader.css'
import { CONTEXT_ATTRS, createProgramAsync, drawFrame, setupQuad, renderToCanvas2D, warmUp } from './runtime.js'
import { createLiveWorker, offscreenWebGL, renderStillBitmap } from './offscreen.js'

const MIN_SCALE = 0.5

/**
 * Live shader world.
 * - Where the browser supports it, renders in a worker on an OffscreenCanvas
 *   (live.worker.js): shader compiles, the slow first draw and every frame stay
 *   off the main thread, and a GPU governor stops it from swamping the GPU.
 *   Elsewhere it renders on the main thread, compiling in the background.
 * - Renders at devicePixelRatio (capped by maxScale) and adapts resolution and
 *   frame rate (optional maxFps cap: the desktop app uses 30).
 * - Only holds a WebGL context while on screen (browsers cap live contexts).
 * - Reads cursor parallax from the inherited CSS vars --px / --py.
 * - Honours prefers-reduced-motion (a single still frame).
 * - Holds its last frame while inside a [data-paused] element.
 * - If even its lowest settings are too much for this GPU it holds a still
 *   frame and dispatches a bubbling 'gpu-slow' event.
 *
 * Lab-only props: time (freeze at t seconds), par ([x, y] override), onStats.
 */
export function ShaderCanvas({ frag, layer = -1, maxScale = 2, maxFps, fallback, time, par, onStats, className = '' }) {
  const wrapRef = useRef(null)
  const [error, setError] = useState(null)
  const opts = useRef({ time, par, onStats, layer })
  useEffect(() => {
    opts.current = { time, par, onStats, layer }
  })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const engine = offscreenWebGL() ? workerEngine : mainEngine
    const fail = (message) => {
      console.error('[shader]', message)
      setError(message)
    }
    const slow = () => wrap.dispatchEvent(new CustomEvent('gpu-slow', { bubbles: true }))
    let live = null
    let cssW = 0
    let cssH = 0

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !live) {
          setError(null)
          live = engine({ wrap, frag, maxScale, maxFps, reduce, opts, size: () => [cssW, cssH], fail, slow })
        } else if (!entry.isIntersecting && live) {
          live.stop()
          live = null
        }
      },
      { rootMargin: '150px' },
    )
    const ro = new ResizeObserver(([entry]) => {
      cssW = entry.contentRect.width
      cssH = entry.contentRect.height
      live?.resized()
    })
    io.observe(wrap)
    ro.observe(wrap)
    return () => {
      io.disconnect()
      ro.disconnect()
      live?.stop()
    }
  }, [frag, maxScale, maxFps])

  return (
    <div
      ref={wrapRef}
      className={`shader-wrap ${className}`}
      style={{ background: fallback }}
      data-shader-error={error ? '' : undefined}
      title={error ? `Shader error: ${error}` : undefined}
    />
  )
}

const readPar = (wrap, o) => {
  if (o.par) return o.par
  const cs = getComputedStyle(wrap)
  return [parseFloat(cs.getPropertyValue('--px')) || 0, parseFloat(cs.getPropertyValue('--py')) || 0]
}

/* ---------- worker engine: the canvas is drawn by live.worker.js ---------- */

function workerEngine({ wrap, frag, maxScale, maxFps, reduce, opts, size, fail, slow }) {
  const canvas = document.createElement('canvas')
  canvas.className = 'shader-canvas'
  wrap.appendChild(canvas)
  const offscreen = canvas.transferControlToOffscreen()
  const worker = createLiveWorker()
  let raf = 0
  let sent = {}

  // Tell the worker only what changed: size, parallax, pause, lab time.
  const sync = () => {
    const [cssW, cssH] = size()
    const o = opts.current
    const par = readPar(wrap, o)
    const next = { cssW, cssH, dpr: window.devicePixelRatio || 1, par, paused: !!wrap.closest('[data-paused]'), time: o.time }
    const changed =
      next.cssW !== sent.cssW ||
      next.cssH !== sent.cssH ||
      next.dpr !== sent.dpr ||
      next.paused !== sent.paused ||
      next.time !== sent.time ||
      Math.abs(par[0] - (sent.par?.[0] ?? 9)) + Math.abs(par[1] - (sent.par?.[1] ?? 9)) > 0.0005
    if (changed) {
      worker.postMessage({ type: 'update', state: next })
      sent = next
    }
  }
  const loop = () => {
    sync()
    raf = requestAnimationFrame(loop)
  }

  worker.onmessage = ({ data }) => {
    if (data.type === 'error') fail(data.message)
    else if (data.type === 'slow') slow()
    else if (data.type === 'stats') opts.current.onStats?.(data)
  }
  worker.onerror = (e) => fail(e.message || 'worker failed')
  const [cssW, cssH] = size()
  const o = opts.current
  sent = { cssW, cssH, dpr: window.devicePixelRatio || 1, par: readPar(wrap, o), paused: !!wrap.closest('[data-paused]'), time: o.time }
  worker.postMessage(
    { type: 'init', canvas: offscreen, frag, layer: o.layer, maxScale, maxFps, reduce, time: o.time, state: sent },
    [offscreen],
  )
  raf = requestAnimationFrame(loop)

  return {
    resized: sync,
    stop() {
      cancelAnimationFrame(raf)
      worker.terminate()
      canvas.remove()
    },
  }
}

/* ---------- main-thread engine (no OffscreenCanvas WebGL, e.g. Safari 16) ---------- */

function mainEngine({ wrap, frag, maxScale, maxFps, reduce, opts, size, fail, slow }) {
  const canvas = document.createElement('canvas')
  canvas.className = 'shader-canvas'
  wrap.appendChild(canvas)
  let gl = canvas.getContext('webgl2', CONTEXT_ATTRS)
  let prog = null
  let raf = 0
  let stopped = false
  let scale = Math.min(window.devicePixelRatio || 1, maxScale)
  let frames = 0
  let acc = 0
  let last = 0
  let stuck = 0
  let fpsT = 0
  let fpsN = 0
  let t0 = performance.now()
  let pausedAt = 0
  let held = false
  const interval = maxFps ? 1000 / maxFps : 0
  const target = interval || 1000 / 60

  const renderOnce = (now) => {
    const [cssW, cssH] = size()
    const w = Math.max(1, Math.round(cssW * scale))
    const h = Math.max(1, Math.round(cssH * scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const o = opts.current
    const t = o.time != null ? o.time : reduce ? 14 : (now - t0) / 1000 + 4
    gl.viewport(0, 0, w, h)
    drawFrame(gl, prog, { w, h, time: t, par: readPar(wrap, o), layer: o.layer })
    return [w, h]
  }

  const frame = (now) => {
    raf = requestAnimationFrame(frame)
    const [cssW, cssH] = size()
    if (!cssW || !cssH || held) return
    if (wrap.closest('[data-paused]')) {
      if (!pausedAt) pausedAt = now
      last = 0
      return
    }
    if (pausedAt) {
      t0 += now - pausedAt
      pausedAt = 0
    }
    if (interval && last && now - last < interval - 4) return
    const [w, h] = renderOnce(now)
    // Adaptive resolution. Gaps over 100 ms are a throttled background page,
    // not a slow GPU, so they are ignored.
    const gap = now - last
    if (last && gap < 100 && document.visibilityState === 'visible') {
      acc += gap
      frames++
      if (frames >= 40) {
        const avg = acc / frames
        if (avg > target * 1.26 && scale > MIN_SCALE) scale = Math.max(MIN_SCALE, scale * 0.85)
        else if (avg < target * 0.84 && scale < maxScale) scale = Math.min(maxScale, scale * 1.06)
        // still far too slow at the lowest resolution: hold this frame
        stuck = avg > target * 2 && scale <= MIN_SCALE ? stuck + 1 : 0
        if (stuck >= 3) {
          held = true
          slow()
        }
        frames = 0
        acc = 0
      }
    }
    last = now
    fpsN++
    if (now - fpsT > 500) {
      opts.current.onStats?.({ fps: Math.round((fpsN * 1000) / (now - fpsT)), w, h, scale })
      fpsT = now
      fpsN = 0
    }
  }

  if (!gl) {
    fail('WebGL2 is not available')
  } else {
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault())
    setupQuad(gl)
    // compile and build the pipeline in the background, then start drawing
    createProgramAsync(gl, frag)
      .then(async (p) => {
        await warmUp(gl, p)
        if (stopped) return
        prog = p
        if (reduce) renderOnce(performance.now())
        else raf = requestAnimationFrame(frame)
      })
      .catch((e) => !stopped && fail(e.message))
  }

  return {
    resized() {
      if (reduce && prog) renderOnce(performance.now())
    },
    stop() {
      stopped = true
      cancelAnimationFrame(raf)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
      gl = null
      canvas.remove()
    },
  }
}

/** A single static frame of one layer (rendered in a worker where possible). */
export function ShaderStill({ frag, layer = -1, time = 14, par, maxScale = 2 }) {
  const ref = useRef(null)
  const [error, setError] = useState(null)
  const px = par?.[0] ?? 0
  const py = par?.[1] ?? 0
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let alive = true
    let req = 0
    const draw = () => {
      const r = canvas.getBoundingClientRect()
      const s = Math.min(window.devicePixelRatio || 1, maxScale)
      const w = Math.max(1, Math.round(r.width * s))
      const h = Math.max(1, Math.round(r.height * s))
      if (!offscreenWebGL()) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        setError(renderToCanvas2D(frag, canvas, { layer, time, par: [px, py] }))
        return
      }
      const mine = ++req
      renderStillBitmap(frag, w, h, { layer, time, par: [px, py] })
        .then((bitmap) => {
          if (!alive || mine !== req) return bitmap.close()
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
          setError(null)
        })
        .catch((e) => alive && setError(e.message))
    }
    const ro = new ResizeObserver(draw) // also fires once right away
    ro.observe(canvas)
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [frag, layer, time, px, py, maxScale])
  return (
    <canvas
      ref={ref}
      className="shader-canvas"
      data-shader-error={error ? '' : undefined}
      title={error ? `Shader error: ${error}` : undefined}
    />
  )
}
