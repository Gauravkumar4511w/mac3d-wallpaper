// Neon Rain — a rain-soaked city at night. A big pink moon sinks behind hazy
// towers under drifting storm clouds; searchlights sweep the sky and lightning
// flickers now and then. An airship with a scrolling light band drifts past,
// aircars stream between the towers, neon signs buzz and stutter over a wet
// street full of shimmering reflections, ripples, splashes and vent steam.

import './neon.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- helpers ---------- */

const sec = (n) => `${n.toFixed(2)}s`
const timing = (dur, delay) => ({ animationDuration: sec(dur), animationDelay: sec(delay) })
// Clockwise rectangle subpath (so unions of shapes never punch holes).
const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} h ${f(w)} v ${f(h)} h ${f(-w)} Z`

// Move and scale a path written with absolute commands (numbers space-separated).
function place(d, dx, dy, s = 1) {
  return d.replace(/([MLHVQCZmlhvqcz])([^MLHVQCZmlhvqcz]*)/g, (_, c, args) => {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : []
    const abs = c === c.toUpperCase()
    const out = n.map((v, i) => {
      if (!abs) return v * s
      if (c === 'H') return v * s + dx
      if (c === 'V') return v * s + dy
      return v * s + (i % 2 ? dy : dx)
    })
    return `${c} ${out.map((v) => +v.toFixed(2)).join(' ')} `
  })
}

// Neon-tube letters in a 20 × 30 box.
const LETTERS = {
  H: 'M 0 0 V 30 M 20 0 V 30 M 0 15 H 20',
  O: 'M 5 0 H 15 Q 20 0 20 5 V 25 Q 20 30 15 30 H 5 Q 0 30 0 25 V 5 Q 0 0 5 0 Z',
  T: 'M 0 0 H 20 M 10 0 V 30',
  E: 'M 20 0 H 0 V 30 H 20 M 0 15 H 15',
  L: 'M 0 0 V 30 H 20',
  R: 'M 0 30 V 0 H 13 Q 20 0 20 7.5 Q 20 15 13 15 H 0 M 11 15 L 20 30',
  A: 'M 0 30 L 10 0 L 20 30 M 4 19 H 16',
  M: 'M 0 30 V 0 L 10 17 L 20 0 V 30',
  N: 'M 0 30 V 0 L 20 30 V 0',
  P: 'M 0 30 V 0 H 13 Q 20 0 20 7.5 Q 20 15 13 15 H 0',
}
const word = (txt, x, y, s, step, vertical = false) =>
  [...txt].map((c, i) => place(LETTERS[c], x + (vertical ? 0 : i * step), y + (vertical ? i * step : 0), s)).join(' ')

// Invented, kanji-like glyphs in a 30 × 30 box (not real characters).
const GLYPHS = [
  'M 4 5 H 26 M 9 5 V 15 H 21 V 5 M 15 15 V 28 M 5 21 L 10 27 M 25 21 L 20 27',
  'M 5 3 L 11 9 M 25 3 L 19 9 M 4 13 H 26 M 10 13 V 27 H 23 M 23 19 V 27',
  'M 15 2 V 8 M 4 8 H 26 M 7 8 L 4 17 M 23 8 L 26 17 M 9 20 H 21 M 15 20 V 28 M 6 28 H 24',
  'M 5 5 H 13 V 13 H 5 Z M 19 4 V 25 L 25 29 M 19 12 H 27 M 4 20 H 14 M 9 13 V 28',
]

const NEON = {
  pink: ['#ff4fd8', '#ffe3f8'],
  cyan: ['#3ef2ff', '#e8feff'],
  orange: ['#ffa53a', '#fff1d8'],
  red: ['#ff3d5e', '#ffe2e8'],
  violet: ['#b46cff', '#f3e8ff'],
  amber: ['#ffd25e', '#fffbe6'],
  blue: ['#4fa8ff', '#e6f3ff'],
}

// Radial glow gradients for every neon colour (each SVG that uses them carries its own copy).
const glowDefs = (
  <>
    {Object.entries(NEON).map(([k, [c]]) => (
      <radialGradient key={k} id={`neon-glow-${k}`}>
        <stop offset="0" stopColor={c} stopOpacity=".5" />
        <stop offset=".45" stopColor={c} stopOpacity=".15" />
        <stop offset="1" stopColor={c} stopOpacity="0" />
      </radialGradient>
    ))}
  </>
)
const glow = ({ x, y, rx, ry = rx, c, o = 1 }) => (
  <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#neon-glow-${c})`} opacity={o} />
)

// A neon tube: wide faint bloom, coloured glass, and a hot pale core.
function tube({ d, c, w = 2.6, halo = 1 }) {
  const [col, core] = NEON[c]
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={col} strokeWidth={w * 5.5} strokeOpacity={0.12 * halo} />
      <path d={d} stroke={col} strokeWidth={w * 2.4} strokeOpacity=".32" />
      <path d={d} stroke={col} strokeWidth={w} />
      <path d={d} stroke={core} strokeWidth={w * 0.42} strokeOpacity=".92" />
    </g>
  )
}

// Rain sheet: vertical streaks tiled twice (one screen apart) inside a skewed
// group; sliding the tile down by exactly one screen makes a seamless loop.
function rainSheet(seed, count, { len, width, color, opacity, dur, delay = 0, skew = -11 }) {
  const r = rng(seed)
  let d = ''
  for (let i = 0; i < count; i++) {
    const x = -PAD - 120 + r() * (W + 2 * PAD + 360)
    const y = r() * H
    const l = len[0] + r() * (len[1] - len[0])
    d += `M ${f(x)} ${f(y)} v ${f(l)} M ${f(x)} ${f(y - H)} v ${f(l)} `
  }
  return (
    <g transform={`skewX(${skew})`}>
      <g className="neon-rain" style={timing(dur, delay)}>
        <path d={d} stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" />
      </g>
    </g>
  )
}

const WIN_COLORS = ['#ffc274', '#ffc274', '#ffb35e', '#ff8bd8', '#ff8bd8', '#7ff2ff', '#fff1dc']
const NEAR_COLORS = ['#ffb468', '#ffb468', '#ff9a5c', '#e86cc4', '#62d6ea', '#ffdcb4']

// Window grid: unlit panes in one path, lit panes grouped by colour, and a few
// set aside to switch on and off. `blinds` draws some panes half-shaded.
function windowGrid(seed, cells, { ww, wh, density, flickP, flickMax, colors = WIN_COLORS, blinds = 0 }) {
  const r = rng(seed)
  const lit = {}
  let dark = ''
  const flick = []
  for (const [x, y, dens = density] of cells) {
    if (r() < dens) {
      const c = colors[Math.floor(r() * colors.length)]
      const cut = r() < blinds ? Math.round(wh * (0.3 + r() * 0.35)) : 0
      if (cut) dark += rect(x, y, ww, cut)
      if (flick.length < flickMax && r() < flickP) flick.push([x, y + cut, c, r(), wh - cut])
      else lit[c] = (lit[c] || '') + rect(x, y + cut, ww, wh - cut)
    } else dark += rect(x, y, ww, wh)
  }
  return { lit, dark, flick, ww }
}

function windows({ g, dark, o = 0.9, seed }) {
  const r = rng(seed)
  return (
    <>
      <path d={g.dark} fill={dark} />
      {Object.entries(g.lit).map(([c, d]) => (
        <path key={c} d={d} fill={c} opacity={o} />
      ))}
      {g.flick.map(([x, y, c, k, h], i) => (
        <rect
          key={i}
          className={k < 0.4 ? 'neon-win-a' : k < 0.8 ? 'neon-win-b' : 'neon-tv'}
          x={f(x)}
          y={f(y)}
          width={g.ww}
          height={h}
          fill={k < 0.8 ? c : '#8fd8ff'}
          opacity={o}
          style={k < 0.8 ? timing(9 + r() * 22, -r() * 30) : timing(1.6 + r() * 1.2, -r() * 3)}
        />
      ))}
    </>
  )
}

function beacon({ x, y, s = 1, dur, delay }, key) {
  return (
    <g key={key} className="neon-beacon" style={timing(dur, delay)}>
      <circle cx={f(x)} cy={f(y)} r={f(9 * s)} fill="#ff3b55" fillOpacity=".25" />
      <circle cx={f(x)} cy={f(y)} r={f(2.6 * s)} fill="#ffd0d6" />
    </g>
  )
}

/* ---------- night sky ---------- */

const FLASH = timing(26, -9)

const stars = (() => {
  const r = rng(77)
  return Array.from({ length: 40 }, (_, i) => {
    const x = r() * W
    const y = 46 + r() * 260
    const rad = 0.6 + r() * 1.1
    const o = 0.22 + r() * 0.5
    const d = 2.4 + r() * 3.2
    const del = -r() * 6
    const tw = i % 5 === 0
    return (
      <circle
        key={i}
        className={tw ? 'neon-twinkle' : undefined}
        cx={f(x)}
        cy={f(y)}
        r={rad.toFixed(2)}
        fill="#ffe8fb"
        opacity={o.toFixed(2)}
        style={tw ? timing(d, del) : undefined}
      />
    )
  })
})()

const BOLT = 'M 1068 58 L 1054 122 L 1073 133 L 1046 206 L 1064 216 L 1037 302 L 1055 312 L 1030 420 L 1041 470 L 1026 580'
const BOLT_FORKS = 'M 1046 206 L 1020 234 L 1026 260 L 1006 292 M 1037 302 L 1066 342 L 1060 376'

const skyPlate = (
  <Svg>
    <defs>
      <radialGradient id="neon-dome-g" cx=".5" cy="1" r=".62">
        <stop offset="0" stopColor="#ff7a9a" stopOpacity=".55" />
        <stop offset=".5" stopColor="#ff4f9a" stopOpacity=".18" />
        <stop offset="1" stopColor="#ff4f9a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="neon-flash-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eadcff" stopOpacity=".5" />
        <stop offset=".55" stopColor="#ffc6ee" stopOpacity=".3" />
        <stop offset="1" stopColor="#ffb0d8" stopOpacity=".1" />
      </linearGradient>
      <radialGradient id="neon-farflash-g">
        <stop offset="0" stopColor="#e4d2ff" stopOpacity=".45" />
        <stop offset=".5" stopColor="#c8a8ff" stopOpacity=".14" />
        <stop offset="1" stopColor="#c8a8ff" stopOpacity="0" />
      </radialGradient>
    </defs>
    {stars}
    <ellipse cx="720" cy="760" rx="980" ry="420" fill="url(#neon-dome-g)" />
    <ellipse className="neon-farflash" cx="190" cy="170" rx="460" ry="240" fill="url(#neon-farflash-g)" style={timing(37, -20)} />
    <rect className="neon-flash" x={-PAD} y="0" width={W + 2 * PAD} height={H} fill="url(#neon-flash-g)" style={FLASH} />
    <g className="neon-bolt" style={FLASH} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={BOLT + BOLT_FORKS} stroke="#d4b4ff" strokeWidth="16" strokeOpacity=".16" />
      <path d={BOLT + BOLT_FORKS} stroke="#f0e2ff" strokeWidth="5" strokeOpacity=".5" />
      <path d={BOLT} stroke="#fff" strokeWidth="2.4" />
      <path d={BOLT_FORKS} stroke="#fff" strokeWidth="1.3" />
    </g>
  </Svg>
)

/* ---------- moon & storm clouds ---------- */

const MOON = { x: 470, y: 372, r: 100 }

// A long, lumpy storm-cloud band that tapers to points at both ends.
function cloudBand(seed, cx, y, hw, t) {
  const r = rng(seed)
  const n = 7
  let d = `M ${f(cx - hw)} ${f(y)}`
  for (let i = 0; i < n; i++) {
    const u0 = i / n
    const u1 = (i + 1) / n
    const um = (u0 + u1) / 2
    const ym = y - t * (0.8 + r() * 0.9) * Math.sin(Math.PI * um)
    const y1 = y - t * 0.4 * Math.sin(Math.PI * u1)
    d += ` Q ${f(cx - hw + 2 * hw * um)} ${f(ym)} ${f(cx - hw + 2 * hw * u1)} ${f(y1)}`
  }
  d += ` C ${f(cx + hw * 0.45)} ${f(y + t * 0.55)} ${f(cx - hw * 0.45)} ${f(y + t * 0.55)} ${f(cx - hw)} ${f(y)} Z`
  return d
}

const CLOUDS = [
  // cx, y, half-width, thickness, duration, delay
  [380, 44, 560, 36, 260, -150],
  [1080, 70, 520, 30, 230, -95],
  [700, 104, 460, 22, 200, -60],
  [470, 330, 300, 17, 190, -120],
  [900, 368, 330, 13, 210, -40],
  [380, 430, 400, 20, 170, -60],
  [160, 232, 230, 10, 250, -20],
]

const moonLayer = (
  <Svg>
    <defs>
      <radialGradient id="neon-halo-g">
        <stop offset="0" stopColor="#ff9ad4" stopOpacity=".55" />
        <stop offset=".3" stopColor="#ff6fbf" stopOpacity=".2" />
        <stop offset=".62" stopColor="#ff4fa8" stopOpacity=".06" />
        <stop offset="1" stopColor="#ff4fa8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="neon-moon-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff2f9" />
        <stop offset=".45" stopColor="#ffc4e3" />
        <stop offset="1" stopColor="#ff7fbe" />
      </linearGradient>
    </defs>
    <circle className="neon-halo" cx={MOON.x} cy={MOON.y} r="330" fill="url(#neon-halo-g)" />
    <circle cx={MOON.x} cy={MOON.y} r={MOON.r + 7} fill="#ffd2ec" opacity=".22" />
    <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill="url(#neon-moon-g)" />
    <g fill="#ff8fc8" opacity=".32">
      <ellipse cx={MOON.x - 30} cy={MOON.y - 30} rx="24" ry="18" />
      <ellipse cx={MOON.x + 34} cy={MOON.y - 8} rx="16" ry="13" />
      <ellipse cx={MOON.x - 8} cy={MOON.y + 34} rx="28" ry="15" />
      <ellipse cx={MOON.x + 44} cy={MOON.y + 42} rx="10" ry="8" />
    </g>
    {CLOUDS.map(([cx, y, hw, t, dur, delay], i) => {
      const d = cloudBand(900 + i, cx, y, hw, t)
      return (
        <g key={i} className="neon-cloud" style={timing(dur, delay)}>
          <path d={d} transform="translate(0 4)" fill="#ff6fb4" fillOpacity={y > 300 ? 0.5 : 0.16} />
          <path d={d} fill="#1c0933" fillOpacity={y > 300 ? 0.88 : 0.78} />
        </g>
      )
    })}
  </Svg>
)

/* ---------- distant skyline ---------- */

function farCity(seed, minTop, maxTop, { minW = 30, maxW = 74, spire = 0.1, bottom = 800 } = {}) {
  const r = rng(seed)
  let x = -PAD
  let d = `M ${-PAD} ${bottom}`
  const tips = []
  const tops = []
  while (x < W + PAD) {
    const w = minW + r() * (maxW - minW)
    const top = minTop + r() * (maxTop - minTop)
    const k = r()
    const cx = x + w / 2
    d += ` L ${f(x)} ${f(top)}`
    if (k < spire) {
      const sh = 50 + r() * 80
      d += ` L ${f(cx - w * 0.2)} ${f(top)} L ${f(cx - 1.5)} ${f(top - sh)} L ${f(cx + 1.5)} ${f(top - sh)} L ${f(cx + w * 0.2)} ${f(top)}`
      tips.push([cx, top - sh])
    } else if (k < spire + 0.22) {
      const a = w * (0.15 + r() * 0.1)
      const sh = 14 + r() * 26
      d += ` L ${f(x + a)} ${f(top)} L ${f(x + a)} ${f(top - sh)} L ${f(x + w - a)} ${f(top - sh)} L ${f(x + w - a)} ${f(top)}`
    } else if (k < spire + 0.34) {
      const sh = 30 + r() * 40
      d += ` L ${f(cx - 1)} ${f(top)} L ${f(cx - 1)} ${f(top - sh)} L ${f(cx + 1)} ${f(top - sh)} L ${f(cx + 1)} ${f(top)}`
      tips.push([cx, top - sh])
    } else if (k < spire + 0.44) {
      d += ` L ${f(x + w)} ${f(top - 14 - r() * 18)}`
    }
    d += ` L ${f(x + w)} ${f(top)}`
    tops.push([x, w, top])
    x += w
  }
  return { d: `${d} L ${f(x)} ${bottom} Z`, tips, tops }
}

const farA = farCity(311, 420, 540, { minW: 26, maxW: 64, spire: 0.12 })
const farB = farCity(523, 470, 592, { minW: 36, maxW: 84, spire: 0.08 })

const farWins = (() => {
  const cells = []
  const r = rng(61)
  for (const [x, w, top] of farB.tops) {
    for (let y = top + 8; y < 700; y += 9) {
      for (let wx = x + 5; wx < x + w - 6; wx += 7) if (r() < 0.16) cells.push([wx, y])
    }
  }
  return windowGrid(62, cells, { ww: 2.4, wh: 3.4, density: 0.85, flickP: 0.05, flickMax: 5 })
})()

const farBeacons = [...farA.tips, ...farB.tips].sort((a, b) => a[1] - b[1]).filter(([x]) => x > 120 && x < 1320).slice(0, 3)

const BEAMS = [
  { x: 214, y: 640, w: 46, cls: 'a', dur: 19, delay: -6 },
  { x: 1092, y: 660, w: 52, cls: 'b', dur: 23, delay: -15 },
]

const distantSkyline = (
  <Svg>
    <defs>
      <linearGradient id="neon-beam-g" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#ffe8ff" stopOpacity=".34" />
        <stop offset=".35" stopColor="#ffd0f4" stopOpacity=".12" />
        <stop offset="1" stopColor="#ffd0f4" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="neon-farA-g" gradientUnits="userSpaceOnUse" x1="0" y1="400" x2="0" y2="700">
        <stop offset="0" stopColor="#4a1468" />
        <stop offset="1" stopColor="#b23c88" />
      </linearGradient>
      <linearGradient id="neon-farB-g" gradientUnits="userSpaceOnUse" x1="0" y1="460" x2="0" y2="760">
        <stop offset="0" stopColor="#33105a" />
        <stop offset="1" stopColor="#7c2676" />
      </linearGradient>
      <linearGradient id="neon-haze-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff5f9c" stopOpacity="0" />
        <stop offset="1" stopColor="#ff6a9c" stopOpacity=".42" />
      </linearGradient>
    </defs>
    {BEAMS.map(({ x, y, w, cls, dur, delay }) => (
      <g key={x} className={`neon-beam neon-beam-${cls}`} style={{ ...timing(dur, delay), transformOrigin: `${x}px ${y}px` }}>
        <path d={`M ${x - 3} ${y} L ${x - w} ${y - 980} L ${x + w} ${y - 980} L ${x + 3} ${y} Z`} fill="url(#neon-beam-g)" />
        <path d={`M ${x - 1.5} ${y} L ${x - w * 0.3} ${y - 980} L ${x + w * 0.3} ${y - 980} L ${x + 1.5} ${y} Z`} fill="url(#neon-beam-g)" />
      </g>
    ))}
    <path d={farA.d} fill="url(#neon-farA-g)" />
    <rect x={-PAD} y="470" width={W + 2 * PAD} height="240" fill="url(#neon-haze-g)" />
    <path d={farB.d} fill="url(#neon-farB-g)" />
    {windows({ g: farWins, dark: 'none', o: 0.55, seed: 63 })}
    {farBeacons.map(([x, y], i) => (
      beacon({ x, y, s: 0.7, dur: 2.2 + i * 0.5, delay: -i * 0.9 }, i)
    ))}
    <rect x={-PAD} y="560" width={W + 2 * PAD} height="240" fill="url(#neon-haze-g)" />
  </Svg>
)

/* ---------- airship & sky lanes ---------- */

const BLIMP_Y = 334
const TICK = 156 // ticker motif period

const ticker = (() => {
  const r = rng(404)
  const cols = { pink: '', cyan: '', amber: '' }
  const keys = Object.keys(cols)
  const motif = []
  for (let x = 0; x < TICK - 8; ) {
    const len = r() < 0.3 ? 3 : 6 + r() * 16
    motif.push([x, len, keys[Math.floor(r() * 3)], 2.5 + r() * 3])
    x += len + 4 + r() * 5
  }
  for (let k = -1; k < 2; k++) {
    for (const [x, len, c, h] of motif) cols[c] += rect(-80 + k * TICK + x, BLIMP_Y - h / 2, len, h)
  }
  return cols
})()

const airship = (
  <g className="neon-blimp" style={timing(170, -107)}>
    <g className="neon-bob">
      <path d={`M -7 ${BLIMP_Y + 38} L -96 ${BLIMP_Y + 340} L 96 ${BLIMP_Y + 340} L 7 ${BLIMP_Y + 38} Z`} fill="url(#neon-spot-g)" />
      <path
        d={`M -82 ${BLIMP_Y - 14} L -122 ${BLIMP_Y - 42} L -136 ${BLIMP_Y - 42} L -110 ${BLIMP_Y - 4} Z M -82 ${BLIMP_Y + 14} L -122 ${BLIMP_Y + 42} L -136 ${BLIMP_Y + 42} L -110 ${BLIMP_Y + 4} Z M -96 ${BLIMP_Y - 3} L -142 ${BLIMP_Y - 2} L -142 ${BLIMP_Y + 4} L -96 ${BLIMP_Y + 5} Z`}
        fill="#1d0a30"
      />
      <ellipse cx="0" cy={BLIMP_Y} rx="116" ry="31" fill="url(#neon-env-g)" />
      <path d={`M -86 ${BLIMP_Y - 21} Q 0 ${BLIMP_Y - 41} 86 ${BLIMP_Y - 21}`} stroke="#d08ad6" strokeOpacity=".4" strokeWidth="2" fill="none" />
      <rect x="-26" y={BLIMP_Y + 27} width="52" height="12" rx="4" fill="#160823" />
      <path d={[-18, -9, 0, 9].map((x) => rect(x, BLIMP_Y + 31, 5, 3.5)).join(' ')} fill="#ffd28a" />
      <rect x="-82" y={BLIMP_Y - 8} width="164" height="16" rx="8" fill="#0b0414" />
      <g clipPath="url(#neon-band-clip)">
        <g className="neon-ticker">
          <path d={ticker.pink} fill="#ff5fdc" />
          <path d={ticker.cyan} fill="#5ef4ff" />
          <path d={ticker.amber} fill="#ffcf6a" />
        </g>
      </g>
      <rect x="-82" y={BLIMP_Y - 8} width="164" height="16" rx="8" fill="none" stroke="#ff8fe0" strokeOpacity=".35" strokeWidth="1.2" />
      {beacon({ x: -129, y: BLIMP_Y - 42, s: 0.8, dur: 1.8, delay: -0.4 })}
      <circle cx="114" cy={BLIMP_Y} r="2.4" fill="#bdf6ff" />
      <g className="neon-strobe">
        <circle cx="0" cy={BLIMP_Y + 42} r="10" fill="#fff" fillOpacity=".25" />
        <circle cx="0" cy={BLIMP_Y + 42} r="2.6" fill="#fff" />
      </g>
    </g>
  </g>
)

// Aircar: a short light trail behind a glowing head lamp. dir 'r' flies right.
function aircar({ y, dir, len, w, c, dur, delay, body = 0 }) {
  const s = dir === 'r' ? -1 : 1
  return (
    <g key={`${y}-${delay}`} className={`neon-car neon-car-${dir}`} style={timing(dur, delay)}>
      <rect x={s < 0 ? -len : 0} y={f(y - w / 2)} width={len} height={w} fill={`url(#neon-trail-${dir}-${c})`} />
      {body > 0 && (
        <path
          d={`M ${f(-s * body * 0.1)} ${f(y - body * 0.16)} L ${f(s * body)} ${f(y - body * 0.1)} L ${f(s * body * 1.05)} ${f(y + body * 0.1)} L ${f(-s * body * 0.1)} ${f(y + body * 0.12)} Z`}
          fill="#12061e"
        />
      )}
      <circle cx="0" cy={f(y)} r={f(w * 2.6)} fill={c === 'ice' ? '#bff6ff' : '#ff6a7c'} fillOpacity=".3" />
      <circle cx="0" cy={f(y)} r={f(w * 0.9)} fill={c === 'ice' ? '#f4ffff' : '#ffd6dc'} />
    </g>
  )
}

const trailDefs = (
  <>
    {[
      ['ice', '#9feeff'],
      ['ember', '#ff4f6e'],
    ].map(([k, c]) =>
      ['r', 'l'].map((dir) => (
        <linearGradient key={k + dir} id={`neon-trail-${dir}-${k}`} x1={dir === 'r' ? 0 : 1} y1="0" x2={dir === 'r' ? 1 : 0} y2="0">
          <stop offset="0" stopColor={c} stopOpacity="0" />
          <stop offset="1" stopColor={c} stopOpacity=".85" />
        </linearGradient>
      )),
    )}
  </>
)

const FAR_CARS = [
  { y: 404, dir: 'r', len: 46, w: 1.6, c: 'ice', dur: 34, delay: -4 },
  { y: 412, dir: 'r', len: 40, w: 1.5, c: 'ice', dur: 38, delay: -22 },
  { y: 432, dir: 'l', len: 44, w: 1.6, c: 'ember', dur: 31, delay: -12 },
  { y: 440, dir: 'l', len: 38, w: 1.5, c: 'ember', dur: 36, delay: -29 },
  { y: 458, dir: 'r', len: 50, w: 1.7, c: 'ice', dur: 29, delay: -17 },
]

const skyLanes = (
  <Svg>
    <defs>
      {trailDefs}
      <linearGradient id="neon-env-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a1858" />
        <stop offset=".5" stopColor="#24103c" />
        <stop offset="1" stopColor="#8a2d74" />
      </linearGradient>
      <linearGradient id="neon-spot-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe6f6" stopOpacity=".3" />
        <stop offset="1" stopColor="#ffe6f6" stopOpacity="0" />
      </linearGradient>
      <clipPath id="neon-band-clip">
        <rect x="-80" y={BLIMP_Y - 6} width="160" height="12" rx="6" />
      </clipPath>
    </defs>
    {rainSheet(5, 430, { len: [12, 26], width: 0.8, color: '#ffc8ee', opacity: 0.26, dur: 1.15 })}
    {rainSheet(6, 300, { len: [10, 20], width: 0.7, color: '#d6c8ff', opacity: 0.22, dur: 1.4, delay: -0.5, skew: -9 })}
    {FAR_CARS.map(aircar)}
    {airship}
  </Svg>
)

/* ---------- midtown towers ---------- */

const MID_BASE = 800
const MID = [
  { x: -220, w: 150, top: 452, kind: 'flat', tank: 70 },
  { x: -66, w: 124, top: 404, kind: 'step' },
  { x: 62, w: 104, top: 486, kind: 'slant', win: 'bands' },
  { x: 170, w: 128, top: 366, kind: 'spire', sh: 110 },
  { x: 312, w: 92, top: 474, kind: 'flat', tank: 30, antenna: 80 },
  { x: 438, w: 86, top: 526, kind: 'flat', win: 'bands' },
  { x: 548, w: 102, top: 432, kind: 'crown', antenna: 64 },
  { x: 688, w: 82, top: 556, kind: 'flat', tank: 40 },
  { x: 796, w: 68, top: 502, kind: 'slant', flip: true },
  { x: 882, w: 122, top: 392, kind: 'spire', sh: 84 },
  { x: 1036, w: 96, top: 470, kind: 'step' },
  { x: 1146, w: 124, top: 428, kind: 'dome', antenna: 60 },
  { x: 1270, w: 130, top: 492, kind: 'flat', tank: 44, win: 'bands' },
  { x: 1400, w: 140, top: 418, kind: 'step' },
  { x: 1540, w: 120, top: 470, kind: 'flat' },
]

const tank = (x, y) =>
  rect(x - 13, y - 14, 2.4, 15) +
  rect(x - 1.2, y - 14, 2.4, 15) +
  rect(x + 10.6, y - 14, 2.4, 15) +
  rect(x - 15, y - 44, 30, 31) +
  ` M ${f(x - 17)} ${f(y - 44)} L ${f(x)} ${f(y - 57)} L ${f(x + 17)} ${f(y - 44)} Z`

const midTowers = (() => {
  let body = ''
  let rim = ''
  const tips = []
  for (const t of MID) {
    const { x, w, top, kind } = t
    const cx = x + w / 2
    let roof = top
    if (kind === 'slant') {
      body += t.flip
        ? ` M ${x} ${MID_BASE} V ${top} L ${x + w} ${top + 34} V ${MID_BASE} Z`
        : ` M ${x} ${MID_BASE} V ${top + 34} L ${x + w} ${top} V ${MID_BASE} Z`
    } else body += rect(x, top, w, MID_BASE - top)
    if (kind === 'step') {
      body += rect(x + w * 0.16, top - 24, w * 0.68, 26) + rect(x + w * 0.32, top - 44, w * 0.36, 22)
      roof = top - 44
    }
    if (kind === 'crown') {
      body += rect(x + 8, top - 14, w - 16, 16) + rect(x + 18, top - 28, w - 36, 16) + rect(x + 30, top - 42, w - 60, 16)
      roof = top - 42
    }
    if (kind === 'spire') {
      const tip = top - 28 - t.sh
      body += rect(x + w * 0.2, top - 28, w * 0.6, 30)
      body += ` M ${f(cx - w * 0.14)} ${f(top - 28)} L ${f(cx - 1.5)} ${f(tip)} L ${f(cx + 1.5)} ${f(tip)} L ${f(cx + w * 0.14)} ${f(top - 28)} Z`
      tips.push([cx, tip])
    }
    if (kind === 'dome') {
      body += ` M ${x + 10} ${top + 1} Q ${f(cx)} ${top - 70} ${x + w - 10} ${top + 1} Z`
      roof = top - 34
    }
    if (t.tank) body += tank(x + t.tank, top)
    if (t.antenna) {
      const ax = kind === 'flat' ? x + w * 0.72 : cx
      body += rect(ax - 1.3, roof - t.antenna, 2.6, t.antenna + 2) + rect(ax - 9, roof - t.antenna * 0.55, 18, 2.2)
      tips.push([ax, roof - t.antenna])
    }
    // pink rim light on the edge that faces the city's glowing centre
    const edge = cx < 720 ? x + w - 4 : x
    rim += rect(edge, kind === 'slant' ? top + 36 : top + 2, 4, 700 - top)
  }
  return { body, rim, tips }
})()

const midWins = (() => {
  const r = rng(71)
  const cells = []
  for (const t of MID) {
    if (t.win === 'bands') continue
    const dens = 0.12 + r() * 0.2
    const y0 = (t.kind === 'slant' ? t.top + 42 : t.top) + 14
    for (let y = y0; y < 690; y += 15) {
      for (let x = t.x + 9; x < t.x + t.w - 12; x += 11) cells.push([x, y, dens])
    }
  }
  return windowGrid(72, cells, { ww: 5, wh: 8, density: 0.2, flickP: 0.06, flickMax: 14 })
})()

const midBands = (() => {
  const r = rng(73)
  let lit = ''
  let dark = ''
  for (const t of MID) {
    if (t.win !== 'bands') continue
    for (let y = (t.kind === 'slant' ? t.top + 40 : t.top) + 12; y < 690; y += 13) {
      const seg = rect(t.x + 7, y, t.w - 14, 4)
      if (r() < 0.42) lit += seg
      else dark += seg
    }
  }
  return { lit, dark }
})()

const SCREEN = { x: 891, y: 418, w: 104, h: 70 }

const ledScreen = (
  <g>
    {glow({ x: SCREEN.x + SCREEN.w / 2, y: SCREEN.y + SCREEN.h / 2, rx: '110', ry: '80', c: 'violet', o: 0.8 })}
    <rect x={SCREEN.x - 4} y={SCREEN.y - 4} width={SCREEN.w + 8} height={SCREEN.h + 8} fill="#0a0312" />
    {[0, 1, 2].map((k) => (
      <g key={k} className="neon-slide" style={timing(12, -((3 - k) % 3) * 4)}>
        <rect x={SCREEN.x} y={SCREEN.y} width={SCREEN.w} height={SCREEN.h} fill={`url(#neon-led-${k})`} />
        {k === 0 && (
          <>
            <circle cx={SCREEN.x + 34} cy={SCREEN.y + 35} r="18" fill="#fff" fillOpacity=".9" />
            <path d={rect(SCREEN.x + 60, SCREEN.y + 22, 32, 5) + rect(SCREEN.x + 60, SCREEN.y + 33, 24, 5) + rect(SCREEN.x + 60, SCREEN.y + 44, 28, 5)} fill="#fff" fillOpacity=".8" />
          </>
        )}
        {k === 1 && <path d={place(GLYPHS[2], SCREEN.x + 30, SCREEN.y + 12, 1.5)} stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />}
        {k === 2 && (
          <path
            d={[0, 1, 2, 3].map((i) => `M ${SCREEN.x + 6} ${SCREEN.y + 18 + i * 13} q 12 -9 24 0 t 24 0 t 24 0 t 24 0`).join(' ')}
            stroke="#fff"
            strokeOpacity=".85"
            strokeWidth="3"
            fill="none"
          />
        )}
      </g>
    ))}
    <path d={[...Array(7)].map((_, i) => `M ${SCREEN.x} ${SCREEN.y + 5 + i * 10} h ${SCREEN.w}`).join(' ')} stroke="#000" strokeOpacity=".18" strokeWidth="1.2" />
  </g>
)

const MID_CARS = [
  { y: 520, dir: 'r', len: 92, w: 2.4, c: 'ice', dur: 17, delay: -3, body: 16 },
  { y: 528, dir: 'r', len: 70, w: 2.2, c: 'ice', dur: 21, delay: -13, body: 14 },
  { y: 552, dir: 'l', len: 88, w: 2.4, c: 'ember', dur: 19, delay: -8, body: 16 },
  { y: 560, dir: 'l', len: 76, w: 2.2, c: 'ember', dur: 24, delay: -19, body: 14 },
]

const midtown = (
  <Svg>
    <defs>
      {glowDefs}
      {trailDefs}
      <linearGradient id="neon-mid-g" gradientUnits="userSpaceOnUse" x1="0" y1="340" x2="0" y2="760">
        <stop offset="0" stopColor="#150527" />
        <stop offset="1" stopColor="#2e0c4a" />
      </linearGradient>
      <linearGradient id="neon-midhaze-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff5c9a" stopOpacity="0" />
        <stop offset="1" stopColor="#ff6aa0" stopOpacity=".34" />
      </linearGradient>
      <linearGradient id="neon-led-0" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff4fd8" />
        <stop offset="1" stopColor="#7a2cff" />
      </linearGradient>
      <linearGradient id="neon-led-1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#21d6ff" />
        <stop offset="1" stopColor="#3a4dff" />
      </linearGradient>
      <linearGradient id="neon-led-2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffb03a" />
        <stop offset="1" stopColor="#ff3d7e" />
      </linearGradient>
    </defs>
    <path d={midTowers.body} fill="url(#neon-mid-g)" />
    <path d={midTowers.rim} fill="#8a3192" opacity=".45" />
    <path d={midBands.dark} fill="#2a0e44" />
    <path d={midBands.lit} fill="#9fe6ff" opacity=".42" />
    {windows({ g: midWins, dark: '#2b0f45', o: 0.85, seed: 74 })}
    {/* neon edge lines on the crowned tower */}
    <g className="neon-buzz" style={timing(4.3, -1.2)}>
      {tube({ d: 'M 549.5 446 V 700 M 648.5 446 V 700', c: 'cyan', w: 1.6, halo: 0.8 })}
    </g>
    {/* vertical glyph strip */}
    <g className="neon-out" style={timing(14, -5)}>
      <rect x="1050" y="482" width="26" height="140" rx="3" fill="#0d0418" />
      {tube({ d: [0, 3, 1].map((g, i) => place(GLYPHS[g], 1054, 490 + i * 42, 0.6)).join(' '), c: 'pink', w: 1.5 })}
    </g>
    {ledScreen}
    {midTowers.tips.map(([x, y], i) => (
      beacon({ x, y, s: 0.85, dur: 1.7 + (i % 3) * 0.45, delay: -i * 0.7 }, i)
    ))}
    <rect x={-PAD} y="590" width={W + 2 * PAD} height="210" fill="url(#neon-midhaze-g)" />
    {MID_CARS.map(aircar)}
  </Svg>
)

/* ---------- neon district (near buildings and signs) ---------- */

const NEAR_BASE = 820

const leftBlock = `M -220 ${NEAR_BASE} V 330 H 96 V 300 H 214 V 330 H 268 V ${NEAR_BASE} Z` + tank(72, 330) + rect(176, 206, 3, 96) + rect(166, 236, 22, 2.4)
const rightBlock = `M 1172 ${NEAR_BASE} V 396 H 1214 V 366 H 1384 V 396 H 1660 V ${NEAR_BASE} Z` + rect(1298, 270, 3, 98) + rect(1288, 300, 22, 2.4) + tank(1350, 366)

const LOW = [
  { x: 268, w: 218, top: 604 },
  { x: 486, w: 164, top: 642 },
  { x: 650, w: 222, top: 588 },
  { x: 872, w: 300, top: 616 },
]
const lowBlocks =
  LOW.map(({ x, w, top }) => rect(x, top, w, NEAR_BASE - top)).join(' ') +
  // B2 roof: AC units and a vent stack
  rect(506, 626, 30, 17) + rect(546, 630, 22, 13) + rect(610, 612, 8, 31) + rect(606, 608, 16, 5) +
  // B3 billboard legs
  rect(690, 570, 4, 20) + rect(830, 570, 4, 20) + rect(760, 570, 4, 20) +
  // B4 roof tank
  tank(1100, 616)

const nearWins = (() => {
  const cells = []
  for (let y = 354; y < 640; y += 44) for (let x = -194; x < 240; x += 38) cells.push([x, y])
  for (let y = 422; y < 660; y += 44) for (let x = 1198; x < 1640; x += 38) cells.push([x, y])
  for (const y of [618, 650]) for (let x = 386; x < 470; x += 28) cells.push([x, y, 0.4])
  for (let x = 502; x < 640; x += 28) cells.push([x, 658, 0.35])
  for (const y of [604, 636, 666]) for (let x = 666; x < 860; x += 28) cells.push([x, y, 0.3])
  return windowGrid(81, cells, { ww: 15, wh: 22, density: 0.2, flickP: 0.14, flickMax: 8, colors: NEAR_COLORS, blinds: 0.45 })
})()

const FIRE_ESCAPE = (() => {
  let d = ''
  for (let k = 0; k < 4; k++) {
    const y = 392 + k * 88
    d += ` M 140 ${y} H 262 M 140 ${y - 16} H 262`
    for (let x = 140; x <= 262; x += 15) d += ` M ${x} ${y} V ${y - 16}`
    if (k < 3) d += ` M 150 ${y + 4} L 244 ${y + 84} M 156 ${y + 4} L 250 ${y + 84}`
  }
  return d
})()

// HOTEL: vertical sign hanging off the left block.
const HOTEL_T = place(LETTERS.T, 292, 404 + 2 * 49, 1.15)
const HOTEL_REST = ['H', 'O', null, 'E', 'L'].map((c, i) => (c ? place(LETTERS[c], 292, 404 + i * 49, 1.15) : '')).join(' ')

// Arrow pointing back to the hotel door, with chasing bulbs along its shaft.
const ARROW = 'M 286 646 L 306 628 V 638 H 368 V 654 H 306 V 664 Z'
const CHASE = Array.from({ length: 7 }, (_, i) => [312 + i * 8.6, 646])

const RAMEN = word('RAMEN', 972, 644, 1, 34)
const BOWL = 'M 906 658 H 956 Q 954 678 931 680 Q 908 678 906 658 Z M 922 681 L 920 686 H 942 L 940 681 M 944 652 L 966 636 M 939 650 L 959 632'
const STEAM = [0, 1, 2].map((i) => `M ${919 + i * 11} 652 q -4 -4 0 -8 q 4 -4 0 -8`)

const OPEN = word('OPEN', 394, 707, 0.55, 15)

const BANNER = GLYPHS.map((g, i) => place(g, 1136, 430 + i * 52, 0.8)).join(' ')

const SUNSET =
  'M 706 556 Q 706 528 730 528 Q 754 528 754 556 M 696 560 H 764 M 712 548 H 748 M 716 541 H 744'
const WAVES = 'M 776 552 q 8 -9 16 0 t 16 0 t 16 0 t 16 0 M 776 538 q 8 -9 16 0 t 16 0 t 16 0 t 16 0'

const SATURN = 'M 1264 520 Q 1264 494 1290 494 Q 1316 494 1316 520 Q 1316 546 1290 546 Q 1264 546 1264 520 Z'
const RING = 'M 1242 532 Q 1290 508 1338 506 Q 1352 506 1340 514 Q 1292 540 1240 540 Q 1228 540 1242 532 Z'

const NEAR_CARS = [
  { y: 464, dir: 'l', len: 190, w: 3.6, c: 'ember', dur: 11, delay: -2, body: 30 },
  { y: 502, dir: 'r', len: 220, w: 3.8, c: 'ice', dur: 9.5, delay: -6.5, body: 32 },
]

const LANTERNS = [888, 1156]
const DRIPS = [
  [318, 690, 2.2, -0.3],
  [402, 690, 2.9, -1.6],
  [1006, 694, 2.5, -0.9],
]

const neonDistrict = (
  <Svg>
    <defs>
      {glowDefs}
      {trailDefs}
      <linearGradient id="neon-near-g" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="820">
        <stop offset="0" stopColor="#0c0414" />
        <stop offset=".7" stopColor="#13061e" />
        <stop offset="1" stopColor="#21092b" />
      </linearGradient>
      <linearGradient id="neon-door-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffcf8c" />
        <stop offset="1" stopColor="#ff8a5c" />
      </linearGradient>
      <linearGradient id="neon-ice-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6fbff" />
        <stop offset="1" stopColor="#7fdcff" />
      </linearGradient>
    </defs>

    {/* low blocks between the two tall ones */}
    <path d={lowBlocks} fill="url(#neon-near-g)" />
    <path d={LOW.map(({ x, w, top }) => rect(x, top, w, 2)).join(' ')} fill="#6a2a7a" opacity=".7" />
    {/* rooftop billboard: a retro sunset over waves */}
    <rect x="680" y="510" width="168" height="62" rx="4" fill="#0c0416" />
    <g className="neon-buzz" style={timing(3.1, -0.6)}>
      {glow({ x: 764, y: 541, rx: 130, ry: 70, c: 'violet', o: 0.7 })}
      {tube({ d: 'M 684 514 H 844 V 568 H 684 Z', c: 'violet', w: 1.4, halo: 0.6 })}
      {tube({ d: SUNSET, c: 'orange', w: 2.2 })}
      {tube({ d: WAVES, c: 'cyan', w: 1.8 })}
    </g>

    {/* shop fronts */}
    <rect x="300" y="698" width="170" height="52" fill="#2a0c26" />
    <ellipse cx="385" cy="700" rx="120" ry="58" fill="url(#neon-glow-orange)" />
    <rect x="300" y="698" width="170" height="3" fill="#ffd2a0" opacity=".8" />
    <path d="M 342 698 V 750 M 384 698 V 750" stroke="#12050c" strokeWidth="3" />
    <path d="M 296 686 H 474 L 468 698 H 302 Z" fill="#2a0c34" />
    <path d={[...Array(9)].map((_, i) => `M ${302 + i * 19.5} 698 q 9.75 7 19.5 0`).join(' ')} fill="#2a0c34" />
    <rect x="504" y="700" width="96" height="50" fill="#1b0a26" />
    <path d={[...Array(8)].map((_, i) => `M 504 ${704 + i * 6} h 96`).join(' ')} stroke="#2e1440" strokeWidth="2" />
    <rect className="neon-tv" x="610" y="704" width="30" height="34" fill="#8fd4ff" opacity=".75" style={timing(2.3, -1.1)} />
    <rect x="676" y="698" width="170" height="52" fill="#1c0930" />
    <ellipse cx="761" cy="716" rx="120" ry="52" fill="url(#neon-glow-violet)" />
    <path d="M 676 698 H 846 M 718 698 V 750 M 761 698 V 750 M 804 698 V 750" stroke="#0c0414" strokeWidth="3" />
    {[696, 739, 782, 825].map((x) => (
      <g key={x}>
        <path d={`M ${x} 698 V 708`} stroke="#0c0414" strokeWidth="1" />
        <circle cx={x} cy="711" r="3.2" fill="#ffd6a0" />
        <circle cx={x} cy="711" r="9" fill="#ffd6a0" fillOpacity=".18" />
      </g>
    ))}
    <rect x="904" y="700" width="232" height="50" fill="#ffc98a" opacity=".85" />
    <path d={[0, 1, 2, 3].map((i) => rect(930 + i * 46, 700, 40, 30)).join(' ')} fill="#3a0f2a" />
    <path d={[0, 1, 2, 3].map((i) => rect(934 + i * 46, 703, 32, 24)).join(' ')} fill="#5c1838" />
    <rect x="1196" y="694" width="168" height="56" fill="url(#neon-ice-g)" opacity=".8" />
    <path d="M 1196 712 H 1364 M 1196 730 H 1364" stroke="#4a8aa8" strokeWidth="2.5" opacity=".6" />
    <path d="M 1238 694 V 750 M 1280 694 V 750 M 1322 694 V 750" stroke="#0e0518" strokeWidth="3" />

    {/* near aircars slip between the towers */}
    {NEAR_CARS.map(aircar)}

    {/* tall blocks framing the street */}
    <path d={leftBlock} fill="url(#neon-near-g)" />
    <path d={rightBlock} fill="url(#neon-near-g)" />
    {windows({ g: nearWins, dark: '#1b0b27', o: 0.78, seed: 82 })}
    <path d={FIRE_ESCAPE} stroke="#3a1a50" strokeWidth="2.4" fill="none" />
    <rect x="252" y="330" width="16" height="490" fill="url(#neon-glow-pink)" />
    <rect x="1172" y="400" width="14" height="420" fill="url(#neon-glow-cyan)" />
    {beacon({ x: 177.5, y: 204, dur: 2.1, delay: -0.3 })}
    {beacon({ x: 1299.5, y: 268, dur: 2.6, delay: -1.4 })}
    {/* hotel door and marquee */}
    <rect x="120" y="694" width="110" height="60" fill="url(#neon-door-g)" />
    <path d="M 132 704 H 218 V 754 H 132 Z M 175 704 V 754" stroke="#3a1424" strokeWidth="3" fill="none" />
    <rect x="104" y="676" width="152" height="14" fill="#1a0824" />
    <path d={[...Array(13)].map((_, i) => rect(110 + i * 11.6, 681, 3, 3)).join(' ')} fill="#ffd98a" />

    {/* HOTEL */}
    <path d="M 268 410 H 278 M 268 636 H 278" stroke="#2c1440" strokeWidth="5" />
    <rect x="276" y="392" width="54" height="258" rx="5" fill="#0d0418" />
    <g className="neon-buzz" style={timing(3.7, -2.2)}>
      {glow({ x: 303, y: 520, rx: 120, ry: 210, c: 'pink', o: 0.9 })}
      {tube({ d: 'M 280 396 H 326 V 646 H 280 Z', c: 'cyan', w: 1.3, halo: 0.5 })}
      {tube({ d: HOTEL_REST, c: 'pink', w: 2.8 })}
    </g>
    <g className="neon-broken" style={timing(9, -4)}>
      {tube({ d: HOTEL_T, c: 'pink', w: 2.8 })}
    </g>
    {/* arrow with chase lights */}
    <g className="neon-buzz" style={timing(5.3, -1.7)}>
      {glow({ x: 326, y: 646, rx: 70, ry: 40, c: 'amber', o: 0.8 })}
      {tube({ d: ARROW, c: 'amber', w: 2 })}
    </g>
    {CHASE.map(([x, y], i) => (
      <circle key={i} className="neon-chase" cx={f(x)} cy={y} r="2.6" fill="#fff4c4" style={timing(1.05, -((6 - i) / 7) * 1.05)} />
    ))}
    {/* OPEN */}
    <g className="neon-out" style={timing(11, -2)}>
      {glow({ x: 424, y: 716, rx: 60, ry: 32, c: 'red' })}
      {tube({ d: 'M 388 702 H 460 V 730 H 388 Z', c: 'blue', w: 1.3, halo: 0.6 })}
      {tube({ d: OPEN, c: 'red', w: 1.8 })}
    </g>
    {/* RAMEN */}
    <rect x="896" y="628" width="250" height="62" rx="5" fill="#0d0418" />
    <g className="neon-out" style={timing(17, -3)}>
      {glow({ x: 1020, y: 660, rx: 190, ry: 70, c: 'orange', o: 0.9 })}
      {tube({ d: RAMEN, c: 'orange', w: 2.6 })}
      {tube({ d: BOWL, c: 'cyan', w: 2.2 })}
    </g>
    {STEAM.map((d, i) => (
      <g key={i} className="neon-steam" style={timing(1.8, -i * 0.6)}>
        {tube({ d, c: 'pink', w: 1.6, halo: 0.5 })}
      </g>
    ))}
    {/* paper lanterns */}
    {LANTERNS.map((x, i) => (
      <g key={x} className="neon-lantern" style={{ ...timing(3.4 + i * 0.7, -i * 1.3), transformOrigin: `${x}px 690px` }}>
        {glow({ x, y: 712, rx: 34, c: 'red' })}
        <path d={`M ${x} 690 V 698`} stroke="#2a0c18" strokeWidth="1.5" />
        <ellipse cx={x} cy="712" rx="9.5" ry="13" fill="#ff4a5e" />
        <path d={`M ${x - 9} 708 H ${x + 9} M ${x - 9} 716 H ${x + 9} M ${x} 699 V 725`} stroke="#b0203c" strokeWidth="1.2" opacity=".7" />
        <path d={rect(x - 5, 697, 10, 3) + rect(x - 5, 724, 10, 3)} fill="#2a0c18" />
      </g>
    ))}
    {DRIPS.map(([x, y, dur, delay], i) => (
      <ellipse key={i} className="neon-drip" cx={x} cy={y} rx="1.3" ry="2.6" fill="#ffd6f2" style={timing(dur, delay)} />
    ))}
    {/* glyph banner off the right block */}
    <path d="M 1166 430 H 1172 M 1166 620 H 1172" stroke="#173a48" strokeWidth="5" />
    <rect x="1130" y="420" width="38" height="210" rx="4" fill="#0d0418" />
    <g className="neon-out" style={timing(13, -3)}>
      {glow({ x: 1149, y: 525, rx: 80, ry: 170, c: 'cyan', o: 0.85 })}
      {tube({ d: BANNER, c: 'cyan', w: 2 })}
    </g>
    {/* ringed-planet emblem on the right block */}
    <g className="neon-buzz" style={timing(4.6, -3.3)}>
      {glow({ x: 1290, y: 520, rx: 90, c: 'violet' })}
      {tube({ d: SATURN, c: 'pink', w: 2.2 })}
      {tube({ d: RING, c: 'violet', w: 1.8 })}
    </g>
  </Svg>
)

/* ---------- wet street ---------- */

const STREET = 750

const REFL = [
  { x: 303, w: 30, c: '#ff4fd8', o: 1, sync: ['neon-buzz', 3.7, -2.2] },
  { x: 175, w: 100, c: '#ffb86a', o: 0.8 },
  { x: 328, w: 70, c: '#ffd25e', o: 0.55 },
  { x: 410, w: 150, c: '#ffa6c0', o: 0.75 },
  { x: 762, w: 160, c: '#b46cff', o: 0.7 },
  { x: 764, w: 70, c: '#ffa53a', o: 0.35 },
  { x: 1020, w: 230, c: '#ffa53a', o: 0.85, sync: ['neon-out', 17, -3] },
  { x: 888, w: 20, c: '#ff3d5e', o: 0.85 },
  { x: 1150, w: 34, c: '#3ef2ff', o: 0.85, sync: ['neon-out', 13, -3] },
  { x: 1280, w: 160, c: '#bff4ff', o: 0.75 },
]

function reflection({ x, w, c, o, sync }, i) {
  const r = rng(500 + i)
  const parts = ['', '']
  let k = 0
  for (let y = STREET + 4; y < H; y += 5.5 + r() * 2.5) {
    const t = (y - STREET) / (H - STREET)
    const bw = w * (0.4 + r() * 0.75) * (1 + t * 0.6)
    const bx = x - bw / 2 + (r() - 0.5) * w * 0.35
    parts[k++ % 2] += rect(bx, y, bw, 2.2 + r() * 1.6)
  }
  const id = `neon-refl-${i}`
  const inner = (
    <>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1={STREET} x2="0" y2={H}>
        <stop offset="0" stopColor={c} stopOpacity={0.85 * o} />
        <stop offset=".55" stopColor={c} stopOpacity={0.3 * o} />
        <stop offset="1" stopColor={c} stopOpacity="0" />
      </linearGradient>
      <path className="neon-shim-a" d={parts[0]} fill={`url(#${id})`} style={timing(1.7 + r() * 1.2, -r() * 3)} />
      <path className="neon-shim-b" d={parts[1]} fill={`url(#${id})`} style={timing(2.1 + r() * 1.3, -r() * 3)} />
    </>
  )
  return sync ? (
    <g key={i} className={sync[0]} style={timing(sync[1], sync[2])}>
      {inner}
    </g>
  ) : (
    <g key={i}>{inner}</g>
  )
}

const PUDDLES = [
  [330, 806, 140, 12],
  [770, 840, 190, 15],
  [1190, 812, 120, 10],
  [560, 790, 70, 6],
]

const ripples = (() => {
  const r = rng(808)
  return Array.from({ length: 9 }, (_, i) => {
    const [px, py, rx, ry] = PUDDLES[i % PUDDLES.length]
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 0.7
    const dur = 1.6 + r() * 1.3
    return (
      <ellipse
        key={i}
        className="neon-ripple"
        cx={f(px + Math.cos(a) * rx * d)}
        cy={f(py + Math.sin(a) * ry * d)}
        rx="18"
        ry="3.6"
        fill="none"
        stroke="#ffd8f2"
        strokeWidth="1.3"
        style={timing(dur, -r() * dur)}
      />
    )
  })
})()

const splashes = (() => {
  const r = rng(909)
  return Array.from({ length: 10 }, (_, i) => {
    const x = 40 + r() * 1360
    const y = STREET + 8 + r() * 96
    const dur = 1.1 + r() * 1.2
    return (
      <g key={i} className="neon-splash" style={timing(dur, -r() * dur)}>
        <path
          d={`M ${f(x - 2.5)} ${f(y)} L ${f(x - 6)} ${f(y - 6)} M ${f(x)} ${f(y - 1)} L ${f(x)} ${f(y - 9)} M ${f(x + 2.5)} ${f(y)} L ${f(x + 6)} ${f(y - 6)}`}
          stroke="#ffe2f6"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <ellipse cx={f(x)} cy={f(y + 0.5)} rx="5" ry="1.2" fill="#ffe2f6" fillOpacity=".6" />
      </g>
    )
  })
})()

const VENT = { x: 612, y: 818 }

const puffs = Array.from({ length: 6 }, (_, i) => (
  <circle key={i} className="neon-puff" cx={VENT.x} cy={VENT.y - 10} r="30" fill="url(#neon-steam-g)" style={timing(6.6, (-i * 6.6) / 6)} />
))

// A pedestrian with an umbrella strolling along the pavement.
const walker = (
  <g className="neon-walk" style={timing(64, -22)}>
    <g className="neon-step">
      <g fill="#08030e">
        <g className="neon-leg" style={timing(0.9, 0)}>
          <rect x="-2.6" y="742" width="5" height="22" rx="2" />
        </g>
        <g className="neon-leg" style={timing(0.9, -0.45)}>
          <rect x="-2.6" y="742" width="5" height="22" rx="2" />
        </g>
        <path d="M -8 744 Q -9 720 0 716 Q 9 720 8 744 Z" />
        <circle cx="0" cy="710" r="6" />
        <path d="M 1 718 L 5 696" stroke="#08030e" strokeWidth="2" />
        <path d="M -24 700 Q 4 672 32 694 Z" />
        <path d="M -22 698 Q 4 674 30 692" stroke="#ff7ad8" strokeOpacity=".7" strokeWidth="1.6" fill="none" />
      </g>
    </g>
  </g>
)

const wetStreet = (
  <Svg>
    <defs>
      <linearGradient id="neon-road-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#24092f" />
        <stop offset=".35" stopColor="#14061f" />
        <stop offset="1" stopColor="#090310" />
      </linearGradient>
      <linearGradient id="neon-sheen-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff6aa8" stopOpacity=".28" />
        <stop offset="1" stopColor="#ff6aa8" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="neon-steam-g">
        <stop offset="0" stopColor="#f6dcff" stopOpacity=".5" />
        <stop offset=".6" stopColor="#f0c8ff" stopOpacity=".18" />
        <stop offset="1" stopColor="#f0c8ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="neon-puddle-g">
        <stop offset="0" stopColor="#ff8ccb" stopOpacity=".3" />
        <stop offset=".7" stopColor="#ff8ccb" stopOpacity=".14" />
        <stop offset="1" stopColor="#ff8ccb" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x={-PAD} y={STREET} width={W + 2 * PAD} height={H - STREET} fill="url(#neon-road-g)" />
    <rect x={-PAD} y={STREET} width={W + 2 * PAD} height="18" fill="#1e0b2a" />
    <rect x={-PAD} y={STREET} width={W + 2 * PAD} height="1.6" fill="#a04aa0" opacity=".75" />
    <rect x={-PAD} y={STREET + 18} width={W + 2 * PAD} height="5" fill="#0b0412" />
    <rect x={-PAD} y={STREET + 23} width={W + 2 * PAD} height="46" fill="url(#neon-sheen-g)" />
    <path d={[...Array(10)].map((_, i) => rect(-180 + i * 190, 846, 76, 3)).join(' ')} fill="#4a2452" opacity=".6" />
    {PUDDLES.map(([x, y, rx, ry], i) => (
      <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill="url(#neon-puddle-g)" />
    ))}
    {REFL.map(reflection)}
    <rect className="neon-flash" x={-PAD} y={STREET} width={W + 2 * PAD} height={H - STREET} fill="#e8d6ff" fillOpacity=".16" style={FLASH} />
    {ripples}
    {splashes}
    <ellipse cx={VENT.x} cy={VENT.y} rx="34" ry="6" fill="#06020a" />
    <path d={[-20, -10, 0, 10, 20].map((dx) => `M ${VENT.x + dx - 3} ${VENT.y - 2} h 6`).join(' ')} stroke="#3a1a48" strokeWidth="1.6" />
    {puffs}
    {walker}
  </Svg>
)

/* ---------- rain ---------- */

const rainLayer = (
  <Svg>
    {rainSheet(11, 150, { len: [26, 46], width: 1.1, color: '#ffd0f2', opacity: 0.3, dur: 0.82 })}
    {rainSheet(12, 70, { len: [60, 120], width: 2, color: '#ffd8f4', opacity: 0.36, dur: 0.56, delay: -0.2 })}
    {rainSheet(13, 50, { len: [50, 100], width: 1.6, color: '#c6ecff', opacity: 0.3, dur: 0.66, delay: -0.4, skew: -13 })}
    {rainSheet(14, 12, { len: [150, 220], width: 3, color: '#ffe6f8', opacity: 0.2, dur: 0.44, delay: -0.1 })}
  </Svg>
)

/* ---------- world ---------- */

export default {
  id: 'neon',
  name: 'Neon Rain',
  tag: 'Rainy city night',
  accent: '#ff5fd2',
  accent2: '#ffb86b',
  ink: '#c0219e',
  glow: '#ff9be6',
  clockColor: '#fff0fb',
  sky: 'linear-gradient(180deg,#07021a 0%,#110530 16%,#1f0846 30%,#360d5e 39%,#5e1572 45%,#a42480 51%,#e33f80 56%,#ff6478 63%,#ff8a6e 74%,#ffad76 100%)',
  layers: [
    { name: 'Night sky', depth: 0, sky: true, el: skyPlate },
    { name: 'Pink moon', depth: 0.07, el: moonLayer },
    { name: 'Distant skyline', depth: 0.16, el: distantSkyline },
    { name: 'Airship & sky lanes', depth: 0.27, el: skyLanes },
    { name: 'Depth clock', depth: 0.4, clock: true },
    { name: 'Midtown towers', depth: 0.58, el: midtown },
    { name: 'Neon district', depth: 0.85, el: neonDistrict },
    { name: 'Wet street', depth: 1.05, el: wetStreet },
    { name: 'Rain', depth: 1.3, el: rainLayer },
  ],
}
