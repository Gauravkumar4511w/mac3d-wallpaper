// Off-main-thread rendering helpers. Where the browser can run WebGL2 on an
// OffscreenCanvas (Safari 17+ / macOS 14+, Chrome, Firefox), shader worlds
// render in workers so a slow GPU can never freeze the page.

let supported = null

/** Can this browser run WebGL2 on an OffscreenCanvas (and so in a worker)? */
export function offscreenWebGL() {
  if (supported != null) return supported
  supported = false
  try {
    if (typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype) {
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
      supported = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    supported = false
  }
  return supported
}

export const createLiveWorker = () => new Worker(new URL('./live.worker.js', import.meta.url), { type: 'module' })

let stillWorker = null
let seq = 0
const waiting = new Map()

/** Render one frame of a world (or one layer) to an ImageBitmap, in a worker. */
export function renderStillBitmap(frag, w, h, { layer = -1, time = 14, par = [0, 0] } = {}) {
  if (!stillWorker) {
    stillWorker = new Worker(new URL('./still.worker.js', import.meta.url), { type: 'module' })
    stillWorker.onmessage = ({ data }) => {
      const p = waiting.get(data.id)
      waiting.delete(data.id)
      if (data.error) p?.reject(new Error(data.error))
      else p?.resolve(data.bitmap)
    }
  }
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    stillWorker.postMessage({ id, frag, w, h, layer, time, par })
  })
}
