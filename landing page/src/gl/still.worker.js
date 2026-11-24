// Renders single frames of shader worlds (the exploded "how it works" planes)
// off the main thread, one request at a time, and hands back ImageBitmaps.
// Programs are compiled once per world, in the background.
import { CONTEXT_ATTRS, createProgramAsync, drawFrame, setupQuad, warmUp } from './runtime.js'

const canvas = new OffscreenCanvas(1, 1)
const gl = canvas.getContext('webgl2', { ...CONTEXT_ATTRS, preserveDrawingBuffer: true })
if (gl) setupQuad(gl)
const programs = new Map() // frag -> Promise<prog>
let queue = Promise.resolve()

function program(frag) {
  if (!programs.has(frag)) {
    programs.set(
      frag,
      createProgramAsync(gl, frag).then(async (p) => {
        await warmUp(gl, p)
        return p
      }),
    )
  }
  return programs.get(frag)
}

self.onmessage = ({ data: m }) => {
  queue = queue.then(() => render(m))
}

async function render({ id, frag, w, h, layer = -1, time = 14, par = [0, 0] }) {
  if (!gl) return self.postMessage({ id, error: 'WebGL2 is not available' })
  try {
    const prog = await program(frag)
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    drawFrame(gl, prog, { w, h, time, par, layer })
    const bitmap = canvas.transferToImageBitmap()
    self.postMessage({ id, bitmap }, [bitmap])
  } catch (e) {
    self.postMessage({ id, error: e.message })
  }
}
