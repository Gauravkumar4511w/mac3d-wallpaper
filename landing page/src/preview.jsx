// Dev-only preview for the SVG/CSS worlds: http://localhost:<port>/preview.html?world=<file>
//
// Query params
//   world=<file>    file in src/worlds/<file>.jsx (default export is the world)
//   mode=full       the world filling the window, with the depth clock (default)
//   mode=card       the world at Worlds-grid card size (480 px wide, 16:10)
//   mode=layers     every layer rendered alone on a checkerboard (checks that
//                   only the sky plate is opaque, like the exploded "How it works" view)
//   clock=0         hide the depth clock
//   par=<x>,<y>     fixed parallax in [-1,1] (default: follow the mouse)
//   t=<seconds>     freeze every CSS animation at this time (repeatable screenshots)
//
// #status carries data-ready="1" and data-anims="<count of running animations>".
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SceneView, LayerView } from './SceneView.jsx'
import './index.css'
import './App.css'

const loaders = import.meta.glob('./worlds/*.jsx')
const q = new URLSearchParams(location.search)
const id = q.get('world') || 'blossom'
const mode = q.get('mode') || 'full'
const clock = q.get('clock') !== '0'
const par = q.has('par') ? q.get('par').split(',').map(Number) : null
const time = q.has('t') ? Number(q.get('t')) : null

const checker = {
  backgroundColor: '#888',
  backgroundImage:
    'linear-gradient(45deg,#666 25%,transparent 25%),linear-gradient(-45deg,#666 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#666 75%),linear-gradient(-45deg,transparent 75%,#666 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
}

function usePointerParallax(ref, ready) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (par) {
      el.style.setProperty('--px', par[0])
      el.style.setProperty('--py', par[1])
      return
    }
    el.style.setProperty('--px', 0)
    el.style.setProperty('--py', 0)
    const move = (e) => {
      el.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3))
      el.style.setProperty('--py', ((e.clientY / innerHeight) * 2 - 1).toFixed(3))
    }
    addEventListener('pointermove', move)
    return () => removeEventListener('pointermove', move)
  }, [ref, ready])
}

function Preview() {
  const [world, setWorld] = useState(null)
  const [err, setErr] = useState(() => (loaders[`./worlds/${id}.jsx`] ? null : `No world "${id}". Available: ${Object.keys(loaders).join(', ')}`))
  const [anims, setAnims] = useState(0)
  const ref = useRef(null)
  usePointerParallax(ref, world)

  useEffect(() => {
    const load = loaders[`./worlds/${id}.jsx`]
    if (!load) return
    load()
      .then((m) => setWorld(m.default))
      .catch((e) => setErr(String(e?.stack || e)))
  }, [])

  useEffect(() => {
    if (!world) return
    // Styles settle over a few frames (headless Chrome is slower), so sample
    // a few times and freeze whatever has started by then.
    const tick = () => {
      const list = document.getAnimations()
      if (time != null) {
        for (const a of list) {
          a.pause()
          a.currentTime = time * 1000
        }
      }
      setAnims(list.length)
    }
    const timers = [60, 250, 600, 1200].map((ms) => setTimeout(tick, ms))
    return () => timers.forEach(clearTimeout)
  }, [world])

  const status = (
    <div id="status" data-ready={world ? '1' : '0'} data-anims={anims} data-error={err ? '1' : '0'} style={{ position: 'fixed', right: 8, bottom: 6, font: '11px ui-monospace,monospace', color: '#fff', textShadow: '0 1px 2px #000', zIndex: 9 }}>
      {err ? '' : `${id} · ${anims} animations`}
    </div>
  )
  if (err) return <pre style={{ color: '#ff8080', padding: 20, whiteSpace: 'pre-wrap' }}>{err}{status}</pre>
  if (!world) return status

  if (mode === 'layers') {
    return (
      <div ref={ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 12, background: '#222', minHeight: '100vh', boxSizing: 'border-box' }}>
        {world.layers.map((l) => (
          <div key={l.name} style={{ color: '#ddd', font: '12px ui-monospace,monospace' }}>
            <div style={{ position: 'relative', aspectRatio: '16 / 10', ...checker, overflow: 'hidden' }}>
              <div className="scene" style={{ background: l.sky ? world.sky : 'transparent' }}>
                <div className="layer flat">
                  <LayerView layer={l} scene={world} />
                </div>
              </div>
            </div>
            {l.name} · d={l.depth}
          </div>
        ))}
        {status}
      </div>
    )
  }

  if (mode === 'grid') {
    // n copies at Worlds-grid card size, to measure how a world scales on the page.
    const n = Number(q.get('n') || 9)
    return (
      <div ref={ref} style={{ background: '#f5f3ee', minHeight: '100vh', padding: 20, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'repeat(3, 440px)', gap: 20 }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ aspectRatio: '16 / 10', borderRadius: 18, overflow: 'hidden', '--shift': '-14px' }}>
            <SceneView scene={world} clock={false} />
          </div>
        ))}
        {status}
      </div>
    )
  }

  if (mode === 'card') {
    return (
      <div ref={ref} style={{ background: '#f5f3ee', minHeight: '100vh', padding: 40, boxSizing: 'border-box' }}>
        <div style={{ width: 480, aspectRatio: '16 / 10', borderRadius: 18, overflow: 'hidden', border: '5px solid #fff', boxShadow: '0 20px 50px -20px rgba(0,0,0,.35)', '--shift': '-14px' }}>
          <SceneView scene={world} clock={false} />
        </div>
        {status}
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'fixed', inset: 0 }}>
      <SceneView scene={world} clock={clock} />
      {status}
    </div>
  )
}

// Hot updates of world files can re-run this module; reuse the one root.
const container = document.getElementById('root')
container.__root ??= createRoot(container)
container.__root.render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
