// Aurora Pines — a silent arctic night where the sky is dancing.
// Three aurora curtains (luminous folded ribbons with ray striations that
// shimmer, ripple sideways and lean in the solar wind) hang over snowy faceted
// peaks. A frozen lake holds a softer, rippled copy of the light while a
// reindeer herd crosses the ice; a log cabin glows on the near shore with
// smoke curling from its chimney; snow-laden pines sway and snow falls at
// three depths. The aurora's slow surge is shared by every layer, so the snow
// and the ice brighten with it.

import './aurora.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- helpers ---------- */

const TAU = Math.PI * 2
const sec = (n) => `${n.toFixed(2)}s`
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const ease = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const qb = (t, a, c, b) => (1 - t) * (1 - t) * a + 2 * t * (1 - t) * c + t * t * b

// Cosine interpolation through [x, y] control points (x ascending).
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    if (x <= x1) return y0 + ((y1 - y0) * (1 - Math.cos(((x - x0) / (x1 - x0)) * Math.PI))) / 2
  }
  return pts[pts.length - 1][1]
}

// Smooth ridge through hand-placed points; `open` returns only the top edge.
function hills(pts, open = false) {
  let d = open ? `M ${pts[0][0]} ${pts[0][1]}` : `M ${pts[0][0]} ${H + 40} L ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const mx = (x0 + x1) / 2
    d += ` C ${f(mx)} ${y0}, ${f(mx)} ${y1}, ${x1} ${y1}`
  }
  return open ? d : `${d} L ${pts[pts.length - 1][0]} ${H + 40} Z`
}

// Height of a hills() ridge at x.
function ridgeY(pts, x) {
  const bez = (t, a, b, c, e) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * e
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x < x0 || x > x1) continue
    const mx = (x0 + x1) / 2
    let lo = 0
    let hi = 1
    for (let k = 0; k < 24; k++) {
      const t = (lo + hi) / 2
      if (bez(t, x0, mx, mx, x1) < x) lo = t
      else hi = t
    }
    return bez(lo, y0, y0, y1, y1)
  }
  return pts[pts.length - 1][1]
}

// Circle as a closed subpath, so thousands of dots can share one <path>.
const dot = (x, y, r) => `M ${f(x - r)} ${f(y)} a ${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`

// Static dots merged into one path per (colour, opacity bucket).
function dotPaths(list, key) {
  const buckets = new Map()
  for (const [x, y, r, color, op] of list) {
    const o = (Math.round(op * 5) / 5).toFixed(1)
    const k = `${color}|${o}`
    buckets.set(k, (buckets.get(k) || '') + dot(x, y, r))
  }
  return [...buckets].map(([k, d]) => {
    const [color, o] = k.split('|')
    return <path key={`${key}${k}`} d={d} fill={color} fillOpacity={o} />
  })
}

const SHORE = 572 // far edge of the frozen lake (viewBox units)
const MOON = { x: 1262, y: 150, r: 19 }
// Mirror about the shoreline, squashed: the lake's softer copy of the sky.
const FLIP = `translate(0 ${SHORE}) scale(1 -0.55) translate(0 ${-SHORE})`

/* ---------- aurora curtains ---------- */

// A curtain is a folded ribbon. Its baseline swings back on itself, so the
// light bunches into bright pleats. Three kinds of element share that ribbon:
// wide soft "body" columns (the glow), short "edge" pieces (the bright lower
// border) and thin "ray" striations. Everything is split into overlapping
// clusters; each cluster shimmers and ripples on its own phase, which reads
// as a wave of light running along the curtain.
function curtain({ seed, x0, x1, base, height, folds, fold, phase, body = 0, veil = 0, edge = 0, rays = 0, clusters, ends }) {
  const r = rng(seed)
  const groups = Array.from({ length: clusters }, () => [])
  let id = 0
  for (const [kind, n] of [['veil', veil], ['body', body], ['edge', edge], ['ray', rays]]) {
    for (let j = 0; j < n; j++) {
      const s = (j + r()) / n
      const a = TAU * folds * s + phase
      const x = x0 + (x1 - x0) * s + fold * Math.sin(a)
      const y = interp(base, x) + fold * 0.16 * Math.cos(a)
      const fade = ease(0, ends[0], s) * ease(1, 1 - ends[1], s)
      const swell = 0.5 + 0.5 * Math.sin(TAU * 2.1 * s + phase * 2.3)
      const wob = 1 + 0.2 * Math.sin(TAU * 5.3 * s + phase) + 0.12 * Math.sin(TAU * 11.7 * s + 2 * phase)
      const h0 = interp(height, x) * (0.6 + 0.4 * fade) * (0.85 + 0.25 * swell) * wob
      let h
      let w
      let op
      if (kind === 'veil') {
        h = h0 * (0.9 + 0.35 * r())
        w = 34 + r() * 34
        op = 0.5 + 0.3 * r()
      } else if (kind === 'body') {
        h = h0 * (0.9 + 0.2 * r())
        w = 40 + r() * 34
        op = 0.3 + 0.24 * r()
      } else if (kind === 'edge') {
        h = 16 + r() * 26
        w = 4 + r() * 9
        op = 0.35 + 0.5 * r()
      } else {
        h = h0 * (0.55 + 0.7 * r()) * (r() < 0.12 ? 1.45 : 1)
        w = 1.2 + r() * 2.6
        op = 0.16 + 0.42 * r()
      }
      op *= fade * (0.6 + 0.4 * swell)
      // rays converge a little toward the zenith
      const lean = kind === 'edge' ? 0 : ((720 - x) * 0.022 * h) / 160
      const k = clamp(Math.floor(s * clusters + (r() - 0.5) * 1.5), 0, clusters - 1)
      groups[k].push({ id: id++, kind, x, y, h, w, op, lean })
    }
  }
  // the folded baseline itself, traced as one continuous luminous ribbon
  const at = (s) => {
    const a = TAU * folds * s + phase
    const x = x0 + (x1 - x0) * s + fold * Math.sin(a)
    return [x, interp(base, x) + fold * 0.16 * Math.cos(a) + 1]
  }
  let ribbon = ''
  for (let i = 0; i <= 480; i++) {
    const [x, y] = at(i / 480)
    ribbon += `${i ? ' L' : 'M'} ${f(x)} ${f(y)}`
  }
  const stops = []
  for (let i = 0; i <= 32; i++) {
    const s = i / 32
    const fade = ease(0, ends[0] * 2, s) * ease(1, 1 - ends[1] * 2, s)
    const swell = 0.5 + 0.5 * Math.sin(TAU * 2.1 * s + phase * 2.3)
    stops.push([s, fade * (0.08 + 0.92 * swell ** 1.6)])
  }
  return { groups, ribbon, stops, span: [x0, x1] }
}

// Ribbon strokes: a bright core over two glows, brightness varying along x.
function ribbonEls({ ribbon, stops, span }, key, core, glow, width = 1, withCore = true) {
  const g = (id, color) => (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={span[0]} y1="0" x2={span[1]} y2="0">
      {stops.map(([o, a]) => (
        <stop key={o} offset={o.toFixed(3)} stopColor={color} stopOpacity={a.toFixed(2)} />
      ))}
    </linearGradient>
  )
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        {g(`aurora-rib-${key}`, core)}
        {g(`aurora-ribglow-${key}`, glow)}
      </defs>
      <path d={ribbon} stroke={`url(#aurora-ribglow-${key})`} strokeOpacity=".14" strokeWidth={18 * width} />
      <path d={ribbon} stroke={`url(#aurora-ribglow-${key})`} strokeOpacity=".32" strokeWidth={6 * width} />
      {withCore && <path d={ribbon} stroke={`url(#aurora-rib-${key})`} strokeOpacity=".75" strokeWidth={1.5 * width} />}
    </g>
  )
}

const rayPath = ({ kind, x, y, h, w, lean }) => {
  const b = y + (kind === 'edge' ? 3 : 6)
  const t = y - h
  return `M ${f(x - w / 2)} ${f(b)} L ${f(x + w / 2)} ${f(b)} L ${f(x + w / 2 + lean)} ${f(t)} L ${f(x - w / 2 + lean)} ${f(t)} Z`
}

// Render a curtain's clusters. `seed` fixes the per-cluster phase jitter, so
// the lake reflection can replay exactly the same shimmer as the sky.
function curtainEls({ data, seed, dur, wave, dir, grad, lite = false }) {
  const r = rng(seed)
  const K = data.groups.length
  return data.groups.map((pieces, k) => {
    const pos = dir > 0 ? K - 1 - k : k
    const delay = -(pos / K) * wave * dur - r() * 0.8
    return (
      <g key={k} className="aurora-fold" style={{ animationDuration: sec(dur), animationDelay: sec(delay) }}>
        {pieces
          .filter((p) => !lite || p.kind !== 'ray')
          .map((p) =>
            p.kind === 'veil' ? (
              <ellipse
                key={p.id}
                cx={f(p.x + p.lean * 0.5)}
                cy={f(p.y - p.h * 0.42)}
                rx={f(p.w / 2)}
                ry={f(p.h * 0.6)}
                fill={`url(#aurora-veil-${grad})`}
                opacity={p.op.toFixed(2)}
              />
            ) : (
              <path key={p.id} d={rayPath(p)} fill={`url(#aurora-${p.kind}-${grad})`} opacity={p.op.toFixed(2)} />
            ),
          )}
      </g>
    )
  })
}

// Whole-curtain motion: a slow sideways drift around a lean from the base.
function sway({ origin, drift, lean, reverse = false }, children) {
  return (
    <g
      className="aurora-drift"
      style={{
        animationDuration: sec(drift[0]),
        animationDelay: sec(drift[1]),
        animationDirection: reverse ? 'alternate-reverse' : undefined,
      }}
    >
      <g className="aurora-lean" style={{ transformOrigin: origin, animationDuration: sec(lean[0]), animationDelay: sec(lean[1]) }}>
        {children}
      </g>
    </g>
  )
}

// Main curtain: a bright green "smile" that dips under the clock.
const A_BASE = [[-260, 300], [100, 322], [400, 372], [720, 410], [1040, 372], [1300, 318], [1700, 280]]
const A_HEIGHT = [[-260, 175], [250, 168], [520, 134], [720, 112], [920, 134], [1250, 138], [1700, 165]]
// Second curtain hangs behind and above it, cyan into violet.
const A2_BASE = [[-260, 246], [150, 262], [450, 314], [720, 348], [1000, 320], [1300, 266], [1700, 230]]
const A2_HEIGHT = [[-260, 175], [400, 165], [620, 98], [720, 74], [820, 98], [1050, 150], [1250, 92], [1700, 150]]
// A faint violet-pink veil high in the left sky, running off the top edge.
const B_BASE = [[-260, 176], [100, 146], [350, 110], [560, 90]]
const B_HEIGHT = [[-260, 150], [300, 165], [560, 125]]

const CA = curtain({
  seed: 11, x0: -260, x1: 1700, base: A_BASE, height: A_HEIGHT, folds: 2.6, fold: 140, phase: 0.6,
  body: 110, edge: 130, rays: 120, clusters: 12, ends: [0.02, 0.02],
})
const CA2 = curtain({
  seed: 23, x0: -260, x1: 1700, base: A2_BASE, height: A2_HEIGHT, folds: 2.4, fold: 140, phase: 2.2,
  body: 76, edge: 64, rays: 70, clusters: 9, ends: [0.02, 0.02],
})
const CB = curtain({
  seed: 37, x0: -260, x1: 620, base: B_BASE, height: B_HEIGHT, folds: 1.6, fold: 70, phase: 4.1,
  veil: 54, rays: 30, clusters: 6, ends: [0.04, 0.42],
})

// Diffuse violet/pink glow above a curtain (the high-altitude colour).
function crown(base, height, xs, id, lift, spread) {
  return xs.map((x) => (
    <ellipse
      key={x}
      cx={x}
      cy={f(interp(base, x) - interp(height, x) * lift)}
      rx={spread}
      ry={f(interp(height, x) * 0.5)}
      fill={`url(#${id})`}
    />
  ))
}

const A_PROPS = { data: CA, seed: 101, dur: 9.5, wave: 1.3, dir: 1, grad: 'a' }
const A_SWAY = { origin: '720px 410px', drift: [21, -6], lean: [16, -3] }

function mainCurtain(lite = false) {
  return sway(
    A_SWAY,
    <>
      {crown(A_BASE, A_HEIGHT, [-60, 220, 480, 740, 1000, 1260, 1520], 'aurora-crown-a', 0.75, 210)}
      {ribbonEls(CA, lite ? 'ar' : 'a', '#f2fff8', '#5dffb0')}
      {curtainEls({ ...A_PROPS, lite })}
    </>,
  )
}

// Ray gradients run bottom (bright lower border) to top (violet/pink fringe).
const grad = (id, stops) => (
  <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
    {stops.map(([o, c, a]) => (
      <stop key={o} offset={o} stopColor={c} stopOpacity={a} />
    ))}
  </linearGradient>
)
// Body and edge pieces use a "flame": an ellipse anchored at the bottom
// centre that fades toward the sides and the top, so columns blend softly.
const flame = (id, stops) => (
  <radialGradient id={id} cx="0.5" cy="1" r="1" gradientTransform="translate(0.5 1) scale(0.5 1) translate(-0.5 -1)">
    {stops.map(([o, c, a]) => (
      <stop key={o} offset={o} stopColor={c} stopOpacity={a} />
    ))}
  </radialGradient>
)

const auroraDefs = (
  <defs>
    {grad('aurora-ray-a', [
      [0, '#ff8fd8', 0],
      [0.012, '#ff9be0', 0.6],
      [0.035, '#e8fff2', 0.9],
      [0.12, '#6dffb0', 0.72],
      [0.35, '#33e6a0', 0.42],
      [0.6, '#3bb8d0', 0.26],
      [0.8, '#8a62ff', 0.22],
      [0.93, '#e070ff', 0.1],
      [1, '#ff7ad8', 0],
    ])}
    {flame('aurora-body-a', [
      [0, '#c4ffe2', 0.8],
      [0.1, '#6dffb4', 0.66],
      [0.3, '#33e6a0', 0.42],
      [0.5, '#2ac0b0', 0.2],
      [0.7, '#5f6aff', 0.07],
      [0.86, '#a46bff', 0.02],
      [1, '#a46bff', 0],
    ])}
    {grad('aurora-edge-a', [
      [0, '#ff9ee0', 0],
      [0.06, '#ffb0e6', 0.5],
      [0.15, '#f4fff8', 1],
      [0.42, '#8dffc4', 0.55],
      [1, '#3dffa0', 0],
    ])}
    {grad('aurora-ray-b', [
      [0, '#66ffff', 0],
      [0.04, '#c4fff4', 0.75],
      [0.15, '#46f0cf', 0.55],
      [0.42, '#3aa8e8', 0.32],
      [0.7, '#8d5cff', 0.24],
      [0.9, '#ff6fd0', 0.12],
      [1, '#ff6fd0', 0],
    ])}
    {flame('aurora-body-b', [
      [0, '#a6fff0', 0.6],
      [0.15, '#5ff0d8', 0.42],
      [0.4, '#3ab8e0', 0.22],
      [0.65, '#7d5cff', 0.08],
      [0.85, '#c86bff', 0.02],
      [1, '#c86bff', 0],
    ])}
    {grad('aurora-edge-b', [
      [0, '#7ff7ff', 0],
      [0.12, '#e6fffb', 0.85],
      [0.45, '#7ff0e0', 0.45],
      [1, '#5ff0d8', 0],
    ])}
    {grad('aurora-ray-c', [
      [0, '#7dffc8', 0],
      [0.05, '#a5ffdc', 0.4],
      [0.25, '#49d9c0', 0.28],
      [0.5, '#7d72ff', 0.26],
      [0.78, '#e06bf0', 0.2],
      [1, '#ff7ad0', 0],
    ])}
    <radialGradient id="aurora-veil-c">
      <stop offset="0" stopColor="#a07cff" stopOpacity="0.3" />
      <stop offset="0.45" stopColor="#c46bf0" stopOpacity="0.14" />
      <stop offset="1" stopColor="#ff7ad0" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="aurora-crown-a">
      <stop offset="0" stopColor="#8f6bff" stopOpacity="0.26" />
      <stop offset="0.5" stopColor="#b86bff" stopOpacity="0.1" />
      <stop offset="1" stopColor="#ff7ad8" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="aurora-crown-b">
      <stop offset="0" stopColor="#d070ff" stopOpacity="0.22" />
      <stop offset="0.5" stopColor="#ff7ad8" stopOpacity="0.08" />
      <stop offset="1" stopColor="#ff7ad8" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="aurora-sky-g">
      <stop offset="0" stopColor="#3be6a6" stopOpacity="0.24" />
      <stop offset="0.5" stopColor="#25b8a0" stopOpacity="0.09" />
      <stop offset="1" stopColor="#25b8a0" stopOpacity="0" />
    </radialGradient>
  </defs>
)

const auroraLayer = (
  <Svg>
    {auroraDefs}
    <g className="aurora-breath">
      <ellipse cx="720" cy="400" rx="1000" ry="240" fill="url(#aurora-sky-g)" />
      <ellipse cx="140" cy="250" rx="520" ry="260" fill="url(#aurora-sky-g)" opacity=".8" />
      <ellipse cx="1340" cy="280" rx="420" ry="200" fill="url(#aurora-sky-g)" opacity=".6" />
    </g>
    <g className="aurora-surge">
      {sway({ origin: '150px 140px', drift: [17, -9], lean: [13, -7] }, curtainEls({ data: CB, seed: 303, dur: 11, wave: 1, dir: -1, grad: 'c' }))}
      {sway(
        { origin: '720px 350px', drift: [27, -14], lean: [19, -11], reverse: true },
        <>
          {crown(A2_BASE, A2_HEIGHT, [-120, 200, 520, 1100, 1420, 1640], 'aurora-crown-b', 0.9, 230)}
          {ribbonEls(CA2, 'b', '#e6fffb', '#5ff0d8', 0.8, false)}
          {curtainEls({ data: CA2, seed: 202, dur: 12.5, wave: 1.1, dir: -1, grad: 'b' })}
        </>,
      )}
      {mainCurtain()}
    </g>
  </Svg>
)

/* ---------- night sky ---------- */

function stars(seed, count, maxY) {
  const r = rng(seed)
  const list = Array.from({ length: count }, () => {
    const k = r()
    return [r() * W, 30 + r() * (maxY - 30), 0.4 + r() * r() * 1.3, k < 0.12 ? '#ffe9cf' : k < 0.32 ? '#cfe6ff' : '#f4fffc', 0.3 + r() * 0.6]
  })
  return dotPaths(list, 's')
}

function twinkles(seed, count, maxY) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const d = 2.6 + r() * 3.6
    return (
      <circle
        key={i}
        className="aurora-twinkle"
        cx={f(60 + r() * (W - 120))}
        cy={f(44 + r() * (maxY - 44))}
        r={(1 + r() * 0.8).toFixed(2)}
        fill={r() < 0.25 ? '#d6ebff' : '#fff'}
        style={{ animationDuration: sec(d), animationDelay: sec(-r() * d) }}
      />
    )
  })
}

// Milky Way: a faint dusty band of dense tiny stars, tilted across the sky.
function milkyWay(seed) {
  const r = rng(seed)
  const g = () => r() + r() + r() - 1.5
  const list = Array.from({ length: 300 }, () => {
    const u = (r() - 0.5) * 2000
    const v = g() * 46 * (1 - Math.abs(u) / 1400)
    return [725 + u, 150 + v, 0.35 + r() * 0.6, '#eaf6ff', 0.15 + r() * 0.45]
  })
  return dotPaths(list, 'm')
}

const SPARKLES = [
  [332, 96, 1, 5.2],
  [1096, 82, 0.85, 6.6],
  [470, 196, 0.7, 4.4],
  [1350, 236, 0.75, 7.3],
]

const sparkle = (x, y, s) =>
  `M ${x} ${f(y - 8 * s)} L ${f(x + 1.2 * s)} ${y} L ${x} ${f(y + 8 * s)} L ${f(x - 1.2 * s)} ${y} Z ` +
  `M ${f(x - 8 * s)} ${y} L ${x} ${f(y - 1.2 * s)} L ${f(x + 8 * s)} ${y} L ${x} ${f(y + 1.2 * s)} Z`

const crescent = (() => {
  const { x, y, r } = MOON
  return `M ${x} ${y - r} A ${r} ${r} 0 0 1 ${x} ${y + r} A ${f(r * 0.42)} ${r} 0 0 0 ${x} ${y - r} Z`
})()

function shootingStar(x, y, angle, dur, delay, len) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <g className="aurora-shoot" style={{ animationDuration: sec(dur), animationDelay: sec(delay) }}>
        <line x1={-len} y1="0" x2="0" y2="0" stroke="#e6fff6" strokeOpacity=".3" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={-len * 0.4} y1="0" x2="0" y2="0" stroke="#f4fffb" strokeOpacity=".85" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="0" cy="0" r="2.1" fill="#fff" />
      </g>
    </g>
  )
}

const skyPlate = (
  <Svg>
    <defs>
      <radialGradient id="aurora-mw-g">
        <stop offset="0" stopColor="#cfe6ff" stopOpacity="0.2" />
        <stop offset="0.45" stopColor="#9fc7e8" stopOpacity="0.075" />
        <stop offset="1" stopColor="#9fc7e8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="aurora-dust-g">
        <stop offset="0" stopColor="#01070c" stopOpacity="0.5" />
        <stop offset="1" stopColor="#01070c" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="aurora-halo-g">
        <stop offset="0" stopColor="#eaf7ff" stopOpacity="0.36" />
        <stop offset="0.16" stopColor="#c4e2f5" stopOpacity="0.16" />
        <stop offset="0.5" stopColor="#8fc4e0" stopOpacity="0.05" />
        <stop offset="1" stopColor="#8fc4e0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="aurora-horizon-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1f9a74" stopOpacity="0" />
        <stop offset="0.52" stopColor="#2fbf8a" stopOpacity="0.26" />
        <stop offset="1" stopColor="#2fbf8a" stopOpacity="0.26" />
      </linearGradient>
    </defs>
    <rect x={-PAD} y="320" width={W + 2 * PAD} height={H - 320} fill="url(#aurora-horizon-g)" />
    <g transform="rotate(-13.5 725 150)">
      <ellipse cx="725" cy="150" rx="1050" ry="110" fill="url(#aurora-mw-g)" />
      <ellipse cx="760" cy="148" rx="720" ry="58" fill="url(#aurora-mw-g)" opacity=".7" />
      <ellipse cx="700" cy="160" rx="620" ry="20" fill="url(#aurora-dust-g)" />
      {milkyWay(91)}
    </g>
    {stars(17, 190, 560)}
    {twinkles(29, 18, 520)}
    {SPARKLES.map(([x, y, s, d], i) => (
      <g key={i} className="aurora-sparkle" style={{ animationDuration: sec(d), animationDelay: sec(-i * 1.9) }}>
        <path d={sparkle(x, y, s)} fill="#eafffb" />
        <circle cx={x} cy={y} r={f(1.7 * s)} fill="#fff" />
      </g>
    ))}
    {shootingStar(470, 96, 150, 29, -11, 160)}
    {shootingStar(1180, 64, 162, 41, -33, 130)}
    <circle className="aurora-halo" cx={MOON.x} cy={MOON.y} r="170" fill="url(#aurora-halo-g)" />
    <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill="#a9c4cf" fillOpacity=".16" />
    <path d={crescent} fill="#f2fbf8" />
  </Svg>
)

/* ---------- mountains ---------- */

// Faceted range from hand-placed ridge points. Each summit gets a snow cap
// split into a moonlit face (right) and a shadow face (left) with rock ribs
// showing through, a dark rock facet on its shadow side, and a bright
// moonlit skyline edge.
function massif(seed, pts, base, snow) {
  const r = rng(seed)
  let d = `M ${-PAD} ${H} L ${pts[0][0]} ${pts[0][1]}`
  let sky = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0]} ${pts[i][1]}`
    sky += ` L ${pts[i][0]} ${pts[i][1]}`
  }
  d += ` L ${W + PAD} ${H} Z`
  let lit = ''
  let shade = ''
  let rock = ''
  let ribs = ''
  let edge = ''
  let spur = ''
  const at = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
  const jag = (a, b, n, amp) => {
    let out = ''
    for (let k = 1; k < n; k++) {
      const [x, y] = at(a, b, k / n)
      const dy = (k % 2 ? 1 : -0.35) * amp * (0.6 + r() * 0.8)
      out += ` L ${f(x)} ${f(y + dy)}`
    }
    return `${out} L ${f(b[0])} ${f(b[1])}`
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i]
    const [px, py] = P
    const [lx, ly] = pts[i - 1]
    const [rx, ry] = pts[i + 1]
    if (py > ly || py > ry) continue
    const t = snow[0] + r() * snow[1]
    const drop = Math.max(ly, ry) - py
    const SL = at(P, pts[i - 1], t)
    const SR = at(P, pts[i + 1], Math.min(0.92, t * 1.15))
    const S = [px + (rx - px) * (0.1 + r() * 0.08), py + drop * t * 1.3]
    lit += ` M ${px} ${py} L ${f(SR[0])} ${f(SR[1])}${jag(SR, S, 4, 11)} Z`
    shade += ` M ${px} ${py} L ${f(S[0])} ${f(S[1])}${jag(S, SL, 5, 11)} Z`
    rock += ` M ${px} ${py} L ${lx} ${ly} L ${f(lx + (px - lx) * 0.55)} ${base} L ${f(S[0])} ${f(S[1] + 20)} Z`
    // rock ribs: thin dark wedges breaking the snow below the summit
    for (const [u, v, side] of [[0.35, 0.55, 1], [0.6, 0.45, 1], [0.5, 0.5, -1]]) {
      const a0 = at(P, side > 0 ? at(S, SR, u) : at(S, SL, u), v)
      const len = drop * t * (0.45 + r() * 0.3)
      const dx = side * len * 0.35
      ribs += ` M ${f(a0[0])} ${f(a0[1])} L ${f(a0[0] + 2.6)} ${f(a0[1] + 3)} L ${f(a0[0] + dx + 1)} ${f(a0[1] + len)} Z`
    }
    const e = at(P, pts[i + 1], Math.min(0.95, t * 1.35))
    edge += ` M ${px} ${py} L ${f(e[0])} ${f(e[1])}`
    spur += ` M ${px} ${py} L ${f(S[0])} ${f(S[1])}`
  }
  return { d, sky, lit, shade, rock, ribs, edge, spur }
}

const BACK = massif(
  41,
  [[-220, 450], [-100, 372], [10, 420], [140, 322], [240, 392], [320, 360], [410, 425], [510, 405], [600, 452], [700, 440], [790, 462], [880, 444], [970, 418], [1070, 448], [1160, 360], [1235, 292], [1330, 380], [1420, 342], [1530, 410], [1660, 380]],
  580,
  [0.46, 0.18],
)
const FRONT = massif(
  58,
  [[-220, 500], [-60, 430], [60, 478], [170, 418], [300, 488], [400, 462], [500, 506], [640, 480], [760, 512], [860, 494], [960, 520], [1080, 470], [1180, 500], [1290, 405], [1400, 470], [1520, 440], [1660, 490]],
  580,
  [0.42, 0.16],
)

const farPeaks = (
  <Svg>
    <defs>
      <linearGradient id="aurora-haze-back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3aa88e" stopOpacity="0" />
        <stop offset="0.4" stopColor="#3aa88e" stopOpacity="0.45" />
        <stop offset="1" stopColor="#3aa88e" stopOpacity="0.45" />
      </linearGradient>
    </defs>
    <path d={BACK.sky} stroke="#6dffc4" strokeOpacity=".16" strokeWidth="5" fill="none" strokeLinejoin="round" />
    <path d={BACK.d} fill="#163f46" />
    <path d={BACK.rock} fill="#10333a" />
    <path d={BACK.shade} fill="#427b7f" />
    <path className="aurora-breath" d={BACK.shade} fill="#52f0b4" fillOpacity=".22" />
    <path d={BACK.lit} fill="#93cbc3" />
    <path d={BACK.ribs} fill="#1d4950" fillOpacity=".75" />
    <path d={BACK.spur} stroke="#c9f5ea" strokeOpacity=".3" strokeWidth="1" fill="none" />
    <path d={BACK.edge} stroke="#e2fff7" strokeOpacity=".6" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <rect x={-PAD} y="400" width={W + 2 * PAD} height={H - 400} fill="url(#aurora-haze-back)" />
    <ellipse className="aurora-mist" cx="420" cy="520" rx="520" ry="22" fill="#9fe8d2" fillOpacity=".1" style={{ animationDuration: '46s' }} />
  </Svg>
)

const snowRidges = (
  <Svg>
    <defs>
      <linearGradient id="aurora-haze-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2e8f7c" stopOpacity="0" />
        <stop offset="0.3" stopColor="#2e8f7c" stopOpacity="0.36" />
        <stop offset="1" stopColor="#2e8f7c" stopOpacity="0.36" />
      </linearGradient>
    </defs>
    <path d={FRONT.sky} stroke="#6dffc4" strokeOpacity=".12" strokeWidth="4" fill="none" strokeLinejoin="round" />
    <path d={FRONT.d} fill="#0b2930" />
    <path d={FRONT.rock} fill="#071f25" />
    <path d={FRONT.shade} fill="#4b8589" />
    <path className="aurora-breath" d={FRONT.shade} fill="#5cffbd" fillOpacity=".24" />
    <path d={FRONT.lit} fill="#bce8e0" />
    <path d={FRONT.ribs} fill="#0e2d34" fillOpacity=".8" />
    <path d={FRONT.spur} stroke="#e4fff7" strokeOpacity=".35" strokeWidth="1.1" fill="none" />
    <path d={FRONT.edge} stroke="#f2fffb" strokeOpacity=".8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <rect x={-PAD} y="470" width={W + 2 * PAD} height={H - 470} fill="url(#aurora-haze-front)" />
    <g fill="#bff5e3">
      <ellipse className="aurora-mist" cx="980" cy="556" rx="460" ry="14" fillOpacity=".12" style={{ animationDuration: '38s', animationDelay: '-17s' }} />
      <ellipse className="aurora-mist" cx="260" cy="566" rx="380" ry="10" fillOpacity=".1" style={{ animationDuration: '31s', animationDelay: '-6s' }} />
    </g>
  </Svg>
)

/* ---------- frozen lake ---------- */

// Far snowy shore with tiny pines, plus the pines' mirror image on the ice.
function farShore(seed) {
  const r = rng(seed)
  const m = (y) => f(SHORE + (SHORE - y) * 0.55)
  let strip = `M ${-PAD} ${SHORE + 2}`
  for (let x = -PAD; x <= W + PAD; x += 40) strip += ` L ${x} ${f(SHORE - 5 - r() * 5)}`
  strip += ` L ${W + PAD} ${SHORE + 2} Z`
  let up = ''
  let down = ''
  for (let i = 0; i < 120; i++) {
    const x = -PAD + r() * (W + 2 * PAD)
    const h = 7 + r() * r() * 26
    const y = SHORE - 3
    const w = h * 0.32
    for (let k = 0; k < 2; k++) {
      const apex = y - h + k * h * 0.3
      const foot = y - h * 0.38 + k * h * 0.38
      const hw = w * (0.6 + k * 0.4)
      up += ` M ${f(x)} ${f(apex)} L ${f(x + hw)} ${f(foot)} L ${f(x - hw)} ${f(foot)} Z`
      down += ` M ${f(x)} ${m(apex)} L ${f(x - hw)} ${m(foot)} L ${f(x + hw)} ${m(foot)} Z`
    }
  }
  return { strip, up, down }
}
const SHORE_TREES = farShore(73)

// Lake-coloured slivers that cut the reflection into ripples.
function ripples(seed) {
  const r = rng(seed)
  const out = ['', '']
  let y = SHORE + 3
  let i = 0
  while (y < H) {
    const depth = (y - SHORE) / (H - SHORE)
    const th = 0.8 + depth * 3.4
    let x = -PAD - r() * 220
    while (x < W + PAD) {
      const len = 70 + r() * 420
      if (r() < 0.8) out[i % 2] += ` M ${f(x)} ${f(y)} h ${f(len)} v ${f(th)} h ${f(-len)} Z`
      x += len + 12 + r() * 70
    }
    y += th + 2.4 + depth * 9 * (0.6 + r() * 0.8)
    i++
  }
  return out
}
const RIPPLES = ripples(19)

const ICE_GLINTS = [
  [640, 668, 34, 3.4],
  [802, 690, 22, 4.6],
  [512, 706, 40, 5.1],
  [930, 664, 18, 3.9],
  [710, 736, 46, 6.2],
]

// Snow sheet: flakes laid out over one screen height plus a copy above it,
// so a single translate loops forever without a seam.
function snowSheet(seed, count, rMin, rMax, op) {
  const r = rng(seed)
  const flakes = Array.from({ length: count }, () => [
    -PAD + r() * (W + 2 * PAD),
    r() * H,
    rMin + r() * (rMax - rMin),
    op * (0.55 + r() * 0.45),
  ])
  // the copy sits one loop-length up and to the right of each flake
  return dotPaths(
    flakes.flatMap(([x, y, rr, o]) => [
      [x, y, rr, 'currentColor', o],
      [x + 60, y - H, rr, 'currentColor', o],
    ]),
    'f',
  )
}

function snowSheets({ seed, specs, count, size, op, fill }) {
  return specs.map(([dur, swayDur, delay], i) => (
    <g key={i} className="aurora-sway" style={{ animationDuration: sec(swayDur), animationDelay: sec(delay) }}>
      <g className="aurora-sheet" color={fill} style={{ animationDuration: sec(dur), animationDelay: sec(delay * 3) }}>
        {snowSheet(seed + i * 7, count, size[0], size[1], op)}
      </g>
    </g>
  ))
}

/* reindeer, facing left (walking right to left); origin at the hooves */
const DEER_BODY =
  'M -12 -15 C -12 -21, 9 -23, 13 -17 C 15 -12, 10 -9, 1 -9.5 C -8 -9.5, -12 -11, -12 -15 Z ' +
  'M -11 -18 L -16.5 -26.5 C -17.5 -28.6, -20.5 -29.4, -22.5 -28 L -26 -25.6 C -27 -24.6, -26 -23.4, -24.6 -23.8 L -19.5 -24.2 L -13.5 -15 Z ' +
  'M 12.5 -17.5 L 16 -19.5 L 15 -15.8 Z'
const DEER_ANTLER =
  'M -17.5 -28.5 C -16.5 -34, -13 -38, -8.5 -40.5 M -15 -34.5 L -19.5 -38.5 M -11.5 -38.3 L -10.5 -43.5 ' +
  'M -19 -28.5 C -20.5 -34, -18.5 -38.5, -15 -42 M -19.6 -33.8 L -23.5 -36'
const DEER_LEGS = 'M 0 0 L -2.8 11 M 0 0 L 2.8 11'

const HERD = [
  { x: 0, y: 0, s: 1.05, ph: 0 },
  { x: 44, y: 5, s: 0.92, ph: 0.31 },
  { x: 92, y: -4, s: 1, ph: 0.66 },
  { x: 128, y: 3, s: 0.7, ph: 0.15 },
  { x: 176, y: -1, s: 0.96, ph: 0.47 },
]
const HERD_Y = 668

function deer({ s, ph }, still = false) {
  const legs = (hx, off) => (
    <g transform={`translate(${hx} -11)`}>
      {still ? (
        <path d={DEER_LEGS} />
      ) : (
        <g className="aurora-step" style={{ animationDelay: sec(-(ph + off) * 1.04) }}>
          <path d={DEER_LEGS} />
        </g>
      )}
    </g>
  )
  return (
    <g>
      <g stroke="#04121a" strokeWidth={f(2 / Math.max(s, 0.8))} strokeLinecap="round" fill="none">
        {legs(-7, 0)}
        {legs(8, 0.5)}
        <path d={DEER_ANTLER} strokeWidth="1.3" />
      </g>
      <path d={DEER_BODY} fill="#04121a" />
      {!still && <path d="M -10.5 -18.6 C -4 -22, 6 -22.4, 12 -18" stroke="#8ff5cf" strokeOpacity=".55" strokeWidth="1" fill="none" />}
    </g>
  )
}

const lakeLayer = (
  <Svg>
    {auroraDefs}
    <defs>
      <linearGradient id="aurora-lake-g" gradientUnits="userSpaceOnUse" x1="0" y1={SHORE} x2="0" y2={H}>
        <stop offset="0" stopColor="#1b5652" />
        <stop offset="0.18" stopColor="#0f3d41" />
        <stop offset="0.5" stopColor="#082a33" />
        <stop offset="1" stopColor="#041820" />
      </linearGradient>
      <radialGradient id="aurora-ice-glow">
        <stop offset="0" stopColor="#46ffb4" stopOpacity="0.3" />
        <stop offset="1" stopColor="#46ffb4" stopOpacity="0" />
      </radialGradient>
      <clipPath id="aurora-lake-clip">
        <rect x={-PAD} y={SHORE} width={W + 2 * PAD} height={H - SHORE} />
      </clipPath>
    </defs>
    <rect x={-PAD} y={SHORE} width={W + 2 * PAD} height={H - SHORE} fill="url(#aurora-lake-g)" />
    <g clipPath="url(#aurora-lake-clip)">
      <ellipse className="aurora-breath" cx="720" cy="690" rx="700" ry="90" fill="url(#aurora-ice-glow)" />
      <g transform={FLIP} opacity=".9">
        {mainCurtain(true)}
      </g>
      <g transform={FLIP}>
        <path d={BACK.d} fill="#0d3036" />
        <path d={BACK.lit} fill="#5f948f" fillOpacity=".22" />
        <path d={FRONT.d} fill="#082329" />
        <path d={FRONT.lit} fill="#80b3ab" fillOpacity=".24" />
      </g>
      <path d={SHORE_TREES.down} fill="#061a20" fillOpacity=".85" />
      <path className="aurora-ripple" d={RIPPLES[0]} fill="url(#aurora-lake-g)" fillOpacity=".8" />
      <path className="aurora-ripple aurora-ripple-b" d={RIPPLES[1]} fill="url(#aurora-lake-g)" fillOpacity=".7" />
    </g>
    {/* glossy ice: faint sheen, snow drifts and hairline cracks */}
    <g fill="#c6fff0" fillOpacity=".1">
      <rect x="180" y="640" width="420" height="1.4" rx="0.7" />
      <rect x="760" y="712" width="520" height="1.8" rx="0.9" />
      <rect x="90" y="752" width="380" height="2" rx="1" />
    </g>
    <g fill="#a9d6d0" fillOpacity=".26">
      <ellipse cx="190" cy="598" rx="150" ry="5" />
      <ellipse cx="330" cy="612" rx="90" ry="3.5" />
      <ellipse cx="1180" cy="604" rx="170" ry="5.5" />
      <ellipse cx="1300" cy="622" rx="80" ry="3" />
      <ellipse cx="120" cy="690" rx="120" ry="7" />
      <ellipse cx="1310" cy="700" rx="140" ry="8" />
    </g>
    <path
      d="M 300 650 L 380 662 L 440 658 L 520 674 M 380 662 L 400 682 M 980 640 L 1050 652 L 1130 648 M 1050 652 L 1062 670"
      stroke="#a8f0dc"
      strokeOpacity=".16"
      strokeWidth="1"
      fill="none"
    />
    {ICE_GLINTS.map(([x, y, w, d], i) => (
      <rect
        key={i}
        className="aurora-glint"
        x={x}
        y={y}
        width={w}
        height="1.6"
        rx="0.8"
        fill="#eafff6"
        style={{ animationDuration: sec(d), animationDelay: sec(-i * 1.7) }}
      />
    ))}
    <rect x={-PAD} y={SHORE - 0.8} width={W + 2 * PAD} height="1.6" fill="#b8f5e2" fillOpacity=".35" />
    <path d={SHORE_TREES.strip} fill="#5f9a98" />
    <path d={SHORE_TREES.up} fill="#06191f" />
    {/* reindeer herd crossing the ice, each with a faint reflection */}
    <g className="aurora-herd">
      <g transform={`translate(1560 ${HERD_Y})`}>
        {HERD.map((d, i) => (
          <g key={i} transform={`translate(${d.x} ${d.y})`}>
            <g transform={`scale(${d.s} ${f(-d.s * 0.75)})`} opacity=".22">
              {deer(d, true)}
            </g>
            <g transform={`scale(${d.s})`}>{deer(d)}</g>
          </g>
        ))}
      </g>
    </g>
    {snowSheets({ seed: 501, specs: [[30, 11, -4], [36, 13, -9], [42, 9.5, -2]], count: 44, size: [0.6, 1.25], op: 0.6, fill: '#e6fffa' })}
  </Svg>
)

/* ---------- pines ---------- */

// Snow-laden spruce, slim like boreal trees. Each tier is an arched branch
// skirt with a ragged needle fringe, carrying bumpy cushions of snow with
// drips along their underside (moonlit on the right). Tiers are drawn bottom
// to top so each skirt overhangs the one below.
function pine(seed, x, base, h) {
  const r = rng(seed)
  const n = 6 + Math.floor(h / 70)
  const top = base - h
  const tw = Math.max(2.5, h * 0.014)
  const trunk = `M ${f(x + tw)} ${base} L ${f(x + tw * 0.6)} ${f(top + h * 0.3)} L ${f(x - tw * 0.6)} ${f(top + h * 0.3)} L ${f(x - tw)} ${base} Z`
  const tiers = []
  for (let k = 0; k < n; k++) {
    const u = (k + 1) / n
    const yt = top + h * 0.82 * Math.pow(k / n, 1.05) + (k ? (r() - 0.5) * h * 0.012 : 0)
    const th = h * (0.085 + 0.06 * u)
    const w = h * (0.045 + 0.23 * Math.pow(u, 0.9)) * (0.86 + r() * 0.28)
    const lump = 2 + h * 0.008
    const P = (sx, sy) => `${f(x + sx)} ${f(yt + sy)}`
    const side = (sgn) => {
      const wv = w * (0.82 + r() * 0.36)
      const dv = th * (0.85 + r() * 0.4)
      const C = [0.5 * wv * sgn, 0.12 * th]
      const T = [wv * sgn, dv]
      const U = (t) => [qb(t, 0, C[0], T[0]), qb(t, 0, C[1], T[1])]
      const fringe = []
      for (let j = 1; j <= 9; j++) {
        const v = j / 9
        const dip = (j % 2 ? th * 0.16 : -th * 0.02) * (0.5 + r() * 0.9)
        fringe.push([T[0] * (1 - v), T[1] * (1 - v) + th * 0.78 * v + dip])
      }
      // bumpy top: points on the branch, curves bulging upward between them
      const crest = [0, 0.3, 0.6, 0.88, 0.97].map(U)
      // underside with drips; one longer drip per side
      const drip = 1 + Math.floor(r() * 3)
      const under = [0.97, 0.78, 0.58, 0.38, 0.18, 0].map((t, j) => {
        const [ux, uy] = U(t)
        const thick = th * (0.07 + 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.2))) + lump * 0.55
        return [ux, uy + thick + (j === drip ? lump * 1.4 : 0)]
      })
      return { C, T, fringe, crest, under }
    }
    const L = side(-1)
    const R = side(1)
    const lines = (arr) => arr.map(([a, c]) => ` L ${P(a, c)}`).join('')
    const curve = (arr, lift) => {
      let out = ''
      for (let j = 1; j < arr.length; j++) {
        const [ax, ay] = arr[j - 1]
        const [bx, by] = arr[j]
        out += ` Q ${P((ax + bx) / 2, (ay + by) / 2 + lift)} ${P(bx, by)}`
      }
      return out
    }
    const raise = (arr) => arr.map(([a, c]) => [a, c - lump * 0.5])
    const body =
      `M ${P(0, 0)} Q ${P(...L.C)} ${P(...L.T)}${lines(L.fringe)}` +
      `${lines(R.fringe.slice(0, -1).reverse())} L ${P(...R.T)} Q ${P(...R.C)} ${P(0, 0)} Z`
    // snow: left crest out to the tip, underside back, then the right side
    const lc = raise(L.crest)
    const rc = raise(R.crest)
    const snow =
      `M ${P(...lc[0])}${curve(lc, -lump * 1.5)}${curve([lc[4], ...L.under], lump * 0.7)}` +
      `${curve([L.under[5], ...R.under.slice().reverse()], lump * 0.7)}${curve([R.under[0], ...rc.slice().reverse()], -lump * 1.5)} Z`
    const rBand = R.crest.map(([a, c]) => [a, c + lump * 0.9]).reverse()
    const lit = `M ${P(...rc[0])}${curve(rc, -lump * 1.5)}${curve([rc[4], ...rBand], lump * 0.3)} Z`
    tiers.push({ body, snow, lit, tipL: [x + L.T[0], yt + L.T[1]], tipR: [x + R.T[0], yt + R.T[1]] })
  }
  return { trunk, tiers }
}

function pineEl({ p, colors, className = 'aurora-pine', x, base, dur, delay }, extra = null) {
  return (
    <g
      key={x}
      className={className}
      style={{ transformOrigin: `${x}px ${base}px`, animationDuration: sec(dur), animationDelay: sec(delay) }}
    >
      <path d={p.trunk} fill={colors[0]} />
      {p.tiers
        .slice()
        .reverse()
        .map((t, i) => (
          <g key={i}>
            <path d={t.body} fill={colors[1]} />
            <path d={t.snow} fill={colors[2]} />
            <path d={t.lit} fill={colors[3]} />
          </g>
        ))}
      {extra}
    </g>
  )
}

/* ---------- cabin shore ---------- */

const BANK = [[-220, 742], [120, 734], [420, 752], [680, 760], [830, 738], [930, 708], [1030, 700], [1140, 710], [1320, 730], [1660, 740]]
const MID_PINE = ['#0d1416', '#0a242a', '#7fb2b0', '#cdeee8']
const SPRUCES = [
  { x: 900, h: 74, dur: 6.2, delay: -2 },
  { x: 1112, h: 96, dur: 7.4, delay: -4.6 },
  { x: 1146, h: 62, dur: 5.6, delay: -1.2 },
  { x: 404, h: 70, dur: 6.8, delay: -3.1 },
  { x: 436, h: 48, dur: 5.2, delay: -0.4 },
].map((s, i) => {
  const base = ridgeY(BANK, s.x) + 5
  return { ...s, base, p: pine(300 + i, s.x, base, s.h), colors: MID_PINE, className: 'aurora-pine aurora-pine-mid' }
})

const FENCE = [870, 836, 802, 768, 734].map((x) => [x, ridgeY(BANK, x) + 4])

const ICICLES = (() => {
  const r = rng(808)
  let d = ''
  for (let x = 962; x < 1074; x += 5 + r() * 4) {
    const y = 690.5 - (x - 962) * 0.017
    const len = 3 + r() * 7
    d += ` M ${f(x - 1.2)} ${f(y)} L ${f(x + 1.2)} ${f(y)} L ${f(x)} ${f(y + len)} Z`
  }
  return d
})()

const EAVE_SNOW = (() => {
  let d = 'M 956 684 L 1078 682'
  for (let x = 1078; x > 956; x -= 12) {
    const y = 686 - (x - 956) * 0.017
    d += ` Q ${f(x - 6)} ${f(y + 5)} ${f(x - 12)} ${f(y)}`
  }
  return `${d} Z`
})()

const LOGS = (() => {
  let d = ''
  for (let y = 688; y < 714; y += 5) d += ` M 964 ${y} H 1068`
  for (let y = 684; y < 714; y += 5) d += ` M ${f(928 + Math.max(0, (684 - y) * 0.6))} ${y} H 964`
  return d
})()

// Trodden path from the cabin door down the bank, with boot prints.
const PATH_PTS = [[1043, 716], [990, 734], [900, 750], [800, 770], [700, 800], [620, 840], [580, 880]]
const PATH_D = PATH_PTS.reduce((d, [x, y], i) => (i ? `${d} L ${x} ${y}` : `M ${x} ${y}`), '')
const PRINTS = (() => {
  const r = rng(915)
  let d = ''
  for (let i = 0; i < PATH_PTS.length - 1; i++) {
    const [ax, ay] = PATH_PTS[i]
    const [bx, by] = PATH_PTS[i + 1]
    const steps = Math.floor(Math.hypot(bx - ax, by - ay) / 14)
    for (let k = 0; k < steps; k++) {
      const u = k / steps
      const x = ax + (bx - ax) * u
      const y = ay + (by - ay) * u
      const s = 0.8 + ((y - 716) / 160) * 0.9
      const side = k % 2 ? 1 : -1
      const px = x + side * 3.4 * s + (r() - 0.5)
      const py = y + side * 1.2 * s
      d += ` M ${f(px - 2.6 * s)} ${f(py)} a ${f(2.6 * s)} ${f(1.1 * s)} 0 1 0 ${f(5.2 * s)} 0 a ${f(2.6 * s)} ${f(1.1 * s)} 0 1 0 ${f(-5.2 * s)} 0 Z`
    }
  }
  return d
})()

const ROCKS = [
  [300, 758, 22, 10],
  [330, 764, 12, 6],
  [560, 776, 18, 8],
  [1220, 742, 20, 9],
]

const PUFFS = Array.from({ length: 7 }, (_, i) => i)

const cabinShore = (
  <Svg>
    <defs>
      <linearGradient id="aurora-bank-g" gradientUnits="userSpaceOnUse" x1="0" y1="690" x2="0" y2="860">
        <stop offset="0" stopColor="#8cc4bb" />
        <stop offset="0.3" stopColor="#5f969c" />
        <stop offset="1" stopColor="#2b5764" />
      </linearGradient>
      <linearGradient id="aurora-tint-g" gradientUnits="userSpaceOnUse" x1="0" y1="696" x2="0" y2="790">
        <stop offset="0" stopColor="#6dffc4" stopOpacity="0.4" />
        <stop offset="1" stopColor="#6dffc4" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="aurora-warm-g">
        <stop offset="0" stopColor="#ffb75e" stopOpacity="0.6" />
        <stop offset="0.45" stopColor="#ff9f45" stopOpacity="0.22" />
        <stop offset="1" stopColor="#ff9f45" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="aurora-hollow-g">
        <stop offset="0" stopColor="#173d48" stopOpacity="0.5" />
        <stop offset="1" stopColor="#173d48" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="aurora-smoke-g">
        <stop offset="0" stopColor="#c4ddda" stopOpacity="0.7" />
        <stop offset="0.55" stopColor="#a6c9c6" stopOpacity="0.3" />
        <stop offset="1" stopColor="#a6c9c6" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* bank, aurora-lit along its crest */}
    <path d={hills(BANK)} fill="url(#aurora-bank-g)" />
    <path className="aurora-breath" d={hills(BANK)} fill="url(#aurora-tint-g)" />
    <path d={hills(BANK, true)} stroke="#d8fff2" strokeOpacity=".55" strokeWidth="2" fill="none" />
    {/* broad hollows and crests in the snow */}
    <ellipse cx="560" cy="808" rx="460" ry="44" fill="url(#aurora-hollow-g)" />
    <ellipse cx="1240" cy="790" rx="260" ry="30" fill="url(#aurora-hollow-g)" />
    <ellipse cx="160" cy="770" rx="240" ry="26" fill="url(#aurora-hollow-g)" />
    {/* wind-carved drifts */}
    <g fill="none" strokeLinecap="round">
      <path d="M 40 770 C 160 758, 300 768, 420 790 M 470 800 C 560 790, 660 800, 740 820 M 1180 750 C 1260 744, 1340 752, 1420 770" stroke="#c9f7ec" strokeOpacity=".22" strokeWidth="1.6" />
      <path d="M 60 778 C 180 768, 300 778, 410 798 M 1190 758 C 1270 752, 1340 760, 1410 778" stroke="#204a55" strokeOpacity=".3" strokeWidth="5" />
    </g>
    {/* moon shadow of the cabin, trodden path and boot prints */}
    <path d="M 928 713 L 862 728 L 930 730 L 1000 718 Z" fill="#2b5662" fillOpacity=".45" />
    <path d={PATH_D} stroke="#4c7f87" strokeOpacity=".45" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d={PRINTS} fill="#2d5a64" fillOpacity=".75" />
    {/* rocks poking through the snow */}
    {ROCKS.map(([x, y, w, h]) => (
      <g key={x}>
        <path d={`M ${x - w} ${y + 2} L ${x - w * 0.6} ${y - h} L ${x + w * 0.2} ${y - h * 1.1} L ${x + w} ${y + 2} Z`} fill="#13262b" />
        <path d={`M ${x - w * 0.7} ${y - h * 0.8} L ${x - w * 0.6} ${y - h} L ${x + w * 0.2} ${y - h * 1.1} L ${x + w * 0.75} ${y - h * 0.4} Q ${x} ${y - h * 0.5} ${x - w * 0.7} ${y - h * 0.8} Z`} fill="#c9ece6" />
      </g>
    ))}
    {/* fence posts sinking into the drift */}
    <g stroke="#1b1511" strokeLinecap="round" fill="none">
      <path
        d={FENCE.slice(1)
          .map(([x, y], i) => `M ${FENCE[i][0]} ${f(FENCE[i][1] - 15)} L ${x} ${f(y - 15)} M ${FENCE[i][0]} ${f(FENCE[i][1] - 8)} L ${x} ${f(y - 8)}`)
          .join(' ')}
        strokeWidth="1.6"
      />
      <path d={FENCE.map(([x, y]) => `M ${x} ${f(y)} L ${x} ${f(y - 22)}`).join(' ')} strokeWidth="3.2" />
    </g>
    {FENCE.map(([x, y]) => (
      <ellipse key={x} cx={x} cy={f(y - 23)} rx="3.6" ry="2.2" fill="#d6f5ef" />
    ))}
    {/* spruces beside the cabin */}
    {SPRUCES.map((s) => pineEl(s))}
    {/* warm light spilling onto the snow */}
    <ellipse className="aurora-flicker aurora-flicker-b" cx="996" cy="724" rx="104" ry="18" fill="url(#aurora-warm-g)" />
    {/* chimney */}
    <rect x="1028" y="630" width="13" height="32" fill="#353b3f" />
    <rect x="1037" y="630" width="4" height="32" fill="#4f585c" />
    <rect x="1025.5" y="625" width="18" height="7" rx="3.5" fill="#dff7f2" />
    {/* gable end (shadow side) and front wall */}
    <path d="M 928 712 L 928 682 L 946 655 L 964 684 L 964 714 Z" fill="#24160f" />
    <rect x="964" y="684" width="104" height="30" fill="#3a251b" />
    <path d={LOGS} stroke="#1d110b" strokeOpacity=".8" strokeWidth="1" fill="none" />
    <path d="M 964 684 V 714" stroke="#5b3b29" strokeWidth="2.4" strokeDasharray="2.4 2.6" />
    {/* roof: snow-buried near plane, dark eave, overhang lumps and icicles */}
    <path d="M 946 655 L 1052 652 L 1080 683 L 958 686 Z" fill="#c9ebe4" />
    <path d="M 946 655 L 1052 652 L 1060 661 L 954 664 Z" fill="#e6fff9" fillOpacity=".7" />
    <path d="M 958 686 L 1080 683 L 1080 687 L 958 690 Z" fill="#20130d" />
    <path d={EAVE_SNOW} fill="#d4f3ed" />
    <path d={ICICLES} fill="#dafff6" fillOpacity=".85" />
    <path d="M 925 683 L 945.5 652 L 949.5 655.5 L 929.5 686 Z" fill="#bfe4de" />
    {/* windows and door */}
    <g className="aurora-flicker">
      <circle cx="996" cy="698" r="48" fill="url(#aurora-warm-g)" />
    </g>
    <rect x="987" y="691" width="19" height="14" fill="#ffc46e" />
    <rect x="990" y="693" width="7" height="5" fill="#fff0c4" />
    <path d="M 996.5 691 V 705 M 987 698 H 1006" stroke="#3a2213" strokeWidth="1.5" />
    <rect x="986" y="690" width="21" height="16" fill="none" stroke="#1a0f09" strokeWidth="1.4" />
    <rect x="938" y="690" width="9" height="10" fill="#ffad55" fillOpacity=".85" />
    <rect x="1036" y="691" width="15" height="23" fill="#1a0f0a" />
    <circle cx="1047.5" cy="703" r="1" fill="#ffc46e" />
    {/* woodpile under a snow cap */}
    <g fill="#5e3f2c" stroke="#2c1a10" strokeWidth=".8">
      {[[1076, 708], [1082, 708], [1088, 708], [1094, 708], [1079, 702.5], [1085, 702.5], [1091, 702.5], [1082, 697], [1088, 697]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.9" />
      ))}
    </g>
    <path d="M 1076 696 Q 1085 689 1096 696 Q 1088 699 1076 697 Z" fill="#d6f5ef" />
    {/* drift burying the cabin's foot */}
    <path d="M 914 718 Q 940 707 972 712 Q 1010 705 1050 711 Q 1080 706 1108 716 L 1108 724 L 914 724 Z" fill="#8cc4bb" />
    {/* chimney smoke curling up and drifting left */}
    {PUFFS.map((i) => (
      <circle
        key={i}
        className="aurora-smoke"
        cx="1034"
        cy="620"
        r="10"
        fill="url(#aurora-smoke-g)"
        style={{ animationDelay: sec((-i * 10) / PUFFS.length) }}
      />
    ))}
  </Svg>
)

/* ---------- foreground pines & snow ---------- */

const NEAR_PINE = ['#060b0c', '#04161b', '#527f84', '#9ccbc5']
const FG = [[-220, 798], [90, 792], [300, 822], [560, 842], [800, 846], [1060, 836], [1260, 812], [1450, 792], [1660, 800]]
const PINES = [
  { x: 214, h: 330, dur: 7.1, delay: -1 },
  { x: 1236, h: 340, dur: 7.6, delay: -3.5 },
  { x: 92, h: 470, dur: 8.2, delay: -5 },
  { x: 1352, h: 500, dur: 8.8, delay: -6 },
  { x: -40, h: 600, dur: 9.5, delay: -2 },
  { x: 1480, h: 610, dur: 10.2, delay: -0.5 },
].map((p, i) => ({ ...p, base: 900, p: pine(400 + i, p.x, 900, p.h), colors: NEAR_PINE }))

// Snow sliding off a branch tip now and then.
function slide(tip, dur, delay, seed) {
  const r = rng(seed)
  return (
    <g className="aurora-slide" style={{ animationDuration: sec(dur), animationDelay: sec(delay) }} fill="#dff7f2">
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={f(tip[0] + (r() - 0.5) * 16)} cy={f(tip[1] - 2 + r() * 8)} r={f(1.4 + r() * 2.2)} />
      ))}
    </g>
  )
}

const GLITTER = [
  [520, 846, 3.1],
  [790, 852, 4.3],
  [1010, 844, 3.7],
  [640, 858, 5.2],
]

const pineLayer = (
  <Svg>
    <defs>
      <linearGradient id="aurora-fg-g" gradientUnits="userSpaceOnUse" x1="0" y1="800" x2="0" y2="880">
        <stop offset="0" stopColor="#5a9293" />
        <stop offset="0.35" stopColor="#335f69" />
        <stop offset="1" stopColor="#18303a" />
      </linearGradient>
      <linearGradient id="aurora-fgtint-g" gradientUnits="userSpaceOnUse" x1="0" y1="800" x2="0" y2="850">
        <stop offset="0" stopColor="#6dffc4" stopOpacity="0.3" />
        <stop offset="1" stopColor="#6dffc4" stopOpacity="0" />
      </linearGradient>
    </defs>
    {PINES.map((t, i) =>
      pineEl(t, i === 2 ? slide(t.p.tiers[6].tipR, 19, -7, 61) : i === 3 ? slide(t.p.tiers[7].tipL, 27, -21, 67) : null),
    )}
    <path d={hills(FG)} fill="url(#aurora-fg-g)" />
    <path className="aurora-breath" d={hills(FG)} fill="url(#aurora-fgtint-g)" />
    <path d={hills(FG, true)} stroke="#c8f7ec" strokeOpacity=".4" strokeWidth="2" fill="none" />
    <path d="M 300 846 C 420 838, 560 846, 680 862 M 900 852 C 1000 842, 1120 840, 1220 846" stroke="#9fd8cf" strokeOpacity=".2" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {GLITTER.map(([x, y, d], i) => (
      <path
        key={i}
        className="aurora-sparkle"
        d={sparkle(x, y, 0.45)}
        fill="#f2fffb"
        style={{ animationDuration: sec(d), animationDelay: sec(-i * 1.3) }}
      />
    ))}
  </Svg>
)

/* ---------- snowfall ---------- */

function bigFlakes(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = -40 + r() * (W + 120)
    const s = 3.2 + r() * 3.6
    const dur = 7 + r() * 5
    const fl = 1.8 + r() * 1.8
    return (
      <g key={i} className="aurora-fall" style={{ animationDuration: sec(dur), animationDelay: sec(-r() * dur) }}>
        <circle
          className="aurora-flutter"
          cx={f(x)}
          cy="-20"
          r={f(s)}
          fill="url(#aurora-flake-g)"
          style={{ animationDuration: sec(fl), animationDelay: sec(-r() * fl) }}
        />
      </g>
    )
  })
}

function gust(seed, y, dur, delay) {
  const r = rng(seed)
  return (
    <g className="aurora-gust" style={{ animationDuration: sec(dur), animationDelay: sec(delay) }}>
      <ellipse cx="0" cy={y} rx="280" ry="11" fill="url(#aurora-gust-g)" />
      <ellipse cx="-70" cy={y + 10} rx="180" ry="6" fill="url(#aurora-gust-g)" />
      {dotPaths(
        Array.from({ length: 16 }, () => [(r() - 0.5) * 520, y - 14 + r() * 26, 0.8 + r() * 1.4, '#effffb', 0.4 + r() * 0.5]),
        'g',
      )}
    </g>
  )
}

const snowfall = (
  <Svg>
    <defs>
      <radialGradient id="aurora-flake-g">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="0.5" stopColor="#ecfffa" stopOpacity="0.7" />
        <stop offset="1" stopColor="#ecfffa" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="aurora-gust-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#e6fff8" stopOpacity="0" />
        <stop offset="0.6" stopColor="#e6fff8" stopOpacity="0.42" />
        <stop offset="1" stopColor="#e6fff8" stopOpacity="0" />
      </linearGradient>
    </defs>
    {snowSheets({ seed: 601, specs: [[12, 5.5, -2], [15, 6.8, -5], [18, 4.9, -1]], count: 26, size: [1.4, 2.5], op: 0.85, fill: '#f2fffc' })}
    {gust(71, 822, 19, -4)}
    {gust(83, 840, 27, -17)}
    {bigFlakes(97, 12)}
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'aurora',
  name: 'Aurora Pines',
  tag: 'Arctic night',
  accent: '#3ee6b0',
  accent2: '#b98cff',
  ink: '#0b8f6c',
  glow: '#6ee7c8',
  clockColor: '#eafff8',
  sky: 'linear-gradient(180deg,#010409 0%,#020c14 22%,#031820 42%,#06282d 58%,#0b3c3b 72%,#145247 86%,#1b5f4f 100%)',
  layers: [
    { name: 'Night sky', depth: 0, sky: true, el: skyPlate },
    { name: 'Aurora', depth: 0.08, el: auroraLayer },
    { name: 'Far peaks', depth: 0.16, el: farPeaks },
    { name: 'Snowy ridges', depth: 0.28, el: snowRidges },
    { name: 'Depth clock', depth: 0.38, clock: true },
    { name: 'Frozen lake', depth: 0.52, el: lakeLayer },
    { name: 'Cabin shore', depth: 0.74, el: cabinShore },
    { name: 'Snowy pines', depth: 1, el: pineLayer },
    { name: 'Snowfall', depth: 1.3, el: snowfall },
  ],
}
