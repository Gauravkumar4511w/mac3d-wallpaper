// Nebula Drift: standing on a quiet moon, looking out into a vast nebula.
// Deep violet space with three depths of stars and a slowly turning spiral
// galaxy; layered pink, violet and blue gas with dark dust lanes and hot
// cores; a banded ringed planet with two small moons slipping behind and in
// front of it; a comet, shooting stars and a drifting station; a cratered
// moon horizon rim-lit by the nebula, tumbling rocks and glowing dust.

import './nebula.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

const TAU = Math.PI * 2
const g2 = (n) => n.toFixed(2)
const rad = (deg) => (deg * Math.PI) / 180

/* ---------- shared helpers ---------- */

// Gradient stops are [offset, color, opacity].
function radial({ id, stops, key, ...rest }) {
  return (
    <radialGradient key={key ?? id} id={id} {...rest}>
      {stops.map(([o, c, a = 1]) => (
        <stop key={o} offset={o} stopColor={c} stopOpacity={a} />
      ))}
    </radialGradient>
  )
}
function linear({ id, stops, key, ...rest }) {
  return (
    <linearGradient key={key ?? id} id={id} {...rest}>
      {stops.map(([o, c, a = 1]) => (
        <stop key={o} offset={o} stopColor={c} stopOpacity={a} />
      ))}
    </linearGradient>
  )
}

// A soft, roughly Gaussian falloff so gas blobs never show an edge.
const soft = (c, k = 1) => [
  [0, c, k],
  [0.2, c, 0.8 * k],
  [0.42, c, 0.42 * k],
  [0.64, c, 0.16 * k],
  [0.84, c, 0.04 * k],
  [1, c, 0],
]

// Many tiny dots as one path (static stars stay cheap this way).
function dotPath(list) {
  return list.map(([x, y, r]) => `M${g2(x - r)} ${g2(y)}a${g2(r)} ${g2(r)} 0 1 0 ${g2(2 * r)} 0a${g2(r)} ${g2(r)} 0 1 0 ${g2(-2 * r)} 0Z`).join('')
}

// A four-pointed sparkle with tapered arms, optionally rotated.
function star4(x, y, len, w, rot = 0) {
  const c = Math.cos(rad(rot))
  const s = Math.sin(rad(rot))
  const pts = [
    [0, -len],
    [w, -w],
    [len, 0],
    [w, w],
    [0, len],
    [-w, w],
    [-len, 0],
    [-w, -w],
  ]
  return `M ${pts.map(([px, py]) => `${f(x + px * c - py * s)} ${f(y + px * s + py * c)}`).join(' L ')} Z`
}

// Catmull-Rom through hand-placed [x, y] points, sampled at x.
function spline(pts, x) {
  let i = 0
  while (i < pts.length - 2 && x > pts[i + 1][0]) i++
  const p0 = pts[Math.max(i - 1, 0)]
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = pts[Math.min(i + 2, pts.length - 1)]
  const t = Math.min(Math.max((x - p1[0]) / (p2[0] - p1[0]), 0), 1)
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
}

// Rugged edge: a smooth curve through control points, then midpoint
// displacement for rocky detail. Returns [x, y] points a few px apart.
function rugged(seed, top, rough, step = 48) {
  const r = rng(seed)
  const base = []
  for (let x = -PAD; x < W + PAD; x += step) base.push([x, top(x)])
  base.push([W + PAD, top(W + PAD)])
  const out = [base[0]]
  const sub = (a, b) => {
    if (b[0] - a[0] <= 6.5) {
      out.push(b)
      return
    }
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (r() - 0.5) * (b[0] - a[0]) * rough]
    sub(a, m)
    sub(m, b)
  }
  for (let i = 0; i < base.length - 1; i++) sub(base[i], base[i + 1])
  return out
}
// Height of a rugged edge at x.
function yAt(pts, x) {
  let i = 1
  while (i < pts.length - 1 && pts[i][0] < x) i++
  const [x0, y0] = pts[i - 1]
  const [x1, y1] = pts[i]
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
}
function edgeShapes(pts) {
  const edge = pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')
  return {
    fill: `M ${-PAD} ${H + 60} L ${edge} L ${W + PAD} ${H + 60} Z`,
    line: `M ${edge}`,
  }
}

// A rock lit by the nebula: irregular outline, a soft wash of coloured light
// from the side facing the light (`light` points toward it), shadow on the
// far side, lit-rimmed pits, a bright rim on the edges facing the light and a
// faint cool kick on the opposite edges.
function rock(
  seed,
  r0,
  { n = 11, base = '#2e2650', dark = '#05030d', glow = '#ff9ad6', rim = '#ffc4ec', kick = '#8fc4ff', pits = 0, light = [0.6, 0.8], edge = 0.45 } = {},
) {
  const r = rng(seed)
  const id = `nebula-rk-${seed}`
  const verts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + (r() - 0.5) * 0.45
    const rr = r0 * (0.7 + r() * 0.42)
    return [Math.cos(a) * rr, Math.sin(a) * rr * (0.78 + r() * 0.14)]
  })
  const outline = `M ${verts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`
  let rimD = ''
  let kickD = ''
  verts.forEach((v, i) => {
    const w = verts[(i + 1) % n]
    const el = Math.hypot(w[0] - v[0], w[1] - v[1])
    const nx = (w[1] - v[1]) / el
    const ny = -(w[0] - v[0]) / el
    const d = light[0] * nx + light[1] * ny
    const seg = ` M ${f(v[0])} ${f(v[1])} L ${f(w[0])} ${f(w[1])}`
    if (d > edge) rimD += seg
    else if (d < -0.7) kickD += seg
  })
  const holes = Array.from({ length: pits }, () => {
    const a = r() * TAU
    const d = Math.sqrt(r()) * r0 * 0.5
    return [Math.cos(a) * d, Math.sin(a) * d * 0.8, r0 * (0.08 + r() * 0.1)]
  })
  return (
    <>
      <defs>
        <linearGradient id={id} x1={g2(0.5 + 0.5 * light[0])} y1={g2(0.5 + 0.5 * light[1])} x2={g2(0.5 - 0.5 * light[0])} y2={g2(0.5 - 0.5 * light[1])}>
          <stop offset="0" stopColor={glow} stopOpacity=".5" />
          <stop offset=".32" stopColor={glow} stopOpacity=".1" />
          <stop offset=".58" stopColor={dark} stopOpacity=".25" />
          <stop offset="1" stopColor={dark} stopOpacity=".85" />
        </linearGradient>
      </defs>
      <path d={outline} fill={base} />
      {holes.map(([x, y, rr], i) => (
        <g key={i}>
          <ellipse cx={f(x + rr * 0.25 * light[0])} cy={f(y + rr * 0.25 * light[1])} rx={f(rr * 1.05)} ry={f(rr * 0.82)} fill={glow} opacity=".22" />
          <ellipse cx={f(x - rr * 0.12 * light[0])} cy={f(y - rr * 0.12 * light[1])} rx={f(rr)} ry={f(rr * 0.78)} fill={dark} opacity=".45" />
        </g>
      ))}
      <path d={outline} fill={`url(#${id})`} />
      <path d={rimD} stroke={rim} strokeWidth={g2(Math.max(1.1, r0 * 0.045))} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".9" />
      <path d={kickD} stroke={kick} strokeWidth={g2(Math.max(0.8, r0 * 0.025))} strokeLinecap="round" fill="none" opacity=".35" />
    </>
  )
}

/* ---------- 0 · deep sky ---------- */

function starDust(seed) {
  const r = rng(seed)
  const tiers = [
    { fill: '#ffffff', op: 0.3, list: [] },
    { fill: '#dfe3ff', op: 0.48, list: [] },
    { fill: '#ffe0f2', op: 0.62, list: [] },
    { fill: '#ffffff', op: 0.85, list: [] },
  ]
  for (let i = 0; i < 300; i++) {
    const t = Math.floor(r() * 4)
    tiers[t].list.push([-60 + r() * (W + 120), r() * 720, 0.4 + r() * 0.42 + t * 0.12])
  }
  // a faint band of denser, dimmer stars running low-left to high-right
  const [ax, ay, bx, by] = [-140, 660, 1580, 20]
  const len = Math.hypot(bx - ax, by - ay)
  const nx = (by - ay) / len
  const ny = -(bx - ax) / len
  for (let i = 0; i < 280; i++) {
    const t = r()
    const off = (r() + r() + r() - 1.5) * 95
    tiers[Math.floor(r() * 2)].list.push([ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off, 0.35 + r() * 0.42])
  }
  return tiers.map((tier, i) => <path key={i} d={dotPath(tier.list)} fill={tier.fill} opacity={tier.op} />)
}

function twinklers(seed, count) {
  const r = rng(seed)
  const tints = ['#ffffff', '#e2e6ff', '#ffe2f3', '#d6f0ff']
  return Array.from({ length: count }, (_, i) => {
    const dur = 2.6 + r() * 4.2
    return (
      <circle
        key={i}
        className="nebula-twinkle"
        cx={f(30 + r() * (W - 60))}
        cy={f(20 + r() * 620)}
        r={g2(0.95 + r() * 0.95)}
        fill={tints[i % 4]}
        style={{
          animationDuration: `${dur.toFixed(2)}s`,
          animationDelay: `${(-r() * dur).toFixed(2)}s`,
        }}
      />
    )
  })
}

function glimmers(seed, pts) {
  const r = rng(seed)
  return pts.map(([x, y, s], i) => {
    const dur = 5 + r() * 6
    return (
      <g
        key={i}
        className="nebula-glimmer"
        style={{
          animationDuration: `${dur.toFixed(1)}s`,
          animationDelay: `${(-r() * dur).toFixed(1)}s`,
        }}
      >
        <path d={star4(x, y, 7 * s, 0.7 * s)} fill="#fff" />
        <circle cx={x} cy={y} r={g2(1.3 * s)} fill="#fff" />
      </g>
    )
  })
}

function arm(rot) {
  const turns = 1.3
  const r0 = 5
  const r1 = 84
  const b = Math.log(r1 / r0) / (turns * TAU)
  const pts = []
  for (let i = 0; i <= 56; i++) {
    const th = (i / 56) * turns * TAU
    const rr = r0 * Math.exp(b * th)
    pts.push(`${f(rr * Math.cos(th + rot))} ${f(rr * Math.sin(th + rot))}`)
  }
  return `M ${pts.join(' L ')}`
}

function galaxyKnots(seed, count) {
  const r = rng(seed)
  const turns = 1.3
  const b = Math.log(84 / 5) / (turns * TAU)
  return Array.from({ length: count }, (_, i) => {
    const th = (0.15 + r() * 0.8) * turns * TAU
    const rr = 5 * Math.exp(b * th) + (r() - 0.5) * 8
    const a = th + (i % 2 ? Math.PI : 0) + (r() - 0.5) * 0.25
    return (
      <circle
        key={i}
        cx={f(rr * Math.cos(a))}
        cy={f(rr * Math.sin(a))}
        r={g2(1.2 + r() * 1.6)}
        fill={r() < 0.55 ? '#ffb3e0' : '#bcd4ff'}
        opacity={g2(0.5 + r() * 0.5)}
      />
    )
  })
}

function shoot({ x, y, a, len, dur, delay }) {
  return (
    <g key={`${x},${y}`} transform={`translate(${x} ${y}) rotate(${a})`}>
      <g className="nebula-shoot" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <path d={`M ${-len} 0 L 0 -1.3 L 0 1.3 Z`} fill="url(#nebula-shoot-g)" />
        <circle r="5" fill="url(#nebula-shoot-head)" />
        <circle r="1.7" fill="#fff" />
      </g>
    </g>
  )
}

const deepSky = (
  <Svg>
    <defs>
      {radial({ id: 'nebula-band-g', stops: soft('#6f5fd0', 0.22) })}
      {radial({
        id: 'nebula-gal-disc',
        stops: [
          [0, '#e9dcff', 0.5],
          [0.25, '#b9a8ff', 0.22],
          [0.6, '#8a78e0', 0.07],
          [1, '#8a78e0', 0],
        ],
      })}
      {radial({
        id: 'nebula-gal-arm',
        gradientUnits: 'userSpaceOnUse',
        cx: '0',
        cy: '0',
        r: '90',
        stops: [
          [0, '#fff3e6'],
          [0.3, '#e6dcff'],
          [0.75, '#b7b0ff', 0.6],
          [1, '#b7b0ff', 0],
        ],
      })}
      {radial({
        id: 'nebula-gal-core',
        stops: [
          [0, '#fffaf0'],
          [0.3, '#ffe2c4', 0.85],
          [0.65, '#ffb8d8', 0.25],
          [1, '#ffb8d8', 0],
        ],
      })}
      {radial({
        id: 'nebula-far-gal',
        stops: [
          [0, '#efe6ff', 0.8],
          [0.4, '#b9a8ff', 0.3],
          [1, '#b9a8ff', 0],
        ],
      })}
      {linear({
        id: 'nebula-shoot-g',
        stops: [
          [0, '#fff', 0],
          [0.7, '#f3e6ff', 0.45],
          [1, '#fff', 0.95],
        ],
      })}
      {radial({ id: 'nebula-shoot-head', stops: soft('#ffe6f6', 0.8) })}
    </defs>
    {/* a faint glow along the band of the galaxy we live in */}
    <ellipse cx="720" cy="340" rx="980" ry="130" transform="rotate(-20.4 720 340)" fill="url(#nebula-band-g)" />
    {starDust(7)}
    {/* tiny far galaxies */}
    <ellipse cx="1214" cy="64" rx="9" ry="3.4" transform="rotate(24 1214 64)" fill="url(#nebula-far-gal)" />
    <ellipse cx="934" cy="58" rx="6" ry="2.6" transform="rotate(-38 934 58)" fill="url(#nebula-far-gal)" />
    <ellipse cx="500" cy="96" rx="7" ry="4" transform="rotate(60 500 96)" fill="url(#nebula-far-gal)" opacity=".8" />
    {/* the spiral galaxy, turning very slowly in its tilted plane */}
    <g transform="translate(300 168) rotate(-28) scale(1 0.42)">
      <g className="nebula-galaxy">
        <circle r="98" fill="none" />
        <circle r="96" fill="url(#nebula-gal-disc)" />
        {[0, Math.PI].map((rot) => (
          <g key={rot} fill="none" stroke="url(#nebula-gal-arm)" strokeLinecap="round">
            <path d={arm(rot)} strokeWidth="20" opacity=".1" />
            <path d={arm(rot)} strokeWidth="10" opacity=".2" />
            <path d={arm(rot)} strokeWidth="4" opacity=".42" />
            <path d={arm(rot)} strokeWidth="1.4" opacity=".7" />
          </g>
        ))}
        {galaxyKnots(31, 26)}
      </g>
    </g>
    <ellipse
      className="nebula-pulse"
      cx="300"
      cy="168"
      rx="24"
      ry="13"
      transform="rotate(-28 300 168)"
      fill="url(#nebula-gal-core)"
      style={{ animationDuration: '7s' }}
    />
    {twinklers(23, 32)}
    {glimmers(29, [
      [120, 360, 1.1],
      [520, 60, 0.9],
      [930, 120, 1],
      [1390, 380, 1.1],
      [700, 470, 0.8],
      [1180, 250, 0.9],
    ])}
    {shoot({ x: 600, y: 52, a: 158, len: 150, dur: 19, delay: -4 })}
    {shoot({ x: 1440, y: 210, a: 166, len: 130, dur: 31, delay: -22 })}
    {shoot({ x: 430, y: 262, a: 148, len: 120, dur: 43, delay: -9 })}
  </Svg>
)

/* ---------- 1 · nebula ---------- */

const GAS = {
  pink: '#ff5fae',
  magenta: '#e2389c',
  rose: '#ffa3da',
  violet: '#9b5cff',
  indigo: '#5a4dff',
  blue: '#4a7bff',
  cyan: '#5ad8ff',
  gold: '#ffb48a',
}

// A bank of gas: overlapping soft ellipses scattered round a centre.
function bank(seed, { x, y, sx, sy, n, size, gases, op, rot = 0, jitter = 40, flat = [0.4, 0.8], puff = false }) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const cx = x + (r() + r() - 1) * sx
    const cy = y + (r() + r() - 1) * sy
    const rx = size * (0.5 + r() * 0.7)
    const ry = rx * (flat[0] + r() * (flat[1] - flat[0]))
    const a = rot + (r() - 0.5) * jitter
    const gas = gases[Math.floor(r() * gases.length)]
    return (
      <ellipse
        key={i}
        cx={f(cx)}
        cy={f(cy)}
        rx={f(rx)}
        ry={f(ry)}
        transform={`rotate(${f(a)} ${f(cx)} ${f(cy)})`}
        fill={`url(#nebula-${puff ? 'puff' : 'gas'}-${gas})`}
        opacity={g2(op[0] + r() * (op[1] - op[0]))}
      />
    )
  })
}

const BANKS = [
  // broad violet veil low across the sky
  {
    seed: 3,
    x: 560,
    y: 470,
    sx: 560,
    sy: 130,
    n: 8,
    size: 300,
    gases: ['violet', 'indigo'],
    op: [0.22, 0.4],
    rot: -10,
    anim: ['a', 74, -10],
  },
  // the great pink cloud on the left
  {
    seed: 5,
    x: 330,
    y: 400,
    sx: 220,
    sy: 130,
    n: 13,
    size: 165,
    gases: ['pink', 'magenta', 'rose', 'pink'],
    op: [0.32, 0.62],
    rot: -24,
    anim: ['b', 52, -20],
  },
  // its upper lobe, curling up and to the left
  {
    seed: 8,
    x: 240,
    y: 290,
    sx: 150,
    sy: 100,
    n: 7,
    size: 120,
    gases: ['rose', 'violet', 'magenta'],
    op: [0.2, 0.42],
    rot: -52,
    anim: ['c', 44, -5],
  },
  // the blue reflection cloud low on the right
  {
    seed: 11,
    x: 1070,
    y: 560,
    sx: 320,
    sy: 80,
    n: 11,
    size: 180,
    gases: ['blue', 'cyan', 'indigo', 'blue'],
    op: [0.3, 0.58],
    rot: -6,
    anim: ['a', 64, -33],
  },
  // violet bridge between them
  {
    seed: 13,
    x: 740,
    y: 575,
    sx: 220,
    sy: 55,
    n: 7,
    size: 150,
    gases: ['violet', 'magenta', 'indigo'],
    op: [0.28, 0.5],
    rot: 4,
    anim: ['b', 58, -40],
  },
  // a cyan lobe drifting up the right edge
  {
    seed: 17,
    x: 1260,
    y: 440,
    sx: 150,
    sy: 120,
    n: 6,
    size: 130,
    gases: ['cyan', 'blue', 'indigo'],
    op: [0.18, 0.38],
    rot: -34,
    anim: ['c', 49, -12],
  },
  // a faint veil high on the right
  {
    seed: 19,
    x: 1050,
    y: 250,
    sx: 260,
    sy: 110,
    n: 5,
    size: 150,
    gases: ['indigo', 'violet'],
    op: [0.1, 0.22],
    rot: -22,
    anim: ['a', 86, -50],
  },
  // billowing detail in the pink cloud, warmest round the core
  {
    seed: 23,
    x: 350,
    y: 392,
    sx: 230,
    sy: 120,
    n: 22,
    size: 58,
    gases: ['rose', 'pink', 'rose', 'gold', 'magenta'],
    op: [0.22, 0.5],
    rot: -22,
    puff: true,
    anim: ['c', 41, -8],
  },
  // and in the blue cloud
  {
    seed: 29,
    x: 1070,
    y: 552,
    sx: 280,
    sy: 56,
    n: 16,
    size: 56,
    gases: ['cyan', 'blue', 'cyan', 'violet'],
    op: [0.22, 0.46],
    rot: -5,
    puff: true,
    anim: ['b', 46, -18],
  },
]

// Long thin wisps: three stacked strokes fake a soft edge.
const WISPS = [
  ['M 70 300 C 150 220, 270 180, 420 196', 'rose', 14, 0.5],
  ['M 120 486 C 230 540, 380 552, 540 520', 'magenta', 12, 0.5],
  ['M 470 250 C 540 300, 580 360, 640 440', 'violet', 10, 0.4],
  ['M 860 470 C 980 420, 1170 430, 1340 520', 'cyan', 12, 0.45],
  ['M 1000 640 C 1120 600, 1260 610, 1420 560', 'blue', 14, 0.45],
  ['M 40 410 C 110 380, 170 330, 200 260', 'pink', 10, 0.45],
]
// Bright ionised fronts along the core-facing edges of the dust lanes.
const FRONTS = [
  ['M 176 506 C 260 486, 380 478, 548 384', 'rose', 0.9],
  ['M 176 428 C 220 396, 290 340, 396 262', 'rose', 0.55],
  ['M 730 580 C 860 560, 1060 556, 1300 606', 'cyan', 0.7],
]

// Dark dust lanes: chains of soft dark ellipses along a gentle curve, so they
// read as torn, uneven filaments rather than single strokes.
const LANES = [
  // [p0, p1 (control), p2, width, count, opacity, seed]
  [[150, 530], [340, 506], [560, 410], 30, 9, 0.62, 1],
  [[150, 452], [262, 372], [420, 270], 20, 7, 0.5, 2],
  [[700, 606], [1000, 590], [1320, 632], 26, 10, 0.45, 4],
]
function lane([p0, p1, p2, w, n, op, seed]) {
  const r = rng(seed * 97)
  const at = (t) => [(1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]]
  const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1])
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5 + (r() - 0.5) * 0.5) / n
    const [x, y] = at(t)
    const [xa, ya] = at(Math.max(t - 0.02, 0))
    const [xb, yb] = at(Math.min(t + 0.02, 1))
    const a = (Math.atan2(yb - ya, xb - xa) * 180) / Math.PI + (r() - 0.5) * 14
    const taper = Math.sin(Math.PI * t) * 0.6 + 0.4
    const ox = (r() - 0.5) * w * 0.9
    return (
      <ellipse
        key={i}
        cx={f(x + ox * 0.3)}
        cy={f(y + ox)}
        rx={f((len / n) * (0.8 + r() * 0.7))}
        ry={f(w * taper * (0.55 + r() * 0.7))}
        transform={`rotate(${f(a)} ${f(x + ox * 0.3)} ${f(y + ox)})`}
        fill="url(#nebula-dust)"
        opacity={g2(op * (0.7 + r() * 0.3))}
      />
    )
  })
}
const CORES = [
  // [x, y, r, gradient, pulse s]
  [332, 394, 96, 'nebula-core-pink', 9],
  [472, 456, 52, 'nebula-core-rose', 7],
  [1034, 556, 84, 'nebula-core-blue', 11],
  [760, 586, 48, 'nebula-core-violet', 8],
]

// Bright young stars with diffraction spikes.
const SPIKES = [
  [334, 392, 1.25, '#fff2fb', 4.6],
  [1036, 554, 1, '#e8f7ff', 5.8],
  [586, 488, 0.62, '#ffe8f6', 3.9],
  [150, 520, 0.55, '#ffe0f0', 5.1],
  [1268, 236, 0.8, '#eef0ff', 6.4],
  [470, 150, 0.5, '#fff', 4.3],
  [1330, 470, 0.55, '#dff6ff', 5.4],
]

// Young star clusters packed round the hot cores.
function cluster(seed, cx, cy, spread, count) {
  const r = rng(seed)
  const list = Array.from({ length: count }, () => {
    const a = r() * TAU
    const d = spread * Math.sqrt(-Math.log(1 - r() * 0.95)) * 0.6
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 0.5 + r() * 1.1]
  })
  return <path d={dotPath(list)} fill="#fff6fc" opacity=".85" />
}

function spikeStar({ x, y, s, color, dur, i }) {
  return (
    <g
      key={i}
      className="nebula-spark"
      style={{
        animationDuration: `${dur}s`,
        animationDelay: `${(-i * 1.7).toFixed(1)}s`,
      }}
    >
      <circle cx={x} cy={y} r={f(30 * s)} fill="url(#nebula-star-halo)" />
      <path d={star4(x, y, 54 * s, 1.5 * s)} fill={color} opacity=".9" />
      <path d={star4(x, y, 18 * s, 1.1 * s, 45)} fill={color} opacity=".45" />
      <circle cx={x} cy={y} r={g2(2.8 * s)} fill="#fff" />
    </g>
  )
}

const COMET = { x: 1450, y: 16, a: 160, len: 553 }

const nebula = (
  <Svg>
    <defs>
      {Object.entries(GAS).map(([k, c]) => radial({ key: k, id: `nebula-gas-${k}`, stops: soft(c) }))}
      {Object.entries(GAS).map(([k, c]) =>
        radial({
          key: k,
          id: `nebula-puff-${k}`,
          stops: [
            [0, c, 1],
            [0.3, c, 0.72],
            [0.6, c, 0.26],
            [0.85, c, 0.05],
            [1, c, 0],
          ],
        }),
      )}
      {radial({
        id: 'nebula-dust',
        stops: [
          [0, '#07031a', 1],
          [0.35, '#07031a', 0.8],
          [0.7, '#07031a', 0.3],
          [1, '#07031a', 0],
        ],
      })}
      {radial({
        id: 'nebula-core-pink',
        stops: [
          [0, '#fff6fb'],
          [0.12, '#ffe0f2', 0.9],
          [0.32, '#ff8fcf', 0.45],
          [0.62, '#ff5fae', 0.12],
          [1, '#ff5fae', 0],
        ],
      })}
      {radial({
        id: 'nebula-core-rose',
        stops: [
          [0, '#fff0f8', 0.9],
          [0.25, '#ffb0de', 0.5],
          [0.6, '#ff7fc0', 0.12],
          [1, '#ff7fc0', 0],
        ],
      })}
      {radial({
        id: 'nebula-core-blue',
        stops: [
          [0, '#f2fbff'],
          [0.14, '#c6eeff', 0.85],
          [0.36, '#6fc4ff', 0.4],
          [0.66, '#4a7bff', 0.1],
          [1, '#4a7bff', 0],
        ],
      })}
      {radial({
        id: 'nebula-core-violet',
        stops: [
          [0, '#f6eeff', 0.85],
          [0.25, '#c9a8ff', 0.45],
          [0.6, '#9b5cff', 0.12],
          [1, '#9b5cff', 0],
        ],
      })}
      {radial({
        id: 'nebula-star-halo',
        stops: [
          [0, '#ffffff', 0.85],
          [0.2, '#ffe6f6', 0.4],
          [0.5, '#ffc6ea', 0.1],
          [1, '#ffc6ea', 0],
        ],
      })}
      {['rose', 'magenta', 'violet', 'cyan', 'blue', 'pink'].map((k) =>
        linear({
          key: k,
          id: `nebula-wisp-${k}`,
          stops: [
            [0, GAS[k], 0],
            [0.3, GAS[k], 1],
            [0.7, GAS[k], 1],
            [1, GAS[k], 0],
          ],
        }),
      )}
      {linear({
        id: 'nebula-dust-tail',
        x1: '1',
        y1: '0',
        x2: '0',
        y2: '0',
        stops: [
          [0, '#fff0fa', 0.85],
          [0.18, '#ffc2e6', 0.5],
          [0.55, '#ff8fcf', 0.16],
          [1, '#ff8fcf', 0],
        ],
      })}
      {linear({
        id: 'nebula-ion-tail',
        x1: '1',
        y1: '0',
        x2: '0',
        y2: '0',
        stops: [
          [0, '#e6fbff', 0.9],
          [0.3, '#8fdcff', 0.45],
          [1, '#5ab4ff', 0],
        ],
      })}
      {radial({
        id: 'nebula-coma',
        stops: [
          [0, '#ffffff'],
          [0.18, '#eafcff', 0.9],
          [0.45, '#a8e8ff', 0.35],
          [1, '#a8e8ff', 0],
        ],
      })}
    </defs>

    {BANKS.map((b, i) => (
      <g
        key={i}
        className={`nebula-bank nebula-bank-${b.anim[0]}`}
        style={{
          animationDuration: `${b.anim[1]}s`,
          animationDelay: `${b.anim[2]}s`,
        }}
      >
        {bank(b.seed, b)}
      </g>
    ))}

    <g className="nebula-wisps" style={{ animationDuration: '38s' }}>
      {WISPS.slice(0, 3).map(([d, c, w, o]) => (
        <g key={d} fill="none" stroke={`url(#nebula-wisp-${c})`} strokeLinecap="round">
          <path d={d} strokeWidth={w * 4} opacity={g2(o * 0.12)} />
          <path d={d} strokeWidth={w * 2.2} opacity={g2(o * 0.2)} />
          <path d={d} strokeWidth={w * 1.1} opacity={g2(o * 0.26)} />
          <path d={d} strokeWidth={w * 0.4} opacity={g2(o * 0.3)} />
        </g>
      ))}
    </g>
    <g
      className="nebula-wisps"
      style={{
        animationDuration: '47s',
        animationDirection: 'alternate-reverse',
      }}
    >
      {WISPS.slice(3).map(([d, c, w, o]) => (
        <g key={d} fill="none" stroke={`url(#nebula-wisp-${c})`} strokeLinecap="round">
          <path d={d} strokeWidth={w * 4} opacity={g2(o * 0.12)} />
          <path d={d} strokeWidth={w * 2.2} opacity={g2(o * 0.2)} />
          <path d={d} strokeWidth={w * 1.1} opacity={g2(o * 0.26)} />
          <path d={d} strokeWidth={w * 0.4} opacity={g2(o * 0.3)} />
        </g>
      ))}
    </g>

    {FRONTS.map(([d, c, o]) => (
      <g key={d} fill="none" stroke={`url(#nebula-wisp-${c})`} strokeLinecap="round" opacity={o}>
        <path d={d} strokeWidth="22" opacity=".09" />
        <path d={d} strokeWidth="10" opacity=".16" />
        <path d={d} strokeWidth="4" opacity=".2" />
      </g>
    ))}

    {CORES.map(([x, y, rr, g, d], i) => (
      <circle
        key={i}
        className="nebula-pulse"
        cx={x}
        cy={y}
        r={rr}
        fill={`url(#${g})`}
        style={{ animationDuration: `${d}s`, animationDelay: `${-i * 2.3}s` }}
      />
    ))}

    {/* dark dust lanes and globules in front of the glow */}
    <g className="nebula-lanes" style={{ animationDuration: '61s' }}>
      {LANES.slice(0, 2).map(lane)}
    </g>
    <g
      className="nebula-lanes"
      style={{
        animationDuration: '73s',
        animationDirection: 'alternate-reverse',
      }}
    >
      {LANES.slice(2).map(lane)}
    </g>

    {cluster(71, 336, 396, 70, 34)}
    {cluster(73, 1034, 556, 60, 22)}
    {cluster(79, 760, 584, 40, 10)}
    {SPIKES.map(([x, y, s, c, d], i) => spikeStar({ key: i, x: x, y: y, s: s, color: c, dur: d, i: i }))}

    {/* the comet, crossing the dark sky above the planet */}
    <g transform={`translate(${COMET.x} ${COMET.y}) rotate(${COMET.a})`}>
      <g className="nebula-comet">
        <circle r="46" fill="url(#nebula-coma)" opacity=".28" />
        <path d="M 2 -9 C -80 -22, -200 -52, -330 -92 C -300 -46, -292 -12, -310 32 C -190 16, -80 9, 2 9 Z" fill="url(#nebula-dust-tail)" opacity=".26" />
        <path d="M 2 -6 C -70 -14, -170 -34, -280 -60 C -262 -32, -256 -8, -266 16 C -164 9, -70 6, 2 6 Z" fill="url(#nebula-dust-tail)" opacity=".42" />
        <path d="M 2 -3.5 C -60 -8, -140 -18, -220 -32 C -212 -20, -210 -10, -214 0 C -130 -1, -60 2, 2 3.5 Z" fill="url(#nebula-dust-tail)" opacity=".7" />
        <g className="nebula-ion">
          <path d="M 0 -1.6 L -380 -22 L -380 -14 L 0 1.6 Z" fill="url(#nebula-ion-tail)" />
          <path d="M 0 -1 L -260 -4 L -260 1 L 0 1 Z" fill="url(#nebula-ion-tail)" opacity=".7" />
        </g>
        <circle className="nebula-coma" r="22" fill="url(#nebula-coma)" />
        <circle r="2.6" fill="#fff" />
      </g>
    </g>
  </Svg>
)

/* ---------- 2 · ringed planet ---------- */

const P = { x: 1098, y: 366, r: 94, tilt: -15 }
const BAND_P = 240 // band pattern period: the bands loop seamlessly by this much

function band(y0, y1, amp, lambda, phase) {
  const top = []
  const bot = []
  for (let x = -P.r - BAND_P; x <= P.r + BAND_P + 6; x += 6) {
    top.push(`${f(x)} ${f(y0 + amp * Math.sin((x / lambda) * TAU + phase))}`)
    bot.push(`${f(x)} ${f(y1 + amp * 0.7 * Math.sin((x / lambda) * TAU + phase + 1.3))}`)
  }
  return `M ${top.join(' L ')} L ${bot.reverse().join(' L ')} Z`
}

const BANDS = {
  north: [
    [-96, -74, 2, 120, 0, '#ffe6f7', 0.4],
    [-64, -52, 2.5, 80, 1, '#5d2aa8', 0.42],
    [-46, -36, 3, 60, 2, '#f8c6ee', 0.34],
  ],
  equator: [
    [-26, -9, 3.5, 80, 0.5, '#ffdcf3', 0.5],
    [-5, 6, 3, 60, 2.2, '#5e27a6', 0.5],
    [10, 22, 3, 120, 1.1, '#eab0ee', 0.38],
  ],
  south: [
    [30, 42, 2.5, 80, 0.2, '#4c2192', 0.45],
    [50, 60, 2, 120, 1.7, '#d9a0ea', 0.32],
    [68, 100, 2, 240, 3, '#34166e', 0.5],
  ],
}

// Rings: concentric circles in the ring plane, squashed so they are wide at
// the sides and thin at the front and back.
const RING_T = `translate(${P.x} ${P.y}) rotate(${P.tilt}) scale(1 0.3)`
const RINGS = [
  // [radius, width, opacity, dark band?]
  [130, 8, 0.16],
  [142, 14, 0.3],
  [153, 3, 0.55],
  [165, 20, 0.82],
  [159, 1.6, 0.6, true],
  [171, 1.3, 0.5, true],
  [190, 17, 0.6],
  [192, 1.3, 0.75, true],
  [206, 1.5, 0.65],
]
const ringStrokes = RINGS.map(([rr, w, o, dark], i) => (
  <circle key={i} r={rr} fill="none" stroke={dark ? '#3a2066' : 'url(#nebula-ring-shade)'} strokeWidth={w} opacity={o} />
))
// The same rings in shadow colour, for the planet's shadow falling on them.
const ringShadow = RINGS.filter((ring) => !ring[3]).map(([rr, w], i) => (
  <circle key={i} r={rr} fill="none" stroke="#0a0520" strokeWidth={w + 0.5} opacity=".72" />
))

// Screen position of a point on the ring plane (angle in degrees, 90 = front).
function onRing(rr, deg) {
  const lx = rr * Math.cos(rad(deg))
  const ly = 0.3 * rr * Math.sin(rad(deg))
  const c = Math.cos(rad(P.tilt))
  const s = Math.sin(rad(P.tilt))
  return [P.x + lx * c - ly * s, P.y + lx * s + ly * c]
}
const RING_GLINTS = [
  [165, 128, 6.5],
  [190, 62, 8.2],
  [150, 18, 5.4],
  [200, 160, 9.6],
]

// Two small moons on tilted orbits. Each is drawn twice, once behind the
// planet and once in front; the copies swap at the far left and right of the
// orbit, where neither overlaps the planet.
const MOONS = [
  {
    id: 'a',
    tilt: -15,
    T: 46,
    phase: 10,
    r: 10,
    c: ['#f4ecff', '#a99bd6', '#3d3270'],
  },
  {
    id: 'b',
    tilt: -9,
    T: 74,
    phase: 50,
    r: 6,
    c: ['#fff0e6', '#d0a8b8', '#4a2f5a'],
  },
]
function moonBody(m) {
  return (
    <>
      <circle r={m.r} fill={`url(#nebula-moon-${m.id})`} />
      <circle cx={-m.r * 0.25} cy={m.r * 0.2} r={m.r * 0.2} fill={m.c[2]} opacity=".25" />
      <circle cx={m.r * 0.3} cy={-m.r * 0.3} r={m.r * 0.13} fill={m.c[2]} opacity=".2" />
    </>
  )
}
function orbiter(m, side) {
  const half = m.T / 2
  return (
    <g key={m.id + side} transform={`translate(${P.x} ${P.y}) rotate(${m.tilt})`}>
      <g
        className={`nebula-orbit-${m.id}x`}
        style={{
          animationDuration: `${half}s`,
          animationDelay: `${-m.phase}s`,
        }}
      >
        <g
          className={`nebula-orbit-${m.id}y`}
          style={{
            animationDuration: `${half}s`,
            animationDelay: `${-(m.T * 0.75 + m.phase)}s`,
          }}
        >
          <g
            className={`nebula-orbit-${side}`}
            style={{
              animationDuration: `${m.T}s`,
              animationDelay: `${-m.phase}s`,
            }}
          >
            <g transform={`rotate(${-m.tilt})`}>{moonBody(m)}</g>
          </g>
        </g>
      </g>
    </g>
  )
}

const planet = (
  <Svg>
    <defs>
      <clipPath id="nebula-planet-clip">
        <circle cx={P.x} cy={P.y} r={P.r} />
      </clipPath>
      <clipPath id="nebula-ring-back">
        <rect x="-260" y="-300" width="520" height="300" />
      </clipPath>
      <clipPath id="nebula-ring-front">
        <rect x="-260" y="0" width="520" height="300" />
      </clipPath>
      <clipPath id="nebula-ring-shadow">
        <path d="M 30 -100 L 250 -190 L 250 -30 L 30 40 Z" />
      </clipPath>
      {radial({
        id: 'nebula-planet-glow',
        stops: [
          [0, '#c77bff', 0.5],
          [0.45, '#b04fff', 0.32],
          [0.62, '#8a4fff', 0.12],
          [1, '#8a4fff', 0],
        ],
      })}
      {linear({
        id: 'nebula-planet-base',
        x1: '0',
        y1: '0',
        x2: '0',
        y2: '1',
        stops: [
          [0, '#f7cdef'],
          [0.28, '#cf8bed'],
          [0.52, '#a35fe0'],
          [0.74, '#8044cb'],
          [1, '#4b2396'],
        ],
      })}
      {radial({
        id: 'nebula-planet-night',
        cx: '0.3',
        cy: '0.26',
        r: '0.86',
        stops: [
          [0, '#0a0520', 0],
          [0.36, '#0a0520', 0],
          [0.56, '#0a0520', 0.5],
          [0.76, '#0a0520', 0.84],
          [1, '#0a0520', 0.96],
        ],
      })}
      {linear({
        id: 'nebula-planet-limb',
        x1: '0.1',
        y1: '0.1',
        x2: '0.62',
        y2: '0.62',
        stops: [
          [0, '#ffe6f8', 0.95],
          [0.5, '#ffb6ea', 0.35],
          [1, '#ffb6ea', 0],
        ],
      })}
      {linear({
        id: 'nebula-ring-shade',
        gradientUnits: 'userSpaceOnUse',
        x1: '-210',
        y1: '0',
        x2: '210',
        y2: '0',
        stops: [
          [0, '#fff3fb'],
          [0.45, '#f3d2f2'],
          [0.75, '#c3a3e6'],
          [1, '#a083d6'],
        ],
      })}
      {MOONS.map((m) =>
        radial({
          key: m.id,
          id: `nebula-moon-${m.id}`,
          cx: '0.36',
          cy: '0.32',
          r: '0.72',
          stops: [
            [0, m.c[0]],
            [0.5, m.c[1]],
            [1, m.c[2]],
          ],
        }),
      )}
    </defs>

    <circle className="nebula-pulse" cx={P.x} cy={P.y} r={P.r * 2.4} fill="url(#nebula-planet-glow)" style={{ animationDuration: '12s' }} />

    {/* back: moons on the far side of their orbits, then the far half of the rings */}
    {MOONS.map((m) => orbiter(m, 'back'))}
    <g transform={RING_T}>
      <g clipPath="url(#nebula-ring-back)">
        {ringStrokes}
        {/* the planet's shadow falling across the rings behind it */}
        <g clipPath="url(#nebula-ring-shadow)">{ringShadow}</g>
      </g>
    </g>

    {/* the planet: base colour, drifting bands, ring shadow, night side, lit limb */}
    <circle cx={P.x} cy={P.y} r={P.r} fill="#2a1060" />
    <g clipPath="url(#nebula-planet-clip)">
      <g transform={`translate(${P.x} ${P.y}) rotate(${P.tilt})`}>
        <rect x={-P.r - 20} y={-P.r - 20} width={2 * P.r + 40} height={2 * P.r + 40} fill="url(#nebula-planet-base)" />
        {Object.entries(BANDS).map(([k, list], gi) => (
          <g
            key={k}
            className={`nebula-band nebula-band-${k}`}
            style={{
              animationDuration: `${[150, 96, 190][gi]}s`,
              animationDelay: `${-gi * 37}s`,
            }}
          >
            {list.map(([y0, y1, amp, lambda, ph, c, o]) => (
              <path key={y0} d={band(y0, y1, amp, lambda, ph)} fill={c} opacity={o} />
            ))}
            {k === 'equator' &&
              [-BAND_P, 0, BAND_P].map((dx) => (
                <g key={dx}>
                  <ellipse cx={58 + dx} cy="15" rx="17" ry="7.5" fill="#ffd6ef" opacity=".75" />
                  <ellipse cx={58 + dx} cy="15" rx="10" ry="4" fill="#c35acb" opacity=".7" />
                  <ellipse cx={-70 + dx} cy="-30" rx="7" ry="3" fill="#fff0fa" opacity=".6" />
                </g>
              ))}
          </g>
        ))}
        {/* shadow of the rings on the globe */}
        <g transform="translate(0 -12) scale(1 0.3)">
          <circle r="168" fill="none" stroke="#1a0a3e" strokeWidth="36" opacity=".38" />
        </g>
      </g>
      <circle cx={P.x} cy={P.y} r={P.r} fill="url(#nebula-planet-night)" />
    </g>
    <circle cx={P.x} cy={P.y} r={P.r - 1.2} fill="none" stroke="url(#nebula-planet-limb)" strokeWidth="2.4" />

    {/* front: near half of the rings, glints, and moons on the near side */}
    <g transform={RING_T}>
      <g clipPath="url(#nebula-ring-front)">{ringStrokes}</g>
    </g>
    {RING_GLINTS.map(([rr, deg, d], i) => {
      const [x, y] = onRing(rr, deg)
      return (
        <g
          key={i}
          className="nebula-glint"
          style={{
            animationDuration: `${d}s`,
            animationDelay: `${(-i * 2.9).toFixed(1)}s`,
          }}
        >
          <path d={star4(x, y, 9, 0.9)} fill="#fff" />
          <circle cx={f(x)} cy={f(y)} r="1.6" fill="#fff" />
        </g>
      )
    })}
    {MOONS.map((m) => orbiter(m, 'front'))}
  </Svg>
)

/* ---------- 4 · near moon & station ---------- */

const NM = { x: 252, y: 546, r: 38 }
const NM_P = 2 * NM.r + 26 // crater pattern period (the surface loops by this)
const NM_CRATERS = [
  [8, -16, 9],
  [34, 10, 6],
  [62, -4, 11],
  [86, 22, 5],
  [20, 24, 7],
  [74, -26, 4.5],
  [46, -30, 5],
]

const ST = { x: -60, y: 306, a: -7, len: 540 }

function station() {
  const panel = (x, y) => (
    <g key={`${x},${y}`}>
      <rect x={x} y={y} width="15" height="12" fill="url(#nebula-panel)" />
      <path d={`M ${x + 5} ${y} V ${y + 12} M ${x + 10} ${y} V ${y + 12} M ${x} ${y + 6} H ${x + 15}`} stroke="#1a2152" strokeWidth=".6" />
    </g>
  )
  return (
    <>
      <rect x="-37" y="-1.2" width="74" height="2.4" fill="#4a4270" />
      {panel(-35, -15)}
      {panel(-35, 3)}
      {panel(20, -15)}
      {panel(20, 3)}
      <rect x="-12" y="-5" width="24" height="10" rx="4.5" fill="url(#nebula-module)" />
      <rect x="-4" y="-9" width="8" height="18" rx="3" fill="url(#nebula-module)" />
      <circle cx="0" cy="-9" r="2.2" fill="#d9d2f2" />
      <path d="M 12 -3 L 18 -8" stroke="#8d84b0" strokeWidth="1" />
      <g className="nebula-sheen">
        <rect x="-35" y="-15" width="15" height="12" fill="#e9ecff" opacity=".55" />
        <rect x="20" y="3" width="15" height="12" fill="#e9ecff" opacity=".4" />
      </g>
      <g className="nebula-blink" style={{ animationDuration: '1.6s' }}>
        <circle cx="-37" cy="0" r="5" fill="#ff5a7a" opacity=".35" />
        <circle cx="-37" cy="0" r="1.6" fill="#ff8aa0" />
      </g>
      <g className="nebula-blink" style={{ animationDuration: '1.6s', animationDelay: '-0.8s' }}>
        <circle cx="37" cy="0" r="5" fill="#5affc0" opacity=".35" />
        <circle cx="37" cy="0" r="1.6" fill="#a0ffd8" />
      </g>
      <g className="nebula-strobe">
        <circle cx="0" cy="-12" r="7" fill="#fff" opacity=".35" />
        <circle cx="0" cy="-12" r="1.8" fill="#fff" />
      </g>
    </>
  )
}

const nearMoon = (
  <Svg>
    <defs>
      <clipPath id="nebula-nm-clip">
        <circle cx={NM.x} cy={NM.y} r={NM.r} />
      </clipPath>
      {radial({
        id: 'nebula-nm-halo',
        stops: [
          [0, '#d9c6ff', 0.4],
          [0.45, '#c3a6ff', 0.22],
          [0.6, '#b28cff', 0.08],
          [1, '#b28cff', 0],
        ],
      })}
      {radial({
        id: 'nebula-nm-body',
        cx: '0.36',
        cy: '0.3',
        r: '0.78',
        stops: [
          [0, '#fbf6ff'],
          [0.35, '#d8ccf4'],
          [0.7, '#9586c2'],
          [1, '#5d4f8f'],
        ],
      })}
      {radial({
        id: 'nebula-nm-shade',
        cx: '0.3',
        cy: '0.26',
        r: '0.86',
        stops: [
          [0, '#0c0726', 0],
          [0.5, '#0c0726', 0],
          [0.74, '#0c0726', 0.6],
          [1, '#0c0726', 0.92],
        ],
      })}
      {linear({
        id: 'nebula-nm-limb',
        x1: '0',
        y1: '0',
        x2: '0.7',
        y2: '0.7',
        stops: [
          [0, '#ffffff', 0.9],
          [0.5, '#ffd6f2', 0.25],
          [1, '#ffd6f2', 0],
        ],
      })}
      {linear({
        id: 'nebula-panel',
        x1: '0',
        y1: '0',
        x2: '1',
        y2: '1',
        stops: [
          [0, '#6f86f0'],
          [0.5, '#3a4cb0'],
          [1, '#25307a'],
        ],
      })}
      {linear({
        id: 'nebula-module',
        x1: '0',
        y1: '0',
        x2: '0',
        y2: '1',
        stops: [
          [0, '#f4f0ff'],
          [0.55, '#b9b0d8'],
          [1, '#6f6696'],
        ],
      })}
    </defs>

    <circle className="nebula-pulse" cx={NM.x} cy={NM.y} r={NM.r * 2.6} fill="url(#nebula-nm-halo)" style={{ animationDuration: '10s' }} />
    <circle cx={NM.x} cy={NM.y} r={NM.r} fill="url(#nebula-nm-body)" />
    <g clipPath="url(#nebula-nm-clip)">
      <g className="nebula-surface" style={{ animationDuration: '80s' }}>
        {[-NM_P, 0, NM_P].map((dx) =>
          NM_CRATERS.map(([cx, cy, rr]) => {
            const x = NM.x - NM.r + cx + dx
            const y = NM.y + cy
            return (
              <g key={`${dx},${cx}`}>
                <ellipse cx={f(x + rr * 0.2)} cy={f(y + rr * 0.2)} rx={rr} ry={f(rr * 0.86)} fill="#fff6ff" opacity=".35" />
                <ellipse cx={f(x)} cy={f(y)} rx={rr} ry={f(rr * 0.86)} fill="#6e5fa4" opacity=".5" />
              </g>
            )
          }),
        )}
      </g>
      <circle cx={NM.x} cy={NM.y} r={NM.r} fill="url(#nebula-nm-shade)" />
    </g>
    <circle cx={NM.x} cy={NM.y} r={NM.r - 1} fill="none" stroke="url(#nebula-nm-limb)" strokeWidth="2" />

    {/* a small station drifting along its orbit, lights blinking */}
    <g transform={`translate(${ST.x} ${ST.y}) rotate(${ST.a})`}>
      <g className="nebula-station">
        <g className="nebula-roll">{station()}</g>
      </g>
    </g>
  </Svg>
)

/* ---------- 5 · far craters ---------- */

const FAR_BUMPS = [
  // distant rims and massifs on the horizon: [x, width, height]
  [-150, 120, 16],
  [120, 70, 9],
  [330, 150, 20],
  [520, 60, 7],
  [880, 110, 13],
  [1040, 170, 26],
  [1120, 40, 9],
  [1300, 100, 14],
  [1480, 150, 22],
]
// The horizon curves away at the edges: this is a small moon.
const farCurve = (x) => {
  let y = 612 + 0.000072 * (x - 720) ** 2
  for (const [bx, w, h] of FAR_BUMPS) y -= h * Math.exp(-(((x - bx) / w) ** 2))
  return y
}
const FAR_EDGE = rugged(5, farCurve, 0.12, 40)
const far = edgeShapes(FAR_EDGE)

// Craters on the plain, small and squashed near the horizon, larger and
// rounder toward us.
function farCraterList(seed, count) {
  const r = rng(seed)
  const list = []
  for (let i = 0; i < count; i++) {
    const y = 640 + r() ** 1.25 * 200
    const k = (y - 600) / 240
    const rx = (16 + r() * 46) * (0.3 + k * 1.15)
    const x = -120 + r() * (W + 240)
    const ry = rx * (0.11 + k * 0.2)
    if (y - ry * 1.4 > yAt(FAR_EDGE, x) + 6) list.push([x, y, rx, ry, k])
  }
  return list.sort((p, q) => p[1] - q[1])
}

function crater([x, y, rx, ry, k], i, near = false) {
  const lip = near ? 'url(#nebula-near-lip)' : 'url(#nebula-crater-lip)'
  return (
    <g key={i}>
      <ellipse cx={f(x)} cy={f(y + ry * 0.55)} rx={f(rx * 1.12)} ry={f(ry * 0.9)} fill={near ? '#05030f' : '#0d0828'} opacity=".45" />
      <ellipse cx={f(x)} cy={f(y)} rx={f(rx)} ry={f(ry)} fill={near ? 'url(#nebula-near-bowl)' : 'url(#nebula-bowl)'} />
      <path d={`M ${f(x - rx)} ${f(y)} A ${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(y)}`} fill="none" stroke={lip} strokeWidth={g2(0.8 + k * 1.1)} />
    </g>
  )
}

// Low swells on the plain catching a little nebula light: [x, y, rx, ry]
const SWELLS = [
  [240, 690, 260, 22],
  [760, 700, 320, 20],
  [1240, 694, 280, 24],
  [520, 756, 300, 26],
  [1040, 770, 340, 28],
]

// Scattered stones on the plain, each with a lit top.
function pebbles(seed, count) {
  const r = rng(seed)
  const list = []
  for (let i = 0; i < count; i++) {
    const x = -100 + r() * (W + 200)
    const y = 640 + r() ** 1.3 * 190
    const k = (y - 600) / 240
    const s = (1.5 + r() * 3) * (0.4 + k * 1.3)
    if (y - s < yAt(FAR_EDGE, x) + 4) continue
    list.push(
      <g key={i}>
        <ellipse cx={f(x)} cy={f(y + s * 0.2)} rx={f(s * 1.7)} ry={f(s * 0.45)} fill="#0e0927" opacity=".5" />
        <path d={`M ${f(x - s)} ${f(y)} A ${f(s)} ${f(s * 0.85)} 0 0 1 ${f(x + s)} ${f(y)} Z`} fill="#1e1646" />
        <path
          d={`M ${f(x - s * 0.8)} ${f(y - s * 0.45)} A ${f(s)} ${f(s * 0.85)} 0 0 1 ${f(x + s * 0.8)} ${f(y - s * 0.45)}`}
          fill="none"
          stroke="#d2c0ff"
          strokeWidth={g2(Math.max(0.6, s * 0.22))}
          opacity=".7"
        />
      </g>,
    )
  }
  return list
}

const BEACON = { x: 872, y: yAt(FAR_EDGE, 872) }

const farCraters = (
  <Svg>
    <defs>
      <clipPath id="nebula-far-clip">
        <path d={far.fill} />
      </clipPath>
      {linear({
        id: 'nebula-plain',
        gradientUnits: 'userSpaceOnUse',
        x1: '0',
        y1: '596',
        x2: '0',
        y2: '860',
        stops: [
          [0, '#4a3886'],
          [0.14, '#32266a'],
          [0.4, '#20184c'],
          [1, '#120c2f'],
        ],
      })}
      {linear({
        id: 'nebula-rim',
        gradientUnits: 'userSpaceOnUse',
        x1: '0',
        y1: '0',
        x2: W,
        y2: '0',
        stops: [
          [0, '#ff9ad6'],
          [0.3, '#ffc0ea'],
          [0.55, '#d2b4ff'],
          [0.8, '#9cc0ff'],
          [1, '#86e0ff'],
        ],
      })}
      {linear({
        id: 'nebula-rim-soft',
        gradientUnits: 'userSpaceOnUse',
        x1: '0',
        y1: '0',
        x2: W,
        y2: '0',
        stops: [
          [0, '#ffa6dc', 0.9],
          [0.2, '#ffc4ec', 0.75],
          [0.38, '#e6ccff', 0.32],
          [0.52, '#d6b8ff', 0.22],
          [0.66, '#b4c8ff', 0.4],
          [0.82, '#9ccaff', 0.78],
          [1, '#86e0ff', 0.9],
        ],
      })}
      {linear({
        id: 'nebula-bowl',
        x1: '0',
        y1: '0',
        x2: '0',
        y2: '1',
        stops: [
          [0, '#08051c'],
          [0.5, '#140d34'],
          [1, '#2e235f'],
        ],
      })}
      {linear({
        id: 'nebula-crater-lip',
        x1: '0',
        y1: '0',
        x2: '1',
        y2: '0',
        stops: [
          [0, '#cdb2ff', 0],
          [0.5, '#e6d4ff', 0.7],
          [1, '#a9c6ff', 0],
        ],
      })}
      {radial({ id: 'nebula-haze', stops: soft('#b89cff', 0.45) })}
      {linear({
        id: 'nebula-plain-wash',
        x1: '0',
        y1: '0',
        x2: '1',
        y2: '0',
        stops: [
          [0, '#ff7fc8', 0.14],
          [0.3, '#ff9ad6', 0.06],
          [0.55, '#9b7cff', 0],
          [0.8, '#5ab4ff', 0.08],
          [1, '#5ad8ff', 0.14],
        ],
      })}
      {radial({
        id: 'nebula-swell',
        cy: '0.35',
        stops: [
          [0, '#c9b0ff', 0.13],
          [0.5, '#a88cff', 0.06],
          [1, '#a88cff', 0],
        ],
      })}
    </defs>
    <path d={far.fill} fill="url(#nebula-plain)" />
    {/* nebula light wrapping over the horizon onto the plain */}
    <g clipPath="url(#nebula-far-clip)" fill="none" stroke="url(#nebula-rim)">
      <path d={far.line} strokeWidth="26" opacity=".07" />
      <path d={far.line} strokeWidth="10" opacity=".12" />
    </g>
    <g clipPath="url(#nebula-far-clip)">
      <rect x={-PAD} y="560" width={W + 2 * PAD} height="360" fill="url(#nebula-plain-wash)" />
      {SWELLS.map(([x, y, rx, ry], i) => (
        <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill="url(#nebula-swell)" />
      ))}
    </g>
    {/* an old, eroded basin: a shallow bowl with a long lit far rim */}
    <ellipse cx="900" cy="716" rx="330" ry="34" fill="url(#nebula-bowl)" opacity=".45" />
    <path d="M 572 716 A 330 34 0 0 1 1228 716" fill="none" stroke="url(#nebula-crater-lip)" strokeWidth="1.6" opacity=".8" />
    {farCraterList(17, 34).map((c, i) => crater(c, i))}
    {pebbles(37, 46)}
    <path d={far.line} fill="none" stroke="url(#nebula-rim-soft)" strokeWidth="5" opacity=".14" />
    <path d={far.line} fill="none" stroke="url(#nebula-rim-soft)" strokeWidth="1.1" opacity=".75" />
    {/* thin dust hanging over the plain */}
    {[
      [300, 646, 380, 16, 34, -6],
      [880, 656, 420, 14, 41, -20],
      [1300, 668, 300, 12, 29, -12],
    ].map(([x, y, rx, ry, d, dl]) => (
      <ellipse
        key={x}
        className="nebula-haze"
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        fill="url(#nebula-haze)"
        style={{ animationDuration: `${d}s`, animationDelay: `${dl}s` }}
      />
    ))}
    {/* a lone beacon mast on a far rim */}
    <path
      d={`M ${BEACON.x} ${f(BEACON.y + 2)} L ${BEACON.x} ${f(BEACON.y - 20)} M ${BEACON.x - 4} ${f(BEACON.y + 2)} L ${BEACON.x} ${f(BEACON.y - 12)} L ${BEACON.x + 4} ${f(BEACON.y + 2)}`}
      stroke="#1a1240"
      strokeWidth="1.3"
      fill="none"
    />
    <g className="nebula-beacon">
      <circle cx={BEACON.x} cy={f(BEACON.y - 21)} r="7" fill="#ff4f7a" opacity=".3" />
      <circle cx={BEACON.x} cy={f(BEACON.y - 21)} r="1.7" fill="#ffa0b6" />
    </g>
  </Svg>
)

/* ---------- 6 · moon ridge ---------- */

const RIDGE = [
  [-240, 690],
  [-80, 660],
  [60, 636],
  [150, 632],
  [230, 650],
  [330, 696],
  [460, 748],
  [610, 780],
  [770, 790],
  [920, 776],
  [1050, 750],
  [1160, 718],
  [1250, 690],
  [1330, 676],
  [1420, 670],
  [1560, 680],
  [1700, 696],
]
const RIDGE_EDGE = rugged(9, (x) => spline(RIDGE, x), 0.075, 36)
const ridge = edgeShapes(RIDGE_EDGE)

const NEAR_CRATERS = [
  // [x, y, rx, ry, k]
  [140, 706, 84, 14, 1.2],
  [1280, 744, 72, 13, 1.2],
  [520, 836, 70, 13, 1.4],
  [1060, 820, 62, 11, 1.4],
  [790, 868, 130, 22, 1.6],
]
const BOULDERS = [
  // [x, r, seed, sink]
  [362, 34, 3, 0.55],
  [408, 14, 4, 0.45],
  [1118, 40, 5, 0.6],
  [1168, 16, 6, 0.45],
  [690, 10, 7, 0.45],
  [1372, 20, 8, 0.5],
  [246, 11, 2, 0.45],
]
const ICE = [
  [104, 650, 4.2],
  [262, 668, 5.1],
  [560, 774, 3.7],
  [868, 790, 6],
  [990, 768, 4.6],
  [1212, 716, 5.5],
  [1366, 688, 3.9],
  [640, 812, 6.8],
]

const moonRidge = (
  <Svg>
    <defs>
      <clipPath id="nebula-ridge-clip">
        <path d={ridge.fill} />
      </clipPath>
      {linear({
        id: 'nebula-ridge',
        gradientUnits: 'userSpaceOnUse',
        x1: '0',
        y1: '630',
        x2: '0',
        y2: '900',
        stops: [
          [0, '#110b2b'],
          [0.3, '#0b0720'],
          [1, '#05030e'],
        ],
      })}
      {linear({
        id: 'nebula-rim-near',
        gradientUnits: 'userSpaceOnUse',
        x1: '0',
        y1: '0',
        x2: W,
        y2: '0',
        stops: [
          [0, '#ffa6dc', 0.95],
          [0.2, '#ffc4ec', 0.8],
          [0.38, '#e6ccff', 0.34],
          [0.52, '#d6b8ff', 0.24],
          [0.66, '#b4c8ff', 0.42],
          [0.82, '#9ccaff', 0.8],
          [1, '#86e0ff', 0.95],
        ],
      })}
      {linear({
        id: 'nebula-near-bowl',
        x1: '0',
        y1: '0',
        x2: '0',
        y2: '1',
        stops: [
          [0, '#030209'],
          [0.6, '#0a0620'],
          [1, '#1d1544'],
        ],
      })}
      {linear({
        id: 'nebula-near-lip',
        x1: '0',
        y1: '0',
        x2: '1',
        y2: '0',
        stops: [
          [0, '#d6b4ff', 0],
          [0.5, '#f0dcff', 0.55],
          [1, '#a8c8ff', 0],
        ],
      })}
    </defs>
    <path d={ridge.fill} fill="url(#nebula-ridge)" />
    {/* rim light wrapping a little way over the crest */}
    <g clipPath="url(#nebula-ridge-clip)" fill="none" stroke="url(#nebula-rim-near)">
      <path d={ridge.line} strokeWidth="36" opacity=".08" />
      <path d={ridge.line} strokeWidth="14" opacity=".12" />
    </g>
    {NEAR_CRATERS.map((c, i) => crater(c, i, true))}
    <path d={ridge.line} fill="none" stroke="url(#nebula-rim-near)" strokeWidth="6" opacity=".16" />
    <path d={ridge.line} fill="none" stroke="url(#nebula-rim-near)" strokeWidth="1.7" />
    {BOULDERS.map(([x, rr, seed, sink]) => (
      <g key={x} transform={`translate(${x} ${f(yAt(RIDGE_EDGE, x) + rr * sink)})`}>
        {rock(seed, rr, {
          base: '#181236',
          glow: x < 760 ? '#ff9ad6' : '#8fb8ff',
          rim: x < 760 ? '#ffc4ec' : '#b4d4ff',
          light: [x < 760 ? -0.3 : 0.3, -0.95],
          edge: 0.7,
        })}
      </g>
    ))}
    {ICE.map(([x, y, d], i) => (
      <g
        key={i}
        className="nebula-glint"
        style={{
          animationDuration: `${d}s`,
          animationDelay: `${(-i * 1.9).toFixed(1)}s`,
        }}
      >
        <path d={star4(x, y, 6, 0.7)} fill="#f4e8ff" />
        <circle cx={x} cy={y} r="1.3" fill="#fff" />
      </g>
    ))}
  </Svg>
)

/* ---------- 7 · drifting rocks ---------- */

const PINK = { glow: '#ff8fd0', rim: '#ffc4ec', kick: '#8fc4ff' }
const BLUE = { glow: '#7fb4ff', rim: '#bfe4ff', kick: '#ff9ad6' }
const ROCKS = [
  // [x, y, r, seed, spin?, tumble s, float s, light dir, palette]
  [92, 92, 60, 41, false, 23, 17, [0.63, 0.78], PINK],
  [1306, 172, 26, 43, false, 19, 13, [-0.58, 0.82], BLUE],
  [1352, 596, 16, 47, true, 64, 15, [-0.9, -0.42], BLUE],
  [566, 520, 12, 53, true, 48, 11, [-0.88, -0.47], PINK],
  [906, 612, 8, 59, true, 36, 9, [0.92, -0.4], BLUE],
  [990, 86, 10, 61, true, 55, 12, [-0.6, 0.8], PINK],
  [418, 240, 6, 67, true, 40, 10, [-0.25, 0.97], PINK],
]

const drifting = (
  <Svg>
    {ROCKS.map(([x, y, rr, seed, spin, ts, fs, light, pal], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <g
          className="nebula-float"
          style={{
            animationDuration: `${fs}s`,
            animationDelay: `${-i * 3.1}s`,
          }}
        >
          <g
            className={spin ? 'nebula-spin' : 'nebula-rock'}
            style={{
              animationDuration: `${ts}s`,
              animationDelay: `${-i * 5.3}s`,
              animationDirection: spin && i % 2 ? 'reverse' : undefined,
            }}
          >
            {rock(seed, rr, {
              n: rr > 30 ? 14 : rr > 14 ? 11 : 8,
              pits: rr > 40 ? 4 : rr > 20 ? 2 : 0,
              light,
              ...pal,
            })}
          </g>
        </g>
      </g>
    ))}
  </Svg>
)

/* ---------- 8 · space dust ---------- */

function dust(seed, count) {
  const r = rng(seed)
  const tints = ['#ffd6f2', '#e6dcff', '#bfeaff', '#fff4fb']
  return Array.from({ length: count }, (_, i) => {
    const x = r() * W
    const y = 60 + r() * 780
    const s = 1 + r() * 1.7
    const dur = 16 + r() * 18
    const c = tints[i % 4]
    return (
      <g
        key={i}
        className={`nebula-dust nebula-dust-${'abc'[i % 3]}`}
        style={{
          animationDuration: `${dur.toFixed(1)}s`,
          animationDelay: `${(-r() * dur).toFixed(1)}s`,
        }}
      >
        <circle cx={f(x)} cy={f(y)} r={g2(s * 6)} fill="url(#nebula-mote)" />
        <circle cx={f(x)} cy={f(y)} r={g2(s)} fill={c} />
      </g>
    )
  })
}
function bokeh(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const dur = 26 + r() * 20
    return (
      <circle
        key={i}
        className="nebula-bokeh"
        cx={f(80 + r() * (W - 160))}
        cy={f(140 + r() * 680)}
        r={f(16 + r() * 22)}
        fill="url(#nebula-bokeh)"
        style={{
          animationDuration: `${dur.toFixed(1)}s`,
          animationDelay: `${(-r() * dur).toFixed(1)}s`,
        }}
      />
    )
  })
}

const spaceDust = (
  <Svg>
    <defs>
      {radial({
        id: 'nebula-bokeh',
        stops: [
          [0, '#ffd9f4', 0.1],
          [0.6, '#e6d0ff', 0.08],
          [1, '#e6d0ff', 0],
        ],
      })}
      {radial({ id: 'nebula-mote', stops: soft('#ffd0f0', 0.6) })}
    </defs>
    {bokeh(83, 6)}
    {dust(89, 34)}
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'nebula',
  name: 'Nebula Drift',
  tag: 'Deep space',
  accent: '#9b8cff',
  accent2: '#ff9bd0',
  ink: '#5b45d6',
  glow: '#b9adff',
  clockColor: '#f3eeff',
  sky: 'radial-gradient(70% 60% at 26% 46%,#2a1252 0%,rgba(42,18,82,0) 70%),radial-gradient(60% 50% at 76% 64%,#12245c 0%,rgba(18,36,92,0) 70%),linear-gradient(180deg,#04030c 0%,#080620 36%,#100a32 66%,#170e3c 100%)',
  layers: [
    { name: 'Deep sky', depth: 0, sky: true, el: deepSky },
    { name: 'Nebula clouds', depth: 0.08, el: nebula },
    { name: 'Ringed planet', depth: 0.2, el: planet },
    { name: 'Depth clock', depth: 0.38, clock: true },
    { name: 'Near moon & station', depth: 0.5, el: nearMoon },
    { name: 'Far craters', depth: 0.66, el: farCraters },
    { name: 'Moon ridge', depth: 0.9, el: moonRidge },
    { name: 'Drifting rocks', depth: 1.1, el: drifting },
    { name: 'Space dust', depth: 1.3, el: spaceDust },
  ],
}
