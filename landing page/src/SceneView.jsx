import { useEffect, useRef, useState } from 'react'
import { ShaderCanvas } from './gl/ShaderCanvas.jsx'
import { useWorld } from './scenes.jsx'

/*
 * Animation budget. Each living world runs ~165 CSS animations on SVG
 * elements, and those tick on the main thread (SVG transforms can't be
 * composited), so cost grows linearly with the number of worlds playing.
 * Nine at once in the Worlds grid drops even an M2 to ~30 fps.
 *
 * So every scene registers here and only the `budget` highest-priority visible
 * ones animate; the rest hold their current frame ([data-paused] in App.css)
 * and resume, without a jump, when they win a slot again. Priority: the scene
 * under the cursor, then how much of it is on screen and how close it sits to
 * the middle of the viewport.
 *
 * The budget adapts to the machine: when frames run long while every slot is
 * in use it gives one up (down to 1), and only takes it back after a calm
 * spell, so older or busier Macs stay smooth instead of stuttering.
 */
const MAX_BUDGET = 4
const MIN_BUDGET = 1
let budget = MAX_BUDGET
const scenes = new Map() // element -> { ratio, hover }
let io = null
let raf = 0

function governor() {
  let warm = performance.now() + 2500 // let the page settle after load first
  let last = 0
  let hold = 0
  let since = 0
  let slow = 0
  let frames = []
  // a world's art just arrived and is mounting: skip that hitch
  addEventListener('world-mount', () => {
    warm = Math.max(warm, performance.now() + 1500)
    frames = []
    slow = 0
  })
  const tick = (t) => {
    const dt = t - last
    last = t
    // ignore gaps from hidden tabs or stalls unrelated to steady-state cost
    if (t > warm && dt > 0 && dt < 250) frames.push(dt)
    if (frames.length === 1) since = t
    // judge about once a second (or every 60 frames on fast displays)
    if (frames.length >= 60 || (frames.length >= 8 && t - since > 1000)) {
      frames.sort((a, b) => a - b)
      const median = frames[frames.length >> 1]
      frames = []
      let playing = 0
      for (const el of scenes.keys()) if (!('paused' in el.dataset)) playing++
      // two slow seconds in a row (not a one-off hitch) with every slot in use
      slow = median > 24 && playing >= budget ? slow + 1 : 0
      if (slow >= 2 && budget > MIN_BUDGET) {
        budget--
        slow = 0
        hold = t + 10000
        schedule()
      } else if (median < 18 && budget < MAX_BUDGET && t > hold) {
        budget++
        schedule()
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(rebalance)
}

function rebalance() {
  raf = 0
  const mid = innerHeight / 2
  const ranked = []
  for (const [el, s] of scenes) {
    if (s.ratio <= 0) continue
    const r = el.getBoundingClientRect()
    const off = Math.min(1, Math.abs(r.top + r.height / 2 - mid) / innerHeight)
    ranked.push([el, (s.hover ? 10 : 0) + s.ratio * (1 - 0.6 * off)])
  }
  ranked.sort((a, b) => b[1] - a[1])
  const play = new Set(ranked.slice(0, budget).map(([el]) => el))
  for (const el of scenes.keys()) {
    if (play.has(el)) {
      if ('paused' in el.dataset) delete el.dataset.paused
    } else if (!('paused' in el.dataset)) el.dataset.paused = ''
  }
}

function observer() {
  if (io) return io
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = scenes.get(e.target)
        if (s) s.ratio = e.isIntersecting ? Math.max(e.intersectionRatio, 0.01) : 0
      }
      schedule()
    },
    { rootMargin: '120px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  )
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  governor()
  return io
}

/** Register `ref` with the animation budget (pauses it off-screen or when out-budgeted). */
export function usePauseOffscreen(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const s = { ratio: 0, hover: false }
    scenes.set(el, s)
    el.dataset.paused = ''
    const enter = () => {
      s.hover = true
      schedule()
    }
    const leave = () => {
      s.hover = false
      schedule()
    }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    observer().observe(el)
    return () => {
      io.unobserve(el)
      scenes.delete(el)
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
      schedule()
    }
  }, [ref])
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  return now
}

const hm = (now) => `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`

export function LockClock({ color }) {
  const now = useNow()
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="lock-clock" style={{ color }}>
      <span className="lock-date">{date}</span>
      <span className="lock-time">{hm(now)}</span>
    </div>
  )
}

export function LayerView({ layer, scene }) {
  if (layer.clock) return <LockClock color={scene.clockColor} />
  return layer.el
}

/** True once `ref` comes within ~1.5 screens of the viewport (stays true). */
function useNear(ref) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '150% 0%' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, near])
  return near
}

export function SceneView({ scene: meta, clock = true, className = '', gpu }) {
  const ref = useRef(null)
  usePauseOffscreen(ref)
  // Until the world's art chunk arrives, render its sky and clock only.
  const scene = useWorld(meta, useNear(ref)) ?? meta
  if (scene.shader) {
    // GPU world: the shader draws (and parallaxes) every layer itself; only the
    // clock is a DOM layer, drifting at its own depth.
    const clk = scene.layers.find((l) => l.clock)
    return (
      <div ref={ref} className={`scene ${className}`} style={{ background: scene.sky }}>
        {scene.frag && <ShaderCanvas frag={scene.frag} fallback={scene.sky} {...gpu} />}
        {clock && clk && (
          <div className="layer" style={{ '--d': clk.depth }}>
            <LockClock color={scene.clockColor} />
          </div>
        )}
      </div>
    )
  }
  return (
    <div ref={ref} className={`scene ${className}`}>
      {scene.layers.map((l) =>
        l.clock && !clock ? null : (
          <div
            key={l.name}
            className="layer"
            style={{ '--d': l.depth, background: l.sky ? scene.sky : undefined }}
          >
            <LayerView layer={l} scene={scene} />
          </div>
        ),
      )}
    </div>
  )
}

function MenuBar({ light }) {
  const now = useNow()
  const day = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className={`menubar ${light ? 'on-light' : ''}`}>
      <span className="mb-left">
        <b>mac3D Wallpaper</b>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Window</span>
      </span>
      <span className="mb-right">
        <span className="mb-icon layers" />
        <span className="mb-icon wifi" />
        <span className="mb-icon batt" />
        <span>
          {day} {hm(now)}
        </span>
      </span>
    </div>
  )
}

const DOCK = [
  'linear-gradient(160deg,#6ec3ff,#2a6df4)',
  'linear-gradient(160deg,#ffffff,#d9dde6)',
  'linear-gradient(160deg,#7ef29a,#1fb35a)',
  'linear-gradient(160deg,#ffd36e,#ff8a3d)',
  'linear-gradient(160deg,#ff8db0,#e5395f)',
  'linear-gradient(160deg,#c3a6ff,#7546f0)',
  'linear-gradient(160deg,#4b4b55,#1d1d24)',
]

function Dock({ accent }) {
  return (
    <div className="dock">
      {DOCK.map((bg) => (
        <span key={bg} className="dock-app" style={{ background: bg }} />
      ))}
      <span className="dock-sep" />
      <span className="dock-app brand-app" style={{ '--a': accent }}>
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 6 26 11 16 16 6 11Z" fill="#fff" />
          <path d="M6 16 16 21 26 16M6 21 16 26 26 21" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  )
}

/** A Mac desktop: layered wallpaper plus optional menu bar and dock. */
export function MacScreen({ scene, chrome = true, clock = true }) {
  return (
    <div className="mac-screen">
      <SceneView key={scene.id} scene={scene} clock={clock} className="fade-in" />
      {chrome && <MenuBar light={scene.light} />}
      {chrome && <Dock accent={scene.accent} />}
    </div>
  )
}
