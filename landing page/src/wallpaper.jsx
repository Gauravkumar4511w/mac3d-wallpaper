// The desktop wallpaper rendered by the macOS app (mac app/): one world,
// full screen, with the Depth Clock. The app drives it through window.mac3d:
//
//   mac3d.setWorld(id)        switch world (cross-fades)
//   mac3d.setClock(bool)      show / hide the Depth Clock
//   mac3d.setPaused(bool)     freeze every animation (CSS and GPU)
//   mac3d.setParallax(n)      parallax strength, 0 = off, 1 = normal
//   mac3d.pointer(x, y)       cursor position on this display, -1..1 each axis
//
// and hears back via webkit.messageHandlers.mac3d: { type: 'ready', worlds }
// once loaded, { type: 'gpu-slow' } when a GPU world is too heavy for this Mac,
// and { type: 'error', message } for script errors.
// Query params give the initial state: ?world=<id>&clock=0|1&parallax=<n>.
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SCENES, loadWorld } from './scenes.jsx'
import { SceneView } from './SceneView.jsx'
import './index.css'
import './App.css'
import './wallpaper.css'

const post = (msg) => window.webkit?.messageHandlers?.mac3d?.postMessage(msg)
addEventListener('error', (e) => post({ type: 'error', message: `${e.message} (${e.filename}:${e.lineno})` }))
addEventListener('unhandledrejection', (e) => post({ type: 'error', message: String(e.reason?.stack || e.reason) }))

const q = new URLSearchParams(location.search)
const byId = (id) => SCENES.find((s) => s.id === id) ?? SCENES.find((s) => !s.shader) ?? SCENES[0]
const first = byId(q.get('world'))
// GPU worlds on the desktop: 30 fps at up to 1.5× is indistinguishable for slow
// ambient scenes and uses about half the GPU of 60 fps at 2×.
const GPU = { maxFps: 30, maxScale: 1.5 }

// Cursor parallax: the app sends raw positions; ease toward them here and stop
// the loop once settled, so a still cursor costs nothing.
function useParallax(ref) {
  useEffect(() => {
    const el = ref.current
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    let raf = 0
    const step = () => {
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      el.style.setProperty('--px', cx.toFixed(4))
      el.style.setProperty('--py', cy.toFixed(4))
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.0005 ? requestAnimationFrame(step) : 0
    }
    // macOS Reduce Motion: the scene holds still (App.css stops the CSS
    // animations, ShaderCanvas draws a single frame) and so does the parallax.
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    window.mac3d.pointer = (x, y) => {
      tx = reduce.matches ? 0 : Math.max(-1, Math.min(1, x))
      ty = reduce.matches ? 0 : Math.max(-1, Math.min(1, y))
      if (!raf) raf = requestAnimationFrame(step)
    }
    const settle = () => window.mac3d.pointer(tx, ty)
    reduce.addEventListener('change', settle)
    return () => {
      cancelAnimationFrame(raf)
      reduce.removeEventListener('change', settle)
    }
  }, [ref])
}

function Wallpaper() {
  const ref = useRef(null)
  const [shown, setShown] = useState(() => [{ scene: first, key: 0 }])
  const [clock, setClock] = useState(q.get('clock') !== '0')
  const [paused, setPaused] = useState(false)
  const [strength, setStrength] = useState(() => Number(q.get('parallax') ?? 1))
  useParallax(ref)

  useEffect(() => {
    let key = 0
    Object.assign(window.mac3d, {
      setClock: (on) => setClock(!!on),
      setPaused: (on) => setPaused(!!on),
      setParallax: (n) => setStrength(Number(n) || 0),
      setWorld: async (id) => {
        const scene = byId(id)
        await loadWorld(scene) // swap only once its art is here: no empty frame
        key += 1
        const k = key
        setShown((list) => (list.at(-1).scene.id === scene.id ? list : [list.at(-1), { scene, key: k }]))
        setTimeout(() => setShown((list) => list.filter((s) => s.key >= k)), 1300)
      },
    })
    // A GPU world that this Mac can't keep up with holds a still frame and
    // says so; the app then prefers the lighter SVG worlds.
    const slow = () => post({ type: 'gpu-slow' })
    addEventListener('gpu-slow', slow)
    loadWorld(first).then(() =>
      post({
        type: 'ready',
        worlds: SCENES.map(({ id, name, tag, shader, isNew }) => ({ id, name, tag, kind: shader ? 'gpu' : isNew ? 'new' : 'classic' })),
      }),
    )
    return () => removeEventListener('gpu-slow', slow)
  }, [])

  return (
    <div ref={ref} className="wallpaper" data-paused={paused ? '' : undefined} style={{ '--strength': strength }}>
      {shown.map(({ scene, key }, i) => (
        <SceneView
          key={key}
          scene={scene}
          clock={clock}
          gpu={GPU}
          className={shown.length > 1 ? (i === shown.length - 1 ? 'entering' : 'leaving') : ''}
        />
      ))}
    </div>
  )
}

window.mac3d = window.mac3d || {}
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Wallpaper />
  </StrictMode>,
)
