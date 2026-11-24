// Ember Dunes — the last ten minutes of a desert sunset. A huge sun sinks into
// a V of knife-edged dunes, its lower rim wavering in the heat. The first stars
// and a thin moon come out in the violet; cloud streaks glow from below. A dust
// devil wanders past a sandstone arch, birds head home, a fennec fox watches
// from the tallest crest, and sand streams off every ridge in the wind.

import './dunes.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- shared helpers ---------- */

const SUN = { x: 740, y: 600, r: 150 }
const BOTTOM = H + 60

const t2 = (n) => n.toFixed(2)
const anim = (dur, delay) => ({ animationDuration: `${t2(dur)}s`, animationDelay: `${t2(delay)}s` })

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a, b, t) => {
  const A = rgb(a)
  const B = rgb(b)
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

const P = (p) => `${f(p[0])} ${f(p[1])}`
const C = (s) => ` C ${P(s[1])}, ${P(s[2])}, ${P(s[3])}`
const bez = (t, a, b, c, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d

// Soft ridge through points with level tangents (far dunes).
function softSegs(pts) {
  return pts.slice(0, -1).map((p, i) => {
    const q = pts[i + 1]
    const mx = (p[0] + q[0]) / 2
    return [p, [mx, p[1]], [mx, q[1]], q]
  })
}

// Dune crest through alternating valley / peak points. The wind blows left to
// right, so each dune climbs a gentle windward back, rolls over a sharp brink
// and drops down a steep slip face into the next valley.
function crestSegs(pts, k = 1) {
  return pts.slice(0, -1).map((p, i) => {
    const q = pts[i + 1]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    return dy < 0
      ? [p, [p[0] + dx * 0.42, p[1]], [q[0] - dx * 0.3, q[1] - dy * 0.11], q]
      : [p, [p[0] + dx * 0.12, p[1] + dy * 0.3 * k], [q[0] - dx * 0.5, q[1]], q]
  })
}

const line = (segs) => `M ${P(segs[0][0])}${segs.map(C).join('')}`
const body = (segs) => {
  const a = segs[0][0]
  const b = segs[segs.length - 1][3]
  return `M ${f(a[0])} ${BOTTOM} L ${P(a)}${segs.map(C).join('')} L ${f(b[0])} ${BOTTOM} Z`
}

// y of a crest at x (bisection on the cubic's x(t)).
function yAt(segs, x) {
  for (const s of segs) {
    if (x < s[0][0] || x > s[3][0]) continue
    let lo = 0
    let hi = 1
    for (let k = 0; k < 26; k++) {
      const t = (lo + hi) / 2
      if (bez(t, s[0][0], s[1][0], s[2][0], s[3][0]) < x) lo = t
      else hi = t
    }
    return bez(lo, s[0][1], s[1][1], s[2][1], s[3][1])
  }
  return segs[segs.length - 1][3][1]
}

// Part of a cubic segment between t0 and t1 (de Casteljau).
function sub(s, t0, t1) {
  const split = (seg, t) => {
    const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const [p0, p1, p2, p3] = seg
    const a = l(p0, p1)
    const b = l(p1, p2)
    const c = l(p2, p3)
    const d = l(a, b)
    const e = l(b, c)
    const m = l(d, e)
    return [
      [p0, a, d, m],
      [m, e, c, p3],
    ]
  }
  const right = split(s, t0)[1]
  return split(right, (t1 - t0) / (1 - t0))[0]
}

// One face of a dune under peak i: the crest from the peak to the valley on
// `side` (+1 right, -1 left), closed by a curved edge that drops from the brink
// and sweeps back to the valley. `depth` is how far the edge falls.
function face(segs, i, side, depth) {
  if (side > 0) {
    const s = segs[i]
    const [p, q] = [s[0], s[3]]
    const w = q[0] - p[0]
    const D = depth ?? (q[1] - p[1]) * 0.8 + 40
    return `M ${P(p)}${C(s)} C ${f(q[0] - w * 0.42)} ${f(q[1] + D * 0.22)}, ${f(p[0] + w * 0.07)} ${f(p[1] + D)}, ${P(p)} Z`
  }
  const s = segs[i - 1]
  const [q, p] = [s[0], s[3]]
  const w = p[0] - q[0]
  const D = depth ?? (q[1] - p[1]) * 0.8 + 40
  return `M ${P(q)}${C(s)} C ${f(p[0] - w * 0.07)} ${f(p[1] + D)}, ${f(q[0] + w * 0.42)} ${f(q[1] + D * 0.22)}, ${P(q)} Z`
}

// Wind ripples on a slope: smooth lines that follow the crest down the face.
function ripples(seed, seg, n, gap) {
  const r = rng(seed)
  let d = ''
  for (let j = 0; j < n; j++) {
    const t0 = 0.1 + r() * 0.25
    const t1 = Math.min(0.94, t0 + 0.3 + r() * 0.3)
    const off = gap * (j + 1) + (r() - 0.5) * gap * 0.3
    const pts = Array.from({ length: 5 }, (_, k) => {
      const t = t0 + ((t1 - t0) * k) / 4
      const bow = Math.sin((Math.PI * k) / 4) * gap * 0.35
      return [bez(t, seg[0][0], seg[1][0], seg[2][0], seg[3][0]), bez(t, seg[0][1], seg[1][1], seg[2][1], seg[3][1]) + off + bow]
    })
    d += `M ${P(pts[0])} Q ${P(pts[1])} ${P(pts[2])} T ${P(pts[4])} `
  }
  return d
}

// A horizontal gradient that peaks under the sun: crest rims glow brightest
// where they are backlit.
function rimGradient(id, color, lo = 0.18) {
  const at = (SUN.x + PAD) / (W + 2 * PAD)
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={-PAD} y1="0" x2={W + PAD} y2="0">
      <stop offset="0" stopColor={color} stopOpacity={lo} />
      <stop offset={t2(at - 0.26)} stopColor={color} stopOpacity={t2(lo + 0.22)} />
      <stop offset={t2(at)} stopColor={color} stopOpacity="1" />
      <stop offset={t2(at + 0.26)} stopColor={color} stopOpacity={t2(lo + 0.22)} />
      <stop offset="1" stopColor={color} stopOpacity={lo} />
    </linearGradient>
  )
}

// A long tapered lens: cloud streaks, dust bands, sand veils.
const lens = (x, y, L, T) =>
  `M ${f(x - L / 2)} ${f(y)} C ${f(x - L * 0.26)} ${f(y - T * 1.15)}, ${f(x + L * 0.18)} ${f(y - T * 1.25)}, ${f(x + L / 2)} ${f(y - T * 0.15)} C ${f(x + L * 0.2)} ${f(y + T * 0.45)}, ${f(x - L * 0.24)} ${f(y + T * 0.5)}, ${f(x - L / 2)} ${f(y)} Z `

// A vertical fade used for lit and shadowed dune faces.
const fade = (id, color, a, mid, end = 0.8) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={color} stopOpacity={a} />
    <stop offset={mid} stopColor={color} stopOpacity={t2(a * 0.45)} />
    <stop offset={end} stopColor={color} stopOpacity="0" />
  </linearGradient>
)

// Sand blowing off a crest: a soft veil and thin wisps that stretch downwind
// and fade, plus a few loose grains.
function streamers(seed, x, y, n, { dx, dy, dur, len, color, op = 0.75, grains = 0, veil = 0 }) {
  const r = rng(seed)
  const wisps = Array.from({ length: n }, (_, i) => {
    const L = len * (0.55 + r() * 0.7)
    const th = 1.1 + r() * 2
    const sx = x + (r() - 0.6) * 10
    const sy = y - 0.5 - r() * 3
    const d = `M ${f(sx)} ${f(sy)} C ${f(sx + L * 0.25)} ${f(sy - th * 1.2)}, ${f(sx + L * 0.65)} ${f(sy - th * 0.8)}, ${f(sx + L)} ${f(sy - th * 0.6)} C ${f(sx + L * 0.65)} ${f(sy)}, ${f(sx + L * 0.25)} ${f(sy + th * 0.5)}, ${f(sx)} ${f(sy)} Z`
    const D = dur * (0.8 + r() * 0.45)
    return (
      <path
        key={`w${i}`}
        className="dunes-blow"
        d={d}
        fill={color}
        style={{
          '--dx': `${f(dx * (0.7 + r() * 0.5))}px`,
          '--dy': `${f(dy * (0.6 + r() * 0.8))}px`,
          '--o': t2(op * (0.6 + r() * 0.4)),
          ...anim(D, -(i / n) * D - r() * 0.4),
        }}
      />
    )
  })
  const bits = Array.from({ length: grains }, (_, i) => {
    const D = dur * (0.6 + r() * 0.4)
    return (
      <circle
        key={`g${i}`}
        className="dunes-grain"
        cx={f(x + (r() - 0.5) * 12)}
        cy={f(y - 1 - r() * 3)}
        r={t2(0.9 + r() * 1.1)}
        fill={color}
        style={{
          '--dx': `${f(dx * (0.8 + r() * 0.7))}px`,
          '--dy': `${f(dy * (0.4 + r() * 1.2))}px`,
          ...anim(D, -r() * D),
        }}
      />
    )
  })
  const plume = veil > 0 && (
    <path
      className="dunes-blow"
      d={lens(x + veil / 2, y - 2.5, veil, veil * 0.07)}
      fill={color}
      style={{
        '--dx': `${f(dx * 0.75)}px`,
        '--dy': `${f(dy * 0.8)}px`,
        '--o': t2(op * 0.5),
        ...anim(dur * 1.5, -r() * dur * 1.5),
      }}
    />
  )
  return (
    <g key={`s${seed}`}>
      {plume}
      {wisps}
      {bits}
    </g>
  )
}

/* ---------- sky plate: stars, moon, shooting stars ---------- */

function stars(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = r() * W
    const y = 16 + Math.pow(r(), 1.5) * 330
    const o = (0.35 + r() * 0.65) * Math.max(0, 1 - y / 360)
    const tw = r() < 0.22
    const dur = 2.6 + r() * 4.2
    return (
      <circle
        key={i}
        className={tw ? 'dunes-twinkle' : undefined}
        cx={f(x)}
        cy={f(y)}
        r={t2(0.55 + r() * 1.05)}
        fill="#fff3ea"
        opacity={t2(o)}
        style={tw ? { '--o': t2(o), ...anim(dur, -r() * dur) } : undefined}
      />
    )
  })
}

const FIRST_STARS = [
  [228, 86, 1, 5.2],
  [486, 156, 0.8, 7.4],
  [1004, 64, 0.9, 6.1],
  [92, 226, 0.7, 8.3],
  [1356, 262, 0.75, 6.8],
  [1072, 212, 1.45, 9.5], // the evening star, below the moon
]

const firstStars = FIRST_STARS.map(([x, y, s, dur], i) => (
  <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
    <g className="dunes-flare" style={anim(dur, -i * 1.7)}>
      <circle r="9" fill="url(#dunes-star-g)" />
      <path d="M -9 0 L 9 0 M 0 -9 L 0 9" stroke="#fff4ec" strokeWidth="0.8" strokeLinecap="round" opacity=".7" />
      <circle r="1.9" fill="#fffaf4" />
    </g>
  </g>
))

const skyPlate = (
  <Svg>
    <defs>
      <radialGradient id="dunes-star-g">
        <stop offset="0" stopColor="#fff2e6" stopOpacity=".75" />
        <stop offset="1" stopColor="#fff2e6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="dunes-moon-glow">
        <stop offset="0" stopColor="#ffe6cf" stopOpacity=".42" />
        <stop offset=".35" stopColor="#f4c6d8" stopOpacity=".14" />
        <stop offset="1" stopColor="#f4c6d8" stopOpacity="0" />
      </radialGradient>
      <mask id="dunes-moon-m">
        <circle cx="0" cy="0" r="23" fill="#fff" />
        <circle cx="7.5" cy="-6.5" r="21.5" fill="#000" />
      </mask>
      <linearGradient id="dunes-shoot-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff8f0" />
        <stop offset="1" stopColor="#fff8f0" stopOpacity="0" />
      </linearGradient>
    </defs>
    {stars(11, 96)}
    {firstStars}
    <g transform="translate(1186 136)">
      <circle className="dunes-moon-glow" r="110" fill="url(#dunes-moon-glow)" />
      <circle r="23" fill="#d9b6e6" opacity=".1" />
      <circle r="23" fill="#ffeacb" mask="url(#dunes-moon-m)" />
    </g>
    {/* two shooting stars on long, unrelated cycles */}
    <g transform="translate(520 70) rotate(-24)">
      <g className="dunes-shoot" style={anim(23, -9)}>
        <rect x="0" y="-0.9" width="120" height="1.8" rx="0.9" fill="url(#dunes-shoot-g)" />
      </g>
    </g>
    <g transform="translate(1360 196) rotate(-17)">
      <g className="dunes-shoot" style={anim(37, -27)}>
        <rect x="0" y="-0.7" width="90" height="1.4" rx="0.7" fill="url(#dunes-shoot-g)" />
      </g>
    </g>
  </Svg>
)

/* ---------- the setting sun ---------- */

// Thin horizontal slices of the sun's lower rim, each wavering on its own:
// the heat shimmer where the disc meets the dunes. [top, bottom, sway px, s]
const MIRAGE = [
  [538, 549, 1.2, 3.4],
  [550.2, 559.5, 1.8, 2.7],
  [560.7, 569, 2.4, 3.1],
  [570.2, 577.8, 3, 2.3],
  [579, 586, 3.6, 2.9],
  [587.2, 593.6, 4.3, 2.1],
  [594.8, 600.6, 5, 2.6],
  [601.8, 607, 5.8, 1.9],
  [608.2, 760, 6.5, 2.4],
]

// [angle, half-width, s]
const RAYS = [
  [-162, 3.2, 9.1],
  [-138, 4.4, 11.4],
  [-114, 3, 8.2],
  [-92, 4.6, 12.6],
  [-68, 3.4, 9.7],
  [-44, 4.2, 10.8],
  [-20, 3, 8.4],
]

const rays = RAYS.map(([a, half, dur], i) => {
  const L = 760
  const p = (deg) => [SUN.x + Math.cos((deg * Math.PI) / 180) * L, SUN.y + Math.sin((deg * Math.PI) / 180) * L]
  const [x1, y1] = p(a - half)
  const [x2, y2] = p(a + half)
  return (
    <path
      key={i}
      className="dunes-ray"
      d={`M ${SUN.x} ${SUN.y} L ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)} Z`}
      fill="url(#dunes-ray-g)"
      style={anim(dur, -i * 2.9)}
    />
  )
})

const sunDisc = (extra = {}) => <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="url(#dunes-disc-g)" {...extra} />

const setSun = (
  <Svg>
    <defs>
      <radialGradient id="dunes-horizon-g">
        <stop offset="0" stopColor="#ffcf8a" stopOpacity=".85" />
        <stop offset=".3" stopColor="#ffa05e" stopOpacity=".5" />
        <stop offset=".65" stopColor="#ff7a5a" stopOpacity=".16" />
        <stop offset="1" stopColor="#ff7a5a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="dunes-halo-g">
        <stop offset="0" stopColor="#fff1cf" stopOpacity=".95" />
        <stop offset=".36" stopColor="#ffd690" stopOpacity=".6" />
        <stop offset=".5" stopColor="#ffb070" stopOpacity=".24" />
        <stop offset=".75" stopColor="#ff8a64" stopOpacity=".07" />
        <stop offset="1" stopColor="#ff8a64" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="dunes-ray-g" gradientUnits="userSpaceOnUse" cx={SUN.x} cy={SUN.y} r="560">
        <stop offset=".25" stopColor="#ffdcaa" stopOpacity=".3" />
        <stop offset=".55" stopColor="#ffc890" stopOpacity=".1" />
        <stop offset="1" stopColor="#ffc890" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="dunes-disc-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff8e4" />
        <stop offset=".34" stopColor="#ffe6a6" />
        <stop offset=".62" stopColor="#ffbe6c" />
        <stop offset=".85" stopColor="#ff9450" />
        <stop offset="1" stopColor="#ff7a44" />
      </linearGradient>
      <clipPath id="dunes-sun-top">
        <rect x={SUN.x - 200} y="0" width="400" height={MIRAGE[0][0]} />
      </clipPath>
      {MIRAGE.map(([a, b], i) => (
        <clipPath key={i} id={`dunes-band-${i}`}>
          <rect x={SUN.x - 200} y={a} width="400" height={t2(b - a)} />
        </clipPath>
      ))}
    </defs>
    <ellipse className="dunes-breathe-slow" cx={SUN.x} cy="616" rx="1150" ry="250" fill="url(#dunes-horizon-g)" />
    <g className="dunes-rays">{rays}</g>
    <circle className="dunes-breathe" cx={SUN.x} cy={SUN.y} r="470" fill="url(#dunes-halo-g)" />
    <circle cx={SUN.x} cy={SUN.y} r={SUN.r + 10} fill="#ffd9a0" opacity=".28" />
    <g clipPath="url(#dunes-sun-top)">{sunDisc()}</g>
    {MIRAGE.map(([, , m, dur], i) => (
      <g key={i} clipPath={`url(#dunes-band-${i})`}>
        {sunDisc({ className: 'dunes-mirage', style: { '--m': `${m}px`, ...anim(dur, -i * 0.7) } })}
      </g>
    ))}
  </Svg>
)

/* ---------- glowing clouds & birds heading home ---------- */

// [cx, cy, length, thickness, warmth 0..1, drift px, drift s]
const CLOUDS = [
  [300, 204, 360, 6, 0.05, 50, 96],
  [1150, 268, 440, 8, 0.14, -60, 120],
  [196, 350, 560, 11, 0.3, 70, 104],
  [1250, 340, 520, 10, 0.3, -64, 88],
  [770, 404, 720, 11, 0.5, 46, 132],
  [1410, 444, 320, 8, 0.55, -40, 76],
  [70, 452, 360, 8, 0.55, 46, 84],
  [560, 492, 440, 8, 0.82, 38, 70],
  [968, 528, 400, 6, 0.92, -44, 82],
]

const clouds = CLOUDS.map(([cx, cy, len, th, t, drift, dur], i) => {
  const r = rng(300 + i * 7)
  const n = 3 + Math.floor(r() * 3)
  const parts = Array.from({ length: n }, (_, k) =>
    k === 0
      ? [cx, cy, len, th]
      : [cx + (r() - 0.5) * len * 0.8, cy + (r() - 0.4) * th * 2.6, len * (0.25 + r() * 0.4), th * (0.4 + r() * 0.55)],
  )
  const bodyC = mix('#3a1554', '#a63c66', t)
  const glowC = mix('#c45290', '#ffd690', t)
  return (
    <g key={i} className="dunes-cloud" style={{ '--dx': `${drift}px`, ...anim(dur, -r() * dur) }}>
      <path d={parts.map(([x, y, L, T]) => lens(x + L * 0.03, y + T * 0.95, L * 0.92, T * 1.15)).join('')} fill={glowC} opacity={t2(0.6 + t * 0.4)} />
      <path d={parts.map(([x, y, L, T]) => lens(x, y, L, T)).join('')} fill={bodyC} opacity={t2(0.84 + t * 0.14)} />
    </g>
  )
})

const BIRD = 'M -11 -2 C -7 -6.5, -3 -5.5, 0 0 C 3 -5.5, 7 -6.5, 11 -2 C 7 -3.4, 3 -1.8, 0 2.6 C -3 -1.8, -7 -3.4, -11 -2 Z'

function flock(seed, members, s) {
  const r = rng(seed)
  return members.map(([x, y], i) => (
    <g key={i} transform={`translate(${x} ${y}) scale(${t2(s * (0.9 + r() * 0.2))})`}>
      <path className="dunes-flap" d={BIRD} fill="#2a0c2e" style={anim(0.82 + r() * 0.3, -r())} />
    </g>
  ))
}

const birds = (
  <>
    <g transform="translate(0 384)">
      <g className="dunes-flock" style={anim(86, -34)}>
        <g className="dunes-flock-bob" style={anim(7, -2)}>
          {flock(51, [[0, 0], [-25, -11], [-24, 12], [-49, -22], [-47, 24], [-73, -32], [-69, 37]], 0.95)}
        </g>
      </g>
    </g>
    <g transform="translate(0 318)">
      <g className="dunes-flock-back" style={anim(128, -20)}>
        <g className="dunes-flock-bob" style={anim(9, -5)}>
          {flock(53, [[0, 0], [18, -8], [20, 9]], 0.6)}
        </g>
      </g>
    </g>
  </>
)

/* ---------- sandstone arch, hoodoos, far dunes & the dust devil ---------- */

const ARCH =
  'M 120 650 C 124 620, 132 596, 140 578 C 146 562, 144 548, 150 534 C 156 520, 166 512, 172 500 C 178 490, 190 484, 204 483 ' +
  'C 222 482, 232 486, 246 484 C 276 479, 306 482, 334 488 C 356 492, 372 496, 384 504 C 394 510, 398 520, 400 532 ' +
  'C 403 548, 410 560, 412 574 C 414 600, 420 626, 428 650 Z ' +
  'M 222 650 C 222 624, 226 600, 232 584 C 238 566, 246 548, 258 534 C 272 520, 292 512, 314 514 C 334 516, 348 526, 356 542 ' +
  'C 362 556, 364 576, 364 600 C 364 620, 366 636, 368 650 Z'
const ARCH_RIM =
  'M 222 650 C 222 624, 226 600, 232 584 C 238 566, 246 548, 258 534 ' +
  'M 334 488 C 356 492, 372 496, 384 504 C 394 510, 398 520, 400 532 C 403 548, 410 560, 412 574 C 414 600, 420 626, 428 650'
const BUTTE_L =
  'M -220 650 L -220 568 C -200 566, -170 564, -150 562 C -140 556, -134 548, -124 546 L -60 543 C -44 543, -40 548, -36 552 ' +
  'C -30 558, -24 562, -12 566 C 18 576, 52 590, 82 602 C 104 612, 116 626, 124 650 Z'
const HOODOOS =
  'M 1258 650 L 1264 612 L 1262 596 L 1270 584 L 1268 566 L 1276 556 L 1274 536 L 1280 526 L 1278 508 L 1272 500 L 1274 492 ' +
  'L 1284 486 L 1300 485 L 1312 489 L 1314 496 L 1306 502 L 1304 514 L 1308 526 L 1304 540 L 1308 556 L 1306 572 L 1312 586 ' +
  'L 1314 606 L 1320 628 L 1326 650 Z ' +
  'M 1324 650 L 1330 620 L 1328 604 L 1336 592 L 1334 572 L 1340 560 L 1338 546 L 1344 536 L 1354 534 L 1360 540 L 1358 556 ' +
  'L 1364 568 L 1362 586 L 1368 600 L 1372 626 L 1378 650 Z ' +
  'M 1380 650 L 1386 624 L 1384 610 L 1390 598 L 1392 584 L 1400 578 L 1408 582 L 1410 596 L 1414 612 L 1420 632 L 1424 650 Z ' +
  'M 1416 650 C 1434 618, 1450 592, 1468 574 L 1480 558 C 1500 552, 1560 548, 1620 548 L 1634 560 C 1646 570, 1664 578, 1680 584 L 1680 650 Z'
const HOODOO_RIM =
  'M 1258 650 L 1264 612 L 1262 596 L 1270 584 L 1268 566 L 1276 556 L 1274 536 L 1280 526 L 1278 508 L 1272 500 L 1274 492 L 1284 486 ' +
  'M 1324 650 L 1330 620 L 1328 604 L 1336 592 L 1334 572 L 1340 560 L 1338 546 L 1344 536 L 1354 534 ' +
  'M 1380 650 L 1386 624 L 1384 610 L 1390 598 L 1392 584 L 1400 578 ' +
  'M 1416 650 C 1434 618, 1450 592, 1468 574 L 1480 558'
const ARCH_STRATA =
  'M 138 584 L 170 588 M 132 610 L 176 614 M 152 540 L 190 536 M 372 560 L 404 556 M 380 592 L 414 588 M 200 494 L 236 492'
const HOODOO_STRATA = 'M 1270 572 L 1300 574 M 1268 608 L 1308 610 M 1338 576 L 1360 578 M 1388 612 L 1412 614 M 1490 572 L 1640 568 M 1474 598 L 1670 594'

const farBack = softSegs([[-220, 604], [80, 588], [330, 610], [560, 596], [760, 606], [980, 590], [1200, 602], [1440, 586], [1660, 600]])
const farFront = softSegs([[-220, 630], [140, 616], [420, 628], [700, 607], [900, 618], [1150, 605], [1420, 624], [1660, 612]])

// A dust devil: a tapering funnel with bands of dust whirling across it. It
// spins up beside the arch, wanders across it and dies away.
const DEVIL_BODY = 'M -4 0 C -5 -22, -9 -50, -15 -76 C -20 -98, -30 -116, -38 -130 C -18 -140, 20 -140, 40 -130 C 30 -114, 20 -96, 14 -76 C 8 -50, 5 -22, 4 0 Z'
const devilWidth = (y) => 4 + Math.pow(-y / 130, 1.6) * 34

const DEVIL_BANDS = [
  [-9, 1.6, -6, 1],
  [-24, 2.2, 8, 0],
  [-37, 2, -10, 1],
  [-55, 2.8, 6, 1],
  [-71, 2.4, -7, 0],
  [-92, 3.2, 9, 1],
  [-112, 3, -5, 1],
]

const devil = (() => {
  const r = rng(77)
  const bands = DEVIL_BANDS.map(([y, th, tilt, light], k) => {
    const w = devilWidth(y) * (1 + r() * 0.35)
    const dur = 0.9 + r() * 0.9
    return (
      <g key={k} transform={`rotate(${tilt} 0 ${y})`}>
        <path
          className="dunes-swirl"
          d={lens(0, y, w * 2.1, th)}
          fill={light ? '#ffc6a4' : '#8a3a62'}
          opacity={t2(light ? 0.72 - k * 0.05 : 0.5)}
          style={{ '--a': `${f(1.6 + k * 1.4)}px`, ...anim(dur, -k * 0.31) }}
        />
      </g>
    )
  })
  return (
    <g transform="translate(0 640) scale(1.15)">
      <g className="dunes-devil" style={anim(72, -24)}>
        <ellipse className="dunes-skirt" cx="0" cy="-3" rx="32" ry="9" fill="url(#dunes-skirt-g)" style={anim(2.6, -1)} />
        <g className="dunes-lean" style={anim(5.5, -2)}>
          <path d={DEVIL_BODY} fill="url(#dunes-devil-g)" transform="scale(1.55 1.04)" opacity=".45" />
          <path d={DEVIL_BODY} fill="url(#dunes-devil-g)" />
          {bands}
        </g>
      </g>
    </g>
  )
})()

const farLayer = (
  <Svg>
    <defs>
      <linearGradient id="dunes-rock-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#82305f" />
        <stop offset="1" stopColor="#aa4a6c" />
      </linearGradient>
      <linearGradient id="dunes-arch-lit" x1="0" y1="0" x2="1" y2="0">
        <stop offset=".45" stopColor="#d6607a" stopOpacity="0" />
        <stop offset="1" stopColor="#d6607a" stopOpacity=".6" />
      </linearGradient>
      <linearGradient id="dunes-rock-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f08068" stopOpacity="0" />
        <stop offset="1" stopColor="#f08068" stopOpacity=".62" />
      </linearGradient>
      <linearGradient id="dunes-farback-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d66470" />
        <stop offset=".25" stopColor="#bc5070" />
        <stop offset="1" stopColor="#9c3c68" />
      </linearGradient>
      <linearGradient id="dunes-farfront-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b4486a" />
        <stop offset=".22" stopColor="#9a3a64" />
        <stop offset="1" stopColor="#7a2a5a" />
      </linearGradient>
      <linearGradient id="dunes-devil-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b25a74" stopOpacity="0" />
        <stop offset=".3" stopColor="#b25a74" stopOpacity=".42" />
        <stop offset="1" stopColor="#a04c6c" stopOpacity=".72" />
      </linearGradient>
      <radialGradient id="dunes-skirt-g">
        <stop offset="0" stopColor="#b8607a" stopOpacity=".75" />
        <stop offset="1" stopColor="#b8607a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="dunes-spill-g">
        <stop offset="0" stopColor="#ffc07e" stopOpacity=".85" />
        <stop offset=".4" stopColor="#ff9a6a" stopOpacity=".35" />
        <stop offset="1" stopColor="#ff9a6a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="dunes-haze-g">
        <stop offset="0" stopColor="#ff9c78" stopOpacity=".5" />
        <stop offset="1" stopColor="#ff9c78" stopOpacity="0" />
      </radialGradient>
      {rimGradient('dunes-farrim', '#ffc28a', 0.3)}
      <clipPath id="dunes-far-clip">
        <path d={body(farBack)} />
        <path d={body(farFront)} />
      </clipPath>
    </defs>
    {/* sandstone: a natural arch on the left, hoodoos on the right */}
    <path d={BUTTE_L} fill="url(#dunes-rock-g)" />
    <path d={ARCH} fill="url(#dunes-rock-g)" fillRule="evenodd" />
    <path d={ARCH} fill="url(#dunes-arch-lit)" fillRule="evenodd" />
    <path d={ARCH_STRATA} stroke="#5e1a4c" strokeWidth="2" strokeLinecap="round" opacity=".3" />
    <path d={ARCH_RIM} stroke="#ffa07c" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
    <g transform="translate(-36 0)">
      <path d={HOODOOS} fill="url(#dunes-rock-g)" />
      <path d={HOODOO_STRATA} stroke="#5e1a4c" strokeWidth="2" strokeLinecap="round" opacity=".3" />
      <path d={HOODOO_RIM} stroke="#ffa07c" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
    </g>
    <rect x={-PAD} y="510" width={W + 2 * PAD} height="120" fill="url(#dunes-rock-haze)" />
    {/* far dunes with the dust devil wandering between the two ridges */}
    <path d={body(farBack)} fill="url(#dunes-farback-g)" />
    <path d={line(farBack)} stroke="url(#dunes-farrim)" strokeWidth="1.6" fill="none" />
    {devil}
    <path d={body(farFront)} fill="url(#dunes-farfront-g)" />
    <path d={line(farFront)} stroke="url(#dunes-farrim)" strokeWidth="2" fill="none" />
    <path
      d={line(softSegs([[-220, 650], [120, 638], [380, 652], [640, 634], [880, 646], [1120, 630], [1400, 648], [1660, 636]])) + ' ' + line(softSegs([[-220, 676], [200, 664], [520, 680], [820, 662], [1100, 676], [1420, 660], [1660, 672]]))}
      stroke="#e8807a"
      strokeWidth="1.4"
      fill="none"
      opacity=".35"
    />
    <g clipPath="url(#dunes-far-clip)">
      <ellipse cx={SUN.x} cy="612" rx="420" ry="70" fill="url(#dunes-spill-g)" />
    </g>
    <ellipse className="dunes-haze" cx="520" cy="640" rx="760" ry="30" fill="url(#dunes-haze-g)" style={{ '--dx': '90px', ...anim(46, -12) }} />
  </Svg>
)

/* ---------- rolling mid dunes ---------- */

const MID = [[-220, 690], [-40, 642], [180, 700], [400, 634], [600, 694], [790, 674], [930, 704], [1180, 638], [1380, 700], [1560, 644], [1660, 672]]
const midSegs = crestSegs(MID, 1)
const MID_PEAKS = [1, 3, 5, 7, 9]

const midLayer = (
  <Svg>
    <defs>
      <linearGradient id="dunes-mid-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5e1a52" />
        <stop offset=".3" stopColor="#4a1448" />
        <stop offset="1" stopColor="#300c3a" />
      </linearGradient>
      {fade('dunes-midlit-g', '#de5e6a', 0.95, 0.32)}
      {fade('dunes-midshade-g', '#1c0624', 0.7, 0.4)}
      {rimGradient('dunes-midrim', '#ffb27a', 0.35)}
      <clipPath id="dunes-mid-clip">
        <path d={body(midSegs)} />
      </clipPath>
    </defs>
    <path d={body(midSegs)} fill="url(#dunes-mid-g)" />
    {MID_PEAKS.map((i) => {
      const side = MID[i][0] < SUN.x ? 1 : -1
      return (
        <g key={i}>
          <path d={face(midSegs, i, side)} fill="url(#dunes-midlit-g)" />
          <path d={face(midSegs, i, -side, 50)} fill="url(#dunes-midshade-g)" />
        </g>
      )
    })}
    <g clipPath="url(#dunes-mid-clip)">
      <ellipse cx={SUN.x} cy="690" rx="520" ry="80" fill="url(#dunes-spill-g)" opacity=".45" />
    </g>
    <path d={ripples(5, midSegs[3], 3, 10) + ripples(6, midSegs[6], 3, 10)} stroke="#d86a70" strokeWidth="1.2" fill="none" opacity=".24" strokeLinecap="round" />
    <path d={line(midSegs)} stroke="url(#dunes-midrim)" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
    {streamers(101, 400, 634, 2, { dx: 70, dy: -12, dur: 4.6, len: 46, color: '#ffd8b4', op: 0.7, veil: 60 })}
    {streamers(102, 790, 674, 2, { dx: 64, dy: -10, dur: 5.2, len: 40, color: '#ffd2a2', op: 0.7 })}
    {streamers(103, 1180, 638, 2, { dx: 72, dy: -12, dur: 4.9, len: 46, color: '#ffd8b4', op: 0.7, veil: 60 })}
    <ellipse className="dunes-haze" cx="760" cy="752" rx="900" ry="40" fill="url(#dunes-haze-g)" opacity=".45" style={{ '--dx': '-110px', ...anim(58, -30) }} />
  </Svg>
)

/* ---------- sculpted near dunes & the fox ---------- */

const NEAR = [[-220, 746], [130, 664], [700, 794], [1130, 574], [1460, 746], [1660, 704]]
const nearSegs = crestSegs(NEAR, 0.8)

// A fennec fox sitting just below the brink, facing the sun. Its paws and
// haunch are fitted to the slope underneath it; the tail drapes over the crest.
const FOX_X = 1098
const FOX_S = 0.95
const FOX_INK = '#1e061e'
const FOX_RIM = '#ffae78'
const FOX_HEAD =
  'M -11 -32 C -13 -33.5, -15 -34.5, -17.5 -35.4 L -27.5 -38.4 C -25 -40.6, -20 -41.4, -15.5 -41.8 C -13.5 -43, -10 -43.5, -7 -43.2 ' +
  'C -3.5 -42.8, -1.5 -40.5, -1.5 -37.5 C -1.5 -35, -4 -33, -7 -32.2 C -8.5 -31.8, -10 -31.6, -11 -32 Z'
const FOX_EAR_F = 'M -12.5 -42.4 C -13.2 -46.5, -14 -51, -14.8 -55.5 C -12 -52.5, -9.5 -48.5, -7 -43 Z'
const FOX_EAR_B = 'M -6.4 -43.2 C -6.2 -47.5, -5.8 -51.5, -4.6 -55.2 C -3 -51.5, -2 -47.5, -2 -41.5 Z'

function Fox() {
  const y0 = yAt(nearSegs, FOX_X)
  const g = (dx) => (yAt(nearSegs, FOX_X + dx * FOX_S) - y0) / FOX_S
  const fd = g(-10) + 1.2
  const rd = g(15) + 1.2
  const ta = g(22)
  const tb = g(34)
  const body =
    `M -10.6 ${f(fd)} L -10 -16 C -11 -22, -13 -27, -12.5 -31 C -11 -34, -6 -37, -2 -37 C 0 -35, 1 -32, 2 -30 ` +
    `C 5 -27, 9 -24, 12 -21 C 17.5 -18, 20 -11, 18.5 -5 C 18 ${f(rd - 2)}, 16.4 ${f(rd - 0.6)}, 13.5 ${f(rd)} ` +
    `L -2 ${f(g(-2) + 1.2)} L -6 ${f(fd)} Z`
  const tail = `M 15 ${f(rd - 7)} C 21 ${f(ta - 9)}, 28 ${f(tb - 8)}, 34 ${f(tb - 3.5)} C 36.5 ${f(tb - 0.5)}, 33 ${f(tb + 1.8)}, 29 ${f(tb + 1.2)} C 24 ${f(ta + 0.8)}, 18 ${f(rd + 0.5)}, 11 ${f(rd)} Z`
  return (
    <g transform={`translate(${f(FOX_X)} ${f(y0)}) scale(${FOX_S})`}>
      <path className="dunes-tail" d={tail} fill={FOX_INK} style={anim(6.5, -2)} />
      <path d={body} fill={FOX_INK} />
      <path d={`M -10.6 ${f(fd)} L -10 -16 C -11 -22, -13 -27, -12.5 -31`} stroke={FOX_RIM} strokeWidth="1" fill="none" opacity=".8" strokeLinecap="round" />
      <g className="dunes-look" style={anim(17, -6)}>
        <path d={FOX_HEAD} fill={FOX_INK} />
        <path d="M -17.5 -35.4 L -27.5 -38.4 C -25 -40.6, -20 -41.4, -15.5 -41.8" stroke={FOX_RIM} strokeWidth="1" fill="none" opacity=".85" strokeLinecap="round" />
        <g className="dunes-ear" style={anim(8.5, -3)}>
          <path d={FOX_EAR_B} fill={FOX_INK} />
        </g>
        <g className="dunes-ear" style={anim(8.5, -3.12)}>
          <path d={FOX_EAR_F} fill={FOX_INK} />
          <path d="M -12.5 -42.4 C -13.2 -46.5, -14 -51, -14.8 -55.5" stroke={FOX_RIM} strokeWidth="1" fill="none" opacity=".85" strokeLinecap="round" />
        </g>
      </g>
    </g>
  )
}

function glints(seed, segs, xs, color) {
  const r = rng(seed)
  return xs.map((x, i) => {
    const y = yAt(segs, x) + 6 + r() * 26
    const w = 6 + r() * 10
    const dur = 3 + r() * 3.5
    return (
      <rect
        key={i}
        className="dunes-glint"
        x={f(x)}
        y={f(y)}
        width={f(w)}
        height="1.6"
        rx="0.8"
        fill={color}
        style={anim(dur, -r() * dur)}
      />
    )
  })
}

const nearLayer = (
  <Svg>
    <defs>
      <linearGradient id="dunes-near-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#420f3e" />
        <stop offset=".35" stopColor="#300b36" />
        <stop offset="1" stopColor="#1c0624" />
      </linearGradient>
      {fade('dunes-nearlit-g', '#b4465e', 0.92, 0.3, 0.85)}
      {fade('dunes-nearshade-g', '#12031a', 0.6, 0.45)}
      {rimGradient('dunes-nearrim', '#ffa868', 0.35)}
      <clipPath id="dunes-near-clip">
        <path d={body(nearSegs)} />
      </clipPath>
    </defs>
    <path d={body(nearSegs)} fill="url(#dunes-near-g)" />
    <path d={face(nearSegs, 1, 1)} fill="url(#dunes-nearlit-g)" />
    <path d={face(nearSegs, 3, -1)} fill="url(#dunes-nearlit-g)" />
    <path d={face(nearSegs, 1, -1, 70)} fill="url(#dunes-nearshade-g)" />
    <path d={face(nearSegs, 3, 1, 120)} fill="url(#dunes-nearshade-g)" />
    <g clipPath="url(#dunes-near-clip)">
      <ellipse cx={SUN.x} cy="796" rx="440" ry="80" fill="url(#dunes-spill-g)" opacity=".3" />
    </g>
    <path
      d={ripples(21, nearSegs[1], 5, 13) + ripples(22, sub(nearSegs[2], 0.1, 0.9), 6, 13)}
      stroke="#d86872"
      strokeWidth="1.4"
      fill="none"
      opacity=".2"
      strokeLinecap="round"
    />
    <path d={line(nearSegs)} stroke="url(#dunes-nearrim)" strokeWidth="2.6" fill="none" strokeLinejoin="round" />
    <path d={line([sub(nearSegs[1], 0, 0.5)])} stroke="#ffc08a" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".55" />
    <path d={line([sub(nearSegs[2], 0.45, 1)])} stroke="#ffc08a" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".6" />
    {glints(31, nearSegs, [330, 470, 880, 990], '#ffcf9e')}
    <Fox />
    {streamers(201, 132, 665, 4, { dx: 120, dy: -18, dur: 4.2, len: 70, color: '#ffe2c4', op: 0.85, grains: 2, veil: 90 })}
    {streamers(202, 1134, 576, 4, { dx: 130, dy: -20, dur: 4.6, len: 74, color: '#fff0de', op: 0.9, grains: 2, veil: 100 })}
  </Svg>
)

/* ---------- wind-swept foreground crest ---------- */

const FORE = [[-220, 822], [250, 770], [820, 884], [1250, 816], [1660, 856]]
const foreSegs = crestSegs(FORE, 0.9)

function tuft(seed, x, s) {
  const r = rng(seed)
  const y = yAt(foreSegs, x) + 4
  let dark = ''
  let lit = ''
  const blades = 8 + Math.floor(r() * 5)
  for (let b = 0; b < blades; b++) {
    const a = ((-90 + (r() - 0.42) * 84) * Math.PI) / 180
    const len = (24 + r() * 40) * s
    const bx = x + (r() - 0.5) * 8 * s
    const ex = bx + Math.cos(a) * len + len * 0.16
    const ey = y + Math.sin(a) * len
    const seg = `M ${f(bx)} ${f(y)} Q ${f(bx + Math.cos(a) * len * 0.45)} ${f(y + Math.sin(a) * len * 0.62)} ${f(ex)} ${f(ey)} `
    if (r() < 0.36) lit += seg
    else dark += seg
  }
  // two seed stalks
  let heads = ''
  for (let k = 0; k < 2; k++) {
    const hx = x + (k ? 6 : -4) * s
    const len = (48 + r() * 22) * s
    const ex = hx + len * (0.12 + r() * 0.12)
    const ey = y - len
    dark += `M ${f(hx)} ${f(y)} Q ${f(hx + len * 0.02)} ${f(y - len * 0.6)} ${f(ex)} ${f(ey)} `
    heads += `M ${f(ex - 1.6 * s)} ${f(ey + 6 * s)} Q ${f(ex - 2.6 * s)} ${f(ey - 1 * s)} ${f(ex + 0.6 * s)} ${f(ey - 4 * s)} Q ${f(ex + 2 * s)} ${f(ey + 1 * s)} ${f(ex - 1.6 * s)} ${f(ey + 6 * s)} Z `
  }
  const dur = 3.2 + r() * 2.6
  return (
    <g key={seed} className="dunes-tuft" style={anim(dur, -r() * dur)}>
      <path d={dark} stroke="#1a0519" strokeWidth={t2(1.9 * s)} fill="none" strokeLinecap="round" />
      <path d={lit} stroke="#f08a5c" strokeWidth={t2(1.5 * s)} fill="none" strokeLinecap="round" opacity=".85" />
      <path d={heads} fill="#d8774f" />
    </g>
  )
}

const TUFTS = [
  [110, 1.1],
  [196, 1.25],
  [292, 0.95],
  [384, 0.8],
  [1168, 0.85],
  [1262, 1.2],
  [1352, 1],
  [1420, 0.8],
]

const foreLayer = (
  <Svg>
    <defs>
      <linearGradient id="dunes-fore-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#24082a" />
        <stop offset=".4" stopColor="#1a0620" />
        <stop offset="1" stopColor="#110416" />
      </linearGradient>
      {fade('dunes-forelit-g', '#6a1e48', 0.95, 0.35, 0.9)}
    </defs>
    <path d={body(foreSegs)} fill="url(#dunes-fore-g)" />
    <path d={face(foreSegs, 1, 1)} fill="url(#dunes-forelit-g)" />
    <path d={face(foreSegs, 3, -1)} fill="url(#dunes-forelit-g)" />
    <path d={ripples(41, foreSegs[1], 4, 12) + ripples(42, foreSegs[2], 3, 12)} stroke="#7a2a52" strokeWidth="1.6" fill="none" opacity=".5" strokeLinecap="round" />
    <path d={line([sub(foreSegs[1], 0, 0.6)])} stroke="#ff9a62" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".7" />
    <path d={line([sub(foreSegs[2], 0.45, 1), foreSegs[3]])} stroke="#ff9a62" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".5" />
    {TUFTS.map(([x, s], i) => tuft(70 + i, x, s))}
    {streamers(301, 252, 771, 5, { dx: 210, dy: -30, dur: 3.6, len: 110, color: '#ffd6b0', op: 0.85, grains: 3, veil: 140 })}
    {streamers(302, 1252, 817, 4, { dx: 190, dy: -26, dur: 3.9, len: 96, color: '#ffd6b0', op: 0.75, grains: 3, veil: 120 })}
  </Svg>
)

/* ---------- glowing dust in the air ---------- */

function motes(seed, n) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const big = i % 4 === 0
    const dur = (big ? 16 : 10) + r() * 12
    const o = big ? 0.45 + r() * 0.35 : 0.6 + r() * 0.4
    return (
      <circle
        key={i}
        className="dunes-mote"
        cx={f(-140 + r() * (W + 100))}
        cy={f(340 + r() * 520)}
        r={t2(big ? 10 + r() * 12 : 1.3 + r() * 2.1)}
        fill={big ? 'url(#dunes-bokeh-g)' : r() < 0.5 ? '#ffe0b4' : '#ffb67e'}
        style={{
          '--dx': `${f(160 + r() * 200)}px`,
          '--dy': `${f(-40 - r() * 110)}px`,
          '--o': t2(o),
          ...anim(dur, -r() * dur),
        }}
      />
    )
  })
}

const dust = (
  <Svg>
    <defs>
      <radialGradient id="dunes-bokeh-g">
        <stop offset="0" stopColor="#ffd8a8" stopOpacity=".8" />
        <stop offset=".5" stopColor="#ffb884" stopOpacity=".35" />
        <stop offset="1" stopColor="#ffb884" stopOpacity="0" />
      </radialGradient>
    </defs>
    {motes(97, 24)}
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'ember',
  name: 'Ember Dunes',
  tag: 'Last light',
  accent: '#ff7a59',
  accent2: '#ffc58a',
  ink: '#d2432a',
  glow: '#ff9a7a',
  clockColor: '#fff3e6',
  sky: 'linear-gradient(180deg,#150a2c 0%,#250e42 11%,#3e1456 22%,#621c63 33%,#912a69 43%,#c23f67 51%,#e7585c 58%,#fa7a4e 63%,#ff9c50 67.5%,#ffb862 71%,#ffa45a 100%)',
  layers: [
    { name: 'Sky plate', depth: 0, sky: true, el: skyPlate },
    { name: 'Setting sun', depth: 0.08, el: setSun },
    { name: 'Clouds & birds', depth: 0.15, el: <Svg>{clouds}{birds}</Svg> },
    { name: 'Arch & far dunes', depth: 0.25, el: farLayer },
    { name: 'Depth clock', depth: 0.4, clock: true },
    { name: 'Rolling dunes', depth: 0.56, el: midLayer },
    { name: 'Sculpted dunes', depth: 0.84, el: nearLayer },
    { name: 'Windswept crest', depth: 1.1, el: foreLayer },
    { name: 'Glowing dust', depth: 1.3, el: dust },
  ],
}
