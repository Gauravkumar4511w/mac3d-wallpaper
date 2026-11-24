// Dev-only frame renderer for the landing page's videos and layer images
// (driven by scripts/render-media.mjs through headless Chrome).
//
//   await render.setup(id)   load a world full-viewport, every animation paused
//   render.seek(t)           show the world at t seconds (deterministic)
//   render.layer(k)          show only layer k (index in scene.layers), on a
//                            transparent page; -1 = the full world again
//   await render.webp(png, q) re-encode a PNG data URL as WebP (keeps alpha)
//
// No clock and no parallax: the site overlays its own live clock.
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { SCENES, loadWorld } from './scenes.jsx'
import { LayerView } from './SceneView.jsx'
import { createProgram, drawFrame, setupQuad } from './gl/runtime.js'
import './index.css'
import './App.css'

const root = createRoot(document.getElementById('root'))
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
let world = null
let gl = null
let prog = null
let shown = -1
let time = 0

function SvgWorld({ scene, only }) {
  return (
    <div className="scene" style={{ position: 'fixed', inset: 0, background: 'transparent', '--px': 0, '--py': 0 }}>
      {scene.layers.map((l, i) =>
        l.clock || (only >= 0 && i !== only) ? null : (
          <div key={l.name} className="layer" style={{ '--d': l.depth, background: l.sky ? scene.sky : undefined }}>
            <LayerView layer={l} scene={scene} />
          </div>
        ),
      )}
    </div>
  )
}

function drawGL() {
  const c = gl.canvas
  const layer = shown >= 0 ? world.layers[shown].gl : -1
  gl.viewport(0, 0, c.width, c.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  drawFrame(gl, prog, { w: c.width, h: c.height, time, par: [0, 0], layer })
}

function seekSvg() {
  for (const a of document.getAnimations()) {
    a.pause()
    a.currentTime = time * 1000
  }
}

window.render = {
  async setup(id) {
    const meta = SCENES.find((s) => s.id === id)
    if (!meta) throw new Error(`no world "${id}"`)
    world = await loadWorld(meta)
    document.documentElement.style.background = document.body.style.background = 'transparent'
    if (world.shader) {
      const c = document.createElement('canvas')
      c.width = innerWidth
      c.height = innerHeight
      Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh' })
      document.body.appendChild(c)
      gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true })
      setupQuad(gl)
      prog = createProgram(gl, world.frag)
    } else {
      flushSync(() => root.render(<SvgWorld scene={world} only={-1} />))
    }
    await frame()
    return { id, shader: !!world.shader, stillTime: world.stillTime, layers: world.layers.map((l) => ({ name: l.name, clock: !!l.clock, sky: !!l.sky })) }
  },
  async seek(t) {
    time = t
    if (world.shader) drawGL()
    else seekSvg()
    await frame()
  },
  async layer(k) {
    shown = k
    if (!world.shader) {
      flushSync(() => root.render(<SvgWorld scene={world} only={k} />))
      await frame()
      seekSvg()
    } else drawGL()
    await frame()
  },
  async webp(pngDataUrl, quality = 0.86) {
    const img = new Image()
    img.src = pngDataUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/webp', quality)
  },
}
