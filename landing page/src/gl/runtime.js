// Tiny WebGL2 runtime for full-screen fragment-shader worlds.
//
// A world's shader source is the BODY of a GLSL ES 3.00 fragment shader. The
// runtime prepends HEADER (version, precision, uniforms, output), so world
// sources must not declare those themselves. Every world must define
// `void main()` and write `fragColor` (premultiplied alpha).
//
// Uniforms:
//   u_res   — drawing-buffer size in pixels (gl_FragCoord space)
//   u_time  — seconds, continuously increasing
//   u_par   — cursor parallax, each axis in [-1, 1] (already smoothed)
//   u_layer — -1.0: render the full composited scene, opaque.
//             k >= 0: render ONLY depth-layer k, transparent elsewhere
//             (used for the exploded "how it works" view).

export const HEADER = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_par;
uniform float u_layer;
out vec4 fragColor;
#line 1
`

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export const CONTEXT_ATTRS = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'default',
}

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || 'unknown compile error'
    gl.deleteShader(s)
    throw new Error(log)
  }
  return s
}

/** Compile + link a world. Throws Error(compile log) on failure. */
export function createProgram(gl, frag) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, HEADER + frag)
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.bindAttribLocation(p, 0, 'a_pos')
  gl.linkProgram(p)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || 'unknown link error'
    gl.deleteProgram(p)
    throw new Error(log)
  }
  return {
    program: p,
    res: gl.getUniformLocation(p, 'u_res'),
    time: gl.getUniformLocation(p, 'u_time'),
    par: gl.getUniformLocation(p, 'u_par'),
    layer: gl.getUniformLocation(p, 'u_layer'),
  }
}

/** One oversized triangle that covers the whole viewport. */
export function setupQuad(gl) {
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
}

export function drawFrame(gl, prog, { w, h, time, par = [0, 0], layer = -1 }) {
  gl.useProgram(prog.program)
  gl.uniform2f(prog.res, w, h)
  gl.uniform1f(prog.time, time)
  gl.uniform2f(prog.par, par[0], par[1])
  gl.uniform1f(prog.layer, layer)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/* ------------------------------------------------------------------ */
/* Shared off-screen renderer: layer snapshots and 8K still exports.   */
/* One context for all of them keeps us far below browser GL limits.   */
/* ------------------------------------------------------------------ */
let shared = null

function getShared() {
  if (shared) return shared
  const c = document.createElement('canvas')
  const gl = c.getContext('webgl2', { ...CONTEXT_ATTRS, preserveDrawingBuffer: true })
  if (!gl) return null
  setupQuad(gl)
  shared = { c, gl, progs: new Map() }
  c.addEventListener('webglcontextlost', () => {
    shared = null
  })
  return shared
}

function sharedProgram(s, frag) {
  let p = s.progs.get(frag)
  if (!p) {
    p = createProgram(s.gl, frag)
    s.progs.set(frag, p)
  }
  return p
}

/** Render one frame of a world (or one of its layers) into a 2D canvas. Returns an error message or null. */
export function renderToCanvas2D(frag, target, { layer = -1, time = 14, par = [0, 0] } = {}) {
  const s = getShared()
  if (!s) return 'WebGL2 is not available'
  const { c, gl } = s
  const w = target.width
  const h = target.height
  if (!w || !h) return null
  let prog
  try {
    prog = sharedProgram(s, frag)
  } catch (e) {
    console.error('[shader]', e.message)
    return e.message
  }
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  gl.viewport(0, 0, w, h)
  gl.disable(gl.SCISSOR_TEST)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  drawFrame(gl, prog, { w, h, time, par, layer })
  const ctx = target.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(c, 0, 0)
  return null
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

/**
 * Render a still at an arbitrary resolution (e.g. 7680x4800 for 8K 16:10)
 * as a PNG blob. Browsers silently shrink oversized WebGL canvases, so we
 * render into an off-screen texture instead, tile by tile (so heavy shaders
 * never trip the GPU watchdog), and assemble the tiles on a 2D canvas.
 */
export async function renderStillBlob(frag, w, h, { time = 14, layer = -1, tile = 1024, onProgress } = {}) {
  const s = getShared()
  if (!s) throw new Error('WebGL2 is not available')
  const { gl } = s
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  const maxVp = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
  if (w > Math.min(maxTex, maxVp[0]) || h > Math.min(maxTex, maxVp[1])) {
    throw new Error(`This GPU supports stills up to ${Math.min(maxTex, maxVp[0])}×${Math.min(maxTex, maxVp[1])}`)
  }
  const prog = sharedProgram(s, frag)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h)
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const cleanup = () => {
    gl.disable(gl.SCISSOR_TEST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fb)
    gl.deleteTexture(tex)
  }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    cleanup()
    throw new Error('Could not allocate an image that large on this GPU')
  }

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  const buf = new Uint8Array(tile * tile * 4)
  gl.viewport(0, 0, w, h)
  gl.enable(gl.SCISSOR_TEST)
  const cols = Math.ceil(w / tile)
  const rows = Math.ceil(h / tile)
  try {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const x0 = tx * tile
        const y0 = ty * tile
        const tw = Math.min(tile, w - x0)
        const th = Math.min(tile, h - y0)
        gl.scissor(x0, y0, tw, th)
        drawFrame(gl, prog, { w, h, time, layer })
        gl.readPixels(x0, y0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        // GL rows run bottom-up; ImageData rows run top-down
        const img = ctx.createImageData(tw, th)
        const rowBytes = tw * 4
        for (let r = 0; r < th; r++) {
          img.data.set(buf.subarray(r * rowBytes, (r + 1) * rowBytes), (th - 1 - r) * rowBytes)
        }
        ctx.putImageData(img, x0, h - y0 - th)
      }
      onProgress?.((ty + 1) / rows)
      await nextFrame()
    }
  } finally {
    cleanup()
  }
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Could not encode the image')
  return blob
}

/**
 * GPU benchmark: average milliseconds per frame at w×h (forces a GPU sync per
 * frame with a 1-pixel readback). Used by the lab's bench=1 mode.
 */
export async function benchFrames(frag, w = 2560, h = 1600, n = 40) {
  const s = getShared()
  if (!s) throw new Error('WebGL2 is not available')
  const { c, gl } = s
  const prog = sharedProgram(s, frag)
  c.width = w
  c.height = h
  gl.viewport(0, 0, w, h)
  gl.disable(gl.SCISSOR_TEST)
  const px = new Uint8Array(4)
  const times = []
  for (let i = 0; i < n + 5; i++) {
    const t0 = performance.now()
    drawFrame(gl, prog, { w, h, time: 10 + i * 0.016, layer: -1 })
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    const dt = performance.now() - t0
    if (i >= 5) times.push(dt) // skip warm-up (shader compile, caches)
    if (i % 10 === 9) await nextFrame()
  }
  c.width = 1
  c.height = 1
  times.sort((a, b) => a - b)
  return { avg: times.reduce((a, b) => a + b, 0) / times.length, median: times[times.length >> 1], w, h }
}
