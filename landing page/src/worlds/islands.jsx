// Sky Islands: a bright morning high above a sea of cumulus. Rock islands with
// grassy tops float at several depths, each bobbing at its own rate; the far
// ones fade into the blue haze. Cloud banks sit between the island planes, so
// they hide some islands and are hidden by others, which sells the depth.
// The sun is top right: right faces are lit warm, left faces fall into cool
// shadow, and the undersides catch lavender light bounced off the clouds.

import './islands.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- small helpers ---------- */

const t2 = (n) => n.toFixed(2)
const anim = (r, min, span, maxDelay) => ({
  animationDuration: `${t2(min + r() * span)}s`,
  animationDelay: `${t2(-r() * maxDelay)}s`,
})
const line = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${f(x)} ${f(y)}`).join(' ')
const poly = (pts) => `${line(pts)} Z`
const disc = (x, y, r) => `M ${f(x - r)} ${f(y)} a ${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`
const discs = (list) => list.map(([x, y, r]) => disc(x, y, r)).join(' ')

// Catmull-Rom through points, as cubic Beziers (open or closed).
function curve(pts, closed = false) {
  const n = pts.length
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.min(Math.max(i, 0), n - 1)])
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`
  }
  return closed ? `${d} Z` : d
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function mix(a, b, t) {
  const A = rgb(a)
  const B = rgb(b)
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
const hazed = (pal, haze, k) =>
  Object.fromEntries(Object.entries(pal).map(([key, v]) => [key, Array.isArray(v) ? v.map((c) => mix(c, haze, k)) : mix(v, haze, k)]))

/* ---------- palettes (aerial perspective) ---------- */

// Near islands are warm and saturated; mid and far ones are blended toward
// the blue haze of the sky so they recede.
const NEAR = {
  grass: '#72bd55',
  grassLt: '#b9e57c',
  grassDk: '#4a9341',
  grassDeep: '#2f6a3b',
  soil: '#5a3836',
  rock: ['#4a3253', '#6b465c', '#97645f', '#c98a69', '#eab07f'],
  strataDk: '#2a1630',
  strataLt: '#fff0d8',
  rim: '#ffe3b4',
  bounce: '#a9b3ea',
  root: '#563639',
  vine: '#3f8a40',
  leaf: '#7cc45a',
  trunk: '#5b3a36',
  tree: '#3a8549',
  treeLt: '#68b75a',
  treeHi: '#a8dd79',
  pine: '#2a6648',
  pineLt: '#4a955a',
  wall: '#fbf1e2',
  wallSh: '#cdb6b4',
  roof: '#c4553f',
  roofLt: '#ec8a62',
  wood: '#7a4c3a',
  window: '#ffd27a',
  water: '#e6f6ff',
  waterDk: '#8cc8ee',
  wool: '#fbf8f1',
  woolSh: '#cbc8de',
}
const MID = hazed(NEAR, '#b4c9ec', 0.34)
const FAR = hazed(NEAR, '#c2d5f1', 0.68)

function tierDefs(tier, pal) {
  return (
    <>
      <linearGradient id={`islands-top-${tier}`} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={pal.grass} />
        <stop offset="0.55" stopColor={mix(pal.grass, pal.grassLt, 0.5)} />
        <stop offset="1" stopColor={pal.grassLt} />
      </linearGradient>
      <linearGradient id={`islands-skirt-${tier}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={pal.grassDeep} />
        <stop offset="0.6" stopColor={pal.grassDk} />
        <stop offset="1" stopColor={mix(pal.grassDk, pal.grassLt, 0.4)} />
      </linearGradient>
      <linearGradient id={`islands-bounce-${tier}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.3" stopColor={pal.bounce} stopOpacity="0" />
        <stop offset="1" stopColor={pal.bounce} stopOpacity="0.62" />
      </linearGradient>
      <linearGradient id={`islands-falldk-${tier}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={pal.waterDk} stopOpacity="0.75" />
        <stop offset="0.6" stopColor={pal.waterDk} stopOpacity="0.35" />
        <stop offset="1" stopColor={pal.waterDk} stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`islands-fall-${tier}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={pal.water} stopOpacity="0.96" />
        <stop offset="0.5" stopColor={pal.water} stopOpacity="0.72" />
        <stop offset="1" stopColor={pal.water} stopOpacity="0" />
      </linearGradient>
    </>
  )
}

const mistDef = (
  <radialGradient id="islands-mist-g">
    <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
    <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.5" />
    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
  </radialGradient>
)
const wispDef = (
  <radialGradient id="islands-wisp-g">
    <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
    <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.42" />
    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
  </radialGradient>
)

// Cumulus are cel-shaded: a lavender shadow silhouette under a sunlit body
// offset toward the sun, so a shadow crescent remains under each billow.
// Both tones carry a vertical gradient, so each row is brightest at its top.
const CLOUD = {
  far: { shade: ['#e4dfee', '#d2d0e7'], lit: ['#fffaf3', '#f8f1f2', '#e8e3ef'] },
  mid: { shade: ['#cdcfee', '#a9b0dc'], lit: ['#fffdf7', '#f7f3f6', '#dadaef'] },
  near: { shade: ['#c9cdee', '#a3abda'], lit: ['#ffffff', '#f9f6f8', '#d9daef'] },
}
function cloudDefs(tier) {
  const c = CLOUD[tier]
  return (
    <>
      <linearGradient id={`islands-cs-${tier}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={c.shade[0]} />
        <stop offset="1" stopColor={c.shade[1]} />
      </linearGradient>
      <linearGradient id={`islands-cl-${tier}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={c.lit[0]} />
        <stop offset="0.55" stopColor={c.lit[1]} />
        <stop offset="1" stopColor={c.lit[2]} />
      </linearGradient>
    </>
  )
}

function underGrad(id, color, op = 0.7) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity="0" />
      <stop offset="1" stopColor={color} stopOpacity={op} />
    </linearGradient>
  )
}

/* ---------- props that stand on the islands ---------- */

function roundTree(seed, x, base, h, pal, sway) {
  const r = rng(seed)
  const R = h * 0.34
  const cy = base - h + R * 1.05
  const tw = Math.max(0.8, h * 0.045)
  const j = () => (r() - 0.5) * R * 0.16
  const body = (
    <>
      <ellipse cx={f(x - R * 0.35)} cy={f(base + 0.5)} rx={f(R * 0.85)} ry={f(R * 0.2)} fill={pal.grassDeep} opacity=".35" />
      <path d={`M ${f(x - tw)} ${f(base + 1)} L ${f(x - tw * 0.45)} ${f(cy + R * 0.3)} L ${f(x + tw * 0.45)} ${f(cy + R * 0.3)} L ${f(x + tw)} ${f(base + 1)} Z`} fill={pal.trunk} />
      <path
        d={discs([
          [x - R * 0.42 + j(), cy + R * 0.18, R * 0.7],
          [x + R * 0.4 + j(), cy + R * 0.22, R * 0.68],
          [x + j(), cy - R * 0.2, R * 0.82],
          [x - R * 0.05, cy + R * 0.44, R * 0.58],
        ])}
        fill={pal.tree}
      />
      <path
        d={discs([
          [x + R * 0.14 + j(), cy - R * 0.3, R * 0.6],
          [x + R * 0.5, cy + R * 0.04, R * 0.44],
          [x - R * 0.28, cy - R * 0.1, R * 0.42],
        ])}
        fill={pal.treeLt}
      />
      <path
        d={discs([
          [x + R * 0.32, cy - R * 0.52, R * 0.28],
          [x + R * 0.62, cy - R * 0.1, R * 0.22],
          [x - R * 0.12, cy - R * 0.56, R * 0.2],
        ])}
        fill={pal.treeHi}
      />
    </>
  )
  return sway ? (
    <g className="islands-sway" style={anim(r, 4.5, 3, 8)}>
      {body}
    </g>
  ) : (
    <g>{body}</g>
  )
}

function pine(seed, x, base, h, pal, sway) {
  const r = rng(seed)
  const hw = h * 0.28
  let dk = ''
  let lt = ''
  for (let i = 0; i < 4; i++) {
    const top = base - h + i * h * 0.19
    const bot = base - h * 0.6 + i * h * 0.165
    const w = hw * (0.46 + i * 0.2)
    dk += `M ${f(x)} ${f(top)} L ${f(x - w)} ${f(bot)} Q ${f(x)} ${f(bot + h * 0.06)} ${f(x + w)} ${f(bot)} Z `
    lt += `M ${f(x + w * 0.04)} ${f(top + 1)} L ${f(x + w)} ${f(bot)} Q ${f(x + w * 0.55)} ${f(bot + h * 0.045)} ${f(x + w * 0.12)} ${f(bot + h * 0.05)} Z `
  }
  const tw = Math.max(0.8, h * 0.04)
  const body = (
    <>
      <ellipse cx={f(x - hw * 0.5)} cy={f(base + 0.5)} rx={f(hw * 1.1)} ry={f(hw * 0.22)} fill={pal.grassDeep} opacity=".35" />
      <rect x={f(x - tw)} y={f(base - h * 0.16)} width={f(tw * 2)} height={f(h * 0.16 + 1)} fill={pal.trunk} />
      <path d={dk} fill={pal.pine} />
      <path d={lt} fill={pal.pineLt} />
    </>
  )
  return sway ? (
    <g className="islands-sway" style={anim(r, 5, 3, 8)}>
      {body}
    </g>
  ) : (
    <g>{body}</g>
  )
}

function bush(x, base, s, pal) {
  return (
    <g>
      <path d={discs([[x - s * 0.5, base - s * 0.45, s * 0.6], [x + s * 0.4, base - s * 0.4, s * 0.55], [x, base - s * 0.75, s * 0.6]])} fill={pal.tree} />
      <path d={discs([[x + s * 0.18, base - s * 0.9, s * 0.34], [x + s * 0.55, base - s * 0.55, s * 0.26]])} fill={pal.treeLt} />
    </g>
  )
}

function smoke(seed, x, y, s) {
  const r = rng(seed)
  const dur = 5.5 + r() * 1.5
  return [0, 1].map((i) => (
    <circle
      key={i}
      className="islands-smoke"
      cx={f(x)}
      cy={f(y)}
      r={f(3.2 * s)}
      fill="#ffffff"
      style={{ animationDuration: `${t2(dur)}s`, animationDelay: `${t2(-(i * dur) / 2 - r() * 0.4)}s` }}
    />
  ))
}

// A cottage: shaded side wall with a door, sunlit gable end, terracotta roof.
function cottage(seed, x, base, s, pal, chimneySmoke = true) {
  return (
    <g>
      <g transform={`translate(${f(x)} ${f(base)}) scale(${t2(s)})`}>
        <ellipse cx="-6" cy="0.6" rx="18" ry="2.6" fill={pal.grassDeep} opacity=".35" />
        <path d="M -16 0 L -16 -12 L -2 -12 L -2 0 Z" fill={pal.wallSh} />
        <path d="M -2 0 L -2 -12 L 5 -20 L 12 -12 L 12 0 Z" fill={pal.wall} />
        <path d="M -11.5 -21 L 5 -21 L -2.5 -11 L -18.5 -11 Z" fill={pal.roof} />
        <path d="M -11.5 -21 L 5 -21 L 4 -19.6 L -12.4 -19.6 Z" fill={pal.roofLt} opacity=".8" />
        <path d="M 5 -21.6 L 13.8 -10.8 L 11.8 -10.8 L 5 -19 Z" fill={pal.roofLt} />
        <rect x="-8" y="-25.5" width="3.6" height="7" fill={pal.roof} />
        <rect x="-8.6" y="-26.4" width="4.8" height="1.6" fill={pal.wood} />
        <rect x="-12.5" y="-7.4" width="4.2" height="7.4" rx="1.6" fill={pal.wood} />
        <rect x="-6" y="-9" width="3" height="3" fill={pal.window} />
        <rect x="2.6" y="-9.6" width="4.6" height="4.6" fill={pal.window} />
        <path d="M 4.9 -9.6 L 4.9 -5 M 2.6 -7.3 L 7.2 -7.3" stroke={pal.wood} strokeWidth=".7" />
        <path d="M 3 -14.6 a 2 2 0 0 1 4 0 Z" fill={pal.wood} opacity=".55" />
        {chimneySmoke && smoke(seed, -6.2, -28, 1)}
      </g>
    </g>
  )
}

// Windmill with a tapered white tower and four lattice sails that turn.
function windmill(x, base, s, pal) {
  const sail = (
    <g>
      <path d="M -0.9 -4 L -0.9 -44 L 0.9 -44 L 0.9 -4 Z" fill={pal.wood} />
      <path d="M 1 -11 L 9.5 -11 L 9.5 -43 L 1 -43 Z" fill={pal.wall} opacity=".95" />
      <path d="M 1 -19 L 9.5 -19 M 1 -27 L 9.5 -27 M 1 -35 L 9.5 -35 M 5.2 -11 L 5.2 -43" stroke={pal.wallSh} strokeWidth=".8" />
    </g>
  )
  return (
    <g transform={`translate(${f(x)} ${f(base)}) scale(${t2(s)})`}>
      <ellipse cx="-10" cy="0.6" rx="20" ry="3" fill={pal.grassDeep} opacity=".35" />
      <path d="M -11 0 L -7 -46 L 7 -46 L 11 0 Z" fill={pal.wall} />
      <path d="M -11 0 L -7 -46 L -2 -46 L -3.5 0 Z" fill={pal.wallSh} />
      <path d="M -8.4 -46 C -8.4 -56, 8.4 -56, 8.4 -46 Z" fill={pal.roof} />
      <path d="M 0 -54 C 5 -54, 8.4 -50, 8.4 -46 L 3 -46 Z" fill={pal.roofLt} />
      <path d="M -10.4 -47 L 10.4 -47 L 10 -45.4 L -10 -45.4 Z" fill={pal.wood} />
      <rect x="-2.6" y="-10" width="5.2" height="10" rx="2.6" fill={pal.wood} />
      <rect x="1.5" y="-30" width="3.6" height="4.6" rx="1.8" fill={pal.window} />
      <rect x="-4" y="-22" width="3" height="4" rx="1.5" fill={pal.wood} opacity=".7" />
      <g transform="translate(0 -46)">
        <g className="islands-sails">
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a + 18})`}>
              {sail}
            </g>
          ))}
        </g>
        <circle r="3" fill={pal.wood} />
        <circle r="1.2" fill={pal.wall} />
      </g>
    </g>
  )
}

// Red-and-white lighthouse with a gallery; the lamp pulses and its beam sweeps.
function lighthouse(x, base, s, pal) {
  return (
    <g transform={`translate(${f(x)} ${f(base)}) scale(${t2(s)})`}>
      <ellipse cx="-8" cy="0.6" rx="16" ry="2.6" fill={pal.grassDeep} opacity=".35" />
      <path d="M -8.5 0 L -5.5 -50 L 5.5 -50 L 8.5 0 Z" fill={pal.wall} />
      <path d="M -8.1 -7 L -7.6 -15 L 7.6 -15 L 8.1 -7 Z M -7.1 -24 L -6.6 -32 L 6.6 -32 L 7.1 -24 Z M -6.1 -41 L -5.8 -46 L 5.8 -46 L 6.1 -41 Z" fill={pal.roof} />
      <path d="M -8.5 0 L -5.5 -50 L -1.5 -50 L -2.6 0 Z" fill="#3b2a4a" opacity=".2" />
      <rect x="-2" y="-6.5" width="4" height="6.5" rx="2" fill={pal.wood} />
      <rect x="-1.2" y="-38" width="2.4" height="3.4" rx="1.2" fill={pal.wood} opacity=".6" />
      <rect x="-9" y="-52.4" width="18" height="2.6" fill={pal.wood} />
      <path d="M -8 -52.4 L -8 -55 M -4 -52.4 L -4 -55 M 0 -52.4 L 0 -55 M 4 -52.4 L 4 -55 M 8 -52.4 L 8 -55 M -8.6 -55 L 8.6 -55" stroke={pal.wood} strokeWidth=".7" />
      <rect x="-4.6" y="-61" width="9.2" height="8.8" fill="#fff4c8" />
      <path d="M -4.6 -61 L 0 -61 L 0 -52.2 L -4.6 -52.2 Z" fill="#f3d58f" />
      <path d="M -6 -61 L 0 -67.5 L 6 -61 Z" fill={pal.roof} />
      <path d="M 0 -67.5 L 6 -61 L 1.5 -61 Z" fill={pal.roofLt} />
      <circle cx="0" cy="-68.6" r="1.2" fill={pal.wood} />
      <g className="islands-beam">
        <path d="M 0 -57 L -46 -62.5 L -46 -51.5 Z M 0 -57 L 46 -62.5 L 46 -51.5 Z" fill="url(#islands-beam-g)" />
      </g>
      <circle className="islands-beacon" cx="0" cy="-57" r="11" fill="url(#islands-lamp-g)" />
    </g>
  )
}

function sheep(seed, x, base, s, pal, flip, graze) {
  const r = rng(seed)
  return (
    <g transform={`translate(${f(x)} ${f(base)}) scale(${t2(flip ? -s : s)} ${t2(s)})`}>
      <ellipse cx="0" cy="0.4" rx="8" ry="1.6" fill={pal.grassDeep} opacity=".3" />
      <path d="M -4 0 L -4 -4.5 M -1.2 0.3 L -1.2 -4 M 3 0 L 3 -4.5 M 5.4 0.3 L 5.4 -4" stroke="#463b48" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="0.8" cy="-4" rx="6.6" ry="2.4" fill={pal.woolSh} />
      <path d={discs([[-3.2, -6.8, 3.2], [0.4, -7.8, 3.6], [3.6, -6.6, 3.1], [0.6, -5.2, 3.3]])} fill={pal.wool} />
      <path d={discs([[1.4, -9, 1.7], [4.2, -8, 1.4]])} fill="#ffffff" />
      <g className={graze ? 'islands-graze' : undefined} style={graze ? anim(r, 7, 4, 10) : undefined}>
        <path d="M 5.6 -8 Q 9.8 -9.2 10.6 -6.6 Q 10.6 -4.8 8.4 -5 Q 6.2 -5.8 5.6 -8 Z" fill="#3f3742" />
        <ellipse cx="7" cy="-8.4" rx="1.6" ry=".8" fill="#3f3742" transform="rotate(-25 7 -8.4)" />
      </g>
    </g>
  )
}

// A short wooden fence along a gentle curve.
function fence(x, y, len, pal) {
  const n = Math.max(3, Math.round(len / 7))
  const pts = Array.from({ length: n + 1 }, (_, i) => [x + (len * i) / n, y + Math.sin((Math.PI * i) / n) * 3])
  const posts = pts.map(([px, py]) => `M ${f(px)} ${f(py + 1)} L ${f(px)} ${f(py - 7)}`).join(' ')
  return (
    <g>
      <path d={posts} stroke={pal.wood} strokeWidth="1.6" strokeLinecap="round" />
      <path d={`${curve(pts.map(([px, py]) => [px, py - 5.5]))} ${curve(pts.map(([px, py]) => [px, py - 2.5]))}`} stroke={mix(pal.wood, '#ffffff', 0.25)} strokeWidth="1.1" fill="none" />
    </g>
  )
}

// A washing line between two posts; the laundry flutters in the breeze.
function laundry(x, y, pal) {
  const cloths = [
    [8, '#ffffff', 7, 9],
    [18, '#f47a5c', 6, 7],
    [27, '#8fd0ea', 7, 10],
    [36, '#ffd45e', 5, 6],
  ]
  return (
    <g>
      <path d={`M ${f(x)} ${f(y)} L ${f(x)} ${f(y - 16)} M ${f(x + 44)} ${f(y - 1)} L ${f(x + 44)} ${f(y - 17)}`} stroke={pal.wood} strokeWidth="1.6" strokeLinecap="round" />
      <path d={`M ${f(x)} ${f(y - 15)} Q ${f(x + 22)} ${f(y - 10)} ${f(x + 44)} ${f(y - 16)}`} stroke="#6e5a5a" strokeWidth=".7" fill="none" />
      <g className="islands-flutter">
        {cloths.map(([dx, c, w, h], i) => (
          <path key={i} d={`M ${f(x + dx - w / 2)} ${f(y - 13.2)} L ${f(x + dx + w / 2)} ${f(y - 13.2)} L ${f(x + dx + w / 2 + 0.6)} ${f(y - 13.2 + h)} L ${f(x + dx - w / 2 + 0.4)} ${f(y - 13.2 + h - 1)} Z`} fill={c} />
        ))}
      </g>
    </g>
  )
}

/* ---------- waterfall ---------- */

function waterfall(seed, tier, x, y, len, wd, side, nStreaks, nMist) {
  const r = rng(seed)
  const reach = side * wd * 1.15
  const cxAt = (t) => x + reach * (1 - Math.pow(1 - Math.min(t / 0.14, 1), 2))
  const half = (t) => (wd * (1 + t * 1.8)) / 2
  const ts = [0, 0.03, 0.07, 0.11, 0.16, 0.3, 0.5, 0.75, 1]
  const sheet = (k) =>
    poly([...ts.map((t) => [cxAt(t) - half(t) * k, y + len * t]), ...ts.map((t) => [cxAt(t) + half(t) * k, y + len * t]).reverse()])
  const fx = x + reach
  return (
    <g>
      <path d={sheet(1.22)} fill={`url(#islands-falldk-${tier})`} />
      <path d={sheet(1)} fill={`url(#islands-fall-${tier})`} />
      {nStreaks > 0 && <path className="islands-shimmer" d={sheet(0.55)} fill={`url(#islands-fall-${tier})`} style={anim(r, 1.1, 0.7, 2)} />}
      {Array.from({ length: nStreaks }, (_, i) => {
        const sw = Math.max(1, wd * (0.12 + r() * 0.14))
        const sx = fx + (nStreaks > 1 ? i / (nStreaks - 1) - 0.5 : 0) * wd * 0.85 + (r() - 0.5) * wd * 0.15
        const sh = len * (0.1 + r() * 0.1)
        return (
          <rect
            key={i}
            className="islands-streak"
            x={f(sx - sw / 2)}
            y={f(y + len * 0.1)}
            width={f(sw)}
            height={f(sh)}
            rx={f(sw / 2)}
            fill="#ffffff"
            style={{ '--islands-fall': `${f(len * 0.68)}px`, ...anim(r, 1.2, 1, 3) }}
          />
        )
      })}
      <ellipse cx={f(x + reach * 0.35)} cy={f(y + 1)} rx={f(wd * 0.8)} ry={f(wd * 0.32)} fill="#ffffff" opacity=".9" />
      {Array.from({ length: nMist }, (_, i) => (
        <circle
          key={`m${i}`}
          className="islands-mist"
          cx={f(fx + (i - (nMist - 1) / 2) * wd * 1.3)}
          cy={f(y + len * (0.9 + r() * 0.08))}
          r={f(wd * (2.2 + r() * 1.2))}
          fill="url(#islands-mist-g)"
          style={anim(r, 3, 2.5, 6)}
        />
      ))}
    </g>
  )
}

function glints(seed, list) {
  const r = rng(seed)
  return list.map(([x, y, s], i) => (
    <path
      key={i}
      className="islands-glint"
      d={`M ${f(x)} ${f(y - 6 * s)} L ${f(x + 1.3 * s)} ${f(y - 1.3 * s)} L ${f(x + 6 * s)} ${f(y)} L ${f(x + 1.3 * s)} ${f(y + 1.3 * s)} L ${f(x)} ${f(y + 6 * s)} L ${f(x - 1.3 * s)} ${f(y + 1.3 * s)} L ${f(x - 6 * s)} ${f(y)} L ${f(x - 1.3 * s)} ${f(y - 1.3 * s)} Z`}
      fill="#ffffff"
      style={anim(r, 4.5, 4, 9)}
    />
  ))
}

/* ---------- floating island ---------- */

// The rock is a faceted inverted cone seen from slightly above: rings at
// uneven depths (strata) and ridges at fixed angles (facets). Facets are
// shaded by angle to the sun, rings get alternating strata tints, the right
// silhouette gets a warm rim light and the underside a lavender bounce.
function island(seed, tier, pal, o) {
  const r = rng(seed)
  const { cx, cy, w } = o
  const rx = w / 2
  const ry = rx * (o.e ?? 0.15)
  const D = w * (o.deep ?? 0.5 + r() * 0.3)
  const tipX = cx + (o.tip ?? (r() - 0.5) * 0.16) * w
  const rows = o.rows ?? 7
  const ts = [0, 0.05]
  for (let k = 1; k < rows; k++) ts.push(0.05 + (0.95 * (k + (r() - 0.5) * 0.55)) / rows)
  ts.push(1)
  const prof = (t) => Math.pow(Math.max(0, 1 - Math.pow(t, 1.3)), 1.25)
  const ctr = (t) => cx + (tipX - cx) * Math.pow(t, 1.4)
  const angs = [-90, -56, -22, 12, 48, 90].map((a, j) => (j === 0 || j === 5 ? a : a + (r() - 0.5) * 14))
  const ring = ts.map((t, k) => {
    const ledge = k < 2 ? 0 : (r() - 0.5) * 0.16 + (k % 2 ? -0.05 : 0.04)
    return angs.map((a) => {
      const th = (a * Math.PI) / 180
      const n = k < 2 ? 0 : (r() - 0.5) * 0.13
      const rad = rx * prof(t) * (1 + ledge + n)
      return [ctr(t) + rad * Math.sin(th), cy + D * t + ry * prof(t) * Math.cos(th) * (1 + ledge)]
    })
  })
  const last = ring.length - 1
  const col = (j) => poly([...ring.map((p) => p[j]), ...ring.map((p) => p[j + 1]).reverse()])
  const band = (k) => poly([...ring[k], ...[...ring[k + 1]].reverse()])
  const outline = poly([...ring.map((p) => p[0]), ...ring.map((p) => p[5]).reverse()])

  const dark = []
  const light = []
  for (let k = 2; k < last - 1; k++) {
    const v = r()
    if (v < 0.42) dark.push(band(k))
    else if (v < 0.72) light.push(band(k))
  }
  const ledges = []
  for (let k = 2; k < last - 1; k++) if (r() < 0.5) ledges.push(k)
  const lw = Math.max(0.8, w * 0.0045)
  const ledgeLt = ledges.map((k) => line(ring[k].slice(2))).join(' ')
  const ledgeDk = ledges.map((k) => line(ring[k].map(([x, y]) => [x, y + lw * 1.6]))).join(' ')
  let cracks = ''
  for (let i = 0; i < (o.cracks ?? 3); i++) {
    const k = 2 + Math.floor(r() * Math.max(1, last - 3))
    const j = 1 + Math.floor(r() * 4)
    const s0 = 0.25 + r() * 0.5
    const k2 = Math.min(k + 1 + Math.floor(r() * 2), last - 1)
    const a = ring[k][j]
    const b = ring[k][j + 1]
    const c = ring[k2][j]
    const d = ring[k2][j + 1]
    const s1 = Math.min(0.9, Math.max(0.1, s0 + (r() - 0.5) * 0.4))
    const p0 = [a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0]
    const p2 = [c[0] + (d[0] - c[0]) * s1, c[1] + (d[1] - c[1]) * s1]
    const p1 = [(p0[0] + p2[0]) / 2 + (r() - 0.5) * w * 0.03, (p0[1] + p2[1]) / 2]
    cracks += line([p0, p1, p2]) + ' '
  }
  const rimLight = line(ring.slice(1, last - 1).map((p) => p[5]))
  // fine sedimentary lines part-way across the facets
  let seams = ''
  for (let k = 2; k < last - 1; k++) {
    for (let m = 0; m < 2; m++) {
      const q = 0.3 + r() * 0.4
      const j0 = Math.floor(r() * 4)
      const j1 = Math.min(5, j0 + 1 + Math.floor(r() * 3))
      const pts = []
      for (let j = j0; j <= j1; j++) pts.push([ring[k][j][0] + (ring[k + 1][j][0] - ring[k][j][0]) * q, ring[k][j][1] + (ring[k + 1][j][1] - ring[k][j][1]) * q])
      seams += line(pts) + ' '
    }
  }

  // hanging roots: from the lower body and the tip, drawn behind the rock
  let roots = ''
  for (let i = 0; i < (o.roots ?? 0); i++) {
    const k = Math.floor(last * (0.4 + r() * 0.5))
    const side = r() < 0.5 ? 0 : 5
    const p = ring[k][side]
    const inward = side === 0 ? 1 : -1
    const x0 = p[0] + inward * 3
    const y0 = p[1] - 2
    const L = w * (0.06 + r() * 0.12)
    const sw = (r() - 0.5) * L * 0.5
    roots += `M ${f(x0)} ${f(y0)} C ${f(x0 - inward * 3)} ${f(y0 + L * 0.35)}, ${f(x0 + sw)} ${f(y0 + L * 0.6)}, ${f(x0 + sw * 0.5)} ${f(y0 + L)} `
  }
  for (let i = 0; i < (o.tipRoots ?? 0); i++) {
    const x0 = tipX + (r() - 0.5) * w * 0.05
    const y0 = cy + D * (0.9 + r() * 0.06)
    const L = w * (0.08 + r() * 0.16)
    const sw = (r() - 0.5) * L * 0.6
    roots += `M ${f(x0)} ${f(y0)} C ${f(x0 + sw * 0.2)} ${f(y0 + L * 0.4)}, ${f(x0 + sw)} ${f(y0 + L * 0.65)}, ${f(x0 + sw * 0.7)} ${f(y0 + L)} `
  }
  // roots that drape over the rock face from the soil band
  let drape = ''
  for (let i = 0; i < (o.drape ?? 0); i++) {
    const j = Math.floor(r() * 5)
    const s0 = 0.2 + r() * 0.6
    const a = ring[1][j]
    const b = ring[1][j + 1]
    const x0 = a[0] + (b[0] - a[0]) * s0
    const y0 = a[1] + (b[1] - a[1]) * s0 - 1
    const L = D * (0.12 + r() * 0.22)
    const sw = (r() - 0.5) * L * 0.35
    drape += `M ${f(x0)} ${f(y0)} C ${f(x0 + sw)} ${f(y0 + L * 0.3)}, ${f(x0 - sw)} ${f(y0 + L * 0.7)}, ${f(x0 + sw * 0.4)} ${f(y0 + L)} `
    if (r() < 0.6) drape += `M ${f(x0 + sw * 0.1)} ${f(y0 + L * 0.5)} q ${f(sw * 0.8 + 3)} ${f(L * 0.12)} ${f(sw + 4)} ${f(L * 0.3)} `
  }

  // grass: a top face (ellipse, lit from the back right) and a fringed skirt
  const topPts = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2
    const k = 1 + (r() - 0.5) * 0.045
    return [cx + Math.cos(a) * rx * 1.03 * k, cy + Math.sin(a) * ry * 1.08 * k]
  })
  const topFace = curve(topPts, true)
  const th = Math.max(2.5, w * 0.028)
  const N = Math.max(10, Math.round(w / 9))
  const skirtPts = []
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI
    const x = cx + Math.cos(a) * rx * 1.04
    const yb = cy + Math.sin(a) * ry * 1.1 + th
    skirtPts.push([x, yb + (i % 2 ? th * (0.35 + r() * 0.9) : -th * 0.15)])
  }
  const skirt = poly([[cx + rx * 1.04, cy], ...skirtPts, [cx - rx * 1.04, cy]])

  let mottle = ''
  let mottleLt = ''
  for (let i = 0; i < (o.mottle ?? 4); i++) {
    const u = (r() - 0.5) * 1.5
    const v = (r() - 0.5) * 1.2
    const d = `M ${f(cx + u * rx * 0.8 - rx * 0.14)} ${f(cy + v * ry * 0.7)} a ${f(rx * 0.14)} ${f(ry * 0.22)} 0 1 0 ${f(rx * 0.28)} 0 a ${f(rx * 0.14)} ${f(ry * 0.22)} 0 1 0 ${f(-rx * 0.28)} 0 Z `
    if (r() < 0.5) mottle += d
    else mottleLt += d
  }
  let tufts = ''
  if (o.tufts) {
    for (let i = 0; i < o.tufts; i++) {
      const a = Math.PI * (1.05 + (0.9 * (i + r() * 0.6)) / o.tufts)
      const x = cx + Math.cos(a) * rx * 1.0
      const y = cy + Math.sin(a) * ry * 1.04 + 1
      const hh = 2.5 + r() * 3.5
      tufts += `M ${f(x - 1.6)} ${f(y)} L ${f(x - 0.4 + (r() - 0.5) * 2)} ${f(y - hh)} L ${f(x + 0.4)} ${f(y - 1)} L ${f(x + 1.6 + (r() - 0.5) * 2)} ${f(y - hh * 0.7)} L ${f(x + 2)} ${f(y)} Z `
    }
  }
  let blades = ''
  for (let i = 0; i < (o.blades ?? 0); i++) {
    const u = (r() - 0.5) * 1.8
    const v = (r() - 0.5) * 1.5
    if (u * u + v * v > 0.85) continue
    const x = cx + u * rx
    const y = cy + v * ry
    const hh = 2 + r() * 2.5
    blades += `M ${f(x - 2)} ${f(y)} l 1 ${f(-hh)} M ${f(x)} ${f(y)} l 0.4 ${f(-hh * 1.2)} M ${f(x + 2)} ${f(y)} l -0.6 ${f(-hh * 0.9)} `
  }
  const flowers = (o.flowers ?? 0) > 0 && (
    <>
      {['#ffffff', '#ffd45e', '#ff9db5'].map((c, ci) => {
        let d = ''
        for (let i = 0; i < o.flowers; i++) {
          const u = (r() - 0.5) * 1.7
          const v = (r() - 0.5) * 1.4
          d += disc(cx + u * rx * 0.85, cy + v * ry * 0.75, 1.1 + r() * 0.6) + ' '
        }
        return <path key={ci} d={d} fill={c} opacity=".9" />
      })}
    </>
  )

  // surface positions: u across (-1 left .. 1 right), v depth (-1 back .. 1 front)
  const at = (u, v) => [cx + u * rx * 0.86, cy + v * ry * 0.72]
  const items = [...(o.items ?? [])].sort((a, b) => a[1] - b[1]).map(([u, v, fn], i) => <g key={i}>{fn(...at(u, v))}</g>)

  // vines hang from the grass skirt over the rock face and sway together
  const vines = (o.vines ?? []).map((a, i) => {
    const x0 = cx + Math.cos(a) * rx * 1.0
    const y0 = cy + Math.sin(a) * ry * 1.08 + th * 0.8
    const L = D * (0.16 + r() * 0.26)
    const pts = []
    const n = Math.max(3, Math.round(L / 9))
    const ph = r() * 6
    for (let k = 0; k <= n; k++) pts.push([x0 + Math.sin(ph + k * 1.3) * 2.2 * (k / n), y0 + (L * k) / n])
    let leaves = ''
    pts.slice(1).forEach(([x, y], k) => {
      const s = k % 2 ? 1 : -1
      leaves += `M ${f(x)} ${f(y)} q ${f(s * 3)} ${f(-3.4)} ${f(s * 5.4)} ${f(-0.6)} q ${f(-s * 2.6)} ${f(2.4)} ${f(-s * 5.4)} ${f(0.6)} Z `
    })
    return (
      <g key={i}>
        <path d={curve(pts)} stroke={pal.vine} strokeWidth={t2(Math.max(1, w * 0.004))} fill="none" strokeLinecap="round" />
        <path d={leaves} fill={i % 2 ? pal.leaf : pal.vine} />
      </g>
    )
  })

  let fall = null
  let stream = null
  if (o.fall) {
    const { a, len, wd, pond, streaks = 3, mist = 3 } = o.fall
    const sx = cx + Math.cos(a) * rx * 1.02
    const sy = cy + Math.sin(a) * ry * 1.06 + th * 0.4
    const side = Math.cos(a) < 0 ? -1 : 1
    fall = waterfall(seed + 7, tier, sx, sy, len, wd, side, streaks, mist)
    if (pond) {
      const [px, py] = at(...pond)
      stream = (
        <g>
          <ellipse cx={f(px)} cy={f(py)} rx={f(wd * 2.6)} ry={f(wd * 0.85)} fill={pal.waterDk} />
          <ellipse cx={f(px + wd * 0.5)} cy={f(py - wd * 0.15)} rx={f(wd * 1.6)} ry={f(wd * 0.4)} fill={pal.water} opacity=".85" />
          <path d={`M ${f(px)} ${f(py)} Q ${f((px + sx) / 2)} ${f(Math.max(py, sy) + ry * 0.25)} ${f(sx)} ${f(sy - th * 0.4)}`} stroke={pal.waterDk} strokeWidth={f(wd * 0.75)} fill="none" strokeLinecap="round" />
          <path d={`M ${f(px)} ${f(py)} Q ${f((px + sx) / 2)} ${f(Math.max(py, sy) + ry * 0.25)} ${f(sx)} ${f(sy - th * 0.4)}`} stroke={pal.water} strokeWidth={f(wd * 0.3)} fill="none" strokeLinecap="round" opacity=".9" />
        </g>
      )
    }
  }

  // loose rocks that float beside the island, each on its own bob
  const debris = Array.from({ length: o.debris ?? 0 }, (_, i) => {
    const side = i % 2 ? -1 : 1
    const x = cx + side * rx * (0.55 + r() * 0.4)
    const y = cy + D * (0.45 + r() * 0.35)
    const s = w * (0.018 + r() * 0.02)
    return (
      <g key={i} className="islands-bob" style={{ '--islands-amp': `${f(3 + r() * 4)}px`, ...anim(r, 3.5, 3, 8) }}>
        <path d={poly([[x - s, y - s * 0.3], [x - s * 0.2, y - s * 0.7], [x + s, y - s * 0.4], [x + s * 0.4, y + s * 1.4]])} fill={pal.rock[1]} />
        <path d={poly([[x - s * 0.2, y - s * 0.7], [x + s, y - s * 0.4], [x + s * 0.4, y + s * 1.4], [x + s * 0.1, y - s * 0.1]])} fill={pal.rock[3]} />
        <path d={poly([[x - s * 1.1, y - s * 0.35], [x - s * 0.2, y - s * 0.85], [x + s * 1.05, y - s * 0.45], [x + s * 0.1, y - s * 0.1]])} fill={pal.grass} />
      </g>
    )
  })

  const body = (
    <>
      {debris}
      {roots && (
        <g className="islands-hang" style={anim(r, 5, 3, 8)}>
          <path d={roots} stroke={pal.root} strokeWidth={t2(Math.max(0.9, w * 0.005))} fill="none" strokeLinecap="round" />
        </g>
      )}
      {[0, 1, 2, 3, 4].map((j) => (
        <path key={j} d={col(j)} fill={pal.rock[j]} />
      ))}
      {light.length > 0 && <path d={light.join(' ')} fill={pal.strataLt} opacity=".17" />}
      {dark.length > 0 && <path d={dark.join(' ')} fill={pal.strataDk} opacity=".22" />}
      <path d={band(0)} fill={pal.soil} />
      <path d={cracks} stroke={pal.strataDk} strokeWidth={t2(lw)} fill="none" opacity=".32" strokeLinejoin="round" />
      <path d={seams} stroke={pal.strataDk} strokeWidth={t2(lw * 0.8)} fill="none" opacity=".18" strokeLinejoin="round" />
      {ledgeDk && <path d={ledgeDk} stroke={pal.strataDk} strokeWidth={t2(lw)} fill="none" opacity=".28" />}
      {ledgeLt && <path d={ledgeLt} stroke={pal.rim} strokeWidth={t2(lw)} fill="none" opacity=".5" strokeLinejoin="round" />}
      <path d={outline} fill={`url(#islands-bounce-${tier})`} />
      <path d={rimLight} stroke={pal.rim} strokeWidth={t2(Math.max(1, w * 0.0075))} fill="none" opacity=".85" strokeLinecap="round" strokeLinejoin="round" />
      {drape && <path d={drape} stroke={pal.root} strokeWidth={t2(Math.max(0.8, w * 0.0035))} fill="none" strokeLinecap="round" opacity=".9" />}
      <path d={skirt} fill={`url(#islands-skirt-${tier})`} />
      <path d={topFace} fill={`url(#islands-top-${tier})`} />
      {mottle && <path d={mottle} fill={pal.grassDk} opacity=".22" />}
      {mottleLt && <path d={mottleLt} fill={pal.grassLt} opacity=".35" />}
      {tufts && <path d={tufts} fill={mix(pal.grass, pal.grassLt, 0.6)} />}
      {blades && <path d={blades} stroke={pal.grassDk} strokeWidth="1" strokeLinecap="round" opacity=".45" />}
      {flowers}
      {stream}
      {items}
      {vines.length > 0 && (
        <g className="islands-hang" style={anim(r, 5.5, 3, 8)}>
          {vines}
        </g>
      )}
      {fall}
      {o.front}
    </>
  )
  if (o.still) return <g>{body}</g>
  return (
    <g className="islands-bob" style={{ '--islands-amp': `${f(o.amp ?? 8)}px`, ...anim(r, o.period ?? 10, 5, 20) }}>
      {body}
    </g>
  )
}

/* ---------- clouds ---------- */

// One row of billows as two stacked unions: the shadow silhouette, then the
// sunlit body nudged toward the sun. cs: [x, y, r]
function billows(cs, tier, key) {
  return (
    <g key={key}>
      <path d={discs(cs)} fill={`url(#islands-cs-${tier})`} />
      <path d={discs(cs.map(([x, y, r]) => [x + r * 0.16, y - r * 0.22, r * 0.82]))} fill={`url(#islands-cl-${tier})`} />
    </g>
  )
}

// A billow: a main puff with a few smaller lobes on its upper rim.
function billow(r, x, y, rad, nl) {
  const out = []
  for (let i = 0; i < nl; i++) {
    const a = -Math.PI * (0.18 + (0.64 * (i + r())) / nl)
    out.push([x + Math.cos(a) * rad * 0.66, y + Math.sin(a) * rad * 0.6, rad * (0.36 + r() * 0.2)])
  }
  out.push([x, y, rad])
  return out
}

// A long cloud bank: rows of billows, back to front. When it pans (dur set)
// the rows repeat every half-width period and three copies are laid side by
// side, so panning by exactly one period loops seamlessly; a static bank is
// laid once across the whole plane. A few billows swell and settle on their
// own, so the surface churns.
function bank(seed, { rows, tier, baseColor, wave = 0, churn = 0, dur = 0 }) {
  const r = rng(seed)
  const span = W + 2 * PAD
  const Pd = dur ? span / 2 : span
  const offs = dur ? [0, Pd, 2 * Pd] : [0]
  const out = []
  rows.forEach(([y, size, lobes = 2], ri) => {
    const ph = r() * Math.PI * 2
    const list = []
    const churners = []
    let x = r() * size * 0.3
    while (x < Pd - size * 0.5) {
      const rad = size * (0.5 + r() * 0.55)
      const yy = y + wave * Math.sin((2 * Math.PI * x) / Pd + ph) - rad * 0.2 + (r() - 0.5) * size * 0.16
      const b = billow(r, x, yy, rad, lobes)
      if (churners.length < churn && rad > size * 0.85 && ri > 0 && r() < 0.35) churners.push(b)
      else list.push(b)
      x += size * (0.58 + r() * 0.4)
    }
    const at = (off, bs) => bs.flatMap((b) => b.map(([bx, by, br]) => [bx - PAD + off, by, br]))
    out.push(billows(offs.flatMap((off) => at(off, list)), tier, `r${ri}`))
    churners.forEach((b, i) =>
      offs.forEach((off) =>
        out.push(
          <g key={`c${ri}-${i}-${off}`} className="islands-churn" style={anim(r, 10, 8, 18)}>
            {billows(at(off, [b]), tier, 0)}
          </g>,
        ),
      ),
    )
  })
  const frontY = rows[rows.length - 1][0]
  const base = <rect x={-PAD} y={f(frontY + 6)} width={f(Pd * offs.length)} height={f(H + 80 - frontY)} fill={baseColor} />
  if (!dur) {
    return (
      <g>
        {out}
        {base}
      </g>
    )
  }
  return (
    <g className="islands-pan" style={{ '--islands-pan': `${-Pd}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-r() * dur)}s` }}>
      {out}
      {base}
    </g>
  )
}

// A free-standing cumulus mass: rows of billows under a hump-shaped top,
// with a soft lavender shadow over its flat underside.
function mass(seed, { x0, x1, base, height, size, tier, under, rows = 3, churn = 0, lobes = 2 }) {
  const r = rng(seed)
  const out = []
  let c = 0
  for (let row = 0; row < rows; row++) {
    const s = size * (0.7 + row * 0.22)
    const list = []
    const churners = []
    let x = x0 + s * 0.25 + r() * s * 0.3
    while (x < x1 - s * 0.25) {
      const u = (x - x0) / (x1 - x0)
      const hump = Math.pow(Math.sin(Math.PI * u), 0.85)
      const rad = s * (0.5 + r() * 0.4) * (0.6 + 0.55 * hump)
      const y = base - height * hump * (1 - row / rows) * (0.85 + r() * 0.25) + row * s * 0.3
      const b = billow(r, x, y, rad, lobes)
      if (c < churn && row < 2 && rad > s * 0.55 && r() < 0.4) {
        c++
        churners.push(b)
      } else list.push(...b)
      x += s * (0.5 + r() * 0.4)
    }
    out.push(billows(list, tier, `r${row}`))
    churners.forEach((b, i) =>
      out.push(
        <g key={`c${row}-${i}`} className="islands-churn" style={anim(r, 10, 8, 18)}>
          {billows(b, tier, 0)}
        </g>,
      ),
    )
  }
  return (
    <g>
      {out}
      {under && <ellipse cx={f((x0 + x1) / 2)} cy={f(base + size * 0.35)} rx={f((x1 - x0) * 0.52)} ry={f(size * 0.85)} fill={`url(#${under})`} />}
    </g>
  )
}

// Soft streaks of vapour that drift across a plane, fading in and out.
function wisps(seed, list) {
  const r = rng(seed)
  return list.map(([y, len, thick, dur, phase, op], i) => {
    const x = W + PAD + len * 0.6
    return (
      <g
        key={i}
        className="islands-wisp"
        style={{ '--islands-span': `${f(-(W + 2 * PAD + len * 1.4))}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-dur * phase)}s` }}
      >
        <g opacity={op}>
          <ellipse cx={f(x)} cy={f(y)} rx={f(len * 0.5)} ry={f(thick)} fill="url(#islands-wisp-g)" />
          <ellipse cx={f(x - len * 0.22)} cy={f(y + thick * 0.5)} rx={f(len * 0.34)} ry={f(thick * 0.7)} fill="url(#islands-wisp-g)" />
          <ellipse cx={f(x + len * 0.18 + r() * 10)} cy={f(y - thick * 0.45)} rx={f(len * 0.28)} ry={f(thick * 0.6)} fill="url(#islands-wisp-g)" />
        </g>
      </g>
    )
  })
}

/* ---------- sky ---------- */

const SUN = [1150, 150]

// Rays come in opposite pairs so the shape is centred on the sun. Each ray
// is three nested wedges (core, body, feather) so its edges fall off softly.
function rays(seed, n, spread, minL, maxL) {
  const r = rng(seed)
  const d = ['', '', '']
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + r() * 0.12
    const len = minL + r() * (maxL - minL)
    const s = spread * (0.6 + r() * 0.8)
    for (const b of [a, a + Math.PI]) {
      ;[0.3, 0.65, 1].forEach((k, j) => {
        const p1 = [SUN[0] + Math.cos(b - s * k) * len, SUN[1] + Math.sin(b - s * k) * len]
        const p2 = [SUN[0] + Math.cos(b + s * k) * len, SUN[1] + Math.sin(b + s * k) * len]
        d[j] += `M ${SUN[0]} ${SUN[1]} L ${f(p1[0])} ${f(p1[1])} L ${f(p2[0])} ${f(p2[1])} Z `
      })
    }
  }
  return d.map((dd, j) => <path key={j} d={dd} fill="url(#islands-ray-g)" opacity={[0.7, 0.45, 0.25][j]} />)
}

function cirrus(seed) {
  const r = rng(seed)
  return [
    [190, 92, 170],
    [420, 150, 120],
    [760, 78, 210],
    [980, 220, 130],
    [1320, 300, 120],
  ].map(([x, y, rx], i) => (
    <g key={i} className="islands-cirrus" style={{ '--islands-amp': `${f(-40 - r() * 60)}px`, ...anim(r, 40, 30, 60) }}>
      <g opacity={t2(0.45 + r() * 0.35)}>
        <ellipse cx={x} cy={y} rx={rx} ry={f(4 + r() * 3)} fill="url(#islands-wisp-g)" />
        <ellipse cx={f(x + rx * 0.35)} cy={f(y + 6)} rx={f(rx * 0.55)} ry={f(3 + r() * 2)} fill="url(#islands-wisp-g)" />
      </g>
    </g>
  ))
}

const sky = (
  <Svg>
    <defs>
      <radialGradient id="islands-halo-g">
        <stop offset="0" stopColor="#fff6dc" stopOpacity="0.9" />
        <stop offset="0.18" stopColor="#ffeccb" stopOpacity="0.6" />
        <stop offset="0.45" stopColor="#ffe3c4" stopOpacity="0.22" />
        <stop offset="1" stopColor="#ffe0c0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="islands-corona-g">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.3" stopColor="#fffbea" stopOpacity="0.95" />
        <stop offset="0.55" stopColor="#fff1cf" stopOpacity="0.45" />
        <stop offset="1" stopColor="#ffeccc" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="islands-ray-g" gradientUnits="userSpaceOnUse" cx={SUN[0]} cy={SUN[1]} r="820">
        <stop offset="0" stopColor="#fff4d6" stopOpacity="0.4" />
        <stop offset="0.3" stopColor="#ffeccb" stopOpacity="0.13" />
        <stop offset="1" stopColor="#ffe8c8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="islands-warm-g">
        <stop offset="0" stopColor="#ffe6c8" stopOpacity="0.75" />
        <stop offset="1" stopColor="#ffe6c8" stopOpacity="0" />
      </radialGradient>
      {wispDef}
    </defs>
    <ellipse cx="1060" cy="560" rx="760" ry="220" fill="url(#islands-warm-g)" />
    <circle cx={SUN[0]} cy={SUN[1]} r="560" fill="url(#islands-halo-g)" />
    <g className="islands-rays">
      {rays(11, 7, 0.05, 600, 900)}
    </g>
    <g className="islands-rays islands-rays-b">
      <g opacity=".6">{rays(12, 5, 0.09, 460, 760)}</g>
    </g>
    {cirrus(31)}
    <circle className="islands-sun" cx={SUN[0]} cy={SUN[1]} r="120" fill="url(#islands-corona-g)" />
    <circle cx={SUN[0]} cy={SUN[1]} r="38" fill="#fffef8" />
  </Svg>
)

/* ---------- craft and creatures ---------- */

// Hot-air balloon; colours: [envelope, stripe, band]. Gores bulge with the
// envelope and the whole thing is shaded from the right.
function balloon(seed, x, y, s, c, { haze, hk = 0, flame = true } = {}) {
  const r = rng(seed)
  const col = (v) => (haze ? mix(v, haze, hk) : v)
  const env = 'M 0 -34 C 21 -34 30 -18 28 -3 C 26 11 15 21 8 30 L -8 30 C -15 21 -26 11 -28 -3 C -30 -18 -21 -34 0 -34 Z'
  const gore = (k0, k1) => {
    const mer = (k) => {
      const e = 28 * Math.sin((k * Math.PI) / 8)
      return [
        [0, -34],
        [e * 0.74, -26],
        [e * 0.97, -10],
        [e * 0.88, 6],
        [e * 0.5, 22],
        [e * 0.29, 30],
      ]
    }
    const a = mer(k0)
    const b = mer(k1).reverse()
    return curve(a) + ' ' + curve(b).replace(/^M/, 'L') + ' Z'
  }
  return (
    <g transform={`translate(${f(x)} ${f(y)}) scale(${t2(s)})`}>
      <g className="islands-balloon-sway" style={anim(r, 6, 3, 8)}>
        <path d="M -6.5 36 L -5.5 46 M 6.5 36 L 5.5 46 M 0 36 L 0 46" stroke={col('#6b4a46')} strokeWidth=".8" />
        <rect x="-6.5" y="45.5" width="13" height="9" rx="1.6" fill={col('#8a5a40')} />
        <path d="M -6.5 45.5 L 6.5 45.5 L 6.5 48 L -6.5 48 Z" fill={col('#5c3529')} />
        <path d="M -6.5 50 L 6.5 50" stroke={col('#6e4430')} strokeWidth=".6" />
        <path d="M 2 45.5 L 6.5 45.5 L 6.5 54.5 L 2 54.5 Z" fill="#ffffff" opacity=".12" />
        {flame && <ellipse className="islands-flame" cx="0" cy="40" rx="2.2" ry="3.6" fill="#ffd27a" />}
        <path d={env} fill={col(c[0])} />
        <path d={[gore(-3, -2), gore(-1, 0), gore(1, 2), gore(3, 4)].join(' ')} fill={col(c[1])} />
        <path d="M -27 -6 C -16 -2 16 -2 27 -6 L 26.4 0 C 16 4 -16 4 -26.4 0 Z" fill={col(c[2])} opacity=".9" />
        <path d={env} fill="url(#islands-envshade-g)" />
        <path d="M 14 -28 C 22 -22 26 -12 25 -2" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".45" />
        <path d="M -8 30 L 8 30 L 6.5 36 L -6.5 36 Z" fill={col(c[2])} />
      </g>
    </g>
  )
}

// Small airship: shaded hull, a coral band, tail fins, gondola and a spinning prop.
function airship(x, y, s) {
  return (
    <g transform={`translate(${f(x)} ${f(y)}) scale(${t2(s)})`}>
      <path d="M 40 -4 L 56 -16 L 60 -16 L 54 -2 Z" fill="#d97a64" />
      <path d="M 40 4 L 56 16 L 60 16 L 54 2 Z" fill="#b85f55" />
      <ellipse cx="0" cy="0" rx="52" ry="15" fill="url(#islands-hull-g)" />
      <path d="M -16 -14.2 C -14 -6 -14 6 -16 14.2 L -9 14.8 C -7 6 -7 -6 -9 -14.8 Z" fill="#e37c63" opacity=".9" />
      <path d="M -46 -4 C -20 -9 20 -9 48 -4" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity=".55" />
      <path d="M -8 14 L -11 20 M 8 14 L 11 20" stroke="#7a6a7c" strokeWidth=".8" />
      <rect x="-13" y="19" width="26" height="7" rx="3" fill="#7d5a52" />
      <path d="M -9 21.4 L 9 21.4" stroke="#ffe2a8" strokeWidth="2" strokeDasharray="2.4 1.6" />
      <path d="M 52 -2 L 58 -2 L 58 2 L 52 2 Z" fill="#6f5a6a" />
      <g className="islands-prop">
        <ellipse cx="60" cy="0" rx="1.4" ry="8" fill="#6f5a6a" opacity=".7" />
      </g>
    </g>
  )
}

// A small bird seen from behind: wings beat in bursts, then glide.
// gull wing (left), as cubic segments from the shoulder; the right is mirrored
const WING_PTS = [
  [-3, -3.6, -5.8, -5.2, -8, -4.8],
  [-10.6, -4.4, -13.2, -3, -16, -1],
  [-12.6, -1.8, -9.6, -2.2, -7.6, -1.7],
  [-5, -1, -3, 0.6, -1, 1.7],
]
const wing = (m) => `M ${-m} 0 ${WING_PTS.map((c) => `C ${c.map((v, i) => (i % 2 ? v : v * m)).join(' ')}`).join(' ')} Z`
const WINGS = `${wing(1)} ${wing(-1)}`
function bird(r, x, y, s, color, key) {
  return (
    <g key={key} transform={`translate(${f(x)} ${f(y)}) scale(${t2(s)})`}>
      <path className="islands-flap" d={WINGS} fill={color} style={anim(r, 1.8, 1.4, 4)} />
      <ellipse cx="0" cy="0.8" rx="1.8" ry="2.7" fill={color} />
      <circle cx="0" cy="-1.8" r="1.35" fill={color} />
    </g>
  )
}

function flock(seed, n, { x0, y0, span, dur, phase, scale, color, dx = -1 }) {
  const r = rng(seed)
  return (
    <g
      className="islands-cruise"
      style={{ '--islands-span': `${f(span)}px`, animationDuration: `${dur}s`, animationDelay: `${t2(-dur * phase)}s` }}
    >
      {Array.from({ length: n }, (_, i) => {
        const row = Math.ceil(i / 2)
        const s = scale * (0.8 + r() * 0.35)
        const x = x0 + dx * row * 30 * scale + (r() - 0.5) * 12 * scale
        const y = y0 + (i % 2 ? -1 : 1) * row * 13 * scale + (r() - 0.5) * 8 * scale
        return bird(r, x, y, s, color, i)
      })}
    </g>
  )
}

// Two birds circling lazily: x and y oscillate a quarter-cycle apart.
function circling(seed, list, color) {
  const r = rng(seed)
  return list.map(([x, y, rx, ry, T, s], i) => (
    <g key={i} className="islands-orbit-x" style={{ '--islands-rx': `${rx}px`, animationDuration: `${T}s`, animationDelay: `${t2(-r() * T)}s` }}>
      <g className="islands-orbit-y" style={{ '--islands-ry': `${ry}px`, animationDuration: `${T}s`, animationDelay: `${t2(-r() * T)}s` }}>
        {bird(r, x, y, s, color, 0)}
      </g>
    </g>
  ))
}

// Dandelion seeds floating on the breeze, right to left with the wind.
function seeds(seed, n) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const x = W + 80 + r() * 200
    const y = 500 + r() * 320
    const s = 1 + r() * 0.8
    const dur = 26 + r() * 22
    let pap = ''
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI * (0.05 + (0.9 * k) / 8)
      pap += `M 0 -9 l ${f(Math.cos(a) * 6)} ${f(Math.sin(a) * 6)} `
    }
    return (
      <g
        key={i}
        className="islands-seed"
        style={{
          '--islands-dx': `${f(-(W + 400 + r() * 200))}px`,
          '--islands-dy': `${f(-60 - r() * 130)}px`,
          animationDuration: `${t2(dur)}s`,
          animationDelay: `${t2(-r() * dur)}s`,
        }}
      >
        <g transform={`translate(${f(x)} ${f(y)}) scale(${t2(s)})`}>
          <circle cx="0" cy="-10" r="6.5" fill="#ffffff" opacity=".22" />
          <path d={`M 0 0 L 0 -9 ${pap}`} stroke="#ffffff" strokeWidth=".7" fill="none" strokeLinecap="round" />
          <ellipse cx="0" cy="0.6" rx=".9" ry="1.6" fill="#cdb48e" />
        </g>
      </g>
    )
  })
}

/* ---------- the kite on the hero island ---------- */

function kid(x, base, s) {
  return (
    <g transform={`translate(${f(x)} ${f(base)}) scale(${t2(s)})`}>
      <ellipse cx="-2" cy="0.4" rx="5" ry="1.2" fill={NEAR.grassDeep} opacity=".35" />
      <path d="M -1.6 0 L -1.3 -6 M 1.6 0 L 1.3 -6" stroke="#3b3550" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M -2.8 -5.4 Q -3 -11.4 0 -11.8 Q 3 -11.4 2.8 -5.4 Z" fill="#e8553f" />
      <path d="M -1.8 -10.4 L -6.4 -16.4" stroke="#f0c39c" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M 2 -10 L 3.6 -6.4" stroke="#f0c39c" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="0" cy="-14.4" r="2.7" fill="#f0c39c" />
      <path d="M -2.8 -14.6 Q -2.4 -18 0.6 -17.6 Q 3 -17.2 2.8 -14.2 Q 1 -15.8 -2.8 -14.6 Z" fill="#5a3a2e" />
    </g>
  )
}

function kite(hx, hy, kx, ky) {
  const sag = [(hx + kx) / 2 + 16, (hy + ky) / 2 + 22]
  const bows = []
  for (let k = 1; k <= 5; k++) {
    const y = 15 + k * 9
    const x = Math.sin(k * 1.1) * 3.5
    bows.push([x, y])
  }
  const tail = curve([[0, 14], ...bows])
  return (
    <g className="islands-kite">
      <path d={`M ${f(hx)} ${f(hy)} Q ${f(sag[0])} ${f(sag[1])} ${f(kx)} ${f(ky + 2)}`} stroke="#4b4760" strokeWidth=".9" fill="none" opacity=".75" />
      <g transform={`translate(${f(kx)} ${f(ky)}) rotate(-14)`}>
        <g className="islands-kite-wobble">
          <path d={tail} stroke="#4b4760" strokeWidth=".8" fill="none" />
          {bows.map(([x, y], i) => (
            <path key={i} d={`M ${f(x - 3.4)} ${f(y - 2)} L ${f(x + 3.4)} ${f(y + 2)} L ${f(x + 3.4)} ${f(y - 2)} L ${f(x - 3.4)} ${f(y + 2)} Z`} fill={i % 2 ? '#ffd45e' : '#3fb4c8'} />
          ))}
          <path d="M 0 -17 L 12 -3 L 0 15 Z" fill="#ffcf4a" />
          <path d="M 0 -17 L -12 -3 L 0 15 Z" fill="#e8553f" />
          <path d="M 0 -17 L 12 -3 L 0 -3 Z" fill="#ffe9a0" />
          <path d="M 0 -17 L -12 -3 L 0 -3 Z" fill="#f47a5c" />
          <path d="M 0 -17 L 0 15 M -12 -3 L 12 -3" stroke="#7a4c3a" strokeWidth=".7" />
        </g>
      </g>
    </g>
  )
}

/* ---------- layers ---------- */

const distantIsles = (
  <Svg>
    <defs>
      {tierDefs('far', FAR)}
      <linearGradient id="islands-envshade-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3a1f3c" stopOpacity="0.38" />
        <stop offset="0.55" stopColor="#3a1f3c" stopOpacity="0" />
        <stop offset="1" stopColor="#fff6e8" stopOpacity="0.18" />
      </linearGradient>
    </defs>
    {balloon(901, 196, 176, 0.36, ['#f07f9c', '#fff0f3', '#c95577'], { haze: '#c4d6f0', hk: 0.5, flame: false })}
    {island(101, 'far', FAR, { cx: 150, cy: 268, w: 62, amp: 3, period: 12, rows: 4, items: [[0.1, -0.3, (x, y) => pine(1, x, y, 11, FAR)]] })}
    {island(102, 'far', FAR, { cx: 398, cy: 346, w: 40, amp: 3, period: 10, rows: 4 })}
    {island(103, 'far', FAR, { cx: 1004, cy: 330, w: 46, amp: 3, period: 11, rows: 4, items: [[-0.2, -0.2, (x, y) => roundTree(2, x, y, 9, FAR)]] })}
    {island(104, 'far', FAR, {
      cx: 1318,
      cy: 262,
      w: 74,
      amp: 4,
      period: 13,
      rows: 4,
      items: [
        [-0.3, -0.3, (x, y) => pine(3, x, y, 13, FAR)],
        [0.25, -0.1, (x, y) => roundTree(4, x, y, 10, FAR)],
      ],
      fall: { a: Math.PI * 0.9, len: 70, wd: 2.2, streaks: 0, mist: 0 },
    })}
    {island(105, 'far', FAR, { cx: 470, cy: 404, w: 52, amp: 4, period: 9, rows: 4, items: [[0.2, -0.2, (x, y) => pine(5, x, y, 10, FAR)]] })}
    {island(106, 'far', FAR, {
      cx: 792,
      cy: 420,
      w: 98,
      amp: 5,
      period: 14,
      rows: 5,
      items: [
        [-0.45, -0.4, (x, y) => pine(6, x, y, 16, FAR)],
        [-0.15, -0.6, (x, y) => pine(7, x, y, 13, FAR)],
        [0.3, -0.2, (x, y) => cottage(8, x, y, 0.5, FAR, false)],
      ],
      fall: { a: Math.PI * 0.12, len: 90, wd: 2.6, streaks: 0, mist: 0 },
    })}
    {island(107, 'far', FAR, { cx: 610, cy: 458, w: 56, amp: 4, period: 10, rows: 4 })}
    {island(108, 'far', FAR, { cx: 986, cy: 452, w: 66, amp: 4, period: 12, rows: 4, items: [[0, -0.3, (x, y) => roundTree(9, x, y, 11, FAR)]] })}
    {island(109, 'far', FAR, { cx: 92, cy: 410, w: 58, amp: 4, period: 11, rows: 4 })}
    {flock(141, 4, { x0: W + 60, y0: 380, span: -(W + 2 * PAD + 200), dur: 110, phase: 0.3, scale: 0.42, color: '#8f9bc0', dx: 1 })}
  </Svg>
)

const horizonLayer = (
  <Svg>
    <defs>
      {cloudDefs('far')}
      <linearGradient id="islands-hull-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff9ef" />
        <stop offset="0.45" stopColor="#f1e6e4" />
        <stop offset="1" stopColor="#b9b6d6" />
      </linearGradient>
    </defs>
    {mass(201, { x0: -240, x1: 330, base: 590, height: 82, size: 40, tier: 'far', rows: 3, churn: 1 })}
    {mass(202, { x0: 1130, x1: 1680, base: 590, height: 64, size: 38, tier: 'far', rows: 3, churn: 1 })}
    <g className="islands-cruise" style={{ '--islands-span': `${-(W + 2 * PAD + 160)}px`, animationDuration: '230s', animationDelay: '-70s' }}>
      <g className="islands-bob" style={{ '--islands-amp': '5px', animationDuration: '7s' }}>
        {airship(W + PAD + 70, 392, 0.72)}
      </g>
    </g>
    {bank(211, {
      rows: [
        [552, 13, 0],
        [562, 17, 1],
        [575, 22, 1],
        [592, 28, 1],
        [614, 34],
        [642, 42],
      ],
      tier: 'far',
      baseColor: '#e3dfec',
      wave: 5,
    })}
  </Svg>
)

const middleIsles = (
  <Svg>
    <defs>
      {tierDefs('mid', MID)}
      {mistDef}
      {wispDef}
      <radialGradient id="islands-lamp-g">
        <stop offset="0" stopColor="#fffbe0" stopOpacity="1" />
        <stop offset="0.4" stopColor="#ffe7a0" stopOpacity="0.6" />
        <stop offset="1" stopColor="#ffe7a0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="islands-beam-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff6c8" stopOpacity="0" />
        <stop offset="0.5" stopColor="#fff6c8" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
      </linearGradient>
    </defs>
    {/* left: farmstead isle with a waterfall */}
    {island(301, 'mid', MID, {
      cx: 250,
      cy: 468,
      w: 250,
      amp: 8,
      period: 12,
      rows: 6,
      roots: 4,
      tipRoots: 3,
      drape: 3,
      debris: 1,
      tufts: 14,
      vines: [Math.PI * 0.62, Math.PI * 0.35],
      items: [
        [-0.5, -0.5, (x, y) => pine(11, x, y, 46, MID)],
        [-0.28, -0.8, (x, y) => pine(12, x, y, 38, MID)],
        [0.05, -0.35, (x, y) => cottage(13, x, y, 0.92, MID)],
        [0.55, -0.55, (x, y) => roundTree(14, x, y, 36, MID)],
        [-0.62, 0.3, (x, y) => bush(x, y, 6, MID)],
      ],
      fall: { a: Math.PI * 0.16, len: 190, wd: 6, pond: [0.4, 0.15], streaks: 3, mist: 2 },
    })}
    {/* right: lighthouse isle */}
    {island(302, 'mid', MID, {
      cx: 1212,
      cy: 408,
      w: 272,
      amp: 9,
      period: 14,
      rows: 6,
      roots: 4,
      tipRoots: 3,
      drape: 4,
      debris: 1,
      tufts: 16,
      vines: [Math.PI * 0.4, Math.PI * 0.72, Math.PI * 0.2],
      items: [
        [-0.55, -0.45, (x, y) => pine(21, x, y, 44, MID, true)],
        [-0.36, -0.75, (x, y) => pine(22, x, y, 36, MID)],
        [-0.08, -0.2, (x, y) => cottage(23, x, y, 0.78, MID)],
        [0.4, -0.35, (x, y) => lighthouse(x, y, 1.05, MID)],
        [0.75, 0.15, (x, y) => roundTree(24, x, y, 30, MID)],
        [-0.7, 0.3, (x, y) => bush(x, y, 6, MID)],
      ],
      fall: { a: Math.PI * 0.9, len: 210, wd: 6.5, pond: [-0.45, 0.2], streaks: 3, mist: 2 },
    })}
    {/* centre: two islets joined by a rope bridge, floating as one */}
    <g className="islands-bob" style={{ '--islands-amp': '7px', animationDuration: '11s', animationDelay: '-4s' }}>
      {island(303, 'mid', MID, {
        cx: 586,
        cy: 604,
        w: 116,
        still: true,
        rows: 5,
        tipRoots: 2,
        tufts: 8,
        items: [
          [-0.3, -0.4, (x, y) => roundTree(31, x, y, 30, MID)],
          [0.35, -0.2, (x, y) => bush(x, y, 5, MID)],
        ],
      })}
      {island(304, 'mid', MID, {
        cx: 800,
        cy: 580,
        w: 150,
        still: true,
        rows: 5,
        tipRoots: 3,
        tufts: 10,
        vines: [Math.PI * 0.55],
        items: [
          [-0.1, -0.5, (x, y) => pine(41, x, y, 40, MID, true)],
          [0.3, -0.3, (x, y) => pine(42, x, y, 30, MID)],
          [0.55, 0.2, (x, y) => bush(x, y, 5, MID)],
        ],
        fall: { a: Math.PI * 0.4, len: 100, wd: 3.4, streaks: 2, mist: 1 },
      })}
      {(() => {
        const A = [636, 611]
        const B = [732, 589]
        const q = (t, lift = 0) => {
          const sag = 14
          const x = A[0] + (B[0] - A[0]) * t
          const y = A[1] + (B[1] - A[1]) * t + sag * 4 * t * (1 - t) - lift
          return [x, y]
        }
        const deck = Array.from({ length: 13 }, (_, i) => q(i / 12))
        const rail = Array.from({ length: 13 }, (_, i) => q(i / 12, 8 - 2 * 4 * (i / 12) * (1 - i / 12)))
        const planks = deck
          .slice(1, -1)
          .map(([x, y]) => `M ${f(x)} ${f(y - 0.6)} L ${f(x)} ${f(y + 2.2)}`)
          .join(' ')
        const ties = deck
          .filter((_, i) => i % 3 === 0)
          .map(([x, y], i) => {
            const [rx2, ry2] = rail[i * 3]
            return `M ${f(x)} ${f(y)} L ${f(rx2)} ${f(ry2)}`
          })
          .join(' ')
        return (
          <g>
            <path d={curve(deck)} stroke={MID.wood} strokeWidth="3.2" fill="none" />
            <path d={planks} stroke={mix(MID.wood, '#ffffff', 0.25)} strokeWidth="1.6" />
            <path d={`${curve(rail)} ${ties}`} stroke={MID.wood} strokeWidth=".8" fill="none" />
            <path d={`M ${A[0]} ${A[1]} L ${A[0]} ${A[1] - 10} M ${B[0]} ${B[1]} L ${B[0]} ${B[1] - 10}`} stroke={MID.wood} strokeWidth="2" />
          </g>
        )
      })()}
    </g>
    {island(305, 'mid', MID, { cx: 452, cy: 628, w: 54, amp: 6, period: 9, rows: 4, items: [[0, -0.3, (x, y) => roundTree(51, x, y, 18, MID)]] })}
    {glints(71, [
      [372, 560, 0.8],
      [1080, 520, 0.8],
      [1088, 600, 0.6],
    ])}
    {wisps(81, [
      [536, 260, 9, 120, 0.2, 0.75],
      [452, 200, 7, 150, 0.7, 0.6],
    ])}
  </Svg>
)

const balloonLayer = (
  <Svg>
    <defs>
      <linearGradient id="islands-envshade-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3a1f3c" stopOpacity="0.38" />
        <stop offset="0.55" stopColor="#3a1f3c" stopOpacity="0" />
        <stop offset="1" stopColor="#fff6e8" stopOpacity="0.18" />
      </linearGradient>
    </defs>
    <g className="islands-drift" style={{ '--islands-dx': '-46px', animationDuration: '38s', animationDelay: '-12s' }}>
      <g className="islands-bob" style={{ '--islands-amp': '9px', animationDuration: '9s', animationDelay: '-3s' }}>
        {balloon(911, 506, 440, 1.3, ['#ff9a5c', '#fff0dc', '#e2604a'])}
      </g>
    </g>
    <g className="islands-drift" style={{ '--islands-dx': '30px', animationDuration: '46s', animationDelay: '-30s' }}>
      <g className="islands-bob" style={{ '--islands-amp': '6px', animationDuration: '11s', animationDelay: '-7s' }}>
        {balloon(912, 1012, 252, 0.55, ['#5cc2c0', '#ffe08a', '#3f9aa0'], { haze: '#bcd0ee', hk: 0.25 })}
      </g>
    </g>
  </Svg>
)

const cloudSea = (
  <Svg>
    <defs>
      {cloudDefs('mid')}
      {wispDef}
      <radialGradient id="islands-wash-g">
        <stop offset="0" stopColor="#ffe9cc" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffe9cc" stopOpacity="0" />
      </radialGradient>
    </defs>
    {bank(401, {
      rows: [
        [668, 24, 1],
        [688, 32, 1],
        [714, 44],
        [750, 58],
        [798, 76],
        [856, 96],
      ],
      tier: 'mid',
      baseColor: '#b9bfe2',
      wave: 10,
      churn: 1,
      dur: 170,
    })}
    <ellipse cx="1120" cy="660" rx="620" ry="120" fill="url(#islands-wash-g)" />
    {wisps(411, [
      [628, 320, 12, 95, 0.1, 0.8],
      [700, 260, 10, 110, 0.55, 0.7],
    ])}
  </Svg>
)

// hero island geometry shared by the kite
const KID = [1032, 612, 1.3]
const HAND = [KID[0] - 6.4 * KID[2], KID[1] - 16.4 * KID[2]]

const heroIsles = (
  <Svg>
    <defs>
      {tierDefs('near', NEAR)}
      {mistDef}
      {wispDef}
    </defs>
    {circling(601, [
      [1205, 470, 70, 18, 9, 0.85],
      [1160, 500, 54, 14, 11, 0.7],
    ], '#4a5679')}
    {/* left hero: a cottage, an orchard and a washing line */}
    {island(501, 'near', NEAR, {
      cx: 150,
      cy: 690,
      w: 330,
      e: 0.16,
      amp: 9,
      period: 14,
      rows: 8,
      roots: 5,
      drape: 5,
      debris: 1,
      tufts: 26,
      flowers: 7,
      blades: 22,
      mottle: 5,
      vines: [Math.PI * 0.3, Math.PI * 0.45, Math.PI * 0.15],
      items: [
        [-0.55, -0.35, (x, y) => pine(61, x, y, 64, NEAR, true)],
        [-0.25, -0.7, (x, y) => roundTree(62, x, y, 66, NEAR, true)],
        [0.62, -0.55, (x, y) => pine(63, x, y, 50, NEAR)],
        [0.22, -0.3, (x, y) => cottage(64, x, y, 1.3, NEAR)],
        [0.75, 0.25, (x, y) => bush(x, y, 8, NEAR)],
        [-0.05, 0.45, (x, y) => bush(x, y, 6, NEAR)],
        [0.44, -0.05, (x, y) => laundry(x, y, NEAR)],
        [-0.42, 0.55, (x, y) => fence(x, y, 52, NEAR)],
      ],
    })}
    {/* right hero: windmill, cottage, sheep and a kite flyer */}
    {island(502, 'near', NEAR, {
      cx: 1130,
      cy: 602,
      w: 460,
      e: 0.15,
      deep: 0.72,
      amp: 11,
      period: 16,
      rows: 9,
      roots: 6,
      tipRoots: 4,
      drape: 7,
      debris: 2,
      tufts: 36,
      flowers: 10,
      blades: 34,
      mottle: 6,
      cracks: 5,
      vines: [Math.PI * 0.18, Math.PI * 0.3, Math.PI * 0.62, Math.PI * 0.76],
      items: [
        [-0.66, -0.5, (x, y) => pine(71, x, y, 78, NEAR, true)],
        [-0.42, -0.8, (x, y) => roundTree(72, x, y, 66, NEAR, true)],
        [0.7, -0.75, (x, y) => roundTree(73, x, y, 58, NEAR, true)],
        [0.88, -0.35, (x, y) => pine(74, x, y, 46, NEAR)],
        [0.48, -0.15, (x, y) => windmill(x, y, 1.35, NEAR)],
        [0.06, -0.55, (x, y) => cottage(75, x, y, 1.25, NEAR)],
        [-0.12, 0.35, (x, y) => sheep(76, x, y, 1.15, NEAR, false, true)],
        [0.2, 0.6, (x, y) => sheep(77, x, y, 1.1, NEAR, true, true)],
        [0.3, 0.15, (x, y) => sheep(78, x, y, 1, NEAR, false, false)],
        [0.82, 0.35, (x, y) => bush(x, y, 9, NEAR)],
        [0.42, 0.7, (x, y) => fence(x, y, 70, NEAR)],
      ],
      fall: { a: Math.PI * 0.88, len: 230, wd: 11, pond: [-0.42, 0.05], streaks: 5, mist: 4 },
      front: (
        <>
          {kid(KID[0], KID[1], KID[2])}
          {kite(HAND[0], HAND[1], 904, 458)}
          {glints(97, [
            [918, 700, 1.1],
            [930, 780, 0.9],
          ])}
        </>
      ),
    })}
    {wisps(611, [[760, 380, 13, 80, 0.35, 0.7]])}
  </Svg>
)

const foreground = (
  <Svg>
    <defs>
      {cloudDefs('near')}
      {underGrad('islands-under-near', '#b9bee2', 0.7)}
      {wispDef}
    </defs>
    {mass(703, { x0: 330, x1: 1120, base: 975, height: 80, size: 60, tier: 'near', under: 'islands-under-near', rows: 3, churn: 1 })}
    {mass(701, { x0: -400, x1: 420, base: 950, height: 175, size: 66, tier: 'near', under: 'islands-under-near', rows: 4, churn: 3 })}
    {mass(702, { x0: 990, x1: 1720, base: 950, height: 200, size: 70, tier: 'near', under: 'islands-under-near', rows: 4, churn: 3 })}
    {seeds(721, 9)}
    {flock(711, 6, { x0: -240, y0: 392, span: W + 2 * PAD + 420, dur: 60, phase: 0.42, scale: 1.15, color: '#46527a' })}
    {wisps(731, [[820, 420, 16, 70, 0.6, 0.65]])}
  </Svg>
)

/* ---------- the world ---------- */

export default {
  id: 'islands',
  name: 'Sky Islands',
  tag: 'Above the clouds',
  accent: '#7ccf5c',
  accent2: '#ffa36b',
  ink: '#2e7429',
  glow: '#b6e8a0',
  light: true,
  clockColor: '#1f3557',
  sky: 'linear-gradient(180deg,#76b4ee 0%,#9ccbf4 26%,#cbe3f8 50%,#f3e6e2 68%,#ffdcc6 84%,#ffd2bb 100%)',
  layers: [
    { name: 'Sunlit sky', depth: 0, sky: true, el: sky },
    { name: 'Distant isles', depth: 0.1, el: distantIsles },
    { name: 'Cloud horizon', depth: 0.22, el: horizonLayer },
    { name: 'Depth clock', depth: 0.38, clock: true },
    { name: 'Middle isles', depth: 0.52, el: middleIsles },
    { name: 'Hot-air balloons', depth: 0.62, el: balloonLayer },
    { name: 'Cloud sea', depth: 0.74, el: cloudSea },
    { name: 'Hero isles', depth: 1, el: heroIsles },
    { name: 'Billows & birds', depth: 1.3, el: foreground },
  ],
}
