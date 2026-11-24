// Firefly Lagoon: a twilight lake. A violet sky over a teal afterglow, a low
// moon veiled by drifting cloud (an owl crosses it now and then), misty
// backlit ridges, a pine shore mirrored in wavering water, a shimmering moon
// path, a lantern rowboat, glowing water lilies, a heron in the shallows,
// swaying cattails and fireflies blinking in their own rhythms.

import './lagoon.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

const SHORE = 636 // the water line, in viewBox units
const MOON = { x: 1084, y: 384, r: 34 }
const BOAT = { x: 500, y: 772 }
const HERON = { x: 1204, y: 832, s: 1 }
const K = 0.86 // reflections are squashed a little
const MIRROR = `translate(0 ${f(SHORE * (1 + K))}) scale(1 ${-K})`
const MOON_T = (MOON.x + PAD) / (W + 2 * PAD) // the moon's x as a 0..1 gradient offset

/* ---------- curve helpers ---------- */

// Uniform Catmull-Rom through pts, as cubic Béziers (open path).
function smooth(pts) {
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

// The same curve as smooth(), sampled into a polyline.
function sample(pts, step = 8) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const n = Math.max(2, Math.round((p2[0] - p1[0]) / step))
    for (let k = 0; k < n; k++) {
      const t = k / n
      const c = (a, b, e, g) => 0.5 * (2 * b + (-a + e) * t + (2 * a - 5 * b + 4 * e - g) * t * t + (-a + 3 * b - 3 * e + g) * t * t * t)
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

const poly = (pts) => `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`
const circ = (x, y, r) => ` M ${f(x - r)} ${f(y)} A ${f(r)} ${f(r)} 0 1 1 ${f(x + r)} ${f(y)} A ${f(r)} ${f(r)} 0 1 1 ${f(x - r)} ${f(y)} Z`

/* ---------- ridges ---------- */

// A smooth ridge of alternating crests and saddles, plus soft shading blobs
// (drawn clipped to the ridge): shadow on the slope facing away from the moon,
// a faint sheen on the slope facing it.
function ridge(seed, base, amp, n) {
  const r = rng(seed)
  const x0 = -PAD - 60
  const span = W + 2 * PAD + 120
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x = x0 + (i * span) / n + (i % n ? (r() - 0.5) * (span / n) * 0.4 : 0)
    const y = base - amp * (i % 2 ? 0.5 + 0.5 * r() : 0.08 + 0.3 * r())
    return [x, y]
  })
  const top = smooth(pts)
  const line = sample(pts)
  const shades = []
  for (let i = 1; i < n; i++) {
    const [px, py] = pts[i]
    if (py > pts[i - 1][1] || py > pts[i + 1][1]) continue
    const away = px < MOON.x ? -1 : 1
    const run = Math.abs(pts[i + away][0] - px)
    const tall = base - py
    shades.push([px + away * run * 0.55, py + tall * 0.55, run * 0.75, tall * 0.85, 0])
    shades.push([px - away * run * 0.28, py + tall * 0.3, run * 0.5, tall * 0.55, 1])
  }
  return { pts, line, top, fill: `${top} L ${W + PAD + 60} ${H + 40} L ${x0} ${H + 40} Z`, shades }
}

const R1 = ridge(14, 616, 176, 12)
const R2 = ridge(31, 640, 118, 14)
const R3 = ridge(47, 652, 64, 18)

// Fine fir tips standing along a ridge crest, so it reads as forest.
function tips(line, seed, lo = 5, hi = 16) {
  const r = rng(seed)
  let d = ''
  for (let i = 0; i < line.length; i += 1) {
    if (r() < 0.35) continue
    const [x, y] = line[i]
    const h = lo + r() * (hi - lo)
    const w = h * 0.36
    d += ` M ${f(x)} ${f(y - h)} L ${f(x + w)} ${f(y + 2)} L ${f(x - w)} ${f(y + 2)} Z`
  }
  return d
}
const R3_TIPS = tips(R3.line, 52)
const R2_TIPS = tips(R2.line, 61, 2.5, 6.5)

const shading = (rd, id) => (
  <g clipPath={`url(#${id})`}>
    {rd.shades.map(([cx, cy, rx, ry, lit], i) => (
      <ellipse key={i} cx={f(cx)} cy={f(cy)} rx={f(rx)} ry={f(ry)} fill={lit ? 'url(#lagoon-sheen-r)' : 'url(#lagoon-shade-r)'} />
    ))}
  </g>
)

/* ---------- far shore forest ---------- */

// Spruces with drooping tiers and round broadleaf clumps along the shore. Every
// sub-shape winds clockwise so overlaps never cancel under the nonzero rule.
// Returns the full silhouette and a simpler one for the reflection.
function forest(seed) {
  const r = rng(seed)
  const base = SHORE + 1
  let mass = ` M ${-PAD} ${SHORE - 3} L ${W + PAD} ${SHORE - 3} L ${W + PAD} ${H} L ${-PAD} ${H} Z`
  let refl = ` M ${-PAD} ${SHORE - 3} L ${W + PAD} ${SHORE - 3} L ${W + PAD} ${SHORE + 4} L ${-PAD} ${SHORE + 4} Z`
  let x = -PAD
  while (x < W + PAD) {
    const g = 0.5 + 0.5 * Math.sin(x * 0.0057 + 1.1) * Math.cos(x * 0.0021 - 0.6)
    let h = 24 + 84 * g + r() * 30
    const y = base - r() * 8
    if (r() < 0.16) {
      // broadleaf: a lumpy dome of small clumps
      const rr = h * 0.24
      const cy = y - h * 0.42
      mass += circ(x, cy + rr * 0.25, rr * 0.95)
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * (1.05 + (k / 6) * 0.9)
        mass += circ(x + Math.cos(a) * rr * 0.78, cy + Math.sin(a) * rr * 0.62, rr * (0.42 + r() * 0.16))
      }
      mass += ` ${poly([[x + 1.5, cy], [x + 1.5, y], [x - 1.5, y], [x - 1.5, cy]])}`
      refl += circ(x - rr * 0.35, cy + rr * 0.1, rr * 0.85) + circ(x + rr * 0.4, cy, rr * 0.8)
      x += rr * (1.4 + r() * 0.9)
      continue
    }
    if (r() < 0.12) h *= 1.45
    const tiers = 5 + Math.floor(r() * 3)
    const w = h * (0.28 + r() * 0.08)
    const top = y - h
    const body = h * 0.9
    const step = body / tiers
    const R = []
    const L = []
    for (let k = 1; k <= tiers; k++) {
      const t = k / tiers
      const yk = top + body * t
      const hw = (w / 2) * (0.22 + 0.78 * t)
      const j = () => 1 + (r() - 0.5) * 0.22
      R.push([x + hw * 0.32, yk - step * 0.6], [x + hw * j(), yk + step * 0.08])
      L.push([x - hw * 0.32, yk - step * 0.6], [x - hw * j(), yk + step * 0.08])
    }
    mass += ` ${poly([[x, top], ...R, [x + 1.6, y], [x - 1.6, y], ...L.reverse()])}`
    refl += ` ${poly([
      [x, top + 3],
      [x + w * 0.3, y - h * 0.5],
      [x + w * 0.16, y - h * 0.5],
      [x + w * 0.46, y - h * 0.08],
      [x - w * 0.46, y - h * 0.08],
      [x - w * 0.16, y - h * 0.5],
      [x - w * 0.3, y - h * 0.5],
    ])}`
    x += w * (0.38 + r() * 0.5)
  }
  return { mass, refl }
}

const FOREST = forest(29)

/* ---------- sky ---------- */

function stars(seed, count) {
  const r = rng(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const x = r() * W
    const y = Math.pow(r(), 1.45) * 560
    const size = 0.45 + Math.pow(r(), 2.6) * 1.5
    const o = (0.3 + r() * 0.7).toFixed(2)
    const tw = r() < 0.08
    const d = (2.6 + r() * 5).toFixed(2)
    const del = (-r() * 8).toFixed(2)
    if (Math.hypot(x - MOON.x, y - MOON.y) < 90) continue
    out.push(
      <circle
        key={i}
        className={tw ? 'lagoon-twinkle' : undefined}
        cx={f(x)}
        cy={f(y)}
        r={size.toFixed(2)}
        fill="#fff"
        fillOpacity={o}
        style={tw ? { animationDuration: `${d}s`, animationDelay: `${del}s` } : undefined}
      />,
    )
  }
  return out
}

const BRIGHT = [
  [148, 92, 1, 4.2],
  [452, 218, 0.8, 5.6],
  [968, 74, 0.9, 3.8],
  [1290, 196, 1.1, 6.4],
  [1372, 58, 0.7, 4.9],
  [262, 352, 0.7, 0],
  [1240, 320, 0.6, 0],
]

const sky = (
  <Svg>
    <defs>
      <radialGradient id="lagoon-star-g">
        <stop offset="0" stopColor="#fff" stopOpacity=".9" />
        <stop offset=".25" stopColor="#e4e0ff" stopOpacity=".35" />
        <stop offset="1" stopColor="#d8d0ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-milky-g">
        <stop offset="0" stopColor="#c8b9ff" stopOpacity=".1" />
        <stop offset=".5" stopColor="#a996f0" stopOpacity=".045" />
        <stop offset="1" stopColor="#a996f0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-glow-low" cx=".5" cy="1" r=".9">
        <stop offset="0" stopColor="#bfe6da" stopOpacity=".35" />
        <stop offset="1" stopColor="#bfe6da" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="230" cy="250" rx="640" ry="150" transform="rotate(-24 230 250)" fill="url(#lagoon-milky-g)" />
    {/* afterglow pooled on the horizon */}
    <ellipse cx="560" cy="640" rx="900" ry="150" fill="url(#lagoon-glow-low)" />
    {stars(58, 150)}
    {BRIGHT.map(([x, y, s, d], i) => (
      <g
        key={i}
        className={d ? 'lagoon-twinkle' : undefined}
        style={d ? { animationDuration: `${d}s`, animationDelay: `${-i * 1.7}s` } : undefined}
      >
        <circle cx={x} cy={y} r={f(9 * s)} fill="url(#lagoon-star-g)" />
        <path d={`M ${x - 7 * s} ${y} L ${x + 7 * s} ${y} M ${x} ${y - 7 * s} L ${x} ${y + 7 * s}`} stroke="#f2efff" strokeOpacity=".55" strokeWidth=".7" />
        <circle cx={x} cy={y} r={f(1.4 * s)} fill="#fff" />
      </g>
    ))}
    <g transform="translate(400 70) rotate(154)">
      <g className="lagoon-shoot" style={{ animationDuration: '23s', animationDelay: '-15s' }}>
        <line x1="-170" y1="0" x2="0" y2="0" stroke="#fff" strokeOpacity=".22" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="-70" y1="0" x2="0" y2="0" stroke="#fff" strokeOpacity=".75" strokeWidth="1.8" strokeLinecap="round" />
        <circle r="2.4" fill="#fff" />
        <circle r="7" fill="url(#lagoon-star-g)" />
      </g>
    </g>
    <g transform="translate(1350 110) rotate(148)">
      <g className="lagoon-shoot" style={{ animationDuration: '41s', animationDelay: '-7s' }}>
        <line x1="-130" y1="0" x2="0" y2="0" stroke="#e6fff6" strokeOpacity=".22" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="-52" y1="0" x2="0" y2="0" stroke="#e6fff6" strokeOpacity=".75" strokeWidth="1.6" strokeLinecap="round" />
        <circle r="2" fill="#fff" />
      </g>
    </g>
  </Svg>
)

/* ---------- moon, clouds, owl ---------- */

// A long, soft stratus bank: overlapping gradient ellipses.
function cloud(cx, cy, s, parts) {
  return parts.map(([dx, dy, rx, ry], i) => (
    <ellipse key={i} cx={f(cx + dx * s)} cy={f(cy + dy * s)} rx={f(rx * s)} ry={f(ry * s)} fill="url(#lagoon-cloud-g)" />
  ))
}

const OWL_WINGS =
  'M -4 -5 C -12 -10, -23 -11, -31 -8 C -36 -6, -37 -1, -34 1 C -32 3, -29 3, -28 2 C -26 4, -23 4, -22 3 C -19 5, -16 5, -15 4 C -11 6, -7 6, -4 5 L 4 5 C 7 6, 11 6, 15 4 C 16 5, 19 5, 22 3 C 23 4, 26 4, 28 2 C 29 3, 32 3, 34 1 C 37 -1, 36 -6, 31 -8 C 23 -11, 12 -10, 4 -5 Z'

const moon = (
  <Svg>
    <defs>
      <radialGradient id="lagoon-moon-halo">
        <stop offset="0" stopColor="#f6f2ff" stopOpacity=".7" />
        <stop offset=".1" stopColor="#ded6ff" stopOpacity=".36" />
        <stop offset=".3" stopColor="#ab9fe8" stopOpacity=".15" />
        <stop offset="1" stopColor="#8f86d6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-moon-disk" cx=".42" cy=".4" r=".62">
        <stop offset="0" stopColor="#fffdf4" />
        <stop offset=".7" stopColor="#f8efd6" />
        <stop offset="1" stopColor="#e6d8b6" />
      </radialGradient>
      <radialGradient id="lagoon-cloud-g">
        <stop offset="0" stopColor="#8a82c6" stopOpacity=".5" />
        <stop offset=".5" stopColor="#6d65ae" stopOpacity=".26" />
        <stop offset="1" stopColor="#5f579f" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle className="lagoon-halo" cx={MOON.x} cy={MOON.y} r="380" fill="url(#lagoon-moon-halo)" />
    <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill="url(#lagoon-moon-disk)" />
    <g transform={`translate(${MOON.x} ${MOON.y})`} fill="#cbbb98" fillOpacity=".5">
      <path d="M -20 -9 C -22 -18, -11 -23, -4 -19 C 2 -16, -1 -9, -7 -6 C -12 -3, -18 -4, -20 -9 Z" />
      <path d="M 3 -15 C 8 -20, 17 -15, 16 -8 C 19 -2, 13 3, 8 0 C 3 -1, 0 -9, 3 -15 Z" />
      <path d="M -9 5 C -4 1, 5 4, 6 10 C 7 16, -1 19, -5 16 C -10 13, -12 8, -9 5 Z" />
      <ellipse cx="23" cy="-5" rx="4" ry="3.2" />
      <path d="M -26 4 C -24 0, -18 1, -17 5 C -16 9, -22 11, -25 8 Z" fillOpacity=".6" />
    </g>
    <circle cx={MOON.x - 4} cy={MOON.y + 24} r="1.8" fill="#fffbee" fillOpacity=".8" />
    {/* the owl crosses the moon on a long cycle */}
    <g transform={`translate(${MOON.x} ${MOON.y + 4})`}>
      <g className="lagoon-owl">
        <g className="lagoon-wing">
          <path d={OWL_WINGS} fill="#120f2c" />
        </g>
        <ellipse cx="0" cy="3" rx="7.4" ry="9.5" fill="#120f2c" />
        <ellipse cx="0" cy="-6.5" rx="7.6" ry="6.8" fill="#120f2c" />
        <path d="M -5 11 L 0 17 L 5 11 Z" fill="#120f2c" />
      </g>
    </g>
    <g className="lagoon-cloud" style={{ animationDuration: '84s', animationDelay: '-30s' }}>
      {cloud(MOON.x - 40, MOON.y + 30, 1, [
        [0, 0, 220, 18],
        [-100, -12, 80, 20],
        [-20, -20, 100, 26],
        [80, -10, 90, 20],
        [150, -2, 70, 13],
      ])}
    </g>
    <g className="lagoon-cloud" style={{ animationDuration: '112s', animationDelay: '-70s' }}>
      {cloud(MOON.x + 170, MOON.y - 66, 0.75, [
        [0, 0, 190, 14],
        [-50, -10, 80, 18],
        [50, -12, 90, 20],
      ])}
    </g>
    <g className="lagoon-cloud" style={{ animationDuration: '96s', animationDelay: '-12s' }}>
      {cloud(260, 424, 1.05, [
        [0, 0, 240, 16],
        [-110, -10, 90, 18],
        [-20, -18, 110, 24],
        [90, -9, 100, 18],
        [170, 0, 70, 11],
      ])}
    </g>
    <g className="lagoon-cloud" style={{ animationDuration: '130s', animationDelay: '-55s' }}>
      {cloud(660, 482, 0.9, [
        [0, 0, 300, 13],
        [-60, -10, 110, 16],
        [80, -8, 120, 15],
      ])}
    </g>
  </Svg>
)

/* ---------- misty ridges ---------- */

// Rim light along backlit edges: strongest beneath the moon, fading away from it.
const rimStops = (c, lo = 0.08) => (
  <>
    <stop offset="0" stopColor={c} stopOpacity={lo} />
    <stop offset=".45" stopColor={c} stopOpacity={lo * 1.6} />
    <stop offset={(MOON_T - 0.09).toFixed(3)} stopColor={c} stopOpacity=".55" />
    <stop offset={MOON_T.toFixed(3)} stopColor={c} stopOpacity="1" />
    <stop offset={(MOON_T + 0.09).toFixed(3)} stopColor={c} stopOpacity=".5" />
    <stop offset="1" stopColor={c} stopOpacity={lo} />
  </>
)

const ridges = (
  <Svg>
    <defs>
      <linearGradient id="lagoon-rim-r" gradientUnits="userSpaceOnUse" x1={-PAD} y1="0" x2={W + PAD} y2="0">
        {rimStops('#d9d2ff')}
      </linearGradient>
      <linearGradient id="lagoon-r1" gradientUnits="userSpaceOnUse" x1="0" y1="440" x2="0" y2="612">
        <stop offset="0" stopColor="#4d4f8f" />
        <stop offset=".55" stopColor="#5f6aa3" />
        <stop offset="1" stopColor="#8ba2c0" />
      </linearGradient>
      <linearGradient id="lagoon-r2" gradientUnits="userSpaceOnUse" x1="0" y1="520" x2="0" y2="640">
        <stop offset="0" stopColor="#2b2c62" />
        <stop offset=".6" stopColor="#3a4178" />
        <stop offset="1" stopColor="#5a6d98" />
      </linearGradient>
      <linearGradient id="lagoon-r3" gradientUnits="userSpaceOnUse" x1="0" y1="580" x2="0" y2="650">
        <stop offset="0" stopColor="#1b1d47" />
        <stop offset="1" stopColor="#303c68" />
      </linearGradient>
      <radialGradient id="lagoon-shade-r">
        <stop offset="0" stopColor="#17153f" stopOpacity=".42" />
        <stop offset=".6" stopColor="#17153f" stopOpacity=".16" />
        <stop offset="1" stopColor="#17153f" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-sheen-r">
        <stop offset="0" stopColor="#c2bff5" stopOpacity=".2" />
        <stop offset="1" stopColor="#c2bff5" stopOpacity="0" />
      </radialGradient>
      <clipPath id="lagoon-clip-r1">
        <path d={R1.fill} />
      </clipPath>
      <clipPath id="lagoon-clip-r2">
        <path d={R2.fill} />
      </clipPath>
      <linearGradient id="lagoon-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a9c6d2" stopOpacity="0" />
        <stop offset="1" stopColor="#a9c6d2" stopOpacity=".5" />
      </linearGradient>
      <radialGradient id="lagoon-mist-r">
        <stop offset="0" stopColor="#c6dde0" stopOpacity=".42" />
        <stop offset="1" stopColor="#c6dde0" stopOpacity="0" />
      </radialGradient>
    </defs>
    <path d={R1.top} fill="none" stroke="url(#lagoon-rim-r)" strokeWidth="2.6" />
    <path d={R1.fill} fill="url(#lagoon-r1)" />
    {shading(R1, 'lagoon-clip-r1')}
    <rect x={-PAD} y="530" width={W + 2 * PAD} height="110" fill="url(#lagoon-haze)" />
    <path d={`${R2.top} ${R2_TIPS}`} fill="none" stroke="url(#lagoon-rim-r)" strokeWidth="2" strokeOpacity=".8" />
    <path d={`${R2.fill} ${R2_TIPS}`} fill="url(#lagoon-r2)" />
    {shading(R2, 'lagoon-clip-r2')}
    <rect x={-PAD} y="572" width={W + 2 * PAD} height="76" fill="url(#lagoon-haze)" opacity=".75" />
    <path d={`${R3.top} ${R3_TIPS}`} fill="none" stroke="url(#lagoon-rim-r)" strokeWidth="1.8" strokeOpacity=".6" />
    <path d={`${R3.fill} ${R3_TIPS}`} fill="url(#lagoon-r3)" />
    <rect x={-PAD} y="600" width={W + 2 * PAD} height="50" fill="url(#lagoon-haze)" opacity=".7" />
    {[
      [300, 600, 430, 22, 52, -10],
      [1000, 612, 520, 20, 67, -33],
      [640, 586, 340, 15, 44, -21],
    ].map(([cx, cy, rx, ry, d, del]) => (
      <ellipse
        key={cx}
        className="lagoon-mist"
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="url(#lagoon-mist-r)"
        style={{ animationDuration: `${d}s`, animationDelay: `${del}s` }}
      />
    ))}
  </Svg>
)

/* ---------- far shore ---------- */

// Tiny far fireflies along the shore: blinking specks with a little glow.
function sparks(seed, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = 20 + r() * (W - 40)
    const y = 586 + r() * 46
    const d = 3.4 + r() * 4.2
    return (
      <g key={i} className="lagoon-spark" style={{ animationDuration: `${d.toFixed(2)}s`, animationDelay: `${(-r() * 8).toFixed(2)}s` }}>
        <circle cx={f(x)} cy={f(y)} r="6" fill="url(#lagoon-fly-t)" />
        <circle cx={f(x)} cy={f(y)} r=".9" fill="#f4ffc4" />
      </g>
    )
  })
}

const shore = (
  <Svg>
    <defs>
      <linearGradient id="lagoon-rim-t" gradientUnits="userSpaceOnUse" x1={-PAD} y1="0" x2={W + PAD} y2="0">
        {rimStops('#d6d0ff', 0.1)}
      </linearGradient>
      <linearGradient id="lagoon-tree" gradientUnits="userSpaceOnUse" x1="0" y1="520" x2="0" y2="640">
        <stop offset="0" stopColor="#1f2352" />
        <stop offset="1" stopColor="#111334" />
      </linearGradient>
      <radialGradient id="lagoon-fly-t">
        <stop offset="0" stopColor="#efffa8" stopOpacity=".8" />
        <stop offset=".35" stopColor="#c8f55a" stopOpacity=".28" />
        <stop offset="1" stopColor="#b4ec48" stopOpacity="0" />
      </radialGradient>
    </defs>
    <path d={FOREST.mass} fill="none" stroke="url(#lagoon-rim-t)" strokeWidth="2" strokeOpacity=".75" />
    <path d={FOREST.mass} fill="url(#lagoon-tree)" />
    {sparks(61, 10)}
  </Svg>
)

/* ---------- mirror lake ---------- */

// Waver bands: the reflection is sliced into horizontal strips that slide at
// their own pace, more the nearer they are.
const BANDS = [
  [SHORE, 648, 0],
  [648, 664, 1.4],
  [664, 684, 2.2],
  [684, 710, 3.2],
  [710, 742, 4.4],
  [742, 784, 5.6],
  [784, H + 40, 7],
]

const reflection = (
  <g transform={MIRROR}>
    <path d={R1.fill} fill="#3f4079" />
    <path d={R2.fill} fill="#2b2c62" />
    <path d={`${R3.fill} ${R3_TIPS}`} fill="#1f214c" />
    <path d={FOREST.refl} fill="#0d0f2e" fillOpacity=".92" />
  </g>
)

// Fine static streaks of reflected sky that break the mirror image into water.
function streaks(seed, count) {
  const r = rng(seed)
  let light = ''
  let dark = ''
  for (let i = 0; i < count; i++) {
    const t = Math.pow((i + r()) / count, 1.35)
    const y = SHORE + 6 + (H - SHORE - 10) * t
    const w = (16 + 150 * t) * (0.4 + r())
    const x = -PAD + r() * (W + 2 * PAD) - w / 2
    const h = 0.7 + 1.6 * t
    const d = ` M ${f(x)} ${f(y)} h ${f(w)} a ${f(h / 2)} ${f(h / 2)} 0 0 1 0 ${f(h)} h ${f(-w)} a ${f(h / 2)} ${f(h / 2)} 0 0 1 0 ${f(-h)} Z`
    if (r() < 0.62) light += d
    else dark += d
  }
  return { light, dark }
}
const STREAKS = streaks(23, 90)

// Short streaks that make the moon's glitter path; densest where the moon's
// own reflection would sit. Every third one shimmers.
function glints(seed, cx, count) {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.2 + r() * 0.6) / count
    const y = SHORE + 4 + (H - SHORE) * Math.pow(t, 1.15)
    const w = (4 + 62 * t) * (0.35 + r() * 0.9)
    const x = cx + (r() - 0.5) * (10 + 90 * t)
    const peak = 1 - Math.min(1, Math.abs(t - 0.8) * 1.6)
    return (
      <ellipse
        key={i}
        className={i % 3 ? undefined : 'lagoon-glint'}
        cx={f(x)}
        cy={f(y)}
        rx={f(w / 2)}
        ry={f(0.6 + 1.3 * t)}
        fill="#fff4d8"
        fillOpacity={(0.35 + 0.6 * peak * (0.6 + r() * 0.4)).toFixed(2)}
        style={i % 3 ? undefined : { animationDuration: `${(2.2 + r() * 3).toFixed(2)}s`, animationDelay: `${(-r() * 6).toFixed(2)}s` }}
      />
    )
  })
}

// [y, x, width, duration, light?]
const SLIDES = [
  [652, 120, 380, 17, 1],
  [664, 760, 300, 21, 1],
  [681, 300, 520, 19, 1],
  [702, 900, 420, 24, 0],
  [728, 40, 560, 22, 1],
  [760, 640, 640, 27, 0],
  [806, 160, 700, 25, 0],
  [858, 760, 760, 30, 0],
]

const lake = (
  <Svg>
    <defs>
      <linearGradient id="lagoon-water" gradientUnits="userSpaceOnUse" x1="0" y1={SHORE} x2="0" y2={H}>
        <stop offset="0" stopColor="#88a9b1" />
        <stop offset=".09" stopColor="#7792a7" />
        <stop offset=".24" stopColor="#616f99" />
        <stop offset=".36" stopColor="#535b8d" />
        <stop offset=".47" stopColor="#464784" />
        <stop offset=".62" stopColor="#363373" />
        <stop offset=".81" stopColor="#27235a" />
        <stop offset="1" stopColor="#1a1540" />
      </linearGradient>
      <linearGradient id="lagoon-deep" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0f0f33" stopOpacity="0" />
        <stop offset=".67" stopColor="#0f0f33" stopOpacity=".5" />
        <stop offset="1" stopColor="#0f0f33" stopOpacity=".6" />
      </linearGradient>
      <radialGradient id="lagoon-moonrefl">
        <stop offset="0" stopColor="#fff3dc" stopOpacity=".5" />
        <stop offset=".35" stopColor="#f2e6ff" stopOpacity=".16" />
        <stop offset="1" stopColor="#f2e6ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-sheen-g">
        <stop offset="0" stopColor="#d8d2ff" stopOpacity=".4" />
        <stop offset="1" stopColor="#d8d2ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-path-g">
        <stop offset="0" stopColor="#fff1d6" stopOpacity=".4" />
        <stop offset=".5" stopColor="#efe2ff" stopOpacity=".16" />
        <stop offset="1" stopColor="#efe2ff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="lagoon-line-l" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d6e8f2" stopOpacity="0" />
        <stop offset=".5" stopColor="#d6e8f2" stopOpacity=".5" />
        <stop offset="1" stopColor="#d6e8f2" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="lagoon-line-d" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#0b0c2e" stopOpacity="0" />
        <stop offset=".5" stopColor="#0b0c2e" stopOpacity=".55" />
        <stop offset="1" stopColor="#0b0c2e" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="lagoon-shoreline" gradientUnits="userSpaceOnUse" x1={-PAD} y1="0" x2={W + PAD} y2="0">
        {rimStops('#bfe7e4')}
      </linearGradient>
      <radialGradient id="lagoon-mist-l">
        <stop offset="0" stopColor="#d2e4e8" stopOpacity=".46" />
        <stop offset="1" stopColor="#cfe2e6" stopOpacity="0" />
      </radialGradient>
      {BANDS.map(([y0, y1], i) => (
        <clipPath key={i} id={`lagoon-band-${i}`}>
          <rect x={-PAD} y={y0} width={W + 2 * PAD} height={y1 - y0} />
        </clipPath>
      ))}
    </defs>
    <rect x={-PAD} y={SHORE} width={W + 2 * PAD} height={H - SHORE + 40} fill="url(#lagoon-water)" />
    {/* skyglow under the moon */}
    <ellipse cx={MOON.x} cy={SHORE + 20} rx="420" ry="70" fill="url(#lagoon-sheen-g)" />
    {BANDS.map(([, , a], i) => (
      <g key={i} clipPath={`url(#lagoon-band-${i})`}>
        {a ? (
          <g className="lagoon-waver" style={{ '--a': `${a}px`, animationDuration: `${(3.2 + i * 0.9).toFixed(1)}s`, animationDelay: `${-i * 1.3}s` }}>
            {reflection}
          </g>
        ) : (
          reflection
        )}
      </g>
    ))}
    <path d={STREAKS.light} fill="#c4d6ee" fillOpacity=".2" />
    <path d={STREAKS.dark} fill="#0c0d2c" fillOpacity=".32" />
    <rect x={-PAD} y="700" width={W + 2 * PAD} height="240" fill="url(#lagoon-deep)" />
    <rect x={-PAD} y={SHORE - 0.6} width={W + 2 * PAD} height="1.8" fill="url(#lagoon-shoreline)" />
    {/* moon path */}
    <ellipse className="lagoon-path" cx={MOON.x} cy="790" rx="130" ry="180" fill="url(#lagoon-path-g)" />
    <ellipse cx={MOON.x} cy={f(SHORE + (SHORE - MOON.y) * K)} rx="90" ry="22" fill="url(#lagoon-moonrefl)" />
    {glints(17, MOON.x, 36)}
    {SLIDES.map(([y, x, w, d, light], i) => (
      <rect
        key={y}
        className="lagoon-slide"
        x={x}
        y={y}
        width={w}
        height={f(1 + (y - SHORE) / 110)}
        fill={light ? 'url(#lagoon-line-l)' : 'url(#lagoon-line-d)'}
        style={{ animationDuration: `${d}s`, animationDelay: `${-i * 3.7}s` }}
      />
    ))}
    {[
      [330, 694, 34, 13],
      [770, 708, 44, 17],
    ].map(([cx, cy, rx, d], i) => (
      <g key={cx} className="lagoon-ring" style={{ animationDuration: `${d}s`, animationDelay: `${-i * 6 - 2}s` }}>
        <ellipse cx={cx} cy={cy} rx={rx} ry={f(rx * 0.12)} fill="none" stroke="#d3ecf0" strokeOpacity=".55" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
        <ellipse cx={cx} cy={cy} rx={f(rx * 0.6)} ry={f(rx * 0.072)} fill="none" stroke="#d3ecf0" strokeOpacity=".4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>
    ))}
    {[
      [260, 640, 420, 16, 47, -6],
      [900, 646, 480, 14, 58, -31],
      [1360, 638, 300, 12, 39, -17],
    ].map(([cx, cy, rx, ry, d, del]) => (
      <ellipse
        key={cx}
        className="lagoon-mist"
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="url(#lagoon-mist-l)"
        style={{ animationDuration: `${d}s`, animationDelay: `${del}s` }}
      />
    ))}
  </Svg>
)

/* ---------- shallows: boat, lilies, heron ---------- */

// Lily pad: an ellipse with a wedge cut out at angle `dir`.
function padPath(cx, cy, rx, ry, dir = 0.2, half = 0.28) {
  const a1 = dir - half
  const a2 = dir + half
  return `M ${f(cx)} ${f(cy)} L ${f(cx + rx * Math.cos(a1))} ${f(cy + ry * Math.sin(a1))} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx * Math.cos(a2))} ${f(cy + ry * Math.sin(a2))} Z`
}

function lilyPad([cx, cy, rx, ry, dir], i) {
  const veins = [dir + 1.3, dir + 2.3, dir + 3.3, dir + 4.3, dir + 5.1]
    .map((a) => `M ${f(cx)} ${f(cy)} L ${f(cx + rx * 0.86 * Math.cos(a))} ${f(cy + ry * 0.86 * Math.sin(a))}`)
    .join(' ')
  return (
    <g key={i}>
      <path d={padPath(cx, cy + ry * 0.24, rx, ry, dir)} fill="#081619" />
      <path d={padPath(cx, cy, rx, ry, dir)} fill="url(#lagoon-pad-g)" />
      <path d={veins} stroke="#0d2326" strokeOpacity=".7" strokeWidth=".8" />
      <path
        d={`M ${f(cx - rx * 0.94)} ${f(cy - ry * 0.34)} A ${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx * 0.7)} ${f(cy - ry * 0.71)}`}
        fill="none"
        stroke="#8cc4b4"
        strokeOpacity=".4"
        strokeWidth="1"
      />
    </g>
  )
}

function petal(cx, cy, a, len, w, flat = 0.62) {
  const tx = cx + len * Math.cos(a)
  const ty = cy + len * Math.sin(a) * flat
  const mx = (cx + tx) / 2
  const my = (cy + ty) / 2
  const dx = tx - cx
  const dy = ty - cy
  const n = Math.hypot(dx, dy) || 1
  const px = (-dy / n) * w
  const py = (dx / n) * w
  return `M ${f(cx)} ${f(cy)} Q ${f(mx + px)} ${f(my + py)} ${f(tx)} ${f(ty)} Q ${f(mx - px)} ${f(my - py)} ${f(cx)} ${f(cy)} Z`
}

// A glowing water lily: a pulsing glow (and its pool of light on the water),
// back petals, front petals and a golden heart.
function lily(cx, cy, s, d, del) {
  const back = [-3.0, -2.55, -2.05, -1.55, -1.1, -0.6, -0.15].map((a) => petal(cx, cy, a, 17 * s, 4.6 * s)).join(' ')
  const front = [-2.35, -1.9, -1.57, -1.24, -0.8].map((a) => petal(cx, cy - 1 * s, a, 12.5 * s, 3.8 * s, 0.95)).join(' ')
  return (
    <g>
      <g className="lagoon-lily" style={{ animationDuration: `${d}s`, animationDelay: `${del}s` }}>
        <ellipse cx={cx} cy={f(cy + 6 * s)} rx={f(44 * s)} ry={f(10 * s)} fill="url(#lagoon-lily-glow)" />
        <circle cx={cx} cy={f(cy - 5 * s)} r={f(36 * s)} fill="url(#lagoon-lily-glow)" />
      </g>
      <path d={back} fill="#e7aecb" />
      <path d={front} fill="#fff1f7" />
      <ellipse cx={cx} cy={f(cy - 4 * s)} rx={f(3.4 * s)} ry={f(2.4 * s)} fill="#ffd66e" />
    </g>
  )
}

// Note: at rest the scene shows viewBox y ≈ 41…859 (layers overscan by 5%),
// so foreground details stay above ~845.
const PADS = [
  [196, 804, 34, 8, 0.4],
  [262, 826, 42, 10, -0.3],
  [364, 826, 46, 11, 0.9],
  [318, 798, 24, 6, 2.6],
  [446, 846, 36, 9, 0.2],
  [150, 834, 30, 7.5, 3.4],
  [842, 826, 36, 8.5, 0.7],
  [912, 842, 46, 10.5, -0.5],
  [790, 848, 26, 6.5, 2.8],
  [1268, 846, 36, 8.5, 2.4],
]

// Seated frog on a pad, facing left; its throat puffs now and then.
const frog = (
  <g transform="translate(362 822)">
    <ellipse className="lagoon-throat" cx="-8.5" cy="-4" rx="4.6" ry="3.6" fill="#c6d6ac" fillOpacity=".85" />
    <path
      d="M -11 -2 C -13 -8, -9 -13, -3 -14 C 4 -15, 11 -11, 12 -4 C 13 0, 9 1, 2 1 L -8 1 C -11 1, -12 0, -11 -2 Z"
      fill="#10262a"
    />
    <ellipse cx="7" cy="-3" rx="6" ry="4" fill="#0c1f22" />
    <path d="M -9 0 L -12 2 M -6 0 L -6 3" stroke="#10262a" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="-6" cy="-13" r="2.8" fill="#10262a" />
    <circle cx="-0.5" cy="-14" r="2.8" fill="#10262a" />
    <circle cx="-6.6" cy="-13.6" r=".9" fill="#efffb0" />
    <circle cx="-1.1" cy="-14.6" r=".9" fill="#efffb0" />
    <path d="M -10 -9 C -6 -14, 4 -16, 11 -8" fill="none" stroke="#7fb3a2" strokeOpacity=".5" strokeWidth=".9" />
  </g>
)

// [cx, cy, rx, duration, delay]: rings where a frog just slipped in
const PLOPS = [
  [300, 796, 44, 9.5, -3],
  [854, 818, 56, 12.5, -9],
  [1000, 742, 40, 15, -1],
]

// Grey heron standing in the shallows, facing left. Feet at the local origin.
// The neck + head pivot from the shoulder so it can stab at the water.
function heron(rim) {
  return (
    <>
      <path d="M -8 -66 L -10 -38 L -14 0 M 0 -64 L 4 -36 L 2 0" stroke="#1a1c3c" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
      <path
        d="M -30 -98 C -38 -88, -32 -72, -14 -66 C 2 -61, 22 -62, 46 -55 C 34 -66, 22 -84, 4 -96 C -8 -103, -22 -104, -30 -98 Z"
        fill="#1a1c3c"
      />
      <path d="M -18 -92 C -2 -88, 18 -76, 42 -57" fill="none" stroke="#0d0e26" strokeWidth="1.6" />
      <path d="M 18 -70 C 30 -64, 42 -58, 54 -52 M 22 -66 C 32 -60, 42 -55, 50 -50" fill="none" stroke="#1a1c3c" strokeWidth="1.2" strokeLinecap="round" />
      {rim && <path d="M -30 -98 C -22 -104, -8 -103, 4 -96 C 22 -84, 34 -66, 46 -55" fill="none" stroke="#a8b2e6" strokeOpacity=".55" strokeWidth="1.3" />}
      <g transform="translate(-24 -96)">
        <g className="lagoon-heron-head">
          <path d="M 2 2 C -16 -14, 10 -26, -2 -46" fill="none" stroke="#1a1c3c" strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="-4" cy="-49" rx="7.6" ry="5.4" fill="#1a1c3c" transform="rotate(-10 -4 -49)" />
          <path d="M -9 -52 L -42 -47.6 L -9 -45.6 Z" fill="#23243f" />
          <path d="M -2 -53 C 6 -57, 14 -56, 22 -50" fill="none" stroke="#1a1c3c" strokeWidth="1.4" strokeLinecap="round" />
          {rim && (
            <>
              <path d="M -2 -1 C -19 -15, 6 -26, -6 -45 M -11 -53 C -7 -56, 0 -56, 3 -52 M -10 -52.2 L -40 -47.8" fill="none" stroke="#a8b2e6" strokeOpacity=".5" strokeWidth="1.1" />
              <circle cx="-6.5" cy="-50" r="1" fill="#e8ecff" fillOpacity=".8" />
            </>
          )}
        </g>
      </g>
    </>
  )
}

// Rowboat, waterline at the local origin, bow to the right.
const HULL = 'M -94 -22 C -92 -6, -78 3, -52 5 L 54 5 C 80 3, 94 -10, 104 -31 C 72 -18, 32 -13, 0 -13 C -36 -13, -66 -16, -94 -22 Z'
const INSIDE = 'M -94 -22 C -60 -26, -30 -27, 0 -26.5 C 36 -26, 72 -28, 104 -31 C 72 -18, 32 -13, 0 -13 C -36 -13, -66 -16, -94 -22 Z'
const LAMP = { x: 130, y: -72 }

function boat(refl) {
  const ink = refl ? '#090b22' : '#0d1029'
  return (
    <>
      {!refl && (
        <>
          <path d="M -24 -16 L -132 9" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="-134" cy="9.5" rx="14" ry="3" fill={ink} />
        </>
      )}
      <path d={INSIDE} fill={refl ? ink : '#070818'} />
      {!refl && (
        <>
          <path d="M -50 -25 L -38 -25 L -36 -15 L -48 -15 Z M 22 -26 L 34 -26 L 36 -14 L 24 -14 Z" fill="#2a2036" />
          <path d="M -76 -25 L 66 -28" stroke="#1a1730" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M -94 -22 C -60 -26, -30 -27, 0 -26.5 C 36 -26, 72 -28, 104 -31" fill="none" stroke="url(#lagoon-gunwale)" strokeWidth="1.4" />
        </>
      )}
      <path d={HULL} fill={ink} />
      {!refl && (
        <>
          <path d="M -88 -12 C -60 -6, -20 -4, 20 -4.5 C 56 -5, 82 -10, 98 -22 M -80 -3 C -50 1, 0 1, 40 0.5 C 64 0, 80 -4, 90 -10" fill="none" stroke="#1d2350" strokeWidth="1" />
          <g className="lagoon-flicker">
            <path d={HULL} fill="url(#lagoon-hull-warm)" />
            <circle cx={LAMP.x} cy={LAMP.y} r="160" fill="url(#lagoon-lamp-halo)" />
          </g>
          <path d="M -94 -22 C -66 -16, -36 -13, 0 -13 C 32 -13, 72 -18, 104 -31" fill="none" stroke="url(#lagoon-gunwale)" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      <path d={`M 90 -26 L 100 -104 L ${LAMP.x} -100 L ${LAMP.x} -92`} stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {!refl && <path d="M 100 -103 L 101 -96" stroke="#ffb45c" strokeOpacity=".5" strokeWidth="1" />}
      <path d={`M ${LAMP.x - 8} ${LAMP.y - 14} L ${LAMP.x + 8} ${LAMP.y - 14} L ${LAMP.x + 4} ${LAMP.y - 20} L ${LAMP.x - 4} ${LAMP.y - 20} Z`} fill={refl ? ink : '#2a1a20'} />
      {refl ? (
        <circle cx={LAMP.x} cy={LAMP.y - 2} r="46" fill="url(#lagoon-lamp-halo)" />
      ) : (
        <rect x={LAMP.x - 7} y={LAMP.y - 14} width="14" height="23" rx="3" fill="url(#lagoon-lamp-glass)" />
      )}
      {!refl && (
        <>
          <path d={`M ${LAMP.x - 3.5} ${LAMP.y - 13} L ${LAMP.x - 3.5} ${LAMP.y + 8} M ${LAMP.x + 3.5} ${LAMP.y - 13} L ${LAMP.x + 3.5} ${LAMP.y + 8}`} stroke="#8a4a24" strokeOpacity=".55" strokeWidth=".9" />
          <ellipse className="lagoon-flame" cx={LAMP.x} cy={LAMP.y} rx="2.6" ry="5" fill="#fffbea" />
        </>
      )}
      <rect x={LAMP.x - 8.5} y={LAMP.y + 8} width="17" height="3.5" rx="1" fill={refl ? ink : '#2a1a20'} />
    </>
  )
}

// Low fireflies skimming the water, each with its reflection below.
// [x, y, height above its water, variant, duration]
const SKIM = [
  [96, 612, 20, 1, 16],
  [560, 622, 14, 2, 21],
  [930, 616, 18, 3, 18],
  [1390, 618, 16, 1, 23],
  [150, 768, 30, 2, 19],
  [405, 806, 26, 3, 17],
  [1110, 790, 28, 1, 20],
  [1300, 760, 34, 3, 22],
]

const shallows = (
  <Svg>
    <defs>
      <radialGradient id="lagoon-lamp-halo">
        <stop offset="0" stopColor="#fff0c8" stopOpacity="1" />
        <stop offset=".1" stopColor="#ffc878" stopOpacity=".72" />
        <stop offset=".24" stopColor="#ffab58" stopOpacity=".44" />
        <stop offset=".45" stopColor="#ff9646" stopOpacity=".18" />
        <stop offset=".72" stopColor="#ff8a3c" stopOpacity=".05" />
        <stop offset="1" stopColor="#ff8a3c" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-hull-warm" gradientUnits="userSpaceOnUse" cx={LAMP.x} cy={LAMP.y} r="190">
        <stop offset="0" stopColor="#ff9f4f" stopOpacity=".75" />
        <stop offset=".45" stopColor="#d9692f" stopOpacity=".25" />
        <stop offset="1" stopColor="#d9692f" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-lamp-glass" cx=".5" cy=".55" r=".6">
        <stop offset="0" stopColor="#fff6d6" />
        <stop offset=".55" stopColor="#ffc46e" />
        <stop offset="1" stopColor="#e07a34" />
      </radialGradient>
      <linearGradient id="lagoon-gunwale" gradientUnits="userSpaceOnUse" x1="-94" y1="0" x2="104" y2="0">
        <stop offset="0" stopColor="#4d5c96" stopOpacity=".5" />
        <stop offset=".6" stopColor="#d9884a" stopOpacity=".55" />
        <stop offset="1" stopColor="#ffc27a" stopOpacity=".95" />
      </linearGradient>
      <radialGradient id="lagoon-water-warm">
        <stop offset="0" stopColor="#ffb563" stopOpacity=".62" />
        <stop offset=".45" stopColor="#ff9a4a" stopOpacity=".22" />
        <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="lagoon-pad-g" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#36655f" />
        <stop offset=".6" stopColor="#1d3c3e" />
        <stop offset="1" stopColor="#152d31" />
      </linearGradient>
      <radialGradient id="lagoon-lily-glow">
        <stop offset="0" stopColor="#fff0f6" stopOpacity=".7" />
        <stop offset=".3" stopColor="#ffc6de" stopOpacity=".26" />
        <stop offset="1" stopColor="#ffb0d2" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-fly-s">
        <stop offset="0" stopColor="#f8ffc4" stopOpacity="1" />
        <stop offset=".12" stopColor="#e2ff7c" stopOpacity=".66" />
        <stop offset=".32" stopColor="#c8f454" stopOpacity=".24" />
        <stop offset=".6" stopColor="#bdf24c" stopOpacity=".06" />
        <stop offset="1" stopColor="#b4ec48" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lagoon-mist-s">
        <stop offset="0" stopColor="#cddfe6" stopOpacity=".32" />
        <stop offset="1" stopColor="#c9dce4" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* low mist sliding over the water */}
    {[
      [640, 720, 520, 26, 61, -14],
      [1080, 778, 460, 22, 73, -40],
    ].map(([cx, cy, rx, ry, d, del]) => (
      <ellipse
        key={cx}
        className="lagoon-mist-low"
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="url(#lagoon-mist-s)"
        style={{ animationDuration: `${d}s`, animationDelay: `${del}s` }}
      />
    ))}

    {PLOPS.map(([cx, cy, rx, d, del]) => (
      <g key={cx} className="lagoon-ring" style={{ animationDuration: `${d}s`, animationDelay: `${del}s` }}>
        <ellipse cx={cx} cy={cy} rx={rx} ry={f(rx * 0.16)} fill="none" stroke="#d6eef0" strokeOpacity=".6" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <ellipse cx={cx} cy={cy} rx={f(rx * 0.62)} ry={f(rx * 0.1)} fill="none" stroke="#d6eef0" strokeOpacity=".45" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
        <ellipse cx={cx} cy={cy} rx={f(rx * 0.28)} ry={f(rx * 0.045)} fill="none" stroke="#d6eef0" strokeOpacity=".35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>
    ))}

    {/* heron, its wavering reflection first */}
    <g transform={`translate(${HERON.x} ${HERON.y}) scale(${HERON.s} ${-HERON.s * 0.8})`} opacity=".32">
      {heron(false)}
    </g>
    <g transform={`translate(${HERON.x} ${HERON.y}) scale(${HERON.s})`}>
      {heron(true)}
      <g className="lagoon-ring" style={{ animationDuration: '6.5s' }}>
        <ellipse cx="-6" cy="1" rx="26" ry="3.2" fill="none" stroke="#cfe6ee" strokeOpacity=".5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>
      <ellipse cx="-6" cy="1" rx="13" ry="1.8" fill="none" stroke="#cfe6ee" strokeOpacity=".35" strokeWidth="1" />
    </g>

    {/* lantern boat: light pooled on the water, reflection, ripples, the boat */}
    <ellipse
      className="lagoon-flicker"
      cx={BOAT.x + LAMP.x - 16}
      cy={BOAT.y + 46}
      rx="180"
      ry="64"
      fill="url(#lagoon-water-warm)"
      style={{ animationDuration: '3.1s' }}
    />
    <g transform={`translate(${BOAT.x} ${BOAT.y + 3}) scale(1 -0.82)`} opacity=".55">
      <g className="lagoon-rock">{boat(true)}</g>
    </g>
    {[
      [6, 6, 30, 3.4],
      [-4, 18, 44, 2.6],
      [8, 33, 58, 3.9],
      [-6, 50, 40, 2.9],
      [4, 68, 66, 4.4],
      [-2, 90, 50, 3.1],
    ].map(([dx, dy, w, d], i) => (
      <ellipse
        key={i}
        className="lagoon-glint"
        cx={BOAT.x + LAMP.x + dx}
        cy={BOAT.y + dy}
        rx={f(w / 2)}
        ry={f(0.8 + dy / 70)}
        fill="#ffc47a"
        fillOpacity=".8"
        style={{ animationDuration: `${d}s`, animationDelay: `${-i * 0.9}s` }}
      />
    ))}
    {[0, 1, 2].map((i) => (
      <ellipse
        key={i}
        className="lagoon-wake"
        cx={BOAT.x + 6}
        cy={BOAT.y + 4}
        rx="118"
        ry="9"
        fill="none"
        stroke="#bfdbe6"
        strokeOpacity=".5"
        strokeWidth="1.1"
        vectorEffect="non-scaling-stroke"
        style={{ animationDelay: `${-i * 3}s` }}
      />
    ))}
    <g transform={`translate(${BOAT.x} ${BOAT.y})`}>
      <g className="lagoon-rock">{boat(false)}</g>
    </g>

    {/* lily pads and glowing lilies */}
    {PADS.map(lilyPad)}
    {frog}
    {lily(252, 820, 1.3, 6.2, -1)}
    {lily(196, 800, 0.9, 7.6, -4)}
    {lily(904, 836, 1.15, 6.9, -2.5)}

    {SKIM.map(([x, y, h, v, d], i) => (
      <g key={i} transform={`translate(${x} ${y})${i % 2 ? ' scale(-1 1)' : ''}`}>
        <g className={`lagoon-skim lagoon-skim-${v}`} style={{ animationDuration: `${d}s`, animationDelay: `${(-i * 2.9).toFixed(1)}s` }}>
          <ellipse cx="0" cy={2 * h} rx="5" ry="11" fill="url(#lagoon-fly-s)" opacity=".55" />
          <circle r="24" fill="url(#lagoon-fly-s)" />
          <circle r="1.9" fill="#fbffdc" />
        </g>
      </g>
    ))}
  </Svg>
)

/* ---------- cattails ---------- */

// Cattail clumps: two-tone blades (some bent over), stems, velvet seed heads
// with a lit edge, and fine grass. Each clump sways from its root.
function cattails(seed, spots, litRight) {
  const r = rng(seed)
  const base = 914
  return spots.map(([sx, s, lean], i) => {
    let dark = ''
    let lit = ''
    const nb = 4 + Math.floor(r() * 3)
    for (let k = 0; k < nb; k++) {
      const x0 = sx + (k - nb / 2) * 5 * s + (r() - 0.5) * 6
      const lh = (150 + r() * 220) * s
      const dir = (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.8) + lean
      const bend = r() < 0.3
      const w = (6 + r() * 4) * s
      const cx = x0 + dir * 8 * s
      const cy = base - lh * (bend ? 1.08 : 0.6)
      const tx = x0 + dir * (bend ? 70 : 24 + r() * 50) * s
      const ty = base - lh * (bend ? 0.72 : 1)
      dark += ` M ${f(x0 - w / 2)} ${base} Q ${f(cx - w * 0.3)} ${f(cy)} ${f(tx)} ${f(ty)} Q ${f(cx + w * 0.7)} ${f(cy)} ${f(x0 + w / 2)} ${base} Z`
      lit += litRight
        ? ` M ${f(x0)} ${base} Q ${f(cx + w * 0.2)} ${f(cy)} ${f(tx)} ${f(ty)} Q ${f(cx + w * 0.7)} ${f(cy)} ${f(x0 + w / 2)} ${base} Z`
        : ` M ${f(x0 - w / 2)} ${base} Q ${f(cx - w * 0.3)} ${f(cy)} ${f(tx)} ${f(ty)} Q ${f(cx + w * 0.2)} ${f(cy)} ${f(x0)} ${base} Z`
    }
    let stems = ''
    let spikes = ''
    const heads = []
    const ns = 1 + Math.floor(r() * 2.4)
    for (let k = 0; k < ns; k++) {
      const x0 = sx + (k - (ns - 1) / 2) * 12 * s
      const h = (250 + r() * 150) * s
      const l = (r() - 0.5) * 46 + lean * 30
      const top = base - h
      const qx = x0 + l * 0.2
      const qy = base - h * 0.5
      stems += ` M ${f(x0)} ${base} Q ${f(qx)} ${f(qy)} ${f(x0 + l)} ${f(top)}`
      const at = (t) => [
        (1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * qx + t * t * (x0 + l),
        (1 - t) * (1 - t) * base + 2 * t * (1 - t) * qy + t * t * top,
      ]
      const [hx, hy] = at(0.84)
      const [ax, ay] = at(0.8)
      const ang = (Math.atan2(hx - ax, ay - hy) * 180) / Math.PI
      const hw = (5 + r() * 1.6) * s
      const hh = (17 + r() * 7) * s
      heads.push([hx, hy, hw, hh, ang])
      const [sx2, sy2] = at(0.84 + (hh / h) * 1.1)
      spikes += ` M ${f(sx2)} ${f(sy2)} L ${f(x0 + l)} ${f(top)}`
    }
    let grass = ''
    for (let k = 0; k < 6; k++) {
      const gx = sx + (r() - 0.5) * 70 * s
      const gh = (40 + r() * 70) * s
      const gd = (r() - 0.5) * 50 * s
      grass += ` M ${f(gx)} ${base} Q ${f(gx + gd * 0.2)} ${f(base - gh * 0.6)} ${f(gx + gd)} ${f(base - gh)}`
    }
    return (
      <g
        key={i}
        className="lagoon-reed"
        style={{ animationDuration: `${(4.6 + r() * 3.4).toFixed(2)}s`, animationDelay: `${(-r() * 8).toFixed(2)}s` }}
      >
        <path d={grass} stroke="#090a20" strokeWidth={f(1.6 * s)} fill="none" strokeLinecap="round" />
        <path d={dark} fill="#07081b" />
        <path d={lit} fill="#141739" />
        <path d={stems} stroke="#06071a" strokeWidth={f(2.8 * s)} fill="none" strokeLinecap="round" />
        <path d={spikes} stroke="#06071a" strokeWidth={f(1.4 * s)} fill="none" strokeLinecap="round" />
        {heads.map(([hx, hy, hw, hh, ang], k) => (
          <rect
            key={k}
            x={f(hx - hw)}
            y={f(hy - hh)}
            width={f(hw * 2)}
            height={f(hh * 2)}
            rx={f(hw)}
            fill={litRight ? 'url(#lagoon-head-r)' : 'url(#lagoon-head-l)'}
            transform={`rotate(${ang.toFixed(1)} ${f(hx)} ${f(hy)})`}
          />
        ))}
      </g>
    )
  })
}

const reeds = (
  <Svg>
    <defs>
      <linearGradient id="lagoon-head-r" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#1a0e17" />
        <stop offset=".6" stopColor="#3b2330" />
        <stop offset=".9" stopColor="#7a4c48" />
        <stop offset="1" stopColor="#4a2c34" />
      </linearGradient>
      <linearGradient id="lagoon-head-l" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stopColor="#1a0e17" />
        <stop offset=".6" stopColor="#33233a" />
        <stop offset=".9" stopColor="#6a5c7e" />
        <stop offset="1" stopColor="#3c3150" />
      </linearGradient>
    </defs>
    <path d={`M ${-PAD} ${H + 20} L ${-PAD} 828 C -60 820, 120 834, 250 864 C 320 880, 370 894, 410 ${H + 20} Z`} fill="none" stroke="#2c3a6c" strokeOpacity=".7" strokeWidth="3" />
    <path d={`M ${-PAD} ${H + 20} L ${-PAD} 828 C -60 820, 120 834, 250 864 C 320 880, 370 894, 410 ${H + 20} Z`} fill="#05061a" />
    <path d={`M ${W + PAD} ${H + 20} L ${W + PAD} 824 C 1500 818, 1360 834, 1250 866 C 1190 884, 1150 896, 1120 ${H + 20} Z`} fill="none" stroke="#2c3a6c" strokeOpacity=".7" strokeWidth="3" />
    <path d={`M ${W + PAD} ${H + 20} L ${W + PAD} 824 C 1500 818, 1360 834, 1250 866 C 1190 884, 1150 896, 1120 ${H + 20} Z`} fill="#05061a" />
    {cattails(
      71,
      [
        [-70, 1.05, 0.2],
        [-12, 1.15, 0.1],
        [52, 0.95, 0.3],
        [118, 1.08, 0.2],
        [186, 0.84, 0.4],
        [250, 0.66, 0.5],
      ],
      true,
    )}
    {cattails(
      93,
      [
        [1290, 0.66, -0.5],
        [1346, 0.92, -0.3],
        [1400, 1.1, -0.2],
        [1452, 1, -0.1],
        [1512, 1.12, -0.2],
      ],
      false,
    )}
  </Svg>
)

/* ---------- fireflies ---------- */

// Where the fireflies gather: [x0, x1, y0, y1, weight]
const SWARM = [
  [10, 330, 520, 860, 12],
  [1230, 1430, 520, 860, 10],
  [300, 1240, 590, 700, 8],
  [60, 1380, 430, 560, 3],
  [600, 1150, 720, 860, 3],
]

function fireflies(seed, count) {
  const r = rng(seed)
  const total = SWARM.reduce((a, z) => a + z[4], 0)
  return Array.from({ length: count }, (_, i) => {
    let pick = r() * total
    const zone = SWARM.find((z) => (pick -= z[4]) < 0) || SWARM[0]
    const x = zone[0] + r() * (zone[1] - zone[0])
    const y = zone[2] + r() * (zone[3] - zone[2])
    const s = 0.55 + r() * 0.8
    const v = 1 + Math.floor(r() * 6)
    const flip = r() < 0.5
    const d = 12 + r() * 12
    return (
      <g key={i} transform={`translate(${f(x)} ${f(y)})${flip ? ' scale(-1 1)' : ''}`}>
        <g className={`lagoon-fly lagoon-fly-${v}`} style={{ animationDuration: `${d.toFixed(1)}s`, animationDelay: `${(-r() * d).toFixed(1)}s` }}>
          <circle r={f(30 * s)} fill="url(#lagoon-fly-g)" />
          <circle r={f(2.1 * s)} fill="#fdffe6" />
        </g>
      </g>
    )
  })
}

const flies = (
  <Svg>
    <defs>
      <radialGradient id="lagoon-fly-g">
        <stop offset="0" stopColor="#fbffd0" stopOpacity="1" />
        <stop offset=".1" stopColor="#eaff8a" stopOpacity=".78" />
        <stop offset=".28" stopColor="#d0f85c" stopOpacity=".3" />
        <stop offset=".6" stopColor="#bdf04a" stopOpacity=".08" />
        <stop offset="1" stopColor="#b4ec48" stopOpacity="0" />
      </radialGradient>
    </defs>
    {fireflies(88, 48)}
  </Svg>
)

const lagoon = {
  id: 'lagoon',
  name: 'Firefly Lagoon',
  tag: 'Twilight lake',
  accent: '#c8f55a',
  accent2: '#ffbe6b',
  ink: '#4a6a0c',
  glow: '#d9f79a',
  light: false,
  clockColor: '#f3eeff',
  sky: 'linear-gradient(180deg,#05041a 0%,#0a0827 12%,#140f3c 24%,#221852 34%,#322468 41%,#45367f 46%,#5d5398 50%,#7a78b4 54%,#95a0c6 58%,#a9bfcd 62%,#b6d5cf 67%,#c0e0d2 78%)',
  layers: [
    { name: 'Star plate', depth: 0, sky: true, el: sky },
    { name: 'Moon and owl', depth: 0.08, el: moon },
    { name: 'Misty ridges', depth: 0.2, el: ridges },
    { name: 'Depth clock', depth: 0.36, clock: true },
    { name: 'Pine shore', depth: 0.48, el: shore },
    { name: 'Mirror lake', depth: 0.62, el: lake },
    { name: 'Lantern shallows', depth: 0.8, el: shallows },
    { name: 'Cattails', depth: 1.05, el: reeds },
    { name: 'Fireflies', depth: 1.3, el: flies },
  ],
}

export default lagoon
