// Rainforest Falls: a misty jungle gorge at mid-morning. Sun shafts slant in
// from the upper left through drifting mist banks; a powerful waterfall pours
// off a mossy cliff into a plunge pool (with a rainbow in the spray) and the
// river winds out toward the viewer past wet boulders. Scarlet macaws cross the
// gorge, a toucan perches on an orchid-hung bough, a spider monkey swings, blue
// morphos flit over the water, and a frame of monstera, banana and palm leaves
// sways in a slow breeze.
import './rainforest.css'
import { H, rng, f, Svg } from './kit.jsx'

/* ---------- geometry helpers ---------- */

const TAU = Math.PI * 2
const SUN = [-0.55, -0.83] // unit vector toward the sun (upper left)
const rad = (d) => (d * Math.PI) / 180
const pt = (p) => `${f(p[0])} ${f(p[1])}`
const poly = (pts, close = true) => `M ${pts.map(pt).join(' L ')}${close ? ' Z' : ''}`

function qb(a, c, b, t) {
  const u = 1 - t
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]
}
function qt(a, c, b, t) {
  const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0])
  const dy = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])
  const l = Math.hypot(dx, dy) || 1
  return [dx / l, dy / l]
}

// Height of a polyline baseline at x (linear between control points).
function along(pts, x) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return pts[pts.length - 1][1]
}

// Small leaf blade from base (bx,by) along angle a, drooping by `droop`.
function leaf(bx, by, a, len, w, droop = 0) {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const nx = -dy
  const ny = dx
  const P = (t, s) => [bx + dx * len * t + nx * w * s, by + dy * len * t + ny * w * s + droop * t * t]
  return ` M ${f(bx)} ${f(by)} C ${pt(P(0.28, 1))}, ${pt(P(0.78, 0.75))}, ${pt(P(1, 0))} C ${pt(P(0.78, -0.75))}, ${pt(P(0.28, -1))}, ${f(bx)} ${f(by)} Z`
}

// Leafy clump: an ellipse whose rim is a run of outward bumps (clockwise).
function bumpy(cx, cy, rx, ry, n, r, amp = 0.56) {
  const a0 = r() * TAU
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + (r() - 0.5) * 0.35) / n) * TAU
    const k = 0.9 + r() * 0.14
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  let d = ` M ${pt(pts[0])}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    const rr = Math.hypot(q[0] - p[0], q[1] - p[1]) * (amp + r() * 0.22)
    d += ` A ${f(rr)} ${f(rr)} 0 0 1 ${pt(q)}`
  }
  return `${d} Z`
}

// Pointed leaves sticking out around an ellipse so a clump reads as foliage,
// split into sun-facing and shaded sets.
function fringe(r, cx, cy, rx, ry, n, size, { from = 0, to = TAU } = {}) {
  let lit = ''
  let shade = ''
  for (let i = 0; i < n; i++) {
    const a = from + ((i + r() * 0.8) / n) * (to - from)
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const L = size * (0.7 + r() * 0.6)
    const piece = leaf(cx + ca * rx * 0.86, cy + sa * ry * 0.82, a + (r() - 0.5) * 0.5, L, L * 0.3, L * 0.35)
    if (ca * SUN[0] + sa * SUN[1] > 0.15) lit += piece
    else shade += piece
  }
  return { lit, shade }
}

// Leaf width profiles along the midrib (0 = base, 1 = tip).
const lance = (t) => Math.pow(Math.sin(Math.PI * t), 0.8)
const strap = (t) => (t < 0.1 ? Math.sqrt(t / 0.1) : t > 0.82 ? Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) : 1)

// Two-tone leaf blade along a quadratic midrib a -> b (control c). The half
// facing the sun is `lit`. `tears` are [side, t, depth] slits (banana leaves).
function blade(a, c, b, w, { prof = lance, n = 26, tears = [], veins = 0, tilt = 0.06 } = {}) {
  const at = (t, s, k) => {
    const [x, y] = qb(a, c, b, t)
    const [tx, ty] = qt(a, c, b, t)
    const ww = w * prof(Math.min(Math.max(t, 0), 1)) * k * s
    return [x - ty * ww, y + tx * ww]
  }
  const side = (s) => {
    const marks = tears.filter((m) => m[0] === s)
    const keys = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      if (!marks.some((m) => Math.abs(t - m[1]) < 0.016)) keys.push([t, t, 1])
    }
    for (const [, m, dep = 0.15] of marks) keys.push([m - 0.008, m - 0.008, 1], [m, m - 0.045, dep], [m + 0.008, m + 0.008, 1])
    keys.sort((p, q) => p[0] - q[0])
    return keys.map(([, t, k]) => at(t, s, k))
  }
  const rib = Array.from({ length: n + 1 }, (_, i) => qb(a, c, b, i / n))
  const back = rib.slice().reverse()
  const pos = side(1)
  const neg = side(-1)
  const [tx, ty] = qt(a, c, b, 0.5)
  const posLit = -ty * SUN[0] + tx * SUN[1] > 0
  let veinD = ''
  for (let i = 1; i <= veins; i++) {
    const t = 0.05 + (0.86 * i) / (veins + 1)
    for (const s of [1, -1]) veinD += ` M ${pt(qb(a, c, b, t))} L ${pt(at(Math.min(t + tilt, 0.97), s, 0.9))}`
  }
  return {
    lit: poly([...(posLit ? pos : neg), ...back]),
    shade: poly([...(posLit ? neg : pos), ...back]),
    rib: poly(rib.slice(0, Math.ceil(n * 0.94)), false),
    edge: poly(posLit ? pos : neg, false),
    veins: veinD,
  }
}

// Monstera: heart-shaped, deeply slit and holed, split into lit/shade halves.
// `plain` drops the slits and holes (elephant ear / philodendron).
function monstera(base, ang, size, { bend = 0, slits = 5, depth = 0.6, seed = 1, plain = false, width = 1 } = {}) {
  const r = rng(seed)
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const nx = -dy
  const ny = dx
  const P = ([u, v]) => {
    const uu = u * width + bend * v * v
    return [base[0] + (dx * v + nx * uu) * size, base[1] + (dy * v + ny * uu) * size]
  }
  const edge = (s, ph) => [s * 0.5 * Math.sin(ph) * (1 - (0.22 * ph) / Math.PI), 0.47 - 0.55 * Math.cos(ph)]
  const posLit = nx * SUN[0] + ny * SUN[1] > 0
  const half = (s) => {
    const sl = plain ? [] : Array.from({ length: slits }, (_, k) => 0.66 + (k / Math.max(1, slits - 1)) * 1.8 + (r() - 0.5) * 0.1)
    const out = [[0, 0.05]]
    let k = 0
    for (let i = 0; i <= 34; i++) {
      const ph = 0.3 + (i / 34) * (Math.PI - 0.3)
      while (k < sl.length && sl[k] < ph) {
        const p = sl[k]
        const em = edge(s, p)
        const dep = depth * (0.85 + r() * 0.3)
        out.push(edge(s, p - 0.03), [em[0] * (1 - dep), em[1] - 0.11 * dep], edge(s, p + 0.03))
        k++
      }
      if (!sl.some((p) => Math.abs(ph - p) < 0.034)) out.push(edge(s, ph))
    }
    const outline = out.slice()
    for (let v = 0.98; v > 0.05; v -= 0.08) out.push([0, v])
    let d = poly(out.map(P))
    for (let j = 0; j < sl.length - 1; j++) {
      if (r() < 0.3) continue
      const em = edge(s, (sl[j] + sl[j + 1]) / 2)
      const L = Math.hypot(em[0], 0.11)
      const e1 = [em[0] / L, 0.11 / L]
      const e2 = [-e1[1], e1[0]]
      const c = [em[0] * 0.3, em[1] - 0.075]
      const hole = Array.from({ length: 10 }, (_, q) => {
        const th = (q / 10) * TAU
        const ca = 0.055 * Math.cos(th)
        const sb = 0.02 * Math.sin(th)
        return [c[0] + e1[0] * ca + e2[0] * sb, c[1] + e1[1] * ca + e2[1] * sb]
      })
      d += ` ${poly(hole.map(P))}`
    }
    return { d, edge: poly(outline.map(P), false) }
  }
  const A = half(1)
  const B = half(-1)
  const rib = Array.from({ length: 12 }, (_, i) => P([0, 0.02 + (i / 11) * 0.9]))
  return { lit: (posLit ? A : B).d, shade: (posLit ? B : A).d, edge: (posLit ? A : B).edge, rib: poly(rib, false), veins: '' }
}

// Pinnate frond (palm or fern): leaflets on both sides of a quadratic rachis.
function frond(a, c, b, { n = 16, len, w = 0.16, spread = 1.0, droop = 0.3, t0 = 0.1, seed = 1 }) {
  const r = rng(seed)
  let A = ''
  let B = ''
  for (let i = 0; i < n; i++) {
    const t = t0 + ((1 - t0) * i) / (n - 1)
    const p = qb(a, c, b, t)
    const [tx, ty] = qt(a, c, b, t)
    const ang = Math.atan2(ty, tx)
    const L = len(t) * (0.88 + r() * 0.24)
    A += leaf(p[0], p[1], ang + spread, L, L * w, L * droop)
    B += leaf(p[0], p[1], ang - spread, L, L * w, L * droop)
  }
  const [tx, ty] = qt(a, c, b, 0.4)
  const ang = Math.atan2(ty, tx)
  const aLit = Math.cos(ang + spread) * SUN[0] + Math.sin(ang + spread) * SUN[1] > Math.cos(ang - spread) * SUN[0] + Math.sin(ang - spread) * SUN[1]
  return { lit: aLit ? A : B, shade: aLit ? B : A, rachis: `M ${pt(a)} Q ${pt(c)} ${pt(b)}` }
}
const palmLen = (L) => (t) => L * Math.pow(Math.sin(Math.PI * (0.12 + 0.86 * t)), 0.6)
const fernLen = (L) => (t) => L * Math.min(1, t * 5) * Math.pow(1 - t, 0.7) + 2

// Palm crown: fronds radiating from (cx,cy), arching up then sagging.
function palmCrown(cx, cy, size, seed, { n = 9, from = -195, to = 15, sag = 0.32, leaflet = 0.34 } = {}) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const a = rad(from + ((to - from) * i) / (n - 1) + (r() - 0.5) * 12)
    const L = size * (0.78 + r() * 0.35)
    const dir = [Math.cos(a), Math.sin(a)]
    const c = [cx + dir[0] * L * 0.55, cy + dir[1] * L * 0.55 - L * 0.16]
    const b = [cx + dir[0] * L, cy + dir[1] * L + L * sag]
    return frond([cx, cy], c, b, { n: 13, len: palmLen(size * leaflet), w: 0.15, spread: 1.15, droop: 0.4, t0: 0.12, seed: seed * 7 + i })
  })
}

// Tapered, gently curved trunk from (x, base) to (tx, top).
function trunk(x, base, tx, top, w0, w1, bend = 0) {
  const a = [x, base]
  const b = [tx, top]
  const c = [(x + tx) / 2 + bend, (base + top) / 2]
  const L = []
  const R = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const [px, py] = qb(a, c, b, t)
    const [ux, uy] = qt(a, c, b, t)
    const w = (w0 + (w1 - w0) * t) / 2
    L.push([px + uy * w, py - ux * w])
    R.push([px - uy * w, py + ux * w])
  }
  return poly([...L, ...R.reverse()])
}

// Clustered tree crown: shaded underside, body, sunlit clumps, highlights.
function crown(seed, cx, cy, rx, ry, n = 9) {
  const r = rng(seed)
  const clumps = Array.from({ length: n }, () => {
    const a = r() * TAU
    const d = Math.sqrt(r()) * 0.72
    return [cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, Math.min(rx, ry) * (0.42 + r() * 0.3)]
  }).sort((p, q) => p[1] - q[1])
  let shade = bumpy(cx + rx * 0.04, cy + ry * 0.1, rx * 0.94, ry * 0.86, 11, r)
  let body = ''
  let lit = ''
  let hi = ''
  for (const [x, y, s] of clumps) {
    shade += bumpy(x + s * 0.14, y + s * 0.18, s, s * 0.9, 7, r)
    body += bumpy(x, y, s * 0.86, s * 0.78, 7, r)
    const facing = (-(x - cx) / rx) * 0.55 + (-(y - cy) / ry) * 0.83
    if (facing > -0.25) lit += bumpy(x - s * 0.24, y - s * 0.28, s * 0.52, s * 0.44, 6, r)
    if (facing > 0.35) hi += bumpy(x - s * 0.36, y - s * 0.4, s * 0.24, s * 0.2, 5, r)
  }
  const fr = fringe(r, cx, cy, rx, ry, Math.round((rx + ry) / 9), Math.min(rx, ry) * 0.3)
  return { shade, body, lit, hi, fShade: fr.shade, fLit: fr.lit }
}

// A row of leafy crowns standing on a baseline over a solid skirt.
function crownRow(seed, pts, minR, maxR, { gap = 0.8, lift = 0.45 } = {}) {
  const r = rng(seed)
  const x0 = pts[0][0]
  const x1 = pts[pts.length - 1][0]
  let body = poly([...pts, [x1, H + 40], [x0, H + 40]])
  let lit = ''
  let x = x0
  while (x < x1) {
    const rr = minR + r() * (maxR - minR)
    const y = along(pts, x) - rr * (lift + r() * 0.4)
    body += bumpy(x, y, rr, rr * (0.78 + r() * 0.2), 7 + Math.floor(r() * 4), r)
    lit += bumpy(x - rr * 0.28, y - rr * 0.3, rr * 0.55, rr * 0.42, 5 + Math.floor(r() * 3), r)
    x += rr * (gap + r() * 0.5)
  }
  return { body, lit }
}

// Emergent kapok: tall bare trunk, forked limbs, flat layered umbrella crown.
function emergent(seed, x, base, h, cw) {
  const r = rng(seed)
  const top = base - h
  let wood = trunk(x, base, x + cw * 0.02, top + cw * 0.1, 4 + h * 0.03, 3, cw * 0.05)
  wood += trunk(x, top + cw * 0.16, x - cw * 0.3, top - cw * 0.02, 3, 1.4, -cw * 0.04)
  wood += trunk(x, top + cw * 0.16, x + cw * 0.28, top - cw * 0.03, 3, 1.4, cw * 0.04)
  let body = ''
  let lit = ''
  for (let k = -2; k <= 2; k++) {
    const lx = x + k * cw * 0.2 + (r() - 0.5) * 6
    const ly = top - cw * (0.06 + (2 - Math.abs(k)) * 0.035)
    const lr = cw * (0.17 + r() * 0.05)
    body += bumpy(lx, ly, lr, lr * 0.5, 8, r)
    lit += bumpy(lx - lr * 0.2, ly - lr * 0.22, lr * 0.62, lr * 0.26, 6, r)
  }
  return { wood, body, lit }
}

// Distant palm silhouette.
function farPalm(x, base, h, lean, size) {
  const cx = x + lean
  const cy = base - h
  const wood = trunk(x, base, cx, cy, 4, 2, lean * 0.3)
  let fronds = ''
  for (let i = 0; i < 8; i++) {
    const a = rad(-188 + i * 28)
    fronds += leaf(cx, cy, a, size * (0.85 + (i % 3) * 0.1), size * 0.14, size * 0.5)
  }
  return { wood, fronds }
}

// Hanging vine: a cubic stem with heart-ish leaves alternating along it.
function vine(seed, x, len, top = -60) {
  const r = rng(seed)
  const p0 = [x, top]
  const p1 = [x + 20 + r() * 30, len * 0.3]
  const p2 = [x - 20 - r() * 30, len * 0.68]
  const p3 = [x + (r() - 0.5) * 30, len]
  const stem = `M ${pt(p0)} C ${pt(p1)}, ${pt(p2)}, ${pt(p3)}`
  let a = ''
  let b = ''
  const count = Math.round(len / 42)
  for (let i = 0; i < count; i++) {
    const t = 0.16 + (i / (count - 1)) * 0.82
    const u = 1 - t
    const px = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
    const py = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    const side = i % 2 ? 1 : -1
    const ang = Math.PI / 2 - side * (0.85 + r() * 0.4)
    const piece = leaf(px, py, ang, 20 + r() * 12 + t * 8, 9 + r() * 3, 6)
    if (side > 0) a += piece
    else b += piece
  }
  b += leaf(p3[0], p3[1] - 2, Math.PI / 2, 26, 10, 2)
  return { stem, a, b }
}

// Invisible square centred on a pivot: with transform-box: fill-box and
// transform-origin 50% 50%, the group then turns about exactly that point.
const Pivot = ({ x = 0, y = 0, s = 200 }) => <rect x={x - s} y={y - s} width={2 * s} height={2 * s} fill="none" />

// Two-tone leaf renderer. c = [lit, shade, rib, rim, veins]
function Blade({ g, c, rule, ribW = 2.2, rimW = 2 }) {
  return (
    <>
      <path d={g.shade} fill={c[1]} fillRule={rule} />
      <path d={g.lit} fill={c[0]} fillRule={rule} />
      {c[4] && g.veins ? <path d={g.veins} fill="none" stroke={c[4]} strokeWidth="1.3" strokeLinecap="round" /> : null}
      {c[2] ? <path d={g.rib} fill="none" stroke={c[2]} strokeWidth={ribW} strokeLinecap="round" /> : null}
      {c[3] ? <path d={g.edge} fill="none" stroke={c[3]} strokeWidth={rimW} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </>
  )
}
function Frond({ g, c, w = 1.6 }) {
  return (
    <>
      <path d={g.shade} fill={c[1]} />
      <path d={g.rachis} fill="none" stroke={c[2]} strokeWidth={w} strokeLinecap="round" />
      <path d={g.lit} fill={c[0]} />
    </>
  )
}

/* ---------- epiphytes and flowers ---------- */

// Bromeliad: a rosette of arching strap leaves around a red flower spike.
function Bromeliad({ x, y, s = 1, seed = 1, c = ['#6aa85a', '#3f7e45'] }) {
  const r = rng(seed)
  let a = ''
  let b = ''
  for (let i = 0; i < 9; i++) {
    const ang = rad(-170 + i * 20 + (r() - 0.5) * 8)
    const piece = leaf(x, y, ang, (17 + r() * 12) * s, 4.4 * s, 7 * s)
    if (i % 2) a += piece
    else b += piece
  }
  let spike = ''
  for (let i = 0; i < 4; i++) spike += leaf(x, y - 2 * s, rad(-112 + i * 15), (13 + (i % 2) * 4) * s, 2.8 * s, -1)
  return (
    <g>
      <path d={b} fill={c[1]} />
      <path d={spike} fill="#e7414f" />
      <path d={a} fill={c[0]} />
    </g>
  )
}

// Orchid spray: small pink flowers along an arching stem.
function Orchids({ x, y, s = 1, n = 5, dir = 1, seed = 3 }) {
  const r = rng(seed)
  const a = [x, y]
  const c = [x + 26 * s * dir, y - 14 * s]
  const b = [x + 46 * s * dir, y + 18 * s]
  let petals = ''
  let lips = ''
  for (let i = 0; i < n; i++) {
    const [px, py] = qb(a, c, b, 0.25 + (i / (n - 1)) * 0.75)
    const rot = r() * TAU
    for (let k = 0; k < 5; k++) petals += leaf(px, py, rot + (k * TAU) / 5, 6.5 * s, 3 * s, 0)
    lips += ` M ${f(px - 1.8 * s)} ${f(py)} a ${f(1.8 * s)} ${f(1.8 * s)} 0 1 0 ${f(3.6 * s)} 0 a ${f(1.8 * s)} ${f(1.8 * s)} 0 1 0 ${f(-3.6 * s)} 0 Z`
  }
  return (
    <g>
      <path d={`M ${pt(a)} Q ${pt(c)} ${pt(b)}`} fill="none" stroke="#4b6a46" strokeWidth={1.4 * s} />
      <path d={petals} fill="#f7c0dc" />
      <path d={lips} fill="#c63f86" />
    </g>
  )
}

// Heliconia (lobster claw): alternating red bracts with yellow lips on a stem.
// dir = 1 hangs down from (x,y); dir = -1 stands up from it.
function heliconia(x, y, len, s, dir = 1) {
  let red = ''
  let gold = ''
  let green = ''
  const n = 7
  for (let k = 0; k < n; k++) {
    const t = (k + 0.6) / n
    const px = x + Math.sin(k * 1.3) * 4 * s
    const py = y + dir * len * t
    const side = k % 2 ? 1 : -1
    const ang = dir > 0 ? rad(side > 0 ? -28 : -152) : rad(side > 0 ? -50 : -130)
    const L = (30 - k * 2.2) * s
    red += leaf(px, py, ang, L, 7.5 * s, dir > 0 ? -3 * s : 2 * s)
    gold += leaf(px + Math.cos(ang) * L * 0.45, py + Math.sin(ang) * L * 0.45 - 1.5 * s, ang, L * 0.55, 3 * s, 0)
    green += leaf(px + Math.cos(ang) * L * 0.62, py + Math.sin(ang) * L * 0.62 - 2.6 * s, ang, L * 0.4, 1.4 * s, 0)
  }
  const stem = dir > 0 ? `M ${f(x)} ${f(y - 30)} L ${f(x)} ${f(y + len)}` : `M ${f(x)} ${f(y + 80)} L ${f(x)} ${f(y - len)}`
  return { stem, red, gold, green }
}

/* ---------- creatures ---------- */

// Scarlet macaw facing right; near and far wings beat around the shoulder.
const MACAW_WING = [
  ['M 14 -8 C 16 -22, 12 -36, 2 -46 C -6 -54, -18 -62, -32 -68 L -26 -60 L -36 -62 L -28 -54 L -37 -53 L -28 -47 L -35 -44 L -24 -40 C -20 -28, -12 -14, -6 -6 Z', 0],
  ['M 13 -9 C 14 -21, 10 -32, 2 -40 C -7 -39, -14 -33, -17 -26 C -15 -18, -11 -11, -6 -6.5 Z', 1],
  ['M 12 -9 C 12 -16, 9 -22, 4 -27 C -3 -25, -8 -19, -9 -14 C -9 -11, -8 -8.5, -6 -7 Z', 2],
]
function Macaw({ x, y, s, flip, dur, delay, flap, rise = 1 }) {
  const near = ['#2f7fd6', '#f2c232', '#e0402c']
  const far = ['#1f5c9e', '#c9992a', '#b3311f']
  return (
    <g className="rainforest-fly" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s`, animationDirection: flip ? 'reverse' : undefined }}>
      <g className="rainforest-arc" style={{ animationDuration: `${(dur / 2.4).toFixed(1)}s`, animationDelay: `${delay}s`, '--rise': rise }}>
        <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
          <g transform="translate(-7 -1)">
            <g className="rainforest-wing" style={{ animationDuration: `${flap}s`, animationDelay: `${(-flap * 0.06).toFixed(2)}s` }}>
              <Pivot x={4} y={-7} s={80} />
              {MACAW_WING.map(([d, i]) => (
                <path key={i} d={d} fill={far[i]} />
              ))}
            </g>
          </g>
          <path d="M -14 -2 C -34 2, -60 7, -86 12 L -88 15.5 C -62 13, -36 9, -14 5 Z" fill="#d23420" />
          <path d="M -14 1 C -32 6, -52 11, -74 18 L -75 21 C -52 16, -32 11, -13 6 Z" fill="#b92c1b" />
          <path d="M -64 9.8 L -86 12 L -88 15.5 L -64 12.6 Z M -58 13.6 L -74 18 L -75 21 L -58 16.4 Z" fill="#2f7fd6" />
          <path d="M -18 2 C -10 -8, 4 -11, 16 -10 C 24 -9.5, 30 -6, 31 0 C 28 6.5, 16 9, 2 8 C -7 7.5, -14 5.5, -18 2 Z" fill="#e3412d" />
          <path d="M -14 4.5 C -2 8.5, 14 8.5, 26 4.5 C 22 8, 12 9.5, 2 8.5 C -6 8, -11 6.5, -14 4.5 Z" fill="#b8301f" />
          <circle cx="25" cy="-5" r="8" fill="#e8472f" />
          <path d="M 24.5 -9.5 C 30 -10, 33 -6.5, 32.5 -2 C 29.5 -1, 26.5 -2.2, 24.8 -4.8 Z" fill="#f6efe4" />
          <circle cx="28.4" cy="-5.8" r="1.4" fill="#1d1a18" />
          <path d="M 31.5 -9.5 C 38.5 -10, 42.5 -4, 39 3.5 C 38 0.5, 35.5 -2.5, 32 -2.5 Z" fill="#eee2cc" />
          <path d="M 32 -2 C 35.5 -2, 37.5 0.5, 37 3.8 C 34.5 3.5, 32.5 2, 31.5 -0.5 Z" fill="#2a2522" />
          <g className="rainforest-wing" style={{ animationDuration: `${flap}s` }}>
            <Pivot x={4} y={-7} s={80} />
            {MACAW_WING.map(([d, i]) => (
              <path key={i} d={d} fill={near[i]} />
            ))}
            <path d="M -2 -40 C -10 -38, -15 -32, -17 -26 L -15 -25 C -12 -31, -8 -35, -2 -38 Z" fill="#7fbf4a" opacity="0.8" />
          </g>
        </g>
      </g>
    </g>
  )
}

// Keel-billed toucan perched (feet at the origin), facing left.
function Toucan({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="rainforest-tail">
        <Pivot x={1} y={-6} s={60} />
        <path d="M 3 -8 C 8 2, 12 14, 15 27 L 7.5 28.5 C 5 16, 1 4, -2 -6 Z" fill="#141915" />
      </g>
      <path d="M -9 -46 C -16 -38, -17 -20, -10 -6 C -6 0, 4 1, 7 -6 C 10 -18, 8 -36, 2 -47 C -1 -51, -6 -51, -9 -46 Z" fill="#1a201c" />
      <path d="M 1 -40 C 7 -32, 8 -18, 4 -8 C 1 -14, -1 -28, 1 -40 Z" fill="#2c352f" />
      <path d="M -10 -46 C -16 -40, -16.5 -30, -13 -23 C -9 -27, -5 -36, -4 -46 C -6 -49, -8.5 -49, -10 -46 Z" fill="#ffd84a" />
      <path d="M -13 -23 C -10 -25.5, -7.5 -28.5, -6 -31 L -5.5 -28 C -7.5 -25, -10 -22.5, -12.5 -21 Z" fill="#e2452f" />
      <path d="M 2 -6 C 4 -3, 6 -2, 8 -5 L 6 -11 Z" fill="#e2452f" />
      <path d="M -5 -2 L -7 2 M 3 -2 L 2 2" stroke="#6aa8e0" strokeWidth="2.4" strokeLinecap="round" />
      <g className="rainforest-peek">
        <Pivot x={-4} y={-43} s={70} />
        <circle cx="-5" cy="-49" r="8.5" fill="#1a201c" />
        <path d="M -11 -56 C -22 -61, -38 -60, -49 -52 C -52 -49.5, -51 -46.5, -47 -47 C -37 -48, -24 -47, -12 -45 Z" fill="#8fd05a" />
        <path d="M -24 -59.4 C -31 -60, -37 -59, -41 -57 L -41 -47.6 C -36 -47.9, -30 -47.8, -24 -47.2 Z" fill="#ff9d2c" />
        <path d="M -41 -57 C -45 -55.4, -47.5 -53.8, -49 -52 C -52 -49.5, -51 -46.5, -47 -47 L -41 -47.6 Z" fill="#e8432e" />
        <path d="M -12 -45 C -24 -46.5, -37 -47.5, -47 -47 C -40 -42, -26 -40, -13 -41.5 Z" fill="#5fa6dc" />
        <path d="M -40 -47.3 C -43 -47.2, -45.5 -47.1, -47 -47 C -45 -45, -42.5 -43.6, -40 -43 Z" fill="#e8432e" />
        <path d="M -12 -45 C -24 -46.5, -37 -47.5, -47 -47" fill="none" stroke="#24301f" strokeWidth="0.8" />
        <circle cx="-8.5" cy="-50" r="3.1" fill="#8fd6a8" />
        <circle cx="-8.7" cy="-50" r="1.4" fill="#111" />
      </g>
    </g>
  )
}

// Spider monkey hanging from one hand (origin) with its tail curled on the branch.
function Monkey({ x, y, s }) {
  const fur = '#2d241e'
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="rainforest-swing">
        <Pivot s={170} />
        <path d="M 4 88 C 22 96, 38 80, 38 50 C 38 24, 32 6, 22 2 C 15 -1, 13 6, 18 8" fill="none" stroke={fur} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M 0 0 C -1 14, 1 30, 4 44" fill="none" stroke={fur} strokeWidth="5.6" strokeLinecap="round" />
        <path d="M -6 86 C -12 100, -15 112, -11 127" fill="none" stroke={fur} strokeWidth="6.2" strokeLinecap="round" />
        <path d="M 6 86 C 13 98, 17 110, 13 125" fill="none" stroke={fur} strokeWidth="6.2" strokeLinecap="round" />
        <path d="M -4 40 C 8 38, 14 52, 12 70 C 11 82, 6 90, -1 90 C -9 89, -12 78, -12 64 C -12 52, -11 43, -4 40 Z" fill={fur} />
        <path d="M -6 56 C 0 54, 6 60, 6 72 C 5 82, 0 86, -4 84 C -8 78, -9 64, -6 56 Z" fill="#46372b" />
        <g className="rainforest-reach">
          <Pivot x={-7} y={46} s={80} />
          <path d="M -7 46 C -18 60, -24 80, -26 102" fill="none" stroke={fur} strokeWidth="5.2" strokeLinecap="round" />
        </g>
        <circle cx="-4" cy="33" r="10.5" fill={fur} />
        <ellipse cx="-6" cy="35" rx="6.2" ry="6.8" fill="#b88d69" />
        <circle cx="-8.3" cy="33.4" r="1.25" fill="#1d130d" />
        <circle cx="-3.9" cy="33.4" r="1.25" fill="#1d130d" />
        <ellipse cx="-6" cy="38.6" rx="3" ry="2" fill="#9a7052" />
      </g>
    </g>
  )
}

// Blue morpho (top view): wings flap around the body, the whole wanders.
const MORPHO_FW = 'M 0 -2 C -4 -13, -15 -24, -29 -23 C -33 -17, -30 -8, -23 -3 C -15 -0.5, -6 0, 0 -2 Z'
const MORPHO_FW_IN = 'M -1.5 -3.5 C -5 -12, -14 -20.5, -25 -20 C -27.5 -15, -25 -8.5, -20 -5 C -13 -3, -6 -2.5, -1.5 -3.5 Z'
const MORPHO_HW = 'M 0 0 C -9 -0.5, -22 1.5, -25 9 C -24 17, -14 20, -6 16.5 C -2 12, 0 6, 0 0 Z'
const MORPHO_HW_IN = 'M -1.5 1.5 C -8.5 1.5, -19 3, -21.5 9 C -20.5 14.5, -13 16.5, -7 13.5 C -3.5 10, -1.5 6, -1.5 1.5 Z'
function Morpho({ x, y, s, path, dur, delay, flap, tilt = 0 }) {
  const wing = (
    <>
      <path d={MORPHO_FW} fill="#16213a" />
      <path d={MORPHO_HW} fill="#16213a" />
      <path d={MORPHO_FW_IN} fill="url(#rainforest-morpho-g)" />
      <path d={MORPHO_HW_IN} fill="url(#rainforest-morpho-g)" />
    </>
  )
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
      <g className={`rainforest-wander rainforest-wander-${path}`} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g className="rainforest-bob" style={{ animationDelay: `${(delay / 5).toFixed(1)}s` }}>
          <g className="rainforest-mflap rainforest-mflap-l" style={{ animationDuration: `${flap}s` }}>
            {wing}
          </g>
          <g className="rainforest-mflap rainforest-mflap-r" style={{ animationDuration: `${flap}s` }}>
            <g transform="scale(-1 1)">{wing}</g>
          </g>
          <ellipse cx="0" cy="1" rx="1.6" ry="8" fill="#1d1a16" />
        </g>
      </g>
    </g>
  )
}

const morphoDefs = (
  <linearGradient id="rainforest-morpho-g" x1="1" y1="0.4" x2="0" y2="0.6">
    <stop offset="0" stopColor="#1d56d8" />
    <stop offset="0.55" stopColor="#3fa6ff" />
    <stop offset="1" stopColor="#97e6ff" />
  </linearGradient>
)

/* ================= Layer 0: misty sky ================= */

const SHAFTS = [
  ['60,-60 140,-60 470,900 250,900', 0.75, 13, -2],
  ['165,-60 255,-60 830,900 570,900', 0.95, 11, -6],
  ['292,-60 330,-60 1020,900 910,900', 0.6, 15, -9],
  ['350,-60 440,-60 1330,900 1110,900', 0.5, 17, -4],
  ['214,-60 232,-60 668,900 606,900', 0.55, 9, -1],
]

const farRidge =
  'M -220 920 L -220 470 C -110 452, 0 426, 120 432 C 250 440, 360 404, 480 396 C 600 388, 700 418, 820 428 C 950 438, 1050 402, 1180 398 C 1300 394, 1420 418, 1660 430 L 1660 920 Z'
const skyRow = crownRow(11, [[-220, 545], [200, 578], [600, 604], [1000, 596], [1300, 560], [1660, 525]], 16, 38)
const skyKapok = [emergent(12, 110, 566, 118, 108), emergent(13, 850, 604, 96, 88)]
const skyPalms = [farPalm(520, 606, 66, 6, 30), farPalm(640, 608, 54, -5, 26)]

function mist(key, top, height, width, dur, delay, a = 0.85, warm = false) {
  return (
    <div
      key={key}
      className={`rainforest-drift${warm ? ' rainforest-drift-warm' : ''}`}
      style={{ left: '-30%', top: `${top}%`, width: `${width}%`, height: `${height}%`, '--a': a, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
    />
  )
}

const skyLayer = (
  <>
    <Svg>
      <defs>
        <radialGradient id="rainforest-sun-g">
          <stop offset="0" stopColor="#fffef4" />
          <stop offset="0.22" stopColor="#fff9dc" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#fdf3cc" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fdf3cc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rainforest-shaft-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbe6" stopOpacity="0.75" />
          <stop offset="0.5" stopColor="#fffbe6" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rainforest-ridge-g" gradientUnits="userSpaceOnUse" x1="0" y1="400" x2="0" y2="560">
          <stop offset="0" stopColor="#cfe2d6" />
          <stop offset="1" stopColor="#e6f0e6" />
        </linearGradient>
        <linearGradient id="rainforest-sky-row-g" gradientUnits="userSpaceOnUse" x1="0" y1="470" x2="0" y2="640">
          <stop offset="0" stopColor="#bcd6c6" />
          <stop offset="1" stopColor="#e4efe4" />
        </linearGradient>
      </defs>
      <circle className="rainforest-sun" cx="230" cy="-40" r="620" fill="url(#rainforest-sun-g)" />
      <g fill="url(#rainforest-shaft-g)">
        {SHAFTS.map(([p, o, dur, delay], i) => (
          <polygon key={i} className="rainforest-shaft" points={p} fillOpacity={o} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
        ))}
      </g>
      <path d={farRidge} fill="url(#rainforest-ridge-g)" />
      <g fill="url(#rainforest-sky-row-g)">
        {skyKapok.map((k, i) => (
          <path key={i} d={k.wood + k.body} />
        ))}
        {skyPalms.map((p, i) => (
          <path key={i} d={p.wood + p.fronds} />
        ))}
        <path d={skyRow.body} />
      </g>
      <path d={skyRow.lit + skyKapok.map((k) => k.lit).join('')} fill="#d3e6d9" />
    </Svg>
    {mist(0, 50, 14, 60, 120, -10, 0.8)}
    {mist(1, 55, 12, 50, 120, -50, 0.7)}
    {mist(2, 47, 10, 46, 120, -90, 0.6, true)}
  </>
)

/* ================= Layer 1: far canopy ================= */

const rowA = crownRow(21, [[-220, 585], [160, 624], [520, 650], [860, 656], [1180, 632], [1660, 585]], 22, 52)
const kapokA = [emergent(22, 190, 624, 172, 150), emergent(23, 700, 654, 128, 116), emergent(24, 1010, 650, 110, 100)]
const palmsA = [farPalm(420, 646, 108, 10, 40), farPalm(462, 648, 88, -8, 34), farPalm(905, 654, 96, 7, 36)]
const rowB = crownRow(25, [[-220, 664], [240, 694], [700, 712], [1100, 704], [1660, 664]], 28, 62)

function birdFlock() {
  const birds = [
    [0, 0, 1, 0.62],
    [-26, 10, 0.85, 0.55],
    [-46, -6, 0.75, 0.7],
  ]
  return (
    <g className="rainforest-flock">
      {birds.map(([dx, dy, s, d], i) => (
        <g key={i} transform={`translate(${dx} ${370 + dy}) scale(${s})`}>
          <path className="rainforest-bflap" d="M -9 -1 Q -4 -6, 0 0 Q 4 -6, 9 -1 Q 4 -3, 0 2 Q -4 -3, -9 -1 Z" fill="#6f8f80" style={{ animationDuration: `${d}s` }} />
        </g>
      ))}
    </g>
  )
}

const farLayer = (
  <>
    <Svg>
      <defs>
        <linearGradient id="rainforest-rowA-g" gradientUnits="userSpaceOnUse" x1="0" y1="470" x2="0" y2="700">
          <stop offset="0" stopColor="#a5c6b3" />
          <stop offset="1" stopColor="#dbeade" />
        </linearGradient>
      </defs>
      {birdFlock()}
      <g fill="url(#rainforest-rowA-g)">
        {kapokA.map((k, i) => (
          <path key={i} d={k.wood + k.body} />
        ))}
        {palmsA.map((p, i) => (
          <path key={i} d={p.wood + p.fronds} />
        ))}
        <path d={rowA.body} />
      </g>
      <path d={rowA.lit + kapokA.map((k) => k.lit).join('')} fill="#bdd8c7" />
    </Svg>
    {mist(0, 60, 12, 55, 100, -20, 0.85)}
    {mist(1, 63, 10, 48, 100, -70, 0.75)}
    <Svg>
      <defs>
        <linearGradient id="rainforest-rowB-g" gradientUnits="userSpaceOnUse" x1="0" y1="600" x2="0" y2="770">
          <stop offset="0" stopColor="#93bba4" />
          <stop offset="1" stopColor="#d3e6d8" />
        </linearGradient>
      </defs>
      <path d={rowB.body} fill="url(#rainforest-rowB-g)" />
      <path d={rowB.lit} fill="#a9cdb6" />
    </Svg>
  </>
)

/* ================= Layer 2: waterfall gorge ================= */

const CLIFF_R = 'M 905 800 L 912 700 C 918 640, 936 560, 958 490 C 974 440, 992 380, 1012 336 C 1022 314, 1032 300, 1042 296 L 1134 296 C 1158 290, 1194 282, 1240 278 C 1320 272, 1400 266, 1660 256 L 1660 800 Z'
const CLIFF_R_LIT = 'M 912 700 C 918 640, 936 560, 958 490 C 974 440, 992 380, 1012 336 C 1022 314, 1032 300, 1042 296 L 1032 340 C 1026 390, 1018 450, 1010 520 C 1002 600, 992 660, 984 720 L 912 720 Z'
const CLIFF_L = 'M -220 800 L -220 384 C -100 378, 40 368, 120 372 C 180 376, 222 392, 248 424 C 272 456, 284 520, 296 590 C 306 650, 326 700, 350 742 L 350 800 Z'
const CLIFF_L_SHADE = 'M 248 424 C 272 456, 284 520, 296 590 C 306 650, 326 700, 350 742 L 296 760 C 278 700, 262 630, 252 560 C 244 500, 238 456, 248 424 Z'
const FALL = 'M 1044 297 C 1043 330, 1039 420, 1033 520 C 1028 580, 1022 625, 1016 662 L 1162 662 C 1156 625, 1150 580, 1145 520 C 1139 420, 1134 330, 1132 297 C 1110 290, 1066 290, 1044 297 Z'
const CORE = 'M 1060 300 C 1059 360, 1056 440, 1052 520 C 1048 580, 1044 625, 1040 662 L 1138 662 C 1134 625, 1130 580, 1126 520 C 1122 440, 1118 360, 1116 300 Z'
const RECESS = 'M 1028 302 L 1148 302 C 1160 400, 1172 520, 1186 666 L 992 666 C 1004 520, 1016 400, 1028 302 Z'
const STRAND = 'M 1014 356 C 1012 420, 1008 520, 1002 600 L 998 662 L 1007 662 C 1012 560, 1018 450, 1021 358 Z'

// Rock face texture: jittered vertical joints (lit edge + dark crack), short
// broken ledges, moss cushions and drapes of hanging plants.
function rockFace(seed, { x0, x1, y0, y1, top, left = () => -1e9, n = 26, cols = true }) {
  const r = rng(seed)
  let jl = ''
  let jd = ''
  let ll = ''
  let ld = ''
  let moss = ''
  let mossLit = ''
  let drape = ''
  if (cols) {
    let x = x0 + r() * 40
    while (x < x1) {
      const pts = []
      for (let y = top(x) + 8; y < y1; y += 46 + r() * 40) pts.push([x + (r() - 0.5) * 16, y])
      pts.push([x + (r() - 0.5) * 16, y1])
      const w = 3 + r() * 4
      jd += poly([...pts, ...pts.slice().reverse().map(([px, py]) => [px + w, py])])
      jl += poly([...pts.map(([px, py]) => [px - 9 - w, py]), ...pts.slice().reverse()])
      x += 46 + r() * 74
    }
  }
  for (let i = 0; i < n; i++) {
    const y = y0 + r() * (y1 - y0)
    const xl = Math.max(x0, left(y) + 14)
    const x = xl + r() * Math.max(0, x1 - xl)
    if (y < top(x) + 16) continue
    const len = 14 + r() * 40
    const sl = 0.08 + r() * 0.14
    ll += poly([[x, y], [x + len, y + len * sl], [x + len - 2, y + len * sl + 2.5], [x + 2, y + 3]])
    ld += poly([[x + 2, y + 3], [x + len - 2, y + len * sl + 2.5], [x + len - 7, y + len * sl + 7], [x + 5, y + 8]])
    if (r() < 0.55) {
      const mx = x + len * (0.2 + r() * 0.5)
      const my = y + (mx - x) * sl
      const ms = 6 + r() * 9
      moss += bumpy(mx, my, ms * 1.3, ms * 0.36, 6, r)
      mossLit += bumpy(mx - ms * 0.35, my - ms * 0.14, ms * 0.6, ms * 0.14, 5, r)
      if (r() < 0.45) {
        const k = 2 + Math.floor(r() * 2)
        for (let j = 0; j < k; j++) drape += leaf(mx + (j - k / 2) * 5, my + 3, rad(84 + (r() - 0.5) * 30), 8 + r() * 12, 2.6, 3)
      }
    }
  }
  return { jl, jd, ll, ld, moss, mossLit, drape }
}
const rockR = rockFace(31, { x0: 905, x1: 1660, y0: 320, y1: 700, top: (x) => 296 - (x - 1134) * 0.076, left: (y) => 1042 - (y - 296) * 0.33, n: 34 })
const rockRLit = rockFace(38, { x0: 905, x1: 1030, y0: 330, y1: 700, top: () => 330, left: (y) => 1042 - (y - 296) * 0.33, n: 9, cols: false })
const rockL = rockFace(32, { x0: -220, x1: 300, y0: 410, y1: 720, top: () => 384, n: 20 })

// Big moss and fern cushions clinging to the cliffs.
const cliffGreen = (() => {
  const r = rng(39)
  let body = ''
  let lit = ''
  let drape = ''
  for (const [x, y, s] of [[1200, 330, 26], [1250, 372, 18], [1360, 318, 30], [1470, 352, 22], [1560, 320, 28], [1180, 470, 16], [1320, 440, 20], [1420, 500, 24], [1540, 460, 18], [1250, 560, 22], [1600, 560, 26], [960, 520, 12], [996, 420, 10], [40, 430, 22], [150, 460, 18], [-80, 470, 26], [220, 520, 14], [90, 560, 20]]) {
    body += bumpy(x, y, s, s * 0.6, 8, r)
    lit += bumpy(x - s * 0.3, y - s * 0.25, s * 0.5, s * 0.25, 6, r)
    const k = 4 + Math.floor(r() * 4)
    for (let j = 0; j < k; j++) drape += leaf(x + (j - k / 2) * (s / k) * 1.6, y + s * 0.3, rad(85 + (r() - 0.5) * 30), s * (0.8 + r() * 1.2), 3.6, 6)
  }
  return { body, lit, drape }
})()

const cliffTopR = crownRow(33, [[1126, 300], [1200, 282], [1400, 266], [1660, 254]], 18, 44, { lift: 0.25 })
const cliffTopLip = crownRow(34, [[978, 352], [1006, 322], [1040, 302]], 12, 22, { lift: 0.15 })
const cliffTopL = crownRow(35, [[-220, 386], [60, 374], [180, 380], [250, 424]], 18, 40, { lift: 0.25 })
const gorgePalms = [farPalm(1240, 284, 70, -8, 40), farPalm(1340, 276, 92, 6, 44), farPalm(70, 378, 80, 10, 40)]
const lipFerns = (() => {
  const r = rng(36)
  let d = ''
  for (let i = 0; i < 6; i++) d += leaf(1036 + i * 2, 300, rad(95 + i * 12), 20 + r() * 14, 4, 10)
  for (let i = 0; i < 6; i++) d += leaf(1140 - i * 2, 298, rad(85 - i * 12), 20 + r() * 14, 4, 10)
  return d
})()
// Falling-water streak groups: [x, length, width, opacity] rects per group.
const fallGroups = (() => {
  const r = rng(404)
  return Array.from({ length: 10 }, () => {
    const rects = Array.from({ length: 4 }, () => {
      const x = 1046 + r() * 82
      return [x, 50 + r() * 110, 1.8 + r() * 3.6, 0.45 + r() * 0.5, r() * 120]
    })
    const dur = 1.5 + r() * 0.9
    return { rects, dur, delay: -r() * dur, sx: 0 }
  })
})()
// Mid-height ledge where the sheet breaks into churning white water.
const fallLedge = (() => {
  const r = rng(410)
  let foam = 'M 1030 474 C 1060 468, 1116 468, 1150 474 L 1150 486 C 1110 482, 1066 482, 1030 486 Z'
  for (let i = 0; i < 9; i++) foam += bumpy(1036 + i * 13.5, 474 + r() * 4, 7 + r() * 4, 4 + r() * 2, 6, r, 0.62)
  const boils = [bumpy(1064, 474, 12, 6, 7, r, 0.62), bumpy(1110, 475, 13, 6, 7, r, 0.62)]
  return { foam, boils }
})()
const RIPPLES = [
  [1088, 668, 120, 15, 4.2, 0],
  [1070, 670, 96, 12, 4.2, -1.4],
  [1104, 666, 140, 17, 4.2, -2.8],
  [1088, 672, 170, 19, 5.6, -0.7],
]
const BOILS = [
  [1066, 652, 26, 16, 1.9, -0.3],
  [1094, 648, 32, 20, 2.3, -1.1],
  [1120, 654, 24, 14, 1.7, -0.6],
  [1044, 658, 18, 10, 2.1, -1.5],
]
const PUFFS = [
  ['75.6%', '71%', '9%', 7.5, -1],
  ['73.6%', '71.5%', '8%', 8.6, -3.4],
  ['77.6%', '71.2%', '10%', 9.4, -6],
  ['75%', '72%', '12%', 10.5, -4.8],
  ['78.4%', '72.2%', '8%', 7.8, -2.2],
]
const RAINBOW = ['#ff6f6f', '#ffb45e', '#ffe46e', '#93e08a', '#7ab8ff', '#b493ff']

const gorgeLayer = (
  <>
    <Svg>
      <defs>
        <linearGradient id="rainforest-fall-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4f2ed" />
          <stop offset="0.4" stopColor="#c9e2da" />
          <stop offset="0.8" stopColor="#e3f2ed" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="rainforest-brink-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rainforest-core-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f7fcfa" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="rainforest-recess-g" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="666">
          <stop offset="0" stopColor="#4c7366" />
          <stop offset="0.75" stopColor="#5f877a" />
          <stop offset="1" stopColor="#a9cbbf" />
        </linearGradient>
        <linearGradient id="rainforest-cliff-g" gradientUnits="userSpaceOnUse" x1="0" y1="260" x2="0" y2="760">
          <stop offset="0" stopColor="#8db29f" />
          <stop offset="0.7" stopColor="#97baa8" />
          <stop offset="1" stopColor="#c9dfd3" />
        </linearGradient>
        <linearGradient id="rainforest-pool-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4fbf8" />
          <stop offset="1" stopColor="#c6e3d9" />
        </linearGradient>
        <linearGradient id="rainforest-spray-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="rainforest-bow-m-g" gradientUnits="userSpaceOnUse" x1="1060" y1="540" x2="900" y2="700">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="rainforest-bow-m" maskUnits="userSpaceOnUse" x="800" y="480" width="400" height="260">
          <rect x="800" y="480" width="400" height="260" fill="url(#rainforest-bow-m-g)" />
        </mask>
        <clipPath id="rainforest-fall-clip">
          <path d={FALL} />
          <path d={STRAND} />
        </clipPath>
        <clipPath id="rainforest-cliffR-clip">
          <path d={CLIFF_R} />
        </clipPath>
        <clipPath id="rainforest-cliffL-clip">
          <path d={CLIFF_L} />
        </clipPath>
      </defs>

      {/* left cliff */}
      <path d={CLIFF_L} fill="url(#rainforest-cliff-g)" />
      <g clipPath="url(#rainforest-cliffL-clip)">
        <path d={rockL.jl} fill="#a2c3b2" />
        <path d={rockL.jd} fill="#789b8b" />
        <path d={rockL.ld} fill="#6f9282" />
        <path d={rockL.ll} fill="#b9d4c6" />
      </g>
      <path d={CLIFF_L_SHADE} fill="#7a9e8d" />
      <path d={rockL.drape + cliffGreen.drape} fill="#73a281" />
      <path d={rockL.moss + cliffGreen.body} fill="#82b18d" />
      <path d={rockL.mossLit + cliffGreen.lit} fill="#a7cfa6" />
      <path d={gorgePalms[2].wood + gorgePalms[2].fronds} fill="#79a88b" />
      <path d={cliffTopL.body.replace(/^M [^M]*Z/, '')} fill="#7fae91" />
      <path d={cliffTopL.lit} fill="#a2c9ad" />

      {/* right cliff */}
      <path d={CLIFF_R} fill="url(#rainforest-cliff-g)" />
      <path d={CLIFF_R_LIT} fill="#a9cab9" />
      <g clipPath="url(#rainforest-cliffR-clip)">
        <path d={rockR.jl} fill="#a3c4b3" />
        <path d={rockR.jd} fill="#76998a" />
        <path d={rockR.ld + rockRLit.ld} fill="#6f9383" />
        <path d={rockR.ll + rockRLit.ll} fill="#b3cfc0" />
      </g>
      <path d={rockR.drape + rockRLit.drape} fill="#7aa688" />
      <path d={rockR.moss + rockRLit.moss} fill="#82b18d" />
      <path d={rockR.mossLit + rockRLit.mossLit} fill="#a7cfa6" />
      <path d={gorgePalms[0].wood + gorgePalms[0].fronds + gorgePalms[1].wood + gorgePalms[1].fronds} fill="#79a88b" />
      <path d={cliffTopR.body.replace(/^M [^M]*Z/, '')} fill="#7fae91" />
      <path d={cliffTopR.lit} fill="#a2c9ad" />
      <path d={cliffTopLip.body.replace(/^M [^M]*Z/, '')} fill="#86b496" />
      <path d={cliffTopLip.lit} fill="#a8cdb2" />

      {/* the falls: dark wet recess, shadowed sheet, bright core, streaks, lip */}
      <path d={RECESS} fill="url(#rainforest-recess-g)" />
      <path d="M 1034 330 L 1038 330 L 1022 560 L 1018 560 Z M 1144 340 L 1148 340 L 1166 580 L 1162 580 Z" fill="#8fb3a6" opacity="0.7" />
      <path d={FALL} fill="url(#rainforest-fall-g)" />
      <path d={CORE} fill="url(#rainforest-core-g)" />
      <path d={STRAND} fill="#e8f5f0" />
      <g clipPath="url(#rainforest-fall-clip)">
        <path
          d="M 1050 300 C 1048 420, 1042 540, 1030 662 L 1042 662 C 1052 540, 1056 420, 1056 300 Z M 1086 300 C 1086 420, 1086 540, 1084 662 L 1092 662 C 1092 540, 1091 420, 1090 300 Z M 1120 300 C 1126 420, 1134 540, 1142 662 L 1152 662 C 1142 540, 1132 420, 1126 300 Z"
          fill="#b2d3c9"
          opacity="0.6"
        />
        {fallGroups.map((g, i) => (
          <g key={i} className="rainforest-streak" style={{ animationDuration: `${g.dur.toFixed(2)}s`, animationDelay: `${g.delay.toFixed(2)}s` }}>
            {g.rects.map(([x, len, w, o, dy], k) => (
              <rect key={k} x={f(x)} y={f(250 - len + dy * 0.4)} width={f(w)} height={f(len)} rx={f(w / 2)} fill="#fff" fillOpacity={o.toFixed(2)} />
            ))}
          </g>
        ))}
        <rect x="1028" y="286" width="124" height="44" fill="url(#rainforest-brink-g)" />
        <path d="M 1028 306 C 1066 316, 1110 316, 1152 306 L 1152 314 C 1110 324, 1066 324, 1028 314 Z" fill="#b6d6cc" opacity="0.5" />
        <rect x="1028" y="478" width="124" height="70" fill="url(#rainforest-brink-g)" opacity="0.8" />
        <path d={fallLedge.foam} fill="#ffffff" fillOpacity="0.92" />
        {fallLedge.boils.map((d, i) => (
          <path key={i} className="rainforest-boil" d={d} fill="#ffffff" style={{ animationDuration: `${1.6 + i * 0.5}s`, animationDelay: `${-i * 0.7}s` }} />
        ))}
      </g>
      <ellipse className="rainforest-lipglint" cx="1064" cy="294" rx="13" ry="1.7" fill="#fffdf0" />
      <path d={lipFerns} fill="#6d9f7f" />

      {/* plunge pool, ripples, whitewater, spray veil */}
      <ellipse cx="1088" cy="668" rx="176" ry="22" fill="url(#rainforest-pool-g)" />
      <path d="M 990 664 C 930 668, 860 676, 800 688 C 760 696, 730 704, 700 716 L 700 744 C 760 732, 840 716, 920 702 C 980 692, 1030 686, 1070 682 Z" fill="#d3ebe2" />
      {RIPPLES.map(([x, y, rx, ry, dur, delay], i) => (
        <ellipse key={i} className="rainforest-ripple" cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke="#ffffff" strokeWidth="2" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
      ))}
      {[
        [1010, 674, 16, 3.4],
        [1160, 676, 12, 4.4],
        [930, 690, 18, 5.1],
      ].map(([x, y, w, dur], i) => (
        <rect key={i} className="rainforest-glint" x={x} y={y} width={w} height="2" rx="1" fill="#fff" style={{ animationDuration: `${dur}s`, animationDelay: `${-i * 1.3}s` }} />
      ))}
      <path d="M 1020 560 C 1040 540, 1140 540, 1160 560 L 1176 668 L 1004 668 Z" fill="url(#rainforest-spray-g)" />
      {BOILS.map(([x, y, rx, ry, dur, delay], i) => (
        <path key={i} className="rainforest-boil" d={bumpy(x, y, rx, ry, 7, rng(500 + i), 0.62)} fill="#ffffff" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
      ))}

      {/* rainbow in the spray */}
      <g className="rainforest-bow" mask="url(#rainforest-bow-m)">
        {RAINBOW.map((c, i) => (
          <path key={i} d={`M ${f(1088 - (178 - i * 5))} 742 A ${178 - i * 5} ${178 - i * 5} 0 0 1 1088 ${742 - (178 - i * 5)}`} fill="none" stroke={c} strokeWidth="5.2" strokeOpacity="0.5" />
        ))}
      </g>
    </Svg>
    <div className="rainforest-spray" style={{ left: '75.5%', top: '72.6%', width: '24%' }} />
    {PUFFS.map(([left, top, width, dur, delay], i) => (
      <div key={i} className="rainforest-puff" style={{ left, top, width, animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
    ))}
    {[
      ['69%', '68%', '20%', 26, -4, 'a'],
      ['74%', '67%', '22%', 31, -17, 'b'],
      ['78%', '69%', '18%', 22, -9, 'a'],
    ].map(([left, top, width, dur, delay, v], i) => (
      <div key={i} className={`rainforest-cloud rainforest-cloud-${v}`} style={{ left, top, width, animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
    ))}
    {mist(9, 70, 11, 60, 90, -35, 0.7)}
  </>
)

// Ripple marks drifting downstream: short, nearly horizontal arcs scattered
// across a river given by a centreline and half-widths.
function ripples(seed, cl, hw, n, { scale = 1, op = 0.75 } = {}) {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const u = (i + r() * 0.9) / n
    const k = Math.min(cl.length - 2, Math.floor(u * (cl.length - 1)))
    const t = u * (cl.length - 1) - k
    const [x0, y0] = cl[k]
    const [x1, y1] = cl[k + 1]
    const w = hw[k] + (hw[k + 1] - hw[k]) * t
    const l = Math.hypot(x1 - x0, y1 - y0)
    const x = x0 + (x1 - x0) * t + (r() - 0.5) * 1.5 * w
    const y = y0 + (y1 - y0) * t
    const len = (8 + w * 0.16 + r() * 10) * scale
    const sag = (r() < 0.5 ? 1 : -1) * (1 + len * 0.06)
    const travel = 14 + w * 0.12
    return {
      key: i,
      d: `M ${f(x - len / 2)} ${f(y)} q ${f(len / 2)} ${f(sag)} ${f(len)} 0`,
      fx: `${f(((x1 - x0) / l) * travel)}px`,
      fy: `${f(((y1 - y0) / l) * travel)}px`,
      w: (1 + w * 0.006 * scale).toFixed(1),
      op: (op * (0.6 + r() * 0.4)).toFixed(2),
      dur: (3 + r() * 2.2).toFixed(1),
      delay: (-r() * 5).toFixed(1),
    }
  })
}
function Ripples({ list }) {
  return list.map((l) => (
    <path key={l.key} className="rainforest-flow" d={l.d} fill="none" stroke="#ffffff" strokeOpacity={l.op} strokeWidth={l.w} strokeLinecap="round" style={{ '--fx': l.fx, '--fy': l.fy, animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s` }} />
  ))
}

// Wet boulder: white water piled on its upstream (far) side, a V wake below.
function Rock({ x, y, rx, ry, seed, c, dur }) {
  const wake = `M ${f(x - rx * 0.85)} ${f(y + ry * 0.35)} q ${f(-rx * 0.25)} ${f(ry * 0.9)} ${f(-rx * 0.6)} ${f(ry * 1.8)} M ${f(x + rx * 0.85)} ${f(y + ry * 0.35)} q ${f(rx * 0.25)} ${f(ry * 0.9)} ${f(rx * 0.6)} ${f(ry * 1.8)}`
  return (
    <g>
      <path className="rainforest-foam" d={bumpy(x + rx * 0.05, y - ry * 0.4, rx * 1.22, ry * 0.7, 9, rng(seed + 5), 0.62)} fill="#ffffff" style={{ animationDuration: `${dur}s`, animationDelay: `${(-dur * 0.6).toFixed(1)}s` }} />
      <path d={wake} fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth={f(Math.max(1.2, ry * 0.12))} strokeLinecap="round" />
      <ellipse cx={x} cy={y + ry * 0.75} rx={rx * 0.9} ry={ry * 0.3} fill={c[0]} opacity="0.35" />
      <path d={bumpy(x, y, rx, ry, 7, rng(seed), 0.8)} fill={c[0]} />
      <path d={bumpy(x - rx * 0.16, y - ry * 0.3, rx * 0.74, ry * 0.52, 6, rng(seed + 10), 0.8)} fill={c[1]} />
      <path d={bumpy(x - rx * 0.34, y - ry * 0.5, rx * 0.32, ry * 0.2, 5, rng(seed + 20), 0.8)} fill={c[2]} />
    </g>
  )
}

/* ================= Layer 4: river valley ================= */

const VRIVER = 'M 930 668 C 870 672, 800 684, 740 698 C 660 716, 590 748, 550 790 L 532 850 L 1010 850 C 950 820, 884 794, 860 764 C 846 740, 876 718, 936 702 C 984 690, 1030 686, 1080 686 Z'
const VBANK_L = 'M -220 860 L -220 700 C -60 690, 200 688, 420 698 C 560 704, 680 700, 742 697 C 660 716, 590 748, 550 790 L 532 850 L 532 860 Z'
const VBANK_R = 'M 1660 860 L 1660 668 C 1500 666, 1360 672, 1260 690 C 1200 698, 1130 694, 1080 686 C 1030 684, 984 690, 936 702 C 876 718, 846 740, 860 764 C 884 794, 950 820, 1010 850 L 1010 860 Z'
const VEDGE_L = 'M 930 668 C 870 672, 800 684, 740 698 C 660 716, 590 748, 550 790 L 532 850'
const VEDGE_R = 'M 1080 686 C 1030 686, 984 690, 936 702 C 876 718, 846 740, 860 764 C 884 794, 950 820, 1010 850'

const vTrees = [
  { k: 1, x: 80, base: 712, cx: 40, cy: 470, rx: 180, ry: 100, w0: 34, w1: 16 },
  { k: 2, x: 300, base: 706, cx: 330, cy: 548, rx: 120, ry: 70, w0: 24, w1: 12 },
  { k: 3, x: 470, base: 704, cx: 460, cy: 612, rx: 86, ry: 52, w0: 16, w1: 9 },
].map((t) => ({ ...t, c: crown(40 + t.k, t.cx, t.cy, t.rx, t.ry, 10), wood: trunk(t.x, t.base, t.cx + 6, t.cy + t.ry * 0.3, t.w0, t.w1, 10) }))
const vRoots = [
  [80, 712, 34],
  [300, 706, 24],
].map(([x, y, w]) => poly([[x - w * 1.6, y + 4], [x - w * 0.4, y - 50], [x + w * 0.4, y - 50], [x + w * 1.7, y + 4]]) + poly([[x - 3, y - 40], [x + 2, y - 40], [x + w * 0.3, y + 6], [x - w * 0.4, y + 6]]))
const lianas =
  'M 120 520 C 150 600, 110 660, 136 720 M 186 500 C 210 560, 236 610, 220 700 M 30 540 C 0 610, 30 660, 16 720'

const vBushes = (() => {
  const r = rng(45)
  let shade = ''
  let body = ''
  let lit = ''
  for (const [x, y, s] of [[-120, 690, 70], [-20, 700, 60], [160, 690, 64], [250, 702, 50], [390, 694, 56], [520, 696, 50], [620, 704, 42], [700, 704, 30]]) {
    const fr = fringe(r, x, y, s, s * 0.56, 9, s * 0.32, { from: rad(-200), to: rad(20) })
    shade += bumpy(x + 6, y + 6, s, s * 0.62, 9, r) + fr.shade
    body += bumpy(x, y, s * 0.9, s * 0.54, 9, r)
    lit += bumpy(x - s * 0.25, y - s * 0.22, s * 0.48, s * 0.26, 7, r) + fr.lit
  }
  return { shade, body, lit }
})()

const vPalms = [
  { x: 600, base: 748, cx: 628, cy: 486, size: 120, seed: 51, dur: 8.5, delay: -2 },
  { x: 528, base: 742, cx: 486, cy: 552, size: 96, seed: 52, dur: 7.2, delay: -5 },
  { x: 1402, base: 690, cx: 1416, cy: 500, size: 112, seed: 53, dur: 9.4, delay: -7 },
].map((p) => ({ ...p, wood: trunk(p.x, p.base, p.cx, p.cy, 13, 7, (p.cx - p.x) * 0.5), fronds: palmCrown(p.cx, p.cy, p.size, p.seed) }))
const palmRings = (p) => {
  let d = ''
  for (let i = 1; i < 14; i++) {
    const t = i / 14
    const [x, y] = qb([p.x, p.base], [(p.x + p.cx) / 2 + (p.cx - p.x) * 0.5, (p.base + p.cy) / 2], [p.cx, p.cy], t)
    const w = 6.5 - t * 3
    d += ` M ${f(x - w)} ${f(y)} L ${f(x + w)} ${f(y - 1.5)}`
  }
  return d
}

// Banana plant on the right bank: pseudo-stem and torn, arching blades.
const banana1 = [
  blade([1262, 650], [1200, 560], [1120, 600], 26, { prof: strap, tears: [[1, 0.35], [1, 0.55], [-1, 0.48], [1, 0.75], [-1, 0.7]], veins: 8 }),
  blade([1262, 650], [1260, 520], [1210, 500], 22, { prof: strap, tears: [[-1, 0.4], [1, 0.62], [-1, 0.78]], veins: 7 }),
  blade([1262, 650], [1320, 540], [1376, 566], 24, { prof: strap, tears: [[1, 0.3], [-1, 0.5], [1, 0.68]], veins: 7 }),
  blade([1262, 650], [1200, 620], [1160, 672], 20, { prof: strap, tears: [[1, 0.45], [-1, 0.6]], veins: 5 }),
]

// River details: wet boulders and ripples drifting downstream.
const vRocks = [
  [766, 716, 17, 9, 60],
  [692, 754, 22, 11, 61],
  [826, 744, 13, 7, 62],
  [918, 702, 10, 5, 63],
  [600, 808, 18, 9, 64],
]
const vRipples = ripples(58, [[1000, 676], [900, 688], [800, 706], [740, 736], [726, 780], [746, 830], [760, 850]], [24, 36, 52, 76, 116, 160, 190], 12)

// Grass and sedge tufts fringing the water's edge.
function tufts(seed, spots, h, c) {
  const r = rng(seed)
  let a = ''
  let b = ''
  for (const [x, y, s = 1] of spots) {
    for (let k = 0; k < 6; k++) {
      const ang = rad(-90 + (k - 2.5) * 16 + (r() - 0.5) * 12)
      const piece = leaf(x + (k - 2.5) * 2.5, y, ang, h * s * (0.6 + r() * 0.5), 2.6 * s, h * s * 0.18 * Math.sign(Math.cos(ang)))
      if (k % 2) a += piece
      else b += piece
    }
  }
  return (
    <>
      <path d={b} fill={c[1]} />
      <path d={a} fill={c[0]} />
    </>
  )
}
const treeFern = (() => {
  const cx = 404
  const cy = 586
  const fr = [-170, -140, -112, -80, -48, -16, 160, 30].map((deg, i) => {
    const a = rad(deg)
    const L = 70 + (i % 3) * 10
    const tip = [cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.6 + L * 0.45]
    const c = [cx + Math.cos(a) * L * 0.5, cy + Math.sin(a) * L * 0.5 - 10]
    return frond([cx, cy], c, tip, { n: 13, len: fernLen(17), w: 0.3, spread: 1.2, droop: 0.2, seed: 300 + i })
  })
  return { wood: trunk(398, 712, cx, cy, 8, 6, -6), fr }
})()

// Undergrowth on the right bank, back row to front row.
const vRightBank = [
  [[1290, 690, 34], [1350, 682, 50], [1440, 672, 62], [1560, 668, 70], [1680, 668, 70]],
  [[1010, 738, 26], [1080, 724, 40], [1160, 716, 52], [1260, 712, 60], [1380, 706, 66], [1500, 702, 70], [1630, 704, 72]],
  [[906, 792, 32], [972, 772, 36], [1060, 766, 54], [1180, 758, 64], [1310, 752, 70], [1450, 748, 76], [1590, 752, 72]],
].map((row, k) => {
  const r = rng(46 + k)
  let shade = ''
  let body = ''
  let lit = ''
  for (const [x, y, sz] of row) {
    const fr = fringe(r, x, y, sz, sz * 0.56, 9, sz * 0.32, { from: rad(-200), to: rad(20) })
    shade += bumpy(x + 5, y + 6, sz, sz * 0.62, 9, r) + fr.shade
    body += bumpy(x, y, sz * 0.9, sz * 0.54, 9, r)
    lit += bumpy(x - sz * 0.25, y - sz * 0.22, sz * 0.46, sz * 0.24, 7, r) + fr.lit
  }
  return { shade, body, lit }
})

const valleyLayer = (
  <>
    <Svg>
      <defs>
        <linearGradient id="rainforest-vriver-g" gradientUnits="userSpaceOnUse" x1="0" y1="670" x2="0" y2="850">
          <stop offset="0" stopColor="#d6ede5" />
          <stop offset="1" stopColor="#9dcbbb" />
        </linearGradient>
        <clipPath id="rainforest-vriver-clip">
          <path d={VRIVER} />
        </clipPath>
        <radialGradient id="rainforest-sheen-g">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rainforest-vbank-g" gradientUnits="userSpaceOnUse" x1="0" y1="660" x2="0" y2="860">
          <stop offset="0" stopColor="#4f8a69" />
          <stop offset="1" stopColor="#3b7155" />
        </linearGradient>
        <linearGradient id="rainforest-vtree-g" gradientUnits="userSpaceOnUse" x1="0" y1="380" x2="0" y2="720">
          <stop offset="0" stopColor="#5a9475" />
          <stop offset="1" stopColor="#6c9f84" />
        </linearGradient>
      </defs>
      <g fill="url(#rainforest-shaft-g)">
        <polygon className="rainforest-shaft" points="210,-60 270,-60 760,900 600,900" fillOpacity=".38" style={{ animationDuration: '12s', animationDelay: '-5s' }} />
        <polygon className="rainforest-shaft" points="300,-60 322,-60 930,900 870,900" fillOpacity=".3" style={{ animationDuration: '9.5s', animationDelay: '-2s' }} />
      </g>

      {/* water: bank reflections, sky sheen, ripples, boulders */}
      <path d={VRIVER} fill="url(#rainforest-vriver-g)" />
      <g clipPath="url(#rainforest-vriver-clip)">
        <path d={VEDGE_L} fill="none" stroke="#6f9f89" strokeOpacity="0.55" strokeWidth="34" />
        <path d={VEDGE_R} fill="none" stroke="#6f9f89" strokeOpacity="0.45" strokeWidth="26" />
        <ellipse cx="770" cy="760" rx="70" ry="60" fill="url(#rainforest-sheen-g)" />
        <ellipse cx="850" cy="700" rx="90" ry="14" fill="url(#rainforest-sheen-g)" />
      </g>
      <path d={VEDGE_L + VEDGE_R} fill="none" stroke="#f4fbf8" strokeOpacity="0.55" strokeWidth="1.6" />
      <Ripples list={vRipples} />
      {vRocks.map(([x, y, rx, ry, seed], i) => (
        <Rock key={i} x={x} y={y} rx={rx} ry={ry} seed={seed} c={['#4f7667', '#7fa595', '#b2d0c3']} dur={2.6 + i * 0.4} />
      ))}

      {/* banks */}
      <path d={VBANK_L} fill="url(#rainforest-vbank-g)" />
      <path d={VBANK_R} fill="url(#rainforest-vbank-g)" />

      {/* left bank forest: buttressed trunks, lianas, clustered crowns */}
      {vTrees.map((t) => (
        <g key={t.k}>
          <path d={t.wood} fill="#4d7461" />
          <path d={trunk(t.x - t.w0 * 0.22, t.base, t.cx + 6 - t.w1 * 0.25, t.cy + t.ry * 0.3, t.w0 * 0.4, t.w1 * 0.4, 10)} fill="#6d9480" />
          <path d={t.c.fShade} fill="#4a8065" />
          <path d={t.c.shade} fill="#4a8065" />
          <path d={t.c.body} fill="url(#rainforest-vtree-g)" />
          <path d={t.c.lit} fill="#7db48d" />
          <path d={t.c.hi} fill="#a6d197" />
          <path d={t.c.fLit} fill="#7db48d" />
        </g>
      ))}
      <path d={vRoots.join('')} fill="#4d7461" />
      <path d={lianas} fill="none" stroke="#3f6553" strokeWidth="2.4" strokeLinecap="round" />
      <path d={treeFern.wood} fill="#5a7c68" />
      {treeFern.fr.map((g, i) => (
        <Frond key={i} g={g} c={['#7db38a', '#568d6c', '#5e8670']} w={1.4} />
      ))}
      {vPalms.map((p, i) => (
        <g key={i}>
          <path d={p.wood} fill="#5b7b68" />
          <path d={palmRings(p)} stroke="#7d9c88" strokeWidth="1.6" fill="none" />
          <g className="rainforest-crown" style={{ transformOrigin: `${p.cx}px ${p.cy}px`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}>
            {p.fronds.map((g, k) => (
              <Frond key={k} g={g} c={['#79b087', '#558c6b', '#557a64']} />
            ))}
          </g>
        </g>
      ))}

      {/* bushes along both banks, a banana clump on the right */}
      <path d={vBushes.shade} fill="#467d61" />
      <path d={vBushes.body} fill="#5a9474" />
      <path d={vBushes.lit} fill="#7db48d" />
      <path d={vRightBank[0].shade} fill="#4d8467" />
      <path d={vRightBank[0].body} fill="#629b7b" />
      <path d={vRightBank[0].lit} fill="#86ba94" />
      <path d={trunk(1262, 700, 1262, 640, 16, 11, 0)} fill="#6a9a73" />
      <g className="rainforest-sway" style={{ transformOrigin: '1262px 650px', '--s': '2.4deg', animationDuration: '6.8s', animationDelay: '-3s' }}>
        {banana1.map((g, i) => (
          <Blade key={i} g={g} c={['#86bd7e', '#5f9a67', '#a7d18f', null, '#6ea676']} ribW={2} />
        ))}
      </g>
      {tufts(47, [[1000, 704, 0.7], [948, 712, 0.8], [900, 728, 0.9], [872, 752, 1], [878, 780, 1.1], [914, 806, 1.2], [960, 828, 1.3], [700, 712, 0.8], [636, 734, 0.9], [590, 764, 1], [560, 796, 1.1]], 30, ['#6faa7e', '#4f8a67'])}
      {vRightBank.slice(1).map((row, k) => (
        <g key={k}>
          <path d={row.shade} fill={k ? '#3f7659' : '#447c5f'} />
          <path d={row.body} fill={k ? '#528c6c' : '#578f71'} />
          <path d={row.lit} fill={k ? '#76ad86' : '#7bb28b'} />
        </g>
      ))}
    </Svg>
    {mist(5, 72, 9, 50, 80, -15, 0.65)}
    {mist(6, 66, 8, 40, 80, -55, 0.55, true)}
  </>
)

/* ================= Layer 5: canopy life ================= */

const BOUGH_L = 'M -220 486 C -60 470, 120 452, 250 436 C 300 430, 344 426, 380 424 L 381 432 C 344 436, 300 444, 252 452 C 120 470, -60 504, -220 532 Z'
const BOUGH_L_LIT = 'M -220 486 C -60 470, 120 452, 250 436 C 300 430, 344 426, 380 424 L 380 427 C 344 430, 300 435, 252 442 C 120 460, -60 480, -220 496 Z'
const TWIG_L = trunk(190, 448, 214, 382, 9, 3, -8) + trunk(300, 438, 336, 404, 6, 2, 4)
const BOUGH_R = 'M 1660 394 C 1500 404, 1380 414, 1290 420 C 1250 423, 1212 427, 1180 432 L 1180 438 C 1212 436, 1250 434, 1290 432 C 1380 430, 1500 434, 1660 440 Z'
const BOUGH_R_LIT = 'M 1660 394 C 1500 404, 1380 414, 1290 420 C 1250 423, 1212 427, 1180 432 L 1180 434 C 1212 431, 1250 428, 1290 425 C 1380 420, 1500 412, 1660 404 Z'
const boughMoss = (() => {
  const r = rng(81)
  let a = ''
  let b = ''
  for (const [x, y, s] of [[-140, 486, 18], [-40, 474, 14], [60, 462, 16], [140, 452, 12], [330, 428, 9], [1560, 402, 16], [1460, 408, 12], [1350, 415, 14]]) {
    a += bumpy(x, y - 3, s, s * 0.45, 7, r)
    b += bumpy(x - s * 0.3, y - 6, s * 0.5, s * 0.22, 5, r)
  }
  let strands = ''
  for (const [x, y, len] of [[-110, 500, 60], [-60, 494, 36], [20, 480, 52], [110, 466, 30], [1500, 436, 46], [1420, 434, 30]]) {
    strands += ` M ${f(x)} ${f(y)} C ${f(x + 4)} ${f(y + len * 0.4)}, ${f(x - 5)} ${f(y + len * 0.7)}, ${f(x + 1)} ${f(y + len)}`
  }
  const leaves = (() => {
    let d = ''
    for (const [x, y, a0] of [[214, 384, -60], [208, 398, -140], [218, 410, -30], [336, 404, -40], [330, 412, -150], [1196, 430, -150], [1212, 424, -100]]) {
      d += leaf(x, y, rad(a0), 22, 8, 6)
    }
    return d
  })()
  return { a, b, strands, leaves }
})()
const airRoots = 'M 34 470 C 40 540, 28 610, 36 690 M 46 468 C 56 520, 50 580, 58 620 M 158 452 C 150 520, 166 570, 158 640 M 1530 418 C 1524 490, 1536 550, 1528 610'

const lifeLayer = (
  <Svg>
    <defs>{morphoDefs}</defs>
    {/* left bough: toucan, bromeliads, orchids, moss */}
    <g className="rainforest-roots" style={{ transformOrigin: '90px 460px' }}>
      <path d={airRoots.split(' M 1530')[0]} fill="none" stroke="#3d5c48" strokeWidth="1.6" strokeLinecap="round" />
    </g>
    <path d={TWIG_L} fill="#3c5847" />
    <path d={BOUGH_L} fill="#3c5847" />
    <path d={BOUGH_L_LIT} fill="#6c917a" />
    <path d={boughMoss.strands} fill="none" stroke="#6a9a6c" strokeWidth="2" strokeLinecap="round" />
    <path d={boughMoss.a} fill="#4f8a55" />
    <path d={boughMoss.b} fill="#7fb36d" />
    <path d={boughMoss.leaves} fill="#4f8a55" />
    <Bromeliad x={-90} y={482} s={1.5} seed={3} />
    <Bromeliad x={96} y={458} s={1.15} seed={4} />
    <Bromeliad x={1446} y={408} s={1.3} seed={5} />
    <Orchids x={0} y={482} s={1.3} n={5} dir={1} seed={8} />
    <Orchids x={290} y={444} s={1.05} n={4} dir={1} seed={9} />
    <Orchids x={1390} y={428} s={1.1} n={4} dir={-1} seed={10} />
    <Toucan x={232} y={441} s={1.45} />

    {/* right bough with the spider monkey */}
    <path d={'M 1530 418 C 1524 490, 1536 550, 1528 610'} fill="none" stroke="#3d5c48" strokeWidth="1.6" strokeLinecap="round" />
    <path d={BOUGH_R} fill="#3c5847" />
    <path d={BOUGH_R_LIT} fill="#6c917a" />
    <Monkey x={1292} y={424} s={1.1} />

    {/* blue morphos over the water */}
    <Morpho x={700} y={600} s={1.25} path="a" dur={24} delay={-6} flap={0.46} tilt={-10} />
    <Morpho x={900} y={540} s={1.05} path="b" dur={29} delay={-17} flap={0.4} tilt={12} />
  </Svg>
)

/* ================= Layer 6: scarlet macaws ================= */

const macawLayer = (
  <Svg>
    <Macaw x={0} y={440} s={1.25} dur={30} delay={-9} flap={2.4} />
    <Macaw x={-70} y={478} s={1.05} dur={30} delay={-10.4} flap={2.2} rise={0.8} />
    <Macaw x={0} y={520} s={0.95} flip dur={38} delay={-27} flap={2.6} rise={0.6} />
    <Macaw x={0} y={410} s={1.35} dur={46} delay={-40} flap={2.8} rise={0.5} />
  </Svg>
)

/* ================= Layer 7: riverbank ================= */

const NRIVER = 'M 556 794 C 520 824, 470 862, 400 940 L 1220 940 C 1150 884, 1070 834, 1000 800 C 900 788, 660 786, 556 794 Z'
const NBANK_L = 'M -220 960 L -220 760 C -40 752, 200 772, 380 790 C 470 798, 530 796, 572 798 C 524 832, 470 876, 426 960 Z'
const NBANK_R = 'M 1660 960 L 1660 768 C 1500 770, 1300 780, 1150 792 C 1070 798, 1020 800, 990 800 C 1070 842, 1146 892, 1196 960 Z'

const ferns = (seed, x, y, specs, L) => {
  const r = rng(seed)
  return specs.map(([tx, ty, cx, cy], i) => frond([x, y], [cx, cy], [tx, ty], { n: 15, len: fernLen(L * (0.85 + r() * 0.3)), w: 0.32, spread: 1.25, droop: 0.12, t0: 0.08, seed: seed + i }))
}
const fernL = ferns(61, 210, 860, [[60, 700, 140, 720], [150, 660, 190, 720], [290, 680, 250, 720], [380, 770, 320, 750], [70, 820, 120, 780]], 44)
const fernR = ferns(62, 1180, 870, [[1060, 760, 1100, 770], [1140, 700, 1150, 740], [1260, 700, 1230, 730], [1330, 790, 1280, 770]], 40)
const earL = [
  monstera([340, 800], rad(-120), 120, { plain: true, bend: 0.14, seed: 63 }),
  monstera([380, 806], rad(-62), 104, { plain: true, bend: -0.1, seed: 64 }),
  monstera([300, 830], rad(-160), 92, { plain: true, bend: 0.1, seed: 65 }),
]
const helL = heliconia(118, 790, 170, 1.15, -1)
const bananaR = [
  blade([1330, 820], [1290, 640], [1150, 640], 40, { prof: strap, tears: [[1, 0.3], [1, 0.5], [-1, 0.42], [1, 0.72], [-1, 0.64], [-1, 0.84]], veins: 10 }),
  blade([1330, 820], [1360, 620], [1300, 560], 34, { prof: strap, tears: [[-1, 0.36], [1, 0.58], [-1, 0.74]], veins: 9 }),
  blade([1330, 820], [1420, 660], [1520, 680], 38, { prof: strap, tears: [[1, 0.4], [-1, 0.56], [1, 0.8]], veins: 9 }),
]
const NEDGE_L = 'M 556 794 C 520 824, 470 862, 400 940'
const NEDGE_R = 'M 1000 800 C 1070 834, 1150 884, 1220 940'
const nRocks = [
  [580, 862, 54, 30, 71],
  [1010, 852, 42, 24, 72],
  [900, 892, 22, 12, 73],
  [690, 816, 16, 8, 74],
]
const nRipples = ripples(77, [[780, 796], [790, 860], [800, 940]], [220, 300, 400], 10, { scale: 1.5, op: 0.8 })

const bankLayer = (
  <Svg>
    <defs>
      {morphoDefs}
      <linearGradient id="rainforest-nriver-g" gradientUnits="userSpaceOnUse" x1="0" y1="790" x2="0" y2="920">
        <stop offset="0" stopColor="#bfe0d3" />
        <stop offset="1" stopColor="#82b8a6" />
      </linearGradient>
      <clipPath id="rainforest-nriver-clip">
        <path d={NRIVER} />
      </clipPath>
      <radialGradient id="rainforest-nsheen-g">
        <stop offset="0" stopColor="#f4fbf8" stopOpacity="0.8" />
        <stop offset="1" stopColor="#f4fbf8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="rainforest-nbank-g" gradientUnits="userSpaceOnUse" x1="0" y1="740" x2="0" y2="940">
        <stop offset="0" stopColor="#2c6747" />
        <stop offset="1" stopColor="#1d4f34" />
      </linearGradient>
    </defs>
    <path d={NRIVER} fill="url(#rainforest-nriver-g)" />
    <g clipPath="url(#rainforest-nriver-clip)">
      <path d={NEDGE_L} fill="none" stroke="#4f8a74" strokeOpacity="0.55" strokeWidth="70" />
      <path d={NEDGE_R} fill="none" stroke="#4f8a74" strokeOpacity="0.5" strokeWidth="60" />
      <ellipse cx="790" cy="850" rx="130" ry="90" fill="url(#rainforest-nsheen-g)" />
    </g>
    <path d={NEDGE_L + NEDGE_R} fill="none" stroke="#f4fbf8" strokeOpacity="0.75" strokeWidth="2.6" />
    <Ripples list={nRipples} />
    {[
      [660, 834, 26, 4.2],
      [780, 872, 34, 5.4],
      [860, 822, 20, 3.6],
      [740, 904, 28, 6],
    ].map(([x, y, w, dur], i) => (
      <rect key={i} className="rainforest-glint" x={x} y={y} width={w} height="2.4" rx="1.2" fill="#fff" style={{ animationDuration: `${dur}s`, animationDelay: `${-i * 1.6}s` }} />
    ))}
    {nRocks.map(([x, y, rx, ry, seed], i) => (
      <Rock key={i} x={x} y={y} rx={rx} ry={ry} seed={seed} c={['#365d4f', '#628b7d', '#a6c7ba']} dur={2.4 + i * 0.5} />
    ))}

    <path d={NBANK_L} fill="url(#rainforest-nbank-g)" />
    <path d={NBANK_R} fill="url(#rainforest-nbank-g)" />

    {/* left bank: heliconia, elephant ears, ferns */}
    <g className="rainforest-sway" style={{ transformOrigin: '118px 860px', '--s': '2deg', animationDuration: '7.4s', animationDelay: '-2s' }}>
      <path d={helL.stem} stroke="#3e7a45" strokeWidth="4" fill="none" />
      <path d={helL.red} fill="#e6402c" />
      <path d={helL.gold} fill="#ffcf3f" />
      <path d={helL.green} fill="#5f9d4a" />
      <path d={leaf(118, 860, rad(-112), 190, 26, 30) + leaf(118, 860, rad(-70), 170, 24, 40)} fill="#2f7048" />
    </g>
    <g className="rainforest-sway" style={{ transformOrigin: '340px 900px', '--s': '2.6deg', animationDuration: '6.2s', animationDelay: '-4s' }}>
      <path d="M 340 900 Q 336 850 340 800 M 360 900 Q 372 850 380 806 M 330 900 Q 316 870 300 830" stroke="#2c6a45" strokeWidth="4" fill="none" strokeLinecap="round" />
      {earL.map((g, i) => (
        <Blade key={i} g={g} c={['#3f8a5a', '#2a6a44', '#5ea676', '#6fb27c']} ribW={2.4} />
      ))}
    </g>
    <g className="rainforest-sway" style={{ transformOrigin: '210px 860px', '--s': '3deg', animationDuration: '5.4s', animationDelay: '-1s' }}>
      {fernL.map((g, i) => (
        <Frond key={i} g={g} c={['#4b955f', '#2f714a', '#2f6a44']} w={2} />
      ))}
    </g>

    {/* right bank: banana clump and ferns */}
    <path d={trunk(1330, 880, 1330, 800, 26, 18, 0)} fill="#3d7a4c" />
    <g className="rainforest-sway" style={{ transformOrigin: '1330px 820px', '--s': '2deg', animationDuration: '8s', animationDelay: '-5s' }}>
      {bananaR.map((g, i) => (
        <Blade key={i} g={g} c={['#4f9a5e', '#2e6e45', '#7cbf7c', '#86c784', '#3f8552']} ribW={3} />
      ))}
    </g>
    <g className="rainforest-sway" style={{ transformOrigin: '1180px 870px', '--s': '3deg', animationDuration: '5.8s', animationDelay: '-3s' }}>
      {fernR.map((g, i) => (
        <Frond key={i} g={g} c={['#4b955f', '#2f714a', '#2f6a44']} w={2} />
      ))}
    </g>

    <Morpho x={760} y={720} s={1.2} path="c" dur={21} delay={-3} flap={0.5} tilt={-6} />
  </Svg>
)

/* ================= Layer 8: leaf frame ================= */

function fillerBlades(seed, anchors, c) {
  const r = rng(seed)
  let a = ''
  let b = ''
  anchors.forEach(([x, y, deg, len], i) => {
    const piece = leaf(x, y, rad(deg + (r() - 0.5) * 10), len * (0.85 + r() * 0.3), len * (0.17 + r() * 0.05), len * (0.15 + r() * 0.15))
    if (i % 2) a += piece
    else b += piece
  })
  return (
    <>
      <path d={b} fill={c[1]} />
      <path d={a} fill={c[0]} />
    </>
  )
}

const DARK = ['#1a4a2e', '#0f2e1d', '#2d6340', '#4e9160', '#235637']
const GLOW = ['#9fd165', '#78b44c', '#c7e98e', '#d6f2a0', '#5e9a3c']

const fTL = {
  frond: frond([-110, -30], [140, -40], [380, 150], { n: 20, len: palmLen(92), w: 0.15, spread: 1.1, droop: 0.45, t0: 0.1, seed: 91 }),
  mon: monstera([60, -60], rad(66), 250, { bend: -0.12, seed: 92 }),
  ban: blade([-90, 230], [20, 140], [210, 150], 40, { prof: strap, tears: [[1, 0.35], [-1, 0.5], [1, 0.62], [-1, 0.8]], veins: 11 }),
}
const fTR = {
  ban: blade([1580, -10], [1360, -50], [1130, 130], 64, { prof: strap, tears: [[1, 0.28], [1, 0.46], [-1, 0.38], [1, 0.66], [-1, 0.58], [-1, 0.8]], veins: 14 }),
  frond: frond([1560, 90], [1390, 60], [1240, 290], { n: 18, len: palmLen(84), w: 0.15, spread: 1.1, droop: 0.45, t0: 0.1, seed: 93 }),
  mon: monstera([1500, 140], rad(150), 190, { bend: 0.1, seed: 94 }),
  hel: heliconia(1300, 0, 220, 1.2, 1),
}
const fBL = {
  mon: monstera([30, 960], rad(-56), 300, { bend: 0.14, seed: 95 }),
  ban: blade([-90, 900], [60, 640], [330, 690], 50, { prof: strap, tears: [[1, 0.32], [-1, 0.45], [1, 0.6], [-1, 0.74]], veins: 12 }),
  ferns: [
    frond([180, 970], [260, 830], [430, 820], { n: 17, len: fernLen(52), w: 0.3, spread: 1.2, droop: 0.15, seed: 96 }),
    frond([180, 970], [200, 820], [300, 740], { n: 17, len: fernLen(48), w: 0.3, spread: 1.2, droop: 0.15, seed: 97 }),
  ],
}
const fBR = {
  mon: monstera([1420, 970], rad(-122), 290, { bend: -0.14, seed: 98 }),
  ban: blade([1540, 880], [1400, 640], [1130, 700], 48, { prof: strap, tears: [[-1, 0.3], [1, 0.44], [-1, 0.6], [1, 0.76]], veins: 12 }),
  ferns: [
    frond([1290, 970], [1210, 840], [1040, 830], { n: 17, len: fernLen(50), w: 0.3, spread: 1.2, droop: 0.15, seed: 99 }),
    frond([1290, 970], [1270, 820], [1170, 744], { n: 17, len: fernLen(46), w: 0.3, spread: 1.2, droop: 0.15, seed: 100 }),
  ],
}

const fVines = [
  [26, 470, 0],
  [138, 600, 1],
  [262, 330, 2],
  [1186, 380, 3],
  [1288, 300, 4],
  [1404, 560, 5],
].map(([x, len, i]) => ({ key: i, x, ...vine(900 + i * 17, x, len), dur: 7 + ((i * 1.7) % 4.5), delay: -((i * 3.1) % 9) }))

const FALLERS = [
  [300, 23, -3, '#5d9a48', 'a'],
  [760, 27, -12, '#d0ac4c', 'b'],
  [1080, 21, -16.5, '#4b8c50', 'c'],
  [520, 31, -24, '#8fbf5a', 'b'],
  [1240, 25, -7, '#c9973f', 'a'],
]

const MOTES = (() => {
  const r = rng(707)
  return Array.from({ length: 9 }, (_, i) => {
    const t = r()
    const x = 160 + t * 640 + (r() - 0.5) * 200
    const y = 120 + r() * 560
    return { key: i, x, y, r: 1.2 + r() * 2.2, dur: (10 + r() * 10).toFixed(1), delay: (-r() * 20).toFixed(1), v: 'ab'[i % 2] }
  })
})()

function sway(key, ox, oy, s, dur, delay, children) {
  return (
    <g key={key} className="rainforest-sway" style={{ transformOrigin: `${ox}px ${oy}px`, '--s': s, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
      {children}
    </g>
  )
}

const frameLayer = (
  <Svg>
    {/* top left: backlit monstera, palm frond, torn banana leaf, vines */}
    <g className="rainforest-gust" style={{ transformOrigin: '-40px -40px', '--g': '-1.6deg', animationDelay: '-2s' }}>
      {fVines.slice(0, 3).map((v) => (
        <g key={v.key} className="rainforest-vine" style={{ transformOrigin: `${v.x}px -60px`, animationDuration: `${v.dur.toFixed(1)}s`, animationDelay: `${v.delay.toFixed(1)}s` }}>
          <path d={v.stem} fill="none" stroke="#163d27" strokeWidth="3.2" strokeLinecap="round" />
          <path d={v.b} fill="#1d5235" />
          <path d={v.a} fill="#2f7046" />
        </g>
      ))}
      {sway(0, -90, 230, '2.2deg', 7.6, -1, <Blade g={fTL.ban} c={DARK} ribW={3} />)}
      {fillerBlades(
        110,
        [[-80, -40, 70, 200], [-20, -40, 84, 160], [40, -40, 60, 190], [110, -40, 96, 140], [180, -40, 50, 150], [240, -40, 70, 120], [-120, 60, 30, 170], [-120, 140, 10, 150], [300, -40, 40, 110]],
        ['#1d5034', '#123722'],
      )}
      {sway(1, -110, -30, '1.8deg', 9, -4, <Frond g={fTL.frond} c={['#245a39', '#123522', '#2b5e3d']} w={3} />)}
      {sway(2, 60, -60, '2.4deg', 8.2, -6, <Blade g={fTL.mon} c={GLOW} rule="evenodd" ribW={3} />)}
    </g>

    {/* top right: banana leaf, palm frond, monstera, heliconia, vines */}
    <g className="rainforest-gust" style={{ transformOrigin: '1480px -40px', '--g': '-1.4deg', animationDelay: '-2.6s' }}>
      {fVines.slice(3).map((v) => (
        <g key={v.key} className="rainforest-vine" style={{ transformOrigin: `${v.x}px -60px`, animationDuration: `${v.dur.toFixed(1)}s`, animationDelay: `${v.delay.toFixed(1)}s` }}>
          <path d={v.stem} fill="none" stroke="#163d27" strokeWidth="3.2" strokeLinecap="round" />
          <path d={v.b} fill="#1d5235" />
          <path d={v.a} fill="#2f7046" />
        </g>
      ))}
      {sway(3, 1300, 0, '3deg', 6.4, -2, (
        <>
          <path d={fTR.hel.stem} stroke="#2e6a3e" strokeWidth="4" fill="none" />
          <path d={fTR.hel.red} fill="#e8432e" />
          <path d={fTR.hel.gold} fill="#ffd23f" />
          <path d={fTR.hel.green} fill="#4f9346" />
        </>
      ))}
      {fillerBlades(
        111,
        [[1520, -40, 110, 200], [1460, -40, 96, 170], [1400, -40, 120, 180], [1330, -40, 84, 150], [1260, -40, 130, 150], [1200, -40, 100, 120], [1560, 60, 150, 180], [1560, 150, 170, 150]],
        ['#1d5034', '#123722'],
      )}
      {sway(4, 1560, 90, '2deg', 8.8, -5, <Frond g={fTR.frond} c={['#245a39', '#123522', '#2b5e3d']} w={3} />)}
      {sway(5, 1500, 140, '2.2deg', 7.2, -3, <Blade g={fTR.mon} c={DARK} rule="evenodd" ribW={3} />)}
      {sway(6, 1580, -10, '1.6deg', 9.6, -7, <Blade g={fTR.ban} c={['#2f6e45', '#1a472c', '#4f8f5c', '#6fae6a', '#24573a']} ribW={3.4} />)}
    </g>

    {/* bottom left */}
    <g className="rainforest-gust" style={{ transformOrigin: '0px 940px', '--g': '2deg', animationDelay: '-1.6s' }}>
      {sway(7, 180, 970, '2.6deg', 6, -2, fBL.ferns.map((g, i) => <Frond key={i} g={g} c={['#2f6e45', '#17402a', '#1f4f33']} w={2.4} />))}
      {sway(8, -90, 900, '1.8deg', 8.4, -5, <Blade g={fBL.ban} c={['#2c6a44', '#18452c', '#4a8c5a', '#6fae6a', '#215337']} ribW={3.2} />)}
      {sway(9, 30, 960, '2deg', 7.4, -1, <Blade g={fBL.mon} c={['#245c3a', '#163f28', '#3f7f52', '#6aa86c']} rule="evenodd" ribW={3.4} />)}
    </g>

    {/* bottom right */}
    <g className="rainforest-gust" style={{ transformOrigin: '1440px 940px', '--g': '1.8deg', animationDelay: '-2.2s' }}>
      {sway(10, 1290, 970, '2.6deg', 6.6, -3, fBR.ferns.map((g, i) => <Frond key={i} g={g} c={['#2f6e45', '#17402a', '#1f4f33']} w={2.4} />))}
      {sway(11, 1540, 880, '1.8deg', 9, -6, <Blade g={fBR.ban} c={['#2c6a44', '#18452c', '#4a8c5a', '#6fae6a', '#215337']} ribW={3.2} />)}
      {sway(12, 1420, 970, '2deg', 7.8, -4, <Blade g={fBR.mon} c={['#245c3a', '#163f28', '#3f7f52', '#6aa86c']} rule="evenodd" ribW={3.4} />)}
    </g>

    {/* drifting leaves and light motes */}
    {FALLERS.map(([x, dur, delay, color, v], i) => (
      <path key={i} className={`rainforest-fall rainforest-fall-${v}`} d={leaf(x, -40, 0.4, 24, 9, 0)} fill={color} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
    ))}
    {MOTES.map((m) => (
      <circle key={m.key} className={`rainforest-mote rainforest-mote-${m.v}`} cx={f(m.x)} cy={f(m.y)} r={f(m.r)} fill="#fff8d6" style={{ animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s` }} />
    ))}
  </Svg>
)

/* ---------- the world ---------- */

export default {
  id: 'rainforest',
  name: 'Rainforest Falls',
  tag: 'Misty jungle',
  accent: '#1fbf6e',
  accent2: '#ff5a3c',
  ink: '#11683f',
  glow: '#9fe0bd',
  light: true,
  clockColor: '#163a2a',
  sky: 'radial-gradient(60% 55% at 18% 0%,rgba(255,251,228,.95),rgba(255,251,228,0) 70%),linear-gradient(180deg,#c0dccf 0%,#d2e8db 35%,#e1eee0 62%,#ebf3e4 100%)',
  layers: [
    { name: 'Misty sky', depth: 0, sky: true, el: skyLayer },
    { name: 'Far canopy', depth: 0.14, el: farLayer },
    { name: 'Waterfall gorge', depth: 0.28, el: gorgeLayer },
    { name: 'Depth clock', depth: 0.42, clock: true },
    { name: 'River valley', depth: 0.58, el: valleyLayer },
    { name: 'Canopy life', depth: 0.72, el: lifeLayer },
    { name: 'Scarlet macaws', depth: 0.88, el: macawLayer },
    { name: 'Riverbank', depth: 1, el: bankLayer },
    { name: 'Leaf frame', depth: 1.3, el: frameLayer },
  ],
}
