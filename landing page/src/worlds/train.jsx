// Night Train — a moonlit countryside. A steam train crosses a stone viaduct
// over a misty river, below a hill town with a church tower and a windmill.
// Moonlit clouds drift past a full moon, the river mirrors the arches, and an
// owl, bats and fireflies keep the night company.

import './train.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ================= helpers ================= */

const sec = (n) => `${n.toFixed(2)}s`
const anim = (dur, delay = 0) => ({ animationDuration: sec(dur), animationDelay: sec(delay) })
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
// every subpath winds clockwise, so unions of shapes fill solid
const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} h ${f(w)} v ${f(h)} h ${f(-w)} Z`
const oval = (cx, cy, rx, ry) =>
  `M ${f(cx - rx)} ${f(cy)} a ${f(rx)} ${f(ry)} 0 1 1 ${f(2 * rx)} 0 a ${f(rx)} ${f(ry)} 0 1 1 ${f(-2 * rx)} 0 Z`
const disc = (cx, cy, r) => oval(cx, cy, r, r)

// Smooth ridge through points (flat tangents at each point).
function crestSegs(pts) {
  let d = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const mx = (x0 + x1) / 2
    d += ` C ${f(mx)} ${f(y0)}, ${f(mx)} ${f(y1)}, ${f(x1)} ${f(y1)}`
  }
  return d
}
const crest = (pts) => `M ${f(pts[0][0])} ${f(pts[0][1])}${crestSegs(pts)}`
const hills = (pts, bottom = H + 80) =>
  `M ${pts[0][0]} ${bottom} L ${f(pts[0][0])} ${f(pts[0][1])}${crestSegs(pts)} L ${pts[pts.length - 1][0]} ${bottom} Z`

// Height of a crest at x (bisection on the cubic's x(t)).
function ridgeY(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x < x0 || x > x1) continue
    const mx = (x0 + x1) / 2
    const bez = (t, a, b, c, e) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * e
    let lo = 0
    let hi = 1
    for (let k = 0; k < 24; k++) {
      const t = (lo + hi) / 2
      if (bez(t, x0, mx, mx, x1) < x) lo = t
      else hi = t
    }
    return bez(lo, y0, y0, y1, y1)
  }
  return x < pts[0][0] ? pts[0][1] : pts[pts.length - 1][1]
}

const lin = ({ id, x1 = 0, y1 = 0, x2 = 0, y2 = 1, user = false, stops }) => (
  <linearGradient key={id} id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits={user ? 'userSpaceOnUse' : undefined}>
    {stops.map(([o, c, a = 1], i) => (
      <stop key={i} offset={o} stopColor={c} stopOpacity={a} />
    ))}
  </linearGradient>
)
const rad = ({ id, cx, cy, r, stops }) => (
  <radialGradient key={id} id={id} cx={cx} cy={cy} r={r}>
    {stops.map(([o, c, a = 1], i) => (
      <stop key={i} offset={o} stopColor={c} stopOpacity={a} />
    ))}
  </radialGradient>
)

// A lobed clump of leaves: a solid core ringed by little leaf discs.
function leafClump(r, cx, cy, R) {
  let d = disc(cx, cy + R * 0.08, R * 0.74) + disc(cx - R * 0.38, cy + R * 0.2, R * 0.56) + disc(cx + R * 0.4, cy + R * 0.18, R * 0.54)
  const n = 10 + Math.round(R / 5)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4
    const rr = R * (0.76 + r() * 0.2)
    d += disc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.84, R * (0.16 + r() * 0.12))
  }
  return d
}

// Bat silhouette centred on its body; wings in their own group for flapping.
const BAT_WINGS =
  'M -1.5 -1 Q -5 -6.5 -8 -6.8 Q -12 -6.4 -15 -3 Q -12.6 -2.4 -10.6 1.6 Q -8.6 -0.4 -6 2.6 Q -4 0.6 -1.5 3.2 Z ' +
  'M 1.5 3.2 Q 4 0.6 6 2.6 Q 8.6 -0.4 10.6 1.6 Q 12.6 -2.4 15 -3 Q 12 -6.4 8 -6.8 Q 5 -6.5 1.5 -1 Z'
const BAT_BODY = `${oval(0, 0.8, 1.9, 3.4)} M -1.4 -1.8 L -1.9 -4.6 L -0.3 -2.4 Z M 0.3 -2.4 L 1.9 -4.6 L 1.4 -1.8 Z`

function bat({ x, y, s, path, dur, delay, flap, color = '#05080f' }) {
  return (
    <g key={`${path}${x}`} transform={`translate(${x} ${y})`}>
      <g className={`train-bat train-bat-${path}`} style={anim(dur, delay)}>
        <g transform={`scale(${s})`}>
          <g className="train-flap" style={anim(flap, delay / 9)}>
            <path d={BAT_WINGS} fill={color} />
          </g>
          <path d={BAT_BODY} fill={color} />
        </g>
      </g>
    </g>
  )
}

/* ================= sky ================= */

const MOON = [1120, 168, 56]

const sparkle = (x, y, s) => {
  const k = s * 0.13
  return `M ${f(x)} ${f(y - s)} L ${f(x + k)} ${f(y - k)} L ${f(x + s)} ${f(y)} L ${f(x + k)} ${f(y + k)} L ${f(x)} ${f(y + s)} L ${f(x - k)} ${f(y + k)} L ${f(x - s)} ${f(y)} L ${f(x - k)} ${f(y - k)} Z`
}

const stars = (() => {
  const r = rng(2718)
  const dots = []
  const sparks = []
  let tw = 0
  for (let i = 0; i < 200; i++) {
    const x = r() * W
    const y = r() * 560
    const b = r()
    const q = r()
    const k = r()
    const dm = Math.hypot(x - MOON[0], y - MOON[1])
    const fade = clamp((dm - 95) / 300) * clamp((590 - y) / 230)
    const op = (0.25 + 0.75 * b) * fade
    if (op < 0.06) continue
    const big = b > 0.965
    const rad = big ? 1.5 + q * 0.5 : 0.45 + q * 0.8
    const twinkle = !big && b > 0.5 && k < 0.3 && tw < 10
    if (twinkle) tw += 1
    dots.push(
      <circle
        key={i}
        className={twinkle ? 'train-tw' : undefined}
        cx={f(x)}
        cy={f(y)}
        r={rad.toFixed(2)}
        fill={q > 0.82 ? '#ffeccc' : q < 0.14 ? '#cdd9ff' : '#fff'}
        opacity={op.toFixed(2)}
        style={twinkle ? anim(2.8 + k * 12, -q * 8) : undefined}
      />,
    )
    if (big) sparks.push(<path key={i} d={sparkle(x, y, 6 + q * 5)} fill="#fff" opacity={(op * 0.6).toFixed(2)} />)
  }
  return { dots, sparks }
})()

// faint dust of the Milky Way, slanting down to the left horizon
const milkyDust = (() => {
  const r = rng(77)
  const out = []
  for (let i = 0; i < 120; i++) {
    const t = (r() - 0.5) * 900
    const n = (r() + r() + r() - 1.5) * 44
    const x = 250 + t * 0.5 + n * 0.866
    const y = 250 - t * 0.866 + n * 0.5
    const s = r()
    if (y < -20 || y > 540) continue
    out.push(
      <circle
        key={i}
        cx={f(x)}
        cy={f(y)}
        r={(0.35 + s * 0.55).toFixed(2)}
        fill="#e6ecff"
        opacity={((0.25 + 0.45 * s) * clamp((560 - y) / 200)).toFixed(2)}
      />,
    )
  }
  return out
})()

// tapered streak: head at (x,y), tail along unit (ux,uy)
const streak = (x, y, len, ux, uy, w) =>
  `M ${f(x - uy * w)} ${f(y + ux * w)} L ${f(x + ux * len)} ${f(y + uy * len)} L ${f(x + uy * w)} ${f(y - ux * w)} Z`

const skyLayer = (
  <Svg>
    <defs>
      {rad({ id: 'train-mw-g', stops: [[0, '#b5c3f2', 0.3], [0.45, '#8a9ddc', 0.12], [1, '#7086cc', 0]] })}
      {lin({ id: 'train-shoot-g', x2: 1, y2: 0, stops: [[0, '#fff'], [0.25, '#e6ecff', 0.55], [1, '#c8d4ff', 0]] })}
    </defs>
    <g transform="rotate(-58 240 250)">
      <ellipse cx="240" cy="250" rx="640" ry="130" fill="url(#train-mw-g)" opacity=".55" />
      <ellipse cx="300" cy="236" rx="380" ry="64" fill="url(#train-mw-g)" opacity=".35" />
    </g>
    {milkyDust}
    {stars.dots}
    {stars.sparks}
    <g className="train-shoot" style={anim(17, -6)}>
      <path d={streak(430, 64, 130, 0.92, -0.39, 1.2)} fill="url(#train-shoot-g)" />
      <circle cx="430" cy="64" r="1.6" fill="#fff" />
    </g>
    <g className="train-shoot train-shoot-b" style={anim(29, -21)}>
      <path d={streak(1336, 54, 90, 0.9, -0.44, 1)} fill="url(#train-shoot-g)" />
      <circle cx="1336" cy="54" r="1.3" fill="#fff" />
    </g>
  </Svg>
)

/* ================= moon & clouds ================= */

// y, scale, body opacity, lit intensity, duration, delay, seed
const CLOUDS = [
  [118, 0.8, 0.55, 0.7, 118, -47, 11],
  [160, 1.15, 0.72, 1, 96, -46, 12],
  [208, 0.95, 0.62, 0.9, 132, -82, 13],
  [254, 0.75, 0.5, 0.45, 104, -83, 14],
  [84, 0.6, 0.42, 0.4, 150, -45, 15],
]

// soft vapour: overlapping radial-gradient ellipses, no hard edges
function cloudPuffs(seed, cx, cy, s) {
  const r = rng(seed)
  const out = [[cx, cy + 3 * s, 175 * s, 11 * s]]
  for (let k = 0; k < 7; k++) {
    const t = k / 6 - 0.5
    const bulge = 1 - 3 * t * t
    out.push([
      cx + t * 270 * s + (r() - 0.5) * 22 * s,
      cy - (3 + 9 * bulge * r()) * s,
      (42 + r() * 32) * s,
      (10 + 15 * bulge * (0.5 + r() * 0.6)) * s,
    ])
  }
  return out
}

// thin strands of moonlit vapour low in the sky
function wisps(seed, cx, cy, len) {
  const r = rng(seed)
  return Array.from({ length: 5 }, (_, k) => {
    const t = k / 4 - 0.5
    return [cx + t * len * 0.8 + (r() - 0.5) * 30, cy + (r() - 0.5) * 10, len * (0.2 + r() * 0.12), 9 + r() * 9]
  })
}

const moonLayer = (
  <Svg>
    <defs>
      {rad({ id: 'train-skyglow-g', stops: [[0, '#dfe6ff', 0.3], [0.12, '#c8d3fb', 0.2], [0.3, '#9fb0ec', 0.08], [0.6, '#8095dc', 0.02], [1, '#8095dc', 0]] })}
      {rad({ id: 'train-moonglow-g', stops: [[0.5, '#fff6dc', 0.55], [0.62, '#fff2d6', 0.22], [1, '#ffeccc', 0]] })}
      {rad({ id: 'train-moon-g', cx: '.42', cy: '.38', r: '.68', stops: [[0, '#fffdf4'], [0.55, '#f7f0da'], [1, '#e2d6b4']] })}
      {rad({ id: 'train-cloud-g', cy: '.42', stops: [[0, '#5a6ba0', 0.75], [0.55, '#3c4c7c', 0.45], [1, '#2a3864', 0]] })}
      {rad({ id: 'train-cloudlit-g', cy: '.42', stops: [[0, '#f2f5ff', 0.85], [0.5, '#c6d2f4', 0.42], [1, '#a8b8e8', 0]] })}
      {rad({ id: 'train-band-g', cy: '.4', stops: [[0, '#7f92c8', 0.34], [0.6, '#5a6da4', 0.12], [1, '#4a5c94', 0]] })}
    </defs>
    <circle cx={MOON[0]} cy={MOON[1]} r="380" fill="url(#train-skyglow-g)" />
    <circle className="train-halo" cx={MOON[0]} cy={MOON[1]} r="112" fill="url(#train-moonglow-g)" />
    <circle cx={MOON[0]} cy={MOON[1]} r={MOON[2]} fill="url(#train-moon-g)" />
    <g className="train-soft" fill="#c4b48c" opacity=".5">
      <path
        d={
          oval(1100, 152, 17, 12) +
          oval(1132, 147, 10, 8) +
          oval(1141, 181, 15, 11) +
          oval(1112, 193, 9, 7) +
          oval(1088, 174, 8, 10) +
          oval(1152, 160, 6, 5)
        }
      />
    </g>
    <g>
      {[
        [1128, 201, 3.2],
        [1096, 131, 2.4],
        [1156, 193, 2],
        [1081, 160, 1.8],
        [1146, 130, 1.6],
      ].map(([x, y, s], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={s} fill="#d3c59f" opacity=".6" />
          <circle cx={x - 0.5} cy={y - 0.5} r={s * 0.62} fill="#f8f2df" opacity=".7" />
        </g>
      ))}
      <circle cx="1117" cy="207" r="2.2" fill="#fffbea" />
    </g>
    {[
      [21, 250, 392, 360, 70, -20],
      [22, 1262, 322, 400, 84, -50],
    ].map(([seed, cx, cy, len, dur, delay]) => (
      <g key={seed} className="train-band" style={anim(dur, delay)}>
        {wisps(seed, cx, cy, len).map(([x, y, rx, ry], k) => (
          <ellipse key={k} cx={f(x)} cy={f(y)} rx={f(rx)} ry={f(ry)} fill="url(#train-band-g)" />
        ))}
      </g>
    ))}
    {CLOUDS.map(([y, s, o, lit, dur, delay, seed], i) => {
      const ells = cloudPuffs(seed, MOON[0], y, s)
      return (
        <g key={i} className="train-cloud" style={anim(dur, delay)}>
          <g opacity={o}>
            {ells.map(([x, yy, rx, ry], k) => (
              <ellipse key={k} cx={f(x)} cy={f(yy)} rx={f(rx)} ry={f(ry)} fill="url(#train-cloud-g)" />
            ))}
          </g>
          <g className="train-cloud-lit" style={anim(dur, delay)}>
            <g opacity={lit}>
              {ells.map(([x, yy, rx, ry], k) => (
                <ellipse key={k} cx={f(x)} cy={f(yy)} rx={f(rx * 0.92)} ry={f(ry * 0.9)} fill="url(#train-cloudlit-g)" />
              ))}
            </g>
          </g>
        </g>
      )
    })}
  </Svg>
)

/* ================= far hills ================= */

const RA = [[-220, 470], [40, 450], [250, 462], [480, 444], [700, 458], [930, 438], [1180, 452], [1420, 440], [1660, 456]]
const RB = [[-220, 500], [100, 482], [340, 496], [600, 474], [820, 492], [1060, 478], [1300, 490], [1660, 480]]

function treeline(pts, seed, x0, x1, rMin, rMax) {
  const r = rng(seed)
  let d = ''
  let x = x0
  while (x < x1) {
    const rad = rMin + r() * (rMax - rMin)
    if (r() > 0.22) d += disc(x, ridgeY(pts, x) - rad * 0.4, rad)
    x += rad * (1.1 + r() * 0.9)
  }
  return d
}

const FARM_LIGHTS = [
  [180, 9, 1],
  [560, 12, 0],
  [652, 8, 1],
  [842, 13, 0],
  [1226, 10, 1],
  [1330, 14, 0],
].map(([x, dy, a]) => [x, ridgeY(RB, x) + dy, a])

const farLayer = (
  <Svg>
    <defs>
      {lin({ id: 'train-fa-g', user: true, y1: 430, y2: 560, stops: [[0, '#3a4e84'], [1, '#30437a']] })}
      {lin({ id: 'train-fb-g', user: true, y1: 470, y2: 600, stops: [[0, '#2a3c6d'], [1, '#203058']] })}
      {lin({ id: 'train-mist-g', stops: [[0, '#a3b6ea', 0], [0.5, '#a3b6ea', 0.26], [1, '#a3b6ea', 0]] })}
      {rad({ id: 'train-dot-g', stops: [[0, '#ffd48a', 0.7], [1, '#ffc060', 0]] })}
    </defs>
    <path d={hills(RA)} fill="url(#train-fa-g)" />
    <path d={crest(RA)} fill="none" stroke="#6a80bd" strokeWidth="1.2" opacity=".35" />
    <path d={treeline(RA, 31, -200, 1640, 2, 4)} fill="#394d83" />
    <rect className="train-mist" x={-PAD} y="460" width={W + 2 * PAD} height="62" fill="url(#train-mist-g)" style={anim(52, -20)} />
    <path d={hills(RB)} fill="url(#train-fb-g)" />
    <path d={crest(RB)} fill="none" stroke="#5a74b2" strokeWidth="1.4" opacity=".45" />
    <path d={treeline(RB, 32, -200, 1640, 3, 6.5)} fill="#2a3c6d" />
    {FARM_LIGHTS.map(([x, y, a], i) => (
      <g key={i} className={a ? 'train-farm' : undefined} style={a ? anim(17 + i * 4, -i * 7) : undefined}>
        <circle cx={f(x)} cy={f(y)} r="6" fill="url(#train-dot-g)" />
        <circle cx={f(x)} cy={f(y)} r="1.3" fill="#ffd690" />
      </g>
    ))}
    <rect
      className="train-mist train-mist-b"
      x={-PAD}
      y="494"
      width={W + 2 * PAD}
      height="74"
      fill="url(#train-mist-g)"
      style={anim(64, -41)}
    />
  </Svg>
)

/* ================= hill town & windmill ================= */

const TOWN = [[-220, 450], [60, 438], [260, 444], [430, 428], [610, 468], [745, 506], [880, 456], [1060, 404], [1250, 424], [1440, 448], [1660, 460]]
const ty = (x) => ridgeY(TOWN, x)

// x, width, height, roof (g = gable, h = hipped), chimney
const BACK = [
  [874, 18, 14, 'g'],
  [894, 24, 20, 'g', 1],
  [920, 16, 15, 'h'],
  [938, 26, 24, 'g', 1],
  [967, 20, 18, 'g'],
  [990, 22, 30, 'h'],
  [1014, 16, 20, 'g'],
  [1103, 24, 22, 'g', 1],
  [1129, 28, 26, 'g'],
  [1159, 18, 18, 'h'],
  [1179, 24, 16, 'g', 1],
  [1205, 18, 13, 'g'],
]
const FRONT = [
  [888, 28, 18, 'g'],
  [919, 22, 20, 'g'],
  [944, 30, 17, 'h', 1],
  [977, 24, 22, 'g'],
  [1064, 26, 18, 'g'],
  [1093, 20, 20, 'g'],
  [1116, 30, 16, 'h'],
  [1148, 26, 19, 'g', 1],
  [1177, 22, 14, 'g'],
]

const town = (() => {
  const r = rng(808)
  const build = (list, lift) => {
    const acc = { walls: '', roofs: '', rims: '', chims: '', wins: [], smokes: [] }
    for (const [x, w, h, type, chim] of list) {
      const base = ty(x + w / 2) + lift
      const top = base - h
      acc.walls += rect(x, top, w, h + (lift < 12 ? 18 : 2))
      const rh = type === 'g' ? 6 + w * 0.24 : 6
      if (type === 'g') {
        acc.roofs += `M ${f(x - 2)} ${f(top)} L ${f(x + w / 2)} ${f(top - rh)} L ${f(x + w + 2)} ${f(top)} Z `
        acc.rims += `M ${f(x + w / 2)} ${f(top - rh)} L ${f(x + w + 2)} ${f(top)} `
      } else {
        acc.roofs += `M ${f(x - 1.5)} ${f(top)} L ${f(x + 3)} ${f(top - rh)} L ${f(x + w - 3)} ${f(top - rh)} L ${f(x + w + 1.5)} ${f(top)} Z `
        acc.rims += `M ${f(x + 3)} ${f(top - rh)} L ${f(x + w - 3)} ${f(top - rh)} L ${f(x + w + 1.5)} ${f(top)} `
      }
      if (chim) {
        const cx = x + w * 0.7
        const cy = type === 'g' ? top - rh * 0.6 : top - rh
        acc.chims += rect(cx, cy - 7, 3.4, 9)
        acc.smokes.push([cx + 1.7, cy - 8])
      }
      const limit = base - (lift < 12 ? 14 : 8)
      for (let wy = top + 4; wy + 5 < limit; wy += 8.5) {
        for (let wx = x + 3; wx <= x + w - 7; wx += 7.5) acc.wins.push([wx, wy, r()])
      }
    }
    return acc
  }
  return { back: build(BACK, 8), front: build(FRONT, 18) }
})()

function townWindows(list, seed, maxAnim) {
  const r = rng(seed)
  let n = 0
  return list.map(([x, y, k], i) => {
    if (k > 0.6) return <rect key={i} x={f(x)} y={f(y)} width="4" height="5" fill="#0e1634" />
    const a = r()
    const b = r()
    const live = a < 0.6 && n < maxAnim
    if (live) n += 1
    return (
      <g
        key={i}
        className={live ? (b < 0.5 ? 'train-lamp' : 'train-lamp train-lamp-b') : undefined}
        style={live ? anim(12 + a * 34, -b * 46) : undefined}
      >
        <circle cx={f(x + 2)} cy={f(y + 2.5)} r="7" fill="url(#train-wglow-g)" />
        <rect x={f(x)} y={f(y)} width="4" height="5" fill="#ffd27c" />
      </g>
    )
  })
}

const CB = ty(1043) + 8 // church base
const church = (
  <g>
    <path d={rect(1052, CB - 28, 46, 40)} fill="#17234a" />
    <path d={`M 1050 ${f(CB - 28)} L 1056 ${f(CB - 42)} L 1096 ${f(CB - 42)} L 1101 ${f(CB - 28)} Z`} fill="#22305c" />
    <path d={`M 1056 ${f(CB - 42)} L 1096 ${f(CB - 42)} L 1101 ${f(CB - 28)}`} stroke="#6079b8" strokeWidth="1.2" fill="none" opacity=".8" />
    {[1061, 1073, 1085].map((x) => (
      <path
        key={x}
        d={`M ${x} ${f(CB - 10)} V ${f(CB - 19)} a 2.5 2.5 0 0 1 5 0 V ${f(CB - 10)} Z`}
        fill="url(#train-glass-g)"
      />
    ))}
    <circle cx="1075" cy={f(CB - 15)} r="22" fill="url(#train-wglow-g)" opacity=".55" />
    <path d={rect(1034, CB - 64, 18, 76)} fill="#152147" />
    <path d={rect(1049.4, CB - 64, 2.6, 64)} fill="#3f5696" opacity=".6" />
    <path d={rect(1032.5, CB - 66, 21, 3) + rect(1032.5, CB - 70, 3, 5) + rect(1050.5, CB - 70, 3, 5)} fill="#1b2851" />
    <path d={`M 1035.5 ${f(CB - 66)} L 1043 ${f(CB - 114)} L 1050.5 ${f(CB - 66)} Z`} fill="#18244c" />
    <path d={`M 1043 ${f(CB - 114)} L 1050.5 ${f(CB - 66)} L 1048 ${f(CB - 66)} Z`} fill="#5873b4" opacity=".75" />
    <path d={rect(1042.3, CB - 124, 1.4, 11) + rect(1039.6, CB - 120.5, 6.8, 1.4)} fill="#1b2851" />
    <path d={`M 1039.5 ${f(CB - 50)} v -7 a 3.5 3.5 0 0 1 7 0 v 7 Z`} fill="#ffcf80" opacity=".55" />
    <path d={`M 1039.5 ${f(CB - 54)} h 7 M 1039.5 ${f(CB - 52)} h 7`} stroke="#152147" strokeWidth=".8" />
    <circle cx="1043" cy={f(CB - 35)} r="13" fill="url(#train-wglow-g)" opacity=".6" />
    <circle cx="1043" cy={f(CB - 35)} r="5.2" fill="#f1e4bf" />
    <path d={`M 1043 ${f(CB - 35)} V ${f(CB - 38.6)} M 1043 ${f(CB - 35)} L 1045.6 ${f(CB - 33.8)}`} stroke="#3a2d1a" strokeWidth=".9" />
  </g>
)

// windmill on the left hill
const WMB = ty(430) + 5
const HUB = [430, WMB - 72]
const sails = (() => {
  let stock = ''
  let frame = ''
  let cloth = ''
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + 0.5
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const p = (al, sd) => `${f(ux * al - uy * sd)} ${f(uy * al + ux * sd)}`
    stock += ` M ${p(0, 0)} L ${p(60, 0)}`
    frame += ` M ${p(12, 2)} L ${p(58, 2)} M ${p(12, 12)} L ${p(58, 12)}`
    for (let j = 0; j <= 6; j++) {
      const al = 12 + j * (46 / 6)
      frame += ` M ${p(al, 0)} L ${p(al, 12)}`
    }
    cloth += ` M ${p(12, 2)} L ${p(58, 2)} L ${p(58, 12)} L ${p(12, 12)} Z`
  }
  return { stock, frame, cloth }
})()

const windmill = (
  <g>
    <path d={`M 413 ${WMB + 6} L 420 ${WMB - 66} L 440 ${WMB - 66} L 447 ${WMB + 6} Z`} fill="#18244b" />
    <path d={`M 440 ${WMB - 66} L 447 ${WMB + 6} L 443.5 ${WMB + 6} L 437.5 ${WMB - 66} Z`} fill="#4560a0" opacity=".65" />
    <path d={rect(408, WMB - 34, 44, 2.4)} fill="#121c3d" />
    <path d={`M 417 ${WMB - 64} Q 418 ${WMB - 80} 430 ${WMB - 81} Q 442 ${WMB - 80} 443 ${WMB - 64} Z`} fill="#1f2b55" />
    <path d={`M 430 ${WMB - 81} Q 442 ${WMB - 80} 443 ${WMB - 64}`} stroke="#6a83c2" strokeWidth="1.2" fill="none" opacity=".8" />
    <circle cx="430" cy={WMB - 7} r="11" fill="url(#train-wglow-g)" />
    <path d={`M 426.5 ${WMB} v -9 a 3.5 3.5 0 0 1 7 0 v 9 Z`} fill="#ffc46e" />
    <g className="train-lamp" style={anim(23, -9)}>
      <circle cx="430" cy={WMB - 48} r="7" fill="url(#train-wglow-g)" />
      <path d={rect(428, WMB - 51, 4, 6)} fill="#ffd27c" />
    </g>
    <g transform={`translate(${HUB[0]} ${HUB[1]})`}>
      <g className="train-sails">
        <path d={sails.cloth} fill="#2c3c6c" opacity=".55" />
        <path d={sails.frame} stroke="#33447a" strokeWidth="1.1" fill="none" />
        <path d={sails.stock} stroke="#3a4c84" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>
      <circle r="3.4" fill="#4a5d98" />
    </g>
  </g>
)

const HEDGES = [
  [[60, 470], [180, 462], [300, 468], [420, 462], [540, 476], [640, 496]],
  [[20, 500], [160, 494], [330, 502], [470, 498], [600, 512], [700, 530]],
  [[820, 500], [880, 484], [940, 478]],
  [[1150, 452], [1260, 466], [1400, 478], [1560, 486]],
  [[800, 534], [920, 512], [1040, 494], [1160, 490], [1290, 498], [1440, 508]],
]
const hedges = (() => {
  const r = rng(919)
  let line = ''
  let bush = ''
  for (const pts of HEDGES) {
    line += crest(pts) + ' '
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0] = pts[i]
      const [x1] = pts[i + 1]
      for (let x = x0; x < x1; x += 9 + r() * 14) {
        const y = ridgeY(pts, x)
        bush += disc(x, y - 1.5, 2 + r() * 2.2)
      }
    }
  }
  const field = `${crest(HEDGES[0])} L 700 530${crestSegs([...HEDGES[1]].reverse()).replace(/^ C/, ' C')} Z`
  return { line, bush, field }
})()

const HILL_TREES = [
  [120, 'r', 7, 6],
  [162, 'r', 6, 9],
  [300, 'p', 12, 4],
  [372, 'r', 7, 6],
  [388, 'r', 5.5, 9],
  [478, 'r', 8, 8],
  [494, 'r', 6, 12],
  [520, 'p', 13, 10],
  [532, 'p', 11, 12],
  [634, 'r', 6, 6],
  [660, 'r', 7.5, 8],
  [858, 'p', 14, 4],
  [870, 'p', 12, 6],
  [1224, 'r', 8, 6],
  [1240, 'r', 6.5, 9],
  [1264, 'p', 13, 5],
  [1330, 'r', 9, 8],
]
const hillTrees = (() => {
  let rim = ''
  let body = ''
  for (const [x, kind, s, dy] of HILL_TREES) {
    const base = ty(x) + dy
    const dx = x < MOON[0] ? 1.3 : -1.3
    const shape = kind === 'p' ? oval(x, base - s, s * 0.32, s) : disc(x, base - s * 1.15, s) + disc(x - s * 0.55, base - s * 0.8, s * 0.6)
    body += shape + rect(x - 1, base - s * 0.4, 2, s * 0.5)
    rim += kind === 'p' ? oval(x + dx, base - s - 1.3, s * 0.32, s) : disc(x + dx, base - s * 1.15 - 1.3, s)
  }
  return { rim, body }
})()

const FB = ty(586) + 6 // farmhouse base
const farmhouse = (
  <g>
    <path d={rect(568, FB - 18, 36, 20) + rect(596, FB - 33, 3.4, 9) + rect(608, FB - 14, 26, 16)} fill="#16224a" />
    <path d={`M 565 ${f(FB - 18)} L 586 ${f(FB - 30)} L 607 ${f(FB - 18)} Z M 606 ${f(FB - 14)} L 612 ${f(FB - 22)} L 630 ${f(FB - 22)} L 636 ${f(FB - 14)} Z`} fill="#22305c" />
    <path d={`M 586 ${f(FB - 30)} L 607 ${f(FB - 18)} M 612 ${f(FB - 22)} L 630 ${f(FB - 22)} L 636 ${f(FB - 14)}`} stroke="#5f78b6" strokeWidth="1.1" fill="none" opacity=".8" />
    <g className="train-lamp train-lamp-b" style={anim(31, -4)}>
      <circle cx="577" cy={f(FB - 9)} r="9" fill="url(#train-wglow-g)" />
      <path d={rect(574.5, FB - 12, 5, 6)} fill="#ffd27c" />
    </g>
    <path d={rect(588, FB - 11, 6, 6)} fill="#ffc46e" opacity=".9" />
  </g>
)

const SMOKES = [[597.7, FB - 34], town.back.smokes[1], town.back.smokes[3]]
const chimneySmoke = SMOKES.flatMap(([x, y], k) =>
  [0, 1, 2].map((j) => (
    <g key={`${k}-${j}`} transform={`translate(${f(x)} ${f(y)})`}>
      <ellipse className="train-csmoke" rx="5" ry="3.4" fill="url(#train-csmoke-g)" style={anim(7 + k * 0.8, -j * (7 + k * 0.8) / 3 - k * 1.3)} />
    </g>
  )),
)

const townLayer = (
  <Svg>
    <defs>
      {lin({ id: 'train-hill-g', user: true, y1: 400, y2: 560, stops: [[0, '#24345f'], [1, '#172246']] })}
      {rad({ id: 'train-wglow-g', stops: [[0, '#ffcf7a', 0.5], [1, '#ffb860', 0]] })}
      {lin({ id: 'train-glass-g', stops: [[0, '#ffd88e'], [0.6, '#ffae5a'], [1, '#e2784a']] })}
      {rad({ id: 'train-csmoke-g', stops: [[0, '#b4c0e4', 0.55], [0.6, '#93a2cf', 0.24], [1, '#8a9acb', 0]] })}
    </defs>
    {/* back row of houses, half sunk behind the crest */}
    <path d={town.back.walls + town.back.chims} fill="#16224a" />
    <path d={town.back.roofs} fill="#22305c" />
    <path d={town.back.rims} stroke="#5f78b6" strokeWidth="1.1" fill="none" opacity=".8" />
    {townWindows(town.back.wins, 4242, 7)}
    {church}
    {windmill}
    <path d={hills(TOWN)} fill="url(#train-hill-g)" />
    <path d={hedges.field} fill="#2c3d6d" opacity=".32" />
    <path d={crest(TOWN.slice(0, 7))} stroke="#5770ae" strokeWidth="1.6" fill="none" opacity=".55" />
    <path d={crest(TOWN.slice(8))} stroke="#5770ae" strokeWidth="1.6" fill="none" opacity=".55" />
    <path d={hedges.line} stroke="#111a3b" strokeWidth="1.5" fill="none" />
    <path d={hedges.bush} fill="#121b3d" />
    <path d={hillTrees.rim} fill="#3c5290" opacity=".7" />
    <path d={hillTrees.body} fill="#121c3e" />
    {farmhouse}
    {/* front row, lower on the slope */}
    <path d={town.front.walls + town.front.chims} fill="#17244c" />
    <path d={town.front.roofs} fill="#24335f" />
    <path d={town.front.rims} stroke="#6079b8" strokeWidth="1.1" fill="none" opacity=".8" />
    {townWindows(town.front.wins, 5353, 6)}
    {chimneySmoke}
    {bat({ x: 1043, y: CB - 138, s: 0.5, path: 'c1', dur: 7.5, delay: -2, flap: 0.2, color: '#0a1024' })}
    {bat({ x: 972, y: CB - 96, s: 0.45, path: 'c2', dur: 9.5, delay: -5, flap: 0.17, color: '#0a1024' })}
  </Svg>
)

/* ================= viaduct & river ================= */

const DECK = 543 // parapet top
const SPRING = 652
const AR = 58
const PITCH = 144
const WL = 734 // water line
const ARCH_C = Array.from({ length: 13 }, (_, i) => 720 + (i - 6) * PITCH)

// x-intervals of solid stone at height y
function solidAt(y, cut = 0) {
  if (y < SPRING - AR) return [[-PAD, W + PAD]]
  const hw = y >= SPRING ? AR - cut : Math.sqrt(AR * AR - (SPRING - y) ** 2)
  const segs = [[-PAD, ARCH_C[0] - hw]]
  for (let i = 0; i < ARCH_C.length - 1; i++) segs.push([ARCH_C[i] + hw, ARCH_C[i + 1] - hw])
  segs.push([ARCH_C[ARCH_C.length - 1] + hw, W + PAD])
  return segs
}

const viaduct = (() => {
  let body = rect(-PAD, DECK, W + 2 * PAD, WL - DECK + 2)
  let ring = ''
  let ringJoints = ''
  let keys = ''
  let soffit = ''
  let inner = ''
  let rims = ''
  let cutwater = ''
  let cutRim = ''
  let foam = ''
  for (const c of ARCH_C) {
    body += ` M ${c - AR} ${WL + 2} L ${c - AR} ${SPRING} A ${AR} ${AR} 0 0 1 ${c + AR} ${SPRING} L ${c + AR} ${WL + 2} Z`
    const R2 = AR + 12
    ring += ` M ${c - R2} ${SPRING} A ${R2} ${R2} 0 0 1 ${c + R2} ${SPRING} L ${c + AR} ${SPRING} A ${AR} ${AR} 0 0 0 ${c - AR} ${SPRING} Z`
    for (let k = 1; k < 17; k++) {
      const a = Math.PI + (k / 17) * Math.PI
      ringJoints += ` M ${f(c + Math.cos(a) * AR)} ${f(SPRING + Math.sin(a) * AR)} L ${f(c + Math.cos(a) * R2)} ${f(SPRING + Math.sin(a) * R2)}`
    }
    keys += ` M ${f(c - 5)} ${SPRING - AR + 1} L ${f(c - 6.5)} ${SPRING - R2 - 3} L ${f(c + 6.5)} ${SPRING - R2 - 3} L ${f(c + 5)} ${SPRING - AR + 1} Z`
    // underside of the barrel vault, and the inner face of one pier (perspective)
    soffit += ` M ${c - AR} ${SPRING} A ${AR} ${AR} 0 0 1 ${c + AR} ${SPRING} A ${AR} ${AR - 10} 0 0 0 ${c - AR} ${SPRING} Z`
    const iw = clamp(Math.abs(c - 720) * 0.007, 0, 6)
    if (iw > 0.5) inner += c < 720 ? rect(c + AR - iw, SPRING, iw, WL - SPRING) : rect(c - AR, SPRING, iw, WL - SPRING)
    // pier to the right of this arch
    const pl = c + AR
    const pr = c + PITCH - AR
    const pm = (pl + pr) / 2
    const lit = pm < MOON[0]
    rims += rect(lit ? pr - 2 : pl, SPRING - 4, 2, WL - SPRING - 20)
    cutwater += ` M ${pl - 5} ${WL + 2} L ${pl - 5} ${WL - 20} L ${pm} ${WL - 32} L ${pr + 5} ${WL - 20} L ${pr + 5} ${WL + 2} Z`
    cutRim += lit ? ` M ${pm} ${WL - 32} L ${pr + 5} ${WL - 20} L ${pr + 5} ${WL}` : ` M ${pm} ${WL - 32} L ${pl - 5} ${WL - 20} L ${pl - 5} ${WL}`
    foam += oval(pm, WL + 1.6, PITCH - 2 * AR + 4, 1.8)
  }
  return { body, ring, ringJoints, keys, soffit, inner, rims, cutwater, cutRim, foam }
})()

// ashlar courses on the solid stone
const masonry = (() => {
  const r = rng(616)
  let joints = ''
  let stones = ''
  let dark = ''
  for (let y = 566; y < WL - 4; y += 9) {
    for (const [a, b] of solidAt(y + 4.5)) {
      if (b - a < 4) continue
      joints += ` M ${f(a)} ${y} H ${f(b)}`
      let x = a + r() * 18
      while (x < b - 4) {
        joints += ` M ${f(x)} ${y} v 9`
        const w = 16 + r() * 16
        const q = r()
        if (q < 0.13) stones += rect(x, y, Math.min(w, b - x), 9)
        else if (q > 0.9) dark += rect(x, y, Math.min(w, b - x), 9)
        x += w
      }
    }
  }
  return { joints, stones, dark }
})()

// the viaduct mirrored in the river, in horizontal bands that waver
const reflection = (() => {
  const out = []
  let y = WL + 0.5
  const hs = [5, 6, 7, 9, 10, 12, 14, 17]
  hs.forEach((h, i) => {
    const yo = 2 * WL - (y + h / 2)
    let d = ''
    for (const [a, b] of solidAt(yo)) {
      const pad = yo > WL - 22 && yo >= SPRING ? 5 : 0
      d += rect(a - pad, y, b - a + 2 * pad, h)
    }
    out.push({ d, i, cls: i < 2 ? 'train-wave1' : i < 5 ? 'train-wave2' : 'train-wave3' })
    y += h + 1.8 + i * 0.3
  })
  return out
})()

const valleyTrees = (() => {
  const r = rng(3131)
  let d = ''
  let x = -PAD
  while (x < W + PAD) {
    const h = 14 + r() * 30
    const w = 10 + r() * 14
    const base = 708
    if (r() < 0.3) d += oval(x, base - h * 0.75, w * 0.28, h * 0.75)
    else d += disc(x, base - h * 0.55, w * 0.55) + disc(x + w * 0.3, base - h * 0.4, w * 0.45) + disc(x - w * 0.3, base - h * 0.35, w * 0.42) + rect(x - w * 0.6, base - h * 0.4, w * 1.2, h * 0.4)
    x += w * (0.7 + r() * 1.2)
  }
  return d
})()

const ripples = (() => {
  const r = rng(2020)
  let d = ''
  for (let i = 0; i < 34; i++) {
    const y = WL + 6 + r() * 120
    const x = -60 + r() * (W + 120)
    const len = 14 + (y - WL) * 0.5 + r() * 40
    d += ` M ${f(x)} ${f(y)} h ${f(len)}`
  }
  return d
})()

const glints = (() => {
  const r = rng(515)
  return Array.from({ length: 10 }, (_, i) => {
    const y = WL + 6 + r() * 116
    const spread = 50 + (y - WL) * 0.9
    const x = MOON[0] + (r() - 0.5) * spread
    const len = 6 + (y - WL) * 0.16 + r() * 12
    return (
      <line
        key={i}
        className="train-glint"
        x1={f(x - len / 2)}
        y1={f(y)}
        x2={f(x + len / 2)}
        y2={f(y)}
        stroke="#f0f4ff"
        strokeWidth="1.7"
        strokeLinecap="round"
        style={anim(1.8 + r() * 2.6, -r() * 4)}
      />
    )
  })
})()

const farGlints = (() => {
  const r = rng(616)
  let d = ''
  for (let i = 0; i < 16; i++) {
    const y = 712 + r() * 18
    const x = MOON[0] + (r() - 0.5) * 160 + (r() < 0.3 ? (r() - 0.5) * 900 : 0)
    d += ` M ${f(x)} ${f(y)} h ${f(4 + r() * 10)}`
  }
  return d
})()

const boat = (
  <g className="train-boat" style={anim(80, -26)}>
    <g transform="translate(380 796) scale(1.35)">
      <g className="train-boatglow">
        {[8, 13, 19, 26, 34].map((dy, i) => (
          <rect key={i} x={-21 - (i % 2)} y={dy} width={6 + i * 1.5} height="1.6" rx=".8" fill="#ffc66e" opacity={(0.8 - i * 0.14).toFixed(2)} />
        ))}
      </g>
      <g className="train-bob">
        <circle cx="-18" cy="-19" r="20" fill="url(#train-lantern-g)" />
        <path d="M -24 -4 Q -22 4 -13 5.5 L 15 5.5 Q 23 4 26 -5 Z" fill="#060a16" />
        <path d="M -24 -4 L 26 -5" stroke="#6a82c0" strokeWidth="1.1" opacity=".8" />
        <path
          d="M -5 -4 Q -7 -14 -2.5 -16 Q 1.5 -16.5 1.5 -10 L 2.5 -4 Z M -4.6 -19.6 a 3.2 3.2 0 1 1 6.4 0 a 3.2 3.2 0 1 1 -6.4 0 Z M -6 -21.6 h 9.6 v 1.2 h -9.6 Z"
          fill="#060a16"
        />
        <path d="M 1 -12 Q 20 -32 46 -30" stroke="#0b1122" strokeWidth="1" fill="none" />
        <path d="M 46 -30 L 47 5" stroke="#8ea2d8" strokeWidth=".5" opacity=".5" />
        <path d="M -18 -4 V -16" stroke="#060a16" strokeWidth="1.3" />
        <path d={rect(-20.5, -22, 5, 6)} fill="#ffd88a" />
      </g>
    </g>
  </g>
)

const viaductLayer = (
  <Svg>
    <defs>
      {lin({ id: 'train-valley-g', user: true, y1: 575, y2: 708, stops: [[0, '#1b2950'], [0.45, '#25386a'], [0.85, '#34498a'], [1, '#3f5799']] })}
      {lin({ id: 'train-vmist-g', user: true, y1: 650, y2: 712, stops: [[0, '#9cb0e8', 0], [0.7, '#9cb0e8', 0.32], [1, '#b7c6f0', 0.45]] })}
      {lin({ id: 'train-farwater-g', user: true, y1: 706, y2: 736, stops: [[0, '#3d5596'], [1, '#2f457f']] })}
      {lin({ id: 'train-water-g', user: true, y1: WL, y2: 880, stops: [[0, '#2e4380'], [0.5, '#22356a'], [1, '#172652']] })}
      {rad({ id: 'train-sheen-g', stops: [[0, '#b9c8f2', 0.34], [0.5, '#9fb2e6', 0.12], [1, '#9fb2e6', 0]] })}
      {lin({ id: 'train-stone-g', user: true, y1: DECK, y2: WL, stops: [[0, '#1f2b56'], [0.12, '#18234b'], [0.55, '#121b3f'], [1, '#0b1230']] })}
      {lin({ id: 'train-shadow-g', stops: [[0, '#050918', 0.85], [1, '#050918', 0]] })}
      {rad({ id: 'train-wisp-g', stops: [[0, '#a9bbec', 0.3], [1, '#a9bbec', 0]] })}
      {rad({ id: 'train-lantern-g', stops: [[0, '#ffe09a', 0.9], [0.3, '#ffc060', 0.35], [1, '#ffb050', 0]] })}
    </defs>

    {/* the misty valley seen through the arches */}
    <path d={rect(-PAD, 575, W + 2 * PAD, 136)} fill="url(#train-valley-g)" />
    <path d={valleyTrees} fill="#1e2d5c" />
    <path d={rect(-PAD, 650, W + 2 * PAD, 62)} fill="url(#train-vmist-g)" />
    <path d={rect(-PAD, 706, W + 2 * PAD, 32)} fill="url(#train-farwater-g)" />
    <path d={`M ${-PAD} 706.5 H ${W + PAD}`} stroke="#1a2850" strokeWidth="1.6" />
    <path d={farGlints} stroke="#d8e2ff" strokeWidth="1.3" strokeLinecap="round" opacity=".55" />

    {/* the river in front, with the moon's sheen */}
    <path d={rect(-PAD, WL, W + 2 * PAD, H + 100 - WL)} fill="url(#train-water-g)" />
    <ellipse cx={MOON[0]} cy="806" rx="170" ry="74" fill="url(#train-sheen-g)" />
    {reflection.map(({ d, i, cls }) => (
      <path key={i} className={cls} d={d} fill="#0a1230" opacity=".78" style={anim(2.4 + i * 0.37, -i * 0.9)} />
    ))}
    <path d={ripples} stroke="#7489c6" strokeWidth="1" strokeLinecap="round" opacity=".28" />
    {glints}
    {boat}

    {/* the viaduct */}
    <path d={viaduct.body} fill="url(#train-stone-g)" fillRule="evenodd" />
    <path d={masonry.stones} fill="#26345f" opacity=".45" />
    <path d={masonry.dark} fill="#070c22" opacity=".35" />
    <path d={masonry.joints} stroke="#070c22" strokeWidth=".9" opacity=".55" fill="none" />
    <path d={viaduct.soffit} fill="#060a1b" />
    <path d={viaduct.inner} fill="#080d22" />
    <path d={viaduct.ring} fill="#1c2852" />
    <path d={viaduct.ringJoints} stroke="#080d24" strokeWidth=".9" opacity=".8" />
    <path d={viaduct.keys} fill="#27355f" />
    <path d={viaduct.rims} fill="#3b5190" opacity=".55" />
    <path d={viaduct.cutwater} fill="#131c3f" />
    <path d={viaduct.cutRim} stroke="#566fb0" strokeWidth="1.3" fill="none" opacity=".7" />
    <path d={viaduct.foam} fill="#93a7dc" opacity=".35" />
    {/* cornice, its shadow, and the moonlit parapet */}
    <path d={rect(-PAD, 557, W + 2 * PAD, 10)} fill="url(#train-shadow-g)" />
    <path d={rect(-PAD, 550.5, W + 2 * PAD, 7)} fill="#1b274f" />
    <path d={`M ${-PAD} 551.2 H ${W + PAD}`} stroke="#5d74b4" strokeWidth="1" opacity=".6" />
    <path d={rect(-PAD, DECK, W + 2 * PAD, 7.5)} fill="#1d2953" />
    <path
      d={Array.from({ length: 56 }, (_, i) => `M ${-PAD + 12 + i * 34} ${DECK} v 7.5`).join(' ')}
      stroke="#0b1230"
      strokeWidth="1"
      opacity=".7"
    />
    <path d={`M ${-PAD} ${DECK + 0.6} H ${W + PAD}`} stroke="#8296d0" strokeWidth="1.3" opacity=".85" />
    {/* rail head above the parapet */}
    <path d={`M ${-PAD} 539.6 H ${W + PAD}`} stroke="#1a2240" strokeWidth="2.6" />
    <path d={`M ${-PAD} 538.6 H ${W + PAD}`} stroke="#9db0e0" strokeWidth=".8" opacity=".75" />

    {/* low mist curling round the pier feet */}
    <g className="train-wisp" style={anim(34, -12)}>
      <ellipse cx="420" cy="738" rx="260" ry="16" fill="url(#train-wisp-g)" />
      <ellipse cx="1180" cy="742" rx="300" ry="18" fill="url(#train-wisp-g)" />
    </g>
    <g className="train-wisp train-wisp-b" style={anim(41, -30)}>
      <ellipse cx="820" cy="736" rx="240" ry="14" fill="url(#train-wisp-g)" />
      <ellipse cx="60" cy="740" rx="200" ry="15" fill="url(#train-wisp-g)" />
    </g>
  </Svg>
)

/* ================= the night train ================= */
// Local coords: rail top at y = 0, x runs rear (0) → front (866).

const RAIL = 540
const CARS = [0, 138, 276, 414]
const passenger = (cx, hat, small) => {
  const s = small ? 0.8 : 1
  const hy = -51.5 + (small ? 2.2 : 0)
  let d = disc(cx, hy, 2.9 * s)
  d += ` M ${f(cx - 5 * s)} -44 Q ${f(cx - 5 * s)} ${f(hy + 4.6 * s)} ${f(cx)} ${f(hy + 4 * s)} Q ${f(cx + 5 * s)} ${f(hy + 4.6 * s)} ${f(cx + 5 * s)} -44 Z`
  if (hat) d += rect(cx - 4.2, hy - 3.2, 8.4, 1.2) + ` M ${f(cx - 2.6)} ${f(hy - 2.2)} Q ${f(cx)} ${f(hy - 6.5)} ${f(cx + 2.6)} ${f(hy - 2.2)} Z`
  return d
}

const cars = (() => {
  const r = rng(5150)
  const o = { body: '', roof: '', roofRim: '', lining: '', under: '', wheels: '', glass: '', glow: '', people: '', curtains: '', blinds: '', racks: '', doors: '', vents: '', spill: '', gang: '' }
  for (const x0 of CARS) {
    o.body += `M ${x0} -18 L ${x0} -66 Q ${x0} -70 ${x0 + 4} -70 L ${x0 + 128} -70 Q ${x0 + 132} -70 ${x0 + 132} -66 L ${x0 + 132} -18 Z `
    o.roof += `M ${x0 - 1.5} -69 Q ${x0 + 66} -86 ${x0 + 133.5} -69 Z `
    o.roofRim += `M ${x0 + 2} -71.4 Q ${x0 + 66} -86.8 ${x0 + 130} -71.4 `
    o.lining += `M ${x0 + 3} -40 H ${x0 + 129} M ${x0 + 3} -65.5 H ${x0 + 129} `
    o.under += rect(x0 + 2, -19, 128, 4) + rect(x0 + 50, -15, 32, 6)
    for (const bx of [x0 + 22, x0 + 110]) {
      o.under += rect(bx - 18, -15.5, 36, 5)
      for (const wx of [bx - 10, bx + 10]) o.wheels += disc(wx, -7.5, 7.5)
    }
    o.doors += rect(x0 + 3, -64, 9, 45) + rect(x0 + 120, -64, 9, 45)
    o.glass += rect(x0 + 5, -60, 5, 10) + rect(x0 + 122, -60, 5, 10)
    for (let k = 0; k < 6; k++) {
      const wx = x0 + 17 + k * 17
      o.glass += `M ${wx} -44 V -59 Q ${wx} -62 ${wx + 3} -62 H ${wx + 9} Q ${wx + 12} -62 ${wx + 12} -59 V -44 Z `
      o.glow += rect(wx - 2.5, -64.5, 17, 23)
      o.racks += `M ${wx} -56.5 H ${wx + 12} `
      const v = r()
      const a = r()
      const b = r()
      if (v < 0.4) o.people += passenger(wx + 6 + (a - 0.5) * 2.4, b < 0.35, false)
      else if (v < 0.56) o.people += passenger(wx + 3.6, b < 0.3, false) + passenger(wx + 8.8, false, true)
      else if (v < 0.7) o.blinds += rect(wx, -62, 12, 5 + a * 6)
      if (r() < 0.4) o.curtains += rect(wx, -62, 2.4, 18) + rect(wx + 9.6, -62, 2.4, 18)
    }
    for (const t of [0.2, 0.4, 0.6, 0.8]) o.vents += disc(x0 - 1.5 + t * 135, -69.5 - 34 * t * (1 - t), 2)
    o.spill += rect(x0 + 4, 3, 124, 12)
    if (x0 > 0) o.gang += rect(x0 - 6, -62, 6, 42)
  }
  o.gang += rect(546, -60, 8, 40)
  return o
})()

// smoke trail: puffs leave the chimney and drift back as the train runs on
const PUFF_N = 19
const PUFF_LIFE = 7.6
const puffs = (() => {
  const r = rng(4040)
  return Array.from({ length: PUFF_N }, (_, i) => {
    let d = ''
    for (let k = 0; k < 5; k++) d += disc((r() - 0.5) * 22, (r() - 0.5) * 12, 8.5 + r() * 5.5)
    return (
      <path
        key={i}
        className={i % 2 ? 'train-puff train-puff-b' : 'train-puff'}
        d={d}
        fill="url(#train-smoke-g)"
        style={anim(PUFF_LIFE, (-i * PUFF_LIFE) / PUFF_N)}
      />
    )
  })
})()

function spokes(n, r0, r1) {
  let d = ''
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.13
    d += ` M ${f(Math.cos(a) * r0)} ${f(Math.sin(a) * r0)} L ${f(Math.cos(a) * r1)} ${f(Math.sin(a) * r1)}`
  }
  return d
}
const counterweight = (() => {
  const p = (a, rr) => `${f(Math.cos((a * Math.PI) / 180) * rr)} ${f(Math.sin((a * Math.PI) / 180) * rr)}`
  return `M ${p(130, 5.5)} L ${p(130, 15.5)} A 15.5 15.5 0 0 1 ${p(230, 15.5)} L ${p(230, 5.5)} A 5.5 5.5 0 0 0 ${p(130, 5.5)} Z`
})()

const DRIVERS = [690, 732, 774]
const LEADERS = [812, 836]
const rimArc = (r) => `M ${f(Math.cos(-1.9) * r)} ${f(Math.sin(-1.9) * r)} A ${r} ${r} 0 0 1 ${f(Math.cos(-0.2) * r)} ${f(Math.sin(-0.2) * r)}`

const driverWheel = (
  <>
    <circle r="19" fill="#05090c" />
    <circle r="17.2" fill="none" stroke="#34424f" strokeWidth="2.6" />
    <path d={spokes(12, 4.5, 16)} stroke="#43566a" strokeWidth="1.8" />
    <path d={counterweight} fill="#1c2830" />
    <circle r="4.6" fill="#2f3d49" />
    <circle cx="8" r="2.6" fill="#9aabc6" />
  </>
)
const leadWheel = (
  <>
    <circle r="10" fill="#05090c" />
    <circle r="8.8" fill="none" stroke="#34424f" strokeWidth="2" />
    <path d={spokes(8, 2.6, 8)} stroke="#43566a" strokeWidth="1.4" />
    <circle r="2.6" fill="#2f3d49" />
  </>
)

const trainLayer = (
  <Svg>
    <defs>
      {lin({ id: 'train-car-g', user: true, y1: -72, y2: -16, stops: [[0, '#3d2233'], [0.12, '#2d1423'], [0.6, '#24101c'], [1, '#160910']] })}
      {lin({ id: 'train-roof-g', user: true, y1: -86, y2: -68, stops: [[0, '#3e4769'], [1, '#121522']] })}
      {lin({ id: 'train-win-g', user: true, y1: -62, y2: -44, stops: [[0, '#fff1c4'], [0.5, '#ffd581'], [1, '#ffa94a']] })}
      {lin({ id: 'train-cabwin-g', user: true, y1: -76, y2: -60, stops: [[0, '#ffc77a'], [1, '#ff8a38']] })}
      {lin({ id: 'train-boiler-g', user: true, y1: -70, y2: -34, stops: [[0, '#7593b0'], [0.1, '#30495a'], [0.35, '#13222a'], [0.75, '#0a1418'], [1, '#05090c']] })}
      {lin({ id: 'train-tender-g', user: true, y1: -60, y2: -16, stops: [[0, '#4a6680'], [0.08, '#1a2a32'], [0.5, '#0f191d'], [1, '#070c0e']] })}
      {lin({ id: 'train-brass-g', x1: 0, y1: 0, x2: 1, y2: 1, stops: [[0, '#f6e0a6'], [0.4, '#c39a52'], [1, '#4a3416']] })}
      {lin({ id: 'train-beam-g', user: true, x1: 848, y1: 0, x2: 1180, y2: 0, stops: [[0, '#fff2cf', 0.5], [0.25, '#fff0c8', 0.22], [0.6, '#ffeec4', 0.07], [1, '#ffeec4', 0]] })}
      {lin({ id: 'train-railglint-g', user: true, x1: 862, y1: 0, x2: 1110, y2: 0, stops: [[0, '#ffe9b0', 0.9], [1, '#ffe9b0', 0]] })}
      {lin({ id: 'train-spill-g', user: true, y1: 3, y2: 15, stops: [[0, '#ffb862', 0.42], [1, '#ffb862', 0]] })}
      {rad({ id: 'train-lamp-g', stops: [[0, '#fffef5', 0.95], [0.12, '#fff1c4', 0.7], [0.4, '#ffe3a0', 0.18], [1, '#ffe3a0', 0]] })}
      {rad({ id: 'train-fire-g', stops: [[0, '#ffb35a', 0.75], [0.45, '#ff8a3a', 0.28], [1, '#ff7a2a', 0]] })}
      <radialGradient id="train-smoke-g" cx=".5" cy=".55" r=".55" fx=".55" fy=".28">
        <stop offset="0" stopColor="#eef2fc" stopOpacity=".96" />
        <stop offset=".38" stopColor="#aab5d4" stopOpacity=".92" />
        <stop offset=".72" stopColor="#6c779c" stopOpacity=".7" />
        <stop offset="1" stopColor="#4a5478" stopOpacity="0" />
      </radialGradient>
      {rad({ id: 'train-smokeglow-g', cy: '.62', stops: [[0, '#ffa452', 0.42], [0.5, '#ff9446', 0.16], [1, '#ff8a3a', 0]] })}
      {rad({ id: 'train-steam-g', stops: [[0, '#eef2fc', 0.7], [1, '#dfe6f7', 0]] })}
    </defs>
    <g className="train-run">
      <g transform={`translate(0 ${RAIL})`}>
        {/* headlamp beam cutting the night, and the lit rails ahead */}
        <path d="M 848 -78 L 1180 -118 L 1180 -4 L 848 -72 Z" fill="url(#train-beam-g)" />
        <path d="M 848 -77 L 1060 -94 L 1060 -56 L 848 -73.5 Z" fill="url(#train-beam-g)" opacity=".8" />
        <path d="M 862 -1 H 1110" stroke="url(#train-railglint-g)" strokeWidth="1.8" />

        <g transform="translate(832 -98)">{puffs}</g>
        {/* firelight from the open firebox, caught on the underside of the smoke */}
        <g className="train-fire">
          <ellipse cx="760" cy="-118" rx="104" ry="44" transform="rotate(-14 760 -118)" fill="url(#train-smokeglow-g)" />
        </g>

        {/* warm light from the windows on the parapet */}
        <path d={cars.spill} fill="url(#train-spill-g)" />
        <path d={rect(612, 3, 60, 12)} fill="url(#train-spill-g)" />

        {/* carriages */}
        <path d={cars.under} fill="#07090f" />
        <path d={cars.wheels} fill="#080b14" stroke="#4b5c8c" strokeWidth="1.1" />
        <path d={cars.gang} fill="#0a0c16" />
        <path d={cars.body} fill="url(#train-car-g)" />
        <path d={cars.doors} fill="none" stroke="#12070c" strokeWidth=".9" />
        <path d={cars.glow} fill="#ffb04a" opacity=".13" />
        <path d={cars.glass} fill="url(#train-win-g)" />
        <path d={cars.blinds} fill="#f2d9a2" opacity=".55" />
        <path d={cars.racks} stroke="#9b6730" strokeWidth=".8" opacity=".55" />
        <path d={cars.people} fill="#4a2210" opacity=".86" />
        <path d={cars.curtains} fill="#8e3524" opacity=".6" />
        <path d={cars.lining} stroke="#c99a52" strokeWidth=".9" opacity=".5" />
        <path d={cars.roof} fill="url(#train-roof-g)" />
        <path d={cars.vents} fill="#1a1f30" />
        <path d={cars.roofRim} stroke="#a3b6e8" strokeWidth="1.4" fill="none" opacity=".75" />

        {/* tender */}
        <path d={rect(554, -20, 82, 5)} fill="#07090f" />
        {[570, 596, 622].map((x) => (
          <circle key={x} cx={x} cy="-8" r="8" fill="#080b14" stroke="#4b5c8c" strokeWidth="1.1" />
        ))}
        <path d="M 556 -18 L 556 -56 Q 556 -60 560 -60 L 630 -60 Q 634 -60 634 -56 L 634 -18 Z" fill="url(#train-tender-g)" />
        <path d="M 559 -60 Q 566 -69 576 -64 Q 586 -72 598 -65 Q 610 -71 620 -63 Q 627 -66 632 -60 Z" fill="#090b12" />
        <path d="M 566 -64.5 l 1.4 -.8 M 584 -68 l 1.6 -.6 M 603 -66.5 l 1.2 -.9 M 619 -63.8 l 1.4 -.5" stroke="#8a9cc8" strokeWidth="1.1" opacity=".75" />
        <path d="M 560 -59.4 H 630" stroke="#88a3c0" strokeWidth="1" opacity=".65" />
        <path d={rect(561, -53, 68, 30)} fill="none" stroke="#c99a52" strokeWidth=".8" opacity=".45" />
        <circle cx="595" cy="-38" r="4.2" fill="none" stroke="#c99a52" strokeWidth=".9" opacity=".55" />

        {/* firebox glow under the cab and the ash pan */}
        <g className="train-fire">
          <ellipse cx="638" cy="-48" rx="30" ry="36" fill="url(#train-fire-g)" />
          <ellipse cx="700" cy="-5" rx="34" ry="10" fill="url(#train-fire-g)" />
        </g>

        {/* locomotive */}
        <path d={rect(640, -31, 210, 15)} fill="#06090c" />
        <path d={rect(636, -38, 216, 4)} fill="#111b20" />
        <path d={rect(640, -34, 208, 2.6)} fill="#5c1a17" opacity=".9" />
        <path d="M 636 -37.6 H 852" stroke="#7d98b4" strokeWidth="1" opacity=".6" />
        {/* cab */}
        <path d="M 638 -34 L 638 -80 Q 638 -84 642 -84 L 680 -84 L 682 -34 Z" fill="url(#train-tender-g)" />
        <path d="M 631 -84 Q 659 -93 689 -84 L 689 -81.5 L 631 -81.5 Z" fill="#0b1115" />
        <path d="M 633 -85 Q 659 -93.4 687 -85" stroke="#9fb5d8" strokeWidth="1.3" fill="none" opacity=".8" />
        <path d="M 650 -60 L 650 -72 Q 650 -76 654 -76 L 666 -76 Q 670 -76 670 -72 L 670 -60 Z" fill="url(#train-cabwin-g)" />
        <path
          d={`${disc(661.5, -66.5, 3.1)} M 656.6 -68.6 h 9.6 v 1.3 h -9.6 Z M 658.6 -68.6 Q 661.5 -73 664.8 -68.6 Z M 654.4 -60 Q 655.4 -64.6 661.5 -64.4 Q 667.6 -64.6 668.6 -60 Z`}
          fill="#3a1606"
          opacity=".92"
        />
        <path d={rect(642, -56, 36, 18)} fill="none" stroke="#c99a52" strokeWidth=".8" opacity=".45" />
        <path d={rect(652, -50, 14, 5)} fill="url(#train-brass-g)" opacity=".75" />
        {/* firebox, boiler, smokebox, chimney */}
        <path d="M 682 -38 L 682 -66 Q 682 -70 686 -70 L 716 -70 Q 720 -70 720 -66 L 720 -38 Z" fill="url(#train-boiler-g)" />
        <path d={rect(718, -66, 100, 30)} fill="url(#train-boiler-g)" />
        <path d="M 719.5 -66 V -36 M 742 -66 V -36 M 768 -66 V -36 M 794 -66 V -36" stroke="#c99a52" strokeWidth="1.4" opacity=".5" />
        <path d="M 722 -54 H 814" stroke="#9fb2c8" strokeWidth=".9" opacity=".45" />
        <path d="M 816 -68 H 838 Q 846 -68 846 -60 V -42 Q 846 -36 838 -36 H 816 Z" fill="#070b0e" />
        <path d="M 818 -67.4 H 838 Q 845.4 -67.4 845.6 -60.5" stroke="#86a0c0" strokeWidth="1" fill="none" opacity=".6" />
        <path d="M 826 -68 L 827.6 -88 L 824 -88 L 824 -92 L 840 -92 L 840 -88 L 836.4 -88 L 838 -68 Z" fill="#070b0e" />
        <path d="M 824.4 -92 H 839.6 M 839.6 -91.6 V -88.4" stroke="#a9bfe0" strokeWidth="1.2" fill="none" opacity=".85" />
        <path d="M 760 -66 C 760 -76, 763 -79.5, 769 -79.5 C 775 -79.5, 778 -76, 778 -66 Z" fill="url(#train-brass-g)" />
        <ellipse cx="772.5" cy="-75.5" rx="2.6" ry="1.5" fill="#fff6d6" opacity=".85" />
        <path d={rect(704, -76, 6, 6) + rect(703, -78, 8, 2.4)} fill="url(#train-brass-g)" />
        <path d="M 688 -70 V -76 M 686.6 -76.6 h 2.8" stroke="#d9b56c" strokeWidth="1.4" />
        <path d="M 790 -38 V -44 Q 790 -46 792 -46 H 806 Q 808 -46 808 -44 V -38 Z" fill="#0b1317" />
        <path d="M 791 -45.6 H 807" stroke="#7d98b4" strokeWidth=".9" opacity=".55" />
        {/* headlamp, buffer beam, pilot */}
        <path d={rect(838.5, -80, 8, 9.5)} fill="#0b1115" />
        <path d="M 838.5 -80 h 8" stroke="#a9bfe0" strokeWidth="1" opacity=".7" />
        <path d={rect(846, -36, 6, 14)} fill="#6e1b18" />
        <path d={rect(852, -31.6, 5, 3.4) + rect(856.6, -34, 2.2, 8.2)} fill="#0d1216" />
        <path d="M 846 -22 L 852 -22 L 866 -2 L 846 -2 Z" fill="#090d10" />
        <path d="M 851 -19 L 852 -2 M 855 -15 L 857 -2 M 859 -10 L 861.4 -2" stroke="#4d607a" strokeWidth=".9" opacity=".7" />

        {/* running gear */}
        {DRIVERS.map((x) => (
          <g key={x} transform={`translate(${x} -19)`}>
            <g className="train-wheel train-wheel-d">{driverWheel}</g>
            <path d={rimArc(18.4)} stroke="#a3b8da" strokeWidth="1.3" fill="none" opacity=".7" />
          </g>
        ))}
        {LEADERS.map((x) => (
          <g key={x} transform={`translate(${x} -10)`}>
            <g className="train-wheel train-wheel-l">{leadWheel}</g>
            <path d={rimArc(9.6)} stroke="#a3b8da" strokeWidth="1.1" fill="none" opacity=".7" />
          </g>
        ))}
        <path d={rect(778, -24.6, 24, 1.4) + rect(778, -18.8, 24, 1.4)} fill="#8193b2" opacity=".85" />
        <g className="train-xhead">
          <path d={rect(794, -24, 8, 6)} fill="#9aabc6" />
          <path d={rect(802, -21.8, 24, 1.6)} fill="#c2cfe4" />
        </g>
        <path d="M 800 -30 H 832 Q 836 -30 836 -26 V -16 Q 836 -12 832 -12 H 800 Z" fill="#0c1418" />
        <path d="M 801 -29.4 H 832 Q 835.4 -29.4 835.6 -26.5" stroke="#86a0c0" strokeWidth=".9" fill="none" opacity=".6" />
        <path d="M 834 -28 V -14" stroke="#2a3946" strokeWidth="1.4" />
        <g className="train-crod">
          <path d={`M 690 -21 H 774 V -17 H 690 Z ${disc(690, -19, 3.4)} ${disc(732, -19, 3.6)} ${disc(774, -19, 3.4)}`} fill="#8ea0bf" />
          <path d="M 690 -20.6 H 774" stroke="#dfe8f6" strokeWidth=".7" opacity=".8" />
        </g>
        <g transform="translate(740 -19)">
          <g className="train-mrod">
            <path d={`M 0 -2.2 L 58 -3.3 L 58 -0.7 L 0 2.2 Z ${disc(0, 0, 3.9)} ${disc(58, -2, 2.5)}`} fill="#a1b1cc" />
            <path d="M 0 -1.8 L 58 -3" stroke="#eef3fb" strokeWidth=".6" opacity=".8" />
          </g>
        </g>

        {/* cylinder-cock steam, sparks */}
        <g transform="translate(806 -10)">
          <circle className="train-steam" r="6" fill="url(#train-steam-g)" style={anim(1.4, 0)} />
          <circle className="train-steam" r="5" cy="2" fill="url(#train-steam-g)" style={anim(1.9, -0.8)} />
        </g>
        <g transform="translate(832 -94)">
          <circle className="train-spark" r="1.4" fill="#ffd27a" style={anim(2.3, -0.3)} />
          <circle className="train-spark train-spark-b" cx="3" r="1.1" fill="#ffb85a" style={anim(3.1, -1.6)} />
          <circle className="train-spark" cx="-2" r="1.2" fill="#ffe09a" style={anim(4.2, -2.9)} />
        </g>

        {/* headlamp lens */}
        <circle cx="847.5" cy="-75.5" r="30" fill="url(#train-lamp-g)" />
        <circle cx="847.6" cy="-75.4" r="2.8" fill="#fffbe8" />
        <circle cx="853" cy="-28" r="1.6" fill="#fff4d0" />
      </g>
    </g>
  </Svg>
)

/* ================= meadow, trees & owl ================= */

const GROUND = [[-220, 756], [40, 770], [250, 798], [470, 834], [720, 842], [960, 836], [1160, 816], [1330, 790], [1660, 770]]
const gy = (x) => ridgeY(GROUND, x)

function canopy({ key, clumps, seed, rim, cls, origin, dur, delay }) {
  const r = rng(seed)
  let d = ''
  let inner = ''
  for (const [x, y, R] of clumps) {
    d += leafClump(r, x, y, R)
    inner += leafClump(r, x + rim[0] * R * 0.08, y - R * 0.34, R * 0.46)
  }
  return (
    <g key={key} className={cls} style={{ transformOrigin: origin, ...anim(dur, delay) }}>
      <path d={d} transform={`translate(${rim[0]} ${rim[1]})`} fill="#2f4479" opacity=".8" />
      <path d={d} fill="#050a17" />
      <path d={inner} fill="#0c1733" opacity=".5" />
    </g>
  )
}

const OWL_BODY = 'M -11 0 C -15 -9, -14 -20, -9 -26 C -5 -29, 5 -29, 9 -26 C 14 -20, 15 -9, 11 0 Z'
const OWL_HEAD =
  'M -10 -30 C -10 -37, -9.5 -41, -8.5 -46 L -3.5 -41.5 C -1.2 -42.4, 1.2 -42.4, 3.5 -41.5 L 8.5 -46 C 9.5 -41, 10 -37, 10 -30 C 10 -24, 6 -21, 0 -21 C -6 -21, -10 -24, -10 -30 Z'

const owl = (
  <g transform="translate(300 379) scale(1.25)">
    <path d="M -4 -1 L 0 9 L 4 -1 Z" fill="#060a16" />
    <path d={OWL_BODY} transform="translate(1.5 -1.4)" fill="#3e5592" />
    <path d={OWL_BODY} fill="#060a16" />
    <path d="M -5 -16 q 1.5 1.6 3 0 M 1 -16 q 1.5 1.6 3 0 M -3 -11 q 1.5 1.6 3 0 M 3 -11 q 1.5 1.6 3 0 M -6 -6 q 1.5 1.6 3 0 M 0 -6 q 1.5 1.6 3 0" stroke="#1d2850" strokeWidth=".9" fill="none" />
    <path d="M 9.5 -22 C 12 -14, 12 -6, 9 -1" stroke="#20305c" strokeWidth="1" fill="none" />
    <path d="M -5 0 v 2 M -3 0 v 2 M 3 0 v 2 M 5 0 v 2" stroke="#3b3426" strokeWidth=".9" />
    <g className="train-owl-head">
      <path d={OWL_HEAD} transform="translate(1.5 -1.4)" fill="#3e5592" />
      <path d={OWL_HEAD} fill="#060a16" />
      <path d={disc(-4.4, -32, 5.2) + disc(4.4, -32, 5.2)} fill="#131c38" />
      <circle cx="-4.4" cy="-32.5" r="7" fill="url(#train-owleye-g)" />
      <circle cx="4.4" cy="-32.5" r="7" fill="url(#train-owleye-g)" />
      <g className="train-owl-blink">
        <circle cx="-4.4" cy="-32.5" r="2.8" fill="#ffb63c" />
        <circle cx="4.4" cy="-32.5" r="2.8" fill="#ffb63c" />
        <circle cx="-4.1" cy="-32.5" r="1.35" fill="#140a00" />
        <circle cx="4.7" cy="-32.5" r="1.35" fill="#140a00" />
        <circle cx="-3.5" cy="-33.4" r=".6" fill="#fff" />
        <circle cx="5.3" cy="-33.4" r=".6" fill="#fff" />
      </g>
      <path d="M -1.2 -29.6 L 0 -26 L 1.2 -29.6 Z" fill="#4a3c26" />
    </g>
  </g>
)

const LEFT_TREE = {
  trunk: 'M 128 812 C 136 720, 150 620, 158 540 C 162 480, 170 440, 176 400 L 188 402 C 184 446, 182 488, 180 545 C 178 630, 176 720, 172 812 Z',
  trunkRim: 'M 186 404 C 182 448, 180 490, 178 546 C 176 630, 174 720, 170 812',
  limbs: [
    ['M 168 560 C 130 520, 90 480, 40 450', 11],
    ['M 176 470 C 140 430, 110 380, 80 350', 8],
    ['M 180 440 C 200 400, 220 360, 230 320', 8],
    ['M 175 400 C 175 360, 170 330, 165 290', 7],
    ['M 178 452 C 220 420, 262 392, 336 368', 6],
    ['M 300 381 L 318 362', 2.5],
    ['M 322 372 L 344 367', 2],
  ],
  groups: [
    { clumps: [[120, 300, 50], [190, 270, 55], [252, 300, 44], [80, 350, 46], [165, 340, 52], [235, 352, 42]], origin: '172px 420px', dur: 6.8, delay: -2 },
    { clumps: [[30, 430, 52], [-30, 380, 56], [70, 470, 44], [-40, 480, 50], [20, 530, 40]], origin: '160px 520px', dur: 8.1, delay: -5 },
    { clumps: [[240, 432, 40], [282, 472, 32], [212, 500, 40], [258, 522, 28]], origin: '180px 470px', dur: 5.6, delay: -1 },
  ],
}

const RIGHT_TREE = {
  trunk: 'M 1306 812 C 1310 720, 1300 620, 1292 560 C 1288 500, 1282 460, 1278 420 L 1290 418 C 1296 462, 1302 500, 1308 556 C 1316 630, 1330 720, 1336 812 Z',
  trunkRim: 'M 1279 422 C 1284 462, 1290 500, 1294 560 C 1302 620, 1312 720, 1308 812',
  limbs: [
    ['M 1296 540 C 1340 500, 1390 470, 1450 450', 11],
    ['M 1290 480 C 1260 450, 1240 420, 1232 392', 7],
    ['M 1286 440 C 1300 400, 1320 370, 1350 340', 7],
  ],
  groups: [
    { clumps: [[1292, 352, 46], [1250, 378, 36], [1342, 346, 44], [1388, 382, 42], [1302, 396, 40]], origin: '1286px 440px', dur: 7.4, delay: -3 },
    { clumps: [[1432, 422, 52], [1492, 392, 50], [1462, 472, 46], [1522, 502, 50], [1402, 470, 38]], origin: '1300px 540px', dur: 8.8, delay: -6 },
    { clumps: [[1258, 432, 32], [1246, 472, 27], [1284, 470, 30]], origin: '1288px 480px', dur: 6.1, delay: -0.5 },
  ],
}

function tree({ t, seed, rim, origin, dur, delay }) {
  return (
    <g className="train-tree" style={{ transformOrigin: origin, ...anim(dur, delay) }}>
      <path d={t.trunk} fill="#04080f" />
      <path d={t.trunkRim} stroke="#2e4275" strokeWidth="2" fill="none" opacity=".7" />
      {t.limbs.map(([d, w], i) => (
        <g key={i}>
          <path d={d} transform={`translate(${rim[0] * 0.6} ${rim[1] * 0.6})`} stroke="#2e4275" strokeWidth={w} strokeLinecap="round" fill="none" opacity=".6" />
          <path d={d} stroke="#04080f" strokeWidth={w} strokeLinecap="round" fill="none" />
        </g>
      ))}
      {t.groups.map((g, i) =>
        canopy({ key: i, clumps: g.clumps, seed: seed + i, rim, cls: 'train-limb', origin: g.origin, dur: g.dur, delay: g.delay }),
      )}
    </g>
  )
}

const bushes = (() => {
  const r = rng(717)
  const spots = [[40, 26, 1], [96, 20, 1], [232, 22, 1], [1238, 22, -1], [1300, 18, -1], [1408, 30, -1]]
  let d = ''
  let rimL = ''
  let rimR = ''
  for (const [x, R, side] of spots) {
    const shape = leafClump(r, x, gy(x) - R * 0.45, R)
    d += shape
    if (side > 0) rimL += shape
    else rimR += shape
  }
  return { d, rimL, rimR }
})()

const tufts = (() => {
  const r = rng(907)
  const N = 13
  return Array.from({ length: N }, (_, i) => {
    const x = -60 + (i + 0.2 + r() * 0.6) * ((W + 120) / N)
    const base = gy(x) + 14
    const edge = Math.abs(x - 720) / 720
    const hgt = 30 + edge * 40 + r() * 26
    const blades = 6 + Math.floor(r() * 4)
    let d = ''
    for (let b = 0; b < blades; b++) {
      const bx = x + (b - blades / 2) * 5.5 + r() * 3
      const lean = (r() - 0.5) * 34
      const bh = hgt * (0.55 + r() * 0.45)
      d += `M ${f(bx - 2.4)} ${f(base)} Q ${f(bx + lean * 0.25)} ${f(base - bh * 0.6)} ${f(bx + lean)} ${f(base - bh)} Q ${f(bx + lean * 0.25 + 1.6)} ${f(base - bh * 0.55)} ${f(bx + 2.4)} ${f(base)} Z `
    }
    const dx = x < MOON[0] ? 1.3 : -1.3
    return (
      <g key={i} className="train-tuft" style={anim(3.4 + r() * 2.6, -r() * 6)}>
        <path d={d} transform={`translate(${dx} -1.3)`} fill="#2d4174" opacity=".75" />
        <path d={d} fill="#03060d" />
      </g>
    )
  })
})()

const reeds = [
  [560, 92, 6.2, -1],
  [742, 74, 7.3, -3],
  [930, 100, 5.4, -2],
].map(([x, hgt, dur, delay], i) => {
  const r = rng(600 + i)
  const base = gy(x) + 12
  let blades = ''
  let stems = ''
  let heads = ''
  for (let b = 0; b < 9; b++) {
    const bx = x + (b - 4.5) * 4 + r() * 3
    const lean = (r() - 0.5) * 30
    const bh = hgt * (0.5 + r() * 0.5)
    blades += `M ${f(bx - 1.6)} ${f(base)} Q ${f(bx + lean * 0.2)} ${f(base - bh * 0.6)} ${f(bx + lean)} ${f(base - bh)} Q ${f(bx + lean * 0.2 + 1)} ${f(base - bh * 0.5)} ${f(bx + 1.6)} ${f(base)} Z `
  }
  for (let c = 0; c < 3; c++) {
    const cx = x + (c - 1) * 9 + r() * 4
    const top = base - hgt * (0.85 + r() * 0.3)
    stems += `M ${f(cx)} ${f(base)} Q ${f(cx + 2)} ${f((base + top) / 2)} ${f(cx + 1)} ${f(top)} `
    heads += oval(cx + 1, top + 9, 2.6, 8)
  }
  return (
    <g key={i} className="train-reed" style={anim(dur, delay)}>
      <path d={stems} stroke="#03060d" strokeWidth="1.4" fill="none" />
      <path d={heads} fill="#0a0806" />
      <path d={heads} fill="none" stroke="#3a4f86" strokeWidth=".8" opacity=".6" transform="translate(.8 -.8)" />
      <path d={blades} fill="#03060d" />
    </g>
  )
})

const fence = (() => {
  const posts = [[322, 56], [384, 50], [442, 44], [496, 38]].map(([x, h]) => [x, gy(x) + 6, h])
  let p = ''
  let caps = ''
  let rails = ''
  let railRim = ''
  posts.forEach(([x, g, h], i) => {
    p += rect(x - 3, g - h, 6, h + 14)
    caps += rect(x - 3, g - h, 6, 1.6) + rect(x + 1.6, g - h, 1.4, h)
    if (i < posts.length - 1) {
      const [x2, g2, h2] = posts[i + 1]
      for (const k of [0.78, 0.42]) {
        const y1 = g - h * k
        const y2 = g2 - h2 * k
        rails += `M ${x} ${f(y1)} Q ${f((x + x2) / 2)} ${f((y1 + y2) / 2 + 2.5)} ${x2} ${f(y2)} `
        railRim += `M ${x} ${f(y1 - 1.6)} Q ${f((x + x2) / 2)} ${f((y1 + y2) / 2 + 0.9)} ${x2} ${f(y2 - 1.6)} `
      }
    }
  })
  return { p, caps, rails, railRim }
})()

const flowers = (() => {
  const r = rng(888)
  let stems = ''
  let heads = ''
  for (const x of [26, 62, 210, 268, 1196, 1262, 1360, 1396]) {
    const base = gy(x) + 8
    const h = 24 + r() * 22
    stems += `M ${x} ${f(base)} Q ${f(x + 3)} ${f(base - h / 2)} ${f(x + 1)} ${f(base - h)} `
    for (let k = 0; k < 6; k++) heads += disc(x + 1 + (r() - 0.5) * 9, base - h - r() * 3.5, 1.1 + r() * 0.6)
  }
  return { stems, heads }
})()

const meadowLayer = (
  <Svg>
    <defs>
      {lin({ id: 'train-ground-g', user: true, y1: 760, y2: 900, stops: [[0, '#0b1329'], [1, '#03060d']] })}
      {rad({ id: 'train-owleye-g', stops: [[0, '#ffc050', 0.55], [1, '#ffb040', 0]] })}
    </defs>
    {tree({ t: LEFT_TREE, seed: 300, rim: [2.6, -2.2], origin: '150px 810px', dur: 9.4, delay: -3 })}
    {tree({ t: RIGHT_TREE, seed: 400, rim: [-2.6, -2.2], origin: '1320px 810px', dur: 10.6, delay: -7 })}
    <g className="train-tree" style={{ transformOrigin: '150px 810px', ...anim(9.4, -3) }}>
      {owl}
    </g>
    <path d={hills(GROUND)} fill="url(#train-ground-g)" />
    <path d={crest(GROUND)} stroke="#33477e" strokeWidth="1.6" fill="none" opacity=".7" />
    <path d={bushes.rimL} transform="translate(2.2 -2)" fill="#2f4479" opacity=".75" />
    <path d={bushes.rimR} transform="translate(-2.2 -2)" fill="#2f4479" opacity=".75" />
    <path d={bushes.d} fill="#04080f" />
    <path d={fence.p} fill="#060b18" />
    <path d={fence.railRim} stroke="#3b5089" strokeWidth="1.2" fill="none" opacity=".6" />
    <path d={fence.rails} stroke="#060b18" strokeWidth="3.4" fill="none" />
    <path d={fence.caps} fill="#4a5f9a" opacity=".75" />
    {reeds}
    <path d={flowers.stems} stroke="#08101f" strokeWidth="1" fill="none" />
    <path d={flowers.heads} fill="#d3dcf6" opacity=".75" />
    {tufts}
  </Svg>
)

/* ================= fireflies & bats ================= */

const fireflies = (() => {
  const r = rng(1313)
  return Array.from({ length: 18 }, (_, i) => {
    const zone = i % 3
    const x = zone === 0 ? 90 + r() * 360 : zone === 1 ? 990 + r() * 370 : 380 + r() * 640
    const y = zone === 2 ? 700 + r() * 140 : 560 + r() * 270
    const s = 0.75 + r() * 0.6
    return (
      <g key={i} transform={`translate(${f(x)} ${f(y)})`}>
        <g className={`train-ff train-ff-${'abc'[i % 3]}`} style={anim(7 + r() * 7, -r() * 14)}>
          <circle r={f(15 * s)} fill="url(#train-ff-g)" />
          <circle r={f(1.9 * s)} fill="#fffbe0" />
        </g>
      </g>
    )
  })
})()

const lifeLayer = (
  <Svg>
    <defs>
      {rad({ id: 'train-ff-g', stops: [[0, '#fff8cc'], [0.14, '#ffe27a', 0.8], [0.42, '#ffd25a', 0.24], [1, '#ffcc4a', 0]] })}
    </defs>
    {fireflies}
    {bat({ x: 330, y: 300, s: 1, path: 'a', dur: 12, delay: -3, flap: 0.22 })}
    {bat({ x: 1300, y: 384, s: 1.15, path: 'b', dur: 23, delay: -4, flap: 0.19 })}
    {bat({ x: 600, y: 770, s: 0.85, path: 'd', dur: 9, delay: -6, flap: 0.16 })}
  </Svg>
)

/* ================= world ================= */

const nightTrain = {
  id: 'train',
  name: 'Night Train',
  tag: 'Moonlit countryside',
  accent: '#ffb547',
  accent2: '#8fa8ff',
  ink: '#985200',
  glow: '#ffcf8a',
  light: false,
  clockColor: '#f3f1ff',
  sky: 'linear-gradient(180deg,#02040f 0%,#050b22 18%,#0b1636 34%,#17284f 46%,#2a3e6c 54%,#34497a 62%,#34497a 100%)',
  layers: [
    { name: 'Night sky', depth: 0, sky: true, el: skyLayer },
    { name: 'Moon & clouds', depth: 0.06, el: moonLayer },
    { name: 'Far hills', depth: 0.16, el: farLayer },
    { name: 'Hill town', depth: 0.28, el: townLayer },
    { name: 'Depth clock', depth: 0.4, clock: true },
    { name: 'Viaduct & river', depth: 0.6, el: viaductLayer },
    { name: 'Night train', depth: 0.62, el: trainLayer },
    { name: 'Meadow & owl', depth: 1, el: meadowLayer },
    { name: 'Fireflies & bats', depth: 1.25, el: lifeLayer },
  ],
}

export default nightTrain
