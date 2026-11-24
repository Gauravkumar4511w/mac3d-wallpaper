// Abyss Bloom: a deep reef where the light from the surface fades into glowing
// life. The rippling surface seen from below, god rays breathing down through
// teal water, jellyfish pulsing at three depths, a manta gliding past a
// travelling school of fish, kelp forests swaying on both sides, garden eels
// in a sunlit sand clearing, and a reef that blooms with anemones, sea fans and
// bioluminescent coral in the dark.

import './abyss.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- helpers ---------- */

const t2 = (n) => n.toFixed(2)
const anim = (r, min, span, maxDelay = min + span) => ({
  animationDuration: `${t2(min + r() * span)}s`,
  animationDelay: `${t2(-r() * maxDelay)}s`,
})

// Catmull-Rom spline through points, as cubic Béziers.
function spline(pts, closed = false) {
  const n = pts.length
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.min(Math.max(i, 0), n - 1)])
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`
  }
  return closed ? `${d} Z` : d
}

// A filled mass under a spline profile.
const ground = (pts, bottom = H + 40) => `${spline(pts)} L ${f(pts[pts.length - 1][0])} ${bottom} L ${f(pts[0][0])} ${bottom} Z`

// A band hugging the top of a profile (where light lands on rock).
const topBand = (pts, depth) => `${spline(pts)} L ${f(pts[pts.length - 1][0])} ${f(pts[pts.length - 1][1] + depth)} ${spline(pts.map(([x, y]) => [x, y + depth]).reverse()).replace('M', 'L')} Z`

// Height of a profile at x (linear between points; close enough to the spline).
function yAt(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return pts[x < pts[0][0] ? 0 : pts.length - 1][1]
}

// Irregular closed blob.
function blob(r, cx, cy, rx, ry, n = 7, jit = 0.3) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + r() * 0.3
    const k = 1 + (r() - 0.5) * jit
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]
  })
  return spline(pts, true)
}

// Many tiny dots as a single path.
function dots(r, n, x0, x1, y0, y1, rMin, rMax) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0)
    const y = y0 + r() * (y1 - y0)
    const rr = rMin + r() * (rMax - rMin)
    d += `M ${f(x - rr)} ${f(y)} a ${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0 a ${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0 `
  }
  return d
}

// Clip a convex polygon to the half-plane closer to p than to its neighbour.
function clipHalf(poly, m, dir) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = (a[0] - m[0]) * dir[0] + (a[1] - m[1]) * dir[1]
    const db = (b[0] - m[0]) * dir[0] + (b[1] - m[1]) * dir[1]
    if (da <= 0) out.push(a)
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

// Caustic web: a sheet with rounded Voronoi cells cut out of it (even-odd),
// so what is left is a net of thin bright lines that swell at the junctions.
// Squashed vertically for surfaces seen at a grazing angle.
function causticWeb(seed, x0, x1, y0, y1, cell, squash, k = 0.86) {
  const r = rng(seed)
  const dy = cell * 0.866
  const rows = Math.ceil((y1 - y0) / (dy * squash)) + 2
  const cols = Math.ceil((x1 - x0) / cell) + 2
  const pts = []
  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      pts.push([x0 + (i + (j % 2 ? 0.5 : 0)) * cell + (r() - 0.5) * cell * 0.75, j * dy + (r() - 0.5) * dy * 0.75])
    }
  }
  const sq = ([x, y]) => `${f(x)} ${f(y0 + y * squash)}`
  let d = `M ${x0 - cell * 2} ${f(y0 - cell)} H ${x1 + cell * 2} V ${f(y1 + cell)} H ${x0 - cell * 2} Z `
  for (const p of pts) {
    const R = cell * 1.4
    let poly = [
      [p[0] - R, p[1] - R],
      [p[0] + R, p[1] - R],
      [p[0] + R, p[1] + R],
      [p[0] - R, p[1] + R],
    ]
    for (const q of pts) {
      if (q === p) continue
      const ddx = q[0] - p[0]
      const ddy = q[1] - p[1]
      if (ddx * ddx + ddy * ddy > cell * cell * 4.8) continue
      poly = clipHalf(poly, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [ddx, ddy])
    }
    const n = poly.length
    if (n < 3) continue
    const cx = poly.reduce((s, v) => s + v[0], 0) / n
    const cy = poly.reduce((s, v) => s + v[1], 0) / n
    const v = poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k])
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    d += `M ${sq(mid(v[n - 1], v[0]))} `
    for (let i = 0; i < n; i++) d += `Q ${sq(v[i])} ${sq(mid(v[i], v[(i + 1) % n]))} `
    d += 'Z '
  }
  return d
}

/* ---------- glow gradients (each layer carries its own copies) ---------- */

const glowGrad = (id, color, a = 0.55) => (
  <radialGradient id={id} key={id}>
    <stop offset="0" stopColor={color} stopOpacity={a} />
    <stop offset="0.3" stopColor={color} stopOpacity={a * 0.45} />
    <stop offset="1" stopColor={color} stopOpacity="0" />
  </radialGradient>
)

function glowDots(seed, pts, grad, core, size, min = 2.6, span = 3.4) {
  const r = rng(seed)
  return pts.map(([x, y, s = 1], i) => (
    <g key={i} className="abyss-glow" style={anim(r, min, span, 8)}>
      <circle cx={f(x)} cy={f(y)} r={f(size * 6 * s)} fill={`url(#${grad})`} />
      <circle cx={f(x)} cy={f(y)} r={f(size * s)} fill={core} />
    </g>
  ))
}

/* ---------- surface light (sky plate) ---------- */

const SUN = { x: 400, y: -320 }

function waveBand(y, amp, period, top = -40) {
  const x0 = -PAD - period * 2
  const x1 = W + PAD + period * 2
  let d = `M ${x0} ${top} L ${x0} ${y}`
  let x = x0
  while (x < x1) {
    d += ` q ${f(period / 4)} ${f(-amp * 2)} ${f(period / 2)} 0 q ${f(period / 4)} ${f(amp * 2)} ${f(period / 2)} 0`
    x += period
  }
  return `${d} L ${x} ${top} Z`
}

function waveLine(y, amp, period) {
  const x0 = -PAD - period * 2
  const x1 = W + PAD + period * 2
  let d = `M ${x0} ${y}`
  for (let x = x0; x < x1; x += period) {
    d += ` q ${f(period / 4)} ${f(-amp * 2)} ${f(period / 2)} 0 q ${f(period / 4)} ${f(amp * 2)} ${f(period / 2)} 0`
  }
  return d
}

// Rays fan out from a point above the frame; each is a soft wedge (a wide
// faint polygon around a narrow brighter core).
const RAYS = [
  // angle (deg from vertical), angular width, strength
  [-26, 0.07, 0.55],
  [-14, 0.12, 0.75],
  [-4, 0.045, 1],
  [6, 0.09, 0.7],
  [15, 0.035, 0.9],
  [24, 0.11, 0.6],
  [34, 0.05, 0.75],
  [44, 0.08, 0.45],
]

function ray([deg, k, o], i, r) {
  const a = (deg * Math.PI) / 180
  const yTop = -10
  const yBot = 860
  const dt = yTop - SUN.y
  const db = yBot - SUN.y
  const xt = SUN.x + Math.tan(a) * dt
  const xb = SUN.x + Math.tan(a) * db
  const wt = k * dt
  const wb = k * db
  const wedge = (s) => `${f(xt - wt * s)},${yTop} ${f(xt + wt * s)},${yTop} ${f(xb + wb * s)},${yBot} ${f(xb - wb * s)},${yBot}`
  return (
    <g key={i} className="abyss-ray" style={{ transformOrigin: `${SUN.x}px ${SUN.y}px`, ...anim(r, 12, 10, 24) }} opacity={o}>
      <polygon points={wedge(0.5)} fill="url(#abyss-ray-g)" />
      <polygon points={wedge(0.2)} fill="url(#abyss-ray-g)" />
    </g>
  )
}

function surfaceCells(seed, n, y0, y1) {
  const r = rng(seed)
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = -PAD + r() * (W + 2 * PAD)
    const y = y0 + r() * (y1 - y0)
    const rx = 26 + r() * 70
    d += `${blob(r, x, y, rx, 3 + r() * 5, 6, 0.3)} `
  }
  return d
}

const skyRand = rng(3)
const surfaceLight = (
  <Svg>
    <defs>
      <radialGradient id="abyss-sun-g" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#effffb" stopOpacity="0.7" />
        <stop offset="0.3" stopColor="#bdf7f1" stopOpacity="0.3" />
        <stop offset="0.65" stopColor="#8fe6e6" stopOpacity="0.08" />
        <stop offset="1" stopColor="#8fe6e6" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="abyss-ray-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dafff8" stopOpacity="0.26" />
        <stop offset="0.35" stopColor="#bff6f0" stopOpacity="0.13" />
        <stop offset="0.75" stopColor="#9fe8ec" stopOpacity="0.04" />
        <stop offset="1" stopColor="#9fe8ec" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="abyss-top-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d8fff8" stopOpacity="0.5" />
        <stop offset="1" stopColor="#d8fff8" stopOpacity="0" />
      </linearGradient>
    </defs>
    <ellipse className="abyss-sun" cx="440" cy="20" rx="820" ry="470" fill="url(#abyss-sun-g)" />
    <rect x={-PAD} y="-40" width={W + 2 * PAD} height="190" fill="url(#abyss-top-g)" />
    {RAYS.map((x, i) => ray(x, i, skyRand))}
    {/* the underside of the surface: undulating bands and bright cells */}
    <path className="abyss-surf" d={waveBand(104, 7, 180)} fill="#9eece9" fillOpacity=".16" style={{ '--abyss-p': '180px', animationDuration: '11s' }} />
    <path className="abyss-surf" d={waveBand(80, 5, 130)} fill="#c4faf4" fillOpacity=".16" style={{ '--abyss-p': '-130px', animationDuration: '8s' }} />
    <path className="abyss-surf" d={waveBand(58, 4, 96)} fill="#e6fffb" fillOpacity=".22" style={{ '--abyss-p': '96px', animationDuration: '6.5s' }} />
    <path className="abyss-surf" d={waveLine(126, 4, 210)} stroke="#d4fff9" strokeOpacity=".14" strokeWidth="2" fill="none" style={{ '--abyss-p': '-210px', animationDuration: '14s' }} />
    <path className="abyss-surf" d={waveLine(146, 3, 260)} stroke="#d4fff9" strokeOpacity=".08" strokeWidth="2" fill="none" style={{ '--abyss-p': '260px', animationDuration: '19s' }} />
    <path className="abyss-cells" d={surfaceCells(5, 46, 48, 100)} fill="#f2fffc" fillOpacity=".32" style={{ animationDuration: '9s' }} />
    <path className="abyss-cells abyss-cells-b" d={surfaceCells(8, 34, 60, 118)} fill="#e0fffa" fillOpacity=".2" style={{ animationDuration: '12s', animationDelay: '-5s' }} />
  </Svg>
)

/* ---------- jellyfish parts (shared by far and near jellies) ---------- */

const BELL = (() => {
  let d = 'M -40 0 C -42 -30, -24 -50, 0 -50 C 24 -50, 42 -30, 40 0'
  const lobes = 9
  for (let i = 0; i < lobes; i++) {
    const xa = 40 - (i + 0.5) * (80 / lobes)
    const xb = 40 - (i + 1) * (80 / lobes)
    d += ` Q ${f(xa)} 7 ${f(xb)} 0`
  }
  return `${d} Z`
})()
const INNER_BELL = 'M -29 0 C -30 -22, -17 -37, 0 -37 C 17 -37, 30 -22, 29 0 Z'
const CANALS = [-31, -19, -7, 7, 19, 31].map((x) => `M ${x * 0.12} -48 C ${f(x * 0.95)} -46, ${f(x * 1.08)} -24, ${x} -1`).join(' ')

// Wavy tentacles hanging from the rim.
function tentacles(r, n, minL, maxL, spread = 36, amp = 9) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x0 = -spread + (i / (n - 1)) * spread * 2 + (r() - 0.5) * 4
    const L = minL + r() * (maxL - minL)
    const fr = 1.6 + r() * 1.6
    const ph = r() * 6.3
    const a = amp * (0.6 + r() * 0.8)
    const pts = Array.from({ length: 8 }, (_, k) => {
      const t = k / 7
      return [x0 + Math.sin(t * fr * Math.PI + ph) * a * t + (x0 / spread) * 10 * t, 3 + t * L]
    })
    d += `${spline(pts)} `
  }
  return d
}

/* ---------- distant drifters ---------- */

function farJelly(seed, x, y, s, color, rise) {
  const r = rng(seed)
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="abyss-farjelly" style={{ '--abyss-rise': `${f(-rise / s)}px`, ...anim(r, 70, 40, 110) }}>
        <g className="abyss-minipulse" style={anim(r, 3.2, 1.6, 5)}>
          <path d={tentacles(r, 7, 70, 120, 30, 6)} stroke={color} strokeOpacity=".45" strokeWidth="2.2" fill="none" />
          <path d={BELL} fill={color} fillOpacity=".66" />
          <path d={INNER_BELL} fill="#fff" fillOpacity=".14" />
          <ellipse cx="-14" cy="-32" rx="10" ry="6" fill="#fff" fillOpacity=".3" />
        </g>
      </g>
    </g>
  )
}

// Small fish facing left (dir 1) or right (dir -1), head at x.
function fishShape(x, y, s, dir = 1) {
  const k = dir * s
  return `M ${f(x)} ${f(y)} C ${f(x + 4 * k)} ${f(y - 3.6 * s)}, ${f(x + 10 * k)} ${f(y - 3.6 * s)}, ${f(x + 13 * k)} ${f(y)} C ${f(x + 10 * k)} ${f(y + 3.6 * s)}, ${f(x + 4 * k)} ${f(y + 3.6 * s)}, ${f(x)} ${f(y)} Z M ${f(x + 12 * k)} ${f(y)} L ${f(x + 18 * k)} ${f(y - 4 * s)} L ${f(x + 16.5 * k)} ${f(y)} L ${f(x + 18 * k)} ${f(y + 4 * s)} Z`
}

// A school: a teardrop cloud of fish split into sub-groups that drift
// against each other, so the shoal stretches and folds as it swims.
function school(seed, n, rx, ry, size, groups) {
  const r = rng(seed)
  const subs = Array.from({ length: groups }, () => '')
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r())
    const u = Math.cos(a) * d
    // fatter at the head (left), tapering to the tail (right)
    const x = u * rx
    const y = Math.sin(a) * d * ry * (1 - 0.45 * (u + 1) * 0.5) - u * ry * 0.25
    const s = size * (0.8 + r() * 0.4)
    const g = Math.min(groups - 1, Math.floor(((u + 1) / 2) * groups))
    subs[g] += `${fishShape(x, y, s, 1)} `
  }
  return subs
}

const farSchool = school(23, 36, 80, 24, 0.5, 1)[0]

const distantDrifters = (
  <Svg>
    <defs>{glowGrad('abyss-dg-cyan', '#7ff6ff', 0.5)}</defs>
    <g className="abyss-snow-sway" style={{ animationDuration: '17s' }}>
      <g className="abyss-snow-fall" style={{ animationDuration: '150s' }}>
        <path d={dots(rng(31), 80, -PAD, W + PAD, 0, H, 0.6, 1.3)} fill="#cdeff7" fillOpacity=".4" />
        <path d={dots(rng(31), 80, -PAD, W + PAD, 0, H, 0.6, 1.3)} fill="#cdeff7" fillOpacity=".4" transform={`translate(0 ${-H})`} />
      </g>
    </g>
    {farJelly(41, 210, 740, 0.5, '#e3c6ff', 620)}
    {farJelly(43, 1230, 820, 0.56, '#ffc6ee', 700)}
    {farJelly(47, 1000, 700, 0.36, '#cfe6ff', 560)}
    <g transform="translate(0 486)">
      <g className="abyss-farschool" style={{ animationDuration: '78s', animationDelay: '-30s' }}>
        <g className="abyss-wobble" style={{ animationDuration: '7s' }}>
          <path d={farSchool} fill="#8fd0e2" fillOpacity=".42" />
        </g>
      </g>
    </g>
    {glowDots(52, [[1320, 566, 0.5]], 'abyss-dg-cyan', '#c9fbff', 1.4)}
  </Svg>
)

/* ---------- far reef ---------- */

function reefLine(seed, base, amp, n, jx = 40) {
  const r = rng(seed)
  return Array.from({ length: n + 1 }, (_, i) => [
    -PAD + (i * (W + 2 * PAD)) / n + (i && i < n ? (r() - 0.5) * jx : 0),
    base - amp * (0.2 + 0.8 * r()),
  ])
}

// Rounded coral heads sitting on a profile.
function knobs(seed, pts, xs, size) {
  const r = rng(seed)
  return xs
    .map((x) => {
      const y = yAt(pts, x) + 6
      const rx = size * (0.5 + r() * 0.8)
      return blob(r, x, y, rx, rx * (0.5 + r() * 0.35), 7, 0.25)
    })
    .join(' ')
}

// Table corals: flat plates on short stalks, the reef's signature silhouette.
function tables(pts, specs) {
  return specs
    .map(([x, w, h]) => {
      const base = yAt(pts, x) + 6
      const top = base - h
      return `M ${f(x - 5)} ${f(base)} L ${f(x - 3)} ${f(top)} L ${f(x + 3)} ${f(top)} L ${f(x + 5)} ${f(base)} Z M ${f(x - w / 2)} ${f(top + 2)} C ${f(x - w * 0.3)} ${f(top - w * 0.13)}, ${f(x + w * 0.3)} ${f(top - w * 0.13)}, ${f(x + w / 2)} ${f(top + 2)} C ${f(x + w * 0.2)} ${f(top + w * 0.06)}, ${f(x - w * 0.2)} ${f(top + w * 0.06)}, ${f(x - w / 2)} ${f(top + 2)} Z`
    })
    .join(' ')
}

// A knobbly rock spire: jittered edges narrowing to a rounded top.
function spire(seed, x, base, w, h, lean = 0) {
  const r = rng(seed)
  const n = 6
  const left = []
  const right = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const hw = (w / 2) * (1 - t * 0.62) * (0.85 + r() * 0.3)
    const cx = x + lean * t * t
    left.push([cx - hw, base - t * h])
    right.push([cx + hw * (0.85 + r() * 0.3), base - t * h])
  }
  return `${spline([...left, [x + lean, base - h - w * 0.18], ...right.reverse()])} Z`
}

const RIDGE_A = reefLine(61, 598, 64, 11)
const RIDGE_B = [
  [-220, 676], [-40, 662], [120, 672], [260, 652], [380, 668], [520, 656], [640, 670],
  [760, 680], [900, 668], [1040, 646], [1160, 656], [1300, 668], [1440, 656], [1660, 664],
]
// A natural arch: a lopsided rock bridge with an irregular window onto the deep.
const ARCH_OUT = [[498, 704], [504, 650], [494, 600], [506, 560], [536, 532], [578, 520], [624, 518], [664, 530], [692, 556], [700, 596], [708, 650], [716, 704]]
const ARCH_IN = [[548, 704], [550, 664], [560, 624], [580, 594], [606, 580], [634, 586], [652, 612], [660, 656], [664, 704]]
const ARCH_D = `${spline(ARCH_OUT)} Z ${spline(ARCH_IN)} Z`
const ARCH_LIT = spline(ARCH_OUT.slice(2, 10))

function farKelp(seed, xs, base) {
  const r = rng(seed)
  return xs
    .map((x) => {
      const h = 90 + r() * 120
      const y0 = yAt(base, x) + 4
      const w1 = (r() - 0.5) * 30
      const w2 = (r() - 0.5) * 30
      return `M ${f(x)} ${f(y0)} C ${f(x + w1)} ${f(y0 - h * 0.35)}, ${f(x + w2)} ${f(y0 - h * 0.7)}, ${f(x + (r() - 0.5) * 16)} ${f(y0 - h)}`
    })
    .join(' ')
}

const farRand = rng(71)
const farReef = (
  <Svg>
    <defs>
      <clipPath id="abyss-ridge-a-clip">
        <path d={ground(RIDGE_A)} />
      </clipPath>
      <clipPath id="abyss-ridge-b-clip">
        <path d={ground(RIDGE_B)} />
      </clipPath>
      <linearGradient id="abyss-far-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0a4a68" stopOpacity="0" />
        <stop offset="1" stopColor="#073a58" stopOpacity="0.95" />
      </linearGradient>
      {glowGrad('abyss-fg-cyan', '#7ff6ff', 0.6)}
      {glowGrad('abyss-fg-pink', '#ff8fd8', 0.6)}
    </defs>
    {/* farthest reef: pale with haze, table corals along the crest */}
    <path d={ground(RIDGE_A)} fill="#105a78" />
    <path d={knobs(5, RIDGE_A, [-120, 40, 150, 330, 470, 610, 870, 1100, 1240, 1380, 1520], 32)} fill="#105a78" />
    <path d={tables(RIDGE_A, [[250, 64, 26], [560, 48, 20], [990, 70, 28], [1310, 56, 22]])} fill="#105a78" />
    <path d={spline(RIDGE_A)} stroke="#2a87a3" strokeWidth="2" fill="none" strokeOpacity=".55" />
    <g clipPath="url(#abyss-ridge-a-clip)">
      <rect x={-PAD} y="560" width={W + 2 * PAD} height="150" fill="url(#abyss-far-haze)" />
    </g>
    {/* far kelp beds */}
    <g className="abyss-sway" style={{ transformOrigin: '260px 680px', '--abyss-amp': '1.4deg', ...anim(farRand, 9, 4) }}>
      <path d={farKelp(9, [40, 90, 130, 180, 260, 300, 350], RIDGE_B)} stroke="#0b4a66" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
    <g className="abyss-sway" style={{ transformOrigin: '1200px 680px', '--abyss-amp': '1.6deg', ...anim(farRand, 9, 4) }}>
      <path d={farKelp(19, [1080, 1120, 1170, 1230, 1290, 1340, 1390], RIDGE_B)} stroke="#0b4a66" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
    {/* nearer far reef: pinnacles and a natural arch beneath the clock */}
    <path d={ground(RIDGE_B)} fill="#0b4562" />
    <path d={knobs(13, RIDGE_B, [-60, 90, 200, 420, 760, 940, 1140, 1230, 1360, 1500], 28)} fill="#0b4562" />
    <path d={tables(RIDGE_B, [[150, 70, 30], [1120, 84, 34], [1410, 60, 26]])} fill="#0b4562" />
    <path d={spire(3, 1004, 660, 34, 104, -8)} fill="#0b4562" />
    <path d={spire(5, 1030, 662, 22, 62, 4)} fill="#0b4562" />
    <path d={spire(7, 396, 676, 26, 70, 5)} fill="#0b4562" />
    <path fillRule="evenodd" fill="#0b4562" d={ARCH_D} />
    <path d={knobs(17, [[520, 518], [700, 518]], [548, 596, 664], 16)} fill="#0b4562" />
    <path d={tables([[560, 520], [640, 520]], [[612, 46, 18]])} fill="#0b4562" />
    <path d={spline(RIDGE_B)} stroke="#1b6a87" strokeWidth="2" fill="none" strokeOpacity=".6" />
    <path d={ARCH_LIT} stroke="#2a7f9c" strokeOpacity=".7" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <g clipPath="url(#abyss-ridge-b-clip)">
      <rect x={-PAD} y="640" width={W + 2 * PAD} height="120" fill="url(#abyss-far-haze)" opacity=".7" />
    </g>
    {glowDots(29, [[180, 668], [430, 664, 0.8], [1060, 654, 0.8]], 'abyss-fg-cyan', '#d6fdff', 1.5)}
    {glowDots(33, [[880, 678, 0.8]], 'abyss-fg-pink', '#ffe0f4', 1.5)}
  </Svg>
)

/* ---------- manta & school ---------- */

// Seen from below as it glides overhead, heading right: a plan-view manta
// (span along y) slightly squashed by the viewing angle, pale belly with gill
// slits, dark wing margins, cephalic horns and a whip tail.
const MANTA_LE = [[74, 12], [62, 22], [42, 48], [14, 90], [-16, 128], [-42, 154], [-56, 162]]
const MANTA_TE = [[-56, 162], [-48, 146], [-44, 118], [-48, 84], [-58, 50], [-70, 24], [-84, 6]]
const MANTA_BELLY = [[72, 8], [46, 26], [16, 50], [-14, 70], [-36, 74], [-50, 56], [-62, 30], [-78, 6]]
const proj = (pts, k) => pts.map(([x, y]) => [x, y * k])
const half = (k) => `M 80 0 L ${spline(proj(MANTA_LE, k)).slice(2)} L ${spline(proj(MANTA_TE, k)).slice(2)} L -86 0 Z`
const halfBelly = (k) => `M 78 0 L ${spline(proj(MANTA_BELLY, k)).slice(2)} L -84 0 Z`
const gills = (k) =>
  [44, 36, 28, 20, 12].map((x, i) => `M ${x} ${f((12 + i * 1.5) * k)} q ${f(-2 * Math.sign(k))} ${f(5 * k)} ${f(-1)} ${f(9 * k)}`).join(' ')
const MANTA = {
  far: half(-0.7),
  near: half(0.8),
  farBelly: halfBelly(-0.7),
  nearBelly: halfBelly(0.8),
  farEdge: spline(proj(MANTA_LE, -0.7)),
  nearEdge: spline(proj(MANTA_LE, 0.8)),
  head: 'M 86 -12 C 90 -5, 90 5, 86 12 L 74 10 L 74 -10 Z',
  hornT: 'M 80 -10 C 92 -18, 104 -16, 106 -9 C 98 -8, 90 -7, 84 -3 Z',
  hornB: 'M 80 10 C 92 18, 104 17, 106 10 C 98 9, 90 7, 84 3 Z',
  tail: 'M -82 -2.5 C -116 -2, -156 1, -210 6 C -156 5, -116 4, -82 2.5 Z',
  gillsT: gills(-0.7),
  gillsB: gills(0.8),
}

const midSchool = school(37, 54, 140, 44, 0.85, 4)
const SCHOOL_Y = 552

const mantaLayer = (
  <Svg>
    <g transform="translate(0 452) scale(1.12)">
      <g className="abyss-manta" style={{ animationDuration: '84s', animationDelay: '-36s' }}>
        <g className="abyss-manta-bob" style={{ animationDuration: '10s', animationDelay: '-3s' }}>
          <path className="abyss-manta-tail" d={MANTA.tail} fill="#0b2f47" style={{ animationDuration: '6s' }} />
          <g className="abyss-wing abyss-wing-far" style={{ animationDuration: '6s' }}>
            <path d={MANTA.far} fill="#0c3049" />
            <path d={MANTA.farBelly} fill="#82c6d8" fillOpacity=".34" />
            <path d={MANTA.farEdge} stroke="#5cb2cc" strokeOpacity=".4" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
          <g className="abyss-wing abyss-wing-near" style={{ animationDuration: '6s' }}>
            <path d={MANTA.near} fill="#0c3049" />
            <path d={MANTA.nearBelly} fill="#82c6d8" fillOpacity=".34" />
            <path d={MANTA.nearEdge} stroke="#5cb2cc" strokeOpacity=".4" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
          <path d="M 76 0 C 60 -7, 10 -9, -60 -3 L -60 3 C 10 9, 60 7, 76 0 Z" fill="#a6dce8" fillOpacity=".22" />
          <path d={`${MANTA.gillsT} ${MANTA.gillsB}`} stroke="#0d3550" strokeOpacity=".6" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d={MANTA.head} fill="#0c3049" />
          <path d={MANTA.hornT} fill="#0c3049" />
          <path d={MANTA.hornB} fill="#0c3049" />
          <path d="M 84 -7 Q 88 0 84 7" stroke="#06192a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d={fishShape(-10, 36, 0.7, -1)} fill="#0c3049" />
          <path d={fishShape(16, -30, 0.55, -1)} fill="#0c3049" />
        </g>
      </g>
    </g>
    <g transform={`translate(0 ${SCHOOL_Y})`}>
      <g className="abyss-school" style={{ animationDuration: '54s', animationDelay: '-15s' }}>
        {midSchool.map((d, i) => (
          <g key={i} className={`abyss-sub abyss-sub-${'abc'[i % 3]}`} style={{ animationDuration: `${(4.6 + i * 1.1).toFixed(1)}s`, animationDelay: `${-i * 1.7}s` }}>
            <path d={d} fill="#b4e8f3" fillOpacity=".82" />
          </g>
        ))}
      </g>
    </g>
  </Svg>
)

/* ---------- reef building blocks ---------- */

// Branching coral: one stroked path per branch level, tips returned for glows.
function branches(seed, x, y, len, spread, levels, lean = 0) {
  const r = rng(seed)
  const out = Array.from({ length: levels + 1 }, () => '')
  const tips = []
  const grow = (x0, y0, L, a, lvl) => {
    const x1 = x0 + Math.sin(a) * L
    const y1 = y0 - Math.cos(a) * L
    const mx = (x0 + x1) / 2 + (r() - 0.5) * L * 0.25
    const my = (y0 + y1) / 2
    out[lvl] += `M ${f(x0)} ${f(y0)} Q ${f(mx)} ${f(my)} ${f(x1)} ${f(y1)} `
    if (lvl === levels) {
      tips.push([x1, y1])
      return
    }
    const n = 2 + (r() < 0.35 ? 1 : 0)
    for (let k = 0; k < n; k++) {
      const da = (k - (n - 1) / 2) * spread * (0.7 + r() * 0.6)
      grow(x1, y1, L * (0.62 + r() * 0.2), a + da + (r() - 0.5) * 0.2, lvl + 1)
    }
  }
  grow(x, y, len, lean, 0)
  return { out, tips }
}

function Coral({ seed, x, y, len, spread = 0.5, levels = 3, w = 9, color, lean = 0 }) {
  const { out } = branches(seed, x, y, len, spread, levels, lean)
  return (
    <g stroke={color} fill="none" strokeLinecap="round">
      {out.map((d, i) => (
        <path key={i} d={d} strokeWidth={f(w * Math.pow(0.66, i))} />
      ))}
    </g>
  )
}

// Gorgonian sea fan: a dense branching lattice over a translucent web,
// swaying from its foot.
function fanPaths(seed, x, y, h) {
  const r = rng(seed)
  let thick = ''
  let fine = ''
  const tips = []
  const grow = (x0, y0, L, a, lvl) => {
    const x1 = x0 + Math.sin(a) * L
    const y1 = y0 - Math.cos(a) * L
    const seg = `M ${f(x0)} ${f(y0)} Q ${f((x0 + x1) / 2 + (r() - 0.5) * L * 0.3)} ${f((y0 + y1) / 2)} ${f(x1)} ${f(y1)} `
    if (lvl < 2) thick += seg
    else fine += seg
    if (lvl >= 6) {
      tips.push([x1, y1, a])
      return
    }
    grow(x1, y1, L * (0.74 + r() * 0.14), a - 0.24 - r() * 0.2, lvl + 1)
    grow(x1, y1, L * (0.74 + r() * 0.14), a + 0.24 + r() * 0.2, lvl + 1)
  }
  grow(x, y, h * 0.2, 0, 0)
  tips.sort((p, q) => p[2] - q[2])
  const web = spline([[x - 4, y - h * 0.12], ...tips.filter((_, i) => i % 3 === 0).map(([tx, ty]) => [tx, ty]), [x + 4, y - h * 0.12]], true)
  return { thick, fine, web }
}

function Fan({ seed, x, y, h, color, amp = '1.6deg', r }) {
  const { thick, fine, web } = fanPaths(seed, x, y, h)
  return (
    <g className="abyss-sway" style={{ transformOrigin: `${x}px ${y}px`, '--abyss-amp': amp, ...anim(r, 5, 3) }}>
      <path d={web} fill={color} fillOpacity=".16" />
      <path d={fine} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeOpacity=".9" />
      <path d={thick} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  )
}

function brain(x, y, rx, ry, color, groove) {
  const d = `M ${f(x - rx)} ${f(y)} C ${f(x - rx)} ${f(y - ry * 1.3)}, ${f(x + rx)} ${f(y - ry * 1.3)}, ${f(x + rx)} ${f(y)} Z`
  let g = ''
  for (let i = 1; i < 4; i++) {
    const k = i / 4
    const w = rx * Math.sqrt(1 - k * k) * 0.95
    g += `M ${f(x - w)} ${f(y - ry * k)} q ${f(w / 4)} ${f(-ry * 0.1)} ${f(w / 2)} 0 t ${f(w / 2)} 0 t ${f(w / 2)} 0 t ${f(w / 2)} 0 `
  }
  return (
    <g>
      <path d={d} fill={color} />
      <path d={g} stroke={groove} strokeWidth="1.6" fill="none" strokeOpacity=".7" strokeLinecap="round" />
    </g>
  )
}

function sponges(x, y, specs, color, rim) {
  return specs.map(([dx, h, w], i) => (
    <g key={i}>
      <path d={`M ${f(x + dx - w / 2)} ${f(y + 6)} L ${f(x + dx - w * 0.56)} ${f(y - h)} Q ${f(x + dx)} ${f(y - h - w * 0.3)} ${f(x + dx + w * 0.56)} ${f(y - h)} L ${f(x + dx + w / 2)} ${f(y + 6)} Z`} fill={color} />
      <ellipse cx={f(x + dx)} cy={f(y - h + 1)} rx={f(w * 0.36)} ry={f(w * 0.15)} fill={rim} />
      <path d={`M ${f(x + dx - w * 0.3)} ${f(y - h + 6)} L ${f(x + dx - w * 0.26)} ${f(y)}`} stroke="#fff" strokeOpacity=".14" strokeWidth={f(w * 0.18)} strokeLinecap="round" />
    </g>
  ))
}

// Kelp: a wavy stalk with blades streaming in the current, split into
// segments that sway one inside the other so the bend travels up the strand.
function Kelp({ seed, x, base, height, segs = 2, stalk, leaf, bladder, w = 5, amp = 2, dur = 7, lean = 0, leafScale = 1 }) {
  const r = rng(seed)
  const N = 36
  const freq = 0.8 + r() * 0.9
  const ph = r() * Math.PI * 2
  const wob = 6 + r() * 10
  const P = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    return [x + Math.sin(t * freq * Math.PI * 2 + ph) * wob * t + lean * t * t, base - t * height]
  })
  const leaves = Array.from({ length: segs }, () => '')
  const bl = Array.from({ length: segs }, () => '')
  let side = r() < 0.5 ? 1 : -1
  for (let i = 3; i < N; i += 2) {
    const t = i / N
    const [px, py] = P[i]
    const L = (34 + r() * 40) * (1 - t * 0.45) * leafScale
    // blades lean with the current (to the right) and droop a little
    const a = ((side * (24 + r() * 34) + 14) * Math.PI) / 180
    const tx = px + Math.sin(a) * L
    const ty = py - Math.cos(a) * L + L * 0.12
    const nx = Math.cos(a)
    const ny = Math.sin(a)
    const bw = L * 0.2
    const mx = (px + tx) / 2
    const my = (py + ty) / 2
    const k = Math.min(segs - 1, Math.floor(t * segs))
    leaves[k] += `M ${f(px)} ${f(py)} Q ${f(mx + nx * bw)} ${f(my + ny * bw)} ${f(tx)} ${f(ty)} Q ${f(mx - nx * bw * 0.35)} ${f(my - ny * bw * 0.35)} ${f(px)} ${f(py)} Z `
    const bx = px + Math.sin(a) * 4
    const by = py - Math.cos(a) * 4
    const br = 2.2 * leafScale
    bl[k] += `M ${f(bx - br)} ${f(by)} a ${f(br)} ${f(br)} 0 1 0 ${f(2 * br)} 0 a ${f(br)} ${f(br)} 0 1 0 ${f(-2 * br)} 0 `
    side = -side
  }
  const delay = -r() * dur
  const build = (k) => {
    const i0 = Math.round((k * N) / segs)
    const i1 = Math.round(((k + 1) * N) / segs)
    const [ox, oy] = P[i0]
    return (
      <g
        className="abyss-sway"
        style={{
          transformOrigin: `${f(ox)}px ${f(oy)}px`,
          '--abyss-amp': `${t2(amp * (1 + k * 0.6))}deg`,
          animationDuration: `${dur}s`,
          animationDelay: `${t2(delay - k * dur * 0.14)}s`,
        }}
      >
        <path d={leaves[k]} fill={leaf} />
        <path d={spline(P.slice(i0, i1 + 1))} stroke={stalk} strokeWidth={f(w * (1 - k * 0.22))} fill="none" strokeLinecap="round" />
        <path d={bl[k]} fill={bladder} />
        {k + 1 < segs && build(k + 1)}
      </g>
    )
  }
  return build(0)
}

// Small reef fish (local coords, heading right) with a separate tail.
const FISH_BODY = 'M 14 0 C 10 -8, -4 -9, -11 -1 C -4 8, 10 8, 14 0 Z'
const FISH_TAIL = 'M -9 0 L -19 -7 Q -16 0 -19 7 Z'
const FISH_FIN = 'M 4 -7 C 0 -12, -6 -11, -8 -6 Z'

function Anthias({ x, y, s, path, dur, delay, c }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`abyss-dart abyss-dart-${path}`} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <path d={FISH_TAIL} fill={c[1]} />
        <path d={FISH_FIN} fill={c[1]} />
        <path d={FISH_BODY} fill={c[0]} />
        <circle cx="9" cy="-1.5" r="1.4" fill="#1a1020" />
      </g>
    </g>
  )
}

function bubbles(seed, x, y, n, rise, size = 1, dur = 7) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const rr = (2.2 + r() * 3.6) * size
    const d = dur * (0.8 + r() * 0.5)
    return (
      <g key={i} transform={`translate(${f(x + (r() - 0.5) * 8)} ${f(y)})`}>
        <g
          className="abyss-bubble"
          style={{ '--abyss-rise': `${f(-rise)}px`, '--abyss-wob': `${f(3 + r() * 5)}px`, animationDuration: `${t2(d)}s`, animationDelay: `${t2(-(i / n) * d - r() * 0.6)}s` }}
        >
          <circle r={f(rr)} fill="#bff4ff" fillOpacity=".14" stroke="#dcfbff" strokeOpacity=".8" strokeWidth={f(Math.max(1, rr * 0.22))} />
          <circle cx={f(-rr * 0.35)} cy={f(-rr * 0.35)} r={f(rr * 0.28)} fill="#fff" fillOpacity=".9" />
        </g>
      </g>
    )
  })
}

// Garden eels poking out of the sand, swaying, sometimes ducking back in.
function eels(seed, spots) {
  const r = rng(seed)
  return spots.map(([x, y, h], i) => {
    const dir = r() < 0.5 ? -1 : 1
    const d = `M ${f(x)} ${f(y + 2)} C ${f(x + 3 * dir)} ${f(y - h * 0.4)}, ${f(x - 6 * dir)} ${f(y - h * 0.75)}, ${f(x - 1 * dir)} ${f(y - h)} Q ${f(x + 4 * dir)} ${f(y - h - 6)} ${f(x + 9 * dir)} ${f(y - h - 2)}`
    return (
      <g key={i} className="abyss-eel" style={anim(r, 14, 10, 24)}>
        <path d={d} stroke="#9fc4cc" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d={d} stroke="#2c5a66" strokeWidth="3.4" strokeDasharray="1.2 5" fill="none" strokeLinecap="round" strokeOpacity=".55" />
        <circle cx={f(x + 4 * dir)} cy={f(y - h - 3.5)} r="1" fill="#0b1a22" />
      </g>
    )
  })
}

/* ---------- coral garden (mid reef) ---------- */

const SAND = [[-220, 794], [160, 782], [420, 788], [700, 800], [980, 790], [1240, 780], [1660, 792]]
const MID_L = [[-220, 650], [-60, 654], [90, 676], [210, 686], [300, 664], [390, 652], [470, 668], [540, 712], [590, 770], [620, 830]]
const MID_R = [[860, 840], [892, 780], [940, 720], [1010, 680], [1090, 656], [1180, 646], [1280, 664], [1400, 650], [1660, 644]]

const midRand = rng(91)
const coralGarden = (
  <Svg>
    <defs>
      <clipPath id="abyss-sand-clip">
        <path d={ground(SAND)} />
      </clipPath>
      <radialGradient id="abyss-dapple-g">
        <stop offset="0" stopColor="#9ff0ee" stopOpacity="0.32" />
        <stop offset="1" stopColor="#9ff0ee" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="abyss-pool-g">
        <stop offset="0" stopColor="#b8fbf2" stopOpacity="0.55" />
        <stop offset="0.45" stopColor="#7fe3e2" stopOpacity="0.2" />
        <stop offset="1" stopColor="#7fe3e2" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="abyss-sand-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#13566f" />
        <stop offset="0.45" stopColor="#0c3f57" />
        <stop offset="1" stopColor="#072c41" />
      </linearGradient>
      {glowGrad('abyss-mg-cyan', '#7ff6ff', 0.7)}
      {glowGrad('abyss-mg-pink', '#ff8fd8', 0.7)}
    </defs>
    {/* sand clearing with dancing caustics and a pool of light */}
    <path d={ground(SAND)} fill="url(#abyss-sand-g)" />
    <ellipse className="abyss-pool" cx="740" cy="808" rx="360" ry="50" fill="url(#abyss-pool-g)" style={{ animationDuration: '9s' }} />
    <g clipPath="url(#abyss-sand-clip)">
      <g className="abyss-caustic abyss-caustic-a" style={{ animationDuration: '13s' }}>
        <path d={causticWeb(3, -260, W + 260, 776, 900, 44, 0.36, 0.9)} fill="#b2f8f0" fillOpacity=".24" fillRule="evenodd" />
      </g>
      <g className="abyss-caustic abyss-caustic-b" style={{ animationDuration: '17s', animationDelay: '-6s' }}>
        <path d={causticWeb(7, -260, W + 260, 772, 900, 70, 0.32, 0.93)} fill="#d2fff8" fillOpacity=".14" fillRule="evenodd" />
      </g>
    </g>
    {eels(101, [[648, 798, 44], [676, 801, 56], [712, 802, 40], [770, 803, 52], [800, 801, 38], [842, 799, 48]])}

    {/* back kelp, rooted behind the outcrops */}
    <Kelp seed={3} x={150} base={690} height={360} stalk="#0f4d5c" leaf="#12586b" bladder="#1d6f80" w={4} amp={1.4} dur={8.4} leafScale={0.85} />
    <Kelp seed={5} x={262} base={680} height={300} stalk="#0f4d5c" leaf="#12586b" bladder="#1d6f80" w={4} amp={1.6} dur={7.2} leafScale={0.8} />
    <Kelp seed={8} x={1110} base={660} height={330} stalk="#0f4d5c" leaf="#12586b" bladder="#1d6f80" w={4} amp={1.5} dur={7.8} leafScale={0.85} lean={-10} />
    <Kelp seed={12} x={1220} base={656} height={390} stalk="#0f4d5c" leaf="#12586b" bladder="#1d6f80" w={4} amp={1.3} dur={9} leafScale={0.9} />

    {/* outcrops, lit along their tops */}
    <path d={ground(MID_L)} fill="#082f47" />
    <path d={ground(MID_R)} fill="#082f47" />
    <path d={knobs(41, MID_L, [30, 130, 250, 360, 450], 26)} fill="#082f47" />
    <path d={knobs(43, MID_R, [990, 1060, 1140, 1240, 1330], 26)} fill="#082f47" />
    <path d={tables(MID_R, [[1300, 78, 34]])} fill="#0b3a55" />
    <path d={`${topBand(MID_L, 30)} ${topBand(MID_R, 30)}`} fill="#0d4460" fillOpacity=".5" />
    <path d={`${topBand(MID_L, 12)} ${topBand(MID_R, 12)}`} fill="#125573" fillOpacity=".55" />
    <ellipse className="abyss-dapple" cx="330" cy="668" rx="120" ry="20" fill="url(#abyss-dapple-g)" style={{ animationDuration: '14s' }} />
    <ellipse className="abyss-dapple" cx="1150" cy="654" rx="140" ry="22" fill="url(#abyss-dapple-g)" style={{ animationDuration: '17s', animationDelay: '-8s' }} />
    <path d={spline(MID_L)} stroke="#1c6d88" strokeWidth="2.6" fill="none" strokeOpacity=".8" />
    <path d={spline(MID_R)} stroke="#1c6d88" strokeWidth="2.6" fill="none" strokeOpacity=".8" />

    {/* corals on the outcrops */}
    {brain(340, 666, 40, 22, '#2d5c80', '#5a8db0')}
    {brain(1170, 652, 46, 26, '#2d5c80', '#5a8db0')}
    <Coral seed={4} x={420} y={660} len={34} levels={3} w={8} color="#4f60a0" spread={0.55} />
    <Coral seed={6} x={110} y={678} len={40} levels={3} w={9} color="#3f6c8e" spread={0.5} />
    <Coral seed={9} x={1030} y={682} len={36} levels={3} w={8} color="#5f539a" spread={0.55} lean={0.1} />
    <Coral seed={14} x={1350} y={656} len={42} levels={3} w={9} color="#3f6c8e" spread={0.5} />
    {sponges(500, 690, [[-10, 46, 14], [8, 62, 16], [24, 38, 12]], '#6c4c92', '#2a1f48')}
    {sponges(965, 710, [[-8, 40, 13], [8, 52, 15]], '#8a603e', '#33241c')}
    <Fan seed={21} x={250} y={690} h={130} color="#9a5aa8" r={midRand} />
    <Fan seed={27} x={1252} y={664} h={150} color="#a8629a" r={midRand} amp="1.3deg" />
    {glowDots(44, [[432, 620, 0.8], [118, 636], [1040, 642, 0.8], [1360, 614], [508, 642, 0.7]], 'abyss-mg-cyan', '#dcfeff', 1.7)}
    {glowDots(48, [[328, 648, 0.8], [1180, 632, 0.8]], 'abyss-mg-pink', '#ffe3f5', 1.7)}

    {/* anthias hovering over the coral */}
    <Anthias x={420} y={590} s={0.9} path="a" dur={13} delay={-2} c={['#ff9a74', '#ff7a5c']} />
    <Anthias x={470} y={560} s={0.75} path="b" dur={11} delay={-7} c={['#ffb08a', '#ff8a6a']} />
    <Anthias x={1060} y={590} s={0.85} path="c" dur={15} delay={-4} c={['#ff9a74', '#ff7a5c']} />

    {bubbles(57, 930, 730, 5, 760, 0.8, 8)}
  </Svg>
)

/* ---------- jellyfish ---------- */

const JELLY = {
  pink: { top: '#ffeaf8', mid: '#ff9fe0', rim: '#ff5fc2', arm: '#ff86d2', tent: '#ffc9ef', glow: '#ff6fd0' },
  violet: { top: '#f3eaff', mid: '#c8a4ff', rim: '#956aff', arm: '#b48eff', tent: '#e2d4ff', glow: '#a77bff' },
  peach: { top: '#fff2e8', mid: '#ffb6a2', rim: '#ff7486', arm: '#ff9a96', tent: '#ffdcd2', glow: '#ff8f9a' },
}

function oralArms(r, n) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x0 = -12 + (i / (n - 1)) * 24
    const L = 80 + r() * 50
    const ph = r() * 6
    const left = []
    const right = []
    for (let k = 0; k <= 10; k++) {
      const t = k / 10
      const cx = x0 + Math.sin(t * 5 + ph) * 7 * t + (r() - 0.5) * 1.5
      const y = 2 + t * L
      const w = (6.5 * (1 - t) + 1.2) * (0.8 + 0.4 * Math.abs(Math.sin(t * 13 + ph)))
      left.push([cx - w, y])
      right.push([cx + w, y])
    }
    d += `${spline([...left, ...right.reverse()], true)} `
  }
  return d
}

function Jelly({ seed, x, y, s, kind, drift }) {
  const r = rng(seed)
  const c = JELLY[kind]
  const pulse = { animationDuration: `${t2(3.4 + r() * 1.6)}s`, animationDelay: `${t2(-r() * 4)}s` }
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="abyss-jdrift" style={{ '--abyss-dx': `${drift[0]}px`, '--abyss-dy': `${drift[1]}px`, ...anim(r, 18, 9) }}>
        <g className="abyss-jlurch" style={pulse}>
          <circle className="abyss-jglow" cx="0" cy="-18" r="120" fill={`url(#abyss-jg-${kind})`} style={pulse} />
          <g className="abyss-jtent" style={anim(r, 5.5, 3)}>
            <path d={tentacles(r, 12, 150, 250, 37)} stroke={`url(#abyss-tent-${kind})`} strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d={oralArms(r, 4)} fill={`url(#abyss-arm-${kind})`} />
          </g>
          <g className="abyss-jbell" style={pulse}>
            <path d={BELL} fill={`url(#abyss-bell-${kind})`} fillOpacity=".9" />
            <path d={INNER_BELL} fill={c.top} fillOpacity=".2" />
            <path d={CANALS} stroke={c.top} strokeOpacity=".4" strokeWidth="1.4" fill="none" />
            <ellipse cx="0" cy="-29" rx="16" ry="6" fill={c.top} fillOpacity=".3" />
            <ellipse cx="0" cy="1" rx="35" ry="5" fill={c.rim} fillOpacity=".5" />
            <path d="M -31 -18 C -29 -36, -16 -45, -3 -46" stroke="#fff" strokeOpacity=".6" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d={BELL} fill="none" stroke={c.top} strokeOpacity=".5" strokeWidth="1.2" />
            {[-30, -18, -6, 6, 18, 30].map((dx) => (
              <circle key={dx} cx={dx} cy="3" r="1.5" fill="#fff" fillOpacity=".9" />
            ))}
          </g>
        </g>
      </g>
    </g>
  )
}

const jellyDefs = Object.entries(JELLY).map(([k, c]) => (
  <g key={k}>
    <radialGradient id={`abyss-bell-${k}`} cx="0.42" cy="0.2" r="0.95">
      <stop offset="0" stopColor={c.top} />
      <stop offset="0.45" stopColor={c.mid} />
      <stop offset="1" stopColor={c.rim} />
    </radialGradient>
    <linearGradient id={`abyss-tent-${k}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={c.tent} stopOpacity="0.8" />
      <stop offset="0.55" stopColor={c.tent} stopOpacity="0.38" />
      <stop offset="1" stopColor={c.tent} stopOpacity="0" />
    </linearGradient>
    <linearGradient id={`abyss-arm-${k}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={c.arm} stopOpacity="0.75" />
      <stop offset="1" stopColor={c.arm} stopOpacity="0.15" />
    </linearGradient>
    {glowGrad(`abyss-jg-${k}`, c.glow, 0.42)}
  </g>
))

const jellyfish = (
  <Svg>
    <defs>{jellyDefs}</defs>
    <Jelly seed={5} x={290} y={430} s={1.05} kind="violet" drift={[16, -46]} />
    <Jelly seed={9} x={884} y={586} s={0.6} kind="peach" drift={[-12, -34]} />
    <Jelly seed={2} x={1090} y={300} s={1.6} kind="pink" drift={[-18, -40]} />
  </Svg>
)

/* ---------- near reef ---------- */

const NEAR_L = [[-220, 604], [-60, 600], [60, 614], [150, 640], [230, 676], [300, 722], [370, 782], [430, 840], [470, 900]]
const NEAR_R = [[950, 900], [1004, 846], [1072, 786], [1140, 730], [1214, 684], [1292, 650], [1380, 632], [1480, 618], [1660, 612]]

function Anemone({ seed, x, y, size, body, shade, tip, glow, r: ar }) {
  const r = rng(seed)
  const n = 21
  const groups = ['', '', '']
  let tips = ''
  const cx = x
  const cy = y - size * 0.34
  for (let i = 0; i < n; i++) {
    const a = ((-80 + (160 * i) / (n - 1) + (r() - 0.5) * 10) * Math.PI) / 180
    const L = size * (0.62 + r() * 0.38) * (1 - 0.22 * Math.abs(a))
    const bx = cx + Math.sin(a) * size * 0.24
    const by = cy - Math.cos(a) * size * 0.05
    const a2 = a * 1.15 + (r() - 0.5) * 0.3
    const tx = bx + Math.sin(a2) * L
    const ty = by - Math.cos(a2) * L
    const qx = bx + Math.sin(a * 0.6) * L * 0.6 + (r() - 0.5) * 8
    const qy = by - Math.cos(a * 0.6) * L * 0.6
    groups[i % 3] += `M ${f(bx)} ${f(by)} Q ${f(qx)} ${f(qy)} ${f(tx)} ${f(ty)} `
    tips += `M ${f(tx - 2.6)} ${f(ty)} a 2.6 2.6 0 1 0 5.2 0 a 2.6 2.6 0 1 0 -5.2 0 `
  }
  // a short, flaring column, mostly hidden under the tentacle crown
  const col = `M ${f(x - size * 0.16)} ${f(y + 8)} C ${f(x - size * 0.14)} ${f(y - size * 0.12)}, ${f(x - size * 0.3)} ${f(cy + 4)}, ${f(x - size * 0.28)} ${f(cy)} Q ${f(x)} ${f(cy - size * 0.08)} ${f(x + size * 0.28)} ${f(cy)} C ${f(x + size * 0.3)} ${f(cy + 4)}, ${f(x + size * 0.14)} ${f(y - size * 0.12)}, ${f(x + size * 0.16)} ${f(y + 8)} Z`
  return (
    <g>
      <circle cx={f(cx)} cy={f(cy - size * 0.3)} r={f(size * 1.3)} fill={`url(#${glow})`} />
      <path d={col} fill={shade} />
      {groups.map((d, i) => (
        <g key={i} className="abyss-sway" style={{ transformOrigin: `${f(cx)}px ${f(cy)}px`, '--abyss-amp': `${t2(3 + i * 1.2)}deg`, ...anim(ar, 3.2, 2.4) }}>
          <path d={d} stroke={i === 1 ? shade : body} strokeWidth={f(size * 0.078)} fill="none" strokeLinecap="round" />
          {i === 0 && <path d={tips} fill={tip} />}
        </g>
      ))}
    </g>
  )
}

// Giant clam: two wavy shell lips parted around a glowing blue mantle.
const clamLip = (y, amp, n = 6, x0 = -44, x1 = 44) => {
  const step = (x1 - x0) / n
  let d = ''
  for (let i = 0; i < n; i++) d += ` Q ${f(x0 + step * (i + 0.5))} ${f(y - amp)} ${f(x0 + step * (i + 1))} ${f(y)}`
  return d
}
function Clam({ x, y, s }) {
  const spots = dots(rng(5), 14, -34, 34, -12, -2, 1, 2)
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse className="abyss-glow" cx="0" cy="-8" rx="80" ry="54" fill="url(#abyss-ng-blue)" style={{ animationDuration: '5.5s', animationDelay: '-2s' }} />
      {/* lower valve */}
      <path d={`M -44 0${clamLip(0, 9)} C 42 14, 24 26, 0 26 C -24 26, -42 14, -44 0 Z`} fill="#1d3d52" />
      <path d="M -30 8 L -24 22 M -14 10 L -11 25 M 2 10 L 2 26 M 18 10 L 15 24 M 32 8 L 26 20" stroke="#0e2536" strokeWidth="3" strokeLinecap="round" />
      {/* mantle */}
      <path d={`M -44 0${clamLip(0, 9)} L 44 -12 ${clamLip(-12, -7, 6, 44, -44).trim()} Z`} fill="url(#abyss-clam-g)" />
      <path d={spots} fill="#d4fbff" fillOpacity=".85" />
      <path d={`M -44 -12${clamLip(-12, 7)}`} stroke="#9ff0ff" strokeWidth="2" fill="none" strokeOpacity=".8" />
      {/* upper valve */}
      <path d={`M -44 -12${clamLip(-12, 7)} C 36 -24, 18 -30, 0 -30 C -18 -30, -36 -24, -44 -12 Z`} fill="#27506a" />
      <path d="M -26 -22 C -18 -27, 18 -27, 26 -22" stroke="#3c6f8a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  )
}

function seaStar(x, y, s, rot, color) {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180
    const rr = i % 2 ? 7 * s : 20 * s
    d += `${i ? 'L' : 'M'} ${f(x + Math.sin(a) * rr)} ${f(y - Math.cos(a) * rr)} `
  }
  return (
    <g>
      <path d={`${d}Z`} fill={color} stroke={color} strokeWidth={f(5 * s)} strokeLinejoin="round" />
      <path d={dots(rng(Math.round(x)), 9, x - 9 * s, x + 9 * s, y - 9 * s, y + 9 * s, 0.8 * s, 1.4 * s)} fill="#ffd9b8" fillOpacity=".7" />
    </g>
  )
}

function polyps(seed, x, y, n, spread, colors) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const px = x + (r() - 0.5) * spread
    const py = y + (r() - 0.5) * spread * 0.45
    const rr = 2.4 + r() * 2.4
    const c = colors[i % colors.length]
    return (
      <g key={i}>
        <circle cx={f(px)} cy={f(py)} r={f(rr)} fill={c[0]} />
        <circle cx={f(px)} cy={f(py)} r={f(rr * 0.42)} fill={c[1]} />
      </g>
    )
  })
}

function grassTufts(seed, spots, color) {
  const r = rng(seed)
  return spots.map(([x, y, hs = 1], i) => {
    const blades = 4 + Math.floor(r() * 3)
    let d = ''
    for (let b = 0; b < blades; b++) {
      const bx = x + (b - blades / 2) * 6
      const lean = (r() - 0.3) * 40
      const bh = (40 + r() * 40) * hs
      d += `M ${f(bx - 3)} ${f(y)} Q ${f(bx + lean * 0.3)} ${f(y - bh * 0.6)} ${f(bx + lean)} ${f(y - bh)} Q ${f(bx + lean * 0.2 + 2)} ${f(y - bh * 0.5)} ${f(bx + 3)} ${f(y)} Z `
    }
    return <path key={i} className="abyss-tuft" d={d} fill={color} style={anim(r, 3.6, 2.4)} />
  })
}

// Boulders along a profile: a slightly lighter lump with a lit top edge.
function boulders(seed, pts, xs, size) {
  const r = rng(seed)
  let body = ''
  let lit = ''
  for (const x of xs) {
    const y = yAt(pts, x) + size * 0.35
    const rx = size * (0.7 + r() * 0.6)
    const ry = rx * (0.55 + r() * 0.2)
    body += `${blob(r, x, y, rx, ry, 8, 0.18)} `
    lit += `M ${f(x - rx * 0.8)} ${f(y - ry * 0.45)} Q ${f(x - rx * 0.2)} ${f(y - ry * 1.08)} ${f(x + rx * 0.5)} ${f(y - ry * 0.8)} `
  }
  return { body, lit }
}

function Swimmer({ y, s, dir, path, dur, delay, c, stripe }) {
  return (
    <g transform={`translate(${dir > 0 ? -260 : W + 260} ${y})`}>
      <g className={`abyss-cross abyss-cross-${path}`} style={{ '--abyss-dir': dir, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g transform={`scale(${dir * s} ${s})`}>
          <g className="abyss-tailwag" style={{ animationDuration: '0.32s' }}>
            <path d={FISH_TAIL} fill={c[1]} />
          </g>
          <path d={FISH_FIN} fill={c[1]} />
          <path d={FISH_BODY} fill={c[0]} />
          {stripe && <path d="M 2 -7.6 C 5 -3, 5 3, 2 7.4" stroke={stripe} strokeWidth="2.4" fill="none" />}
          <circle cx="9" cy="-1.5" r="1.3" fill="#140c1a" />
        </g>
      </g>
    </g>
  )
}

const bouldersL = boulders(7, NEAR_L, [40, 150, 250, 330], 46)
const bouldersR = boulders(11, NEAR_R, [1080, 1170, 1300, 1400], 48)
const tipsL = branches(61, 96, 626, 46, 0.55, 3).tips
const tipsR = branches(63, 1346, 646, 40, 0.5, 3, -0.1).tips

const nearRand = rng(113)
const nearReef = (
  <Svg>
    <defs>
      {glowGrad('abyss-ng-pink', '#ff6fc0', 0.55)}
      {glowGrad('abyss-ng-cyan', '#6ff4ff', 0.6)}
      {glowGrad('abyss-ng-mint', '#7ff5d6', 0.5)}
      {glowGrad('abyss-ng-coral', '#ff9a6e', 0.5)}
      {glowGrad('abyss-ng-blue', '#6f8bff', 0.8)}
      <linearGradient id="abyss-clam-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3f56ff" />
        <stop offset="0.5" stopColor="#4fb8ff" />
        <stop offset="1" stopColor="#7a5cff" />
      </linearGradient>
    </defs>

    {/* tall kelp framing both sides */}
    <Kelp seed={31} x={128} base={630} height={500} segs={3} stalk="#0a3a3c" leaf="#0f4a46" bladder="#1d6a5c" w={6.5} amp={1.2} dur={8} leafScale={1.2} />
    <Kelp seed={37} x={214} base={668} height={420} segs={3} stalk="#0a3a3c" leaf="#0f4a46" bladder="#1d6a5c" w={6} amp={1.4} dur={7} leafScale={1.1} lean={12} />
    <Kelp seed={41} x={1262} base={656} height={470} segs={3} stalk="#0a3a3c" leaf="#0f4a46" bladder="#1d6a5c" w={6.5} amp={1.2} dur={8.6} leafScale={1.15} lean={-14} />
    <Kelp seed={43} x={1336} base={640} height={540} segs={3} stalk="#0a3a3c" leaf="#0f4a46" bladder="#1d6a5c" w={6.5} amp={1.1} dur={9.4} leafScale={1.25} />

    {/* rock: two outcrops with boulders, crevices and dappled light */}
    <path d={ground(NEAR_L)} fill="#051b2c" />
    <path d={ground(NEAR_R)} fill="#051b2c" />
    <path d={bouldersL.body} fill="#06223a" />
    <path d={bouldersR.body} fill="#06223a" />
    <path d={ground(NEAR_L.map(([px, py]) => [px - 10, py + 70]))} fill="#03121f" />
    <path d={ground(NEAR_R.map(([px, py]) => [px + 10, py + 70]))} fill="#03121f" />
    <path d={`${topBand(NEAR_L, 34)} ${topBand(NEAR_R, 34)}`} fill="#0a2e45" fillOpacity=".55" />
    <path d={`${topBand(NEAR_L, 14)} ${topBand(NEAR_R, 14)}`} fill="#0e3a52" fillOpacity=".6" />
    <path d={spline(NEAR_L)} stroke="#11455c" strokeWidth="3" fill="none" />
    <path d={spline(NEAR_R)} stroke="#11455c" strokeWidth="3" fill="none" />
    <path d={`${bouldersL.lit} ${bouldersR.lit}`} stroke="#15506a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path
      d="M 120 700 q 30 26 18 60 M 210 760 q 20 30 4 64 M 1236 740 q -24 30 -10 70 M 1330 700 q -18 34 2 72"
      stroke="#020c16"
      strokeWidth="4"
      fill="none"
      strokeLinecap="round"
      strokeOpacity=".7"
    />

    {/* sea fans on the right outcrop */}
    <Fan seed={51} x={1188} y={706} h={190} color="#c0559f" r={nearRand} amp="1.8deg" />
    <Fan seed={57} x={1366} y={642} h={220} color="#a8448f" r={nearRand} amp="1.4deg" />

    {/* glowing staghorn coral */}
    <Coral seed={61} x={96} y={626} len={46} levels={3} w={11} color="#1f4566" spread={0.55} />
    <Coral seed={63} x={1346} y={646} len={40} levels={3} w={10} color="#1f4566" spread={0.5} lean={-0.1} />
    {glowDots(67, tipsL.slice(0, 5).map(([px, py]) => [px, py, 0.75]), 'abyss-ng-cyan', '#e0feff', 2, 2.2, 3)}
    {glowDots(69, tipsR.slice(0, 4).map(([px, py]) => [px, py, 0.75]), 'abyss-ng-pink', '#ffe6f6', 2, 2.4, 3)}

    {/* tube sponges and anemones */}
    {sponges(330, 742, [[-14, 54, 17], [6, 76, 19], [26, 44, 15]], '#c8653f', '#3a1712')}
    <Anemone seed={71} x={230} y={684} size={86} body="#ff5fae" shade="#b8357a" tip="#ffd4ec" glow="abyss-ng-pink" r={nearRand} />
    <Anemone seed={73} x={1098} y={786} size={72} body="#4fe3c2" shade="#25997f" tip="#e0fff6" glow="abyss-ng-mint" r={nearRand} />
    <Anemone seed={79} x={1262} y={672} size={60} body="#ff8a5a" shade="#b8553a" tip="#ffe0c8" glow="abyss-ng-coral" r={nearRand} />

    <Clam x={214} y={786} s={1.3} />
    {seaStar(352, 806, 1, 12, '#ff7448')}
    {seaStar(1236, 772, 0.85, -20, '#ff9a3c')}
    {polyps(151, 132, 708, 9, 46, [['#ff9a6e', '#ffe0c8'], ['#5fe6c4', '#e0fff4']])}
    {polyps(153, 1312, 700, 8, 42, [['#c98bff', '#f2e2ff'], ['#ff9a6e', '#ffe0c8']])}
    {polyps(157, 1040, 862, 7, 40, [['#5fe6c4', '#e0fff4'], ['#c98bff', '#f2e2ff']])}
    {grassTufts(83, [[60, 616, 1.1], [292, 720, 0.9], [404, 810, 1], [1030, 824, 0.9], [1160, 720, 1]], '#0c3d3b')}

    {glowDots(89, [[170, 660, 0.6], [372, 778, 0.5], [1150, 748, 0.6], [1420, 640, 0.6]], 'abyss-ng-cyan', '#e0feff', 1.8, 3, 4)}

    <Swimmer y={712} s={1.5} dir={1} path="a" dur={26} delay={-8} c={['#ffc04a', '#ff9a2e']} stripe="#fff3c4" />
    <Swimmer y={612} s={1.3} dir={-1} path="b" dur={33} delay={-21} c={['#3f8dff', '#ffd23f']} />
  </Svg>
)

/* ---------- bubbles & snow (nearest) ---------- */

function flakes(seed, n) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => (
    <circle
      key={i}
      className="abyss-flake"
      cx={f(80 + r() * (W - 160))}
      cy="-30"
      r={f(2.4 + r() * 2.6)}
      fill="#e6fbff"
      fillOpacity={t2(0.3 + r() * 0.3)}
      style={{ '--abyss-wob': `${f(14 + r() * 30)}px`, ...anim(r, 26, 16, 40) }}
    />
  ))
}

function bokeh(seed, n) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => (
    <circle
      key={i}
      className="abyss-flake"
      cx={f(120 + r() * (W - 240))}
      cy="-40"
      r={f(9 + r() * 10)}
      fill="url(#abyss-bokeh-g)"
      style={{ '--abyss-wob': `${f(30 + r() * 40)}px`, ...anim(r, 38, 20, 60) }}
    />
  ))
}

function bigBubbles(seed, xs) {
  const r = rng(seed)
  return xs.map((x, i) => {
    const rr = 6 + r() * 6
    return (
      <g key={i} transform={`translate(${x} ${H + 40})`}>
        <g className="abyss-bubble" style={{ '--abyss-rise': `${-(H + 120)}px`, '--abyss-wob': `${f(6 + r() * 6)}px`, ...anim(r, 14, 8, 22) }}>
          <circle r={f(rr)} fill="#bff4ff" fillOpacity=".12" stroke="#e4fcff" strokeOpacity=".7" strokeWidth="1.6" />
          <circle cx={f(-rr * 0.35)} cy={f(-rr * 0.35)} r={f(rr * 0.26)} fill="#fff" fillOpacity=".85" />
        </g>
      </g>
    )
  })
}

const nearSnow = (
  <Svg>
    <g className="abyss-snow-sway" style={{ animationDuration: '13s', animationDelay: '-4s' }}>
      <g className="abyss-snow-fall" style={{ animationDuration: '80s' }}>
        <path d={dots(rng(131), 46, -PAD, W + PAD, 0, H, 1.5, 2.8)} fill="#e0f9ff" fillOpacity=".42" />
        <path d={dots(rng(131), 46, -PAD, W + PAD, 0, H, 1.5, 2.8)} fill="#e0f9ff" fillOpacity=".42" transform={`translate(0 ${-H})`} />
      </g>
    </g>
    <defs>
      <radialGradient id="abyss-bokeh-g">
        <stop offset="0" stopColor="#e8fdff" stopOpacity="0.34" />
        <stop offset="0.6" stopColor="#c8f4ff" stopOpacity="0.16" />
        <stop offset="1" stopColor="#c8f4ff" stopOpacity="0" />
      </radialGradient>
    </defs>
    {flakes(137, 6)}
    {bokeh(141, 5)}
    {/* bubble streams from crevices in the near reef */}
    {bubbles(93, 372, 772, 6, 840, 1.1, 9)}
    {bubbles(97, 1206, 694, 6, 780, 1.2, 8.5)}
    {bigBubbles(139, [520, 760, 980, 1180])}
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'abyss',
  name: 'Abyss Bloom',
  tag: 'Deep reef',
  accent: '#38c8f5',
  accent2: '#ff8fd8',
  ink: '#0477a8',
  glow: '#7fdcff',
  clockColor: '#ebfcff',
  sky: 'linear-gradient(180deg,#3ec3cf 0%,#1ea2b7 7%,#0f819d 17%,#0a6386 30%,#07486d 45%,#053252 60%,#03203a 75%,#021325 88%,#010915 100%)',
  layers: [
    { name: 'Surface light', depth: 0, sky: true, el: surfaceLight },
    { name: 'Distant drifters', depth: 0.12, el: distantDrifters },
    { name: 'Far reef', depth: 0.22, el: farReef },
    { name: 'Depth clock', depth: 0.36, clock: true },
    { name: 'Manta & school', depth: 0.48, el: mantaLayer },
    { name: 'Coral garden', depth: 0.66, el: coralGarden },
    { name: 'Jellyfish', depth: 0.82, el: jellyfish },
    { name: 'Near reef', depth: 1.05, el: nearReef },
    { name: 'Bubbles & snow', depth: 1.3, el: nearSnow },
  ],
}
