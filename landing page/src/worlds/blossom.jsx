// Blossom Valley — a bright spring morning. Faceted ranges fade into haze, a
// waterfall spills off a grove-covered hill, a stream winds through the meadow
// under a little wooden footbridge, and two old cherry trees frame it all,
// shedding petals whenever a gust rolls through (every 18 s the trees lean,
// the grass bends and a burst of petals tears loose).

import './blossom.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

const SUN = [1110, 112]
const GUST = 18 // seconds; trees, grass, petals and one meadow wave share it

/* ---------- geometry helpers ---------- */

// Dense Catmull-Rom polyline through hand-placed points.
function cr(pts, seg = 10) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < seg; k++) {
      const t = k / seg
      const t2 = t * t
      const t3 = t2 * t
      out.push(
        [0, 1].map(
          (j) =>
            0.5 *
            (2 * p1[j] +
              (-p0[j] + p2[j]) * t +
              (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
              (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3),
        ),
      )
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${f(x)} ${f(y)}`).join(' ')
const lineTo = (pts) => pts.map(([x, y]) => `L ${f(x)} ${f(y)}`).join(' ')

// A smooth ground ridge: filled area, its crest line and its height at x.
function ridge(pts) {
  const c = cr(pts, 12)
  return {
    d: `${poly(c)} L ${f(c[c.length - 1][0])} ${H + 60} L ${f(c[0][0])} ${H + 60} Z`,
    crest: poly(c),
    y(x) {
      for (let i = 0; i < c.length - 1; i++) {
        const [x0, y0] = c[i]
        const [x1, y1] = c[i + 1]
        if (x >= x0 && x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1))
      }
      return x < c[0][0] ? c[0][1] : c[c.length - 1][1]
    },
  }
}

// Circle as a compact sub-path, so thousands of florets share a handful of
// <path>s (half-unit precision keeps the markup small).
const q = (n) => `${Math.round(n * 2) / 2}`
const qr = (n) => (n < 3 ? `${Math.round(n * 10) / 10}` : q(n))
const circ = (x, y, r) => {
  const R = qr(r)
  return `M${q(x - r)} ${q(y)}a${R} ${R} 0 1 0 ${qr(2 * r)} 0a${R} ${R} 0 1 0-${qr(2 * r)} 0`
}

// Five-petal cherry floret.
function floret(x, y, s, a0) {
  let d = ''
  for (let k = 0; k < 5; k++) {
    const a = a0 + k * 1.2566
    d += circ(x + Math.cos(a) * s * 0.52, y + Math.sin(a) * s * 0.52, s * 0.5)
  }
  return d
}

// A band of varying width along a smooth centreline (streams). Offsets are
// squashed vertically so far, sideways stretches read as lying flat.
function ribbon(pts, wAt, squash = 0.55) {
  const c = cr(pts, 10)
  const L = []
  const R = []
  c.forEach(([x, y], i) => {
    const a = c[Math.max(0, i - 1)]
    const b = c[Math.min(c.length - 1, i + 1)]
    let tx = b[0] - a[0]
    let ty = b[1] - a[1]
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    const w = wAt(y) / 2
    L.push([x - ty * w, y + tx * w * squash])
    R.push([x + ty * w, y - tx * w * squash])
  })
  return { c, L, R, d: `${poly(L)} ${lineTo(R.slice().reverse())} Z` }
}

// Tapered branch with a sunlit strip on the side facing the sun and a shadow
// strip on the other.
function limb(pts, w0, w1, sun) {
  const c = cr(pts, 8)
  const n = c.length
  // pick the lit side once per branch so the highlight never swaps sides
  const gx = c[n - 1][0] - c[0][0]
  const gy = c[n - 1][1] - c[0][1]
  const side = -gy * sun[0] + gx * sun[1] < 0 ? -1 : 1
  const A = []
  const B = []
  const LA = []
  const LB = []
  const DA = []
  const DB = []
  const HA = []
  const HB = []
  const samples = []
  c.forEach(([x, y], i) => {
    const a = c[Math.max(0, i - 1)]
    const b = c[Math.min(n - 1, i + 1)]
    let tx = b[0] - a[0]
    let ty = b[1] - a[1]
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    const nx = -ty * side
    const ny = tx * side
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2
    A.push([x + nx * w, y + ny * w])
    B.push([x - nx * w, y - ny * w])
    LA.push([x + nx * w * 0.9, y + ny * w * 0.9])
    LB.push([x + nx * w * 0.3, y + ny * w * 0.3])
    HA.push([x + nx * w * 0.78, y + ny * w * 0.78])
    HB.push([x + nx * w * 0.52, y + ny * w * 0.52])
    DA.push([x - nx * w, y - ny * w])
    DB.push([x - nx * w * 0.45, y - ny * w * 0.45])
    samples.push({ x, y, w, nx, ny })
  })
  const ring = (P, Q) => `${poly(P)} ${lineTo(Q.slice().reverse())} Z`
  const tip = c[n - 1]
  return {
    body: `${ring(A, B)} ${circ(tip[0], tip[1], w1 / 2)}`,
    lit: ring(LA, LB),
    hi: ring(HA, HB),
    dark: ring(DA, DB),
    samples,
  }
}

// Notched cherry petal, rotated and scaled, in absolute coordinates.
function petalD(x, y, s, rot) {
  const c = Math.cos(rot)
  const sn = Math.sin(rot)
  const p = (px, py) => `${f(x + (px * c - py * sn) * s)} ${f(y + (px * sn + py * c) * s)}`
  return `M ${p(0, 7)} C ${p(-5, 4)}, ${p(-7, -2)}, ${p(-4, -6)} C ${p(-3, -7.6)}, ${p(-1, -7.4)}, ${p(0, -5.4)} C ${p(1, -7.4)}, ${p(3, -7.6)}, ${p(4, -6)} C ${p(7, -2)}, ${p(5, 4)}, ${p(0, 7)} Z`
}

// butterfly wings (left pair; the right pair is mirrored)
const WING_FORE = 'M 0 -2 C -6 -16, -20 -26, -28 -17 C -31 -9, -20 -1, 0 -1 Z'
const WING_HIND = 'M 0 0 C -6 2, -19 6, -18 15 C -15 21, -5 14, 0 2 Z'

const sunDir = (x, y) => {
  const dx = SUN[0] - x
  const dy = SUN[1] - y
  const l = Math.hypot(dx, dy) || 1
  return [dx / l, dy / l]
}

/* ---------- blossom clusters ---------- */

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mixHex = (a, b, t) =>
  `#${hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0'))
    .join('')}`
const mixPal = (a, b, t) => Object.fromEntries(Object.keys(a).map((k) => [k, mixHex(a[k], b[k], Math.min(1, Math.max(0, t)))]))
const FRONT_TOP = { shade: '#e894b2', mid: '#fbbdd1', light: '#ffe3ec', flor: '#fff4f8', dot: '#dc6c9c' }
const FRONT_LOW = { shade: '#b8577f', mid: '#de7fa3', light: '#efa7c0', flor: '#f6c6d6', dot: '#a83d69' }
const BACK_TOP = { shade: '#c4628a', mid: '#df8aab', light: '#efadc4', flor: '#f6c8d7', dot: '#b04a76' }
const BACK_LOW = { shade: '#963f68', mid: '#b9608a', light: '#d184a3', flor: '#e0a3ba', dot: '#86325a' }

const PINK_MID = { shade: '#d58aa6', mid: '#f0adc4', light: '#fbd3df', flor: '#fff0f4', dot: '#c36088' }
const GREEN_MID = { shade: '#5b9a5d', mid: '#79b46d', light: '#a3d088', flor: '#bfe2a0', dot: '#477f49' }

// One clump of blossom: a shadowed under-mass, mid-tone florets, highlights
// toward the sun, a few open five-petal flowers on the rim and dark buds.
function bloom(key, seed, cx, cy, R, pal, detail = 1) {
  const r = rng(seed)
  let [lx, ly] = sunDir(cx, cy)
  ly -= 0.9
  const ll = Math.hypot(lx, ly) || 1
  lx /= ll
  ly /= ll
  const ha = Math.atan2(ly, lx)
  const N = (n) => Math.max(2, Math.round(n * detail))
  let shade = ''
  let mid = ''
  let light = ''
  let flor = ''
  let dots = ''
  for (let i = 0; i < N(9); i++) {
    const a = r() * 6.283
    const d = Math.sqrt(r()) * 0.62 * R
    shade += circ(cx + Math.cos(a) * d - lx * 0.1 * R, cy + Math.sin(a) * d * 0.85 - ly * 0.12 * R, R * (0.25 + r() * 0.15))
  }
  for (let i = 0; i < N(16); i++) {
    const a = r() * 6.283
    const d = (0.08 + Math.sqrt(r()) * 0.72) * R
    mid += circ(cx + Math.cos(a) * d + lx * 0.1 * R, cy + Math.sin(a) * d * 0.85 + ly * 0.1 * R, R * (0.12 + r() * 0.1))
  }
  for (let i = 0; i < N(10); i++) {
    const a = ha + (r() - 0.5) * 2
    const d = (0.28 + r() * 0.52) * R
    light += circ(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, R * (0.075 + r() * 0.07))
  }
  for (let i = 0; i < N(3); i++) {
    const a = ha + (r() - 0.5) * 3.2
    const d = (0.5 + r() * 0.42) * R
    const s = R * (0.09 + r() * 0.05)
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d * 0.85
    flor += floret(x, y, s, r() * 6.283)
    dots += circ(x, y, s * 0.22)
  }
  for (let i = 0; i < N(7); i++) {
    const a = r() * 6.283
    const d = Math.sqrt(r()) * 0.72 * R
    dots += circ(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, 0.6 + R * 0.022)
  }
  return (
    <g key={key}>
      <path d={shade} fill={pal.shade} />
      <path d={mid} fill={pal.mid} />
      <path d={light} fill={pal.light} />
      <path d={flor} fill={pal.flor} />
      <path d={dots} fill={pal.dot} opacity="0.6" />
    </g>
  )
}

/* ---------- sky ---------- */

function cumulus(i, x, y, s, op, dur, delay) {
  const B = [[-74, 4, 20], [-46, -10, 28], [-12, -22, 36], [26, -16, 32], [58, -2, 24], [84, 6, 16], [8, 2, 30], [-30, 4, 26]]
  let sh = ''
  let body = ''
  let hi = ''
  for (const [bx, by, br] of B) {
    sh += circ(x + bx * s, y + (by + 7) * s, br * s)
    body += circ(x + bx * s, y + by * s, br * s * 0.97)
    if (by < -4) hi += circ(x + (bx + br * 0.3) * s, y + (by - br * 0.28) * s, br * 0.52 * s)
  }
  return (
    <g key={i} className="blossom-cloud" opacity={op} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
      <path d={sh} fill="#dde2f2" />
      <ellipse cx={f(x + 4 * s)} cy={f(y + 20 * s)} rx={f(96 * s)} ry={f(8 * s)} fill="#dde2f2" />
      <path d={body} fill="#fff" />
      <path d={hi} fill="#fffaf0" />
    </g>
  )
}

function sunRays() {
  let d = ''
  const [sx, sy] = SUN
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * 6.283 + (k % 3) * 0.05
    const spread = 0.035 + (k % 4) * 0.012
    const len = 520 + (k % 5) * 90
    d += `M ${sx} ${sy} L ${f(sx + Math.cos(a - spread) * len)} ${f(sy + Math.sin(a - spread) * len)} L ${f(sx + Math.cos(a + spread) * len)} ${f(sy + Math.sin(a + spread) * len)} Z `
  }
  return d
}

const sky = (
  <Svg>
    <defs>
      <radialGradient id="blossom-sun-halo">
        <stop offset="0" stopColor="#fffbea" stopOpacity="0.95" />
        <stop offset="0.16" stopColor="#fff4d8" stopOpacity="0.6" />
        <stop offset="0.42" stopColor="#ffedd2" stopOpacity="0.2" />
        <stop offset="1" stopColor="#ffead2" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="blossom-sun-core">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#fffdf2" />
        <stop offset="0.8" stopColor="#fff6dc" stopOpacity="0.7" />
        <stop offset="1" stopColor="#fff2d6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="blossom-ray-g" cx={SUN[0]} cy={SUN[1]} r="640" gradientUnits="userSpaceOnUse">
        <stop offset="0.06" stopColor="#fffbe8" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fffbe8" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle className="blossom-halo" cx={SUN[0]} cy={SUN[1]} r="460" fill="url(#blossom-sun-halo)" />
    <path className="blossom-rays" d={sunRays()} fill="url(#blossom-ray-g)" opacity="0.3" />
    <circle className="blossom-sun" cx={SUN[0]} cy={SUN[1]} r="54" fill="url(#blossom-sun-core)" />
    {cumulus(0, -260, 92, 1.05, 0.95, 230, -40)}
    {cumulus(1, -260, 150, 0.68, 0.85, 190, -150)}
    {cumulus(2, -260, 62, 0.55, 0.8, 260, -205)}
    {cumulus(3, -260, 402, 1.25, 0.95, 280, -70)}
    {cumulus(4, -260, 440, 0.85, 0.9, 210, -160)}
    {cumulus(5, -260, 372, 0.7, 0.85, 250, -10)}
  </Svg>
)

/* ---------- far mountains ---------- */

// Faceted range: lit right faces, shaded left faces, gullies, snow caps.
function range(seed, base, amp, n, snowAt) {
  const r = rng(seed)
  const x0 = -PAD
  const x1 = W + PAD
  const step = (x1 - x0) / n
  const peaks = []
  const valleys = [[x0, base - amp * 0.12]]
  for (let i = 0; i < n; i++) {
    const px = x0 + step * (i + 0.5) + (r() - 0.5) * step * 0.45
    const centre = 0.7 + 0.3 * Math.min(1, Math.abs(px - 720) / 620)
    peaks.push([px, base - amp * centre * (0.5 + 0.5 * r())])
    valleys.push([x0 + step * (i + 1) + (r() - 0.5) * step * 0.2, base - amp * (0.06 + 0.2 * r())])
  }
  valleys[n] = [x1, base - amp * 0.12]
  let d = `M ${x0} ${H} L ${f(valleys[0][0])} ${f(valleys[0][1])}`
  let shade = ''
  let gully = ''
  let sliver = ''
  let snowS = ''
  let snowL = ''
  peaks.forEach(([px, py], i) => {
    const [lx, ly] = valleys[i]
    const [rx, ry] = valleys[i + 1]
    d += ` L ${f(px)} ${f(py)} L ${f(rx)} ${f(ry)}`
    const h = base - py
    const c1 = [px + (rx - px) * 0.1 + (r() - 0.5) * 8, py + h * 0.32]
    const c2 = [px + (rx - px) * 0.02 + (r() - 0.5) * 16, py + h * 0.66]
    const c3 = [px + (rx - px) * 0.14, base + 90]
    shade += `${poly([[lx, ly], [px, py], c1, c2, c3, [lx, base + 90]])} Z `
    for (let g = 0; g < 2; g++) {
      const t = 0.25 + r() * 0.5
      const qx = px + (rx - px) * t
      const qy = py + (ry - py) * t
      const len = h * (0.18 + r() * 0.22)
      gully += `${poly([[qx, qy], [qx - len * 0.3, qy + len], [qx + 5, qy + len * 0.6]])} Z `
    }
    // a lit sliver on the shaded face (reflected light off the next ridge)
    const st = 0.35 + r() * 0.3
    const sx = px + (lx - px) * st
    const sy = py + (ly - py) * st
    sliver += `${poly([[sx, sy], [sx + 12, sy + h * 0.22], [sx + 3, sy + h * 0.34]])} Z `
    if (py < base - amp * snowAt) {
      const t = 0.33
      const a = [px + (lx - px) * t, py + (ly - py) * t]
      const b = [px + (rx - px) * t, py + (ry - py) * t]
      const cc = [px + (c1[0] - px) * 0.9, py + (c1[1] - py) * 0.9]
      const right = [[px, py], b, [b[0] - (b[0] - px) * 0.3, b[1] + 12], [(b[0] + cc[0]) / 2 + 3, (b[1] + cc[1]) / 2 - 4], cc]
      const left = [cc, [(a[0] + cc[0]) / 2, a[1] + 10], [a[0] + (px - a[0]) * 0.25, a[1] - 2], a]
      snowS += `${poly([...right, ...left])} Z `
      snowL += `${poly(right)} Z `
    }
  })
  d += ` L ${x1} ${H} Z`
  return { d, shade, gully, sliver, snowS, snowL }
}

const backRange = range(61, 574, 230, 6, 0.5)
const frontRange = range(88, 628, 165, 8, 0.62)

// Blue-green foothills between the snowy ranges and the valley, textured
// with a treeline of tiny round crowns.
const FOOT = ridge([[-220, 628], [40, 606], [260, 622], [470, 598], [700, 620], [900, 604], [1120, 616], [1340, 596], [1660, 614]])
const footTrees = (() => {
  const r = rng(19)
  let d = ''
  for (let x = -200; x < W + 200; x += 5 + r() * 7) {
    const y = FOOT.y(x) + 2 + r() * 10
    d += circ(x, y, 2.5 + r() * 3)
  }
  return d
})()

function mistBand(i, cx, cy, rx, ry, dur, delay, amp) {
  return (
    <ellipse
      key={i}
      className="blossom-haze"
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="url(#blossom-mist-g)"
      style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s`, '--blossom-amp': `${amp}px` }}
    />
  )
}

const farMountains = (
  <Svg>
    <defs>
      <linearGradient id="blossom-haze1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef2f9" stopOpacity="0" />
        <stop offset="1" stopColor="#eef2f9" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="blossom-haze2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2f1f4" stopOpacity="0" />
        <stop offset="1" stopColor="#f3f1f4" stopOpacity="0.85" />
      </linearGradient>
      <linearGradient id="blossom-haze3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef3f5" stopOpacity="0" />
        <stop offset="1" stopColor="#eef3f5" stopOpacity="0.75" />
      </linearGradient>
      <radialGradient id="blossom-mist-g">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="blossom-warm-g" cx={SUN[0]} cy={SUN[1]} r="900" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff2df" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff2df" stopOpacity="0" />
      </radialGradient>
    </defs>
    <path d={backRange.d} fill="#ebe5ef" />
    <path d={backRange.shade} fill="#b4bddc" />
    <path d={backRange.gully} fill="#d6dbed" />
    <path d={backRange.sliver} fill="#ccd2e8" />
    <path d={backRange.snowS} fill="#e3e6f4" />
    <path d={backRange.snowL} fill="#fbfaff" />
    <rect x={-PAD} y="470" width={W + 2 * PAD} height="150" fill="url(#blossom-haze1)" />
    {mistBand(0, 320, 548, 460, 24, 46, -10, 80)}
    <path d={frontRange.d} fill="#e0dbe9" />
    <path d={frontRange.shade} fill="#8d9bc8" />
    <path d={frontRange.gully} fill="#c5c8e0" />
    <path d={frontRange.sliver} fill="#aebbdb" />
    <path d={frontRange.snowS} fill="#cdd6ee" />
    <path d={frontRange.snowL} fill="#f9f8fd" />
    <path d={frontRange.d} fill="url(#blossom-warm-g)" />
    <rect x={-PAD} y="540" width={W + 2 * PAD} height="150" fill="url(#blossom-haze2)" />
    {mistBand(1, 1000, 594, 420, 20, 38, -24, -70)}
    <path d={FOOT.d} fill="#a9c6cc" />
    <path d={footTrees} fill="#98b8bf" />
    <path d={FOOT.crest} fill="none" stroke="#d3e4e6" strokeWidth="2" opacity="0.8" />
    <rect x={-PAD} y="600" width={W + 2 * PAD} height="80" fill="url(#blossom-haze3)" />
    {mistBand(2, 560, 632, 560, 26, 54, -5, 60)}
  </Svg>
)

/* ---------- waterfall hills ---------- */

const LH = ridge([[-220, 606], [20, 574], [250, 596], [480, 628], [700, 652], [900, 664], [1100, 676], [1660, 690]])
const BH = ridge([[760, 640], [900, 548], [1010, 478], [1110, 436], [1210, 422], [1330, 452], [1500, 506], [1660, 536]])
const FEEDER = ribbon([[1196, 428], [1150, 438], [1104, 450], [1072, 459], [1054, 468]], (y) => 2.5 + (y - 428) * 0.12, 0.7)
const RH = ridge([[560, 740], [720, 648], [860, 560], [960, 502], [1030, 470], [1054, 464], [1080, 468], [1160, 488], [1300, 532], [1460, 574], [1660, 600]])

// Distant groves: clumps of tiny round trees (pink orchards, fresh green
// copses), each sunlit on the side facing the sun, plus a few loners.
function grove(seed, rd, patches, singles, x0, x1, skip = () => false) {
  const r = rng(seed)
  const trees = []
  const add = (x, dy, s, pink) => {
    if (!skip(x)) trees.push([x, rd.y(x) + dy, s, pink])
  }
  for (const [px, w, depth, n, pk] of patches) {
    for (let i = 0; i < n; i++) {
      const u = r() + r() - 1
      const dy = 1 + r() * depth * (1 - Math.abs(u) * 0.7)
      add(px + (u * w) / 2, dy, (2.8 + r() * 2.4) * (1 + dy / 110), r() < pk)
    }
  }
  for (let i = 0; i < singles; i++) {
    const dy = 6 + r() * 70
    add(x0 + r() * (x1 - x0), dy, (2.6 + r() * 1.8) * (1 + dy / 110), r() < 0.5)
  }
  trees.sort((a, b) => a[1] - b[1])
  let ps = ''
  let pl = ''
  let gs = ''
  let gl = ''
  let tr = ''
  for (const [x, y, s, pink] of trees) {
    const [lx, ly] = sunDir(x, y)
    tr += `M ${f(x)} ${f(y + s * 0.6)} L ${f(x)} ${f(y + s * 1.35)} `
    if (pink) {
      ps += circ(x, y, s)
      pl += circ(x + lx * s * 0.32, y + ly * s * 0.36, s * 0.64)
    } else {
      gs += circ(x, y, s * 0.92)
      gl += circ(x + lx * s * 0.3, y + ly * s * 0.34, s * 0.56)
    }
  }
  return (
    <g>
      <path d={tr} stroke="#839484" strokeWidth="1.2" />
      <path d={gs} fill="#88b590" />
      <path d={gl} fill="#a8cfa2" />
      <path d={ps} fill="#dca9be" />
      <path d={pl} fill="#f5d3de" />
    </g>
  )
}

const FALL = 'M 1040 468 L 1068 468 L 1079 614 L 1029 614 Z'

function streaks(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = 1036 + r() * 38
    const len = 26 + r() * 44
    const dur = 1.2 + r() * 1.1
    return (
      <rect
        key={i}
        className="blossom-streak"
        x={f(x)}
        y={f(440 - len)}
        width={(1.6 + r() * 2.4).toFixed(1)}
        height={f(len)}
        rx="1.5"
        fill="#fff"
        style={{ animationDuration: `${dur.toFixed(2)}s`, animationDelay: `${(-r() * dur).toFixed(2)}s` }}
      />
    )
  })
}

// Mossy boulders flanking the fall: irregular, lit on their upper right.
function boulders() {
  const r = rng(77)
  const spots = [
    [1026, 484, 12, 9], [1019, 506, 14, 11], [1028, 528, 10, 8], [1012, 540, 16, 12], [1022, 566, 12, 9], [1004, 580, 17, 12], [1018, 600, 13, 9], [998, 610, 18, 11],
    [1084, 486, 12, 9], [1092, 506, 14, 11], [1082, 530, 10, 8], [1098, 540, 16, 12], [1088, 566, 12, 9], [1106, 580, 17, 12], [1092, 600, 13, 9], [1114, 610, 18, 11],
    [1034, 618, 12, 6], [1080, 620, 13, 6],
  ]
  let body = ''
  let lit = ''
  let dark = ''
  let moss = ''
  for (const [x, y, w, h] of spots) {
    if (r() < 0.55) moss += circ(x - w * 0.2, y - h * 0.55, w * 0.45) + circ(x + w * 0.25, y - h * 0.6, w * 0.32)
    const pts = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * 6.283
      const j = 0.82 + r() * 0.3
      return [x + Math.cos(a) * w * j, y + Math.sin(a) * h * j * (Math.sin(a) > 0 ? 0.8 : 1)]
    })
    body += `${poly(pts)} Z `
    lit += `${poly([pts[5], pts[6], pts[7], pts[0], [x + w * 0.2, y - h * 0.05], [x - w * 0.1, y - h * 0.3]])} Z `
    dark += `${poly([pts[1], pts[2], pts[3], [x - w * 0.3, y + h * 0.1], [x + w * 0.1, y + h * 0.4]])} Z `
  }
  return (
    <g>
      <path d={body} fill="#7e968d" />
      <path d={dark} fill="#5f7670" />
      <path d={lit} fill="#a9bcb0" />
      <path d={moss} fill="#79a874" />
    </g>
  )
}

const FALL_STREAM = ribbon([[1052, 622], [1036, 634], [1012, 650], [998, 676], [992, 716]], (y) => 7 + (y - 622) * 0.09)

const waterfallHills = (
  <Svg>
    <defs>
      <linearGradient id="blossom-lh-g" x1="0" y1="560" x2="0" y2="720" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#b3d4a6" />
        <stop offset="1" stopColor="#c9dfc4" />
      </linearGradient>
      <linearGradient id="blossom-rh-g" x1="640" y1="0" x2="1400" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#9cc39d" />
        <stop offset="0.48" stopColor="#8fb994" />
        <stop offset="0.58" stopColor="#afd4a2" />
        <stop offset="1" stopColor="#a3cb9b" />
      </linearGradient>
      <linearGradient id="blossom-fall-g" x1="0" y1="468" x2="0" y2="614" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d6eef7" />
      </linearGradient>
      <linearGradient id="blossom-hillhaze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef5f1" stopOpacity="0" />
        <stop offset="1" stopColor="#eef5f1" stopOpacity="0.7" />
      </linearGradient>
      <radialGradient id="blossom-hollow-g">
        <stop offset="0" stopColor="#6f9e78" stopOpacity="0.55" />
        <stop offset="1" stopColor="#6f9e78" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="blossom-spray-g">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <clipPath id="blossom-fall-clip">
        <path d={FALL} />
      </clipPath>
    </defs>
    {/* a higher shoulder behind the waterfall hill feeds the fall */}
    <path d={BH.d} fill="#bcd8b4" />
    <path d={BH.crest} fill="none" stroke="#e6f3dc" strokeWidth="2" opacity="0.8" />
    {grove(29, BH, [[930, 90, 30, 22, 0.6], [1250, 150, 30, 40, 0.8], [1450, 120, 24, 24, 0.4]], 16, 820, 1640, (x) => x > 1040 && x < 1200)}
    <path d={BH.d} fill="#e9f1f1" opacity="0.38" />
    <path d={FEEDER.d} fill="#e2f3f9" />
    <path d={LH.d} fill="url(#blossom-lh-g)" />
    <path d={LH.crest} fill="none" stroke="#e2f1d2" strokeWidth="2.5" opacity="0.8" />
    {grove(5, LH, [[-90, 200, 34, 70, 0.85], [150, 170, 28, 46, 0.25], [340, 150, 34, 50, 0.9], [560, 120, 26, 30, 0.45], [720, 100, 20, 20, 0.8]], 34, -200, 800)}
    <path d={RH.d} fill="url(#blossom-rh-g)" />
    <path d={RH.crest} fill="none" stroke="#dcefc9" strokeWidth="2.5" opacity="0.7" />
    {grove(17, RH, [[720, 130, 40, 34, 0.75], [868, 120, 52, 40, 0.35], [972, 44, 30, 18, 0.7], [1150, 70, 36, 26, 0.55], [1300, 170, 44, 54, 0.85], [1490, 170, 36, 40, 0.3]], 40, 640, 1640, (x) => x > 994 && x < 1118)}
    {/* a soft shaded hollow, then boulders stacked either side of the fall */}
    <ellipse cx="1056" cy="560" rx="112" ry="120" fill="url(#blossom-hollow-g)" />
    <path d="M 1030 468 L 1078 468 L 1090 624 L 1020 624 Z" fill="#5f7a74" />
    {boulders()}
    <path d={`M 1012 478 C 1018 464, 1090 462, 1098 478 C 1086 483, 1024 484, 1012 478 Z ${circ(1004, 494, 6)} ${circ(1106, 494, 6)}`} fill="#7aa978" />
    <path d="M 1020 471 C 1032 465, 1080 464, 1094 471 C 1080 469, 1030 469, 1020 471 Z" fill="#a6cf96" />
    <path d={FALL} fill="url(#blossom-fall-g)" />
    <path d="M 1046 468 L 1050 468 L 1053 614 L 1046 614 Z M 1060 468 L 1063 468 L 1069 614 L 1064 614 Z" fill="#cbe6f1" opacity="0.7" />
    <g clipPath="url(#blossom-fall-clip)">{streaks(7, 9)}</g>
    <ellipse cx="1054" cy="469" rx="17" ry="3" fill="#fff" />
    {/* plunge pool and the stream leaving it */}
    <ellipse cx="1055" cy="620" rx="64" ry="10" fill="#bfe1ee" />
    <path d={FALL_STREAM.d} fill="#bfe1ee" />
    <ellipse cx="1055" cy="618" rx="46" ry="6" fill="#e4f4fa" />
    {[
      [1012, 621, 2.6],
      [1094, 622, 3.4],
      [1036, 628, 4.1],
    ].map(([x, y, d], i) => (
      <rect key={i} className="blossom-glint" x={x} y={y} width="12" height="1.6" rx="0.8" fill="#fff" style={{ animationDuration: `${d}s`, animationDelay: `${-i * 1.3}s` }} />
    ))}
    {[
      [1034, 606, 18, 5.2],
      [1056, 598, 24, 6.4],
      [1080, 606, 17, 4.6],
      [1056, 614, 30, 7.1],
    ].map(([x, y, rr, d], i) => (
      <circle key={i} className="blossom-mist" cx={x} cy={y} r={rr} fill="url(#blossom-spray-g)" style={{ animationDuration: `${d}s`, animationDelay: `${-i * 1.7}s` }} />
    ))}
    <rect x={-PAD} y="600" width={W + 2 * PAD} height="160" fill="url(#blossom-hillhaze)" />
  </Svg>
)

/* ---------- stream meadow ---------- */

const BR = ridge([[-220, 690], [60, 664], [330, 686], [600, 702], [840, 690], [990, 704], [1130, 664], [1390, 680], [1660, 654]])
const SWELL_L = ridge([[-220, 772], [120, 750], [380, 766], [560, 792], [720, 880]])
const SWELL_R = ridge([[800, 880], [900, 806], [1060, 772], [1300, 752], [1660, 770]])

const STREAM = [[994, 698], [952, 711], [884, 723], [818, 737], [782, 754], [768, 780], [748, 816], [694, 856], [616, 904], [540, 952]]
const sw = (y) => 8 + Math.max(0, y - 698) * 0.5
const stream = ribbon(STREAM, sw)
const bank = ribbon(STREAM, (y) => sw(y) + 8)

function smallTree(key, seed, x, y, s, pink) {
  const r = rng(seed)
  const sd = sunDir(x, y)
  const trunk = limb([[x, y + 3], [x + s, y - 13 * s], [x - s, y - 25 * s]], 5.5 * s, 2.4 * s, sd)
  const b1 = limb([[x, y - 12 * s], [x - 7 * s, y - 22 * s], [x - 13 * s, y - 30 * s]], 2.6 * s, 1.1 * s, sd)
  const b2 = limb([[x, y - 16 * s], [x + 8 * s, y - 25 * s], [x + 14 * s, y - 33 * s]], 2.6 * s, 1.1 * s, sd)
  const pal = pink ? PINK_MID : GREEN_MID
  const spots = [
    [-15, -30, 11],
    [14, -33, 11],
    [0, -44, 12],
    [-7, -27, 10],
    [8, -24, 9],
    [-1, -35, 13],
  ]
  return (
    <g key={key}>
      <ellipse cx={f(x - 12 * s)} cy={f(y + 3)} rx={f(22 * s)} ry={f(3.6 * s)} fill="#4f8a4d" opacity="0.35" />
      <path d={`${trunk.body} ${b1.body} ${b2.body}`} fill="#5e434a" />
      <path d={trunk.lit} fill="#8f7077" />
      {spots.map(([dx, dy, rr], i) =>
        bloom(i, seed * 13 + i, x + (dx + (r() - 0.5) * 4) * s, y + (dy + (r() - 0.5) * 4) * s, rr * s, pal, 0.45),
      )}
    </g>
  )
}

function flowerPatch(seed, cx, cy, rx, count) {
  const r = rng(seed)
  const cols = ['', '', '', '']
  for (let i = 0; i < count; i++) {
    const a = r() * 6.283
    const d = Math.pow(r(), 0.8)
    const x = cx + Math.cos(a) * d * rx
    const y = cy + Math.sin(a) * d * rx * 0.2
    const q = r()
    const k = q < 0.36 ? 0 : q < 0.72 ? 1 : q < 0.92 ? 2 : 3
    cols[k] += circ(x, y, (0.9 + r() * 0.9) * (1 + (y - 680) / 160))
  }
  return ['#fff0a0', '#ffffff', '#f7b4cb', '#d7c3f3'].map((c, i) => <path key={`${seed}-${i}`} d={cols[i]} fill={c} opacity="0.9" />)
}

// Arched plank footbridge (side view), its far rail, abutment stones.
const BX0 = 708
const BX1 = 836
const BY = 780
const BM = (BX0 + BX1) / 2
const deckY = (x) => {
  const t = (x - BX0) / (BX1 - BX0)
  return BY - 16 * 4 * t * (1 - t)
}
function railing(dy, post, rail, lit, sw0) {
  const xs = [BX0 + 6, BX0 + 36, BM, BX1 - 36, BX1 - 6]
  return (
    <g>
      <path
        d={xs.map((x) => `M ${f(x)} ${f(deckY(x) + dy)} L ${f(x)} ${f(deckY(x) + dy - 18)}`).join(' ')}
        stroke={post}
        strokeWidth={sw0 + 1.2}
        strokeLinecap="round"
      />
      <path d={`M ${BX0 + 4} ${f(deckY(BX0 + 4) + dy - 17)} Q ${BM} ${f(BY + dy - 49)} ${BX1 - 4} ${f(deckY(BX1 - 4) + dy - 17)}`} fill="none" stroke={rail} strokeWidth={sw0} strokeLinecap="round" />
      <path d={`M ${BX0 + 6} ${f(deckY(BX0 + 6) + dy - 9)} Q ${BM} ${f(BY + dy - 41)} ${BX1 - 6} ${f(deckY(BX1 - 6) + dy - 9)}`} fill="none" stroke={rail} strokeWidth={sw0 * 0.6} strokeLinecap="round" />
      {lit && (
        <path d={`M ${BX0 + 4} ${f(deckY(BX0 + 4) + dy - 18.4)} Q ${BM} ${f(BY + dy - 50.4)} ${BX1 - 4} ${f(deckY(BX1 - 4) + dy - 18.4)}`} fill="none" stroke={lit} strokeWidth="1.1" strokeLinecap="round" />
      )}
    </g>
  )
}

const bridge = (
  <g>
    <defs>
      <clipPath id="blossom-stream-clip">
        <path d={stream.d} />
      </clipPath>
    </defs>
    {/* reflection and shadow in the water */}
    <g clipPath="url(#blossom-stream-clip)">
      <ellipse cx={BM} cy={BY + 10} rx="62" ry="7" fill="#5f8c9c" opacity="0.28" />
      <path d={`M ${BX0} ${BY + 6} Q ${BM} ${BY + 40} ${BX1} ${BY + 6} L ${BX1} ${BY + 10} Q ${BM} ${BY + 46} ${BX0} ${BY + 10} Z`} fill="#7c5a4a" opacity="0.28" />
      <path
        d={[BX0 + 36, BM, BX1 - 36].map((x) => `M ${f(x)} ${f(2 * BY - deckY(x) + 12)} L ${f(x)} ${f(2 * BY - deckY(x) + 28)}`).join(' ')}
        stroke="#7c5a4a"
        strokeWidth="2.6"
        opacity="0.22"
      />
    </g>
    {railing(-5, '#a98463', '#a98463', null, 2.2)}
    {/* deck: top surface, plank ends, side beam */}
    <path d={`M ${BX0} ${BY} Q ${BM} ${BY - 32} ${BX1} ${BY} L ${BX1 + 2} ${BY - 5} Q ${BM} ${BY - 37} ${BX0 + 2} ${BY - 5} Z`} fill="#d8a776" />
    <path
      d={Array.from({ length: 15 }, (_, i) => {
        const x = BX0 + 6 + i * 8.4
        return `M ${f(x)} ${f(deckY(x))} L ${f(x + 1.5)} ${f(deckY(x) - 5)}`
      }).join(' ')}
      stroke="#b9875a"
      strokeWidth="1"
    />
    <path d={`M ${BX0} ${BY} Q ${BM} ${BY - 32} ${BX1} ${BY} L ${BX1 - 3} ${BY + 7} Q ${BM} ${BY - 23} ${BX0 + 3} ${BY + 7} Z`} fill="#8a5a3b" />
    <path d={`M ${BX0} ${BY} Q ${BM} ${BY - 32} ${BX1} ${BY}`} fill="none" stroke="#c48f60" strokeWidth="1.2" />
    {railing(0, '#7a4c31', '#7f5034', '#e0b382', 2.8)}
    {/* abutment stones */}
    {[
      [BX0 - 4, BY + 3, 13, 7],
      [BX0 - 16, BY + 8, 9, 5],
      [BX0 + 6, BY + 9, 8, 4.5],
      [BX1 + 4, BY + 3, 13, 7],
      [BX1 + 16, BY + 9, 9, 5],
      [BX1 - 6, BY + 9, 7, 4],
    ].map(([x, y, rx, ry], i) => (
      <g key={i}>
        <ellipse cx={x} cy={y + 1.5} rx={rx} ry={ry} fill="#868579" />
        <ellipse cx={x + 1} cy={y - 0.5} rx={rx * 0.85} ry={ry * 0.75} fill="#c3bfb2" />
      </g>
    ))}
  </g>
)

function streamGlints(seed) {
  const r = rng(seed)
  const spots = [6, 14, 22, 34, 44, 52, 60]
  return spots.map((ci, i) => {
    const [x, y] = stream.c[ci]
    const s = 0.6 + (y - 690) / 150
    const dur = 2.4 + r() * 2.6
    const ox = (r() - 0.5) * sw(y) * 0.6
    return (
      <path
        key={i}
        className="blossom-sparkle"
        d={`M ${f(x + ox)} ${f(y - 5 * s)} L ${f(x + ox + 1.2 * s)} ${f(y - 1.2 * s)} L ${f(x + ox + 7 * s)} ${f(y)} L ${f(x + ox + 1.2 * s)} ${f(y + 1.2 * s)} L ${f(x + ox)} ${f(y + 5 * s)} L ${f(x + ox - 1.2 * s)} ${f(y + 1.2 * s)} L ${f(x + ox - 7 * s)} ${f(y)} L ${f(x + ox - 1.2 * s)} ${f(y - 1.2 * s)} Z`}
        fill="#fff"
        style={{ animationDuration: `${dur.toFixed(2)}s`, animationDelay: `${(-r() * dur).toFixed(2)}s` }}
      />
    )
  })
}

function ripples() {
  return [10, 26, 48, 64].map((ci, i) => {
    const [x, y] = stream.c[ci]
    const [x2, y2] = stream.c[ci + 3]
    const w = sw(y) * 0.35
    return (
      <path
        key={i}
        className="blossom-ripple"
        d={`M ${f(x - w)} ${f(y)} q ${f(w)} ${f(-2.5)} ${f(w * 2)} 0`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={f(1.2 + (y - 690) / 90)}
        strokeLinecap="round"
        style={{ '--blossom-fx': `${f(x2 - x)}px`, '--blossom-fy': `${f(y2 - y)}px`, animationDuration: `${2.6 + i * 0.5}s`, animationDelay: `${-i * 0.9}s` }}
      />
    )
  })
}

const WING_BIRD = 'M -11 -5 Q -5 -6.5 -1 0 L 1 0 Q 5 -6.5 11 -5 Q 5 -2.2 0 2.6 Q -5 -2.2 -11 -5 Z'

function flock(cls, x, y, birds, color, dur, delay) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={cls} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} fill={color}>
        {birds.map(([bx, by, s, flap, fd], i) => (
          <g key={i} transform={`translate(${bx} ${by}) scale(${s})`}>
            <path className="blossom-wingbeat" d={WING_BIRD} style={{ animationDuration: `${flap}s`, animationDelay: `${fd}s` }} />
            <ellipse cx="0" cy="0.8" rx="1.7" ry="2.6" />
          </g>
        ))}
      </g>
    </g>
  )
}

function waveBand(i, y, rx, ry, dur, delay) {
  return (
    <ellipse
      key={i}
      className="blossom-wave"
      cx="-420"
      cy={y}
      rx={rx}
      ry={ry}
      fill="url(#blossom-wave-g)"
      style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
    />
  )
}

const meadow = (
  <Svg>
    <defs>
      <linearGradient id="blossom-br-g" x1="0" y1="650" x2="0" y2="800" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#a9d68c" />
        <stop offset="1" stopColor="#86c06f" />
      </linearGradient>
      <linearGradient id="blossom-sw-g" x1="0" y1="740" x2="0" y2="880" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#98cf7c" />
        <stop offset="1" stopColor="#71b25f" />
      </linearGradient>
      <linearGradient id="blossom-water-g" x1="0" y1="690" x2="0" y2="880" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#d5eef8" />
        <stop offset="0.5" stopColor="#b5dff0" />
        <stop offset="1" stopColor="#93cbe3" />
      </linearGradient>
      <radialGradient id="blossom-wave-g">
        <stop offset="0" stopColor="#f6ffd8" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#efffc8" stopOpacity="0.35" />
        <stop offset="1" stopColor="#efffc8" stopOpacity="0" />
      </radialGradient>
      <clipPath id="blossom-meadow-clip">
        <path d={BR.d} />
      </clipPath>
    </defs>
    <path d={BR.d} fill="url(#blossom-br-g)" />
    <path d={BR.crest} fill="none" stroke="#d9f0b6" strokeWidth="2.5" opacity="0.75" />
    {[
      [40, 0.8, 1],
      [110, 1.05, 1],
      [196, 0.85, 0],
      [470, 0.9, 1],
      [548, 0.75, 0],
      [1150, 0.9, 1],
      [1212, 0.8, 0],
      [1290, 1, 1],
      [1366, 0.85, 1],
      [1470, 0.9, 0],
    ].map(([x, s, pink], i) => smallTree(`bt${i}`, 30 + i * 7, x, BR.y(x) + 4, s, pink))}
    <path d={SWELL_L.d} fill="url(#blossom-sw-g)" />
    <path d={SWELL_R.d} fill="url(#blossom-sw-g)" />
    <path d={SWELL_L.crest} fill="none" stroke="#c9ea9f" strokeWidth="2" opacity="0.6" />
    <path d={SWELL_R.crest} fill="none" stroke="#c9ea9f" strokeWidth="2" opacity="0.6" />
    {flowerPatch(1, 120, 728, 70, 60)}
    {flowerPatch(2, 320, 772, 90, 80)}
    {flowerPatch(3, 520, 726, 50, 40)}
    {flowerPatch(4, 962, 794, 70, 60)}
    {flowerPatch(5, 1180, 728, 60, 50)}
    {flowerPatch(6, 1330, 772, 90, 80)}
    {flowerPatch(7, 636, 810, 46, 36)}
    {smallTree('ft0', 91, 404, SWELL_L.y(404) + 4, 1.35, 1)}
    {smallTree('ft1', 97, 1078, SWELL_R.y(1078) + 4, 1.4, 1)}
    {smallTree('ft2', 99, 1130, SWELL_R.y(1130) + 4, 1.15, 0)}
    <g clipPath="url(#blossom-meadow-clip)">
      {waveBand(0, 700, 260, 30, 14, -3)}
      {waveBand(1, 770, 320, 40, GUST, -GUST * 0.06)}
      {waveBand(2, 730, 220, 26, 21, -15)}
    </g>
    {/* the stream: far bank, water, sky reflection, sparkles */}
    <g transform="translate(0 -2.5)">
      <path d={bank.d} fill="#6f9455" />
    </g>
    <path d={stream.d} fill="url(#blossom-water-g)" />
    <path d={poly(stream.c)} fill="none" stroke="#eaf7fc" strokeWidth="3" opacity="0.6" />
    <path d={poly(stream.L)} fill="none" stroke="#cfeaf4" strokeWidth="1.5" opacity="0.8" />
    {ripples()}
    {streamGlints(3)}
    {[0, 1, 2].map((i) => (
      <path
        key={i}
        className="blossom-float"
        d={petalD(994, 698, 0.55, i * 1.7)}
        fill="#ffc6d6"
        style={{ animationDuration: '24s', animationDelay: `${-i * 8 - 2}s` }}
      />
    ))}
    {bridge}
    {/* reeds on the banks */}
    <path
      d={[
        [690, 812], [700, 806], [842, 790], [852, 796], [724, 760], [806, 748], [932, 716], [612, 878], [628, 870],
      ]
        .map(([x, y]) => `M ${x} ${y} q -2 -8 -5 -14 M ${x + 3} ${y} q 1 -9 3 -16 M ${x + 6} ${y} q 3 -6 7 -11`)
        .join(' ')}
      stroke="#4f8e45"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
    />
    {flock(
      'blossom-flock',
      1600,
      470,
      [
        [0, 0, 1.15, 0.52, 0],
        [26, -12, 1, 0.48, -0.2],
        [48, 8, 1.05, 0.56, -0.35],
        [-22, 14, 0.95, 0.5, -0.1],
        [70, -6, 0.9, 0.46, -0.28],
        [40, -28, 0.85, 0.54, -0.4],
        [-40, -6, 0.9, 0.5, -0.15],
      ],
      '#4a5974',
      46,
      -14,
    )}
    {flock(
      'blossom-flock2',
      -140,
      408,
      [
        [0, 0, 0.75, 0.42, 0],
        [-22, 8, 0.7, 0.45, -0.2],
        [-40, -4, 0.65, 0.4, -0.3],
      ],
      '#6d7a92',
      58,
      -40,
    )}
    {butterfly({ x: 640, y: 690, s: 0.6, c1: '#fff2a8', c2: '#ffd36e', path: 'b', dur: 24, delay: -6, flap: 0.32 })}
    {butterfly({ x: 930, y: 740, s: 0.55, c1: '#ffffff', c2: '#ffd6e4', path: 'c', dur: 20, delay: -12, flap: 0.3 })}
  </Svg>
)

/* ---------- sunbeams ---------- */

const BEAMS = [
  [40, 980, 190, 0.9, 9, -2],
  [300, 960, 240, 0.8, 12, -7],
  [540, 960, 150, 0.85, 10, -4],
  [740, 940, 210, 0.7, 14, -10],
  [930, 930, 130, 0.75, 11, -1],
]

const sunbeams = (
  <Svg>
    <defs>
      {BEAMS.map(([x, y], i) => (
        <linearGradient key={i} id={`blossom-beam-${i}`} x1={SUN[0]} y1={SUN[1]} x2={x} y2={y} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff8df" stopOpacity="0" />
          <stop offset="0.16" stopColor="#fff8df" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#fff8df" stopOpacity="0.2" />
          <stop offset="1" stopColor="#fff8df" stopOpacity="0" />
        </linearGradient>
      ))}
    </defs>
    {BEAMS.map(([x, y, w, op, dur, delay], i) => {
      const dx = x - SUN[0]
      const dy = y - SUN[1]
      const l = Math.hypot(dx, dy)
      const nx = -dy / l
      const ny = dx / l
      const strip = (k) =>
        `${poly([
          [SUN[0] + nx * 6 * k, SUN[1] + ny * 6 * k],
          [x + (nx * w * k) / 2, y + (ny * w * k) / 2],
          [x - (nx * w * k) / 2, y - (ny * w * k) / 2],
          [SUN[0] - nx * 6 * k, SUN[1] - ny * 6 * k],
        ])} Z`
      return (
        <g
          key={i}
          className="blossom-beam"
          fill={`url(#blossom-beam-${i})`}
          style={{ '--blossom-op': op, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
        >
          <path d={strip(1)} opacity="0.3" />
          <path d={strip(0.66)} opacity="0.35" />
          <path d={strip(0.33)} opacity="0.4" />
        </g>
      )
    })}
    {[
      [860, 420, 2.2],
      [700, 560, 1.8],
      [560, 650, 2.6],
      [980, 520, 1.6],
      [400, 700, 2.2],
      [820, 660, 2],
      [1010, 380, 1.7],
      [620, 480, 1.5],
    ].map(([x, y, rr], i) => (
      <circle
        key={i}
        className="blossom-mote"
        cx={x}
        cy={y}
        r={rr}
        fill="#fffbe6"
        style={{ animationDuration: `${7 + (i % 4) * 1.7}s`, animationDelay: `${-i * 2.3}s` }}
      />
    ))}
  </Svg>
)

/* ---------- cherry trees ---------- */

// Clump positions fill a canopy envelope (union of ellipses) on a jittered
// grid; clumps shrink toward the edge so the silhouette scallops, and a few
// holes stay open so branches and sky show through.
function canopy(seed, env, holes, grid, rMin, rMax, keep) {
  const r = rng(seed)
  const x0 = Math.min(...env.map(([x, , rx]) => x - rx))
  const x1 = Math.max(...env.map(([x, , rx]) => x + rx))
  const y0 = Math.min(...env.map(([, y, , ry]) => y - ry))
  const y1 = Math.max(...env.map(([, y, , ry]) => y + ry))
  const out = []
  let row = 0
  for (let gy = y0; gy <= y1; gy += grid * 0.8, row++) {
    for (let gx = x0 + ((row % 2) * grid) / 2; gx <= x1; gx += grid) {
      const x = gx + (r() - 0.5) * grid * 0.6
      const y = gy + (r() - 0.5) * grid * 0.5
      const k = r()
      const j = r()
      let e = 0
      for (const [ex, ey, rx, ry] of env) e = Math.max(e, 1 - Math.hypot((x - ex) / rx, (y - ey) / ry))
      if (e <= 0.02) continue
      if (holes.some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr)) continue
      if (k > keep(x, y)) continue
      const R = (rMin + (rMax - rMin) * Math.min(1, e * 2.4)) * (0.85 + j * 0.3)
      // never on screen, even at full parallax: skip
      if (x + R < -12 || x - R > W + 12 || y + R < -12) continue
      out.push([x, y, R])
    }
  }
  return out.sort((a, b) => a[1] - b[1])
}

const LEFT_TREE = {
  seed: 23,
  base: [190, 900],
  trunk: [[180, 950], [190, 840], [206, 730], [214, 640], [226, 560], [244, 480], [264, 400], [284, 320], [296, 250]],
  tw: [58, 10],
  limbs: [
    [[[214, 622], [160, 556], [96, 506], [20, 468], [-70, 444]], 26, 6],
    [[[230, 534], [196, 448], [150, 372], [104, 300], [72, 230]], 22, 5],
    [[[252, 450], [312, 420], [370, 394], [432, 374]], 15, 4],
    [[[150, 372], [80, 324], [10, 286], [-70, 256]], 12, 4],
    [[[284, 320], [250, 250], [226, 180], [214, 110]], 11, 3.5],
    [[[296, 250], [330, 190], [360, 120]], 9, 3],
    [[[104, 300], [120, 220], [150, 150], [160, 80]], 9, 3],
    [[[96, 506], [50, 546], [0, 566]], 8, 3],
    [[[270, 372], [330, 336], [384, 312]], 9, 3],
  ],
  env: [
    [120, 190, 300, 150],
    [360, 326, 100, 62],
    [-30, 350, 210, 110],
    [220, 66, 200, 90],
  ],
  holes: [
    [232, 360, 44],
    [118, 330, 34],
    [306, 290, 26],
    [30, 412, 30],
  ],
  inner: [214, 320],
  tips: [
    [-50, 446, 36],
    [8, 560, 28],
    [50, 540, 22],
    [436, 372, 26],
    [388, 312, 24],
  ],
}

const RIGHT_TREE = {
  seed: 57,
  base: [1290, 900],
  trunk: [[1300, 950], [1290, 840], [1274, 730], [1266, 640], [1256, 560], [1240, 480], [1222, 400], [1204, 320], [1192, 250]],
  tw: [60, 10],
  limbs: [
    [[[1266, 622], [1330, 554], [1400, 502], [1480, 464], [1590, 438]], 26, 6],
    [[[1250, 534], [1290, 448], [1336, 372], [1378, 300], [1410, 226]], 22, 5],
    [[[1236, 470], [1176, 438], [1120, 412], [1064, 398]], 15, 4],
    [[[1336, 372], [1410, 322], [1490, 282], [1570, 252]], 12, 4],
    [[[1204, 320], [1240, 250], [1266, 180], [1282, 110]], 11, 3.5],
    [[[1192, 250], [1172, 196], [1162, 146]], 8, 3],
    [[[1378, 300], [1370, 220], [1390, 150], [1400, 80]], 9, 3],
    [[[1400, 502], [1450, 540], [1500, 556]], 8, 3],
    [[[1222, 400], [1160, 372], [1104, 354]], 9, 3],
  ],
  env: [
    [1372, 212, 300, 145],
    [1112, 344, 92, 62],
    [1520, 352, 200, 110],
    [1314, 64, 170, 80],
  ],
  holes: [
    [1252, 368, 44],
    [1364, 330, 36],
    [1182, 300, 28],
    [1470, 412, 30],
  ],
  inner: [1260, 330],
  tips: [
    [1590, 440, 36],
    [1502, 552, 28],
    [1456, 540, 22],
    [1062, 398, 28],
    [1100, 354, 24],
  ],
}

function buildTree(t) {
  const [ix, iy] = t.inner
  const top = Math.min(...t.env.map(([, y, , ry]) => y - ry))
  const bot = Math.max(...t.env.map(([, y, , ry]) => y + ry))
  // tone: 0 on the sunlit crown, 1 in the shaded underside away from the sun
  const [cx, cy] = t.env[0]
  const [lx, ly] = sunDir(cx, cy)
  const tier = (list) =>
    list.map(([x, y, R]) => {
      const v = Math.hypot(x - cx, y - cy) || 1
      const side = 0.5 - (0.5 * ((x - cx) * lx + (y - cy) * ly)) / v
      return [x, y, R, 0.62 * ((y - top) / (bot - top)) + 0.38 * side * Math.min(1, v / 160)]
    })
  // fewer front clumps low in the middle, so the branch structure reads there
  const keepFront = (x, y) => (y > iy - 40 && Math.abs(x - ix) < 190 ? 0.4 : 0.72)
  // little sprigs of blossom along bare stretches of the lower limbs
  const r = rng(t.seed + 5)
  const sprigs = []
  t.limbs.forEach(([pts, w0, w1]) => {
    const c = cr(pts, 8)
    c.forEach(([x, y], i) => {
      if (i % 5 !== 2) return
      const w = w0 + ((w1 - w0) * i) / (c.length - 1)
      let e = 0
      for (const [ex, ey, rx, ry] of t.env) e = Math.max(e, 1 - Math.hypot((x - ex) / rx, (y - ey) / ry))
      if (e > 0.12 || w > 20) return
      sprigs.push([x + (r() - 0.5) * 10, y - 6 - r() * 6, 11 + r() * 7])
    })
  })
  return {
    ...t,
    back: tier(canopy(t.seed, t.env, t.holes.map(([x, y, rr]) => [x, y, rr * 0.55]), 76, 44, 70, () => 0.97)),
    front: tier([...canopy(t.seed + 1, t.env, t.holes, 58, 26, 50, keepFront), ...t.tips, ...sprigs].sort((a, b) => a[1] - b[1])),
  }
}

const LT = buildTree(LEFT_TREE)
const RT = buildTree(RIGHT_TREE)

function cherryTree(t, glow) {
  const r = rng(t.seed)
  const top = t.trunk[t.trunk.length - 1]
  const sd = sunDir(top[0], top[1] + 400)
  const trunk = limb(t.trunk, t.tw[0], t.tw[1], sd)
  const limbs = t.limbs.map(([pts, w0, w1]) => limb(pts, w0, w1, sd))
  const all = [trunk, ...limbs].flatMap((l) => l.samples)
  // twigs from the nearest branch out to each front clump
  const by = ['', '', '']
  for (const [cx, cy, R] of t.front) {
    let best = all[0]
    let bd = Infinity
    for (const p of all) {
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    if (bd < R * 0.45) continue
    const k = best.w > 8 ? 2 : best.w > 4.5 ? 1 : 0
    const mx = (best.x + cx) / 2 + (r() - 0.5) * 20
    const my = (best.y + cy) / 2 - 6 - r() * 8
    by[k] += `M ${f(best.x)} ${f(best.y)} Q ${f(mx)} ${f(my)} ${f(cx)} ${f(cy + R * 0.25)} `
    if (r() < 0.3) {
      const a = Math.atan2(cy - best.y, cx - best.x) + (r() < 0.5 ? -0.7 : 0.7)
      by[0] += `M ${f(mx)} ${f(my)} L ${f(mx + Math.cos(a) * R * 0.6)} ${f(my + Math.sin(a) * R * 0.6)} `
    }
  }
  // cherry bark: short horizontal lenticels and a few creases
  let lent = ''
  let crack = ''
  trunk.samples.forEach((p, i) => {
    if (i % 2 || p.w < 14) return
    for (let k = 0; k < 2; k++) {
      const u = (r() - 0.5) * 1.1 * p.w
      const x = p.x + p.nx * u
      const y = p.y + p.ny * u + (r() - 0.5) * 8
      const len = 3 + r() * 5
      if (r() < 0.7) lent += `M ${f(x - len / 2)} ${f(y)} L ${f(x + len / 2)} ${f(y + 0.3)} `
      else crack += `M ${f(x)} ${f(y - 6)} q ${f((r() - 0.5) * 4)} 6 0 ${f(10 + r() * 8)} `
    }
  })
  const [bx, by0] = t.base
  const roots = `M ${bx - 62} ${by0 + 10} C ${bx - 40} ${by0 - 6}, ${bx - 26} ${by0 - 30}, ${bx - 22} ${by0 - 70} L ${bx + 24} ${by0 - 70} C ${bx + 28} ${by0 - 30}, ${bx + 44} ${by0 - 6}, ${bx + 66} ${by0 + 10} Z`
  return (
    <>
      {t.back.map(([x, y, R, k], i) => bloom(`b${i}`, t.seed * 31 + i, x, y, R, mixPal(BACK_TOP, BACK_LOW, k * 1.5 - 0.2), 0.5))}
      <path d={limbs.map((l) => l.body).join(' ')} fill="#55343d" />
      <path d={limbs.map((l) => l.dark).join(' ')} fill="#3d222a" />
      <path d={limbs.map((l) => l.lit).join(' ')} fill="#7b5560" opacity="0.8" />
      <path d={limbs.map((l) => l.hi).join(' ')} fill="#9c7680" opacity="0.7" />
      <path d={`${trunk.body} ${roots}`} fill="#55343d" />
      <path d={trunk.dark} fill="#3d222a" />
      <path d={trunk.lit} fill="#7b5560" opacity="0.85" />
      <path d={trunk.hi} fill="#a17a84" opacity="0.75" />
      <path d={lent} stroke="#a3848a" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      <path d={crack} stroke="#2d171d" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
      {by.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#4a2c34" strokeWidth={[1.8, 3.2, 5][i]} strokeLinecap="round" />
      ))}
      {t.front.map(([x, y, R, k], i) => bloom(`f${i}`, t.seed * 17 + i, x, y, R, mixPal(FRONT_TOP, FRONT_LOW, k * 1.6 - 0.35)))}
      {glow && <circle cx={SUN[0] + 30} cy={SUN[1] + 30} r="200" fill="url(#blossom-rim-g)" />}
    </>
  )
}

// Each tree is its own composited plane so its sway costs no repaint.
function treeWrap(key, base, gustDelay, idle, children) {
  const o = `${f((base[0] / W) * 100)}% ${f((base[1] / H) * 100)}%`
  return (
    <div key={key} className="blossom-treewrap blossom-gust" style={{ transformOrigin: o, animationDuration: `${GUST}s`, animationDelay: `${gustDelay}s` }}>
      <div className="blossom-treewrap blossom-idle" style={{ transformOrigin: o, animationDuration: `${idle[0]}s`, animationDelay: `${idle[1]}s` }}>
        {children}
      </div>
    </div>
  )
}

const GR = ridge([[-220, 842], [200, 810], [560, 836], [900, 822], [1240, 806], [1660, 838]])

function groundPetals(seed) {
  const r = rng(seed)
  let a = ''
  let b = ''
  const spots = [
    [180, 70, 260],
    [1300, 60, 260],
    [700, 40, 520],
  ]
  for (const [cx, n, spread] of spots) {
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * spread * (0.4 + r())
      const y = GR.y(x) + 8 + r() * 46
      const d = petalD(x, y, 0.45 + r() * 0.35, r() * 6.28)
      if (r() < 0.5) a += d
      else b += d
    }
  }
  return (
    <>
      <path d={a} fill="#fbc6d6" />
      <path d={b} fill="#fde6ee" />
    </>
  )
}

function grassEdge(seed) {
  const r = rng(seed)
  let d = ''
  for (let i = 0; i < 150; i++) {
    const x = -200 + r() * (W + 400)
    const y = GR.y(x) + 3
    const h = 5 + r() * 9
    const l = (r() - 0.5) * 6
    d += `M ${f(x - 1.6)} ${f(y)} Q ${f(x + l * 0.3)} ${f(y - h * 0.6)} ${f(x + l)} ${f(y - h)} Q ${f(x + l * 0.2 + 1)} ${f(y - h * 0.5)} ${f(x + 1.6)} ${f(y)} Z `
  }
  return d
}

function shedPetals(seed, tree, count, dly) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const [cx, cy, R] = tree.front[Math.floor(r() * tree.front.length)]
    const x = cx + (r() - 0.5) * R
    const y = cy + (r() - 0.5) * R * 0.6
    const s = 1.1 + r() * 0.8
    const dx = 220 + r() * 380
    const dy = 260 + r() * 340
    return (
      <path
        key={i}
        className="blossom-shed"
        d={petalD(x, y, s, r() * 6.28)}
        fill={`url(#blossom-pet-${i % 2 ? 'a' : 'b'})`}
        style={{
          '--blossom-dx': `${f(dx)}px`,
          '--blossom-dy': `${f(dy)}px`,
          '--blossom-rz': `${Math.round(300 + r() * 500) * (r() < 0.5 ? -1 : 1)}deg`,
          animationDuration: `${GUST}s`,
          animationDelay: `${f(dly + r() * 1.6)}s`,
        }}
      />
    )
  })
}

function tricklePetals(seed, tree, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const [cx, cy, R] = tree.front[Math.floor(r() * tree.front.length)]
    const x = cx + (r() - 0.5) * R
    const y = cy + R * 0.3
    const dur = 9 + r() * 6
    return (
      <path
        key={i}
        className="blossom-drop"
        d={petalD(x, y, 0.8 + r() * 0.5, r() * 6.28)}
        fill={`url(#blossom-pet-${i % 2 ? 'b' : 'a'})`}
        style={{
          '--blossom-dx': `${f(40 + r() * 120)}px`,
          '--blossom-dy': `${f(GR.y(x) - y + 10 + r() * 30)}px`,
          '--blossom-rz': `${Math.round(200 + r() * 300)}deg`,
          animationDuration: `${f(dur)}s`,
          animationDelay: `${f(-r() * dur)}s`,
        }}
      />
    )
  })
}

const petalDefs = (
  <defs>
    <linearGradient id="blossom-pet-a" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="#f59bb8" />
      <stop offset="1" stopColor="#fff0f5" />
    </linearGradient>
    <linearGradient id="blossom-pet-b" x1="0" y1="1" x2="0.3" y2="0">
      <stop offset="0" stopColor="#ef86a8" />
      <stop offset="1" stopColor="#ffd6e2" />
    </linearGradient>
  </defs>
)

const trees = (
  <>
    <Svg>
      <defs>
        <linearGradient id="blossom-gr-g" x1="0" y1="800" x2="0" y2="880" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#62aa5b" />
          <stop offset="1" stopColor="#3f874a" />
        </linearGradient>
        <radialGradient id="blossom-dapple-g">
          <stop offset="0" stopColor="#f8ffc8" stopOpacity="0.7" />
          <stop offset="1" stopColor="#f8ffc8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={GR.d} fill="url(#blossom-gr-g)" />
      <path d={grassEdge(4)} fill="#4f9a4c" />
      <path d={GR.crest} fill="none" stroke="#a6da84" strokeWidth="2.5" opacity="0.6" />
      <ellipse cx="150" cy="862" rx="190" ry="20" fill="#2f6e3a" opacity="0.5" />
      <ellipse cx="1330" cy="856" rx="200" ry="20" fill="#2f6e3a" opacity="0.5" />
      {groundPetals(13)}
      {[
        [80, 848, 60, 9, 5.5],
        [300, 838, 70, 8, 7],
        [1180, 832, 70, 9, 6.2],
        [1420, 846, 60, 8, 8],
        [960, 832, 80, 8, 9.5],
      ].map(([x, y, rx, ry, d], i) => (
        <ellipse key={i} className="blossom-dapple" cx={x} cy={y} rx={rx} ry={ry} fill="url(#blossom-dapple-g)" style={{ animationDuration: `${d}s`, animationDelay: `${-i * 1.9}s` }} />
      ))}
    </Svg>
    {treeWrap('l', LEFT_TREE.base, 0, [8.5, -3], <Svg>{cherryTree(LT, false)}</Svg>)}
    {treeWrap(
      'r',
      RIGHT_TREE.base,
      0.7,
      [10, -7],
      <Svg>
        <defs>
          <radialGradient id="blossom-rim-g">
            <stop offset="0" stopColor="#fffbe9" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#fff4ea" stopOpacity="0.3" />
            <stop offset="1" stopColor="#fff4ea" stopOpacity="0" />
          </radialGradient>
        </defs>
        {cherryTree(RT, true)}
      </Svg>,
    )}
    <Svg>
      {petalDefs}
      {shedPetals(81, LT, 14, 0)}
      {shedPetals(83, RT, 11, 0.7)}
      {tricklePetals(85, LT, 3)}
      {tricklePetals(87, RT, 3)}
    </Svg>
  </>
)

/* ---------- wildflowers, butterflies & bees ---------- */

const FG = ridge([[-220, 868], [300, 852], [760, 870], [1180, 856], [1660, 868]])

function tuft(i, x, h, seed) {
  const r = rng(seed)
  const base = FG.y(x) + 16
  let dark = ''
  let lit = ''
  const blades = 5 + Math.floor(r() * 4)
  for (let b = 0; b < blades; b++) {
    const bx = x + (b - blades / 2) * 6.5
    const lean = (r() - 0.45) * 56
    const bh = h * (0.55 + r() * 0.45)
    const w = 3.2 + r() * 1.6
    const d = `M ${f(bx - w)} ${base} Q ${f(bx + lean * 0.3)} ${f(base - bh * 0.6)} ${f(bx + lean)} ${f(base - bh)} Q ${f(bx + lean * 0.2 + w * 0.7)} ${f(base - bh * 0.5)} ${f(bx + w)} ${base} Z `
    if (b % 3 === 1) lit += d
    else dark += d
  }
  return (
    <g
      key={i}
      className="blossom-grass"
      style={{ '--blossom-k': (0.8 + r() * 0.5).toFixed(2), animationDuration: `${GUST}s`, animationDelay: `${f(0.2 + (x / W) * 1.4 + r() * 0.5)}s` }}
    >
      <path d={dark} fill={['#2e6f37', '#357a3d', '#2a6634'][i % 3]} />
      <path d={lit} fill="#5ea852" />
    </g>
  )
}

function daisy(cx, cy, rr, n) {
  let d = ''
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.283
    const tx = cx + Math.cos(a) * rr
    const ty = cy + Math.sin(a) * rr * 0.72
    const px = -Math.sin(a) * rr * 0.2
    const py = Math.cos(a) * rr * 0.2 * 0.72
    const mx = cx + Math.cos(a) * rr * 0.5
    const my = cy + Math.sin(a) * rr * 0.5 * 0.72
    d += `M ${f(cx)} ${f(cy)} Q ${f(mx + px)} ${f(my + py)} ${f(tx)} ${f(ty)} Q ${f(mx - px)} ${f(my - py)} ${f(cx)} ${f(cy)} Z `
  }
  return d
}

function flower({ x, h, kind, k, delay }) {
  const base = FG.y(x) + 16
  const tx = x + (k - 1) * 10
  const ty = base - h
  const stem = `M ${x} ${f(base)} Q ${f(x - 6)} ${f(base - h * 0.5)} ${f(tx)} ${f(ty)}`
  const leaf = `M ${f(x - 2)} ${f(base - h * 0.3)} q -14 -6 -18 -16 q 12 2 18 16 Z`
  return (
    <g className="blossom-grass" style={{ '--blossom-k': (0.5 + k * 0.2).toFixed(2), animationDuration: `${GUST}s`, animationDelay: `${f(delay)}s` }}>
      <path d={stem} stroke="#4c8d42" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d={leaf} fill="#4f9446" />
      {kind === 'daisy' && (
        <>
          <path d={daisy(tx, ty, 13, 12)} fill="#e9e6f4" transform="translate(1 1.6)" />
          <path d={daisy(tx, ty, 13, 12)} fill="#ffffff" />
          <ellipse cx={tx} cy={ty} rx="4.6" ry="3.6" fill="#ffc23d" />
          <ellipse cx={tx + 1} cy={ty - 1} rx="2" ry="1.4" fill="#ffe38a" />
        </>
      )}
      {kind === 'dandelion' && (
        <>
          <path d={daisy(tx, ty, 11, 16)} fill="#f2b51f" />
          <path d={daisy(tx, ty - 1, 7.5, 12)} fill="#ffd94a" />
          <circle cx={tx + 1} cy={ty - 2} r="2.4" fill="#fff0a0" />
        </>
      )}
      {kind === 'clover' && (
        <>
          <path d={`${circ(tx, ty, 8)}`} fill="#d9709e" />
          <path d={`${circ(tx - 3, ty - 3, 3.4)} ${circ(tx + 3, ty - 2, 3)} ${circ(tx, ty + 2, 3.2)} ${circ(tx + 4, ty + 3, 2.4)} ${circ(tx - 4, ty + 2, 2.4)}`} fill="#f4a6c6" />
          <path d={`${circ(tx - 2, ty - 4, 1.6)} ${circ(tx + 2, ty - 4, 1.4)}`} fill="#ffd9e8" />
        </>
      )}
      {kind === 'puff' && (
        <>
          <circle cx={tx} cy={ty} r="13" fill="#ffffff" opacity="0.55" />
          <path d={daisy(tx, ty, 12, 22)} fill="#ffffff" opacity="0.85" />
          <circle cx={tx} cy={ty} r="2.6" fill="#c9b48c" />
        </>
      )}
    </g>
  )
}


function butterfly({ x, y, s, c1, c2, path, dur, delay, flap, tilt = 0 }) {
  const wings = (
    <>
      <path d={WING_HIND} fill={c2} />
      <path d={WING_FORE} fill={c1} />
      <path d="M -3 -6 C -10 -14, -18 -20, -24 -17" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="1" />
      <path d={`${circ(-22, -15, 2.2)} ${circ(-25, -10, 1.4)}`} fill="#fff" opacity="0.85" />
      <path d="M -28 -17 C -31 -9, -20 -1, -8 -1" fill="none" stroke="#3b2a35" strokeOpacity="0.35" strokeWidth="1.6" />
    </>
  )
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${tilt})`}>
      <g className={`blossom-wander blossom-wander-${path}`} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g className="blossom-flutter" style={{ animationDuration: `${flap}s`, animationDelay: `${delay / 9}s` }}>
          {wings}
          <g transform="scale(-1 1)">{wings}</g>
        </g>
        <ellipse cx="0" cy="2" rx="1.7" ry="8" fill="#3b2a35" />
        <circle cx="0" cy="-6.5" r="2.2" fill="#3b2a35" />
        <path d="M -0.6 -8 Q -3 -14 -6 -16 M 0.6 -8 Q 3 -14 6 -16" stroke="#3b2a35" strokeWidth="0.8" fill="none" />
        <path d={`${circ(-6, -16, 1)} ${circ(6, -16, 1)}`} fill="#3b2a35" />
      </g>
    </g>
  )
}

function bee({ x, y, s, path, dur, delay }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`blossom-hover blossom-hover-${path}`} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g className="blossom-buzz">
          <ellipse cx="-2" cy="-6" rx="4" ry="6.5" fill="#f3f9ff" opacity="0.8" transform="rotate(-28 -2 -6)" />
          <ellipse cx="3" cy="-6" rx="3.6" ry="6" fill="#e6f1fb" opacity="0.8" transform="rotate(22 3 -6)" />
        </g>
        <ellipse cx="0" cy="0" rx="7.5" ry="5.4" fill="#ffc83a" />
        <path d="M -2.5 -5 Q -1 0 -2.5 5 L -0.6 5.3 Q 1 0 -0.6 -5.3 Z M 2 -4.8 Q 3.6 0 2 4.8 L 3.8 4.2 Q 5.2 0 3.8 -4.2 Z" fill="#3a2a1c" />
        <path d="M 7.2 -0.6 L 10 0 L 7.2 0.8 Z" fill="#3a2a1c" />
        <circle cx="-7.6" cy="-0.4" r="3.6" fill="#3a2a1c" />
        <ellipse cx="1" cy="-2.6" rx="4" ry="1.3" fill="#ffe48a" opacity="0.8" />
      </g>
    </g>
  )
}

const TUFTS = [
  [-80, 120], [-20, 104], [40, 130], [96, 96], [150, 84], [224, 70], [330, 58], [560, 44], [880, 48], [1110, 66], [1196, 84], [1262, 104], [1330, 96], [1400, 126], [1470, 112],
]

const meadowLife = (
  <Svg>
    <defs>
      <linearGradient id="blossom-fg-g" x1="0" y1="840" x2="0" y2="900" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#3f8a45" />
        <stop offset="1" stopColor="#2b6833" />
      </linearGradient>
    </defs>
    <path d={FG.d} fill="url(#blossom-fg-g)" />
    <path d={FG.crest} fill="none" stroke="#69ad5a" strokeWidth="2" opacity="0.7" />
    {TUFTS.map(([x, h], i) => tuft(i, x, h, 100 + i * 3))}
    {flower({ x: 70, h: 92, kind: 'daisy', k: 1.2, delay: 0.3 })}
    {flower({ x: 176, h: 70, kind: 'clover', k: 0.8, delay: 0.45 })}
    {flower({ x: 262, h: 58, kind: 'dandelion', k: 1.1, delay: 0.5 })}
    {flower({ x: 404, h: 44, kind: 'daisy', k: 0.9, delay: 0.65 })}
    {flower({ x: 1048, h: 46, kind: 'daisy', k: 1, delay: 1.25 })}
    {flower({ x: 1150, h: 64, kind: 'dandelion', k: 0.9, delay: 1.35 })}
    {flower({ x: 1238, h: 84, kind: 'puff', k: 1.1, delay: 1.4 })}
    {flower({ x: 1300, h: 66, kind: 'clover', k: 1.2, delay: 1.45 })}
    {flower({ x: 1376, h: 100, kind: 'daisy', k: 0.8, delay: 1.55 })}
    {flower({ x: 22, h: 60, kind: 'dandelion', k: 1.1, delay: 0.25 })}
    {butterfly({ x: 520, y: 630, s: 1.45, c1: '#ffd95e', c2: '#ffb648', path: 'a', dur: 22, delay: -4, flap: 0.62, tilt: -8 })}
    {butterfly({ x: 870, y: 540, s: 1.2, c1: '#fff8ee', c2: '#ffcfde', path: 'b', dur: 27, delay: -15, flap: 0.55, tilt: 6 })}
    {butterfly({ x: 1080, y: 690, s: 1.6, c1: '#ff9ec0', c2: '#ff7ea8', path: 'c', dur: 19, delay: -9, flap: 0.66, tilt: -4 })}
    {butterfly({ x: 300, y: 520, s: 1.1, c1: '#a9d6ff', c2: '#cfe6ff', path: 'b', dur: 31, delay: -21, flap: 0.58, tilt: 10 })}
    {bee({ x: 150, y: 738, s: 1.5, path: 'a', dur: 7.5, delay: -2 })}
    {bee({ x: 1270, y: 730, s: 1.4, path: 'b', dur: 9, delay: -5 })}
  </Svg>
)

/* ---------- drifting petals ---------- */

function petals(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = -260 + r() * (W + 300)
    const y = -30 - r() * 20
    const s = 0.75 + r() * 0.95
    const dur = 11 + r() * 9
    return (
      <path
        key={i}
        className={`blossom-petal blossom-petal-${'abc'[i % 3]}`}
        d={petalD(x, y, s, r() * 6.28)}
        fill={`url(#blossom-pet-${r() < 0.5 ? 'a' : 'b'})`}
        opacity={(0.8 + r() * 0.2).toFixed(2)}
        style={{ animationDuration: `${dur.toFixed(1)}s`, animationDelay: `${(-r() * dur).toFixed(1)}s` }}
      />
    )
  })
}

function gustPetals(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = -120 + r() * 360
    const y = 160 + r() * 380
    return (
      <path
        key={i}
        className="blossom-gustpetal"
        d={petalD(x, y, 1.2 + r() * 0.8, r() * 6.28)}
        fill={`url(#blossom-pet-${i % 2 ? 'a' : 'b'})`}
        style={{
          '--blossom-dx': `${f(1300 + r() * 400)}px`,
          '--blossom-dy': `${f(120 + r() * 260)}px`,
          '--blossom-rz': `${Math.round(500 + r() * 400)}deg`,
          animationDuration: `${GUST}s`,
          animationDelay: `${f(0.2 + r() * 1.4)}s`,
        }}
      />
    )
  })
}

const fallingPetals = (
  <Svg>
    {petalDefs}
    {petals(71, 13)}
    {gustPetals(73, 6)}
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'blossom',
  name: 'Blossom Valley',
  tag: 'Spring morning',
  accent: '#ff6f9f',
  accent2: '#7cc98f',
  ink: '#b3245e',
  glow: '#ffb3cb',
  light: true,
  clockColor: '#3b2142',
  sky: 'linear-gradient(180deg,#8ec5ee 0%,#acd6f4 24%,#cfe7f6 46%,#ecf1f3 64%,#fbeee9 80%,#fde3e6 100%)',
  layers: [
    { name: 'Sky and sun', depth: 0, sky: true, el: sky },
    { name: 'Far ranges', depth: 0.14, el: farMountains },
    { name: 'Waterfall hills', depth: 0.28, el: waterfallHills },
    { name: 'Depth clock', depth: 0.4, clock: true },
    { name: 'Stream meadow', depth: 0.56, el: meadow },
    { name: 'Sunbeams', depth: 0.74, el: sunbeams },
    { name: 'Cherry trees', depth: 0.9, el: trees },
    { name: 'Wildflowers', depth: 1.1, el: meadowLife },
    { name: 'Drifting petals', depth: 1.3, el: fallingPetals },
  ],
}
