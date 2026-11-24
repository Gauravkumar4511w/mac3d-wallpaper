// Desert Caravan — a bright golden afternoon. Layered mesas stand in the
// heat haze with a mirage at their feet, a camel train plods along a knife-edge
// dune crest toward the sun, sand streams off the crests, palms sway over a
// glinting oasis pool, vultures circle on thermals and a tumbleweed bowls by.

import './caravan.css'
import { W, H, PAD, rng, f, Svg } from './kit.jsx'

/* ---------- helpers ---------- */

const s2 = (n) => n.toFixed(2)
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2))

// Smooth Catmull-Rom curve through points, as cubic Béziers.
function smooth(pts, cmd = 'M') {
  let d = `${cmd} ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, pts.length - 1)]
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

// y = fn(x) sampled as a polyline from x0 to x1 (either direction).
function trace(fn, x0, x1, cmd = 'M', step = 16) {
  const dir = x1 >= x0 ? 1 : -1
  let d = `${cmd} ${f(x0)} ${f(fn(x0))}`
  for (let x = x0 + dir * step; dir > 0 ? x < x1 : x > x1; x += dir * step) d += ` L ${f(x)} ${f(fn(x))}`
  return `${d} L ${f(x1)} ${f(fn(x1))}`
}

// Wind ripples following a surface curve fn(x): tighter near the crest (far),
// looser and bolder below (near). Each ripple is a shaded trough line plus a
// sunlit lip just above it; all ripples share two path strings.
function ripples(seed, fn, { x0, x1, n, top, gap, grow = 0.3, amp = 2.2, wave = 40 }) {
  const r = rng(seed)
  let dark = ''
  let lite = ''
  for (let i = 0; i < n; i++) {
    const off = top + i * gap + i * i * grow
    const a = amp * (0.7 + 0.1 * i)
    const lam = wave * (1 + i * 0.07)
    const step = Math.max(6, lam * 0.45)
    let x = x0 - r() * 120
    while (x < x1) {
      // short sinuous runs that drift up or down a little, so the field
      // reads as wind-laid sand rather than ruled lines
      const end = Math.min(x + 50 + r() * 200, x1 + 40)
      const ph = r() * 6.28
      const jit = (r() - 0.5) * gap * 0.7
      const tilt = (r() - 0.5) * 0.08
      let dd = ''
      let ll = ''
      for (let xx = x; xx <= end; xx += step) {
        const y = fn(xx) + off + jit + (xx - x) * tilt + a * Math.sin(xx / lam + ph) + a * 0.5 * Math.sin((xx * 2.7) / lam + ph * 1.7)
        dd += ` ${dd ? 'L' : 'M'} ${f(xx)} ${f(y)}`
        ll += ` ${ll ? 'L' : 'M'} ${f(xx)} ${f(y - 1.4 - i * 0.12)}`
      }
      dark += dd
      lite += ll
      x = end + 10 + r() * 50
    }
  }
  return { dark, lite }
}

// Soft-shaded spur running down from a crest: a crisp sunlit edge, a bright
// band on its lit (left) side and, on its right, a shadow that starts dark at
// the edge and fades out into warm bounce light.
function spur(id, pts, { shadow, glow, dark = '#a3582c', lite = '#ffe3ae', bounce = '#ef8f3e', so = 0.8, go = 0.6, rim = 2 }) {
  const a = pts[0]
  const b = pts[pts.length - 1]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const nx = (b[1] - a[1]) / len
  const ny = -(b[0] - a[0]) / len
  const m = pts[Math.floor(pts.length / 2)]
  const edge = smooth(pts)
  const off = (k) => pts.map(([x, y]) => [x + nx * k, y + ny * k])
  return {
    defs: (
      <>
        <linearGradient id={`caravan-${id}-s`} gradientUnits="userSpaceOnUse" x1={f(m[0])} y1={f(m[1])} x2={f(m[0] + nx * shadow)} y2={f(m[1] + ny * shadow)}>
          <stop offset="0" stopColor={dark} stopOpacity={so} />
          <stop offset=".3" stopColor={dark} stopOpacity={so * 0.62} />
          <stop offset=".62" stopColor={bounce} stopOpacity={so * 0.28} />
          <stop offset="1" stopColor={bounce} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`caravan-${id}-g`} gradientUnits="userSpaceOnUse" x1={f(m[0])} y1={f(m[1])} x2={f(m[0] - nx * glow)} y2={f(m[1] - ny * glow)}>
          <stop offset="0" stopColor={lite} stopOpacity={go} />
          <stop offset="1" stopColor={lite} stopOpacity="0" />
        </linearGradient>
      </>
    ),
    shapes: (
      <>
        <path d={`${edge} ${smooth(off(-glow).reverse(), 'L')} Z`} fill={`url(#caravan-${id}-g)`} />
        <path d={`${edge} ${smooth(off(shadow).reverse(), 'L')} Z`} fill={`url(#caravan-${id}-s)`} />
        <path d={edge} stroke={lite} strokeWidth={rim} fill="none" opacity=".9" strokeLinecap="round" />
      </>
    ),
  }
}

// Sand streaming off a crest: two comet-shaped veils leaving in turn plus a
// few loose grains, all blown to the right (the wind's direction everywhere).
function stream(key, x, y, { len = 70, rise = 8, dx = 60, dy = -10, dur = 4.2, grains = 2, grad, grain = '#fff3dc' }) {
  const r = rng(key * 7 + 3)
  const d = `M ${f(x)} ${f(y - 0.5)} C ${f(x + len * 0.3)} ${f(y - rise - 1.6)}, ${f(x + len * 0.7)} ${f(y - rise * 1.25 - 1)}, ${f(x + len)} ${f(y - rise * 0.9)} C ${f(x + len * 0.72)} ${f(y - rise * 0.85 + 2.6)}, ${f(x + len * 0.3)} ${f(y - rise * 0.2 + 2)}, ${f(x)} ${f(y + 1)} Z`
  const style = (k) => ({ '--dx': `${f(dx)}px`, '--dy': `${f(dy)}px`, animationDuration: `${f(dur)}s`, animationDelay: `${f(-k * dur * 0.5 - r() * 0.4)}s` })
  return (
    <g key={key}>
      <path className="caravan-plume" d={d} fill={`url(#${grad})`} style={style(0)} />
      <path className="caravan-plume" d={d} fill={`url(#${grad})`} style={style(1)} />
      {Array.from({ length: grains }, (_, i) => (
        <ellipse
          key={i}
          className="caravan-wisp"
          cx={f(x + 4 + r() * 10)}
          cy={f(y - 2 - r() * 3)}
          rx={s2(1.3 + r() * 1.4)}
          ry={s2(0.8 + r() * 0.4)}
          fill={grain}
          style={{
            '--dx': `${f(dx * (1.4 + r() * 0.8))}px`,
            '--dy': `${f(dy * (1 + r() * 1.2))}px`,
            animationDuration: `${f(dur * (0.7 + r() * 0.4))}s`,
            animationDelay: `${f(-r() * dur)}s`,
          }}
        />
      ))}
    </g>
  )
}

/* ---------- sky ---------- */

// High cirrus: a few long tapered strands with hooked "mares' tail" ends.
function cirrus(seed, x, y, len, s, op, drift, dur) {
  const r = rng(seed)
  const n = 4 + Math.floor(r() * 3)
  const strands = []
  for (let i = 0; i < n; i++) {
    const sx = x + (r() - 0.3) * len * 0.4
    const sy = y + i * 7 * s + (r() - 0.5) * 5
    const L = len * (0.4 + r() * 0.6)
    const t = (2.2 + r() * 3.6) * s
    const bend = (r() - 0.25) * 12 * s
    const ex = sx + L
    const ey = sy - bend * 0.6
    const mx = sx + L * 0.5
    const my = sy - bend
    strands.push(`M ${f(sx)} ${f(sy)} Q ${f(mx)} ${f(my - t)}, ${f(ex)} ${f(ey)} Q ${f(mx)} ${f(my + t)}, ${f(sx)} ${f(sy)} Z`)
    if (r() < 0.5) {
      const hx = sx + L * (0.7 + r() * 0.2)
      const hy = sy - bend * 0.7
      strands.push(
        `M ${f(hx)} ${f(hy)} Q ${f(hx + 16 * s)} ${f(hy - 3 * s)}, ${f(hx + 24 * s)} ${f(hy - 15 * s)} Q ${f(hx + 13 * s)} ${f(hy - 1 * s)}, ${f(hx - 4 * s)} ${f(hy + 2 * s)} Z`,
      )
    }
  }
  return (
    <g key={seed} opacity={op}>
      <g className="caravan-cirrus" style={{ '--drift': `${drift}px`, animationDuration: `${dur}s`, animationDelay: `${f(-r() * dur)}s` }}>
        {strands.map((d, i) => (
          <path key={i} d={d} fill="url(#caravan-cirrus-g)" />
        ))}
      </g>
    </g>
  )
}

const skyPlate = (
  <>
    <div className="caravan-sun" style={{ left: '24%', top: '38%', width: '48%' }}>
      <span className="caravan-sun-rays" />
      <span className="caravan-sun-halo" />
      <span className="caravan-sun-core" />
    </div>
    <Svg>
      <defs>
        <linearGradient id="caravan-cirrus-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fffaf0" stopOpacity="0" />
          <stop offset=".3" stopColor="#fffcf4" stopOpacity="1" />
          <stop offset=".75" stopColor="#fff8ec" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff6e6" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="caravan-skyglow">
          <stop offset="0" stopColor="#fff6dc" stopOpacity=".9" />
          <stop offset=".5" stopColor="#ffeac4" stopOpacity=".45" />
          <stop offset="1" stopColor="#ffe2b4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="380" cy="575" rx="900" ry="190" fill="url(#caravan-skyglow)" />
      {cirrus(3, 20, 84, 480, 1.4, 0.95, 70, 130)}
      {cirrus(7, 900, 64, 500, 1.3, 0.9, -60, 150)}
      {cirrus(11, 1030, 250, 340, 0.95, 0.7, 50, 110)}
      {cirrus(13, 60, 232, 280, 0.85, 0.55, -45, 120)}
      {cirrus(17, 560, 30, 380, 0.9, 0.6, 55, 160)}
    </Svg>
  </>
)

/* ---------- vultures ---------- */

// Soaring vulture seen from below: broad wings with five slotted primaries,
// a pale wing lining, short fanned tail and small bare head. Heading is -y.
const WING =
  'M -2 -2.5 C -9 -5.5, -19 -6.8, -26 -5.6 L -37 -4 L -27.6 -2 L -38.6 -0.4 L -28 0.9 L -38.2 3 L -27.6 3.6 L -36 6.4 L -26.2 5.9 L -32.4 9.2 L -23.6 7.8 C -17 10.6, -9 10.2, -2 6.6 Z'
const LINING = 'M -2 -2.5 C -9 -5.5, -19 -6.8, -26 -5.6 L -26.6 -1.2 C -18 0.6, -9 1.6, -2 2.2 Z'
const TAIL = 'M -2.8 4 L -4.8 15 Q 0 17.6 4.8 15 L 2.8 4 Z'

function vulture({ x, y, r, tilt, s, dur, ccw, delay, o, flap, bank }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1 ${tilt})`} opacity={o}>
      <g className="caravan-orbit" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s`, animationDirection: ccw ? 'reverse' : 'normal' }}>
        <g transform={`translate(${r} 0) rotate(${ccw ? 0 : 180}) scale(${s})`}>
          <g className="caravan-bank" style={{ animationDuration: `${bank}s`, animationDelay: `${f(delay * 0.7)}s` }}>
            <g className="caravan-flap" style={{ animationDuration: `${flap}s`, animationDelay: `${f(delay * 1.3)}s` }}>
              <path d={WING} fill="#3b2516" />
              <path d={LINING} fill="#76563a" />
              <g transform="scale(-1 1)">
                <path d={WING} fill="#3b2516" />
                <path d={LINING} fill="#76563a" />
              </g>
              <path d={TAIL} fill="#3b2516" />
              <ellipse cx="0" cy="2" rx="3.6" ry="8.4" fill="#2f1d10" />
              <ellipse cx="0" cy="-7.6" rx="2.1" ry="2.9" fill="#a3826a" />
            </g>
          </g>
        </g>
      </g>
    </g>
  )
}

const vultures = (
  <Svg>
    {vulture({ x: 1120, y: 196, r: 78, tilt: 0.68, s: 1.15, dur: 27, delay: -4, o: 0.92, flap: 11, bank: 6.5 })}
    {vulture({ x: 1268, y: 118, r: 50, tilt: 0.62, s: 0.8, dur: 21, ccw: true, delay: -13, o: 0.72, flap: 13.5, bank: 5.2 })}
    {vulture({ x: 330, y: 244, r: 70, tilt: 0.66, s: 1, dur: 24, ccw: true, delay: -9, o: 0.82, flap: 9.5, bank: 7.1 })}
    {vulture({ x: 970, y: 104, r: 36, tilt: 0.6, s: 0.46, dur: 18, delay: -6, o: 0.5, flap: 12.5, bank: 4.6 })}
  </Svg>
)

/* ---------- mesas ---------- */

// Flat-topped mesas and buttes with a stair-step profile: caprock cliff, a
// sloping bench, a lower cliff, then a talus apron. A sunlit west end, a shaded
// east face, sunlit bench tops and erosion gullies give them form. Strata are
// drawn range-wide (see strata()) so the same rock layers line up from mesa
// to mesa.
function mesas(seed, specs, base) {
  const r = rng(seed)
  const o = { sil: '', cliff: '', talus: '', lit: '', side: '', cap: '', rim: '', bench: '', gully: '', fan: '' }
  for (const [xl, cl, cr, xr, top, taper = 5] of specs) {
    const h = base - top
    const cb = top + h * (0.5 + r() * 0.1)
    const ch = cb - top
    const capH = 3.5 + r() * 2.5
    const c1 = ch * (0.3 + r() * 0.15)
    const s1 = ch * (0.1 + r() * 0.08)
    const b1 = 5 + r() * 8
    const c1r = ch * (0.28 + r() * 0.2)
    const b1r = 5 + r() * 8
    const sw = Math.min(40, (cr - cl) * 0.24)
    const lw = Math.min(18, (cr - cl) * 0.14)
    const L0 = cl - 2 - b1 - taper
    const R0 = cr + 2 + b1r + taper
    let edge = ''
    const n = Math.max(1, Math.round((cr - cl) / 40))
    for (let i = 1; i < n; i++) edge += ` L ${f(cl + ((i + (r() - 0.5) * 0.5) / n) * (cr - cl))} ${f(top + (r() - 0.4) * 2.2)}`
    // left profile, bottom to top: lower cliff, bench, caprock cliff, cap lip
    const leftCliff = `L ${f(L0)} ${f(cb)} L ${f(cl - 1 - b1 + (r() - 0.5) * 2)} ${f(top + c1 + s1 + (cb - top - c1 - s1) * 0.4)} L ${f(cl - 1 - b1)} ${f(top + c1 + s1)} L ${f(cl - 1)} ${f(top + c1)} L ${f(cl + 0.5)} ${f(top + capH)} L ${f(cl - 2)} ${f(top + capH - 1.2)} L ${f(cl - 1)} ${f(top)}`
    const rightCliff = `L ${f(cr + 1)} ${f(top)} L ${f(cr + 2)} ${f(top + capH - 1.2)} L ${f(cr - 0.5)} ${f(top + capH)} L ${f(cr + 1)} ${f(top + c1r)} L ${f(cr + 1 + b1r)} ${f(top + c1r + s1)} L ${f(cr + 1 + b1r + (r() - 0.5) * 2)} ${f(top + c1r + s1 + (cb - top - c1r - s1) * 0.5)} L ${f(R0)} ${f(cb)}`
    const leftTalus = `M ${f(xl)} ${f(base)} Q ${f(xl + (L0 - xl) * 0.55)} ${f(base - 4)}, ${f(L0)} ${f(cb)}`
    const rightTalus = `Q ${f(R0 + (xr - R0) * 0.45)} ${f(base - 4)}, ${f(xr)} ${f(base)}`
    o.sil += ` ${leftTalus} ${leftCliff}${edge} ${rightCliff} ${rightTalus} Z`
    o.cliff += ` M ${f(L0)} ${f(cb)} ${leftCliff}${edge} ${rightCliff} Z`
    o.talus += ` ${leftTalus} L ${f(R0)} ${f(cb)} ${rightTalus} Z`
    // benches: the sloping shelf between the two cliffs catches the sun
    const by = top + Math.min(c1, c1r)
    o.bench += ` M ${f(cl - 1)} ${f(top + c1)} L ${f(cr + 1)} ${f(top + c1r)} L ${f(cr + 1 + b1r)} ${f(top + c1r + s1)} L ${f(cl - 1 - b1)} ${f(top + c1 + s1)} Z`
    o.lit += ` M ${f(L0)} ${f(cb)} ${leftCliff} L ${f(cl + lw)} ${f(top)} L ${f(cl + lw - b1 * 0.6)} ${f(by + s1)} L ${f(L0 + lw)} ${f(cb)} Q ${f(L0 + lw - 4)} ${f(cb + (base - cb) * 0.5)}, ${f(xl + (L0 - xl) * 0.4)} ${f(base)} L ${f(xl)} ${f(base)} Q ${f(xl + (L0 - xl) * 0.55)} ${f(base - 4)}, ${f(L0)} ${f(cb)} Z`
    o.side += ` M ${f(cr - sw)} ${f(top)} ${rightCliff} ${rightTalus} L ${f(R0 - sw * 0.3)} ${f(base)} Q ${f(R0 - sw * 0.9)} ${f(cb + (base - cb) * 0.45)}, ${f(R0 - sw)} ${f(cb)} L ${f(cr - sw + b1r * 0.6)} ${f(top + c1r + s1)} L ${f(cr - sw)} ${f(top + c1r)} Z`
    o.cap += ` M ${f(cl - 2)} ${f(top)} L ${f(cr + 1)} ${f(top)} L ${f(cr + 1.5)} ${f(top + capH)} L ${f(cl - 0.5)} ${f(top + capH)} Z`
    o.rim += ` M ${f(cl - 1)} ${f(top + 0.6)} L ${f(cr - sw)} ${f(top + 0.6)}`
    // erosion gullies down the lower cliff, fanning debris on the talus
    const g = Math.max(1, Math.round((cr - cl - sw - lw) / 50))
    for (let i = 0; i < g; i++) {
      const gx = cl + lw + 6 + ((i + 0.2 + r() * 0.6) / g) * (cr - cl - sw - lw - 12)
      const w2 = 2 + r() * 3.5
      const gy = top + c1 + s1 + 1
      o.gully += ` M ${f(gx)} ${f(gy)} L ${f(gx + 2)} ${f(gy)} L ${f(gx + w2 + 1)} ${f(cb)} L ${f(gx - w2)} ${f(cb)} Z`
      o.fan += ` M ${f(gx)} ${f(cb + 2)} L ${f(gx + (gx - (cl + cr) / 2) * 0.25 + (r() - 0.5) * 8)} ${f(base - 2)}`
    }
  }
  return o
}

// Range-wide rock layers: alternating pale and rusty bands of varying
// thickness with a slight wobble, later clipped to the cliff faces.
function strata(seed, y0, y1) {
  const r = rng(seed)
  let lite = ''
  let dark = ''
  let y = y0
  let k = 0
  while (y < y1) {
    const h = 2.5 + r() * 8
    const ph = r() * 6
    const band = `${trace((x) => y + 1.3 * Math.sin(x / 80 + ph), -PAD, W + PAD, 'M', 40)} ${trace((x) => y + h + 1.1 * Math.sin(x / 80 + ph + 0.4), W + PAD, -PAD, 'L', 40)} Z`
    if (k % 2) dark += ` ${band}`
    else lite += ` ${band}`
    y += h + 1.5 + r() * 5
    k++
  }
  return { lite, dark }
}

const FAR_BASE = 598
const NEAR_BASE = 607
const farM = mesas(5, [[-90, -40, 214, 266, 500, 4], [404, 456, 706, 758, 486, 4], [948, 994, 1170, 1216, 494, 4], [1366, 1410, 1640, 1690, 500, 4]], FAR_BASE)
const nearM = mesas(9, [[-270, -196, 120, 200, 452, 6], [222, 276, 350, 412, 444, 9], [672, 734, 962, 1034, 506, 6], [1164, 1226, 1450, 1532, 468, 7]], NEAR_BASE)
const farS = strata(6, 488, FAR_BASE)
const nearS = strata(10, 430, NEAR_BASE)

function mesaRange({ m, s, clip, c }) {
  return (
    <>
      <path d={m.sil} fill={c.sil} />
      <path d={m.talus} fill={c.talus} />
      <g clipPath={`url(#${clip})`}>
        <path d={s.lite} fill={c.bandL} opacity=".42" />
        <path d={s.dark} fill={c.bandD} opacity=".3" />
      </g>
      <path d={m.bench} fill={c.talus} />
      <path d={m.lit} fill={c.lit} opacity=".9" />
      <path d={m.gully} fill={c.gully} opacity=".5" />
      <path d={m.fan} stroke={c.gully} strokeWidth="2.6" fill="none" opacity=".3" strokeLinecap="round" />
      <path d={m.side} fill={c.side} />
      <path d={m.cap} fill={c.cap} />
      <path d={m.rim} stroke={c.rim} strokeWidth="1.6" fill="none" />
    </>
  )
}

// a tiny umbrella acacia on the horizon, for scale
const acacia = (x, y, s, c) => (
  <g key={x}>
    <path d={`M ${x} ${y} L ${f(x + 0.6 * s)} ${f(y - 5 * s)} L ${f(x - 2.4 * s)} ${f(y - 8 * s)} M ${f(x + 0.6 * s)} ${f(y - 5 * s)} L ${f(x + 3 * s)} ${f(y - 8.4 * s)}`} stroke={c} strokeWidth={f(1.1 * s)} fill="none" />
    <path d={`M ${f(x - 9 * s)} ${f(y - 8 * s)} Q ${f(x - 5 * s)} ${f(y - 12 * s)}, ${f(x)} ${f(y - 11 * s)} Q ${f(x + 5 * s)} ${f(y - 13 * s)}, ${f(x + 10 * s)} ${f(y - 8.6 * s)} Q ${f(x)} ${f(y - 7 * s)}, ${f(x - 9 * s)} ${f(y - 8 * s)} Z`} fill={c} />
  </g>
)

const shimmer = [
  [604, 1.6, '90 30 40 60', 0.7],
  [609, 2.4, '50 40 120 30', 0.55],
  [614, 1.8, '130 50 30 40', 0.6],
  [619, 2.8, '40 30 70 50', 0.45],
  [600, 1.2, '70 60 30 40', 0.5],
].map(([y, w, dash, o], i) => (
  <path
    key={i}
    className="caravan-heat"
    d={trace((x) => y + 1.2 * Math.sin(x / 23 + i), -PAD, W + PAD, 'M', 24)}
    stroke="#fff8ea"
    strokeWidth={w}
    strokeDasharray={dash}
    strokeLinecap="round"
    fill="none"
    style={{ '--o': o, animationDuration: `${f(2.4 + i * 0.55)}s`, animationDelay: `${f(-i * 0.9)}s` }}
  />
))

const NEAR_C = { sil: '#e0aa84', talus: '#edc6a2', lit: '#f6d6b1', bandL: '#f7dcbc', bandD: '#c98f70', varnish: '#9a6450', gully: '#b07a64', side: '#c79689', cap: '#cb9574', rim: '#fde7c8' }
const FAR_C = { sil: '#e9cfb8', talus: '#f0dbc6', lit: '#f6e4d1', bandL: '#f6e5d2', bandD: '#d4b39e', varnish: '#c3a28f', gully: '#cdae9e', side: '#d8c0b7', cap: '#dcc0a8', rim: '#fff2e0' }

const mesaLayer = (
  <Svg>
    <defs>
      <clipPath id="caravan-far-clip">
        <path d={farM.cliff} />
      </clipPath>
      <clipPath id="caravan-near-clip">
        <path d={nearM.cliff} />
      </clipPath>
      <linearGradient id="caravan-haze-far" gradientUnits="userSpaceOnUse" x1="0" y1="440" x2="0" y2={FAR_BASE}>
        <stop offset="0" stopColor="#fbeedd" stopOpacity="0.15" />
        <stop offset=".6" stopColor="#fbeedd" stopOpacity=".45" />
        <stop offset="1" stopColor="#fdf1de" stopOpacity=".85" />
      </linearGradient>
      <linearGradient id="caravan-haze-near" gradientUnits="userSpaceOnUse" x1="0" y1="420" x2="0" y2={NEAR_BASE + 4}>
        <stop offset="0" stopColor="#fbe8cc" stopOpacity="0" />
        <stop offset=".55" stopColor="#fbe8cc" stopOpacity=".12" />
        <stop offset="1" stopColor="#fdeed8" stopOpacity=".78" />
      </linearGradient>
      <linearGradient id="caravan-plain-g" gradientUnits="userSpaceOnUse" x1="0" y1={FAR_BASE} x2="0" y2="700">
        <stop offset="0" stopColor="#fbe8c9" />
        <stop offset=".35" stopColor="#f6d8ab" />
        <stop offset="1" stopColor="#ecbf86" />
      </linearGradient>
      <linearGradient id="caravan-mirage-g" gradientUnits="userSpaceOnUse" x1="0" y1={NEAR_BASE} x2="0" y2={NEAR_BASE + 22}>
        <stop offset="0" stopColor="#f4efe2" stopOpacity=".95" />
        <stop offset="1" stopColor="#f4efe2" stopOpacity="0" />
      </linearGradient>
      <clipPath id="caravan-mirage-clip">
        <rect x={-PAD} y={NEAR_BASE} width={W + 2 * PAD} height="24" />
      </clipPath>
    </defs>

    {mesaRange({ m: farM, s: farS, clip: 'caravan-far-clip', c: FAR_C })}
    <rect x={-PAD} y="430" width={W + 2 * PAD} height={FAR_BASE - 430} fill="url(#caravan-haze-far)" />

    <rect x={-PAD} y={FAR_BASE - 1} width={W + 2 * PAD} height={H - FAR_BASE + 1} fill="url(#caravan-plain-g)" />
    {acacia(566, 606, 1.1, '#c9a088')}
    {acacia(1096, 605, 0.9, '#d0aa92')}
    {acacia(1118, 606, 0.7, '#d0aa92')}

    {mesaRange({ m: nearM, s: nearS, clip: 'caravan-near-clip', c: NEAR_C })}
    <rect x={-PAD} y="420" width={W + 2 * PAD} height={NEAR_BASE - 416} fill="url(#caravan-haze-near)" />

    {/* mirage: the sky and the mesa feet, flipped and quivering on the hot plain */}
    <rect x={-PAD} y={NEAR_BASE} width={W + 2 * PAD} height="22" fill="url(#caravan-mirage-g)" />
    <g clipPath="url(#caravan-mirage-clip)" opacity=".5">
      <g transform={`translate(0 ${NEAR_BASE})`}>
        <g className="caravan-mirage">
          <path d={nearM.sil} transform={`scale(1 -0.42) translate(0 ${-NEAR_BASE})`} fill="#e4bf9f" />
        </g>
      </g>
    </g>
    {shimmer}
  </Svg>
)

/* ---------- caravan crest ---------- */

// The crest the caravan walks. caravan-walk in caravan.css samples this same
// curve, so hooves stay on the sand.
const crestY = (x) => 638 - 17 * Math.sin((Math.PI * (x + 200)) / 1700) - 4 * Math.sin((2 * Math.PI * (x + 90)) / 760)
const HORN = 905 // the biggest spur leaves the crest here and sweeps toward us
const spurAt = (x0, steps) => steps.map(([dx, dy]) => [x0 + dx, crestY(x0) + dy])
const crestSpurs = [
  spur('cs1', spurAt(HORN, [[0, 0], [24, 22], [68, 60], [132, 110], [212, 170], [296, 240]]), { shadow: 200, glow: 54, dark: '#a8602f', so: 0.78 }),
  spur('cs2', spurAt(560, [[0, 0], [18, 20], [52, 52], [100, 92], [160, 140], [230, 200], [300, 270]]), { shadow: 140, glow: 42, dark: '#ad6531', so: 0.62 }),
  spur('cs3', spurAt(150, [[0, 0], [16, 18], [46, 46], [90, 84], [140, 124], [200, 180]]), { shadow: 120, glow: 36, dark: '#ad6531', so: 0.55 }),
]
const crestBody = `${trace(crestY, -PAD - 40, W + PAD + 40)} L ${W + PAD + 40} 940 L ${-PAD - 40} 940 Z`
const crestRip = ripples(21, crestY, { x0: -PAD, x1: W + PAD, n: 14, top: 8, gap: 7.5, grow: 0.5, amp: 1.5, wave: 26 })

/* ---------- camels ---------- */

const SPEED = 24 // viewBox units per second; matches caravan-walk (1560 units / 65 s)
const LEAD = 49.2 // seconds into the walk the leader is at t = 0 (x ≈ 330)
const STEP = 2.16 // camel stride period, matches caravan-hip etc.
const MAN_STEP = 1.66
const CALF_STEP = 1.34

// Camel drawn facing +x with hooves on y = 0; the Walker mirrors it so the
// train heads left, into the sun and the wind.
const BODY =
  'M -50 -82 C -46 -98, -30 -114, -8 -114 C 10 -114, 22 -102, 30 -92 C 34 -88, 40 -84, 44 -78 C 48 -70, 47 -60, 40 -55 C 34 -50, 24 -50, 16 -52 C 4 -54, -14 -54, -26 -56 C -36 -57, -44 -58, -50 -62 C -57 -68, -57 -78, -50 -82 Z'
const NECK =
  'M 26 -94 C 38 -92, 50 -84, 58 -80 C 64 -78, 68 -84, 71 -92 C 73 -98, 75 -104, 80 -106 C 86 -108, 94 -105, 99 -99 C 102 -95, 104 -91, 103 -88 C 102 -85, 99 -84, 96 -85 C 97 -82, 94 -80.5, 91 -81.5 C 86 -83, 82 -86, 78 -88 C 74 -86, 70 -76, 64 -68 C 58 -61, 50 -58, 44 -60 L 36 -72 Z'
const RIM = 'M -47 -88 C -42 -102, -28 -113, -8 -113 C 8 -113, 20 -103, 28 -93 M 30 -93 C 42 -91, 52 -84, 58 -80 M 80 -105.5 C 86 -107.5, 94 -104.5, 99 -99'
const ANATOMY = 'M -44 -78 C -37 -70, -31 -62, -29 -56 M 22 -96 C 25 -84, 27 -72, 31 -58'
const TAILP = 'M -1.5 -1 C -4 6, -5.5 16, -4.5 23 L -7 30 L -1.5 30 L -1.2 23 C -0.6 15, 0.6 7, 2.5 0 Z'

const FRONT_UP = 'M -7.5 -8 C -8 6, -5.5 22, -3.8 32 C -4.4 35.6, 4.4 35.6, 3.8 32 C 5 22, 7 6, 7 -8 Z'
const HIND_UP = 'M -10 -10 C -11 6, -7 22, -3.6 34 C -4.2 38, 4.6 38, 4 34 C 6 22, 9 6, 9 -10 Z'
const LOWER = 'M -2.8 0 L -2.4 21 C -3 24, -5 25.5, -5.8 28 L 9.4 28 C 8.6 25.5, 4.4 24, 2.8 21 L 3 0 Z'
const PAD_P = 'M -5.8 28 C -5.4 26.4, 8.8 26.4, 9.4 28 Z'

function leg({ x, y, front, delay, fill, knee }) {
  const kneeY = front ? 34 : 36
  const style = { animationDelay: `${s2(delay)}s` }
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="caravan-hip" style={style}>
        <path d={front ? FRONT_UP : HIND_UP} fill={fill} />
        <g transform={`translate(0 ${kneeY})`}>
          <g className={front ? 'caravan-knee-f' : 'caravan-knee-h'} style={style}>
            <path d={LOWER} fill={fill} />
            <path d={PAD_P} fill="#4e2f1a" />
          </g>
        </g>
        <ellipse cx="0.2" cy={kneeY} rx={front ? 4.6 : 4} ry={front ? 4.2 : 3.6} fill={knee} />
      </g>
    </g>
  )
}

function walker({ gap, shadow = 64, children }) {
  return (
    <g className="caravan-walker" style={{ animationDelay: `${s2(-(LEAD - gap / SPEED))}s` }}>
      <g transform="scale(-1 1)">
        <ellipse cx="-8" cy="1" rx={shadow} ry="3.4" fill="#9c5a2c" opacity=".3" />
        {children}
      </g>
    </g>
  )
}

const COATS = {
  a: { near: '#9c6236', far: '#6c4024', knee: '#93592f' },
  b: { near: '#875230', far: '#5c361e', knee: '#7d4a2a' },
  c: { near: '#b88252', far: '#86562f', knee: '#ad774a' },
}

// Rope from this camel's halter to the saddle of the camel ahead (200 units on).
const TETHER = 'M 96 -86 Q 122 -66, 146 -94'

function camel({ gap, phase, coat, children, tether = true }) {
  const c = COATS[coat]
  const d0 = -phase * STEP
  const d1 = d0 - STEP / 2
  const dl = (d) => ({ animationDelay: `${s2(d)}s` })
  return (
    walker({ gap, children: (<>
      <g className="caravan-bob" style={dl(d0)}>
        {leg({ x: 34, y: -62, front: true, delay: d1, fill: c.far, knee: c.far })}
        {leg({ x: -30, y: -64, delay: d1, fill: c.far, knee: c.far })}
        <g transform="translate(-54 -77)">
          <g className="caravan-tail" style={dl(d0 * 1.7)}>
            <path d={TAILP} fill={c.far} />
          </g>
        </g>
        {leg({ x: 30, y: -62, front: true, delay: d0, fill: c.near, knee: c.knee })}
        {leg({ x: -34, y: -64, delay: d0, fill: c.near, knee: c.knee })}
        <path d={BODY} fill={`url(#caravan-hide-${coat})`} />
        <path d={ANATOMY} stroke="#6a3c1e" strokeWidth="1.3" fill="none" opacity=".22" strokeLinecap="round" />
        <g transform="translate(40 -80)">
          <g className="caravan-nod" style={dl(d0 - 0.3)}>
            <g transform="translate(-40 80)">
              {tether && <path d={TETHER} stroke="#5a3218" strokeWidth="1.2" fill="none" opacity=".8" />}
              <path d={NECK} fill={`url(#caravan-hide-${coat})`} />
              <path d={RIM} stroke="#f6d39a" strokeWidth="1.8" fill="none" opacity=".75" strokeLinecap="round" />
              <path d="M 79 -104.5 L 74.5 -110.5 L 82.5 -106.5 Z" fill={c.far} />
              <path d="M 86 -102.6 Q 89 -104.2 92 -102.2" stroke="#3a2010" strokeWidth="1.3" fill="none" strokeLinecap="round" />
              <circle cx="89.2" cy="-100.4" r="1.3" fill="#2a170b" />
              <path d="M 100 -93.6 l 2.2 1" stroke="#3a2010" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M 93.5 -98.5 L 95.5 -84.5 M 82.5 -104 L 84 -88.5 M 82.5 -97 L 94 -92" stroke="#a8321e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M 84 -88 l -1.5 5 l 3 0 Z" fill="#d8a23a" />
            </g>
          </g>
        </g>
        {children}
      </g>
    </>) })
  )
}

// Swinging gear hung from a point on the saddle.
const swing = ({ x, y, delay, children }) => (
  <g transform={`translate(${x} ${y})`}>
    <g className="caravan-swing" style={{ animationDelay: `${s2(delay)}s` }}>{children}</g>
  </g>
)

const fringe = (x0, x1, y, c) => {
  let d = ''
  for (let x = x0; x <= x1; x += 3.2) d += ` M ${f(x)} ${y} l -0.6 4.2`
  return <path d={d} stroke={c} strokeWidth="1.3" strokeLinecap="round" />
}

function blanket({ base, band, band2, edge }) {
  return (
    <>
      <path d="M -43 -94 C -37 -111, -22 -119.5, -6 -119.5 C 10 -119.5, 21 -111, 28 -98 L 30 -79 L -45 -79 Z" fill={base} />
      <path d="M -44.6 -85 L 29.6 -85" stroke={band} strokeWidth="2.6" />
      <path d="M -44.2 -89.5 L 29.2 -89.5 M -44.8 -81.6 L 29.8 -81.6" stroke={band2} strokeWidth="1.3" />
      {fringe(-44, 29, -79, edge)}
    </>
  )
}

function packCarpets({ delay }) {
  return (
    <>
      {blanket({ base: '#8e2f20', band: '#e0a43c', band2: '#2b3a62', edge: '#e8b450' })}
      {/* tent poles lashed along the load */}
      <path d="M -58 -128 L 30 -140" stroke="#6b4422" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="-40" y="-135" width="60" height="16" rx="8" fill="#b4452a" />
      <path d="M -30 -135 v 16 M -20 -135 v 16 M 0 -135 v 16 M 10 -135 v 16" stroke="#e7ad4a" strokeWidth="2.2" />
      <path d="M -25 -135 v 16 M 5 -135 v 16" stroke="#2b3a62" strokeWidth="1.6" />
      <rect x="-30" y="-148" width="42" height="13" rx="6.5" fill="#e3c48f" />
      <path d="M -22 -148 v 13 M 4 -148 v 13" stroke="#b88a52" strokeWidth="1.4" />
      <path d="M -38 -127 C -40 -116, -40 -104, -36 -96 M 14 -127 C 18 -116, 20 -106, 18 -98" stroke="#5a3a1c" strokeWidth="1.3" fill="none" />
      {/* sack slung on the near side */}
      <path d="M -26 -119 C -32 -112, -33 -96, -27 -88 C -20 -82, -6 -82, -1 -89 C 3 -97, 1 -112, -5 -119 Z" fill="#d9bd8e" />
      <path d="M -24 -113 C -26 -104, -24 -94, -19 -89" stroke="#b5945f" strokeWidth="1.6" fill="none" />
      {swing({ x: 16, y: -100, delay, children: (<>
        <path d="M -1 0 L 1 0 L 1.6 4 C 8.5 6, 10.5 18, 4.5 24.5 C -1.5 29, -9.5 25, -9.5 16.5 C -9.5 9, -4.5 5, -1.6 4 Z" fill="#5d3a20" />
        <path d="M 4 9 C 6.5 12, 6.5 17, 4 21" stroke="#8a5a32" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M -1 0 L 1 0 L 1.6 4 L -1.6 4 Z" fill="#3a2414" />
      </>) })}
    </>
  )
}

function packSacks({ delay }) {
  return (
    <>
      {blanket({ base: '#2c3c66', band: '#d8a23a', band2: '#b54a2a', edge: '#d8a23a' })}
      {/* firewood bundle across the top */}
      <path d="M -50 -138 L 26 -128 M -48 -134 L 28 -132 M -46 -141 L 24 -125" stroke="#7a5230" strokeWidth="3" strokeLinecap="round" />
      <path d="M -26 -142 v 18 M 6 -138 v 16" stroke="#4a2c14" strokeWidth="1.4" />
      <path d="M -36 -121 C -40 -112, -38 -98, -32 -92 C -24 -86, -10 -88, -6 -96 C -3 -104, -6 -116, -12 -122 Z" fill="#e7d3ad" />
      <path d="M -2 -121 C -6 -112, -4 -98, 2 -93 C 9 -88, 20 -91, 23 -99 C 25 -107, 21 -117, 15 -122 Z" fill="#d3b583" />
      <path d="M -31 -113 C -33 -105, -31 -97, -26 -93 M 3 -113 C 1 -106, 3 -99, 8 -95" stroke="#b39466" strokeWidth="1.5" fill="none" />
      {swing({ x: -40, y: -98, delay, children: (<>
        <path d="M -1 0 L 1 0 L 1 3 C 6 4, 8 9, 7.5 14 C 7 19, 3 22, 0 22 C -3 22, -7 19, -7.5 14 C -8 9, -6 4, -1 3 Z" fill="#b8572c" />
        <path d="M -4.5 8 C -5.5 11, -5.5 15, -4 18" stroke="#e08a52" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M -3 2.5 L 3 2.5 L 2.5 4.5 L -2.5 4.5 Z" fill="#7c3418" />
      </>) })}
    </>
  )
}

// Seated rider in a Tuareg saddle (cross pommel), reins in hand, robe hem and
// veil tail streaming downwind.
function rider({ delay, robe, robeShade, wrap, tail, skin = '#8a5634' }) {
  const dl = (d) => ({ animationDelay: `${s2(d)}s` })
  return (
    <>
      <path d="M -36 -102 C -32 -116, -20 -122, -6 -122 C 8 -122, 18 -114, 22 -104 L 23 -86 L -38 -86 Z" fill={robe === '#2f4c7c' ? '#d6c3a0' : '#2f4c7c'} />
      <path d="M -38.5 -90 L 23.5 -90" stroke="#c0532a" strokeWidth="2.4" />
      {fringe(-37, 22, -86, '#c0532a')}
      {/* saddle: cantle behind, cross pommel in front */}
      <path d="M -24 -120 C -27 -126, -29 -132, -28 -137 L -24 -136 C -23 -131, -21 -125, -18 -121 Z" fill="#7a4a24" />
      <path d="M 10 -121 L 14 -136 M 9.5 -133 L 18.5 -133.5 M 14 -136 L 14.2 -139.5" stroke="#7a4a24" strokeWidth="2.6" strokeLinecap="round" />
      {/* legs forward onto the neck */}
      <path d="M -18 -121 C -8 -118, 6 -116, 14 -114 C 22 -108, 28 -101, 32 -96 L 36 -95 L 34 -92 L 27 -93 C 20 -99, 8 -103, -14 -106 Z" fill={robeShade} />
      <g transform="translate(-6 -121)">
        <g className="caravan-rock" style={dl(delay)}>
          <g transform="translate(6 121)">
            {/* robe hem flapping downwind */}
            <g transform="translate(-16 -108)">
              <g className="caravan-hem" style={dl(delay * 1.3)}>
                <path d="M 0 0 L 18 2 C 16 8, 10 15, 2 19 L -6 16 C -4 10, -2 5, 0 0 Z" fill={robeShade} />
              </g>
            </g>
            <path d="M -18 -120 C -18 -133, -14 -146, -6 -150 L 2 -150 C 7 -146, 9 -134, 8 -120 Z" fill={robe} />
            <path d="M -18 -120 C -18 -133, -14 -146, -6 -150 L -3 -150 C -8 -142, -10 -132, -10 -120 Z" fill={robeShade} />
            {/* veil tail */}
            <g transform="translate(-9 -159)">
              <g className="caravan-scarf1" style={dl(delay * 0.7)}>
                <path d="M 1 -3 C -5 -3.2, -11 -2.4, -17 -0.6 L -16.4 3.6 C -11 2.6, -5 3, 1 3.2 Z" fill={tail} />
                <g transform="translate(-16.5 1.5)">
                  <g className="caravan-scarf2" style={dl(delay * 0.7 - 0.28)}>
                    <path d="M 0.5 -2.2 C -6 -1.6, -12 0.4, -19 3.4 L -14 2.4 L -18 6.2 C -11 3.8, -5 3, 0.5 2.4 Z" fill={tail} />
                  </g>
                </g>
              </g>
            </g>
            <path d="M -11 -153 C -12 -163, -4 -168, 2 -166 C 7 -164, 8 -157, 5 -151 L -8 -149 Z" fill={wrap} />
            <path d="M -0.5 -159.4 L 6.6 -158.6 L 6.4 -156.4 L -0.5 -157 Z" fill={skin} />
            {/* arm and reins */}
            <path d="M -2 -147 C 5 -142, 11 -134, 15 -126 L 11 -124 C 7 -131, 1 -137, -5 -142 Z" fill={robe} />
            <circle cx="14" cy="-125" r="2.4" fill={skin} />
            <path d="M 15 -125 Q 50 -112, 84 -97" stroke="#5a3218" strokeWidth="1" fill="none" />
          </g>
        </g>
      </g>
    </>
  )
}

// The guide walking ahead on foot with a staff, leading the first camel.
function leader({ gap }) {
  const dl = (d) => ({ animationDelay: `${s2(d)}s` })
  const d0 = -0.4
  const legP = 'M -2.6 0 L -2.3 34 L -3.4 38 L 7.6 38 L 7 36 L 2.4 34.5 L 2.6 0 Z'
  return (
    walker({ gap, shadow: 20, children: (<>
      <g className="caravan-bob-man" style={dl(d0)}>
        <path d="M 19 1 L 9 -88" stroke="#5e3b1e" strokeWidth="2.4" strokeLinecap="round" />
        <g transform="translate(2 -38)">
          <g className="caravan-stride" style={dl(d0 - MAN_STEP / 2)}>
            <path d={legP} fill="#5c3720" />
          </g>
        </g>
        <g transform="translate(-1 -38)">
          <g className="caravan-stride" style={dl(d0)}>
            <path d={legP} fill="#7d4c2c" />
          </g>
        </g>
        <path d="M -7.5 -66 C -11.5 -52, -12.5 -40, -13.5 -30 L 12.5 -30 C 11.5 -42, 10 -54, 7.5 -66 Z" fill="#f2e9d8" />
        <path d="M -7.5 -66 C -11.5 -52, -12.5 -40, -13.5 -30 L -6 -30 C -6 -44, -4 -56, -2 -66 Z" fill="#d2c1a4" />
        <g transform="translate(0 -31)">
          <g className="caravan-hem" style={dl(-0.5)}>
            <path d="M -13.6 0 C -14.6 6, -15.6 11, -16.6 15.5 L 14.6 16.5 C 13.6 11, 12.8 6, 12.6 0 Z" fill="#ece1cc" />
            <path d="M -13.6 0 C -14.6 6, -15.6 11, -16.6 15.5 L -8 16 C -7 11, -6.5 6, -6 0 Z" fill="#cdbb9c" />
          </g>
        </g>
        <path d="M -11 -47 L 11 -47 L 11.2 -43 L -11.4 -43 Z" fill="#2f4c7c" />
        <path d="M 2 -63 C 8 -58, 11 -54, 12 -52 L 9 -50 C 7 -53, 3 -57, -1 -60 Z" fill="#e6dac3" />
        <circle cx="11" cy="-51" r="2.1" fill="#7d4c2c" />
        <path d="M -3 -63 C -7 -56, -10 -50, -12 -45 L -9 -43.5 C -7 -48, -4 -54, 0 -60 Z" fill="#e6dac3" />
        <circle cx="-11" cy="-44" r="2.1" fill="#7d4c2c" />
        <path d="M -11 -44 Q -22 -48, -38 -86" stroke="#5a3218" strokeWidth="1.2" fill="none" />
        <g transform="translate(-6 -76)">
          <g className="caravan-scarf1" style={dl(-0.2)}>
            <path d="M 1 -2.6 C -5 -2.6, -10 -1.6, -15 0.4 L -14 3.6 C -9 2.6, -4 2.8, 1 3 Z" fill="#2f4c7c" />
          </g>
        </g>
        <circle cx="0.5" cy="-71.5" r="5.6" fill="#7d4c2c" />
        <path d="M -6.5 -72 C -7.5 -80, -2 -84, 3.5 -83 C 8 -82, 9 -76.5, 6.5 -72.5 C 4 -74.5, -3 -74.5, -6.5 -72 Z" fill="#2f4c7c" />
        <path d="M -5.5 -70 C -2 -68.5, 3 -68.5, 6 -70 L 5.5 -66.5 C 2 -64.5, -2 -64.5, -5 -66.5 Z" fill="#2f4c7c" />
      </g>
    </>) })
  )
}

// A calf trotting at the back, untethered: hip-swing legs only.
function calf({ gap }) {
  const c = COATS.c
  const dl = (d) => ({ animationDelay: `${s2(d)}s` })
  const leg = (x, y, front, delay, fill) => (
    <g transform={`translate(${x} ${y})`}>
      <g className="caravan-calf-leg" style={dl(delay)}>
        <path d={front ? FRONT_UP : HIND_UP} fill={fill} />
        <g transform={`translate(0 ${front ? 34 : 36})`}>
          <path d={LOWER} fill={fill} />
        </g>
      </g>
    </g>
  )
  const d0 = -0.5
  const d1 = d0 - CALF_STEP / 2
  return (
    walker({ gap, shadow: 38, children: (<>
      <g transform="scale(.6)">
        <g className="caravan-bob-calf" style={dl(d0)}>
          {leg(34, -62, true, d1, c.far)}
          {leg(-30, -64, false, d1, c.far)}
          {leg(30, -62, true, d0, c.near)}
          {leg(-34, -64, false, d0, c.near)}
          <path d="M -50 -80 C -46 -92, -30 -104, -8 -104 C 10 -104, 22 -96, 30 -90 C 34 -88, 40 -84, 44 -78 C 48 -70, 47 -60, 40 -55 C 34 -50, 24 -50, 16 -52 C 4 -54, -14 -54, -26 -56 C -36 -57, -44 -58, -50 -62 C -57 -68, -57 -76, -50 -80 Z" fill="url(#caravan-hide-c)" />
          <path d="M 26 -94 C 38 -92, 48 -86, 56 -84 C 62 -84, 68 -92, 72 -102 C 75 -108, 78 -112, 84 -113 C 90 -114, 98 -110, 101 -104 C 103 -100, 103 -96, 100 -95 C 96 -94, 90 -95, 84 -96 C 80 -94, 74 -84, 66 -74 C 60 -66, 52 -62, 44 -60 L 36 -72 Z" fill="url(#caravan-hide-c)" />
          <path d="M 82 -111 L 77 -118 L 86 -113 Z" fill={c.far} />
          <circle cx="91" cy="-107" r="1.8" fill="#2a170b" />
          <path d="M -47 -86 C -42 -96, -28 -103, -8 -103 C 8 -103, 20 -96, 28 -91 M 72 -102 C 76 -109, 80 -112, 86 -113" stroke="#f6d39a" strokeWidth="2.4" fill="none" opacity=".7" strokeLinecap="round" />
        </g>
      </g>
    </>) })
  )
}

const caravan = (
  <g>
    {calf({ gap: 890 })}
    {camel({ gap: 740, phase: 0.18, coat: 'b', children: (<>
      {packSacks({ delay: -0.2 })}
    </>) })}
    {camel({ gap: 540, phase: 0.71, coat: 'c', children: (<>
      {rider({ delay: -1.1, robe: '#f1e8d6', robeShade: '#cdbd9f', wrap: '#b8492a', tail: '#c4532c' })}
    </>) })}
    {camel({ gap: 340, phase: 0.37, coat: 'a', children: (<>
      {packCarpets({ delay: -0.9 })}
    </>) })}
    {camel({ gap: 140, phase: 0, coat: 'a', tether: false, children: (<>
      {rider({ delay: -0.3, robe: '#2f4c7c', robeShade: '#22385e', wrap: '#1f2f52', tail: '#2c4675' })}
    </>) })}
    {leader({ gap: 0 })}
  </g>
)

const hide = (id, top, mid, low) => (
  <linearGradient id={`caravan-hide-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="-116" x2="0" y2="-50">
    <stop offset="0" stopColor={top} />
    <stop offset=".45" stopColor={mid} />
    <stop offset="1" stopColor={low} />
  </linearGradient>
)

const crestLayer = (
  <Svg>
    <defs>
      <linearGradient id="caravan-crest-lit" gradientUnits="userSpaceOnUse" x1="0" y1="618" x2="0" y2="860">
        <stop offset="0" stopColor="#fbd79e" />
        <stop offset=".25" stopColor="#f4bf7c" />
        <stop offset="1" stopColor="#e39d58" />
      </linearGradient>
      <linearGradient id="caravan-plume-a" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff3dc" stopOpacity=".2" />
        <stop offset=".18" stopColor="#fff3dc" stopOpacity=".85" />
        <stop offset="1" stopColor="#fff3dc" stopOpacity="0" />
      </linearGradient>
      <clipPath id="caravan-crest-clip">
        <path d={crestBody} />
      </clipPath>
      {crestSpurs.map((sp, i) => (
        <g key={i}>{sp.defs}</g>
      ))}
      {hide('a', '#d8a066', '#a96f3e', '#7e4c29')}
      {hide('b', '#c48a55', '#93593a', '#6a3e22')}
      {hide('c', '#e4b47c', '#be895a', '#93613a')}
    </defs>
    <path d={crestBody} fill="url(#caravan-crest-lit)" />
    <g clipPath="url(#caravan-crest-clip)">
      <path d={crestRip.dark} stroke="#d0894a" strokeWidth="1.5" fill="none" opacity=".42" />
      <path d={crestRip.lite} stroke="#fff2d2" strokeWidth="1.2" fill="none" opacity=".5" />
      {crestSpurs.map((sp, i) => (
        <g key={i}>{sp.shapes}</g>
      ))}
    </g>
    <path d={trace(crestY, -PAD - 40, W + PAD + 40)} stroke="#fff1d2" strokeWidth="2.2" fill="none" opacity=".85" />
    {caravan}
    {stream(1, HORN, crestY(HORN), { len: 80, rise: 7, dx: 70, dy: -8, dur: 4.6, grad: 'caravan-plume-a' })}
    {stream(2, 470, crestY(470) + 1, { len: 54, rise: 5, dx: 50, dy: -6, dur: 3.9, grains: 1, grad: 'caravan-plume-a' })}
  </Svg>
)

/* ---------- oasis ---------- */

const POOL = { cx: 1152, cy: 806, rx: 186, ry: 27 }

// Pinnate palm frond along +x: a drooping rachis with leaflets hanging on both
// sides, as one serrated polygon.
function frondPath(len, rise, droop, wid, n) {
  const P = (t) => [len * t, -rise * t + (rise + droop) * t * t]
  const T = (t) => {
    const dx = len
    const dy = -rise + 2 * (rise + droop) * t
    const m = Math.hypot(dx, dy)
    return [dx / m, dy / m]
  }
  const up = []
  const dn = []
  for (let k = 0; k <= n; k++) {
    const t = 0.08 + (0.9 * k) / n
    const [px, py] = P(t)
    const [tx, ty] = T(t)
    const nx = ty
    const ny = -tx
    const taper = Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) ** 0.6
    const lu = wid * 0.6 * taper
    const ld = wid * taper
    up.push([px, py], [px + (tx * 0.8 + nx * 0.5) * lu, py + (ty * 0.8 + ny * 0.5) * lu + lu * 0.35])
    dn.push([px, py], [px + (tx * 0.55 - nx * 0.8) * ld, py + (ty * 0.55 - ny * 0.8) * ld + ld * 0.4])
  }
  const tip = P(1)
  let d = 'M 0 -1.5'
  for (const [x, y] of up) d += ` L ${f(x)} ${f(y)}`
  d += ` L ${f(tip[0])} ${f(tip[1])}`
  for (let i = dn.length - 1; i >= 0; i--) d += ` L ${f(dn[i][0])} ${f(dn[i][1])}`
  const rachis = `M 0 0 Q ${f(len * 0.5)} ${f(-rise * 0.5)}, ${f(tip[0])} ${f(tip[1])}`
  return { d: `${d} L 0 1.5 Z`, rachis }
}

// Palm: ringed, leaning trunk; back fronds (static, shaded) and front fronds
// that each sway on their own; hanging dates. The whole tree also bends.
function palm({ id, x, y, h, lean, w0, w1, size, fronds, back, dates = true, sway }) {
  const r = rng(id * 13 + 5)
  const cx = x + lean * 0.12
  const cy = y - h * 0.55
  const tx = x + lean
  const ty = y - h
  const pt = (t) => {
    const u = 1 - t
    return [u * u * x + 2 * u * t * cx + t * t * tx, u * u * y + 2 * u * t * cy + t * t * ty]
  }
  const L = []
  const Rr = []
  const rings = []
  const N = Math.round(h / 9)
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const [px, py] = pt(t)
    const w = w0 + (w1 - w0) * t + (t < 0.08 ? (0.08 - t) * 60 : 0)
    L.push(`${f(px - w)} ${f(py)}`)
    Rr.unshift(`${f(px + w)} ${f(py)}`)
    if (i > 0 && i < N) rings.push(`M ${f(px - w)} ${f(py)} Q ${f(px)} ${f(py + 3.2)} ${f(px + w)} ${f(py - 0.6)}`)
  }
  const trunk = `M ${L.join(' L ')} L ${Rr.join(' L ')} Z`
  const frond = (a, i, animated, shade) => {
    const left = Math.cos((a * Math.PI) / 180) < 0
    const ang = left ? 180 - a : a
    const lenK = size * (0.85 + r() * 0.3) * (a > 0 && a < 180 ? 0.92 : 1)
    const droop = lenK * (0.18 + 0.35 * Math.max(0, Math.cos((ang * Math.PI) / 180)))
    const p = frondPath(lenK, lenK * 0.12, droop, lenK * 0.19, 17)
    const body = (
      <>
        <path d={p.d} fill={shade} />
        <path d={p.rachis} stroke={animated ? '#c3c46a' : '#5d6426'} strokeWidth="1.3" fill="none" opacity=".7" />
      </>
    )
    return (
      <g key={i} transform={`translate(${f(tx)} ${f(ty)}) ${left ? 'scale(-1 1) ' : ''}rotate(${f(ang)})`}>
        {animated ? (
          <g className="caravan-frond" style={{ animationDuration: `${f(2.8 + r() * 2.6)}s`, animationDelay: `${f(-r() * 5)}s` }}>
            {body}
          </g>
        ) : (
          body
        )}
      </g>
    )
  }
  return (
    <g className="caravan-palm" style={{ transformOrigin: `${x}px ${y}px`, animationDuration: `${sway}s`, animationDelay: `${-id * 2.3}s` }}>
      <path d={trunk} fill="url(#caravan-trunk)" />
      <path d={rings.join(' ')} stroke="#4f3019" strokeWidth="1.6" fill="none" opacity=".55" />
      <path d={rings.join(' ')} stroke="#e2b47a" strokeWidth="1" fill="none" opacity=".35" transform="translate(-1.5 -2)" />
      {back.map((a, i) => frond(a, `b${i}`, false, i % 2 ? '#3f4a1c' : '#4b5722'))}
      <ellipse cx={f(tx)} cy={f(ty + 4)} rx={f(w1 + 7)} ry="7" fill="#5b4220" />
      {dates && (
        <g fill="#c4621f">
          {[-9, -3, 4, 9].map((o, i) => (
            <ellipse key={i} cx={f(tx + o)} cy={f(ty + 11 + Math.abs(o) * 0.3)} rx="3.2" ry="4.6" fill={i % 2 ? '#d98a2c' : '#b8551c'} />
          ))}
        </g>
      )}
      {fronds.map((a, i) => frond(a, `f${i}`, true, i % 3 === 0 ? '#93a03e' : i % 3 === 1 ? '#7b8a31' : '#a7b04c'))}
    </g>
  )
}

function bird({ x, y, delay, flip = false }) {
  return (
    <g transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      <path d="M -1 -5 L -1.6 0 M 2 -5 L 2.6 0" stroke="#4b3524" strokeWidth="1" strokeLinecap="round" />
      <path d="M -7 -9 C -7 -15, 3 -16.5, 7 -12.5 L 16 -10.6 L 15 -8.8 L 6 -6.6 C 2 -4.6, -4 -4.8, -7 -9 Z" fill="#8f6c4c" />
      <path d="M -6 -8 C -3 -5.6, 2 -5.4, 5 -6.8 C 1 -7.5, -3 -7.6, -6 -8 Z" fill="#d8bf98" />
      <path d="M -1 -12 C 3 -14, 8 -13, 11 -11 C 7 -11.4, 3 -11.2, -1 -10 Z" fill="#6a4a32" />
      <g transform="translate(-5 -12)">
        <g className="caravan-sip" style={{ animationDelay: `${delay}s` }}>
          <circle cx="-2.6" cy="-3.2" r="3.6" fill="#8f6c4c" />
          <path d="M -5.6 -3.6 L -9.6 -2.6 L -5.6 -1.8 Z" fill="#3a2616" />
          <circle cx="-3.4" cy="-4.2" r="0.8" fill="#1d120a" />
        </g>
      </g>
    </g>
  )
}

function dragonfly({ x, y, delay, dur, c }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="caravan-dart" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g className="caravan-buzz">
          <path d="M -1 -0.6 C -3 -6, -7 -11, -10 -12 C -9 -8, -5 -3, -1 0 Z M 1 -0.6 C 3 -6, 6 -11, 9 -12.5 C 8.4 -8, 5 -3, 1 0 Z" fill="#f4fbf8" stroke="#6f8f8c" strokeWidth=".5" opacity=".8" />
        </g>
        <path d="M -9 0 L 12 0.6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="-9.6" cy="0" r="2.1" fill={c} />
      </g>
    </g>
  )
}

const poolGlints = [
  [1040, 798, 3.1],
  [1118, 791, 4.3],
  [1190, 800, 2.7],
  [1252, 792, 3.7],
  [1086, 812, 5.1],
].map(([x, y, d], i) => (
  <path
    key={i}
    className="caravan-glint"
    d={`M ${x} ${y - 4} L ${x + 1} ${y - 1} L ${x + 5} ${y} L ${x + 1} ${y + 1} L ${x} ${y + 4} L ${x - 1} ${y + 1} L ${x - 5} ${y} L ${x - 1} ${y - 1} Z`}
    fill="#fffdf2"
    style={{ animationDuration: `${d}s`, animationDelay: `${f(-i * 1.37)}s` }}
  />
))

const reeds = (x, y, n, seed, cls) => {
  const r = rng(seed)
  let d = ''
  for (let i = 0; i < n; i++) {
    const bx = x + (i - n / 2) * 3.4 + (r() - 0.5) * 2
    const hh = 14 + r() * 20
    const lean = (r() - 0.5) * 16
    d += ` M ${f(bx - 1.6)} ${y} Q ${f(bx + lean * 0.3)} ${f(y - hh * 0.6)} ${f(bx + lean)} ${f(y - hh)} Q ${f(bx + lean * 0.2 + 1.4)} ${f(y - hh * 0.5)} ${f(bx + 1.6)} ${y} Z`
  }
  return (
    <path
      key={seed}
      className={cls}
      d={d}
      fill={seed % 2 ? '#6f7c2c' : '#56631f'}
      style={cls ? { transformOrigin: `${x}px ${y}px`, animationDelay: `${-seed * 0.7}s` } : undefined}
    />
  )
}

const oasisBank = smooth([[700, 950], [760, 872], [860, 818], [980, 786], [1100, 772], [1240, 764], [1400, 756], [1560, 750], [W + PAD + 40, 748]])
const bankY = (x) => 748 + 40 * gauss(x, 980, 260) + 8 * gauss(x, 1180, 200)
const bankRip = ripples(31, bankY, { x0: 1300, x1: W + PAD, n: 6, top: 14, gap: 9, grow: 1, amp: 1.6, wave: 38 })

const oasisLayer = (
  <Svg>
    <defs>
      <linearGradient id="caravan-bank" gradientUnits="userSpaceOnUse" x1="0" y1="745" x2="0" y2="880">
        <stop offset="0" stopColor="#f6c587" />
        <stop offset=".4" stopColor="#e9a964" />
        <stop offset="1" stopColor="#d48b4a" />
      </linearGradient>
      <linearGradient id="caravan-water" gradientUnits="userSpaceOnUse" x1="0" y1={POOL.cy - POOL.ry} x2="0" y2={POOL.cy + POOL.ry}>
        <stop offset="0" stopColor="#e3eee2" />
        <stop offset=".35" stopColor="#a9cfc8" />
        <stop offset="1" stopColor="#5e9a97" />
      </linearGradient>
      <linearGradient id="caravan-trunk" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#c99a62" />
        <stop offset=".45" stopColor="#8e5f37" />
        <stop offset="1" stopColor="#553419" />
      </linearGradient>
      <clipPath id="caravan-pool-clip">
        <ellipse cx={POOL.cx} cy={POOL.cy} rx={POOL.rx} ry={POOL.ry} />
      </clipPath>
    </defs>
    <path d={`${oasisBank} L ${W + PAD + 40} 950 Z`} fill="url(#caravan-bank)" />
    <path d={bankRip.dark} stroke="#d0904f" strokeWidth="1.5" fill="none" opacity=".45" />
    <path d={bankRip.lite} stroke="#fff0cc" strokeWidth="1.2" fill="none" opacity=".45" />
    {/* damp sand and grass rim */}
    <ellipse cx={POOL.cx} cy={POOL.cy + 3} rx={POOL.rx + 26} ry={POOL.ry + 10} fill="#c98c56" />
    <ellipse cx={POOL.cx} cy={POOL.cy + 1} rx={POOL.rx + 12} ry={POOL.ry + 5} fill="#a87445" />
    <path d={`M ${POOL.cx - POOL.rx - 14} ${POOL.cy - 2} Q ${POOL.cx} ${POOL.cy - POOL.ry - 22}, ${POOL.cx + POOL.rx + 14} ${POOL.cy - 3} L ${POOL.cx + POOL.rx} ${POOL.cy} Q ${POOL.cx} ${POOL.cy - POOL.ry - 8}, ${POOL.cx - POOL.rx} ${POOL.cy} Z`} fill="#6e7a2c" />
    <ellipse cx={POOL.cx} cy={POOL.cy} rx={POOL.rx} ry={POOL.ry} fill="url(#caravan-water)" />
    <g clipPath="url(#caravan-pool-clip)">
      {/* reflections of the palms, quivering */}
      <g className="caravan-reflect" style={{ transformOrigin: `${POOL.cx}px ${POOL.cy - POOL.ry}px` }}>
        <path d="M 1222 781 h 15 v 4 h -15 Z M 1224 788 h 14 v 3.4 h -14 Z M 1227 795 h 13 v 3 h -13 Z M 1229 802 h 12 v 2.6 h -12 Z M 1232 809 h 10 v 2.2 h -10 Z M 1234 816 h 9 v 1.8 h -9 Z" fill="#4a6650" opacity=".4" />
        <ellipse cx="1262" cy="822" rx="84" ry="9" fill="#4c6a3c" opacity=".28" />
        <ellipse cx="1004" cy="824" rx="50" ry="6" fill="#4c6a3c" opacity=".22" />
      </g>
      <path d="M 1000 796 L 1090 796 M 1140 801 L 1250 801 M 1040 812 L 1120 812 M 1196 816 L 1300 816 M 1100 824 L 1170 824" stroke="#f2f8ee" strokeWidth="1.6" opacity=".5" strokeLinecap="round" />
      <ellipse className="caravan-ring" cx="1316" cy="801" rx="9" ry="2.4" fill="none" stroke="#f4faf2" strokeWidth="1.2" style={{ animationDelay: '-2.1s' }} />
      <ellipse className="caravan-ring" cx="1306" cy="811" rx="9" ry="2.4" fill="none" stroke="#f4faf2" strokeWidth="1.2" style={{ animationDelay: '-5.6s' }} />
    </g>
    {poolGlints}
    {/* front lip of the pool */}
    <path d={`M ${POOL.cx - POOL.rx - 6} ${POOL.cy + 2} Q ${POOL.cx} ${POOL.cy + POOL.ry + 16}, ${POOL.cx + POOL.rx + 6} ${POOL.cy + 2} Q ${POOL.cx} ${POOL.cy + POOL.ry + 4}, ${POOL.cx - POOL.rx - 6} ${POOL.cy + 2} Z`} fill="#c4875a" opacity=".6" />
    {reeds(986, 806, 9, 1, 'caravan-reed')}
    {reeds(1080, 784, 6, 2)}
    {reeds(1120, 782, 8, 6)}
    {reeds(1300, 788, 7, 3)}
    {reeds(1200, 838, 8, 5, 'caravan-reed')}
    {reeds(1030, 834, 5, 4)}

    {palm({ id: 1, x: 962, y: 806, h: 256, lean: -40, w0: 7, w1: 5, size: 120, sway: 7.5, back: [-150, -120, -60, -25, 18, 160, 200], fronds: [-165, -132, -98, -70, -40, -10, 205] })}
    {palm({ id: 2, x: 1226, y: 782, h: 366, lean: 24, w0: 9.5, w1: 6, size: 150, sway: 9, back: [-160, -128, -88, -50, -18, 172, 8], fronds: [-176, -146, -112, -62, -30, 2, 30, 196] })}
    {palm({ id: 3, x: 1352, y: 800, h: 232, lean: 40, w0: 7, w1: 5, size: 112, sway: 6.6, dates: false, back: [-140, -70, -20, 20, 190], fronds: [-160, -118, -86, -48, -14, 200] })}
    {bird({ x: 1328, y: 806, delay: -2.1 })}
    {bird({ x: 1318, y: 816, delay: -5.6 })}
    {dragonfly({ x: 1110, y: 772, dur: 9, delay: -2, c: '#2a6f7e' })}
    {dragonfly({ x: 1176, y: 752, dur: 11.5, delay: -7, c: '#a33b22' })}
  </Svg>
)

/* ---------- windswept dune ---------- */

// A big dune rising on the left: a long windward slope up to a peak, a rounded
// shoulder falling away to the right, and a knife-edge brink running from the
// peak straight toward us, with the slip face shading off to its right.
const PEAK = [262, 694]
const duneY = (x) =>
  x <= PEAK[0] ? PEAK[1] + 98 * ((PEAK[0] - x) / 520) ** 1.25 : PEAK[1] + 0.05 * (x - PEAK[0]) + 0.000328 * (x - PEAK[0]) ** 2
const DUNE_END = 1090
const duneBody = `${trace(duneY, -PAD - 40, DUNE_END)} L ${DUNE_END} 960 L ${-PAD - 40} 960 Z`
const brink = [PEAK, [276, 728], [300, 770], [334, 818], [368, 868], [392, 920], [404, 960]]
const duneSpur = spur('ds', brink, { shadow: 300, glow: 80, dark: '#9c522a', so: 0.85, go: 0.7, rim: 2.6 })
const duneRip = ripples(41, duneY, { x0: -PAD, x1: DUNE_END, n: 18, top: 10, gap: 8, grow: 0.65, amp: 2, wave: 30 })

const duneLayer = (
  <Svg>
    <defs>
      <linearGradient id="caravan-dune-lit" gradientUnits="userSpaceOnUse" x1="0" y1="690" x2="0" y2="900">
        <stop offset="0" stopColor="#fdd8a0" />
        <stop offset=".3" stopColor="#f4b971" />
        <stop offset="1" stopColor="#df924e" />
      </linearGradient>
      <linearGradient id="caravan-plume-b" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffeccc" stopOpacity=".2" />
        <stop offset=".2" stopColor="#ffeccc" stopOpacity=".8" />
        <stop offset="1" stopColor="#ffeccc" stopOpacity="0" />
      </linearGradient>
      <clipPath id="caravan-dune-clip">
        <path d={duneBody} />
      </clipPath>
      {duneSpur.defs}
    </defs>
    <path d={duneBody} fill="url(#caravan-dune-lit)" />
    <g clipPath="url(#caravan-dune-clip)">
      <path d={duneRip.dark} stroke="#cc8243" strokeWidth="1.9" fill="none" opacity=".45" />
      <path d={duneRip.lite} stroke="#fff0cc" strokeWidth="1.4" fill="none" opacity=".55" />
      {duneSpur.shapes}
    </g>
    <path d={trace(duneY, -PAD - 40, PEAK[0])} stroke="#fff0cf" strokeWidth="2.4" fill="none" opacity=".85" />
    <path d={trace(duneY, PEAK[0], DUNE_END)} stroke="#f7c58a" strokeWidth="1.8" fill="none" opacity=".7" />
    {stream(11, PEAK[0], PEAK[1], { len: 130, rise: 10, dx: 120, dy: -12, dur: 4.1, grains: 2, grad: 'caravan-plume-b' })}
    {stream(12, 282, 740, { len: 100, rise: 7, dx: 100, dy: -8, dur: 3.6, grains: 1, grad: 'caravan-plume-b' })}
    {stream(13, 318, 800, { len: 86, rise: 6, dx: 90, dy: -6, dur: 4.8, grains: 1, grad: 'caravan-plume-b' })}
  </Svg>
)

/* ---------- foreground ---------- */

// Foreground sand lip. caravan-tumble in caravan.css samples this curve.
const lipY = (x) => 852 - 42 * gauss(x, 170, 300) - 30 * gauss(x, 1420, 330)
const lipTop = trace(lipY, -PAD - 40, W + PAD + 40)
const lipBody = `${lipTop} L ${W + PAD + 40} 960 L ${-PAD - 40} 960 Z`
const lipSpurs = [
  spur('ls1', [[170, lipY(170)], [190, 836], [226, 870], [262, 910]], { shadow: 180, glow: 50, dark: '#7e3812', so: 0.7, go: 0.45, lite: '#f8c48a' }),
  spur('ls2', [[1420, lipY(1420)], [1436, 846], [1462, 880], [1490, 920]], { shadow: 150, glow: 44, dark: '#7e3812', so: 0.65, go: 0.45, lite: '#f8c48a' }),
]
const lipRip = ripples(51, lipY, { x0: -PAD, x1: W + PAD, n: 4, top: 12, gap: 10, grow: 2, amp: 2.6, wave: 44 })

const tumbleweed = (() => {
  const r = rng(29)
  let d = ''
  for (let i = 0; i < 16; i++) {
    const a0 = r() * Math.PI * 2
    const rr = 10 + r() * 13
    const a1 = a0 + 1.4 + r() * 2.2
    d += ` M ${f(Math.cos(a0) * rr)} ${f(Math.sin(a0) * rr)} Q ${f((r() - 0.5) * 16)} ${f((r() - 0.5) * 16)} ${f(Math.cos(a1) * (rr + 4))} ${f(Math.sin(a1) * (rr + 4))}`
  }
  let twigs = ''
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2
    twigs += ` M ${f(Math.cos(a) * 20)} ${f(Math.sin(a) * 20)} l ${f(Math.cos(a + 0.6) * 7)} ${f(Math.sin(a + 0.6) * 7)}`
  }
  return (
    <g className="caravan-tumble">
      <ellipse cx="6" cy="1" rx="26" ry="3.6" fill="#5e2a0c" opacity=".3" />
      <g className="caravan-hop">
        <g transform="translate(0 -24)">
          <g className="caravan-spin">
            <circle r="22" fill="#b07a42" opacity=".28" />
            <path d={d} stroke="#6b4220" strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <path d={d} stroke="#c8955a" strokeWidth="0.9" fill="none" transform="translate(-1 -1)" opacity=".8" />
            <path d={twigs} stroke="#6b4220" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </g>
  )
})()

const grains = (() => {
  const r = rng(61)
  return Array.from({ length: 6 }, (_, i) => (
    <circle
      key={i}
      className="caravan-grain"
      cx={f(-60 + r() * 1200)}
      cy={f(720 + r() * 120)}
      r={s2(1.1 + r() * 1.6)}
      fill="#fff2d8"
      style={{ animationDuration: `${f(2.8 + r() * 2.4)}s`, animationDelay: `${f(-r() * 5)}s` }}
    />
  ))
})()

function tuft(x, key, flip = 1, s = 1) {
  const y = lipY(x) + 3
  const r = rng(key * 17 + 1)
  let d = ''
  for (let i = 0; i < 11; i++) {
    const a = (-150 + i * 12 + (r() - 0.5) * 8) * (Math.PI / 180)
    const L = (18 + r() * 22) * s
    const ex = x + Math.cos(a) * L * flip
    const ey = y + Math.sin(a) * L
    d += ` M ${f(x - 1.4)} ${f(y)} Q ${f(x + (ex - x) * 0.5 + 2 * flip)} ${f(y + (ey - y) * 0.6)} ${f(ex)} ${f(ey)} Q ${f(x + (ex - x) * 0.45)} ${f(y + (ey - y) * 0.45)} ${f(x + 1.4)} ${f(y)} Z`
  }
  return (
    <g key={key}>
      <ellipse cx={x + 10 * flip} cy={y + 1} rx={24 * s} ry="3.4" fill="#6e3412" opacity=".3" />
      <path
        className="caravan-tuft"
        d={d}
        fill="#7a5228"
        style={{ transformOrigin: `${x}px ${f(y)}px`, animationDuration: `${3.2 + key * 0.8}s`, animationDelay: `${-key * 1.9}s` }}
      />
    </g>
  )
}

const rock = (x, s) => {
  const y = lipY(x) + 4
  return (
    <g key={x}>
      <ellipse cx={f(x + 10 * s)} cy={f(y + 1)} rx={f(20 * s)} ry={f(3.4 * s)} fill="#5e2a0c" opacity=".35" />
      <path d={`M ${f(x - 14 * s)} ${f(y)} C ${f(x - 14 * s)} ${f(y - 10 * s)}, ${f(x - 4 * s)} ${f(y - 15 * s)}, ${f(x + 5 * s)} ${f(y - 13 * s)} C ${f(x + 13 * s)} ${f(y - 11 * s)}, ${f(x + 16 * s)} ${f(y - 4 * s)}, ${f(x + 15 * s)} ${f(y)} Z`} fill="#a2653b" />
      <path d={`M ${f(x + 5 * s)} ${f(y - 13 * s)} C ${f(x + 13 * s)} ${f(y - 11 * s)}, ${f(x + 16 * s)} ${f(y - 4 * s)}, ${f(x + 15 * s)} ${f(y)} L ${f(x + 3 * s)} ${f(y)} C ${f(x + 6 * s)} ${f(y - 5 * s)}, ${f(x + 6 * s)} ${f(y - 9 * s)}, ${f(x + 5 * s)} ${f(y - 13 * s)} Z`} fill="#7b4626" />
      <path d={`M ${f(x - 12 * s)} ${f(y - 6 * s)} C ${f(x - 10 * s)} ${f(y - 11 * s)}, ${f(x - 4 * s)} ${f(y - 14 * s)}, ${f(x + 3 * s)} ${f(y - 13 * s)}`} stroke="#e0a874" strokeWidth={f(1.8 * s)} fill="none" strokeLinecap="round" />
    </g>
  )
}

const foreLayer = (
  <Svg>
    <defs>
      <linearGradient id="caravan-lip" gradientUnits="userSpaceOnUse" x1="0" y1="806" x2="0" y2="880">
        <stop offset="0" stopColor="#de8f4c" />
        <stop offset="1" stopColor="#b5602c" />
      </linearGradient>
      <linearGradient id="caravan-plume-c" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffe6c0" stopOpacity=".25" />
        <stop offset=".2" stopColor="#ffe6c0" stopOpacity=".85" />
        <stop offset="1" stopColor="#ffe6c0" stopOpacity="0" />
      </linearGradient>
      <clipPath id="caravan-lip-clip">
        <path d={lipBody} />
      </clipPath>
      {lipSpurs.map((sp, i) => (
        <g key={i}>{sp.defs}</g>
      ))}
      <radialGradient id="caravan-gust-g">
        <stop offset="0" stopColor="#ffe9c6" stopOpacity=".55" />
        <stop offset="1" stopColor="#ffe9c6" stopOpacity="0" />
      </radialGradient>
    </defs>
    <path d={lipBody} fill="url(#caravan-lip)" />
    <path d={lipRip.dark} stroke="#a85a29" strokeWidth="2" fill="none" opacity=".45" />
    <path d={lipRip.lite} stroke="#f3b77a" strokeWidth="1.6" fill="none" opacity=".5" />
    <g clipPath="url(#caravan-lip-clip)">
      {lipSpurs.map((sp, i) => (
        <g key={i}>{sp.shapes}</g>
      ))}
    </g>
    <path d={lipTop} stroke="#f6be82" strokeWidth="2.6" fill="none" />
    {rock(250, 1)}
    {rock(1238, 0.7)}
    {tuft(96, 0)}
    {tuft(1336, 1, -1, 1.1)}
    {tumbleweed}
    {stream(21, 170, lipY(170), { len: 120, rise: 9, dx: 140, dy: -14, dur: 3.7, grains: 2, grad: 'caravan-plume-c', grain: '#ffeacb' })}
    {grains}
    <ellipse className="caravan-gust" cx="0" cy="790" rx="320" ry="60" fill="url(#caravan-gust-g)" />
  </Svg>
)

/* ---------- world ---------- */

const caravanWorld = {
  id: 'caravan',
  name: 'Desert Caravan',
  tag: 'Golden afternoon',
  accent: '#f2a63a',
  accent2: '#e4703a',
  ink: '#9a5a06',
  glow: '#ffcf7e',
  light: true,
  clockColor: '#4a2a12',
  sky: 'linear-gradient(180deg,#a9c6d6 0%,#c9d6d3 14%,#ecdfc6 32%,#f8e5c2 48%,#fdedd0 60%,#fbe2b4 72%,#f3cb8e 100%)',
  layers: [
    { name: 'Sky Plate', depth: 0, sky: true, el: skyPlate },
    { name: 'Circling vultures', depth: 0.12, el: vultures },
    { name: 'Hazy mesas', depth: 0.22, el: mesaLayer },
    { name: 'Depth Clock', depth: 0.4, clock: true },
    { name: 'Caravan crest', depth: 0.6, el: crestLayer },
    { name: 'Palm oasis', depth: 0.82, el: oasisLayer },
    { name: 'Windswept dune', depth: 1.02, el: duneLayer },
    { name: 'Tumbleweed', depth: 1.3, el: foreLayer },
  ],
}

export default caravanWorld
