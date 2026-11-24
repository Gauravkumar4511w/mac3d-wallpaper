import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { SCENES, loadWorld, useWorld, prefetchWorlds } from './scenes.jsx'
import { SceneView, LayerView, MacScreen, usePauseOffscreen } from './SceneView.jsx'
import { ShaderStill } from './gl/ShaderCanvas.jsx'
import { renderStillBlob } from './gl/runtime.js'
import './App.css'

/* ---------- global cursor parallax (with a gentle autopilot when idle) ---------- */
function useGlobalTilt() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    let last = -1e9
    let raf = 0
    // Only tilt what's on screen: each update restyles the element.
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target)
          else visible.delete(e.target)
        }
      },
      { rootMargin: '100px' },
    )
    for (const el of document.querySelectorAll('[data-gtilt]')) io.observe(el)
    const onMove = (e) => {
      if (e.pointerType === 'touch') return
      tx = (e.clientX / innerWidth) * 2 - 1
      ty = (e.clientY / innerHeight) * 2 - 1
      last = performance.now()
    }
    const loop = (t) => {
      if (t - last > 2600) {
        tx = Math.sin(t / 2300) * 0.65
        ty = Math.cos(t / 3100) * 0.4
      }
      cx += (tx - cx) * 0.07
      cy += (ty - cy) * 0.07
      const x = cx.toFixed(4)
      const y = cy.toFixed(4)
      for (const el of visible) {
        el.style.setProperty('--px', x)
        el.style.setProperty('--py', y)
      }
      raf = requestAnimationFrame(loop)
    }
    addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      removeEventListener('pointermove', onMove)
    }
  }, [])
}

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.15 },
    )
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/* ---------- small pieces ---------- */
const Logo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" className="logo-mark">
    <path d="M16 3.5 28.5 10 16 16.5 3.5 10Z" style={{ fill: 'var(--accent)' }} />
    <path d="M3.5 15.8 16 22.3 28.5 15.8" fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M3.5 21.6 16 28.1 28.5 21.6" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
)

const Arrow = ({ dir = 'right' }) => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}>
    <path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 3v12m0 0-5-5m5 5 5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CtaButtons = ({ center = false }) => (
  <div className={`store-row ${center ? 'center' : ''}`}>
    <a className="btn primary" href="downloads/mac3D-Wallpaper.dmg" download>
      <DownloadIcon />
      Download for Mac
    </a>
    <a className="btn ghost" href="#worlds">
      Browse the worlds
    </a>
  </div>
)

function MacBook({ scene }) {
  return (
    <div className="macbook">
      <div className="mac-lid">
        <MacScreen scene={scene} />
        <span className="cam" />
        <span className="glare" />
      </div>
      <div className="mac-base">
        <span className="lip" />
      </div>
    </div>
  )
}

/* ---------- light / dark theme ---------- */
function applyTheme(theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0b10' : '#f5f3ee')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* storage blocked — the toggle still works for this visit */
  }
}

function ThemeToggle({ theme, setTheme }) {
  const dark = theme === 'dark'
  const toggle = (e) => {
    const swap = () => {
      // read the live theme (not this render's) so rapid clicks never drift out of sync
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      flushSync(() => setTheme(next))
    }
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      swap()
      return
    }
    // Reveal the new theme as a circle growing out of the button.
    const r = e.currentTarget.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    document.startViewTransition(swap).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
  }
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <svg className="moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4 8.2 8.2 0 1 0 20 14.6Z" fill="currentColor" />
      </svg>
      <svg className="sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

/* ---------- hover parallax for cards ---------- */
function cardMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
  e.currentTarget.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
}
function cardLeave(e) {
  e.currentTarget.style.setProperty('--px', 0)
  e.currentTarget.style.setProperty('--py', 0)
}

/* ---------- true 8K still export (7680x4800, 16:10) ---------- */
function Download8K({ scene, className = '' }) {
  const [state, setState] = useState({ phase: 'idle', pct: 0 })
  const run = async () => {
    if (state.phase === 'busy') return
    setState({ phase: 'busy', pct: 0 })
    try {
      const world = await loadWorld(scene)
      const blob = await renderStillBlob(world.frag, 7680, 4800, {
        time: world.stillTime ?? 14,
        onProgress: (p) => setState({ phase: 'busy', pct: Math.round(p * 100) }),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mac3d-${scene.id}-8k.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setState({ phase: 'done', pct: 100 })
      setTimeout(() => setState({ phase: 'idle', pct: 0 }), 2500)
    } catch (e) {
      console.error(e)
      setState({ phase: 'error', pct: 0, msg: e.message })
    }
  }
  const label =
    state.phase === 'busy'
      ? `Rendering 8K… ${state.pct}%`
      : state.phase === 'done'
        ? 'Saved 8K ✓'
        : state.phase === 'error'
          ? '8K not supported here'
          : 'Download 8K still'
  return (
    <button
      type="button"
      className={`dl8k ${state.phase} ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        run()
      }}
      title={state.phase === 'error' ? state.msg : '7680 × 4800 PNG, rendered on your GPU'}
      style={{ '--pct': `${state.pct}%` }}
    >
      <DownloadIcon />
      {label}
    </button>
  )
}

/* ---------- sections ---------- */
function Nav({ theme, setTheme }) {
  return (
    <header className="nav">
      <a className="brand" href="#top">
        <Logo />
        <span>mac3D Wallpaper</span>
      </a>
      <nav className="nav-links" aria-label="Primary">
        <a href="#ultra">Ultra-real</a>
        <a href="#worlds">Worlds</a>
        <a href="#anatomy">How it works</a>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="nav-actions">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <a className="btn small primary" href="#download">
          Download
        </a>
      </div>
    </header>
  )
}

function Hero({ scene, idx, setIdx }) {
  const go = (d) => setIdx((idx + d + SCENES.length) % SCENES.length)
  const planes = scene.layers.filter((l) => !l.clock)
  const near = planes.at(-2) ?? planes.at(-1)

  return (
    <section className="hero" id="top">
      <div className="hero-bg" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="floor" />
      </div>

      <div className="hero-copy">
        <span className="eyebrow">
          <i /> New for macOS · Depth Clock
        </span>
        <h1>
          Your desktop,
          <br />
          <em>with depth.</em>
        </h1>
        <p className="lede">
          mac3D Wallpaper turns your desktop into a living diorama — hand-built 3D worlds that follow your cursor, change
          with the time of day, and go to sleep whenever you can’t see them.
        </p>
        <CtaButtons center />
        <p className="req">Free · macOS 13 Ventura or later · Apple silicon &amp; Intel</p>
      </div>

      <div className="hero-stage" data-gtilt>
        <div className="stage-glow" />
        <div className="chip c1">
          <span className="dot" /> cursor · live
        </div>
        <div className="chip c2">
          z <b>{near.depth.toFixed(2)}</b> · {near.name.toLowerCase()}
        </div>
        <div className="chip c3">{scene.layers.length} planes</div>
        <MacBook scene={scene} />
        <div className="switcher">
          <button type="button" onClick={() => go(-1)} aria-label="Previous world">
            <Arrow dir="left" />
          </button>
          <div className="switcher-name">
            <span>
              {String(idx + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
            </span>
            <b>{scene.name}</b>
          </div>
          <button type="button" onClick={() => go(1)} aria-label="Next world">
            <Arrow />
          </button>
        </div>
        <p className="hint">Move your cursor — the world moves with it</p>
        {scene.shader && <Download8K scene={scene} className="hero-dl" />}
      </div>
    </section>
  )
}

function Marquee() {
  const items = ['Cursor parallax', 'Depth Clock', 'Time-of-day worlds', '8K stills', 'Every display', 'Menu bar app', 'Apple silicon native', 'Works offline']
  const row = items.map((t) => (
    <span key={t}>
      {t}
      <i>✦</i>
    </span>
  ))
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row}
        {row}
      </div>
    </div>
  )
}

function Ultra({ idx, setIdx }) {
  return (
    <section className="section" id="ultra">
      <div className="section-head" data-reveal>
        <span className="kicker">01 — Ultra-real</span>
        <h2>
          Real worlds. <span className="dim">Rendered live, saved in 8K.</span>
        </h2>
        <p>
          No videos, no photos. Every pixel is computed live on your Mac’s GPU, so nothing loops or repeats — and any
          moment saves as a true 7680×4800 still.
        </p>
      </div>
      <div className="ultra-grid" data-reveal>
        {SCENES.map((s, i) =>
          s.realistic ? (
            <article
              key={s.id}
              className={`ultra-card ${i === idx ? 'on' : ''}`}
              style={{ '--wa': s.accent }}
              onPointerMove={cardMove}
              onPointerLeave={cardLeave}
            >
              <button type="button" className="ultra-screen" onClick={() => setIdx(i)} aria-label={`Put ${s.name} on the desktop`}>
                <SceneView scene={s} clock={false} />
                <span className="ultra-badge">
                  <i /> Live · GPU · 8K
                </span>
              </button>
              <div className="ultra-info">
                <div>
                  <b>{s.name}</b>
                  <span>
                    {s.tag} · {s.layers.length - 1} depth layers
                  </span>
                </div>
                <div className="ultra-actions">
                  <button type="button" className={`btn small ${i === idx ? 'primary' : 'ghost'}`} onClick={() => setIdx(i)}>
                    {i === idx ? 'On your desktop' : 'Set as desktop'}
                  </button>
                  <Download8K scene={s} />
                </div>
              </div>
            </article>
          ) : null,
        )}
      </div>
    </section>
  )
}

function Worlds({ idx, setIdx }) {
  return (
    <section className="section" id="worlds">
      <div className="section-head" data-reveal>
        <span className="kicker">02 — Worlds</span>
        <h2>
          Pick a world. <span className="dim">Hover to look inside.</span>
        </h2>
        <p>Every scene is composed by hand, plane by plane. Click one to try it on — the whole page follows.</p>
      </div>
      <div className="worlds" data-reveal>
        {SCENES.map((s, i) => s.realistic ? null : (
          <button
            type="button"
            key={s.id}
            className={`world ${i === idx ? 'on' : ''}`}
            style={{ '--wa': s.accent }}
            onPointerMove={cardMove}
            onPointerLeave={cardLeave}
            onClick={() => setIdx(i)}
            aria-pressed={i === idx}
          >
            <div className="world-screen">
              <SceneView scene={s} clock={false} />
              <span className="world-badge">{i === idx ? 'On your desktop' : 'Try it'}</span>
              {s.isNew && <span className="world-new">New · alive</span>}
            </div>
            <div className="world-info">
              <b>{s.name}</b>
              <span>
                {s.tag} · {s.layers.length} planes
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function Anatomy({ scene: meta }) {
  const ref = useRef(null)
  const stageRef = useRef(null)
  usePauseOffscreen(stageRef)
  const scene = useWorld(meta) ?? meta
  useEffect(() => {
    const el = ref.current
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const total = r.height - innerHeight
      const raw = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1
      const t = Math.min(1, Math.max(0, (raw - 0.05) / 0.6))
      el.style.setProperty('--p', (t * t * (3 - 2 * t)).toFixed(4))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const n = scene.layers.length
  return (
    <section className="anatomy" id="anatomy" ref={ref}>
      <div className="anatomy-sticky" data-gtilt>
        <div className="anatomy-copy">
          <span className="kicker">03 — How it works</span>
          <h2>
            Not a picture.
            <br />
            <em>A place.</em>
          </h2>
          <p>
            Each world is {n} separate planes, set at their own depth. As your cursor moves, the app slides them at
            different speeds — near things move more, far things barely at all. Your brain does the rest.
          </p>
          <ol className="legend">
            {scene.layers.map((l, i) => (
              <li key={l.name} style={{ '--i': i }}>
                <span className="z">z{i}</span>
                <span className="lname">{l.name}</span>
                <span className="bar">
                  <span style={{ width: `${Math.max(4, (l.depth / 1.3) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="anatomy-stage" ref={stageRef}>
          <div className="stack" style={{ '--n': n }}>
            {scene.layers.map((l, i) => (
              <div className="plane" key={`${scene.id}-${l.name}`} style={{ '--i': i }}>
                <div className="scene plane-scene" style={{ background: l.sky ? scene.sky : undefined }}>
                  {scene.shader && !l.clock ? (
                    scene.frag && <ShaderStill frag={scene.frag} layer={l.gl} />
                  ) : (
                    <div className="layer flat">
                      <LayerView layer={l} scene={scene} />
                    </div>
                  )}
                </div>
                <span className="plane-label">
                  z{i} · {l.name}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="scroll-cue">Scroll to pull it apart</p>
      </div>
    </section>
  )
}

function Features({ scene }) {
  return (
    <section className="section" id="features">
      <div className="section-head" data-reveal>
        <span className="kicker">04 — Features</span>
        <h2>
          Flat screen. <span className="dim">Endless room.</span>
        </h2>
      </div>
      <div className="bento">
        <article className="card span-4 cursor-card" data-reveal>
          <div className="cursor-visual">
            <div className="mini-screen">
              <SceneView key={scene.id} scene={scene} clock={false} />
            </div>
            <svg className="pointer" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3 19 12l-6.5 1.6L9.6 20Z" fill="#fff" stroke="#14121a" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="card-copy">
            <h3>Cursor parallax</h3>
            <p>Planes follow your pointer, near ones more than far. Movement is capped and eased, so it feels calm — never seasick. Turn it from subtle to strong, or off.</p>
          </div>
        </article>

        <article className="card span-2 energy-card" data-reveal>
          <span className="big-num">
            &lt;1<small>% CPU</small>
          </span>
          <h3>Sleeps when hidden</h3>
          <p>While windows or full-screen apps cover the desktop, the screen is locked or your Mac is in Low Power Mode, the animation stops.</p>
          <div className="meter">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
              <span key={k} className={k <= 1 ? 'on' : ''} />
            ))}
          </div>
        </article>

        <article className="card span-2" data-reveal>
          <div className="time-visual">
            <span className="sun-arc" />
          </div>
          <h3>Time-of-day worlds</h3>
          <p>Alpine peaks at dawn, golden dunes by late afternoon, a neon city at night — the app picks the world for your hour.</p>
        </article>

        <article className="card span-2" data-reveal>
          <div className="clock-visual">
            <span>9:41</span>
            <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 80 L0 52 L30 30 L52 46 L80 14 L104 40 L128 26 L160 50 L200 34 L200 80 Z" />
            </svg>
          </div>
          <h3>Depth Clock</h3>
          <p>A big desktop clock that lives inside the scene — peaks and towers can pass in front of it.</p>
        </article>

        <article className="card span-2 make-card" data-reveal>
          <div className="make-visual">
            <span className="sheet s1" />
            <span className="sheet s2" />
            <span className="sheet s3" />
          </div>
          <h3>16 hand-built worlds</h3>
          <p>Twelve drawn plane by plane, four rendered live on the GPU — reefs, cities, deserts, deep space. One click to switch.</p>
        </article>

        <article className="card span-6 spec-strip" data-reveal>
          <div>
            <b>Any resolution</b>
            <span>drawn live — never a stretched video</span>
          </div>
          <div>
            <b>Every display</b>
            <span>on each screen and every Space</span>
          </div>
          <div>
            <b>Menu bar</b>
            <span>switch worlds in a single click</span>
          </div>
          <div>
            <b>Private</b>
            <span>no account, no tracking, works offline</span>
          </div>
        </article>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section className="section" id="pricing">
      <div className="section-head center" data-reveal>
        <span className="kicker">05 — Pricing</span>
        <h2>Free to download. Every world included.</h2>
      </div>
      <div className="pricing" data-reveal>
        <article className="plan">
          <h3>Free</h3>
          <p className="price">
            $0<span>forever</span>
          </p>
          <ul>
            <li>All 16 hand-built worlds</li>
            <li>Cursor parallax &amp; Depth Clock</li>
            <li>Time-of-day worlds</li>
            <li>Every display &amp; Space</li>
          </ul>
          <a className="btn primary wide" href="downloads/mac3D-Wallpaper.dmg" download>
            Download free
          </a>
        </article>
        <article className="plan pro soon">
          <span className="ribbon">Coming soon</span>
          <h3>mac3D Wallpaper Pro</h3>
          <p className="price">
            $14.99<span>one-time, at launch</span>
          </p>
          <ul>
            <li>New worlds as they’re made</li>
            <li>Make your own from photos</li>
            <li>A different world on each display</li>
          </ul>
          <span className="btn ghost wide" aria-disabled="true">
            Not available yet
          </span>
        </article>
      </div>
    </section>
  )
}

function Faq() {
  const qs = [
    ['Will it slow down my Mac?', 'It stays out of the way. Animation stops whenever windows or full-screen apps cover the desktop, the screen is locked, or your Mac is in Low Power Mode — then it uses under 1% CPU. GPU worlds draw at a gentle 30 fps, and you can pause everything from the menu bar.'],
    ['Which Macs are supported?', 'Any Mac running macOS 13 Ventura or later — Apple silicon and Intel. It’s a native universal app.'],
    ['Does it work with multiple displays?', 'Yes. Every connected display gets the wallpaper, on every Space, and it adjusts when you plug a screen in or out. (A different world per display is planned for Pro.)'],
    ['Can I turn the motion down?', 'Yes. Set parallax to Off, Subtle, Normal or Strong, or pause the animation from the menu bar. With macOS Reduce Motion on, the scene holds still.'],
    ['Does it need the internet?', 'No. Every world is built into the app — no account, no tracking, nothing downloaded after install.'],
  ]
  return (
    <section className="section faq" id="faq">
      <div className="section-head" data-reveal>
        <span className="kicker">06 — FAQ</span>
        <h2>Questions, answered.</h2>
      </div>
      <div className="faq-list" data-reveal>
        {qs.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <span className="plus" aria-hidden="true" />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function FinalCta({ idx }) {
  const L = SCENES[(idx + SCENES.length - 1) % SCENES.length]
  const C = SCENES[idx]
  const R = SCENES[(idx + 1) % SCENES.length]
  return (
    <section className="section" id="download">
      <div className="final" data-reveal data-gtilt>
        <div className="final-copy">
          <h2>
            Your desktop has been flat <em>long enough.</em>
          </h2>
          <p>A free download for macOS. Ten seconds to install — a lot longer to stop moving your cursor around.</p>
          <CtaButtons center />
        </div>
        <div className="trio" aria-hidden="true">
          <div className="display d-l">
            <MacScreen scene={L} chrome={false} clock={false} />
          </div>
          <div className="display d-c">
            <MacScreen scene={C} chrome={false} />
          </div>
          <div className="display d-r">
            <MacScreen scene={R} chrome={false} clock={false} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <a className="brand" href="#top">
        <Logo />
        <span>mac3D Wallpaper</span>
      </a>
      <nav aria-label="Footer">
        <a href="#worlds">Worlds</a>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">Privacy</a>
        <a href="#faq">Press kit</a>
      </nav>
      <small>© 2026 mac3D Wallpaper. Made with a lot of layers.</small>
    </footer>
  )
}

export default function App() {
  const [idx, setIdx] = useState(0)
  const scene = SCENES[idx]
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  useGlobalTilt()
  useReveal()
  useEffect(prefetchWorlds, [])

  return (
    <div
      className="app"
      style={{
        '--accent': scene.accent,
        '--accent-2': scene.accent2,
        '--glow': scene.glow,
        // the deep "ink" tones are tuned for a light page; on dark, the brighter accent reads better
        '--ink': theme === 'dark' ? scene.accent : scene.ink,
      }}
    >
      <div className="grain" aria-hidden="true" />
      <Nav theme={theme} setTheme={setTheme} />
      <main>
        <Hero scene={scene} idx={idx} setIdx={setIdx} />
        <Ultra idx={idx} setIdx={setIdx} />
        <Marquee />
        <Worlds idx={idx} setIdx={setIdx} />
        <Anatomy scene={scene} />
        <Features scene={scene} />
        <Pricing />
        <Faq />
        <FinalCta idx={idx} />
      </main>
      <Footer />
    </div>
  )
}
