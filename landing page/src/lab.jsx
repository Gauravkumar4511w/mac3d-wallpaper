// Dev-only shader lab: http://localhost:<port>/lab.html?world=<id>
//
// Query params
//   world=<id>      file in src/gl/worlds/<id>.js (or "example")
//   layer=<k>       render only depth-layer k (default -1 = full scene)
//   layers=1        grid of every layer on a checkerboard (checks isolation)
//   t=<seconds>     freeze time (for repeatable screenshots)
//   par=<x>,<y>     fixed parallax in [-1,1] (default: follow the mouse)
//   snap=1          draw ONE frame synchronously (reliable headless screenshots)
//   bench=1         time the full scene at 2560x1600 on the GPU (ms per frame)
//
// The #status element carries data-ready / data-error / data-fps so headless
// tools can read results with --dump-dom.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ShaderCanvas, ShaderStill } from './gl/ShaderCanvas.jsx'
import { benchFrames } from './gl/runtime.js'

const loaders = import.meta.glob('./gl/worlds/*.js')
loaders['./gl/example.js'] = () => import('./gl/example.js')

const q = new URLSearchParams(location.search)
const id = q.get('world') || 'example'
const layer = q.has('layer') ? Number(q.get('layer')) : -1
const time = q.has('t') ? Number(q.get('t')) : undefined
const par = q.has('par') ? q.get('par').split(',').map(Number) : undefined
const grid = q.get('layers') === '1'
const bench = q.get('bench') === '1'
const snap = q.get('snap') === '1' || grid || bench

const checker = {
  backgroundColor: '#888',
  backgroundImage:
    'linear-gradient(45deg,#666 25%,transparent 25%),linear-gradient(-45deg,#666 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#666 75%),linear-gradient(-45deg,transparent 75%,#666 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
}

function Lab() {
  const [world, setWorld] = useState(null)
  const key = id === 'example' ? './gl/example.js' : `./gl/worlds/${id}.js`
  const [loadErr, setLoadErr] = useState(() =>
    loaders[key] ? null : `No world "${id}". Available: ${Object.keys(loaders).join(', ')}`,
  )
  const [stats, setStats] = useState(null)
  const [shaderErr, setShaderErr] = useState(null)
  const [benchRes, setBenchRes] = useState(null)

  useEffect(() => {
    if (!bench || !world) return
    let alive = true
    benchFrames(world.frag)
      .then((r) => alive && setBenchRes(`bench ${r.w}×${r.h}: avg ${r.avg.toFixed(2)} ms · median ${r.median.toFixed(2)} ms per frame`))
      .catch((e) => alive && setBenchRes(`bench failed: ${e.message}`))
    return () => {
      alive = false
    }
  }, [world])

  useEffect(() => {
    const load = loaders[key]
    if (!load) return
    load()
      .then((m) => setWorld(m.default))
      .catch((e) => setLoadErr(String(e)))
  }, [key])

  // surface compile errors that ShaderCanvas reports on its wrapper
  useEffect(() => {
    const t = setInterval(() => {
      const el = document.querySelector('[data-shader-error]')
      setShaderErr(el ? el.getAttribute('title') : null)
    }, 300)
    return () => clearInterval(t)
  }, [])

  const error = loadErr || shaderErr
  const status = error
    ? `ERROR: ${error}`
    : world
      ? `${world.name} · layer ${layer} · ${bench ? benchRes || 'benchmarking…' : snap ? `snapshot t=${time ?? 14}` : stats ? `${stats.fps} fps · ${stats.w}×${stats.h} · scale ${stats.scale.toFixed(2)}` : 'starting…'}`
      : 'loading…'

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <div
        id="status"
        data-ready={world && (bench ? benchRes : snap || stats) ? '' : undefined}
        data-error={error || undefined}
        data-fps={stats?.fps}
        style={{ padding: '6px 10px', whiteSpace: 'pre-wrap', color: error ? '#ff8080' : '#bdb8c8' }}
      >
        {status}
      </div>
      {world && !grid && (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
          <div style={{ width: 'min(100vw, 160vh - 48px)', aspectRatio: '16 / 10', position: 'relative', ...(layer >= 0 ? checker : null) }}>
            {snap ? (
              <ShaderStill frag={world.frag} layer={layer} time={time ?? 14} par={par} />
            ) : (
              <ShaderCanvas frag={world.frag} layer={layer} time={time} par={par} onStats={setStats} fallback={layer >= 0 ? undefined : world.sky} />
            )}
          </div>
        </div>
      )}
      {world && grid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 8, alignContent: 'start' }}>
          {world.layers.map((l, k) => (
            <figure key={l.name} style={{ margin: 0 }}>
              <div style={{ aspectRatio: '16 / 10', position: 'relative', ...checker }}>
                <ShaderStill frag={world.frag} layer={k} time={time ?? 14} par={par} maxScale={1} />
              </div>
              <figcaption>
                {k} · {l.name} (depth {l.depth})
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
