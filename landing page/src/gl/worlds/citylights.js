// City Lights: an invented river city at blue hour, seen from a high vantage
// point (170 m up). A deep-blue twilight sky with low cloud lit from below by
// the city, a dense skyline of glass towers with thousands of individually lit
// windows (warm and cool, some switching on and off), red aircraft-warning
// lights, a river mirroring it all in long rippled streaks, a cable-stayed
// bridge and an elevated expressway carrying streams of headlights and tail
// lights, and an aircraft crossing the sky on its approach.
//
// The towers are real boxes: each pixel intersects them analytically and the
// windows are box-filtered against the pixel footprint (window -> tenant zone
// -> floor -> whole facade), so the facades hold from card size up to 8K. The
// river reflects the skyline and the bridge by rendering them again from the
// mirrored camera, with the ripple slopes displacing and blurring the image.
//
// Lit in linear HDR, composited front to back in linear light, ACES-tonemapped
// and dithered. Everything runs on one master loop (LOOP seconds) so u_time can
// grow forever without precision loss or pops.

const FOC = 1.3
const CAMH = 170
const YH = 0.5
const LOOP = 2880

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Downtown towers: screen x, depth (m), half width, half depth, height, rotation,
// facade style, top (0 flat, 1 spire, 2 slanted, 3 lit crown, 4 crane, 5 mast), slope
const SIG = [
  [-0.43, 2180, 31, 31, 418, 0.18, 0, 1, 0],
  [-0.43, 2180, 41, 41, 205, 0.18, 0, 0, 0],
  [0.335, 1990, 30, 23, 335, 0.62, 3, 2, 0.75],
  [-0.135, 1830, 25, 25, 262, 0.1, 1, 3, 0],
  [-0.135, 1830, 35, 35, 148, 0.1, 1, 0, 0],
  [0.105, 1720, 15, 15, 222, 0.32, 2, 0, 0],
  [0.535, 2080, 23, 23, 228, 0.1, 5, 4, 0],
  [-0.615, 1880, 27, 21, 240, 0.25, 4, 5, 0],
  [0.69, 1840, 21, 29, 184, 0.1, 2, 0, 0],
  [-0.27, 2380, 27, 27, 326, 0.885, 1, 0, 0],
  [0.215, 2430, 29, 29, 298, 0.1, 0, 3, 0],
  [-0.005, 2290, 23, 33, 280, 0.42, 3, 0, 0],
  [-0.53, 2470, 26, 26, 288, 0.1, 6, 0, 0],
  [0.44, 2520, 25, 25, 266, 0.5, 0, 0, 0],
]

function buildTowers() {
  const r = rng(20261124)
  const T = SIG.map(([sx, z, hw, hd, h, rot, st, top, ex]) => ({ x: (sx * z) / FOC, z, hw, hd, h, rot, st, top, ex }))
  const styles = [0, 1, 1, 2, 2, 3, 4, 6, 6]
  for (let tries = 0; tries < 900 && T.length < 40; tries++) {
    const sx = -0.84 + 1.7 * r()
    const z = 1680 + 1000 * r()
    const x = (sx * z) / FOC
    const prof = 0.4 + 0.6 * Math.exp(-((sx + 0.04) ** 2) / 0.2)
    const h = (90 + 150 * r() ** 1.5) * prof + 25
    const hw = 13 + 12 * r()
    const hd = 13 + 12 * r()
    const top = YH + ((h - CAMH) * FOC) / (z - 40)
    if (Math.abs(sx) < 0.38 && top > 0.6) continue
    const rad = Math.max(hw, hd) * 1.42
    if (T.some((t) => Math.hypot(t.x - x, t.z - z) < rad + Math.max(t.hw, t.hd) * 1.42 + 8)) continue
    const st = styles[Math.floor(r() * styles.length)]
    const rr = r()
    const rot = rr < 0.55 ? 0.1 : rr < 0.8 ? 0.42 : 0.79
    T.push({ x, z, hw, hd, h, rot, st, top: r() < 0.14 && h > 160 ? 3 : 0, ex: 0 })
  }
  const out = T.map((t) => {
    const c = Math.cos(t.rot)
    const s = Math.sin(t.rot)
    let xmin = 9
    let xmax = -9
    let zmin = 1e9
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const X = t.x + c * a * t.hw - s * b * t.hd
      const Z = t.z + s * a * t.hw + c * b * t.hd
      xmin = Math.min(xmin, (X * FOC) / Z)
      xmax = Math.max(xmax, (X * FOC) / Z)
      zmin = Math.min(zmin, Z)
    }
    let htop = t.h
    if (t.top === 1) htop += 96
    if (t.top === 5) htop += 42
    if (t.top === 2) htop += t.ex * t.hw
    if (t.top === 4) {
      htop += 52
      xmax += (60 * FOC) / t.z
      xmin -= (22 * FOC) / t.z
    }
    const ytop = YH + ((htop - CAMH) * FOC) / zmin
    // towers with something on top (spire, mast, crane, warning light) come first
    const lit = t.top === 1 || t.top === 4 || t.top === 5 || t.h >= 190
    return { ...t, xmin, xmax, ytop, zmin, lit }
  })
  out.sort((a, b) => b.lit - a.lit)
  return out
}

const TOW = buildTowers()
const NTOP = TOW.filter((t) => t.lit).length
const f0 = (v) => String(Math.round(v))
const f1 = (v) => String(Math.round(v * 10) / 10)
const f4 = (v) => String(Math.round(v * 10000) / 10000)
const NT = TOW.length
const TA = TOW.map((t) => `vec4(${f0(t.x)},${f0(t.z)},${f1(t.hw)},${f1(t.hd)})`).join(',')
const TB = TOW.map((t, i) => `vec4(${f0(t.h)},${f4(t.rot)},${t.st + 8 * t.top},${f4((t.top === 2 ? t.ex : 0) + i * 4 + 4)})`).join(',')
const TC = TOW.map((t) => `vec4(${f4(t.xmin)},${f4(t.xmax)},${f4(t.ytop)},${f0(t.zmin)})`).join(',')

// river ripples: direction, wavenumber, amplitude; cycles per loop (deep-water dispersion)
function buildWaves() {
  const r = rng(91)
  const lams = [9.5, 6.9, 5.1, 3.7, 2.7, 2.0, 1.45, 1.05, 0.78, 0.57, 0.42, 0.31, 0.23]
  return lams.map((lam, i) => {
    const ang = (i % 2 ? 1.2 : -0.2) + (r() - 0.5) * 2.6
    const k = (2 * Math.PI) / lam
    const slope = i < 2 ? 0.012 : i < 4 ? 0.022 : 0.03
    const w = Math.sqrt(9.81 * k)
    return { dx: Math.cos(ang), dz: Math.sin(ang), k, a: slope / k, n: Math.max(1, Math.round((w * LOOP) / (2 * Math.PI))) }
  })
}
const WAV = buildWaves()
const NWAV = WAV.length
const WVS = WAV.map((w) => `vec4(${f4(w.dx)},${f4(w.dz)},${f4(w.k)},${(Math.round(w.a * 1e5) / 1e5).toString()})`).join(',')
const WFS = WAV.map((w) => `${w.n}.0`).join(',')

export default {
  id: 'citylights',
  name: 'City Lights',
  tag: 'Night skyline',
  accent: '#ffb347',
  accent2: '#4f8dff',
  ink: '#1b3f8a',
  glow: '#ffd7a0',
  light: false,
  clockColor: '#f3f6ff',
  sky: 'linear-gradient(180deg,#0d1a3c 0%,#1d3566 30%,#3d4f73 44%,#7a6a6a 49%,#2a2b36 52%,#1b2236 64%,#121722 88%,#191512 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Twilight sky', depth: 0 },
    { name: 'Low clouds', depth: 0.03 },
    { name: 'Aircraft', depth: 0.06 },
    { name: 'Far city', depth: 0.12 },
    { name: 'Downtown skyline', depth: 0.3 },
    { name: 'River', depth: 0.45 },
    { name: 'Bridge', depth: 0.62 },
    { name: 'Expressway', depth: 1.0 },
  ],
  clockAfter: 3,
  stillTime: 64,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float YH = ${YH.toFixed(2)};       // horizon on screen
const float FOC = ${FOC.toFixed(2)};      // focal length (screen heights)
const float CAMH = ${CAMH.toFixed(1)};    // camera height above the river (m)
const float LOOP = ${LOOP.toFixed(1)};   // master loop (s)
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float GND = 4.0;       // street level above the water (m)
const float ZCITY = 3300.0;  // the skyline layer's streets end here; the far city takes over
const float ZREF = 2100.0;   // typical skyline depth (reflection displacement)

float TM;     // wrapped time
float PX;     // one pixel in screen-height units
float VIG;
vec2 PV;      // u_par * PAR
float BLURX;  // horizontal blur of the rippled reflection (0 in the direct view)

// ---------------------------------------------------------------- noise
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoiseP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(x0, i.y)), h12(vec2(x1, i.y)), u.x), mix(h12(vec2(x0, i.y + 1.0)), h12(vec2(x1, i.y + 1.0)), u.x), u.y);
}
float fbm1(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoise1(x), clamp(oct - fi, 0.0, 1.0));
    x = x * 2.03 + 1.7;
    a *= 0.5;
  }
  return s + a;
}
// x-periodic billowy fbm for the cloud deck (period doubles per octave)
float fbmC(vec2 p, float oct) {
  float s = 0.0, a = 0.5, per = 32.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float v = vnoiseP(p, per);
    if (i >= 2) v = 1.0 - abs(2.0 * v - 1.0) * 0.9 - 0.05;
    s += a * mix(0.5, v, clamp(oct - fi, 0.0, 1.0));
    p = vec2(2.0 * p.x + 0.73 * p.y, 2.0 * p.y + 5.31);
    per *= 2.0;
    a *= i < 1 ? 0.5 : 0.55;
  }
  return s + a;
}
// phase of something that cycles n times per loop (n integer)
float cyc(float n) { return fract(TM * (n / LOOP)); }
// box-filtered pulse train: share of [x - w/2, x + w/2] inside [k, k + d)
float pulseF(float x, float d, float w) {
  w = max(w, 1e-4);
  float a = x - 0.5 * w, b = x + 0.5 * w;
  return ((floor(b) - floor(a)) * d + min(fract(b), d) - min(fract(a), d)) / w;
}
// share of a pixel of width f (centred d from a line's axis) covered by a line of width w
float lineCov(float d, float w, float f) {
  return clamp((min(d + 0.5 * f, 0.5 * w) - max(d - 0.5 * f, -0.5 * w)) / f, 0.0, 1.0);
}
float sat(float x) { return clamp(x, 0.0, 1.0); }
// depth of a point at distance z on the parallax scale (skyline 0.3, expressway 1.0)
float dOfZ(float z) { return 0.3 + 0.25 * clamp(1700.0 / z - 1.0, 0.0, 2.8); }

// ---------------------------------------------------------------- colour
vec3 aces(vec3 c) { return (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); }
vec3 display(vec3 c) { return pow(clamp(aces(c * VIG), 0.0, 1.0), vec3(1.0 / 2.2)); }

// ---------------------------------------------------------------- sky
const vec2 TWI = vec2(-0.94, 0.34);   // where the sun went down (west-north-west)
vec3 skyCol(vec3 rd) {
  float e = max(rd.y, 0.0);
  vec2 hz = normalize(rd.xz + vec2(0.0, 1e-4));
  float tw = max(dot(hz, TWI), 0.0);
  tw *= tw * tw;
  vec3 c = mix(vec3(0.072, 0.085, 0.122), vec3(0.034, 0.062, 0.13), smoothstep(0.0, 0.08, e));
  c = mix(c, vec3(0.010, 0.026, 0.088), smoothstep(0.05, 0.42, e));
  // last twilight: amber on the horizon under a teal band
  c += tw * (vec3(0.36, 0.13, 0.034) * exp(-e / 0.026) + vec3(0.04, 0.07, 0.062) * exp(-e / 0.09));
  // the city's light dome, strongest toward downtown
  c += vec3(0.16, 0.078, 0.032) * exp(-e / 0.036) * (0.3 + 0.7 * max(hz.y, 0.0));
  return c;
}
// what glass sees below the horizon: the lit city
vec3 envRefl(vec3 R) {
  if (R.y > 0.0) return skyCol(R);
  return vec3(0.036, 0.023, 0.015) * (0.5 + 0.5 * exp(R.y * 6.0));
}

// low stratocumulus lit from below by the city (cloud deck 1.5 km above the camera)
vec4 clouds(vec3 rd, float octMax) {
  if (rd.y < 0.004) return vec4(0.0);
  float iy = 1.0 / rd.y;
  vec2 w = rd.xz * iy * 1.5;                       // km
  vec2 p = vec2(w.x * 0.75, w.y * 0.42 + 2.0);
  p.x += TM * (32.0 / LOOP);
  float fp = PX / FOC * iy * 1.5 * 0.75 * sqrt(iy);
  float oct = clamp(log2(0.5 / fp), 1.0, octMax);
  vec2 wp = vec2(vnoiseP(p * 0.5, 16.0), vnoiseP(p * 0.5 + vec2(0.0, 5.2), 16.0)) - 0.5;
  p += wp * 0.8;
  float covN = vnoiseP(p * 0.2, 6.4);
  float cov = mix(0.70, 0.50, covN) + 0.12 * smoothstep(0.12, 0.3, rd.y);
  float n = fbmC(p, oct);
  float dens = smoothstep(cov, cov + 0.22, n);
  if (dens <= 0.001) return vec4(0.0);
  // the city lights the base: brightest over downtown and the dense far city
  vec2 dc = (w - vec2(0.2, 3.0)) / vec2(4.5, 3.5);
  float glow = 0.35 + 0.65 * exp(-dot(dc, dc)) + 0.25 * smoothstep(4.0, 14.0, w.y);
  float thick = smoothstep(cov, cov + 0.45, n);
  vec3 col = vec3(0.12, 0.068, 0.042) * glow * (0.42 + 0.78 * thick);
  col += vec3(0.010, 0.016, 0.030) * (1.0 - 0.5 * thick);
  vec2 hz = normalize(rd.xz);
  float tw = max(dot(hz, TWI), 0.0);
  col += vec3(0.11, 0.045, 0.03) * tw * tw * tw * (1.0 - thick) * exp(-rd.y / 0.08);
  float hzf = 1.0 - exp(-iy * 0.045);
  col = mix(col, skyCol(rd), hzf);
  return vec4(col, dens * smoothstep(0.004, 0.03, rd.y));
}

vec4 layerSky(vec2 p) {
  vec3 rd = normalize(vec3(p.x, p.y - YH, FOC));
  vec3 c = skyCol(rd);
  // the few stars that show at blue hour
  float cell = 0.04;
  vec2 g = p / cell, id = floor(g);
  vec4 h = h42(id + 31.0);
  if (h.x < 0.3) {
    vec2 d = (g - id - 0.2 - 0.6 * h.yz) * cell;
    float s = 0.65 * PX;
    float tw = 0.8 + 0.2 * sin(TAU * cyc(floor(600.0 + 1400.0 * h.y)) + h.z * 20.0);
    c += vec3(0.75, 0.85, 1.0) * (0.03 + 0.4 * pow(h.w, 6.0)) * tw * exp(-dot(d, d) / (2.0 * s * s)) * smoothstep(0.62, 0.92, p.y);
  }
  // the evening star low in the twilight
  vec2 dv = p - vec2(-0.6, 0.6);
  c += vec3(1.0, 0.95, 0.85) * (1.2 * exp(-dot(dv, dv) / (2.0 * PX * PX * 0.6)) + 0.03 * exp(-length(dv) / 0.0035));
  return vec4(c, 1.0);
}

vec4 layerClouds(vec2 p) {
  vec2 q = p + PV * 0.03;
  vec3 rd = normalize(vec3(q.x, q.y - YH, FOC));
  vec4 cl = clouds(rd, 6.0);
  return vec4(cl.rgb * cl.a, cl.a);
}

// ---------------------------------------------------------------- point lights
// a lamp at screen point c: a pixel-sized core (stretched by sy in reflections) and a halo
vec3 lamp(vec2 q, vec2 c, vec3 col, float I, float sy, float halo) {
  vec2 d = q - c;
  float s0 = 0.75 * PX;
  float sx = max(s0, BLURX);
  float s2 = max(sy, s0);
  float r2 = d.x * d.x / (sx * sx) + d.y * d.y / (s2 * s2);
  if (r2 > 60.0 && halo == 0.0) return vec3(0.0);
  float core = exp(-0.5 * r2) * (s0 / sx) * (s0 / s2);
  float r = length(vec2(d.x * s0 / sx, d.y * s0 / s2));
  return col * I * (core * (0.0011 / PX) + halo * (0.05 * exp(-r / 0.0022) + 0.012 * exp(-r / 0.009)));
}
// FAA-style obstruction light: 40 flashes a minute
float blinkR(float ph) { return smoothstep(0.0, 0.06, ph) * smoothstep(0.42, 0.3, ph); }

// ---------------------------------------------------------------- aircraft
vec4 layerAir(vec2 p) {
  vec2 q = p + PV * 0.06;
  float per = LOOP / 12.0;                     // a pass every 4 minutes
  float k = floor(TM / per);
  float tau = TM - k * per;
  float dur = 150.0;
  if (tau > dur) return vec4(0.0);
  vec4 h = h42(vec2(mod(k, 12.0), 5.0));
  float dir = h.x < 0.5 ? 1.0 : -1.0;
  float s = tau / dur;
  vec2 pos = vec2(mix(-1.0, 1.0, s) * dir, mix(0.66 + 0.2 * h.y, 0.6 + 0.12 * h.y, s));
  if (abs(q.x - pos.x) > 0.06 || abs(q.y - pos.y) > 0.04) return vec4(0.0);
  float dist = 3600.0 + 2400.0 * h.z;
  float m = FOC / dist;                       // screen units per metre
  vec2 l = (q - pos) / m;                     // metres in the plane's frame
  l.x *= dir;
  // silhouette: fuselage, tail fin and foreshortened wing, dark against the sky
  float fus = length(vec2(max(abs(l.x) - 17.0, 0.0), l.y)) - 2.2;
  float fin = max(abs(l.x + 16.5 - (l.y - 2.0) * 0.5) - 1.6, abs(l.y - 4.5) - 3.0);
  float wing = max(abs(l.x - 1.0) - 3.5, abs(l.y + 1.0) - 0.7);
  float d = min(min(fus, fin), wing) * m;
  float a = smoothstep(PX, -PX, d) * 0.85;
  vec3 c = vec3(0.012, 0.012, 0.016) * a;
  // lights: red beacon, nav lights, double white strobes, landing lights on approach
  float beacon = blinkR(cyc(LOOP / 1.25));
  float sp = cyc(LOOP / 1.6);
  float strobe = smoothstep(0.0, 0.01, sp) * smoothstep(0.05, 0.035, sp) + smoothstep(0.1, 0.11, sp) * smoothstep(0.15, 0.135, sp);
  float land = step(0.45, h.w);
  vec3 e = lamp(q, pos + vec2(0.0, 2.6) * m, vec3(1.0, 0.08, 0.03), 2.2 * beacon, 0.0, 0.7);
  e += lamp(q, pos + vec2(dir * 1.5, -0.6) * m, vec3(1.0, 0.06, 0.03), 0.5, 0.0, 0.3);
  e += lamp(q, pos + vec2(dir * 0.5, -0.4) * m, vec3(0.1, 1.0, 0.35), 0.4, 0.0, 0.3);
  e += lamp(q, pos + vec2(dir * 1.0, -0.8) * m, vec3(0.9, 0.95, 1.0), 3.5 * strobe, 0.0, 1.0);
  e += lamp(q, pos + vec2(-dir * 17.0, 6.5) * m, vec3(0.9, 0.95, 1.0), 2.0 * strobe, 0.0, 0.6);
  e += lamp(q, pos + vec2(dir * 12.0, -1.2) * m, vec3(1.0, 0.93, 0.8), 2.2 * land, 0.0, 1.4);
  float fade = smoothstep(0.0, 0.04, s) * smoothstep(1.0, 0.96, s);
  return vec4((c + e) * fade, a * fade);
}

// ---------------------------------------------------------------- city ground
float zFB(float x) { return 1500.0 + 0.05 * x + 60.0 * sin(x / 600.0 + 0.5); }
// the far bank's depth seen along screen column qx (fixed-point solve; the bank is gentle)
float bankZ(float qx) {
  float z = zFB(qx * 1500.0 / FOC);
  z = zFB(qx * z / FOC);
  return zFB(qx * z / FOC);
}

// the street grid from above, filtered by the pixel footprint fp (x, z in metres):
// lamp lines and traffic along the avenues (they converge), cross streets, lit blocks
vec3 carpet(vec2 xz, vec2 fp) {
  float X = xz.x, Z = xz.y;
  float dist = vnoise(xz / vec2(900.0, 1300.0) + 3.0);
  float park = smoothstep(0.6, 0.72, vnoise(xz / vec2(380.0, 520.0) + 11.0));
  float live = (0.3 + 1.1 * dist) * (1.0 - 0.85 * park);
  vec3 c = vec3(0.016, 0.011, 0.008) * live;
  float ai = floor(X / 150.0 + 0.5);
  float xo = X - ai * 150.0;
  float art = step(0.74, h11(ai * 3.7 + 1.0));
  float hw = mix(8.0, 15.0, art);
  float fx = max(fp.x, 0.3);
  // lamps along both kerbs: individual near, a line far away
  float lz = mix(1.0, pulseF(Z / 32.0, 0.12, fp.y / 32.0) / 0.12 * 0.35, smoothstep(40.0, 10.0, fp.y));
  float lamps = (lineCov(xo - hw, 1.2, fx) + lineCov(xo + hw, 1.2, fx)) * lz;
  vec3 lc = mix(vec3(0.85, 0.7, 0.5), vec3(1.0, 0.5, 0.14), art);
  c += lamps * lc * mix(0.7, 1.3, art) * (1.0 - 0.6 * park) * (0.55 + 0.9 * vnoise1(Z / 330.0 + ai * 3.1));
  // traffic: white coming, red going
  float flow = smoothstep(0.35, 0.8, vnoise1(Z / 260.0 + ai * 7.3)) * (0.4 + art);
  c += (lineCov(xo + hw * 0.4, 2.0, fx) * vec3(0.9, 0.85, 0.75) * 0.22 + lineCov(xo - hw * 0.4, 2.0, fx) * vec3(0.9, 0.08, 0.03) * 0.2) * flow;
  // cross streets every 95 m: a glow of lamps
  float cS = pulseF(Z / 95.0 + 0.04, 0.08, fp.y / 95.0);
  c += cS * vec3(0.6, 0.42, 0.24) * 0.3 * (1.0 - 0.7 * park) * (0.4 + 0.3 * h11(floor(Z / 95.0)));
  return c;
}

// ---------------------------------------------------------------- buildings
const int NT = ${NT};
const int NTOP = ${NTOP};
const vec4 TA[NT] = vec4[NT](${TA});   // centre x, z, half width, half depth
const vec4 TB[NT] = vec4[NT](${TB});   // height, rotation, style + 8 * top, slope + 4 * seed
const vec4 TC[NT] = vec4[NT](${TC});   // screen x range, screen top, nearest depth

// facade styles: floor height, bay width, window width share, window height share
const vec4 SA[7] = vec4[7](
  vec4(4.1, 1.6, 0.86, 0.70), vec4(4.0, 3.0, 0.70, 0.62), vec4(3.2, 3.6, 0.48, 0.56), vec4(4.2, 1.5, 0.90, 0.78),
  vec4(3.4, 4.0, 0.52, 0.60), vec4(4.0, 3.0, 0.70, 0.62), vec4(3.6, 3.0, 0.42, 0.52));
// tenant zone width (bays), occupancy, colour temperature (0 warm .. 1 cool), glass reflectance
const vec4 SB[7] = vec4[7](
  vec4(3.0, 0.5, 0.74, 0.26), vec4(2.0, 0.52, 0.52, 0.1), vec4(1.0, 0.42, 0.14, 0.06), vec4(4.0, 0.3, 0.42, 0.32),
  vec4(1.0, 0.5, 0.2, 0.06), vec4(2.0, 0.45, 0.5, 0.1), vec4(1.0, 0.46, 0.26, 0.04));

vec3 winCol(float t) {
  vec3 warm = vec3(1.0, 0.42, 0.12);
  vec3 neut = vec3(1.0, 0.74, 0.46);
  vec3 cool = vec3(0.76, 0.88, 1.0);
  return t < 0.5 ? mix(warm, neut, t * 2.0) : mix(neut, cool, t * 2.0 - 1.0);
}

// one facade point: u along the face and h above the river (m); fp = footprint (m)
vec3 facade(float u, float h, float W, float H, vec2 fp, int st, float sd, vec3 n, vec3 rd) {
  vec4 A = SA[st], B = SB[st];
  float FH = A.x * (0.94 + 0.12 * h11(sd * 3.1));
  float BW = A.y * (0.9 + 0.2 * h11(sd * 5.3));
  float lob = GND + 7.0;
  float fl = (h - lob) / FH;
  float fi = floor(fl);
  float bu = u / BW, bi = floor(bu);
  float rx = fp.x / BW, ry = fp.y / FH;
  float ap = pulseF(bu - 0.5 + 0.5 * A.z, A.z, rx) * pulseF(fl - 0.14, A.w, ry);
  bool office = B.x > 1.5;
  float lX = smoothstep(0.5, 1.5, rx), lZ = smoothstep(0.5, 1.5, rx / B.x), lY = smoothstep(0.5, 1.5, ry);
  // occupancy: smooth vertical zones, then floors, tenant zones, single windows
  float occS = clamp(B.y + 0.36 * (h11(sd * 7.3) - 0.5) + 0.6 * (vnoise(vec2(h / 30.0, sd * 3.7)) - 0.5), 0.02, 0.95);
  float Im = office ? 0.85 : 0.56;
  float tB = B.z + 0.34 * (h11(sd * 5.7) - 0.5);
  float cI = abs(dot(rd, n));
  float F = B.w + (1.0 - B.w) * pow(1.0 - cI, 5.0);
  vec3 env = envRefl(reflect(rd, n));
  vec3 amb = vec3(0.008, 0.013, 0.026) + vec3(0.11, 0.058, 0.025) * exp(-(h - GND) / 40.0);
  vec3 frame = (st == 0 || st == 3) ? env * F * 0.75 + amb * 0.04 : amb * (st == 6 ? 0.32 : 0.16);
  vec3 halo = winCol(B.z) * (office ? occS * 0.82 : occS * 0.56) * 0.06;
  if (ry > 1.5 && h > lob) {
    // floors unresolved: the facade's mean, with column-to-column variation while bays resolve
    float colv = mix(0.45 + 1.1 * h12(vec2(floor(bu / B.x), sd + 5.0)), 1.0, lZ);
    vec3 emM = winCol(sat(tB)) * (office ? occS * 0.82 + 0.05 : occS) * Im * (office ? 1.1 : 1.0) * colv;
    return mix(frame, env * F + emM, ap) + halo;
  }
  float hf = h12(vec2(fi + 0.5, sd));
  float occF = office ? (hf < occS ? 0.75 + 0.25 * hf / occS : (hf < occS + 0.15 ? 0.3 : 0.02)) : occS;
  float zi = floor(bi / B.x);
  float litZ = step(h12(vec2(zi * 1.37 + sd, fi * 0.71 + 3.0)), occF);
  float wh = h12(vec2(bi * 1.13 + sd * 1.3, fi + 17.0));
  float litW = office ? litZ * step(0.12, wh) : step(wh, occF);
  // a few windows switch on and off on loop-periodic schedules
  float dyn = h12(vec2(bi * 0.71 + sd, fi * 1.9 + 41.0));
  if (dyn < 0.02) {
    float c = cyc(floor(2.0 + 9.0 * h11(dyn * 917.0)));
    if (fract(c + h11(dyn * 311.0)) < 0.45) litW = 1.0 - litW;
  }
  // intensity: offices fairly even, homes from dim curtains to bright rooms
  float wv = h12(vec2(bi + 3.0, fi * 2.3 + sd));
  float Iw = office ? 0.5 + 0.7 * wv : (wv < 0.35 ? 0.1 + 0.5 * wv : 0.35 + 0.9 * (wv - 0.35));
  float E = mix(mix(mix(litW * Iw, (office ? litZ * 0.88 : occF) * Im, lX), occF * (office ? 0.88 : 1.0) * Im, lZ),
                (office ? occS * 0.82 + 0.05 : occS) * Im, lY);
  float tw = tB + (0.3 * (hf - 0.5) + 0.36 * (wv - 0.5) * (1.0 - lX)) * (1.0 - lY);
  float wy = sat((fract(fl) - 0.14) / A.w);
  vec3 em = winCol(sat(tw)) * E * (office ? 1.1 : 1.0) * mix(0.7 + 0.6 * wy, 1.0, lY);
  // glass mirrors the sky above and the lit city below; panels are never quite flat
  env *= mix(0.72 + 0.56 * h12(vec2(bi * 0.37 + sd, fi * 0.53)), 1.0, max(lX, lY));
  vec3 glass = env * F + vec3(0.003, 0.0027, 0.0026) * (1.0 - F);
  vec3 col = mix(frame, glass + em, ap) + halo;
  // lobby: tall glazing, warm, not every building
  if (h < lob) {
    float lb = pulseF(u / 6.0, 0.82, fp.x / 6.0);
    float lI = h11(sd * 9.1);
    col = mix(amb * 0.25, vec3(1.0, 0.68, 0.38) * (0.04 + 0.7 * lI * lI * lI), lb * smoothstep(GND, GND + 1.0, h));
  }
  // vertical light lines on the corners of a few glass towers
  if (st == 3 && h11(sd * 8.1) > 0.4) col += vec3(0.75, 0.88, 1.0) * 1.1 * (lineCov(u, 0.8, max(fp.x, 0.2)) + lineCov(u - W, 0.8, max(fp.x, 0.2)));
  return col;
}

// candidate surface for one pixel: depth, coverage, far depth, entry axis, local hit, box
struct Cand { float z; float a; float tf; float ax; vec2 lp; vec4 g; vec4 b; };

void pushC(inout Cand c1, inout Cand c2, Cand c) {
  if (c.a <= 0.001) return;
  if (c.z < c1.z) { c2 = c1; c1 = c; }
  else if (c.z < c2.z) c2 = c;
}

// ray (screen q, camera height camH) against a vertical box; xr = its screen x range
Cand boxHit(vec2 q, float camH, vec4 g, vec4 b, vec2 cs, vec2 xr, float aa, float aaY) {
  Cand c;
  c.z = 1e9; c.a = 0.0;
  float covX = sat(min(q.x - xr.x, xr.y - q.x) / aa + 0.5);
  if (covX <= 0.0) return c;
  float dx = q.x / FOC;
  vec2 dl = vec2(cs.x * dx + cs.y, -cs.y * dx + cs.x);
  vec2 ol = -vec2(cs.x * g.x + cs.y * g.y, -cs.y * g.x + cs.x * g.y);
  float m = 1.5 * aa * g.y / FOC;
  dl = vec2(abs(dl.x) < 1e-6 ? 1e-6 : dl.x, abs(dl.y) < 1e-6 ? 1e-6 : dl.y);
  vec2 inv = 1.0 / dl;
  vec2 t1 = (-g.zw - m - ol) * inv, t2 = (g.zw + m - ol) * inv;
  vec2 tn2 = min(t1, t2), tf2 = max(t1, t2);
  float tn = max(tn2.x, tn2.y), tf = min(tf2.x, tf2.y);
  if (tn >= tf || tn <= 0.0) return c;
  c.lp = ol + dl * tn;
  float sdw = floor(b.w / 4.0);
  float Ht = b.x + (b.z >= 16.0 && b.z < 24.0 ? (b.w - sdw * 4.0) * c.lp.x : 0.0);
  float topY = YH + (Ht - camH) * FOC / (Ht >= camH ? tn : tf);
  float yBase = YH + (GND - camH) * FOC / tn;
  c.z = tn; c.tf = tf; c.ax = tn2.x > tn2.y ? 0.0 : 1.0;
  c.a = covX * sat((topY - q.y) / aaY + 0.5) * sat((q.y - yBase) / aaY + 0.5);
  c.g = g; c.b = b;
  return c;
}

float fogT(float t) { return 1.0 - exp(-max(t - 800.0, 0.0) / 5200.0); }
const vec3 HAZE = vec3(0.1, 0.073, 0.062);

vec3 shadeC(Cand c, vec2 q, float camH, float blur) {
  vec4 g = c.g, b = c.b;
  float H = b.x, tn = c.z;
  float st = mod(b.z, 8.0), top = floor(b.z / 8.0);
  float sd = floor(b.w / 4.0);
  vec3 rd = normalize(vec3(q.x, q.y - YH, FOC));
  float h = camH + (q.y - YH) * tn / FOC;
  vec2 cs = vec2(cos(b.y), sin(b.y));
  vec3 col;
  if (H < camH && h > H + 0.3) {
    // roofs of the low buildings, seen from above: plant, a few lights
    vec2 rc = floor(c.lp / 7.0);
    float hv = h12(rc + sd);
    col = vec3(0.014, 0.015, 0.019) * (0.7 + 0.6 * hv) + vec3(0.1, 0.06, 0.03) * 0.06;
    col += vec3(1.0, 0.7, 0.4) * 0.5 * step(0.93, hv) * exp(-dot(fract(c.lp / 7.0) - 0.5, fract(c.lp / 7.0) - 0.5) * 30.0);
  } else {
    vec2 nl = c.ax < 0.5 ? vec2(sign(c.lp.x), 0.0) : vec2(0.0, sign(c.lp.y));
    vec3 n = vec3(cs.x * nl.x - cs.y * nl.y, 0.0, cs.y * nl.x + cs.x * nl.y);
    float u = c.ax < 0.5 ? c.lp.y + g.w : c.lp.x + g.z;
    float W = 2.0 * (c.ax < 0.5 ? g.w : g.z);
    float cI = max(abs(dot(n.xz, normalize(vec2(q.x, FOC)))), 0.12);
    vec2 fp = vec2(max(PX, BLURX) * tn / FOC / cI, max(PX, blur) * tn / FOC);
    col = facade(u, h, W, H, fp, int(st), sd, n, rd);
    // lit crown: a band of fins at the top
    if (top == 3.0 && h > H - 22.0) {
      float fins = pulseF(u / 1.8, 0.4, fp.x / 1.8);
      vec3 cc = h11(sd * 2.9) < 0.5 ? vec3(1.0, 0.8, 0.52) : vec3(0.72, 0.86, 1.0);
      col = mix(col, cc * (0.35 + 0.9 * fins), smoothstep(H - 22.0, H - 15.0, h) * (0.6 + 0.4 * smoothstep(H - 4.0, H - 15.0, h)));
    }
    // under construction: open top floors, slab edges, work lights
    if (st == 5.0 && h > H - 46.0) {
      float slab = pulseF((h - H) / 4.0, 0.2, fp.y / 4.0);
      float wl = step(0.6, h12(vec2(floor(u / 9.0), floor((h - H) / 4.0) + sd)));
      col = mix(vec3(0.004) + wl * vec3(1.0, 0.55, 0.2) * 0.7, vec3(0.05, 0.045, 0.04) * (0.6 + wl), slab);
    }
    // uplight wash on a few towers
    col += vec3(1.0, 0.82, 0.6) * 0.1 * step(0.75, h11(sd * 4.3)) * exp(-(h - GND) / (0.2 * H));
  }
  // aerial perspective: the city-lit haze
  return mix(col, HAZE, fogT(tn));
}

// spires, masts, cranes and the warning lights on top (screen space, per tower)
void towerTop(vec2 q, float camH, float blur, vec4 g, vec4 b, inout vec4 acc, inout vec3 em) {
  float top = floor(b.z / 8.0);
  float sd = floor(b.w / 4.0);
  float H = b.x;
  float ms = FOC / g.y;                       // screen units per metre at the tower
  vec2 c0 = vec2(g.x * ms, YH + (H - camH) * ms);
  float on = blinkR(fract(cyc(LOOP / 1.5) + h11(sd * 6.1)));
  float ay = max(PX, blur);
  float hl = camH > 0.0 ? 1.0 : 0.0;
  vec3 RED = vec3(1.0, 0.05, 0.02);
  if (top == 1.0 || top == 5.0) {
    float hgt = top == 1.0 ? 96.0 : 42.0;
    float t = (q.y - c0.y) / (hgt * ms);
    if (t > -0.05 && t < 1.05 && camH > 0.0) {
      float wdt = top == 1.0 ? mix(3.8, 0.3, sat(t)) : 1.1;
      float d = abs(q.x - c0.x) - wdt * ms;
      float a = sat(0.5 - d / PX) * sat(t * hgt * ms / ay + 0.5) * sat((1.0 - t) * hgt * ms / ay + 0.5);
      vec3 sc = top == 1.0 ? mix(vec3(0.85, 0.8, 0.72) * 0.22, vec3(0.02), sat(t * 1.1)) : vec3(0.02);
      acc.rgb += (1.0 - acc.a) * sc * a;
      acc.a += (1.0 - acc.a) * a;
    }
    em += lamp(q, c0 + vec2(0.0, hgt * ms), RED, 2.2 * on, blur, hl);
    if (top == 5.0) em += lamp(q, c0 + vec2(0.0, hgt * 0.5 * ms), RED, 1.1 * on, blur, 0.6 * hl);
  } else if (top == 4.0) {
    // tower crane: mast, jib, counter-jib, cab, red lights
    vec2 cb = c0 + vec2(-6.0 * ms, 0.0);
    if (camH > 0.0) {
    float mast = max(abs(q.x - cb.x) - 1.1 * ms, abs(q.y - cb.y - 22.0 * ms) - 22.0 * ms);
    float jib = max(abs(q.x - cb.x - 19.0 * ms) - 41.0 * ms, abs(q.y - cb.y - 43.0 * ms) - 0.7 * ms);
    float apex = max(abs(q.x - cb.x) - 0.6 * ms, abs(q.y - cb.y - 47.0 * ms) - 4.0 * ms);
    float a = sat(0.5 - min(min(mast, jib), apex) / PX) * 0.9;
    acc.rgb += (1.0 - acc.a) * vec3(0.03, 0.028, 0.025) * a;
    acc.a += (1.0 - acc.a) * a;
    float cab = max(abs(q.x - cb.x - 2.5 * ms) - 1.6 * ms, abs(q.y - cb.y - 40.0 * ms) - 1.4 * ms);
    em += vec3(1.0, 0.8, 0.5) * 0.5 * sat(0.5 - cab / PX);
    }
    em += lamp(q, cb + vec2(60.0, 43.5) * ms, RED, 1.5 * on, blur, 0.8 * hl);
    em += lamp(q, cb + vec2(0.0, 51.0) * ms, RED, 1.5, blur, 0.8 * hl);
  } else {
    em += lamp(q, c0 + vec2(0.0, 2.5 * ms), RED, 1.7 * on, blur, 0.8 * hl);
  }
}

// filler rows: procedural blocks of low and mid rises following the bank
// (offset behind the bank, pitch, typical height, height of the occasional tower)
const vec4 ROWS[6] = vec4[6](
  vec4(30.0, 42.0, 17.0, 0.0), vec4(120.0, 52.0, 28.0, 80.0), vec4(260.0, 60.0, 42.0, 115.0),
  vec4(470.0, 66.0, 52.0, 140.0), vec4(760.0, 74.0, 50.0, 135.0), vec4(1150.0, 85.0, 44.0, 120.0));

// the downtown layer seen from camera height camH (CAMH, or -CAMH for the river's mirror image);
// blur widens everything vertically (rippled reflections). Returns linear premultiplied colour.
vec4 skyline(vec2 q, float camH, float blur) {
  float aa = max(0.7 * PX, BLURX);
  float aaY = max(aa, blur);
  bool mir = camH < 0.0;
  Cand c1, c2;
  c1.z = 1e9; c1.a = 0.0; c2.z = 1e9; c2.a = 0.0;
  // hand-placed towers
  for (int i = 0; i < NT; i++) {
    vec4 tc = TC[i];
    float yt = mir ? tc.z + 2.0 * CAMH * FOC / tc.w : tc.z;
    if (q.x < tc.x - aa || q.x > tc.y + aa || q.y > yt + aaY) continue;
    vec4 b = TB[i];
    pushC(c1, c2, boxHit(q, camH, TA[i], b, vec2(cos(b.y), sin(b.y)), tc.xy, aa, aaY));
  }
  // procedural rows behind the bank: the cell under the pixel and its neighbour toward the axis
  float Zb = bankZ(q.x);
  for (int r = 0; r < 6; r++) {
    if (mir && r > 3) break;
    vec4 R = ROWS[r];
    float Zr = Zb + R.x;
    float yMax = YH + (max(R.z * 1.55, R.w) * 1.2 + 6.0 - camH) * FOC / Zr;
    if (q.y > yMax + aaY) continue;
    float X0 = q.x * Zr / FOC;
    float ci = floor(X0 / R.y);
    for (int k = 0; k < 2; k++) {
      float cx = ci + (k == 0 ? 0.0 : sign(X0));
      vec4 hh = h42(vec2(cx, float(r) * 13.0 + 1.0));
      if (hh.x < 0.08) continue;
      float hw = R.y * (0.3 + 0.17 * hh.y);
      float Xc = (cx + 0.5) * R.y + (hh.z - 0.5) * (R.y * 0.5 - hw);
      float D = 14.0 + 18.0 * hh.w;
      float Zc = zFB(Xc) + R.x + D;
      float prof = 0.45 + 0.75 * exp(-(Xc + 100.0) * (Xc + 100.0) / 1.2e6);
      float Hb = (fract(hh.w * 7.31) < 0.13 ? R.w * (0.6 + 0.4 * hh.y) : R.z * (0.45 + 1.1 * hh.x)) * prof + 6.0;
      vec2 xr = FOC * vec2(min((Xc - hw) / (Zc - D), (Xc - hw) / (Zc + D)), max((Xc + hw) / (Zc - D), (Xc + hw) / (Zc + D)));
      float s7 = floor(hh.z * 7.0);
      float st = s7 < 2.0 ? 2.0 : s7 < 4.0 ? 6.0 : s7 < 5.0 ? 1.0 : s7 < 6.0 ? 0.0 : 4.0;
      pushC(c1, c2, boxHit(q, camH, vec4(Xc, Zc, hw, D), vec4(Hb, 0.0, st, floor(hh.y * 997.0 + float(r) * 131.0) * 4.0), vec2(1.0, 0.0), xr, aa, aaY));
    }
  }
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (c1.a > 0.0) {
    col = shadeC(c1, q, camH, blur) * c1.a;
    alpha = c1.a;
    if (mir && c1.a >= 0.6) { col /= c1.a; alpha = 1.0; }
    if (c1.a < (mir ? 0.6 : 0.995) && c2.a > 0.0) {
      col += (1.0 - alpha) * shadeC(c2, q, camH, blur) * c2.a;
      alpha += (1.0 - alpha) * c2.a;
    }
  }
  // spires, cranes and warning lights, hidden behind nearer surfaces
  for (int i = 0; i < NTOP; i++) {
    vec4 tc = TC[i];
    float yt = mir ? tc.z + 2.0 * CAMH * FOC / tc.w : tc.z;
    if (q.x < tc.x - 0.025 || q.x > tc.y + 0.025 || q.y > yt + 0.03) continue;
    vec4 at = vec4(0.0);
    vec3 et = vec3(0.0);
    towerTop(q, camH, blur, TA[i], TB[i], at, et);
    float vis = c1.z < tc.w - 5.0 ? 1.0 - c1.a : 1.0;
    at *= vis;
    col = at.rgb + (1.0 - at.a) * col + et * vis * (1.0 - fogT(tc.w));
    alpha = at.a + (1.0 - at.a) * alpha;
  }
  // the far bank: embankment wall, promenade lamps, riverside road, streets between the blocks
  float Xb = q.x * Zb / FOC;
  float ms = FOC / Zb;
  float yW = YH - camH * ms;                  // waterline
  float yT = YH + (GND - camH) * ms;          // top of the wall
  if (!mir) {
    vec3 bc = vec3(0.0);
    float ba = 0.0;
    float dy = YH - q.y;
    float Zg = dy > 0.0 ? (camH - GND) * FOC / dy : 1e9;
    if (q.y < yT) {
      bc = vec3(0.028, 0.02, 0.015) * (0.6 + 0.7 * vnoise(vec2(Xb / 5.0, 0.0)));
      ba = sat((q.y - yW) / aa + 0.5);
    } else if (Zg < ZCITY + 400.0) {
      float fx = Zg * PX / FOC;
      bc = carpet(vec2(q.x * Zg / FOC, Zg), vec2(fx, fx * Zg / (camH - GND)));
      bc += vec3(0.5, 0.36, 0.2) * 0.08 * exp(-(Zg - Zb) / 10.0);
      bc = mix(bc, HAZE, fogT(Zg));
      ba = 1.0 - smoothstep(ZCITY, ZCITY + 400.0, Zg);
    }
    col += (1.0 - alpha) * bc * ba;
    alpha += (1.0 - alpha) * ba;
  } else {
    // in the mirror the wall stands in front of everything
    float ba = sat((yT - q.y) / aaY + 0.5) * sat((q.y - yW) / aaY + 0.5);
    col = vec3(0.022, 0.016, 0.012) * ba + (1.0 - ba) * col;
    alpha = ba + (1.0 - ba) * alpha;
  }
  // promenade lamps every 28 m on 5 m posts
  float li = floor(Xb / 28.0 - 0.5);
  for (int k = 0; k <= 1; k++) {
    float Xl = (li + float(k)) * 28.0 + 14.0;
    float Zl = zFB(Xl) + 4.0;
    vec2 lc = vec2(Xl * FOC / Zl, YH + (GND + 5.0 - camH) * FOC / Zl);
    col += lamp(q, lc, vec3(1.0, 0.62, 0.3), 0.7 + 0.3 * h11(li + float(k)), blur, mir ? 0.0 : 0.35);
  }
  // traffic on the riverside road: white one way, red the other (the wall hides it in the mirror)
  if (!mir) {
    for (int L = 0; L < 2; L++) {
      float fl = float(L);
      float dirn = fl == 0.0 ? 1.0 : -1.0;
      float Zr = Zb + 16.0 + 6.0 * fl;
      float Xr = q.x * Zr / FOC;
      float v = 1800.0 * floor(16.0 + 4.0 * fl) / LOOP;     // loop-periodic over an 1800 m pattern
      float sg = Xr - dirn * v * TM;
      float cidx = floor(sg / 30.0);
      vec4 ch = h42(vec2(mod(cidx, 60.0), 7.0 + fl));
      if (ch.x < 0.5) {
        float Xc = (cidx + 0.2 + 0.6 * ch.y) * 30.0 + dirn * v * TM;
        vec2 lc = vec2(Xc * FOC / Zr, YH + (GND + 0.8 - camH) * FOC / Zr);
        col += lamp(q, lc, fl == 0.0 ? vec3(1.0, 0.85, 0.65) : vec3(1.0, 0.07, 0.03), fl == 0.0 ? 0.6 : 0.4, 0.0, 0.0);
      }
    }
  }
  return vec4(col, alpha);
}

vec4 layerSkyline(vec2 p) {
  vec2 q = p + PV * 0.3;
  if (q.y > 0.74) return vec4(0.0);
  return skyline(q, CAMH, 0.0);
}

// ---------------------------------------------------------------- far city
vec4 layerFar(vec2 p) {
  vec2 q = p + PV * 0.12;
  if (q.y > YH + 0.05 || q.y < YH - (CAMH - GND) * FOC / 2500.0) return vec4(0.0);
  float dy = YH - q.y;
  vec3 col = vec3(0.0);
  float a = 0.0;
  // distant hills on both flanks with scattered lights and a broadcast mast
  float hx = abs(q.x + 0.05);
  float hill = YH + 0.003 + 0.017 * smoothstep(0.35, 0.95, hx) * (0.55 + 0.6 * fbm1(q.x * 9.0 + 4.0, 4.0)) + 0.002 * (fbm1(q.x * 60.0, 3.0) - 0.5);
  float ah = sat((hill - q.y) / PX + 0.5);
  if (ah > 0.0 && dy < 0.004) {
    vec3 hc = skyCol(normalize(vec3(q.x, 0.002, FOC))) * 0.6 + vec3(0.01, 0.008, 0.01);
    vec2 cs = vec2(0.0035, 0.0017);
    vec2 g = q / cs, id = floor(g);
    vec4 hh = h42(id + 3.0);
    vec2 d = (g - id - 0.3 - 0.4 * hh.yz) * cs;
    hc += vec3(1.0, 0.62, 0.32) * step(hh.x, 0.2 * smoothstep(0.0, 0.008, hill - q.y)) * (0.15 + 0.5 * hh.w) * exp(-dot(d, d) / (PX * PX * 1.1));
    col = hc * ah;
    a = ah;
  }
  vec2 tw = vec2(0.71, YH + 0.0045 + 0.017 * smoothstep(0.35, 0.95, 0.76) * 0.9);
  float mast = max(abs(q.x - tw.x) - 0.35 * PX, abs(q.y - tw.y - 0.014) - 0.014);
  float am = sat(0.5 - mast / PX) * 0.7;
  col = col * (1.0 - am) + vec3(0.02) * am;
  a = a + (1.0 - a) * am;
  col += lamp(q, tw + vec2(0.0, 0.028), vec3(1.0, 0.05, 0.02), 1.2 * blinkR(cyc(LOOP / 2.0)), 0.0, 0.7);
  col += lamp(q, tw + vec2(0.0, 0.014), vec3(1.0, 0.05, 0.02), 0.8 * blinkR(cyc(LOOP / 2.0)), 0.0, 0.3);
  // the ground carpet from the edge of downtown to the horizon
  if (dy > 0.0) {
    float Z = (CAMH - GND) * FOC / dy;
    float fx = Z * PX / FOC;
    vec3 c = carpet(vec2(q.x * Z / FOC, Z), vec2(fx, fx * Z / (CAMH - GND)));
    // individually resolved lights, twinkling in the haze: two scattered grids
    for (int j = 0; j < 2; j++) {
      vec2 cs = j == 0 ? vec2(0.0047, 0.0021) : vec2(0.0031, 0.0016);
      vec2 g = (q + vec2(0.37, 0.11) * float(j)) / cs;
      g.x += 0.5 * mod(floor(g.y), 2.0);
      vec2 id = floor(g);
      vec4 hh = h42(id + 17.0 + 40.0 * float(j));
      vec2 d = (g - id - 0.2 - 0.6 * hh.yz) * cs;
      float twk = 0.75 + 0.25 * sin(TAU * cyc(floor(900.0 + 2000.0 * hh.y)) + hh.x * 40.0);
      float dens = (j == 0 ? 0.5 : 0.4) * smoothstep(0.0, 0.015, dy) * (0.35 + 1.3 * vnoise(q * vec2(40.0, 160.0)));
      c += step(hh.x, dens) * mix(vec3(1.0, 0.52, 0.18), vec3(0.85, 0.9, 1.0), step(0.7, hh.w))
           * (0.08 + 0.9 * pow(hh.w, 3.0)) * twk * exp(-dot(d, d) / (2.0 * PX * PX * 0.5));
    }
    float fog = 1.0 - exp(-Z / 13000.0);
    c = mix(c, mix(skyCol(normalize(vec3(q.x, 0.003, FOC))), vec3(0.13, 0.08, 0.05), 0.5), fog);
    float ag = sat(dy / PX + 0.5) * smoothstep(2500.0, 2800.0, Z);
    col = col + (1.0 - a) * c * ag;
    a = a + (1.0 - a) * ag;
  }
  return vec4(col, a);
}

// ---------------------------------------------------------------- traffic
// one moving car's lights on a road, energy-normalised against the pixel footprint:
// bk = metres behind the car's front, dl = metres off the lane centre; fs, fl = footprint
// along and across. Returns (head, tail) radiance including a fading long-exposure trail.
vec2 carLights(float bk, float dl, float fs, float fl, float trail) {
  float ss = max(fs, 0.35), sl = max(fl, 0.22);
  float gl = (exp(-0.5 * pow((dl - 0.75) / sl, 2.0)) + exp(-0.5 * pow((dl + 0.75) / sl, 2.0))) * 0.4 / sl;
  float gh = exp(-0.5 * bk * bk / (ss * ss)) * 0.4 / ss;
  float gt = exp(-0.5 * pow((bk - 4.4) / ss, 2.0)) * 0.4 / ss;
  float tr = bk > 4.4 ? exp(-(bk - 4.4) / trail) / trail * smoothstep(4.4, 4.4 + 2.0 * ss, bk) : 0.0;
  return gl * vec2(gh + 0.6 * tr, gt + 0.8 * tr);
}

// ---------------------------------------------------------------- bridge
// a suspension bridge from the right edge to the far bank: arched deck, two portal
// towers, main cables strung with lights, hangers, lamps and two-way traffic
const vec2 BA = vec2(420.0, 505.0);           // near end (x, z), off screen to the right
const vec2 BD = vec2(0.0872, 0.9962);         // along the bridge
const vec2 BE = vec2(0.9962, -0.0872);        // across (to the right)
const float BL = 1085.0;
const float BW2 = 12.0;                       // half width of the deck
const float CL = 14.5;                        // the cable planes
const float ST1 = 270.0, ST2 = 756.0;         // towers
const float HT = 183.0;                       // cable saddles
float deckH(float s) { return 20.0 + 25.0 * sin(PI * clamp(s / BL, 0.0, 1.0)); }
float cableH(float s) {
  if (s < ST1) { float t = max(s, 0.0) / ST1; return mix(deckH(0.0) + 2.0, HT, t) - 16.0 * t * (1.0 - t); }
  if (s > ST2) { float t = min((s - ST2) / (BL - ST2), 1.0); return mix(HT, deckH(BL) + 2.0, t) - 16.0 * t * (1.0 - t); }
  float u = (s - 0.5 * (ST1 + ST2)) / (0.5 * (ST2 - ST1));
  float hm = deckH(0.5 * (ST1 + ST2)) + 4.0;
  return hm + (HT - hm) * u * u;
}
vec2 bProj(float s, float l, float h, float camH) {
  vec2 P = BA + BD * s + BE * l;
  return vec2(P.x * FOC / P.y, YH + (h - camH) * FOC / P.y);
}
// where screen column dx meets the vertical plane at lateral offset l: (depth, s)
vec2 bPlane(float dx, float l) {
  float t = (dot(BA, BE) + l) / dot(vec2(dx, 1.0), BE);
  return vec2(t, dot(vec2(dx, 1.0) * t - BA, BD));
}
// depth of the bridge along screen column x (for its parallax)
float bridgeT(float x) {
  vec2 c = bPlane(x / FOC, 0.0);
  return BA.y + clamp(c.y, 0.0, BL) * BD.y;
}

vec4 bridge(vec2 q, float camH, float blur) {
  float dx = q.x / FOC;
  bool mir = camH < 0.0;
  float aa = max(0.7 * PX, BLURX), aaY = max(aa, blur);
  float dyv = YH - q.y;
  vec2 v2 = normalize(vec2(dx, 1.0));
  vec3 col = vec3(0.0);
  float a = 0.0;
  float zS = 1e9;                                     // depth of the nearest solid hit
  // deck: top surface (underside in the mirror), two fixed-point steps on the arch
  vec2 c0 = bPlane(dx, 0.0);
  float sd = c0.y, tD = 0.0, lD = 0.0;
  for (int i = 0; i < 2; i++) {
    tD = (camH - deckH(sd) + (mir ? 3.0 : 0.0)) * FOC / dyv;
    vec2 P = vec2(dx, 1.0) * tD - BA;
    sd = dot(P, BD);
    lD = dot(P, BE);
  }
  float hgt = max(abs(camH - deckH(sd)), 20.0);
  float fl = PX * tD / FOC * (abs(dot(vec2(v2.y, -v2.x), BE)) + abs(dot(v2, BE)) * tD / hgt);
  float fs = PX * tD / FOC * (abs(dot(vec2(v2.y, -v2.x), BD)) + abs(dot(v2, BD)) * tD / hgt);
  float onD = tD > 0.0 ? sat((BW2 - abs(lD)) / max(fl, 0.05) + 0.5) * sat(sd / 2.0 + 0.5) * sat((BL - sd) / 2.0 + 0.5) : 0.0;
  // the stiffening girder's face on the camera's side
  vec2 cf = bPlane(dx, -BW2);
  float hF = camH + (q.y - YH) * cf.x / FOC;
  float dh = deckH(cf.y);
  float msF = FOC / cf.x;
  float onF = sat((hF - dh + 4.0) * msF / aaY + 0.5) * sat((dh + 1.2 - hF) * msF / aaY + 0.5) * step(0.0, cf.y) * step(cf.y, BL);
  vec3 em = vec3(0.0);
  if (onD > 0.0 && (onF <= 0.0 || tD < cf.x)) {
    vec3 dc;
    if (mir) dc = vec3(0.006, 0.0055, 0.0055);
    else {
      dc = vec3(0.012, 0.0115, 0.0115);
      float sl = sd - floor(sd / 32.0 + 0.5) * 32.0;
      dc += vec3(1.0, 0.82, 0.6) * 0.05 * exp(-sl * sl / 150.0) * (exp(-pow(abs(lD) - 11.0, 2.0) / 20.0) + 0.25);
      // traffic: three lanes each way; coming lanes show headlights, going lanes tail lights
      float lane = floor((lD + 11.0) / 3.67);
      if (lane >= 0.0 && lane < 6.0) {
        float dirn = lane < 3.0 ? -1.0 : 1.0;
        float lc = -11.0 + (lane + 0.5) * 3.67;
        float v = 2400.0 * floor(26.0 + 4.0 * h11(lane * 3.3 + 1.0) + lane) / LOOP;
        float sg = sd - dirn * v * TM;
        float ci = floor(sg / 24.0);
        for (int k = 0; k < 3; k++) {
          float cid = ci + dirn * float(k);
          vec4 ch = h42(vec2(mod(cid, 100.0), lane + 21.0));
          if (ch.x > 0.25 + 0.4 * vnoise1(cid * 0.11 + lane * 5.0)) continue;
          float bk = dirn * ((cid + 0.25 + 0.5 * ch.y) * 24.0 + dirn * v * TM - sd);
          vec2 cl = carLights(bk, lD - lc, fs, fl, 10.0);
          // coming cars face the camera: their headlights glare; going cars show their tails
          em += dirn < 0.0 ? vec3(1.0, 0.9, 0.76) * (5.0 * cl.x + 0.5 * cl.y) : vec3(1.0, 0.07, 0.02) * 3.2 * cl.y + vec3(1.0, 0.9, 0.76) * 0.3 * cl.x;
        }
      }
      dc = mix(dc, vec3(0.05, 0.045, 0.04), lineCov(abs(lD) - BW2 + 0.4, 0.8, max(fl, 0.05)));
    }
    col = dc * onD;
    em *= onD;
    a = onD;
    zS = tD;
  } else if (onF > 0.0) {
    float sl = cf.y - floor(cf.y / 32.0 + 0.5) * 32.0;
    vec3 fc = vec3(0.022, 0.02, 0.019) + vec3(0.9, 0.75, 0.55) * 0.05 * exp(-sl * sl / 120.0);
    fc += vec3(0.75, 0.85, 1.0) * 0.45 * lineCov(hF - dh + 0.8, 0.3, PX / msF);   // LED line along the girder
    col = fc * onF;
    a = onF;
    zS = cf.x;
  }
  // portal towers: two legs on the cable planes, cross beams, washed with light from below
  for (int j = 0; j < 2; j++) {
    float st = j == 0 ? ST1 : ST2;
    for (int e = 0; e < 2; e++) {
      float l = e == 0 ? -CL : CL;
      vec2 P = BA + BD * st + BE * l;
      float ms = FOC / P.y;
      float xp = P.x * ms;
      float hp = camH + (q.y - YH) / ms;
      float w = mix(3.6, 2.4, sat(hp / HT));
      float d = abs(q.x - xp) - w * ms;
      float ap = sat(0.5 - d / aa) * sat((HT + 7.0 - hp) * ms / aaY + 0.5) * sat(hp * ms / aaY + 0.5);
      if (ap > 0.0 && P.y < zS + 20.0) {
        float side = (q.x - xp) / (w * ms);
        float dk = deckH(st);
        float up = 0.012 + 0.11 * exp(-max(hp - dk, 0.0) / 28.0) * step(dk - 6.0, hp) + 0.07 * exp(-hp / 9.0) + 0.05 * smoothstep(HT - 22.0, HT + 4.0, hp);
        vec3 pc = vec3(0.95, 0.8, 0.6) * up * (0.75 - 0.35 * side * float(e * 2 - 1));
        col = pc * ap + (1.0 - ap) * col;
        a = ap + (1.0 - ap) * a;
        zS = min(zS, P.y);
      }
      em += lamp(q, vec2(xp, YH + (HT + 8.0 - camH) * ms), vec3(1.0, 0.05, 0.02), 1.3 * blinkR(fract(cyc(LOOP / 1.5) + 0.37 * float(j))), blur, mir ? 0.0 : 0.7);
    }
    // cross beams between the legs
    vec2 L0 = bProj(st, -CL, 0.0, camH), L1 = bProj(st, CL, 0.0, camH);
    if (q.x > min(L0.x, L1.x) && q.x < max(L0.x, L1.x)) {
      vec2 P = BA + BD * st;
      float ms = FOC / P.y;
      float hp = camH + (q.y - YH) / ms;
      float beam = lineCov(hp - (HT + 2.0), 6.0, PX / ms) + lineCov(hp - 112.0, 4.0, PX / ms) + lineCov(hp - deckH(st) + 6.0, 5.0, PX / ms);
      beam = sat(beam);
      if (beam > 0.0 && P.y < zS + 20.0) {
        col = vec3(0.95, 0.8, 0.6) * (0.012 + 0.05 * smoothstep(HT - 30.0, HT, hp)) * beam + (1.0 - beam) * col;
        a = beam + (1.0 - beam) * a;
      }
    }
  }
  // main cables with their necklace of lights, and the hangers
  for (int e = 0; e < 2; e++) {
    float l = e == 0 ? -CL : CL;
    vec2 cp = bPlane(dx, l);
    if (cp.y < -20.0 || cp.y > BL + 20.0 || cp.x > zS + 30.0) continue;
    float ms = FOC / cp.x;
    float hc = cableH(cp.y);
    vec2 y0 = bProj(cp.y, l, hc, camH), y1 = bProj(cp.y + 3.0, l, cableH(cp.y + 3.0), camH);
    float slope = (y1.y - y0.y) / max(abs(y1.x - y0.x), 1e-6);
    float dcab = abs(q.y - y0.y) / sqrt(1.0 + slope * slope);
    float cw = 0.5 * ms;
    em += vec3(1.0, 0.86, 0.66) * 0.35 * exp(-dcab * dcab / (max(cw, 0.6 * PX) * max(cw, 0.6 * PX))) * min(cw / PX, 1.0);
    // hangers every 16 m between the cable and the deck
    float sk = floor(cp.y / 16.0 + 0.5) * 16.0;
    if (sk > 0.0 && sk < BL && abs(sk - ST1) > 8.0 && abs(sk - ST2) > 8.0) {
      vec2 hb = bProj(sk, l, deckH(sk), camH), ht = bProj(sk, l, cableH(sk), camH);
      float hw = 0.12 * ms;
      float ah = lineCov(q.x - hb.x, 2.0 * hw, PX) * step(min(hb.y, ht.y), q.y) * step(q.y, max(hb.y, ht.y));
      em += vec3(0.8, 0.78, 0.72) * 0.25 * ah;
    }
    // the lights strung along the cable
    float k0 = floor(cp.y / 16.0);
    for (int k = 0; k <= 1; k++) {
      float s = (k0 + float(k)) * 16.0 + 8.0;
      if (s < 0.0 || s > BL) continue;
      em += lamp(q, bProj(s, l, cableH(s) + 0.6, camH), vec3(1.0, 0.86, 0.62), 0.55, blur, mir ? 0.0 : 0.22);
    }
  }
  // deck lamps along both edges
  for (int e = 0; e < 2; e++) {
    float le = e == 0 ? -BW2 + 0.5 : BW2 - 0.5;
    vec2 cp = bPlane(dx, le);
    float k0 = floor(cp.y / 32.0);
    for (int k = 0; k <= 1; k++) {
      float s = (k0 + float(k)) * 32.0 + 16.0;
      if (s < 0.0 || s > BL) continue;
      em += lamp(q, bProj(s, le, deckH(s) + 8.0, camH), vec3(0.92, 0.95, 1.0), 0.45, blur, mir ? 0.0 : 0.25);
    }
  }
  float fog = fogT(c0.x);
  return vec4(mix(col, HAZE * a, fog) + em * (1.0 - fog), a);
}

vec4 layerBridge(vec2 p) {
  vec2 q = p + PV * dOfZ(bridgeT(p.x));
  if (q.x < 0.36 || q.y > 0.6) return vec4(0.0);
  return bridge(q, CAMH, 0.0);
}

// ---------------------------------------------------------------- river
const vec4 WV[${NWAV}] = vec4[${NWAV}](${WVS});
const float WF[${NWAV}] = float[${NWAV}](${WFS});

// ripple slope (resolved) and the slope variance of the waves finer than the footprint
vec4 ripples(vec2 xz, vec2 fp, float rough, float warp) {
  vec2 g = vec2(0.0), var = vec2(0.0);
  for (int i = 0; i < ${NWAV}; i++) {
    vec4 w = WV[i];
    float lam = TAU / w.z;
    float res = smoothstep(1.4, 3.0, lam / max(length(w.xy * fp), 1e-4));
    vec2 sv = w.xy * (w.z * w.w * rough);
    var += (1.0 - res) * 0.5 * sv * sv;
    if (res > 0.0) {
      float ph = w.z * dot(w.xy, xz) - TAU * cyc(WF[i]) + float(i) * 1.7 + warp * (1.0 + 0.6 * float(i));
      g += res * sv * cos(ph);
    }
  }
  return vec4(g, var);
}

vec4 layerRiver(vec2 p) {
  float d0 = YH - p.y;
  if (d0 <= 0.0) return vec4(0.0);
  float dz = dOfZ(CAMH * FOC / d0);
  vec2 q = p + PV * dz;
  float dy = YH - q.y;
  if (dy <= 0.001) return vec4(0.0);
  float Z = CAMH * FOC / dy;
  float X = q.x * Z / FOC;
  float zb = zFB(X);
  float a = 1.0 - smoothstep(zb + 25.0, zb + 70.0, Z);
  if (a <= 0.0) return vec4(0.0);
  vec3 rd = normalize(vec3(q.x, -dy, FOC));
  float fx = Z * PX / FOC, fz = fx * Z / CAMH;
  // gusts: rougher and calmer patches drifting downstream, and a slow warp of the wave phases
  vec2 gp = vec2(X / 150.0 + cyc(1.0) * 24.0, Z / 60.0);
  float rough = 0.45 + 1.0 * vnoiseP(gp, 24.0);
  float warp = 3.0 * vnoiseP(vec2(X / 23.0 + cyc(1.0) * 128.0, Z / 17.0), 128.0) + 1.6 * vnoiseP(vec2(X / 7.0 - cyc(1.0) * 256.0, Z / 6.0), 256.0);
  vec4 rp = ripples(vec2(X, Z), vec2(fx, fz), rough, warp);
  vec3 n = normalize(vec3(-rp.x, 1.0, -rp.y));
  float ndv = max(dot(n, -rd), 0.02);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // the skyline in the water: the mirrored camera, displaced and blurred by the ripples
  float k = sat(1.0 - Z / ZREF);
  vec2 qs = p + PV * 0.3;
  float sy = 2.0 * FOC * k;
  vec2 qr = vec2(qs.x + rd.y * rp.x * sy, 2.0 * YH - qs.y + rp.y * sy);
  float blur = sy * sqrt(rp.w) + 0.6 * PX;
  BLURX = abs(rd.y) * sy * sqrt(rp.z);
  vec4 sk = skyline(qr, -CAMH, blur);
  vec3 R = reflect(rd, n);
  R.y = max(R.y, 0.003);
  vec4 cl = clouds(R, 2.0);
  vec3 refl = sk.rgb + (1.0 - sk.a) * mix(skyCol(R), cl.rgb, cl.a);
  // the bridge in the water
  if (q.x > 0.36) {
    float tb = bridgeT(p.x);
    float kb = sat(1.0 - Z / tb);
    vec2 qb = p + PV * dOfZ(tb);
    BLURX = abs(rd.y) * 2.0 * FOC * kb * sqrt(rp.z);
    vec4 bm = bridge(vec2(qb.x + rd.y * rp.x * 2.0 * FOC * kb, 2.0 * YH - qb.y + rp.y * 2.0 * FOC * kb), -CAMH, 2.0 * FOC * kb * sqrt(rp.w) + 0.6 * PX);
    refl = bm.rgb + (1.0 - bm.a) * refl;
  }
  BLURX = 0.0;
  vec3 body = vec3(0.0025, 0.0038, 0.0048);
  vec3 col = mix(body, refl, F);
  // a faint warm mist over the water toward the far bank
  col += vec3(0.05, 0.036, 0.03) * 0.2 * exp(-(zb - Z) / 140.0);
  return vec4(col * a, a);
}

// ---------------------------------------------------------------- expressway
// an elevated six-lane viaduct along the near bank, seen from above and behind
float zR(float X) { return 492.0 + 0.045 * X - 0.00016 * X * X; }
const float HD = 18.0;     // deck height
const float HW = 14.0;     // half width

vec4 layerHighway(vec2 p) {
  vec2 q = p + PV;
  if (q.y > 0.15) return vec4(0.0);
  float dy = YH - q.y;
  float Zc = zR(q.x * 492.0 / FOC);
  Zc = zR(q.x * Zc / FOC);
  float slp = 0.045 - 0.00032 * q.x * Zc / FOC;
  float cphi = inversesqrt(1.0 + slp * slp);
  float Zn = Zc - HW / cphi, Zf = Zc + HW / cphi;
  float yFb = YH + (HD - 2.6 - CAMH) * FOC / Zn;   // fascia bottom
  float yNp = YH + (HD + 1.1 - CAMH) * FOC / Zn;   // near parapet top
  float yD1 = YH + (HD - CAMH) * FOC / Zf;         // deck far edge
  float yFp = YH + (HD + 1.1 - CAMH) * FOC / Zf;   // far parapet top
  float aa = 0.7 * PX;
  vec3 col;
  // below the fascia: the frontage road in front, deep shadow and piers under the deck
  float Zg = (CAMH - GND) * FOC / dy;
  float Xg = q.x * Zg / FOC;
  float latG = (Zg - zR(Xg)) * cphi;
  float fgx = Zg * PX / FOC;
  vec3 gc = vec3(0.010, 0.0095, 0.010) * (0.7 + 0.6 * vnoise(vec2(Xg / 7.0, Zg / 3.0)));
  float sl = Xg - floor(Xg / 30.0 + 0.5) * 30.0;
  gc += vec3(1.0, 0.55, 0.2) * 0.07 * exp(-(sl * sl + pow(latG + 34.0, 2.0)) / 90.0);    // sodium pools
  gc += vec3(0.9, 0.85, 0.75) * 0.05 * lineCov(latG + 30.0, 0.15, fgx * 4.0) * pulseF(Xg / 9.0, 0.5, fgx / 9.0);
  gc *= latG > -HW ? 0.3 : 1.0;
  // traffic on the frontage road
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float dirn = fl == 0.0 ? 1.0 : -1.0;
    float lc = -36.0 + 4.0 * fl;
    float v = 1200.0 * floor(14.0 + 3.0 * fl) / LOOP;
    float sg = Xg - dirn * v * TM;
    float ci = floor(sg / 28.0);
    vec4 ch = h42(vec2(mod(ci, 1200.0 / 28.0 * 2.0), 31.0 + fl));
    if (ch.x < 0.35) {
      float bk = dirn * ((ci + 0.3 + 0.4 * ch.y) * 28.0 + dirn * v * TM - Xg);
      vec2 cl = carLights(bk, latG - lc, fgx, fgx * Zg / (CAMH - GND), 5.0);
      gc += fl == 0.0 ? vec3(1.0, 0.88, 0.7) * 1.6 * cl.x : vec3(1.0, 0.06, 0.02) * 1.6 * cl.y;
    }
  }
  col = gc;
  // piers: two columns per bent every 36 m, lit warm from below
  float Xp = q.x * Zn / FOC;
  float bi = floor(Xp / 36.0 + 0.5);
  float Xb = bi * 36.0;
  float Zpc = zR(Xb) - 6.0;
  float xc = Xb * FOC / Zpc;
  float dc = abs(q.x - xc) - 1.3 * FOC / Zpc;
  float apr = sat(0.5 - dc / aa) * sat((q.y - (YH + (GND - CAMH) * FOC / Zpc)) / aa + 0.5);
  float hy = CAMH + (q.y - YH) * Zpc / FOC;
  col = mix(col, vec3(0.03, 0.024, 0.02) * (0.3 + 0.8 * exp(-(hy - GND) / 4.0)) * (0.8 + 0.4 * (q.x - xc) * Zpc / FOC / 1.3), apr);
  // fascia and the near parapet's outer face
  float aF = sat((q.y - yFb) / aa + 0.5);
  float Xn = q.x * Zn / FOC;
  float lsl = Xn - floor(Xn / 42.0 + 0.5) * 42.0;
  vec3 fc = vec3(0.045, 0.04, 0.036) * (0.8 + 0.3 * exp(-lsl * lsl / 400.0));
  fc = mix(fc, vec3(0.012), lineCov(q.y - YH - (HD - 0.2 - CAMH) * FOC / Zn, 0.0006, PX));
  fc += vec3(0.75, 0.85, 1.0) * 0.18 * lineCov(q.y - YH - (HD - 2.2 - CAMH) * FOC / Zn, 0.0004, PX);   // LED line
  col = mix(col, fc, aF);
  // deck surface beyond the near parapet
  float aD = sat((q.y - yNp) / aa + 0.5);
  if (aD > 0.0) {
    float Zd = (CAMH - HD) * FOC / dy;
    float Xd = q.x * Zd / FOC;
    float lat = (Zd - zR(Xd)) * cphi;
    float fx = Zd * PX / FOC;
    float fl = fx * 0.3 + fx * Zd / (CAMH - HD) * cphi;
    vec3 dc = vec3(0.011, 0.0105, 0.0105) * (0.85 + 0.3 * vnoise(vec2(Xd / 3.0, lat)));
    float li = floor(Xd / 42.0 + 0.5);
    float dL = Xd - li * 42.0;
    dc += vec3(1.0, 0.8, 0.56) * 0.07 * exp(-(dL * dL + lat * lat * 0.6) / 300.0);
    dc += vec3(0.3, 0.28, 0.25) * 0.1 * pulseF(lat / 3.7 + 0.03, 0.05, fl / 3.7) * pulseF(Xd / 12.0, 0.4, fx / 12.0);
    dc = mix(dc, vec3(0.04, 0.037, 0.034), lineCov(lat, 0.8, fl));      // median barrier
    // traffic: three lanes each way with long-exposure trails
    vec3 tr = vec3(0.0);
    float lane = floor((lat + 11.0) / 3.67);
    if (lane >= 0.0 && lane < 6.0) {
      float dirn = lane < 3.0 ? -1.0 : 1.0;
      float lc = -11.0 + (lane + 0.5) * 3.67;
      float v = 1600.0 * floor(30.0 + 6.0 * h11(lane * 3.3) + 2.0 * abs(lane - 2.5)) / LOOP;
      float sg = Xd - dirn * v * TM;
      float ci = floor(sg / 22.0);
      for (int k = 0; k < 3; k++) {
        float cid = ci + dirn * float(k);
        vec4 ch = h42(vec2(mod(cid, 1600.0 / 22.0 * 4.0), lane + 5.0));
        if (ch.x > 0.25 + 0.45 * vnoise1(cid * 0.13 + lane * 7.0)) continue;
        float bk = dirn * ((cid + 0.25 + 0.5 * ch.y) * 22.0 + dirn * v * TM - Xd);
        vec2 cl = carLights(bk, lat - lc, fx, fl, 9.0);
        float pool = exp(-pow((bk + 9.0) / 6.0, 2.0) - (lat - lc) * (lat - lc) / 3.0);
        if (dirn < 0.0) tr += vec3(1.0, 0.9, 0.74) * (2.2 * cl.x + 0.06 * pool) + vec3(1.0, 0.06, 0.02) * 1.0 * cl.y;
        else tr += vec3(1.0, 0.06, 0.02) * 2.4 * cl.y + vec3(1.0, 0.9, 0.74) * (0.9 * cl.x + 0.04 * pool);
      }
    }
    dc += tr;
    col = mix(col, dc, aD);
  }
  // the far parapet
  float aP = sat((q.y - yD1) / aa + 0.5);
  col = mix(col, vec3(0.034, 0.031, 0.028), aP);
  // median lamp posts (12 m) with glowing heads
  float Xm = q.x * Zc / FOC;
  float mi = floor(Xm / 42.0);
  vec3 em = vec3(0.0);
  float aPole = 0.0;
  for (int k = 0; k <= 1; k++) {
    float Xl = (mi + float(k)) * 42.0;
    float Zl = zR(Xl);
    float ms = FOC / Zl;
    vec2 head = vec2(Xl * ms, YH + (HD + 12.0 - CAMH) * ms);
    float dpole = abs(q.x - head.x) - 0.18 * ms;
    aPole = max(aPole, sat(0.5 - dpole / aa) * 0.8 * step(YH + (HD - CAMH) * ms, q.y) * step(q.y, head.y));
    em += lamp(q, head + vec2(-1.2 * ms, 0.0), vec3(1.0, 0.82, 0.58), 1.1, 0.0, 0.55);
    em += lamp(q, head + vec2(1.2 * ms, 0.0), vec3(1.0, 0.82, 0.58), 1.1, 0.0, 0.55);
  }
  float aTop = sat((yFp - q.y) / aa + 0.5);
  col = mix(col, vec3(0.035, 0.032, 0.03), aPole);
  float al = max(aTop, aPole);
  return vec4(col * al + em, al);
}

// ---------------------------------------------------------------- compositing
vec4 layerK(int k, vec2 p) {
  if (k == 0) return layerSky(p);
  if (k == 1) return layerClouds(p);
  if (k == 2) return layerAir(p);
  if (k == 3) return layerFar(p);
  if (k == 4) return layerSkyline(p);
  if (k == 5) return layerRiver(p);
  if (k == 6) return layerBridge(p);
  return layerHighway(p);
}

void main() {
  PX = 1.0 / u_res.y;
  TM = mod(u_time, LOOP);
  PV = u_par * PAR;
  BLURX = 0.0;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.3 * smoothstep(0.12, 0.62, dot(vq, vq) * 1.6);
  float dither = (h12(gl_FragCoord.xy + fract(TM) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;
  if (u_layer > -0.5) {
    vec4 c = layerK(int(u_layer + 0.5), p);
    float al = max(c.a, sat(max(c.r, max(c.g, c.b)) * 3.0));
    vec3 d = al > 0.0 ? display(c.rgb / max(al, 1e-4)) * al : vec3(0.0);
    fragColor = vec4(d + dither * al, al);
    return;
  }
  // front to back in linear light, skipping what is already hidden
  vec3 acc = vec3(0.0);
  float T = 1.0;
  for (int k = 7; k >= 0; k--) {
    vec4 c = layerK(k, p);
    acc += T * c.rgb;
    T *= 1.0 - c.a;
    if (T < 0.002) break;
  }
  fragColor = vec4(display(acc) + dither, 1.0);
}
`,
}
