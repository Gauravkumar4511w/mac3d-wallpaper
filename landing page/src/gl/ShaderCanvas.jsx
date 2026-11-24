import { useEffect, useRef, useState } from 'react'
import './shader.css'
import { CONTEXT_ATTRS, createProgram, drawFrame, setupQuad, renderToCanvas2D } from './runtime.js'

const MIN_SCALE = 0.5

/**
 * Live, full-resolution shader world.
 * - Renders at devicePixelRatio (capped by maxScale) and adapts the render
 *   scale down/up to hold a smooth frame rate.
 * - Only holds a WebGL context while on screen; the context is released when
 *   scrolled away (browsers cap live contexts at ~16).
 * - Reads cursor parallax from the inherited CSS vars --px / --py.
 * - Honours prefers-reduced-motion (renders a single still frame).
 * - Holds its last frame while inside a [data-paused] element.
 * - Optional maxFps caps the draw rate (the desktop app uses 30: slow ambient
 *   scenes look the same and the GPU does half the work).
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
    let canvas = null
    let gl = null
    let prog = null
    let raf = 0
    let cssW = 0
    let cssH = 0
    let scale = Math.min(window.devicePixelRatio || 1, maxScale)
    let frames = 0
    let acc = 0
    let last = 0
    let fpsT = 0
    let fpsN = 0
    let t0 = performance.now()
    const interval = maxFps ? 1000 / maxFps : 0
    const target = interval || 1000 / 60 // expected time between draws
    let pausedAt = 0

    const release = () => {
      cancelAnimationFrame(raf)
      raf = 0
      if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext()
      gl = null
      prog = null
      canvas?.remove()
      canvas = null
    }

    const renderOnce = (now) => {
      const w = Math.max(1, Math.round(cssW * scale))
      const h = Math.max(1, Math.round(cssH * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const o = opts.current
      let px = 0
      let py = 0
      if (o.par) {
        ;[px, py] = o.par
      } else {
        const cs = getComputedStyle(wrap)
        px = parseFloat(cs.getPropertyValue('--px')) || 0
        py = parseFloat(cs.getPropertyValue('--py')) || 0
      }
      const t = o.time != null ? o.time : reduce ? 14 : (now - t0) / 1000 + 4
      gl.viewport(0, 0, w, h)
      drawFrame(gl, prog, { w, h, time: t, par: [px, py], layer: o.layer })
      return [w, h]
    }

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (!cssW || !cssH) return
      // Inside a [data-paused] scene (animation budget, or the app's Pause):
      // hold the last frame, then resume where it left off.
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
      // adaptive resolution: hold the frame rate, never drop below MIN_SCALE.
      // Gaps over 100 ms mean the browser is throttling a hidden/background
      // page, not that the GPU is slow, so they are ignored.
      const gap = now - last
      if (last && gap < 100 && document.visibilityState === 'visible') {
        acc += gap
        frames++
        if (frames >= 40) {
          const avg = acc / frames
          if (avg > target * 1.26 && scale > MIN_SCALE) scale = Math.max(MIN_SCALE, scale * 0.85)
          else if (avg < target * 0.84 && scale < maxScale) scale = Math.min(maxScale, scale * 1.06)
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

    const start = () => {
      if (gl) return
      canvas = document.createElement('canvas')
      canvas.className = 'shader-canvas'
      wrap.appendChild(canvas)
      gl = canvas.getContext('webgl2', CONTEXT_ATTRS)
      if (!gl) {
        setError('WebGL2 is not available')
        release()
        return
      }
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault()
        release()
        setTimeout(() => visible && start(), 1000)
      })
      setupQuad(gl)
      try {
        prog = createProgram(gl, frag)
      } catch (e) {
        console.error('[shader]', e.message)
        setError(e.message)
        release()
        return
      }
      setError(null)
      if (reduce) {
        if (cssW && cssH) renderOnce(performance.now())
      } else {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }

    let visible = false
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) start()
        else release()
      },
      { rootMargin: '150px' },
    )
    const ro = new ResizeObserver(([entry]) => {
      cssW = entry.contentRect.width
      cssH = entry.contentRect.height
      if (reduce && gl && prog) renderOnce(performance.now())
    })
    io.observe(wrap)
    ro.observe(wrap)
    return () => {
      io.disconnect()
      ro.disconnect()
      release()
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

/** A single static frame of one layer, via the shared off-screen renderer. */
export function ShaderStill({ frag, layer = -1, time = 14, par, maxScale = 2 }) {
  const ref = useRef(null)
  const [error, setError] = useState(null)
  const px = par?.[0] ?? 0
  const py = par?.[1] ?? 0
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const r = canvas.getBoundingClientRect()
      const s = Math.min(window.devicePixelRatio || 1, maxScale)
      const w = Math.max(1, Math.round(r.width * s))
      const h = Math.max(1, Math.round(r.height * s))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      setError(renderToCanvas2D(frag, canvas, { layer, time, par: [px, py] }))
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
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
