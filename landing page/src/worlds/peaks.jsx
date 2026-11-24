// Morning Peaks — an alpine sunrise. A low sun blooms in a saddle between
// snowy summits while god-rays wheel slowly; spindrift streams off the highest
// peaks and cloud banks drift at three heights. A cable car shuttles across the
// valley above a glassy lake, an eagle circles, smoke curls from a chalet, and
// the pine forest and wildflower meadow lean into a cold morning breeze.

import './peaks.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- small helpers ---------- */

const t2 = (n) => n.toFixed(2)
const anim = (r, min, span, maxDelay) => ({
  animationDuration: `${t2(min + r() * span)}s`,
  animationDelay: `${t2(-r() * maxDelay)}s`,
})
const poly = (pts) => `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`
const open = (pts) => `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')}`
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// y of a polyline (sorted by x) at x.
function yAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1))
  }
  return pts[pts.length - 1][1]
}

// Smooth curve through points (same style as the kit's ridges), closed to the bottom.
function smooth(pts, bottom = H + 40) {
  let d = `M ${f(pts[0][0])} ${bottom} L ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const mx = (x0 + x1) / 2
    d += ` C ${f(mx)} ${f(y0)}, ${f(mx)} ${f(y1)}, ${f(x1)} ${f(y1)}`
  }
  return `${d} L ${f(pts[pts.length - 1][0])} ${bottom} Z`
}

const SUN = [1110, 354]

/* ---------- faceted mountain ranges ---------- */

// Walk a path that starts at a summit until it drops below y; returns the
// points up to and including the crossing.
function walk(path, y) {
  const out = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (b[1] >= y) {
      out.push(lerp(a, b, (y - a[1]) / (b[1] - a[1] || 1)))
      return out
    }
    out.push(b)
  }
  return out
}

// Midpoint displacement between a and b: a rocky, natural ridgeline.
// Pushes the points after a, up to and including b.
function rough(a, b, depth, amp, r, out) {
  if (depth === 0) {
    out.push(b)
    return
  }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const m = lerp(a, b, 0.5)
  m[0] += (r() - 0.5) * len * amp * 0.25
  m[1] += (r() - 0.55) * len * amp
  rough(a, m, depth - 1, amp, r, out)
  rough(m, b, depth - 1, amp, r, out)
}

// A range through hand-placed summits [x, y, valleyAfter?]. Faces turned
// toward the sun are lit (two tones), the others stay in cool shadow; summits
// above snowY get a snow cap with a ragged edge and gullies, itself split into
// lit and shaded halves.
function range(seed, peaks, base, { snowY = -1, snowFrac = 0.3, amp = 0.16 } = {}) {
  const r = rng(seed)
  const n = peaks.length
  const valleys = [[-PAD - 30, peaks[0][1] + (base - peaks[0][1]) * 0.55]]
  for (let i = 1; i < n; i++) {
    const [ax, ay, vy] = peaks[i - 1]
    const [bx, by] = peaks[i]
    const low = Math.max(ay, by)
    valleys.push([ax + (bx - ax) * (0.42 + r() * 0.16), vy ?? low + (base - low) * (0.22 + r() * 0.26)])
  }
  valleys.push([W + PAD + 30, peaks[n - 1][1] + (base - peaks[n - 1][1]) * 0.55])

  // rough paths from each summit down to the valley on either side
  const side = (P, V) => {
    const sh = lerp(P, V, 0.3 + r() * 0.28)
    sh[1] += (r() - 0.62) * (V[1] - P[1]) * 0.22
    const pts = [P]
    rough(P, sh, 2, amp, r, pts)
    const k = pts.length - 1
    rough(sh, V, 3, amp, r, pts)
    return { pts, sh: k }
  }

  const sil = [valleys[0]]
  const lit = []
  const litHi = []
  const ribs = []
  const snow = []
  const snowLit = []
  const crags = []
  const summits = []
  peaks.forEach(([px, py], i) => {
    const P = [px, py]
    const L = valleys[i]
    const R = valleys[i + 1]
    const left = side(P, L)
    const right = side(P, R)
    sil.push(...[...left.pts].reverse().slice(1), ...right.pts.slice(1))
    summits.push(P)

    // which side faces the sun
    const s = px < SUN[0] ? 1 : -1
    const lit1 = s > 0 ? right : left
    const shd1 = s > 0 ? left : right
    const V = lit1.pts[lit1.pts.length - 1]
    const F = [px + (V[0] - px) * (0.18 + r() * 0.2), base + 30]
    const M = [px + (F[0] - px) * 0.42 + (r() - 0.5) * 14, py + (base - py) * 0.42]
    lit.push(poly([...lit1.pts, [V[0] + (F[0] - V[0]) * 0.25, base + 30], F, M]))
    litHi.push(poly([...lit1.pts.slice(0, lit1.sh + 1), lerp(M, V, 0.25 + r() * 0.2), lerp(P, M, 0.6)]))
    // a lighter spur running down the shaded face
    const O = shd1.pts[shd1.sh]
    const rb = [O[0] + (px - O[0]) * 0.3, O[1] + (base - O[1]) * 0.1]
    ribs.push(poly([O, rb, [rb[0] + s * 26, base + 80], [O[0] - s * 14, base + 80]]))

    if (py < snowY) {
      const sy = py + (base - py) * snowFrac * (0.75 + r() * 0.5)
      const lw = walk(left.pts, sy)
      const rw = walk(right.pts, sy)
      const eL = lw[lw.length - 1]
      const eR = rw[rw.length - 1]
      const top = [...[...lw].reverse(), ...rw.slice(1)]
      const k = 7 + Math.floor(r() * 4)
      const jag = [eL]
      for (let j = 1; j < k; j++) {
        const x = eL[0] + ((eR[0] - eL[0]) * (j + (r() - 0.5) * 0.5)) / k
        const deep = r() < 0.3
        const dy = (sy - py) * (deep ? 0.45 + r() * 0.55 : (r() - 0.6) * 0.35)
        jag.push([x, Math.max(sy + dy, yAt(top, x) + 4)])
      }
      jag.push(eR)
      snow.push(poly([...rw, ...[...jag].reverse(), ...[...lw].reverse()]))
      jag.slice(1, -1).forEach(([x, y]) => {
        if (y - sy < (sy - py) * 0.3 || r() < 0.45) return
        const len = (base - y) * (0.06 + r() * 0.08)
        const bx = x + (x - px) * 0.35 + (r() - 0.5) * 6
        snow.push(poly([[x - 3, y - 6], [x + 3, y - 6], [bx, y + len]]))
      })
      // lit half: everything on the sun side of the spine P -> M
      const sideOf = ([x, y]) => s * (x - (px + ((M[0] - px) * (y - py)) / (M[1] - py)))
      for (let j = 0; j < jag.length - 1; j++) {
        const a = sideOf(jag[j])
        const b = sideOf(jag[j + 1])
        if ((a <= 0 && b > 0) || (a > 0 && b <= 0)) {
          const cut = lerp(jag[j], jag[j + 1], a / (a - b || 1))
          const sunSide = s > 0 ? jag.slice(j + 1) : jag.slice(0, j + 1).reverse()
          const edge = s > 0 ? rw : lw
          snowLit.push(poly([...edge, ...[...sunSide].reverse(), cut]))
          break
        }
      }
      // dark crags poking through the snow on the shaded side
      const c = lerp(P, lerp(eL, eR, s > 0 ? 0.18 : 0.82), 0.6)
      crags.push(poly([c, [c[0] - s * 6, c[1] + 15], [c[0] + s * 3, c[1] + 10]]))
    }
  })
  const ridge = sil.slice()
  sil.push([W + PAD + 30, H + 40], [-PAD - 30, H + 40])
  return {
    sil: poly(sil),
    ridge,
    ridgeLine: open(ridge),
    summits,
    lit: lit.join(' '),
    litHi: litHi.join(' '),
    ribs: ribs.join(' '),
    snow: snow.join(' '),
    snowLit: snowLit.join(' '),
    crags: crags.join(' '),
  }
}

function Range({ rg, id, c }) {
  return (
    <>
      <path d={rg.sil} fill={c.shade} />
      <path d={rg.ribs} fill={c.rib} />
      <path d={rg.lit} fill={`url(#${id}-lit)`} />
      <path d={rg.litHi} fill={`url(#${id}-hi)`} />
      <path d={rg.snow} fill={c.snow} />
      <path d={rg.snowLit} fill={c.snowLit} />
      <path d={rg.crags} fill={c.crag} opacity=".7" />
      <path d={rg.ridgeLine} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={c.rimW} strokeLinejoin="round" />
    </>
  )
}

// Horizontal gradients that warm up toward the sun.
const sunGrad = (id, cool, warm, edge) => (
  <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
    <stop offset="0" stopColor={cool} />
    <stop offset="0.45" stopColor={cool} />
    <stop offset={t2(SUN[0] / W)} stopColor={warm} />
    <stop offset="1" stopColor={edge} />
  </linearGradient>
)
const rimGrad = (id, color, o) => (
  <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
    <stop offset="0" stopColor={color} stopOpacity={o * 0.25} />
    <stop offset="0.5" stopColor={color} stopOpacity={o * 0.35} />
    <stop offset={t2(SUN[0] / W)} stopColor={color} stopOpacity={o} />
    <stop offset="1" stopColor={color} stopOpacity={o * 0.4} />
  </linearGradient>
)
const vFade = (id, color, o0, o1, y1 = 0, y2 = 1) => (
  <linearGradient id={id} x1="0" y1={y1} x2="0" y2={y2}>
    <stop offset="0" stopColor={color} stopOpacity={o0} />
    <stop offset="1" stopColor={color} stopOpacity={o1} />
  </linearGradient>
)

/* ---------- clouds ---------- */

// A flat-bottomed cumulus outline, tallest in the middle.
function puffPath(seed, x, y, w, h) {
  const r = rng(seed)
  const n = 4 + Math.floor(r() * 3)
  const ws = Array.from({ length: n }, () => 0.6 + r() * 0.8)
  const tot = ws.reduce((a, b) => a + b, 0)
  let cx = x - w / 2
  let d = `M ${f(cx)} ${f(y)}`
  ws.forEach((wi, i) => {
    const bw = (wi / tot) * w
    const bh = h * (0.4 + 0.6 * Math.sin((Math.PI * (i + 0.5)) / n)) * (0.85 + r() * 0.3)
    cx += bw
    d += ` A ${f(bw / 2)} ${f(bh)} 0 0 1 ${f(cx)} ${f(y)}`
  })
  return `${d} Z`
}

// Puffs drift left to right across the whole plane and wrap off-screen.
function puffs(seed, list, tone) {
  return list.map(([y, w, h, dur, phase, op = 1], i) => {
    const x = -PAD - w / 2 - 20
    const s = seed + i * 17
    return (
      <g
        key={i}
        className="peaks-cruise"
        opacity={op}
        style={{ '--peaks-span': `${f(W + 2 * PAD + w + 40)}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-dur * phase)}s` }}
      >
        <path d={puffPath(s, x, y, w, h)} fill={tone[0]} />
        <path d={puffPath(s + 3, x - w * 0.03, y - h * 0.16, w * 0.9, h * 0.92)} fill={tone[1]} />
        <path d={puffPath(s + 5, x + w * 0.14, y - h * 0.34, w * 0.5, h * 0.7)} fill={tone[2]} />
      </g>
    )
  })
}

// A long bumpy cloud bank that repeats every `period`, so panning it by one
// period loops seamlessly.
function bankPath(seed, y, period, bw, bh, depth) {
  const r = rng(seed)
  const bumps = []
  let sum = 0
  while (sum < period) {
    const w = bw * (0.3 + r() * 1.2)
    bumps.push([w, bh * (0.3 + r() * 0.95) * Math.min(1, w / bw + 0.35), (r() - 0.5) * bh * 0.6])
    sum += w
  }
  const k = period / sum
  bumps.forEach((b) => (b[0] *= k))
  const x0 = -PAD - period
  let x = x0
  let i = 0
  let d = `M ${f(x0)} ${f(y + depth)} L ${f(x0)} ${f(y + bumps[0][2])}`
  while (x < W + PAD) {
    const [w, h] = bumps[i % bumps.length]
    const yn = y + bumps[(i + 1) % bumps.length][2]
    d += ` A ${f(w / 2)} ${f(h)} 0 0 1 ${f(x + w)} ${f(yn)}`
    x += w
    i++
  }
  return `${d} L ${f(x)} ${f(y + depth)} Z`
}

function bank(seed, y, period, bw, bh, depth, fills, dur, phase) {
  return (
    <g
      className="peaks-pan"
      style={{ '--peaks-pan': `${period}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-dur * phase)}s` }}
    >
      <path d={bankPath(seed, y, period, bw, bh, depth)} fill={fills[0]} />
      <path d={bankPath(seed + 1, y + bh * 0.7, period, bw * 1.3, bh * 0.6, depth - bh * 0.7)} fill={fills[1]} />
    </g>
  )
}

// A soft horizontal band of valley mist that drifts and breathes.
function mist(seed, y, h, dx, dur, op, fill = 'url(#peaks-mist-g)') {
  const r = rng(seed)
  let d = `M ${-PAD - 160} ${f(y + h)}`
  for (let x = -PAD - 160; x <= W + PAD + 160; x += 120) d += ` L ${x} ${f(y + (r() - 0.5) * h * 0.4)}`
  d += ` L ${W + PAD + 160} ${f(y + h)} Z`
  return (
    <g opacity={op}>
      <path
        className="peaks-mist"
        d={d}
        fill={fill}
        style={{ '--peaks-dx': `${dx}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-r() * dur)}s` }}
      />
    </g>
  )
}

// Four-point star sparkle.
function sparkle(x, y, s) {
  return `M ${f(x)} ${f(y - 6 * s)} L ${f(x + 1.3 * s)} ${f(y - 1.3 * s)} L ${f(x + 6 * s)} ${f(y)} L ${f(x + 1.3 * s)} ${f(y + 1.3 * s)} L ${f(x)} ${f(y + 6 * s)} L ${f(x - 1.3 * s)} ${f(y + 1.3 * s)} L ${f(x - 6 * s)} ${f(y)} L ${f(x - 1.3 * s)} ${f(y - 1.3 * s)} Z`
}
function sparkles(seed, list, fill = '#fff') {
  const r = rng(seed)
  return list.map(([x, y, s], i) => (
    <path key={i} className="peaks-sparkle" d={sparkle(x, y, s)} fill={fill} style={anim(r, 6, 6, 12)} />
  ))
}

/* ---------- sky ---------- */

function rays(seed, count, inner, outer, spread) {
  const r = rng(seed)
  let d = ''
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.18
    const s = spread * (0.5 + r())
    const len = outer * (0.6 + r() * 0.4)
    const p = (ang, rad) => `${f(SUN[0] + Math.cos(ang) * rad)} ${f(SUN[1] + Math.sin(ang) * rad)}`
    d += `M ${p(a, inner)} L ${p(a - s, len)} L ${p(a + s, len)} Z `
  }
  return d
}

function cirrus(seed, list) {
  const r = rng(seed)
  return list.map(([x, y, rx, ry, rot, op], i) => (
    <g key={i} transform={`rotate(${rot} ${x} ${y})`}>
      <ellipse
        className="peaks-cirrus"
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        fill="url(#peaks-cirrus-g)"
        opacity={op}
        style={{ '--peaks-dx': `${f(50 + r() * 60)}px`, ...anim(r, 40, 30, 70) }}
      />
    </g>
  ))
}

const skyPlate = (
  <Svg>
    <defs>
      <radialGradient id="peaks-bloom" cx={SUN[0]} cy={SUN[1]} r="420" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff1da" stopOpacity="0.9" />
        <stop offset="0.14" stopColor="#ffe9cc" stopOpacity="0.62" />
        <stop offset="0.42" stopColor="#ffe0c0" stopOpacity="0.26" />
        <stop offset="1" stopColor="#ffd9b8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="peaks-core" cx={SUN[0]} cy={SUN[1]} r="80" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.36" stopColor="#fffffa" />
        <stop offset="0.42" stopColor="#fff6e2" stopOpacity="0.85" />
        <stop offset="0.62" stopColor="#ffeccc" stopOpacity="0.35" />
        <stop offset="1" stopColor="#ffe6c4" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="peaks-ray-g" cx={SUN[0]} cy={SUN[1]} r="900" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff7e8" stopOpacity="0.5" />
        <stop offset="0.22" stopColor="#fff3e0" stopOpacity="0.2" />
        <stop offset="0.5" stopColor="#fff3e0" stopOpacity="0.06" />
        <stop offset="1" stopColor="#fff3e0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="peaks-cirrus-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.35" stopColor="#fff" stopOpacity="0.9" />
        <stop offset="0.7" stopColor="#fff6ec" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <circle className="peaks-bloom" cx={SUN[0]} cy={SUN[1]} r="420" fill="url(#peaks-bloom)" />
    <g className="peaks-rays-a">
      <path className="peaks-rays-breathe" d={rays(3, 16, 60, 900, 0.032)} fill="url(#peaks-ray-g)" />
    </g>
    <g className="peaks-rays-b">
      <path className="peaks-rays-breathe-b" d={rays(9, 11, 80, 760, 0.02)} fill="url(#peaks-ray-g)" />
    </g>
    {cirrus(17, [
      [250, 92, 240, 4.5, -3, 0.75],
      [600, 58, 170, 3, -2, 0.6],
      [980, 104, 280, 5, -4, 0.7],
      [1300, 176, 190, 3.5, -3, 0.55],
      [1240, 70, 140, 2.6, -3, 0.5],
    ])}
    <circle className="peaks-core" cx={SUN[0]} cy={SUN[1]} r="80" fill="url(#peaks-core)" />
    {puffs(
      23,
      [
        [66, 170, 34, 320, 0.08, 0.9],
        [118, 110, 22, 280, 0.58, 0.8],
      ],
      ['#e4e5f1', '#fbf8f6', '#ffffff'],
    )}
    {puffs(
      31,
      [
        [436, 300, 58, 420, 0.16],
        [452, 420, 70, 480, 0.6],
        [420, 210, 42, 380, 0.88, 0.92],
        [444, 260, 50, 440, 0.38],
      ],
      ['#eadfe6', '#fbf1ec', '#fff9f2'],
    )}
  </Svg>
)

/* ---------- far summits ---------- */

// A soft band gradient: clear at the top and bottom, densest in the middle.
const bandGrad = (id, color, o) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={color} stopOpacity="0" />
    <stop offset="0.45" stopColor={color} stopOpacity={o} />
    <stop offset="1" stopColor={color} stopOpacity="0" />
  </linearGradient>
)

const FAR = range(
  71,
  [
    [-160, 350],
    [60, 296],
    [300, 232],
    [500, 324],
    [680, 382],
    [840, 356],
    [962, 300, 472],
    [1282, 238],
    [1450, 322],
    [1600, 290],
  ],
  610,
  { snowY: 392, snowFrac: 0.24, amp: 0.14 },
)

// Spindrift: plumes of snow torn off a summit by the wind.
function spindrift(seed, [x, y], s) {
  const r = rng(seed)
  return [0, 1, 2].map((i) => (
    <path
      key={i}
      className="peaks-drift"
      d={`M ${f(x)} ${f(y)} C ${f(x + 30 * s)} ${f(y - 12 * s)}, ${f(x + 80 * s)} ${f(y - 16 * s)}, ${f(x + 130 * s)} ${f(y - 6 * s)} C ${f(x + 80 * s)} ${f(y + 2 * s)}, ${f(x + 36 * s)} ${f(y + 6 * s)}, ${f(x)} ${f(y)} Z`}
      fill="url(#peaks-drift-g)"
      style={{ animationDuration: `${t2(7 + r() * 3)}s`, animationDelay: `${t2(-i * 3.1 - r() * 2)}s` }}
    />
  ))
}

const farSummits = (
  <Svg>
    <defs>
      {sunGrad('peaks-far-lit', '#d2cfe2', '#f4d6c8', '#e6d3d2')}
      {sunGrad('peaks-far-hi', '#e0dcec', '#fde4d4', '#f1dfdb')}
      {rimGrad('peaks-far-rim', '#fff7ec', 0.95)}
      {vFade('peaks-far-haze', '#f7e4d9', 0, 0.94)}
      {vFade('peaks-bank-g', '#fffaf6', 1, 0)}
      {vFade('peaks-bank-s', '#f1e4e6', 0.9, 0)}
      <linearGradient id="peaks-drift-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="0.5" stopColor="#fff6ee" stopOpacity="0.5" />
        <stop offset="1" stopColor="#fff6ee" stopOpacity="0" />
      </linearGradient>
    </defs>
    <Range rg={FAR} id="peaks-far" c={{ shade: '#b3c2df', rib: '#bccae5', snow: '#e5ebf6', snowLit: '#fff6ee', crag: '#9fb0d2', rimW: 2.2 }} />
    {spindrift(5, FAR.summits[2], 1.1)}
    {spindrift(6, FAR.summits[7], 1.2)}
    {spindrift(7, FAR.summits[6], 0.8)}
    {sparkles(8, [
      [FAR.summits[2][0] + 14, FAR.summits[2][1] + 26, 0.9],
      [FAR.summits[7][0] - 12, FAR.summits[7][1] + 30, 1],
      [FAR.summits[6][0] + 12, FAR.summits[6][1] + 22, 0.7],
    ])}
    <rect x={-PAD} y="392" width={W + 2 * PAD} height={H + 40 - 392} fill="url(#peaks-far-haze)" />
    <g opacity=".82">{bank(41, 506, 640, 96, 30, 100, ['url(#peaks-bank-g)', 'url(#peaks-bank-s)'], 300, 0.3)}</g>
    <g opacity=".55">{bank(45, 480, 980, 160, 20, 60, ['url(#peaks-bank-g)', 'url(#peaks-bank-s)'], 460, 0.7)}</g>
  </Svg>
)

/* ---------- glacier range ---------- */

const GLACIER = range(
  113,
  [
    [-120, 482],
    [80, 436],
    [330, 404],
    [540, 472],
    [740, 446],
    [930, 490],
    [1140, 510],
    [1330, 424],
    [1530, 462],
  ],
  670,
  { snowY: 440, snowFrac: 0.24, amp: 0.15 },
)

// A small glacier tongue spilling from the snowfield of the big peak.
const GLACIER_TONGUE =
  'M 312 452 C 304 478, 292 500, 286 526 C 282 544, 294 556, 310 552 C 324 548, 330 528, 338 508 C 346 490, 354 472, 358 452 Z'

function flock(seed, n, { x0, y0, scale, dur, phase }) {
  const r = rng(seed)
  return (
    <g
      className="peaks-flock"
      style={{ '--peaks-span': `${W + 2 * PAD + 360}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-dur * phase)}s` }}
    >
      {Array.from({ length: n }, (_, i) => {
        const row = Math.ceil(i / 2)
        const s = scale * (0.85 + r() * 0.3)
        const x = x0 - row * 22 * scale + (r() - 0.5) * 4
        const y = y0 + (i % 2 ? -1 : 1) * row * 11 * scale + (r() - 0.5) * 3
        return (
          <path
            key={i}
            className="peaks-flap"
            d={`M ${f(x - 10 * s)} ${f(y)} q ${f(5 * s)} ${f(-6 * s)} ${f(10 * s)} 0 q ${f(5 * s)} ${f(-6 * s)} ${f(10 * s)} 0`}
            stroke="#4a5672"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={anim(r, 0.9, 0.5, 2)}
          />
        )
      })}
    </g>
  )
}

const glacierRange = (
  <Svg>
    <defs>
      {sunGrad('peaks-gl-lit', '#a3aecf', '#d8bbb6', '#bdb3c6')}
      {sunGrad('peaks-gl-hi', '#b6bfda', '#e8cac0', '#cfc4d0')}
      {rimGrad('peaks-gl-rim', '#fff3e6', 0.85)}
      {vFade('peaks-gl-haze', '#e9e9f1', 0, 0.94)}
      {vFade('peaks-tongue', '#eef4fb', 1, 0.55)}
      {bandGrad('peaks-mist-g', '#ffffff', 0.85)}
    </defs>
    <Range rg={GLACIER} id="peaks-gl" c={{ shade: '#8099c3', rib: '#8aa2c9', snow: '#d5dfef', snowLit: '#fff1e7', crag: '#6f87b4', rimW: 1.8 }} />
    <path d={GLACIER_TONGUE} fill="url(#peaks-tongue)" />
    <path d="M 304 480 l 12 4 M 296 502 l 14 3 M 292 524 l 12 2 M 326 492 l 10 4" stroke="#b5c4df" strokeWidth="1.6" strokeLinecap="round" />
    {sparkles(12, [
      [GLACIER.summits[2][0] + 10, GLACIER.summits[2][1] + 22, 0.8],
      [GLACIER.summits[7][0] - 8, GLACIER.summits[7][1] + 18, 0.7],
    ])}
    <rect x={-PAD} y="512" width={W + 2 * PAD} height={H + 40 - 512} fill="url(#peaks-gl-haze)" />
    {mist(14, 552, 80, 90, 34, 0.68)}
    {mist(15, 592, 70, -70, 27, 0.6)}
    {flock(16, 7, { x0: -PAD - 60, y0: 112, scale: 0.9, dur: 78, phase: 0.3 })}
  </Svg>
)

/* ---------- cable car ridge ---------- */

const MID_PEAKS = [
  [-170, 520],
  [40, 482],
  [250, 452],
  [420, 540],
  [560, 572],
  [720, 596],
  [880, 582],
  [1040, 566],
  [1170, 528],
  [1290, 474],
  [1470, 500],
]
const MID = range(151, MID_PEAKS, 720, { snowY: -1 })

// Forest cover: everything on the ridge below a wavy treeline, with a
// serrated top of tiny pine crowns.
function forestCover(seed, ridge, tree) {
  const r = rng(seed)
  let top = []
  for (let x = -PAD - 20; x <= W + PAD + 20; x += 9) {
    const ry = yAt(ridge, x)
    const tl = tree + Math.sin(x * 0.011) * 18 + Math.sin(x * 0.031) * 8
    const y = Math.max(ry + 3, tl)
    top.push([x, y - (r() < 0.5 ? 0 : 5 + r() * 6)])
  }
  top = top.map(([x, y], i) => [x, i % 2 ? y : y + 6])
  return poly([...top, [W + PAD + 20, H + 40], [-PAD - 20, H + 40]])
}

const CABLE_A = [250, 452]
const CABLE_B = [1286, 478]
const SAG = 46
const cablePath = (dy) => {
  const cx = (CABLE_A[0] + CABLE_B[0]) / 2
  const cy = (CABLE_A[1] + CABLE_B[1]) / 2 + 2 * SAG
  return `M ${CABLE_A[0]} ${CABLE_A[1] + dy} Q ${f(cx)} ${f(cy + dy)} ${CABLE_B[0]} ${CABLE_B[1] + dy}`
}

function station(x, y, s) {
  // a small concrete top station with a dark roof; the cable meets its face
  const w = 34
  return (
    <g>
      <path d={poly([[x - w * 0.6 * s, y + 26], [x - w * 0.6 * s, y + 2], [x + w * 0.4 * s, y + 2], [x + w * 0.4 * s, y + 26]])} fill="#d9dde6" />
      <path d={poly([[x - w * 0.6 * s, y + 26], [x - w * 0.6 * s, y + 2], [x - w * 0.1 * s, y + 2], [x - w * 0.1 * s, y + 26]])} fill="#b9c0d0" />
      <path d={poly([[x - w * 0.7 * s, y + 3], [x - w * 0.5 * s, y - 6], [x + w * 0.5 * s, y - 6], [x + w * 0.5 * s, y + 3]])} fill="#5b6378" />
      <rect x={f(x - w * 0.02 * s)} y={y + 9} width={f(w * 0.3)} height="6" rx="1" fill="#ffe2b0" />
    </g>
  )
}

function Cabin({ dy, cls }) {
  const [x, y] = [CABLE_A[0], CABLE_A[1] + dy]
  return (
    <g className={`peaks-tram ${cls}`}>
      <g className="peaks-swing">
        <rect x={x - 5} y={y - 2.5} width="10" height="4" rx="1.5" fill="#3c4458" />
        <path d={`M ${x} ${y} L ${x} ${y + 12} M ${x - 5} ${y + 12} L ${x + 5} ${y + 12}`} stroke="#3c4458" strokeWidth="1.6" />
        <rect x={x - 12} y={y + 12} width="24" height="17" rx="3.5" fill="#d8432e" />
        <rect x={x - 12} y={y + 23} width="24" height="6" rx="2.5" fill="#a8301f" />
        <rect x={x - 9.5} y={y + 15} width="19" height="6" rx="1.5" fill="#fde7cc" />
        <rect x={x - 1} y={y + 15} width="2" height="6" fill="#d8432e" />
        <rect x={x - 12} y={y + 12} width="24" height="2.4" rx="1.2" fill="#f07b5e" />
      </g>
    </g>
  )
}

// Golden eagle, facing right, about 90 units across.
const EAGLE_WING_L =
  'M -3 -1 C -12 -9, -25 -13, -39 -14 L -44 -17 L -42 -13.4 L -47.5 -14.2 L -44 -11 L -48.5 -10 L -43.5 -8 L -46.5 -5.6 L -37 -5.6 C -26 -4, -14 0, -3 4 Z'
const EAGLE_WING_R =
  'M 3 -1 C 12 -9, 25 -13, 39 -14 L 44 -17 L 42 -13.4 L 47.5 -14.2 L 44 -11 L 48.5 -10 L 43.5 -8 L 46.5 -5.6 L 37 -5.6 C 26 -4, 14 0, 3 4 Z'

function Eagle({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="peaks-eagle-x">
        <g className="peaks-eagle-y">
          <g className="peaks-eagle-face">
            <g className="peaks-wing peaks-wing-l">
              <path d={EAGLE_WING_L} fill="#3a2d29" />
              <path d="M -6 0 C -16 -6, -26 -9, -36 -10 C -26 -7, -16 -3, -6 2 Z" fill="#6c5143" />
            </g>
            <g className="peaks-wing peaks-wing-r">
              <path d={EAGLE_WING_R} fill="#3a2d29" />
              <path d="M 6 0 C 16 -6, 26 -9, 36 -10 C 26 -7, 16 -3, 6 2 Z" fill="#6c5143" />
            </g>
            <path d="M -3.5 6 L 3.5 6 L 6 14 L 0 15.5 L -6 14 Z" fill="#4b3a32" />
            <ellipse cx="0" cy="2.5" rx="4.6" ry="7.5" fill="#3f312b" />
            <circle cx="2.6" cy="-5" r="3.4" fill="#c39457" />
            <path d="M 5.4 -6 L 9 -4.6 L 5.4 -3.4 Z" fill="#f0c04c" />
          </g>
        </g>
      </g>
    </g>
  )
}

const MID_TREE = 520
const cableRidge = (
  <Svg>
    <defs>
      {sunGrad('peaks-mid-lit', '#7890b5', '#a497ab', '#8a90b0')}
      {sunGrad('peaks-mid-hi', '#879ec1', '#b8a6b2', '#9a9fbc')}
      {rimGrad('peaks-mid-rim', '#ffeedd', 0.75)}
      {vFade('peaks-mid-haze', '#d3dce9', 0, 0.95)}
      {bandGrad('peaks-mist-m', '#ffffff', 0.8)}
    </defs>
    <Range rg={MID} id="peaks-mid" c={{ shade: '#5a77a2', rib: '#6380a9', snow: 'none', snowLit: 'none', crag: 'none', rimW: 1.6 }} />
    <path d={forestCover(161, MID.ridge, MID_TREE)} fill="#4f6f97" />
    <path d={forestCover(162, MID.ridge, MID_TREE + 30)} fill="#48678f" />
    <rect x={-PAD} y="566" width={W + 2 * PAD} height={H + 40 - 566} fill="url(#peaks-mid-haze)" />
    {mist(164, 572, 56, 80, 30, 0.75, 'url(#peaks-mist-m)')}

    {station(CABLE_A[0], CABLE_A[1], 1)}
    {station(CABLE_B[0] + 8, CABLE_B[1], -1)}
    <path d={cablePath(0)} fill="none" stroke="#3d4760" strokeWidth="1.4" opacity=".75" />
    <path d={cablePath(6)} fill="none" stroke="#3d4760" strokeWidth="1.4" opacity=".75" />
    <Cabin dy={0} cls="peaks-tram-a" />
    <Cabin dy={6} cls="peaks-tram-b" />
    <Eagle x={1090} y={262} s={0.85} />
  </Svg>
)

/* ---------- alpine lake ---------- */

const SHORE = 624
const LAKE =
  'M 548 640 C 600 626, 700 622, 820 624 C 940 626, 1060 618, 1180 620 C 1280 622, 1350 628, 1420 636 L 1420 666 C 1330 684, 1200 698, 1060 702 C 920 706, 780 700, 680 690 C 610 682, 560 668, 548 640 Z'
const FLOOR = [[-220, 612], [200, 606], [520, 614], [820, 612], [1100, 608], [1420, 612], [1660, 606]]

function lakeGlints(seed, list) {
  const r = rng(seed)
  return list.map(([x, y, w], i) => (
    <rect
      key={i}
      className="peaks-glint"
      x={f(x - w / 2)}
      y={f(y)}
      width={f(w)}
      height="1.8"
      rx="0.9"
      fill="#fffaf0"
      style={anim(r, 2.4, 2.6, 5)}
    />
  ))
}

function sunGlitter(seed) {
  const r = rng(seed)
  return Array.from({ length: 10 }, (_, i) => {
    const y = 630 + i * 6.6 + r() * 2
    const spread = 10 + i * 3
    return [SUN[0] + (r() - 0.5) * spread * 2, y, 6 + r() * 16 * (1 - i / 18)]
  })
}

function Chalet({ x, y }) {
  // x, y: centre of the ground line
  const w = 44
  const h = 24
  const L = x - w / 2
  const R = x + w / 2
  return (
    <g>
      {/* side wall in shade, front gable lit by the low sun */}
      <path d={poly([[R, y], [R, y - h], [R + 16, y - h - 6], [R + 16, y - 6]])} fill="#6e4532" />
      <path d={poly([[L, y], [L, y - h], [x, y - h - 20], [R, y - h], [R, y]])} fill="#a8683f" />
      <path d={poly([[L, y], [L, y - 7], [R, y - 7], [R, y]])} fill="#a9a3a0" />
      <path d={poly([[R, y], [R, y - 7], [R + 16, y - 13], [R + 16, y - 6]])} fill="#8a8380" />
      {/* roof */}
      <path d={poly([[L - 7, y - h + 2], [x, y - h - 24], [x + 4, y - h - 22], [R + 22, y - h - 8], [R + 18, y - h - 2], [x + 2, y - h - 17]])} fill="#5a3a2e" />
      <path d={poly([[L - 7, y - h + 2], [x, y - h - 24], [x + 2, y - h - 18], [L - 3, y - h + 3]])} fill="#3f2821" />
      {/* chimney */}
      <rect x={R + 4} y={y - h - 22} width="6" height="12" fill="#7c7470" />
      <rect x={R + 3} y={y - h - 23} width="8" height="2.5" fill="#5f5855" />
      {/* balcony + windows with red shutters and geraniums */}
      <rect x={L + 2} y={y - h + 3} width={w - 4} height="2.2" fill="#e8c9a0" />
      <path d={`M ${L + 4} ${y - h + 5} v 5 M ${L + 10} ${y - h + 5} v 5 M ${L + 16} ${y - h + 5} v 5 M ${L + 22} ${y - h + 5} v 5 M ${L + 28} ${y - h + 5} v 5 M ${L + 34} ${y - h + 5} v 5 M ${L + 40} ${y - h + 5} v 5`} stroke="#e8c9a0" strokeWidth="1.2" />
      <rect x={L + 2} y={y - h + 10} width={w - 4} height="1.6" fill="#e8c9a0" />
      {[L + 8, R - 14].map((wx) => (
        <g key={wx}>
          <rect x={wx - 3} y={y - 16} width="3" height="8" fill="#c8402f" />
          <rect x={wx + 6} y={y - 16} width="3" height="8" fill="#c8402f" />
          <rect x={wx} y={y - 16} width="6" height="8" fill="#ffd88e" />
          <rect x={wx - 1} y={y - 8} width="8" height="2.4" fill="#7a4a30" />
          <circle cx={wx + 1} cy={y - 8.6} r="1.4" fill="#ff5a6a" />
          <circle cx={wx + 4.5} cy={y - 8.8} r="1.4" fill="#ff7b5a" />
        </g>
      ))}
      <rect x={x - 1} y={y - h - 13} width="3" height="5" rx="1" fill="#ffd88e" />
    </g>
  )
}

function smoke(seed, x, y) {
  const r = rng(seed)
  return Array.from({ length: 6 }, (_, i) => (
    <circle
      key={i}
      className="peaks-smoke"
      cx={x}
      cy={y}
      r={f(4.2 + r() * 1.8)}
      fill="#dcdbe5"
      style={{ animationDuration: '7.2s', animationDelay: `${t2(-i * 1.2 - r() * 0.3)}s` }}
    />
  ))
}

/* ---------- pines ---------- */

// A stylised spruce: tiers with drooping tips; the sun-side half is lit.
function pine(x, base, h, r) {
  const tiers = 4 + Math.floor(r() * 3)
  const trunk = h * 0.07
  const crown = h - trunk
  const w = h * (0.25 + r() * 0.07)
  const top = base - h
  const L = []
  const R = []
  for (let k = 0; k < tiers; k++) {
    const t = (k + 1) / tiers
    const y = top + crown * t
    const th = crown / tiers
    const hw = w * (0.2 + 0.8 * t)
    const jl = 1 + (r() - 0.5) * 0.2
    const jr = 1 + (r() - 0.5) * 0.2
    L.push([x - hw * jl, y + th * 0.08], [x - hw * 0.38, y - th * 0.18])
    R.push([x + hw * jr, y + th * 0.08], [x + hw * 0.38, y - th * 0.18])
  }
  L.pop()
  R.pop()
  const tw = Math.max(1.2, h * 0.035)
  const yb = top + crown
  const dark = poly([[x, top], ...L, [x - w * 0.3, yb], [x - tw, yb], [x - tw, base], [x + tw, base], [x + tw, yb], [x + w * 0.3, yb], ...[...R].reverse()])
  const lit = poly([[x, top], ...R, [x + w * 0.3, yb], [x, yb]])
  return { dark, lit }
}

function pineGroup(seed, list, colors, swayCls = 'peaks-sway') {
  const r = rng(seed)
  return list.map((trees, gi) => {
    let dark = ''
    let lit = ''
    trees.forEach(([x, base, h]) => {
      const p = pine(x, base, h, r)
      dark += p.dark
      lit += p.lit
    })
    return (
      <g key={gi} className={swayCls} style={anim(r, 5, 4, 9)}>
        <path d={dark} fill={colors[0]} />
        <path d={lit} fill={colors[1]} />
      </g>
    )
  })
}

/* ---------- lake layer ---------- */

// A distant treeline along the top of the valley floor.
function treeline(seed, ridge, x0, x1) {
  const r = rng(seed)
  let dark = ''
  let lit = ''
  for (let x = x0; x < x1; x += 6 + r() * 8) {
    const p = pine(x, yAt(ridge, x) + 7 + r() * 5, 9 + r() * 15, r)
    dark += p.dark
    lit += p.lit
  }
  return { dark, lit }
}

// Little brown-and-white alpine cows, grazing; the head dips now and then.
function Cow({ x, y, s, flip, coat, patch, delay }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="0" cy="1" rx="11" ry="2" fill="#4f7d58" opacity=".45" />
      <path d="M -6 -3 v 4 M -3.5 -3 v 4 M 4 -3 v 4 M 6.5 -3 v 4" stroke="#4a3328" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="-8" y="-10" width="16" height="8" rx="3.5" fill={coat} />
      <path d="M -1 -10 C 2 -10, 4 -7, 3 -4 C 1 -3, -2 -4, -2 -7 Z" fill={patch} />
      <path d="M 8 -8 q 3 1 2.4 4" stroke={coat} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <g className="peaks-graze" style={{ animationDelay: delay }}>
        <path d="M -7 -9 L -12 -7 L -13.5 -2.5 L -10.5 -1.5 L -8 -5.5 Z" fill={coat} />
        <path d="M -13.5 -2.5 L -10.5 -1.5 L -10 -3.4 L -13 -4.2 Z" fill="#f1d3c2" />
        <path d="M -11 -7.6 l -1.5 -2 M -9.5 -8 l 0.6 -2.2" stroke="#efe6d8" strokeWidth="0.9" strokeLinecap="round" />
        <circle cx="-9" cy="-3" r="1" fill="#f0c04c" />
      </g>
    </g>
  )
}

function bushes(seed, list) {
  const r = rng(seed)
  return list.map(([x, y, s], i) => (
    <g key={i}>
      <ellipse cx={x + 2} cy={y + 1} rx={12 * s} ry={2.6 * s} fill="#5b8862" opacity=".5" />
      <circle cx={x - 6 * s} cy={y - 5 * s} r={6.5 * s} fill="#5e8f62" />
      <circle cx={x + 4 * s} cy={y - 7 * s} r={8 * s} fill="#6a9a68" />
      <circle cx={x + 7 * s} cy={y - 9 * s} r={4.5 * s * (0.9 + r() * 0.2)} fill="#8db77c" />
    </g>
  ))
}

const FLOOR_PTS = (() => {
  // sample the smooth floor curve so trees can stand on it
  const out = []
  for (let i = 0; i < FLOOR.length - 1; i++) {
    const [x0, y0] = FLOOR[i]
    const [x1, y1] = FLOOR[i + 1]
    for (let k = 0; k < 8; k++) {
      const t = k / 8
      const e = t * t * (3 - 2 * t)
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * e])
    }
  }
  out.push(FLOOR[FLOOR.length - 1])
  return out
})()
const TREELINE = treeline(172, FLOOR_PTS, -PAD, W + PAD)

const lakeLayer = (
  <Svg>
    <defs>
      <linearGradient id="peaks-lake-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b6c6e0" />
        <stop offset="0.36" stopColor="#f1dccf" />
        <stop offset="0.68" stopColor="#bcd3ea" />
        <stop offset="1" stopColor="#93badf" />
      </linearGradient>
      <linearGradient id="peaks-floor-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#93b2a0" />
        <stop offset="0.3" stopColor="#82a68a" />
        <stop offset="1" stopColor="#62926a" />
      </linearGradient>
      <radialGradient id="peaks-sunpath-g">
        <stop offset="0" stopColor="#fffaf0" stopOpacity="0.95" />
        <stop offset="0.5" stopColor="#fff1da" stopOpacity="0.45" />
        <stop offset="1" stopColor="#fff1da" stopOpacity="0" />
      </radialGradient>
      <clipPath id="peaks-lake-clip">
        <path d={LAKE} />
      </clipPath>
      {bandGrad('peaks-mist-l', '#ffffff', 0.85)}
    </defs>
    <path d={smooth(FLOOR)} fill="url(#peaks-floor-g)" />
    <path d={TREELINE.dark} fill="#6a9184" />
    <path d={TREELINE.lit} fill="#87aa97" />
    {mist(187, 594, 40, 70, 26, 0.7, 'url(#peaks-mist-l)')}
    <path d={LAKE} fill="url(#peaks-lake-g)" />
    <g clipPath="url(#peaks-lake-clip)">
      {/* the far ridges mirrored in the water */}
      <path d={poly(GLACIER.ridge.map(([x, y]) => [x, 2 * SHORE - y + 40]).concat([[W + PAD, SHORE - 20], [-PAD, SHORE - 20]]))} fill="#aebedb" opacity=".4" />
      <path d={poly(MID.ridge.map(([x, y]) => [x, 2 * SHORE - y + 8]).concat([[W + PAD, SHORE - 20], [-PAD, SHORE - 20]]))} fill="#8099bf" opacity=".5" />
      <path d={`M ${-PAD} ${SHORE - 4} H ${W + PAD} V ${SHORE + 7} H ${-PAD} Z`} fill="#6a8f86" opacity=".35" />
      <ellipse className="peaks-sunpath" cx={SUN[0]} cy="660" rx="70" ry="34" fill="url(#peaks-sunpath-g)" />
      <g className="peaks-ripples">
        {[636, 646, 658, 671, 686].map((y, i) => (
          <path key={y} d={`M ${-PAD} ${y} H ${W + PAD}`} stroke="#ffffff" strokeWidth={1 + i * 0.2} strokeDasharray={`${40 + i * 18} ${26 + i * 10}`} opacity={0.32 - i * 0.03} />
        ))}
      </g>
      {lakeGlints(181, sunGlitter(182))}
      {lakeGlints(183, [
        [700, 652, 16],
        [860, 676, 20],
        [960, 640, 12],
        [1290, 668, 18],
        [790, 690, 14],
      ])}
    </g>
    <path d="M 548 640 C 600 626, 700 622, 820 624 C 940 626, 1060 618, 1180 620 C 1280 622, 1350 628, 1420 636" fill="none" stroke="#f8f2ea" strokeWidth="1.6" opacity=".6" />
    {mist(188, 630, 30, -60, 21, 0.45, 'url(#peaks-mist-l)')}
    {/* pebble beach along the near shore */}
    <path d="M 1420 666 C 1330 684, 1200 698, 1060 702 C 920 706, 780 700, 680 690 C 610 682, 560 668, 548 640" fill="none" stroke="#ece4d2" strokeWidth="3.4" opacity=".85" />
    <path d="M 1420 670 C 1330 688, 1200 702, 1060 706 C 920 710, 780 704, 680 694" fill="none" stroke="#6e9874" strokeWidth="3" opacity=".6" />
    {/* footpath from the chalet */}
    <path d="M 600 700 C 560 722, 520 732, 470 760 C 430 782, 420 812, 400 860" fill="none" stroke="#d9cfae" strokeWidth="5" strokeLinecap="round" opacity=".75" />
    {bushes(186, [
      [520, 708, 1],
      [700, 722, 0.8],
      [940, 734, 1.1],
      [1010, 726, 0.8],
      [1180, 724, 1],
      [470, 690, 0.8],
    ])}
    <Cow x={834} y={734} s={1} coat="#8a5638" patch="#f3ece2" delay="-1.3s" />
    <Cow x={878} y={744} s={1.05} flip coat="#f1ebe2" patch="#7a4a31" delay="-4.6s" />
    <Cow x={1086} y={736} s={0.95} coat="#9a6544" patch="#f3ece2" delay="-2.9s" />
    {/* jetty and rowboat */}
    <path d="M 668 690 L 712 676 L 714 680 L 670 694 Z" fill="#8b6447" />
    <path d="M 676 692 v 8 M 690 687 v 8 M 704 683 v 8" stroke="#5e4232" strokeWidth="1.6" />
    <path d="M 646 684 l -2 -12 M 650 686 l 1 -14 M 654 686 l 3 -11 M 734 694 l -1 -10 M 738 695 l 2 -12" stroke="#5f8a55" strokeWidth="1.3" strokeLinecap="round" />
    <g className="peaks-boat">
      <path d="M 726 682 L 756 680 C 754 687, 746 690, 738 690 C 732 690, 728 687, 726 682 Z" fill="#c2593b" />
      <path d="M 727 682 L 756 680 L 755.5 682 L 727.4 684 Z" fill="#f2d7b4" />
    </g>
    <Chalet x={612} y={696} />
    {smoke(185, 641, 649)}
  </Svg>
)

/* ---------- pine forest ---------- */

const LEFT_SLOPE = [[-220, 560], [40, 586], [220, 628], [380, 690], [500, 760], [560, 830], [580, 940]]
const RIGHT_SLOPE = [[1660, 524], [1480, 540], [1360, 592], [1280, 660], [1222, 740], [1196, 830], [1186, 940]]

function slopeTrees(seed, slope, from, to, step, minH, maxH, depthOff, groupSize) {
  const r = rng(seed)
  const groups = []
  let cur = []
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let x = lo; x <= hi; x += step * (0.7 + r() * 0.6)) {
    const base = yAt(slope, x) + depthOff + r() * 18
    cur.push([x, base, minH + r() * (maxH - minH)])
    if (cur.length >= groupSize) {
      groups.push(cur)
      cur = []
    }
  }
  if (cur.length) groups.push(cur)
  return groups
}

const LEFT_PTS = [...LEFT_SLOPE].sort((a, b) => a[0] - b[0])
const RIGHT_PTS = [...RIGHT_SLOPE].sort((a, b) => a[0] - b[0])

const pineForest = (
  <Svg>
    <defs>
      <linearGradient id="peaks-slope-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5a8a68" />
        <stop offset="0.5" stopColor="#447559" />
        <stop offset="1" stopColor="#36644b" />
      </linearGradient>
    </defs>
    <path d={poly([...LEFT_SLOPE, [-220, 940]])} fill="url(#peaks-slope-g)" />
    <path d={poly([...RIGHT_SLOPE, [1660, 940]])} fill="url(#peaks-slope-g)" />
    {pineGroup(201, slopeTrees(202, LEFT_PTS, -200, 480, 26, 56, 96, 2, 4), ['#527f6e', '#7ba383'])}
    {pineGroup(203, slopeTrees(204, RIGHT_PTS, 1214, 1640, 26, 56, 96, 2, 4), ['#527f6e', '#7ba383'])}
    {pineGroup(205, slopeTrees(206, LEFT_PTS, -200, 440, 40, 100, 170, 36, 3), ['#2f5e4d', '#5a8d5a'])}
    {pineGroup(207, slopeTrees(208, RIGHT_PTS, 1236, 1640, 40, 100, 170, 36, 3), ['#2f5e4d', '#5a8d5a'])}
    {pineGroup(
      209,
      [
        [
          [70, 760, 250],
          [150, 790, 190],
        ],
        [
          [1376, 760, 236],
          [1306, 800, 170],
        ],
      ],
      ['#24503f', '#4a7f51'],
    )}
  </Svg>
)

/* ---------- wildflower meadow ---------- */

const MEADOW_BACK = [[-220, 772], [120, 748], [420, 772], [700, 754], [980, 776], [1260, 750], [1500, 770], [1660, 760]]
const MEADOW = [[-220, 796], [160, 780], [480, 798], [820, 784], [1120, 802], [1400, 778], [1660, 794]]

function tufts(seed, count, y0, y1, colors) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = -80 + (i + r() * 0.7) * ((W + 160) / count)
    const base = y0 + r() * (y1 - y0)
    const h = 34 + r() * 50
    let d = ''
    const blades = 4 + Math.floor(r() * 4)
    for (let b = 0; b < blades; b++) {
      const bx = x + (b - blades / 2) * 6
      const lean = (r() - 0.35) * 46
      const bh = h * (0.55 + r() * 0.45)
      d += `M ${f(bx - 3.5)} ${f(base)} Q ${f(bx + lean * 0.3)} ${f(base - bh * 0.6)} ${f(bx + lean)} ${f(base - bh)} Q ${f(bx + lean * 0.2 + 2.5)} ${f(base - bh * 0.5)} ${f(bx + 3.5)} ${f(base)} Z `
    }
    return (
      <g key={i} className="peaks-gust" style={{ animationDelay: `${t2(-24 + x * 0.004)}s` }}>
        <path className="peaks-tuft" d={d} fill={colors[i % colors.length]} style={anim(r, 3.2, 2.4, 6)} />
      </g>
    )
  })
}

const FLOWER_KINDS = {
  daisy: ['#ffffff', '#ffd04a'],
  gentian: ['#3f63d8', '#6f8ff0'],
  arnica: ['#ffc43a', '#e98a1c'],
  campion: ['#e2588f', '#f58fb6'],
  bell: ['#8c6be0', '#b49cf2'],
}

function flowers(seed, clusters) {
  const r = rng(seed)
  return clusters.map(([cx, cy, n, kinds, sc = 1], i) => {
    const stems = []
    const heads = []
    for (let k = 0; k < n; k++) {
      const kind = kinds[Math.floor(r() * kinds.length)]
      const [c1, c2] = FLOWER_KINDS[kind]
      const x = cx + (r() - 0.5) * 70 * sc
      const base = cy + (r() - 0.5) * 16 * sc
      const h = (16 + r() * 26) * sc
      const hx = x + (r() - 0.5) * 8
      const hy = base - h
      const s = (3.6 + r() * 2.2) * sc
      stems.push(`M ${f(x)} ${f(base)} Q ${f(x)} ${f(base - h * 0.5)} ${f(hx)} ${f(hy)}`)
      if (kind === 'daisy' || kind === 'arnica') {
        heads.push(<circle key={`a${k}`} cx={f(hx)} cy={f(hy)} r={f(s)} fill={c1} />)
        heads.push(<circle key={`b${k}`} cx={f(hx)} cy={f(hy)} r={f(s * 0.42)} fill={c2} />)
      } else if (kind === 'gentian' || kind === 'bell') {
        heads.push(
          <path
            key={`a${k}`}
            d={`M ${f(hx - s)} ${f(hy - s * 1.1)} L ${f(hx - s * 0.5)} ${f(hy - s * 0.5)} L ${f(hx)} ${f(hy - s * 1.2)} L ${f(hx + s * 0.5)} ${f(hy - s * 0.5)} L ${f(hx + s)} ${f(hy - s * 1.1)} C ${f(hx + s)} ${f(hy + s * 0.3)}, ${f(hx + s * 0.4)} ${f(hy + s * 0.6)}, ${f(hx)} ${f(hy + s * 0.6)} C ${f(hx - s * 0.4)} ${f(hy + s * 0.6)}, ${f(hx - s)} ${f(hy + s * 0.3)}, ${f(hx - s)} ${f(hy - s * 1.1)} Z`}
            fill={c1}
          />,
        )
        heads.push(<path key={`b${k}`} d={`M ${f(hx + s * 0.2)} ${f(hy - s * 0.4)} L ${f(hx + s * 0.8)} ${f(hy - s * 0.9)} L ${f(hx + s * 0.7)} ${f(hy + s * 0.1)} Z`} fill={c2} />)
      } else {
        heads.push(<circle key={`a${k}`} cx={f(hx)} cy={f(hy)} r={f(s * 0.9)} fill={c1} />)
        heads.push(<circle key={`b${k}`} cx={f(hx - s * 0.25)} cy={f(hy - s * 0.3)} r={f(s * 0.4)} fill={c2} />)
      }
    }
    return (
      <g key={i} className="peaks-bloomsway" style={anim(r, 3.6, 2.4, 6)}>
        <path d={stems.join(' ')} stroke="#4f8a3f" strokeWidth={f(1.6 * sc)} fill="none" strokeLinecap="round" />
        {heads}
      </g>
    )
  })
}

function boulder(x, y, w, h) {
  return (
    <g>
      <ellipse cx={x + w * 0.05} cy={y + 2} rx={w * 0.62} ry={h * 0.16} fill="#3f7340" opacity=".55" />
      <path d={poly([[x - w / 2, y], [x - w * 0.42, y - h * 0.62], [x - w * 0.1, y - h], [x + w * 0.3, y - h * 0.88], [x + w / 2, y - h * 0.3], [x + w * 0.46, y]])} fill="#8b8f9e" />
      <path d={poly([[x - w * 0.1, y - h], [x + w * 0.3, y - h * 0.88], [x + w / 2, y - h * 0.3], [x + w * 0.46, y], [x + w * 0.06, y], [x - w * 0.02, y - h * 0.45]])} fill="#c4bfc2" />
      <path d={poly([[x - w * 0.1, y - h], [x + w * 0.3, y - h * 0.88], [x + w * 0.12, y - h * 0.62], [x - w * 0.02, y - h * 0.45]])} fill="#e4d6cf" />
      <path d={poly([[x - w / 2, y], [x - w * 0.42, y - h * 0.62], [x - w * 0.3, y - h * 0.5], [x - w * 0.2, y]])} fill="#6f7385" />
    </g>
  )
}

// A carpet of tiny static blossoms across the back of the meadow.
function flowerDots(seed, ridge, count) {
  const r = rng(seed)
  const cols = ['#ffffff', '#ffffff', '#ffe066', '#ffd23f', '#f27fae', '#7f9bf0', '#c9a6ff']
  return Array.from({ length: count }, (_, i) => {
    const x = -120 + r() * (W + 240)
    const y = yAt(ridge, x) + 6 + r() * 34
    return <circle key={i} cx={f(x)} cy={f(y)} r={f(1.3 + r() * 1.7)} fill={cols[Math.floor(r() * cols.length)]} opacity={t2(0.7 + r() * 0.3)} />
  })
}

const meadow = (
  <Svg>
    <defs>
      <linearGradient id="peaks-meadow-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#78b263" />
        <stop offset="0.4" stopColor="#5f9c52" />
        <stop offset="1" stopColor="#467f43" />
      </linearGradient>
      <linearGradient id="peaks-meadow-warm" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffe48a" stopOpacity="0" />
        <stop offset="0.55" stopColor="#ffe48a" stopOpacity="0.06" />
        <stop offset="1" stopColor="#ffd970" stopOpacity="0.26" />
      </linearGradient>
    </defs>
    <path d={smooth(MEADOW_BACK)} fill="#8cc070" />
    <path d={smooth(MEADOW_BACK)} fill="url(#peaks-meadow-warm)" />
    <path d={smooth(MEADOW_BACK.map(([x, y]) => [x, y - 2]))} fill="none" stroke="#e4efa0" strokeWidth="2.4" opacity=".8" />
    {flowerDots(219, MEADOW_BACK, 150)}
    <path d={smooth(MEADOW)} fill="url(#peaks-meadow-g)" />
    <path d={smooth(MEADOW)} fill="url(#peaks-meadow-warm)" />
    <path d={smooth(MEADOW.map(([x, y]) => [x, y - 2]))} fill="none" stroke="#dcea94" strokeWidth="3" opacity=".75" />
    <path d={smooth(MEADOW.map(([x, y]) => [x + 60, y + 46]))} fill="#548f49" opacity=".8" />
    {flowerDots(220, MEADOW.map(([x, y]) => [x, y + 8]), 70)}
    {boulder(300, 818, 92, 58)}
    {boulder(372, 826, 46, 26)}
    {boulder(1100, 840, 74, 44)}
    {flowers(221, [
      [120, 818, 9, ['daisy', 'arnica', 'campion']],
      [470, 812, 8, ['gentian', 'daisy', 'bell']],
      [640, 832, 10, ['arnica', 'daisy', 'campion'], 1.1],
      [860, 808, 7, ['gentian', 'bell', 'daisy']],
      [990, 842, 9, ['campion', 'daisy', 'arnica'], 1.15],
      [1220, 812, 8, ['daisy', 'gentian', 'arnica']],
      [1330, 840, 9, ['bell', 'campion', 'daisy'], 1.15],
      [230, 858, 9, ['arnica', 'gentian', 'daisy'], 1.3],
      [760, 868, 9, ['daisy', 'campion', 'gentian'], 1.35],
      [1180, 872, 8, ['gentian', 'daisy', 'arnica'], 1.35],
      [118, 878, 6, ['daisy', 'arnica', 'daisy'], 1.7],
      [1352, 882, 6, ['campion', 'daisy', 'gentian'], 1.7],
    ])}
    {tufts(231, 14, 856, 905, ['#3d7a3a', '#4a8a42', '#33693a', '#5a9a48'])}
  </Svg>
)

/* ---------- boughs & light ---------- */

// One spruce spray: a tapering, serrated frond from p to q that droops
// toward its tip. k scales the width (back, main and lit passes reuse it).
function sprayPath(p, q, w, k, dy, r) {
  const ang = Math.atan2(q[1] - p[1], q[0] - p[0])
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  const n = 28
  const A = []
  const B = []
  for (let i = 1; i < n; i++) {
    const t = i / n
    const c = lerp(p, q, t)
    const prof = w * k * Math.min(1, t * 3.2) * (1 - t * 0.72)
    const z = i % 2 ? 1 : 0.6
    const droop = t * t * w * 0.45 + dy
    A.push([c[0] + nx * prof * z * (0.9 + r() * 0.2), c[1] + ny * prof * z + droop])
    B.push([c[0] - nx * prof * z * (0.9 + r() * 0.2), c[1] - ny * prof * z + droop])
  }
  return poly([[p[0], p[1] + dy], ...A, [q[0], q[1] + w * 0.45 + dy], ...B.reverse()])
}

// A drooping spruce bough: a branch with fronds either side, drawn in three
// tones (shadowed back fronds, body, sun-caught tops) plus fresh green tips.
function bough(seed, pts, len, w) {
  const r = rng(seed)
  const fronds = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    for (let k = 0; k < 5; k++) {
      const p = lerp(a, b, (k + 0.3 + r() * 0.5) / 5)
      const dir = k % 2 ? 1 : -1
      const ta = ang + dir * (0.38 + r() * 0.3)
      const tl = len * (0.5 + r() * 0.45) * (1 - (i / pts.length) * 0.3)
      fronds.push([p, [p[0] + Math.cos(ta) * tl, p[1] + Math.sin(ta) * tl], w * (0.8 + r() * 0.35)])
    }
  }
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  fronds.push([prev, lerp(prev, last, 1.35), w])
  const pass = (k, dy) => fronds.map(([p, q, fw]) => sprayPath(p, q, fw, k, dy, r)).join(' ')
  const tips = fronds
    .map(([p, q, fw]) => sprayPath(lerp(p, q, 0.76), q, fw * 0.5, 1, fw * 0.36, r))
    .join(' ')
  let branch = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length; i++) branch += ` L ${f(pts[i][0])} ${f(pts[i][1])}`
  return {
    branch,
    twigs: fronds.map(([p, q]) => `M ${f(p[0])} ${f(p[1])} L ${f(q[0])} ${f(q[1] + 6)}`).join(' '),
    back: pass(1.18, 5),
    body: pass(1, 0),
    lit: pass(0.55, -3),
    tips,
  }
}

const BOUGH = bough(
  241,
  [
    [-70, 30],
    [50, 52],
    [150, 82],
    [240, 118],
    [310, 160],
  ],
  76,
  18,
)
const BOUGH2 = bough(
  243,
  [
    [-70, 226],
    [10, 240],
    [80, 266],
    [128, 298],
  ],
  52,
  14,
)

function Bough({ b, origin, dur, delay, scale = 1 }) {
  return (
    <g className="peaks-bough" style={{ transformOrigin: origin, animationDuration: dur, animationDelay: delay }}>
      <path d={b.back} fill="#14352b" />
      <path d={b.branch} stroke="#3b2e25" strokeWidth={9 * scale} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={b.twigs} stroke="#3b2e25" strokeWidth={2.4 * scale} fill="none" strokeLinecap="round" />
      <path d={b.body} fill="#22503c" />
      <path d={b.lit} fill="#346b4a" />
      <path d={b.tips} fill="#86b45c" opacity=".9" />
    </g>
  )
}

function motes(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = 380 + r() * 1000
    const y = 300 + r() * 480
    return (
      <circle
        key={i}
        className={`peaks-mote peaks-mote-${'abc'[i % 3]}`}
        cx={f(x)}
        cy={f(y)}
        r={f(1.4 + r() * 2.4)}
        fill="url(#peaks-mote-g)"
        style={anim(r, 12, 10, 22)}
      />
    )
  })
}

function shafts() {
  // long soft wedges of light raking down from the low sun; each is three
  // nested wedges so its edges fade instead of ending in a hard line
  const list = [
    [-0.18, 0.05, 0.9, 9],
    [0.0, 0.04, 0.7, 12],
    [0.2, 0.06, 0.8, 10],
    [0.42, 0.035, 0.6, 14],
  ]
  const p = (ang, rad) => `${f(SUN[0] + Math.cos(ang) * rad)} ${f(SUN[1] + Math.sin(ang) * rad)}`
  return list.map(([a0, s, o, dur], i) => {
    const a = Math.PI * 0.84 + a0
    return (
      <g key={i} opacity={o}>
        <g className="peaks-shaft" style={{ animationDuration: `${dur}s`, animationDelay: `${-i * 3.3}s` }}>
          {[1, 0.66, 0.33].map((k) => (
            <path key={k} d={`M ${p(a, 40)} L ${p(a - s * k, 1300)} L ${p(a + s * k, 1300)} Z`} fill="url(#peaks-shaft-g)" opacity=".4" />
          ))}
        </g>
      </g>
    )
  })
}

const boughs = (
  <Svg>
    <defs>
      <radialGradient id="peaks-shaft-g" cx={SUN[0]} cy={SUN[1]} r="1300" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff4dc" stopOpacity="0" />
        <stop offset="0.25" stopColor="#fff2d6" stopOpacity="0.3" />
        <stop offset="0.6" stopColor="#fff2d6" stopOpacity="0.14" />
        <stop offset="1" stopColor="#fff2d6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="peaks-mote-g">
        <stop offset="0" stopColor="#fffbe8" />
        <stop offset="0.45" stopColor="#ffeeb8" stopOpacity="0.85" />
        <stop offset="1" stopColor="#ffe7a8" stopOpacity="0" />
      </radialGradient>
    </defs>
    {shafts()}
    {motes(251, 16)}
    <Bough b={BOUGH2} origin="-70px 214px" dur="7.5s" delay="-2s" scale={0.8} />
    <Bough b={BOUGH} origin="-70px 40px" dur="9s" delay="-5s" />
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'morning',
  name: 'Morning Peaks',
  tag: 'Alpine sunrise',
  accent: '#5aa2ff',
  accent2: '#ffd29a',
  ink: '#1f6fd6',
  glow: '#8cc0ff',
  light: true,
  clockColor: '#1b2a44',
  sky: 'linear-gradient(180deg,#74ade8 0%,#98c7f0 18%,#c2def5 36%,#e6ecf1 48%,#fbe3d2 58%,#ffd6b4 68%,#ffcca2 82%,#fdc59c 100%)',
  layers: [
    { name: 'Sky and sun', depth: 0, sky: true, el: skyPlate },
    { name: 'Far summits', depth: 0.12, el: farSummits },
    { name: 'Glacier range', depth: 0.26, el: glacierRange },
    { name: 'Depth clock', depth: 0.4, clock: true },
    { name: 'Cable car ridge', depth: 0.55, el: cableRidge },
    { name: 'Alpine lake', depth: 0.72, el: lakeLayer },
    { name: 'Pine forest', depth: 0.92, el: pineForest },
    { name: 'Wildflower meadow', depth: 1.1, el: meadow },
    { name: 'Boughs and light', depth: 1.3, el: boughs },
  ],
}
