// Storm Light: a lighthouse on a rocky headland in a gale at dusk.
// A low storm deck racing over the sea, its ragged edge breaking open above a
// cold silver strip of twilight on the horizon; scud and rain curtains below it,
// and now and then lightning lighting the cloud base from inside. Heavy swells
// (ray-marched height field, Fresnel sky reflection, green translucency in the
// backlit crests, whitecaps that trail foam, wind streaks, spindrift torn off
// the crests) roll in and explode against the headland, where the lighthouse
// sweeps two beams through the rain (an analytic single-scattering cone).
//
// Every layer is lit in linear HDR. The full scene composites the layers
// front to back in linear light and tone-maps once (ACES fit), so beams, rain
// and spray add physically; an isolated layer (u_layer = k) is tone-mapped on
// its own, premultiplied.
//
// Time: one master loop (LOOP s). Every wave frequency, rotation, drift and
// event is quantised to it, so u_time can grow forever without losing
// precision and the loop wraps seamlessly.

const LOOP = 1200
const TAU = Math.PI * 2
const G = 9.81
const f = (x) => x.toFixed(5)
const fl = (x) => x.toFixed(1)
function i0(x) {
  let s = 1
  let t = 1
  for (let k = 1; k < 30; k++) {
    t *= (x / 2) ** 2 / (k * k)
    s += t
  }
  return s
}
// swells that shape the surface (ray-marched): wavelength (m), heading (deg:
// 0 = toward the camera, + = toward the right), amplitude (m), crest sharpness
const SWELLS = [
  [118, 24, 2.1, 1.6],
  [82, 8, 1.25, 1.5],
  [150, 38, 1.35, 1.2],
  [52, 44, 0.78, 2.1],
  [34, 14, 0.55, 2.2],
]
const geo = SWELLS.map(([lam, hd, A, s]) => {
  const k = TAU / lam
  const a = (hd * Math.PI) / 180
  return { dx: Math.sin(a), dz: -Math.cos(a), k, A, s, mean: Math.exp(-s) * i0(s), m: Math.round((Math.sqrt(G * k) * LOOP) / TAU) }
})
// wind sea for the normals: 18 waves, 26 m down to 10 cm, spreading wider as they shorten
let seed = 11
const rnd = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const det = []
for (let i = 0; i < 18; i++) {
  const lam = 26 * 0.72 ** i
  const k = TAU / lam
  const spread = 22 + 50 * (i / 17)
  const a = ((58 + (rnd() - 0.5) * 2 * spread) * Math.PI) / 180
  const slope = 0.058 * (1 - 0.3 * (i / 17)) * (0.75 + 0.5 * rnd()) * (i < 4 ? 0.45 + 0.15 * i : 1)
  det.push({ dx: Math.sin(a), dz: -Math.cos(a), k, A: slope / k, m: Math.round((Math.sqrt(G * k) * LOOP) / TAU) })
}
const WAVES = `
const vec4 WG[5] = vec4[5](${geo.map((w) => `vec4(${f(w.dx)}, ${f(w.dz)}, ${f(w.k)}, ${f(w.A)})`).join(', ')});
const float WGS[5] = float[5](${geo.map((w) => f(w.s)).join(', ')});
const float WGA[5] = float[5](${geo.map((w) => f(w.mean)).join(', ')});
const float WGM[5] = float[5](${geo.map((w) => fl(w.m)).join(', ')});
const vec4 WD[18] = vec4[18](${det.map((w) => `vec4(${f(w.dx)}, ${f(w.dz)}, ${f(w.k)}, ${f(w.A)})`).join(', ')});
const float WDM[18] = float[18](${det.map((w) => fl(w.m)).join(', ')});
`

export default {
  id: 'stormlight',
  name: 'Storm Light',
  tag: 'Lighthouse in a gale',
  accent: '#f2c46b',
  accent2: '#5f93a6',
  ink: '#1f5466',
  glow: '#ffe2a8',
  light: false,
  clockColor: '#eef3f7',
  sky: 'linear-gradient(180deg,#14181e 0%,#1b2128 30%,#29323a 46%,#6d7f88 53%,#25313a 56%,#141c21 72%,#0b1114 100%)',
  stillTime: 46,
  // back -> front; index = u_layer value
  layers: [
    { name: 'Storm sky', depth: 0 },
    { name: 'Open sea', depth: 0.12 },
    { name: 'Rain curtains', depth: 0.2 },
    { name: 'Headland and lighthouse', depth: 0.38 },
    { name: 'Breaking surf', depth: 0.39 },
    { name: 'Lighthouse beam', depth: 0.4 },
    { name: 'Near swells', depth: 0.8 },
    { name: 'Rain', depth: 1.2 },
  ],
  clockAfter: 2,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float YH = 0.45;       // horizon height on screen
const float FOC = 1.6;       // focal length in screen heights
const float CAMH = 11.0;     // camera height above mean sea level (m)
const float LOOP = ${LOOP}.0;   // master loop (s)
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float ZSPLIT = 150.0;  // near / open sea layer split (m)
const float ZFAR = 6500.0;   // the height field is marched out to here
const float HMAX = 5.6;      // highest crest the march looks for (m)
const float HMIN = 3.9;      // deepest trough (m)
const float HC = 900.0;      // storm deck base (m)
const float HS = 360.0;      // scud (m)
const float HDP = 0.38;      // headland parallax depth
const float TX = 0.40;       // lighthouse (screen x)
const vec2 SUNP = vec2(-0.42, 0.532);     // the low sun, hidden behind the deck edge
const vec3 SUNC = vec3(0.95, 0.96, 0.93); // cold, silvered by the cloud
const vec3 LAMPC = vec3(1.0, 0.80, 0.52);
const vec3 FLC = vec3(0.72, 0.78, 1.0);
const vec3 AMB = vec3(0.064, 0.072, 0.082);   // overcast skylight
const vec2 WIND = vec2(0.848, -0.530);        // wind (travel direction, xz)
const float EXPO = 1.0;
${WAVES}
float Tw;     // wrapped time
float PX;     // one pixel in screen-height units
float VIG;    // vignette
vec3 SUN;     // direction of the hidden sun
float GAPI;   // brightness of the cloud break (slow cycle)
float FL;     // lightning, now
float BOLT;   // a bolt is visible
vec2 FLS;     // flash position on screen
vec3 FLW;     // flash position in the cloud (m)
float FSEED;
float TB, TZ; // lighthouse base (screen y) and distance (m)
vec3 LAMP;    // lantern (m)
vec3 BD;      // beam direction
float LGLOW;  // how much of a beam faces the camera
float WGT[5], WGC[5], WDT[18];

// ---------------------------------------------------------------- noise
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float zig1(float x) { float i = floor(x); return mix(h11(i), h11(i + 1.0), x - i); }
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
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h12(i), b = h12(i + vec2(1.0, 0.0)), c = h12(i + vec2(0.0, 1.0)), d = h12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
// piecewise-linear fbm: angular, like broken rock
float fbmZ(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, zig1(x), clamp(oct - fi, 0.0, 1.0));
    x = x * 2.13 + 1.7;
    a *= 0.52;
  }
  return s + a;
}
float fbm1(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoise1(x), clamp(oct - fi, 0.0, 1.0));
    x = x * 2.03 + 1.7;
    a *= 0.5;
  }
  return s + a;
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoise(p), clamp(oct - fi, 0.0, 1.0));
    p = ROT * p + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return s + a;
}
// x-periodic fbm (a shear keeps every octave periodic)
float fbmP(vec2 p, float per, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoiseP(p, per), clamp(oct - fi, 0.0, 1.0));
    p = vec2(2.0 * p.x + 0.73 * p.y, 2.0 * p.y + 5.31);
    per *= 2.0;
    a *= 0.5;
  }
  return s + a;
}
// billowy cloud fbm, x-periodic
float CLLOW;   // fbmCl's sum after its first two octaves
float fbmCl(vec2 p, float per, float oct) {
  float s = 0.0, a = 0.5;
  CLLOW = 0.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (i == 2) CLLOW = s + a;
    if (fi >= oct) break;
    float v = vnoiseP(p, per);
    if (i >= 2) v = 1.0 - abs(2.0 * v - 1.0) * 0.9 - 0.05;
    s += a * mix(0.5, v, clamp(oct - fi, 0.0, 1.0));
    p = p * 2.0 + vec2(17.31, 5.31);
    per *= 2.0;
    a *= i < 1 ? 0.5 : 0.56;
  }
  return s + a;
}
vec3 fbmD(vec2 p, float oct) {
  vec3 s = vec3(0.0);
  float a = 0.5;
  mat2 J = mat2(1.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float w = clamp(oct - fi, 0.0, 1.0);
    vec3 n = vnoiseD(p);
    s.x += a * mix(0.5, n.x, w);
    s.yz += a * w * (transpose(J) * n.yz);
    p = ROT * p + vec2(3.1, 1.7);
    J = ROT * J;
    a *= 0.5;
  }
  s.x += a;
  return s;
}
float octFor(float freq) { return clamp(log2(1.0 / (2.5 * PX * freq)), 1.0, 8.0); }
float erfA(float x) { return tanh(1.202 * clamp(x, -6.0, 6.0)); }

// ---------------------------------------------------------------- colour
vec3 display(vec3 c) {
  c *= EXPO * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

// ---------------------------------------------------------------- sky
// the cold strip of clear twilight under the deck's ragged western edge
float stripMask(float sx) { return smoothstep(0.1, -0.26, sx); }
float edgeY(float sx) { return 0.058 * stripMask(sx) * (0.75 + 0.5 * vnoise1(sx * 3.0 + 1.0)); }
vec3 hazeC(float sx) {
  float S = stripMask(sx);
  vec3 lit = vec3(0.50, 0.58, 0.64) * (0.38 + 0.62 * exp(-abs(sx - SUNP.x) * 1.8)) * GAPI;
  return mix(vec3(0.05, 0.057, 0.065), lit, S * 0.92) + FLC * FL * 0.025;
}
vec3 clearSky(vec3 rd, float blur) {
  float iz = 1.0 / max(rd.z, 0.05);
  float sy = rd.y * iz * FOC, sx = rd.x * iz * FOC;
  float mu = max(dot(rd, SUN), 0.0);
  vec3 c = mix(vec3(0.58, 0.68, 0.75), vec3(0.13, 0.19, 0.26), smoothstep(0.0, 0.07, sy));
  c *= 0.38 + 0.62 * exp(-abs(sx - SUNP.x) * 1.8);
  c += SUNC * (0.2 * pow(mu, 24.0) + 0.8 * pow(mu, 160.0) + 4.0 * pow(mu, 1600.0));
  // thin far cloud bars lying along the horizon (not resolved in rough reflections)
  if (blur < 0.006 && sy < 0.06) {
    float bx = sx - Tw * (2.0 / LOOP);
    float bars = smoothstep(0.55, 0.8, vnoiseP(vec2(bx * 4.0, sy * 230.0), 8.0)) * smoothstep(0.004, 0.012, sy) * smoothstep(0.06, 0.03, sy);
    bars = max(bars, 0.6 * smoothstep(0.6, 0.85, vnoiseP(vec2(bx * 9.0, sy * 520.0 + 7.0), 18.0)) * smoothstep(0.0, 0.004, sy) * smoothstep(0.03, 0.01, sy));
    c *= 1.0 - 0.55 * bars * smoothstep(0.006, 0.001, blur);
  }
  return c * GAPI;
}
// the storm deck seen from below: (colour, coverage)
vec4 deckClouds(vec3 rd, float octMax, float blur) {
  float iz = 1.0 / max(rd.z, 0.05);
  float sy = rd.y * iz * FOC, sx = rd.x * iz * FOC;
  float ry = max(rd.y, 0.0012);
  float D = (HC - CAMH) / ry;
  // dome projection: the lumpy base hangs down, so features keep some height
  // toward the horizon instead of flattening into streaks
  float Dd = (HC - CAMH) / (ry + 0.11);
  vec2 c = rd.xz * Dd * (1.0 / 520.0);
  c.x -= Tw * (16.0 / LOOP);                        // 16 cells per loop
  float fpc = Dd * (PX / FOC + blur) * inversesqrt(ry + 0.11) / 520.0;
  float oct = clamp(log2(0.5 / fpc), 1.0, octMax);
  vec2 wp = octMax > 3.0 ? vec2(vnoiseP(c * 0.5, 8.0), vnoiseP(c * 0.5 + vec2(0.0, 5.2), 8.0)) - 0.5 : vec2(vnoiseP(c * 0.5, 8.0) - 0.5, 0.0);
  c += wp * 1.05;
  float n = fbmCl(c, 16.0, oct);
  // relief of the lumpy base, lit from the break (toward -x, +z)
  float relief = 0.0;
  if (octMax > 3.0) {
    float lo = CLLOW;
    relief = clamp((lo - fbmCl(c + vec2(-0.03, 0.11), 16.0, 2.0)) * 5.0, -1.0, 1.0);
  }
  float S = stripMask(sx);
  float e = sy - edgeY(sx);
  float dens = smoothstep(0.47, 0.66, n + 7.0 * e + 0.55 * (1.0 - S));
  float thick = smoothstep(0.38, 0.76, n);
  vec3 col = mix(vec3(0.058, 0.064, 0.074), vec3(0.011, 0.013, 0.018), thick);
  col *= (1.0 + 0.7 * relief) * (1.0 - 0.3 * smoothstep(-0.1, 0.7, sx));   // the storm is darkest to the right
  // the base near the edge is lit from below by the clear sky and the bright sea
  col += vec3(0.24, 0.29, 0.32) * 0.17 * S * exp(-max(e, 0.0) / 0.03) * (0.7 + 0.5 * relief) * GAPI;
  // silver lining: thin cloud near the hidden sun
  float mu = max(dot(rd, SUN), 0.0);
  col += SUNC * GAPI * (1.0 - thick) * (0.03 * pow(mu, 60.0) + 1.6 * pow(mu, 400.0)) * (0.3 + 2.6 * dens * (1.0 - dens));
  // lightning inside the deck
  if (FL > 0.0) col += FLC * FL * (0.45 + 0.55 * thick) * (1.0 + 0.4 * relief) * (0.7 * exp(-length(rd.xz * D - FLW.xz) / 2300.0) + 0.025);
  // aerial perspective (the air toward the break is lit, but the deck stays heavy)
  col = mix(col, mix(hazeC(sx), vec3(0.05, 0.057, 0.065), 0.45), 1.0 - exp(-D / 20000.0));
  return vec4(col, dens);
}
// ragged scud racing under the deck
vec4 scud(vec3 rd, float octMax) {
  if (rd.y < 0.0015) return vec4(0.0);
  float D = (HS - CAMH) / rd.y;
  float Dd = (HS - CAMH) / (rd.y + 0.05);
  vec2 c = rd.xz * Dd * (1.0 / 240.0);
  c.x -= Tw * (64.0 / LOOP);                        // 64 cells per loop
  float fpc = Dd * PX / FOC * inversesqrt(rd.y + 0.05) / 240.0;
  float oct = clamp(log2(0.5 / fpc), 1.0, octMax);
  float wq = vnoiseP(c * 0.5, 32.0) - 0.5;
  c += wq * vec2(1.6, -0.9);
  float patchy = vnoiseP(c * 0.125, 8.0);
  float n = fbmP(c * vec2(1.0, 1.4), 64.0, oct);
  float dens = smoothstep(0.62, 0.84, n + 0.5 * (patchy - 0.5));
  if (dens <= 0.0) return vec4(0.0);
  float iz = 1.0 / max(rd.z, 0.05);
  float sx = rd.x * iz * FOC;
  float mu = max(dot(rd, SUN), 0.0);
  vec3 col = vec3(0.02, 0.023, 0.028) * (0.8 + 0.4 * n) + hazeC(sx) * 0.035 * stripMask(sx);
  col += SUNC * GAPI * (1.0 - dens) * (0.06 * pow(mu, 30.0) + 1.2 * pow(mu, 300.0));
  if (FL > 0.0) col += FLC * FL * 0.25 * exp(-length(rd.xz * D - FLW.xz * (HS / HC)) / 2500.0);
  col = mix(col, hazeC(sx), 1.0 - exp(-D / 12000.0));
  return vec4(col, dens * 0.8 * smoothstep(0.0015, 0.02, rd.y));
}
// a forked bolt from the cloud base to the sea
vec3 bolt(vec2 p) {
  float yt = FLS.y, yb = YH - 0.0015;
  if (p.y > yt + 0.01 || p.y < yb - 0.01 || abs(p.x - FLS.x) > 0.12) return vec3(0.0);
  float sd = FSEED * 13.7;
  float sc = yt - yb;
  float glow = 0.0, core = 0.0;
  for (int b = 0; b < 2; b++) {
    float fb = float(b);
    // the branch splits off a third of the way down and fades out
    float y0 = b == 0 ? yt : yt - sc * (0.25 + 0.2 * h11(sd + 3.0));
    float y1 = b == 0 ? yb : y0 - sc * (0.25 + 0.2 * h11(sd + 5.0));
    if (p.y > y0 || p.y < y1) continue;
    float u = (y0 - p.y) / sc;
    float x0 = FLS.x;
    if (b == 1) {
      float ub = (yt - y0) / sc;
      x0 = FLS.x + 0.05 * (vnoise1(ub * 3.0 + sd) - 0.5) + 0.03 * (fbm1(ub * 9.0 + sd, 3.0) - 0.5) * 2.0;
    }
    float dir = b == 0 ? 0.0 : (h11(sd + 7.0) < 0.5 ? -1.0 : 1.0);
    float xs = x0 + dir * 0.045 * u + 0.05 * (vnoise1(u * 3.0 + sd + fb * 9.0) - 0.5);
    float jag = 0.0, amp = 0.012, fr = 9.0;
    for (int k = 0; k < 4; k++) { jag += amp * (zig1(u * fr + sd + fb * 31.0 + float(k) * 7.3) - 0.5); amp *= 0.5; fr *= 2.3; }
    float d = abs(p.x - xs - jag);
    float w = (b == 0 ? 1.0 : 0.6) * (1.0 - 0.5 * u);
    float fade = b == 0 ? 1.0 : smoothstep(y1, y0 - 0.3 * (y0 - y1), p.y) * 0.7;
    core = max(core, fade * smoothstep(1.4 * PX * w, 0.3 * PX * w, d));
    glow += fade * w * (exp(-d / 0.0025) * 0.35 + exp(-d / 0.014) * 0.08);
  }
  return FLC * BOLT * (core * 9.0 + glow * 2.5);
}

vec4 layerSky(vec2 p) {
  float sy = p.y - YH;
  if (sy < -0.002) return vec4(hazeC(p.x), 1.0);   // behind the sea
  vec3 rd = normalize(vec3(p.x, max(sy, 0.0), FOC));
  vec3 c = clearSky(rd, 0.0);
  vec4 dk = deckClouds(rd, 6.5, 0.0);
  c = mix(c, dk.rgb, dk.a);
  if (BOLT > 0.0) c += bolt(p);
  vec4 sc = scud(rd, 4.0);
  c = mix(c, sc.rgb, sc.a);
  // spray-laden air low over the sea
  c = mix(c, hazeC(p.x), 0.75 * exp(-max(sy, 0.0) / 0.012));
  return vec4(c, 1.0);
}

// crepuscular shafts fanning down from the hidden sun
float shafts(vec2 q) {
  vec2 d = q - SUNP;
  float r = length(d);
  float ang = atan(d.x, -d.y);
  float drift = 2.0 * sin(TAU * Tw / LOOP);
  float rays = smoothstep(0.3, 0.85, vnoise(vec2(ang * 11.0, drift)));
  rays *= 0.55 + 0.45 * vnoise(vec2(ang * 31.0, drift * 1.7 + 4.0));
  float fan = smoothstep(1.35, 0.35, abs(ang - 0.3));
  return rays * fan * smoothstep(0.0, 0.05, r) * exp(-r / 0.42) * GAPI;
}

// ---------------------------------------------------------------- rain curtains and shafts (layer 2)
vec4 layerVeils(vec2 p) {
  vec2 q = p + u_par * PAR * 0.2;
  float sy = q.y - YH;
  if (sy > 0.2 || sy < -0.006) return vec4(0.0);
  float xs = q.x + 0.32 * sy - Tw * (4.0 / LOOP);
  float m = smoothstep(0.42, 0.8, vnoiseP(vec2(xs * 2.5, 0.5), 10.0)) * (0.45 + 0.55 * smoothstep(-0.3, 0.3, q.x));
  float st = vnoiseP(vec2(xs * 70.0, sy * 5.0), 280.0) * 0.6 + vnoiseP(vec2(xs * 190.0, sy * 9.0 + 3.0), 760.0) * 0.4;
  float vf = smoothstep(0.16, 0.03, sy) * smoothstep(-0.006, -0.001, sy);
  float a = m * vf * (0.3 + 0.55 * st);
  float S = stripMask(q.x);
  vec3 c = vec3(0.064, 0.071, 0.079) + hazeC(q.x) * 0.45 * S + FLC * FL * 0.05;
  vec3 col = c * a;
  // shafts: lit air below the deck edge, over the far sea
  float below = smoothstep(0.004, -0.012, sy - edgeY(q.x));
  col += SUNC * 0.3 * shafts(q) * below * (1.0 - 0.5 * a);
  return vec4(col, a);
}

// ---------------------------------------------------------------- headland shapes
float footZ(float x) { return mix(300.0, 188.0, smoothstep(0.17, 0.95, x)); }
float footY(float x) { return YH - CAMH * FOC / footZ(x); }
float hlH(float x, float oct) {
  float t = x - 0.185;
  if (t < 0.0) return -1.0 + t * 300.0;
  float h = 17.0 * smoothstep(0.0, 0.014, t) + 7.5 * smoothstep(0.008, 0.055, t) - 3.5 * exp(-pow((t - 0.09) / 0.022, 2.0)) + 9.0 * smoothstep(0.26, 0.62, t);
  float r = 3.4 * (fbm1(x * 16.0 + 3.0, min(oct, 3.0)) - 0.5) + 2.0 * (fbmZ(x * 60.0 + 1.0, oct - 2.0) - 0.5);
  float lev = smoothstep(0.085, 0.065, abs(x - 0.445));   // levelled ground for the lighthouse and the house
  return h + r * (1.0 - lev) * smoothstep(0.0, 0.035, t);
}
float hlTop(float x, float oct) { return footY(x) + hlH(x, oct) * FOC / footZ(x); }

// ---------------------------------------------------------------- sea
void initWaves() {
  float tl = Tw / LOOP;
  for (int i = 0; i < 5; i++) { WGC[i] = WGM[i] * tl; WGT[i] = TAU * fract(WGC[i]) + float(i) * 2.1; }
  for (int i = 0; i < 18; i++) WDT[i] = TAU * fract(WDM[i] * tl) + float(i) * 1.7;
}
// swell height (for the march): sharp-crested exp(sin) profiles with drag
float seaH(vec2 xz) {
  float h = 0.0;
  vec2 pp = xz;
  for (int i = 0; i < 5; i++) {
    vec4 w = WG[i];
    float ph = w.z * dot(w.xy, pp) - WGT[i];
    float e = exp(WGS[i] * (sin(ph) - 1.0));
    h += w.w * 2.0 * (e - WGA[i]);
    pp += w.xy * (w.w * e * cos(ph)) * 0.6;
  }
  return h;
}
// swell gradient and height; ci = crest coordinates of the two largest swells
// (cycles since a crest passed, position along the crest)
vec3 seaGeo(vec2 xz, out vec4 ci) {
  vec2 g = vec2(0.0);
  float h = 0.0;
  vec2 pp = xz;
  ci = vec4(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 w = WG[i];
    float ph = w.z * dot(w.xy, pp) - WGT[i];
    float sn = sin(ph), cs = cos(ph);
    float e = exp(WGS[i] * (sn - 1.0));
    h += w.w * 2.0 * (e - WGA[i]);
    g += (w.w * 2.0 * WGS[i] * e * cs * w.z) * w.xy;
    if (i < 2) {
      float u = WGC[i] + (0.5 * PI + float(i) * 2.1 - w.z * dot(w.xy, pp)) / TAU;
      float al = dot(vec2(-w.y, w.x), pp);
      if (i == 0) ci.xy = vec2(u, al); else ci.zw = vec2(u, al);
    }
    pp += w.xy * (w.w * e * cs) * 0.6;
  }
  return vec3(g, h);
}
// wind sea: gradient, filtered slope variance, height. Waves below the pixel
// footprint fade out and hand their slope variance to the glints.
vec4 seaDetail(vec2 pos, vec2 fp) {
  vec2 g = vec2(0.0);
  float var = 0.0, h = 0.0;
  vec2 pp = pos;
  for (int i = 0; i < 18; i++) {
    vec4 wv = WD[i];
    float sv = 0.5 * wv.w * wv.w * wv.z * wv.z;
    float w = smoothstep(1.5, 3.5, TAU / wv.z / max(length(wv.xy * fp), 1e-5));
    if (w <= 0.0) { var += sv * (18.0 - float(i)) * 0.8; break; }
    float ph = wv.z * dot(wv.xy, pp) - WDT[i];
    float e = exp(sin(ph) - 1.0);
    float dh = 2.0 * wv.w * e * cos(ph);
    h += w * 2.0 * wv.w * (e - 0.4658);
    g += w * dh * wv.z * wv.xy;
    var += (1.0 - w) * sv;
    pp += wv.xy * dh * 0.4 * w;
  }
  return vec4(g, var, h);
}
// whitecaps: a breaking crest spills foam down its face and leaves a fading trail
float crestFoam(float u, float al, float M, float sd) {
  float age = fract(u);
  float id = floor(u) + (age > 0.82 ? 1.0 : 0.0);
  id = mod(id, M);
  float B = smoothstep(0.42, 0.78, vnoise(vec2(al * 0.02 + id * 7.31, id * 1.93 + sd)));
  float spill = smoothstep(0.88, 0.985, age) * (1.0 - smoothstep(0.996, 1.0, age));
  float trail = age < 0.82 ? exp(-age / 0.11) + 0.2 * exp(-age / 0.4) : 0.0;
  return B * max(spill * 0.95, trail);
}
// Voronoi border distance (F2 - F1), periodic in x
float vorEdge(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2 g = vec2(float(xx), float(yy));
      vec2 c = i + g;
      c.x = mod(c.x, per);
      vec2 d = g + 0.15 + 0.7 * h22(c) - f;
      float dd = dot(d, d);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}
// foam: solid where dense, a bubbly net where thin; aa = pixel footprint in cells
float foamPat(vec2 p, float per, float fd, float aa) {
  if (fd < 0.01) return 0.0;
  if (aa > 0.6) return clamp(max(fd * 0.8, smoothstep(0.7, 0.95, fd)), 0.0, 1.0);   // sub-pixel: its mean
  float wn = vnoiseP(p * 0.5, per * 0.5);
  float wn2 = vnoiseP(p * 0.5 + vec2(0.0, 9.3), per * 0.5);
  p += (vec2(wn, wn2) - 0.5) * 1.3;
  fd = clamp(fd + 0.45 * (wn - 0.5) * fd, 0.0, 1.0);
  float e1 = vorEdge(p, per);
  float e2 = aa < 0.2 ? vorEdge(p * 2.0 + vec2(0.0, 3.7), per * 2.0) : 0.3;
  float lw = (0.015 + 0.35 * fd * fd) * (0.5 + wn2);
  float net = smoothstep(lw + aa, lw - aa, e1);
  float fine = smoothstep(lw * 0.8 + 2.0 * aa, lw * 0.8 - 2.0 * aa, e2);
  float f = max(net, fine * 0.8) * smoothstep(0.0, 0.12, fd);
  f = mix(f, fd * 0.8, smoothstep(0.15, 0.6, aa));
  return clamp(max(f, smoothstep(0.7, 0.95, fd)), 0.0, 1.0);
}

// the headland and lighthouse mirrored in the water, seen from the sea point
vec3 landRefl(vec3 pos, vec3 R, vec3 c) {
  if (R.z < 0.05) return c;
  float zh = 280.0;
  if (pos.z > zh - 20.0) return c;
  float tt = (zh - pos.z) / R.z;
  vec3 h = pos + R * tt;
  float sx = h.x * FOC / zh;
  if (sx < 0.16) return c;
  float land = hlH(sx, 2.0);
  float cov = smoothstep(0.6, -0.6, h.y - land);
  c = mix(c, vec3(0.006, 0.007, 0.008) + hazeC(sx) * 0.05, cov);
  float lx = LAMP.x;
  float tw = smoothstep(3.4, 2.6, abs(h.x - lx)) * smoothstep(land - 1.0, land, h.y) * smoothstep(LAMP.y - 3.0, LAMP.y - 5.0, h.y);
  c = mix(c, AMB * 0.55, tw);
  return c;
}
vec3 skyRefl(vec3 R, vec3 pos, float blur) {
  R.y = max(R.y, 0.002);
  vec3 c = clearSky(R, blur);
  vec4 dk = deckClouds(R, 2.0, blur);
  c = mix(c, dk.rgb, dk.a);
  return landRefl(pos, R, c);
}

vec3 glint(vec3 n, vec3 V, vec3 L, float ndv, float var) {
  vec3 Hh = normalize(L + V);
  float cb = max(dot(Hh, n), 1e-3);
  float c2 = cb * cb;
  float D = exp(-(1.0 - c2) / (c2 * var)) / (PI * var * c2 * c2);
  float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  return vec3(min(Fh * D / (4.0 * ndv), 60.0));
}

// intensity of the lantern toward a direction (both beams, plus the lantern glow)
float lampToward(vec3 dir) {
  vec2 hd = normalize(dir.xz);
  float c1 = dot(hd, normalize(BD.xz));
  float az = acos(clamp(abs(c1), -1.0, 1.0));
  return 0.05 + exp(-az * az / 0.0045) * exp(-dir.y * dir.y / 0.0025);
}

// surf piling against the headland foot: (foam, wetness) at a sea point
float surge(vec3 pos) {
  float sx = pos.x * FOC / pos.z;
  float dz = 1e5;
  if (sx > 0.17) dz = footZ(sx) - pos.z;
  float ds = length((pos.xz - vec2(0.118 * 315.0 / FOC, 315.0)) * vec2(1.0, 0.6)) - 4.0;
  float d = min(dz, ds);
  if (d > 70.0 || d < -8.0) return 0.0;
  float u = WGC[0] + (0.5 * PI - WG[0].z * dot(WG[0].xy, pos.xz)) / TAU;
  float pulse = exp(-fract(u) * 3.5);
  float n = vnoise(pos.xz * 0.06 + vec2(floor(u) * 3.1, 0.0));
  return smoothstep(75.0, 3.0, d + 22.0 * (1.0 - pulse) + 25.0 * (n - 0.5)) * (0.7 + 0.3 * pulse);
}

vec3 shadeSea(vec3 pos, vec3 rd, float z, vec2 fp, vec2 sq) {
  vec4 ci;
  vec3 gg = seaGeo(pos.xz, ci);
  vec4 sd = seaDetail(pos.xz, fp);
  vec2 g = gg.xy + sd.xy;
  // non-periodic chop (value-noise slopes) breaks the lattice of crossing trains
  float fpl = length(fp);
  if (fpl < 0.05) {
    vec2 rq = pos.xz * 9.0;
    vec3 rn = vnoiseD(rq * mat2(0.8, 0.6, -0.6, 0.8) + vec2(0.0, Tw * (7200.0 / LOOP)));
    g += (rn.yz) * 9.0 * 0.006 * smoothstep(0.05, 0.015, fpl);
  }
  if (fpl < 1.2) {
    vec2 cq = vec2(dot(pos.xz, WIND), dot(pos.xz, vec2(-WIND.y, WIND.x))) * vec2(0.22, 0.3);
    cq.x -= Tw * (264.0 / LOOP);
    vec3 ch = fbmD(cq, clamp(log2(0.6 / (fpl * 0.3)), 1.0, 4.5));
    vec2 cg = ch.yz * vec2(0.22, 0.3) * 0.55 * smoothstep(1.2, 0.3, fpl);
    g += cg.x * WIND + cg.y * vec2(-WIND.y, WIND.x);
  }
  float var = sd.z + 0.004 + 0.012 * smoothstep(400.0, 60.0, z);   // + rain dimpling the surface
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = -rd;
  float ndv = dot(n, V);
  if (ndv < 0.03) { n = normalize(n + V * (0.03 - ndv)); ndv = 0.03; }
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(rd, n);
  R = normalize(R + vec3(0.0, sqrt(var) * 0.9, 0.0));
  vec3 refl = skyRefl(R, pos, sqrt(var) * 0.5);
  float sxv = rd.x / rd.z * FOC;
  vec3 hz = hazeC(sxv);
  float lit = z > 300.0 ? shafts(sq) * smoothstep(300.0, 1200.0, z) : 0.0;
  // body: dark green-slate, light transmitted through the thin backlit crests
  float hgt = gg.z + sd.w;
  vec3 body = vec3(0.0035, 0.0105, 0.0125) * (1.0 + 5.0 * FL);
  float thin = smoothstep(0.4, 3.6, hgt);
  float face = clamp(0.35 - n.z * 2.2, 0.0, 1.0);
  float wnz = vnoiseP(vec2(dot(pos.xz, WIND) * 0.04 - Tw * (96.0 / LOOP), dot(pos.xz, vec2(-WIND.y, WIND.x)) * 0.03), 96.0);
  float sssv = 0.35 + 1.1 * wnz;
  body += vec3(0.07, 0.30, 0.25) * (hz * (0.8 + 2.5 * lit) + FLC * FL * 0.1) * 0.24 * thin * thin * face * sssv;
  vec3 col = mix(body, refl, F);
  // glints: the hidden sun through thin cloud, the lantern, lightning
  vec3 spec = glint(n, V, SUN, ndv, var + 0.006) * SUNC * 0.05 * GAPI * (1.0 + 3.0 * lit);
  vec3 Lv = LAMP - pos;
  float Ld = length(Lv);
  Lv /= Ld;
  spec += glint(n, V, Lv, ndv, var + 0.002) * LAMPC * lampToward(-Lv) * 2500.0 / (Ld * Ld);
  // foam: whitecaps and their trails, wind streaks, surf at the headland
  float fw = max(crestFoam(ci.x, ci.y, WGM[0], 0.0), crestFoam(ci.z, ci.w, WGM[1], 5.0) * 0.75);
  fw *= 0.45 + 0.55 * smoothstep(-1.0, 2.0, gg.z);
  // wind-sea crests tumbling where the trains pile up
  float wpatch = smoothstep(0.5, 0.8, vnoise(pos.xz * vec2(0.07, 0.05) + vec2(wnz * 3.0, 0.0)));
  fw = max(fw, smoothstep(2.8, 4.2, gg.z + sd.w * 2.5 + 1.8 * wnz) * wpatch * 0.8);
  vec2 wc = vec2(dot(pos.xz, WIND), dot(pos.xz, vec2(-WIND.y, WIND.x)));
  float fac = length(vec2(-WIND.y, WIND.x) * fp);    // footprint across the wind
  float strk = 0.0;
  if (fac < 1.5) {
    vec2 sp = vec2(wc.x * 0.03 - Tw * (64.0 / LOOP), wc.y * 0.65);
    sp.y += 1.6 * vnoiseP(sp * vec2(1.0, 0.12) + vec2(0.0, 3.0), 64.0);
    strk = smoothstep(0.62, 0.82, vnoiseP(sp, 64.0)) * smoothstep(1.5, 0.4, fac);
    strk *= 0.35 + 0.65 * vnoiseP(vec2(sp.x * 4.0, wc.y * 0.05), 256.0);
  }
  float sg = surge(pos);
  float fd = clamp(max(max(fw, strk * 0.5), sg), 0.0, 1.0);
  float foam = 0.0, fshade = 1.0;
  if (fd > 0.05) {
    vec2 fc = vec2(wc.x * 1.4 - Tw * (2800.0 / LOOP), wc.y * 1.4);
    float aa = 1.4 * length(fp) + 0.02;
    // lace: a broken, uneven Voronoi net that thickens toward solid foam
    float lace = foamPat(fc, 2800.0, min(fd, 0.6), aa);
    float brk = aa < 1.5 ? smoothstep(0.3, 0.7, vnoiseP(fc * 0.2 + vec2(0.0, 4.1), 560.0) + 0.5 * fd - 0.2) : 0.5;
    foam = lace * mix(0.25, 0.85, brk) * (0.45 + 0.45 * fd);
    // fresh whitewater: a billowy mass, still broken and uneven
    float fresh = smoothstep(0.45, 0.95, max(fw, sg));
    if (fresh > 0.0) {
      float bil = aa < 1.6 ? fbm(fc * 0.3, clamp(log2(0.5 / (aa * 0.3)), 1.0, 4.5)) : 0.5;
      foam = max(foam, fresh * smoothstep(0.42, 0.68, bil + 0.22 * fresh) * (0.75 + 0.25 * bil));
      fshade = 0.62 + 0.55 * smoothstep(0.35, 0.8, bil);
    }
  }
  vec3 fcol = AMB * 0.95 + hz * 0.16 * (0.4 + 3.0 * lit) + FLC * FL * 0.35;
  fcol *= (0.72 + 0.3 * clamp(n.y * 1.5 - 0.3, 0.0, 1.0)) * fshade;
  col = mix(col, fcol, foam * 0.92);
  spec *= 1.0 - foam;
  // aerial perspective: rain and spray haze
  float fog = 1.0 - exp(-z / 2600.0);
  return mix(col, hz, fog) + spec * (1.0 - fog);
}

// cheap shade of a grazed crest top, for anti-aliasing its silhouette
vec3 crestShade(vec3 pos, vec3 rd) {
  vec4 ci;
  vec3 gg = seaGeo(pos.xz, ci);
  vec3 n = normalize(vec3(-gg.x, 1.0, -gg.y));
  float ndv = max(dot(n, -rd), 0.03);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 hz = hazeC(rd.x / rd.z * FOC);
  vec3 R = reflect(rd, n);
  R.y = max(R.y + 0.05, 0.002);
  vec4 dk = deckClouds(R, 1.5, 0.02);
  vec3 sk = mix(clearSky(R, 1.0), dk.rgb, dk.a);
  vec3 body = vec3(0.0035, 0.0105, 0.0125) + vec3(0.07, 0.30, 0.25) * hz * 0.08;
  vec3 c = mix(body, sk, F);
  float fw = crestFoam(ci.x, ci.y, WGM[0], 0.0);
  c = mix(c, AMB * 0.95 + hz * 0.1, fw * 0.5);
  return mix(c, hz, 1.0 - exp(-pos.z / 2600.0));
}

// sea for a (parallax-warped) screen point below the horizon
vec3 surface(vec2 q) {
  float dy = max(YH - q.y, 0.25 * PX);
  vec3 rd = normalize(vec3(q.x, -dy, FOC));
  float sl = dy / FOC;
  float zP = CAMH / sl;
  float z = zP;
  float rmin = 1e9, zm = 0.0, gm = 0.0, gmm = 1e9, zs = 0.0;
  float zA = max((CAMH - HMAX) / sl, 1.0);
  if (zA < ZFAR) {
    float zB = min((CAMH + HMIN) / sl, ZFAR);
    float minSt = (zB - zA) / 16.0;
    float zc = zA;
    float gc = CAMH - sl * zc - seaH(vec2(q.x * zc / FOC, zc));
    float gp = 1e9, pxk = FOC / PX;
    for (int i = 0; i < 20; i++) {
      float zn = min(zc + max(gc / (sl + 0.45), minSt), zB);
      float gn = CAMH - sl * zn - seaH(vec2(q.x * zn / FOC, zn));
      if (gn > gc && gc < gp) {
        // a crest passed just under the ray: remember the closest (in pixels
        // for anti-aliasing, in metres for spindrift)
        float ratio = gc * pxk / zc;
        if (ratio < rmin) { rmin = ratio; zm = zc; gm = gc; }
        if (gc < gmm && zc < 900.0) { gmm = gc; zs = zc; }
      }
      if (gn < 0.0) {
        float lo = zc, hi = zn, glo = gc, ghi = gn;
        for (int j = 0; j < 3; j++) {
          float mid = 0.5 * (lo + hi);
          float gmd = CAMH - sl * mid - seaH(vec2(q.x * mid / FOC, mid));
          if (gmd > 0.0) { lo = mid; glo = gmd; } else { hi = mid; ghi = gmd; }
        }
        z = lo + (hi - lo) * glo / max(glo - ghi, 1e-6);
        break;
      }
      if (zn >= zB) { z = zP; break; }
      gp = gc; zc = zn; gc = gn;
    }
  }
  z = min(z, 40000.0);
  vec3 pos = vec3(q.x * z / FOC, CAMH - sl * z, z);
  float fx = z * PX / FOC;
  float fz = fx * z / max(CAMH - pos.y, 0.3);
  vec3 col = shadeSea(pos, rd, z, vec2(fx, fz), q);
  // silhouette anti-aliasing: blend in the crest the ray grazed, by coverage
  float cov = 0.5 * (1.0 - smoothstep(0.0, 1.0, rmin));
  if (cov > 0.01) col = mix(col, crestShade(vec3(q.x * zm / FOC, CAMH - sl * zm - gm, zm), rd), cov);
  // spindrift torn off the crests the ray skimmed
  if (gmm < 4.0) {
    vec3 cp = vec3(q.x * zs / FOC, CAMH - sl * zs - gmm, zs);
    float hc = cp.y;
    float al = dot(cp.xz, WIND);
    float n = vnoiseP(vec2(al * 0.08 - Tw * (480.0 / LOOP), dot(cp.xz, vec2(-WIND.y, WIND.x)) * 0.05), 480.0);
    float n2 = vnoiseP(vec2(al * 1.6 - Tw * (9600.0 / LOOP), hc * 2.0 - gmm * 7.0), 9600.0);
    // only crests that are breaking shed spray
    float u0 = WGC[0] + (0.5 * PI - WG[0].z * dot(WG[0].xy, cp.xz)) / TAU;
    float br = crestFoam(u0, dot(vec2(-WG[0].y, WG[0].x), cp.xz), WGM[0], 0.0);
    float sp = br * smoothstep(1.4, 3.5, hc) * smoothstep(0.4, 0.75, n) * exp(-gmm / (0.6 + 1.6 * n2)) * smoothstep(0.0, 0.3, gmm);
    vec3 hz = hazeC(q.x);
    col = mix(col, AMB * 1.1 + hz * 0.2 + FLC * FL * 0.3, clamp(sp * smoothstep(0.25, 0.75, n2) * 0.6, 0.0, 1.0));
  }
  return col;
}
// parallax depth of the sea at a screen row: far 0.12, near ~0.92, ~0.36 at the headland foot
float seaDepth(float y) { return 0.12 + 0.8 * pow(clamp((YH - y) / YH, 0.0, 1.0), 0.6); }

// ---------------------------------------------------------------- headland and lighthouse (layer 3)
const vec3 KL = vec3(-0.90, 0.25, 0.36);     // cold light from the break (normalised below)
vec3 lightRock(vec3 n, vec3 alb, float ao, vec2 q) {
  vec3 kl = normalize(KL);
  vec3 c = alb * AMB * ao * (0.85 + 0.85 * smoothstep(-0.6, 0.8, n.y));
  c += alb * vec3(0.24, 0.29, 0.32) * GAPI * max(dot(n, kl), 0.0) * (0.4 + 0.6 * ao);
  if (FL > 0.0) c += alb * FLC * FL * 0.6 * max(dot(n, normalize(vec3(FLS.x - q.x, 0.6, 1.2))), 0.0);
  // lantern spill around the tower
  vec2 dl = (q - vec2(TX, TB + 0.121)) * vec2(1.0, 1.4);
  c += alb * LAMPC * (0.06 + 0.5 * LGLOW) * 0.08 * exp(-length(dl) / 0.035) * max(n.y + 0.3, 0.0);
  return c;
}

vec3 rockShade(vec2 q, float dN, float dF, float t, float wet) {
  vec3 big = fbmD(q * vec2(10.0, 6.0) + 2.0, 3.0);
  vec3 mid = fbmD(q * vec2(34.0, 20.0) + big.x * 1.3, clamp(octFor(34.0) - 1.5, 1.0, 5.0));
  vec3 fin = fbmD(q * vec2(130.0, 80.0) + 4.0, clamp(octFor(130.0) - 1.5, 1.0, 3.0));
  float ridge = sign(mid.x - 0.5);
  vec2 g = big.yz * 0.9 - ridge * mid.yz * 0.55 + fin.yz * 0.2;
  float tip = smoothstep(0.075, 0.0, t);
  vec3 nM = normalize(mix(vec3(0.12, 0.04, -1.0), vec3(-0.85, 0.05, -0.5), tip));
  vec3 n = normalize(nM + vec3(-g.x, -g.y, 0.0) * 0.8);
  // bedding planes: ledges with sky-lit tops over shadowed undercuts
  float ly = q.y * 42.0 + 6.0 * fbm1(q.y * 6.0 + 1.0, 3.0) + big.x * 2.0 - q.x * 7.0;
  float fl = fract(ly), lw = 42.0 * PX * 1.5;
  float brk = smoothstep(0.45, 0.7, vnoise(vec2(q.x * 30.0, floor(ly) * 1.7)));
  float ledge = smoothstep(0.92 - lw, 0.92 + lw, fl) * brk;
  float under = smoothstep(0.2, 0.0, fl) * brk * 0.55;
  n = normalize(n + vec3(0.0, ledge * 1.4, 0.0));
  // joints
  float cv = vnoise(q * vec2(80.0, 5.0) + big.x * 1.5);
  float crack = 1.0 - 0.55 * smoothstep(0.035 + PX * 80.0, 0.0, abs(cv - 0.5)) * smoothstep(0.4, 0.7, vnoise(q * vec2(20.0, 30.0)));
  float ao = (0.3 + 0.7 * smoothstep(0.25, 0.7, big.x)) * crack * (1.0 - under);
  vec3 alb = vec3(0.16, 0.155, 0.148) * (0.55 + 0.9 * fbm1(ly * 0.5 + 3.0, 3.0)) * (0.7 + 0.6 * fin.x);
  // dark wet streaks running down the face, pale lichen and salt crust
  float streak = smoothstep(0.45, 0.75, fbm(vec2(q.x * 140.0, q.y * 9.0) + big.x, clamp(octFor(140.0) - 1.0, 1.0, 4.0)));
  alb *= 1.0 - 0.45 * streak;
  alb = mix(alb, vec3(0.2, 0.2, 0.16), smoothstep(0.6, 0.78, vnoise(q * vec2(16.0, 24.0) + mid.x)) * 0.55);
  alb = mix(alb, vec3(0.24, 0.24, 0.23), smoothstep(0.03, 0.06, dF) * smoothstep(0.1, 0.06, dF) * smoothstep(0.4, 0.7, fin.x) * 0.5);
  alb *= 1.0 - 0.55 * wet;
  vec3 c = lightRock(n, alb, ao, q);
  // wet sheen of the sky on the lower rock
  c += wet * hazeC(q.x) * 0.06 * smoothstep(-0.2, 0.7, n.y + 0.3);
  // grass cap on the brow: dark, wind-combed
  float capH = (0.004 + 0.012 * smoothstep(0.03, 0.2, t)) * (0.6 + 0.8 * fbm1(q.x * 14.0 + 4.0, 3.0));
  if (dN < capH + 0.003) {
    float vn = fbm(q * vec2(220.0, 120.0), clamp(octFor(220.0) - 1.0, 1.0, 4.0));
    float veg = smoothstep(capH + PX, capH - PX, dN) * smoothstep(0.35, 0.5, vn);
    vec3 vc = vec3(0.045, 0.055, 0.03) * (0.6 + 0.8 * vn);
    vec3 vcl = lightRock(normalize(vec3(-0.3 + vn - 0.5, 1.0, -0.6)), vc, 1.0, q);
    c = mix(c, vcl, veg);
  }
  // cold rim along the skyline
  c += vec3(0.3, 0.36, 0.4) * GAPI * 0.35 * exp(-dN / 0.0013) * (0.5 + 0.5 * tip);
  return c;
}

// the lighthouse: tapered white tower, gallery, lantern, dome. (colour, alpha)
vec4 lighthouse(vec2 q) {
  float u = q.x - TX;
  float y = q.y - TB;
  if (abs(u) > 0.022 || y < -0.012 || y > 0.152) return vec4(0.0);
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 kl = normalize(KL);
  // tower
  float yt = 0.1042;
  float w = 0.0133 + 0.0052 * pow(clamp(1.0 - y / yt, 0.0, 1.0), 1.4);
  float aT = smoothstep(PX * 0.8, -PX * 0.8, abs(u) - w) * step(y, yt);
  if (aT > 0.0) {
    float s = clamp(u / w, -0.999, 0.999);
    vec3 n = vec3(s, 0.0, -sqrt(1.0 - s * s));
    float grime = fbm(vec2(u * 900.0, y * 60.0), 3.0);
    vec3 alb = vec3(0.70, 0.70, 0.67) * (0.82 + 0.2 * grime) * mix(0.6, 1.0, smoothstep(0.0, 0.02, y));
    vec3 c = alb * AMB * (0.85 + 0.25 * n.z * n.z);
    c += alb * vec3(0.24, 0.29, 0.32) * GAPI * max(dot(n, kl), 0.0) * 0.9;
    c += alb * FLC * FL * 0.5 * max(dot(n, normalize(vec3(FLS.x - q.x, 0.6, 1.2))), 0.0) + alb * FLC * FL * 0.08;
    // warm spill from the lantern on the upper tower
    c += alb * LAMPC * (0.05 + 0.3 * LGLOW) * 0.1 * smoothstep(yt - 0.03, yt, y);
    // windows and door
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float wy = fi == 0.0 ? 0.03 : fi == 1.0 ? 0.059 : 0.085;
      float wu = fi == 0.0 ? -0.003 : fi == 1.0 ? 0.0025 : -0.0015;
      vec2 d = abs(vec2(u - wu, y - wy)) - vec2(0.0014, 0.0026);
      float win = smoothstep(PX * 0.7, -PX * 0.7, max(d.x, d.y));
      vec3 wc = fi == 2.0 ? LAMPC * 0.06 : vec3(0.006, 0.007, 0.008);
      c = mix(c, wc, win);
    }
    vec2 dd = abs(vec2(u + 0.002, y - 0.006)) - vec2(0.0022, 0.0075);
    c = mix(c, vec3(0.008, 0.008, 0.009), smoothstep(PX * 0.7, -PX * 0.7, max(dd.x, dd.y)));
    col = c; a = aT;
  }
  // gallery deck and railing
  float yg = yt, yg1 = yt + 0.0042;
  float aG = smoothstep(PX * 0.7, -PX * 0.7, abs(u) - 0.0176) * smoothstep(-PX * 0.6, PX * 0.6, y - yg) * smoothstep(PX * 0.6, -PX * 0.6, y - yg1);
  float rail = 0.0;
  if (y > yg1 && y < yg1 + 0.0068 && abs(u) < 0.0172) {
    float post = smoothstep(PX * 0.9, 0.0, abs(fract(u / 0.0036 + 0.5) - 0.5) * 0.0036 - 0.0002);
    float top = smoothstep(PX * 0.8, -PX * 0.8, abs(y - yg1 - 0.0062) - 0.0005);
    rail = max(post * 0.85, top);
  }
  // lantern
  float yl0 = yg1, yl1 = yg1 + 0.0255;
  float wl = 0.0101;
  float aL = smoothstep(PX * 0.7, -PX * 0.7, abs(u) - wl) * smoothstep(-PX * 0.6, PX * 0.6, y - yl0) * smoothstep(PX * 0.6, -PX * 0.6, y - yl1);
  // dome
  float yd = (y - yl1) / 0.012;
  float wd = 0.0114 * sqrt(max(1.0 - yd * yd, 0.0));
  float aD = smoothstep(PX * 0.7, -PX * 0.7, abs(u) - wd) * smoothstep(-PX * 0.6, PX * 0.6, y - yl1) * step(yd, 1.0);
  float ball = smoothstep(PX * 0.7, -PX * 0.7, length(vec2(u, y - yl1 - 0.0136)) - 0.0019);
  float rod = smoothstep(PX * 0.6, -PX * 0.2, abs(u) - 0.0002) * step(y, yl1 + 0.022) * step(yl1 + 0.014, y);
  if (aL > 0.0) {
    float s = u / wl;
    // lens and lamp seen through the glazing; astragals
    float lampD = length(vec2(u, (y - 0.1211) * 0.8));
    vec3 c = LAMPC * (0.5 + 5.0 * LGLOW) * (0.35 + 1.2 * exp(-lampD / 0.003) + 0.3 * exp(-abs(u) / 0.004));
    c += LAMPC * 40.0 * LGLOW * exp(-lampD / 0.0016);
    float ast = 0.0;
    for (int k = 0; k < 4; k++) {
      float ph = (float(k) - 1.5) * 0.785 + 0.39;
      float xs = sin(ph);
      ast = max(ast, smoothstep(PX * 0.9, 0.0, abs(s - xs) * wl - 0.0003) * cos(ph));
    }
    float hb = smoothstep(PX * 0.8, 0.0, abs(y - yl0 - 0.004) - 0.0004);
    c = mix(c, vec3(0.01, 0.009, 0.008), max(ast * 0.9, hb));
    col = mix(col, c, aL); a = max(a, aL);
  }
  if (aG > 0.0 || rail > 0.0) {
    vec3 c = vec3(0.012, 0.012, 0.013) + LAMPC * (0.04 + 0.4 * LGLOW) * 0.15 + FLC * FL * 0.02;
    float ag = max(aG, rail);
    col = mix(col, c, ag); a = max(a, ag);
  }
  float aDm = max(max(aD, ball), rod);
  if (aDm > 0.0) {
    float s = clamp(u / 0.0114, -1.0, 1.0);
    vec3 n = normalize(vec3(s, 0.6 + 0.6 * yd, -sqrt(max(1.0 - s * s, 0.0))));
    vec3 c = vec3(0.012, 0.013, 0.014) * (0.6 + 0.4 * n.y) + vec3(0.22, 0.27, 0.3) * GAPI * 0.06 * max(dot(n, kl), 0.0);
    c += hazeC(q.x) * 0.08 * pow(max(n.y, 0.0), 6.0) + LAMPC * 0.3 * LGLOW * smoothstep(0.3, 0.0, yd) * 0.1 + FLC * FL * 0.05;
    col = mix(col, c, aDm); a = max(a, aDm);
  }
  return vec4(col, a);
}

// the keeper's cottage beside the tower
vec4 cottage(vec2 q) {
  float x0 = 0.428, x1 = 0.502;
  if (q.x < x0 - 0.004 || q.x > x1 + 0.004 || q.y > TB + 0.05 || q.y < TB - 0.01) return vec4(0.0);
  float y = q.y - TB;
  float aw = smoothstep(-PX, PX, q.x - x0) * smoothstep(PX, -PX, q.x - x1) * smoothstep(PX, -PX, y - 0.02);
  // roof: hipped, eaves overhanging
  float rt = 0.0335 - 0.6 * max(max(x0 + 0.012 - q.x, q.x - x1 + 0.012), 0.0);
  float ar = smoothstep(-PX, PX, q.x - x0 + 0.003) * smoothstep(PX, -PX, q.x - x1 - 0.003) * smoothstep(PX, -PX, y - rt) * smoothstep(-PX, PX, y - 0.0195);
  float ch = smoothstep(PX, -PX, abs(q.x - 0.49) - 0.0024) * smoothstep(PX, -PX, y - 0.041) * smoothstep(-PX, PX, y - 0.02);
  float a = max(max(aw, ar), ch);
  if (a <= 0.0) return vec4(0.0);
  vec3 alb = vec3(0.62, 0.61, 0.58) * (0.85 + 0.2 * fbm(q * vec2(500.0, 200.0), 3.0));
  vec3 c = alb * AMB * 0.9 + alb * FLC * FL * 0.12;
  // windows: one lit
  float w1 = smoothstep(PX * 0.7, -PX * 0.7, max(abs(q.x - 0.446) - 0.0026, abs(y - 0.0105) - 0.0035));
  float w2 = smoothstep(PX * 0.7, -PX * 0.7, max(abs(q.x - 0.484) - 0.0026, abs(y - 0.0105) - 0.0035));
  float dr = smoothstep(PX * 0.7, -PX * 0.7, max(abs(q.x - 0.465) - 0.0022, abs(y - 0.007) - 0.0072));
  float mull = smoothstep(PX * 0.8, 0.0, abs(q.x - 0.446) - 0.0002) + smoothstep(PX * 0.8, 0.0, abs(y - 0.0105) - 0.0002);
  vec3 warm = LAMPC * vec3(1.0, 0.85, 0.6) * 0.55 * (0.8 + 0.2 * vnoise(vec2(Tw * 0.0, 1.0)));
  c = mix(c, mix(warm, vec3(0.03, 0.02, 0.012), clamp(mull, 0.0, 1.0) * 0.8), w1);
  c = mix(c, vec3(0.006, 0.007, 0.008), max(w2, dr));
  // slate roof, wet
  vec3 rc = vec3(0.018, 0.02, 0.024) * (0.8 + 0.3 * fbm(q * vec2(300.0, 900.0), 3.0)) + hazeC(q.x) * 0.035;
  rc += LAMPC * (0.04 + 0.4 * LGLOW) * 0.06 * smoothstep(0.47, 0.43, q.x) + FLC * FL * 0.04;
  c = mix(c, rc, max(ar * (1.0 - aw), ch));
  return vec4(c, a);
}

vec4 layerHeadland(vec2 p) {
  vec2 q = p + u_par * PAR * HDP;
  if (q.x < 0.04 || q.y > 0.74 || q.y < 0.33) return vec4(0.0);
  vec3 col = vec3(0.0);
  float a = 0.0;
  // sea stacks off the tip
  if (q.x < 0.17 && q.y < 0.5) {
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float x0 = fi == 0.0 ? 0.118 : 0.068;
      float zz = fi == 0.0 ? 315.0 : 330.0;
      float hw = fi == 0.0 ? 0.0155 : 0.0085;
      float ht = fi == 0.0 ? 0.078 : 0.03;
      float base = YH - CAMH * FOC / zz;
      if (abs(q.x - x0) > hw * 1.6 || q.y > base + ht * 1.15 || q.y < base - 0.004) continue;
      float tt = clamp((q.y - base) / ht, 0.0, 1.0);
      float w = hw * (1.15 - 0.35 * tt + 0.1 * sin(tt * 7.0 + fi * 2.0)) * (0.88 + 0.24 * fbm1(q.y * 150.0 + fi * 10.0, octFor(150.0)));
      float topY = base + ht * (1.0 - 0.35 * pow((q.x - x0) / hw, 2.0) + 0.1 * (fbm1(q.x * 240.0 + fi, octFor(240.0)) - 0.5));
      float dd = min(w - abs(q.x - x0 + 0.004 * tt), topY - q.y);
      float ai = smoothstep(-PX, PX, dd) * smoothstep(-PX, PX, q.y - base + 0.003);
      if (ai > 0.0) {
        float side = (q.x - x0) / w;
        vec3 big = fbmD(q * vec2(60.0, 30.0) + fi * 7.0, clamp(octFor(60.0), 1.0, 5.0));
        vec3 n = normalize(vec3(side * 0.8 - big.y * 0.5, 0.15 - big.z * 0.3, -1.0));
        float wet = smoothstep(0.012, 0.0, q.y - base);
        vec3 alb = vec3(0.1, 0.1, 0.095) * (0.6 + 0.8 * big.x) * (1.0 - 0.5 * wet);
        vec3 c = lightRock(n, alb, 0.6 + 0.4 * big.x, q);
        c += vec3(0.3, 0.36, 0.4) * GAPI * 0.4 * exp(-dd / 0.0012) * smoothstep(0.3, -0.8, side);
        c = mix(c, hazeC(q.x), 0.25);
        col = mix(col, c, ai);
        a = max(a, ai);
      }
    }
  }
  if (q.x > 0.165 && q.y < footY(q.x) + hlH(q.x, 1.0) * FOC / footZ(q.x) + 0.045 + (abs(q.x - TX - 0.05) < 0.12 ? 0.2 : 0.0)) {
    float octW = octFor(25.0);
    float wx = q.x + 0.014 * (fbm1(q.y * 24.0 + 3.0, octW) - 0.5) + 0.008 * (fbmZ(q.y * 95.0 + 7.0, octW - 1.5) - 0.5);
    float top = hlTop(wx, octFor(16.0));
    if (q.y < top + 0.004) {
      float e = 0.002;
      float sl = (hlTop(wx + e, 2.0) - hlTop(wx - e, 2.0)) / (2.0 * e);
      float dN = (top - q.y) / sqrt(1.0 + min(sl * sl, 40.0));
      float fy = footY(q.x) + 0.003 * (fbm1(q.x * 90.0, 4.0) - 0.5);
      float dF = q.y - fy;
      float aR = smoothstep(-PX, PX, dN) * smoothstep(-PX, PX, dF);
      if (aR > 0.0) {
        float t = wx - 0.185;
        float wet = smoothstep(0.03, 0.004, dF);
        vec3 c = rockShade(q, dN, dF, t, wet);
        // surf washing up the rocks as each swell arrives
        float zf = footZ(q.x);
        float u = WGC[0] + (0.5 * PI - WG[0].z * dot(WG[0].xy, vec2(q.x * zf / FOC, zf))) / TAU;
        float age = fract(u);
        float up = (0.008 + 0.034 * exp(-age * 3.5) * smoothstep(0.0, 0.03, age)) * (0.55 + 0.9 * vnoise(vec2(q.x * 40.0, floor(u) * 1.3)));
        float fo = smoothstep(up, up * 0.2, dF + 0.006 * (fbm(vec2(q.x * 160.0, age * 3.0), 3.0) - 0.5)) * smoothstep(0.32, 0.62, fbm(vec2(q.x * 420.0, q.y * 500.0 - age * 12.0), clamp(octFor(500.0), 1.0, 4.0)) + 0.3 * smoothstep(up, 0.0, dF));
        vec3 fcol = AMB * 0.95 + hazeC(q.x) * 0.1 + FLC * FL * 0.3;
        c = mix(c, fcol, fo);
        c = mix(c, hazeC(q.x), 0.12 + 0.1 * smoothstep(0.5, 0.25, q.x));
        col = mix(col, c, aR);
        a = max(a, aR);
      }
    }
    // cottage, then the lighthouse in front of it
    vec4 ho = cottage(q);
    if (ho.a > 0.0) { col = mix(col, mix(ho.rgb, hazeC(q.x), 0.1), ho.a); a = max(a, ho.a); }
    vec4 lh = lighthouse(q);
    if (lh.a > 0.0) { col = mix(col, mix(lh.rgb, hazeC(q.x), 0.08), lh.a); a = max(a, lh.a); }
  }
  return vec4(col * a, a);
}

// ---------------------------------------------------------------- breaking surf (layer 4)
// a burst of spray against the rocks: tau = seconds since the crest struck, S = strength
vec4 burst(vec2 q, vec2 site, float sc, float tau, float S, float sd, vec3 rd) {
  vec2 l = (q - site) / sc;
  float life = tau / 5.6;
  if (life >= 1.0 || l.y < -0.3 || l.y > 3.3 || l.x < -1.6 || l.x > 4.2) return vec4(0.0);
  float H = 0.55 + 1.55 * clamp(S, 0.0, 1.3);                 // plume height (units of sc)
  float rise = 1.0 - pow(1.0 - min(life / 0.24, 1.0), 2.2);
  float top = H * rise * (1.0 - 0.3 * smoothstep(0.35, 1.0, life));
  float drift = 0.95 * life * (0.12 + max(l.y, 0.0));          // the gale carries the spray to the right
  float x = l.x - drift;
  float w = 0.2 + 0.42 * max(l.y, 0.0) + 0.45 * life;
  float yy = l.y / max(top, 0.08);
  float oct = clamp(octFor(2.6 / sc), 2.0, 6.0);
  float nn = fbm(vec2(x * 2.6, l.y * 2.2 - life * 3.0) + sd * 13.1, oct);
  float core = exp(-x * x / (w * w) * 1.4) * smoothstep(1.12, 0.5, yy) * smoothstep(-0.28, 0.0, l.y);
  float dens = core * smoothstep(0.28, 0.58, nn + 0.4 * (1.0 - yy) - 0.38 * life);
  dens *= smoothstep(1.0, 0.42, life) * smoothstep(0.0, 0.02, life);
  // lingering mist drifting downwind
  float mx = l.x - drift * 1.5;
  float mist = exp(-mx * mx / (w * w * 3.2)) * smoothstep(1.6, 0.15, yy) * smoothstep(0.06, 0.4, life) * smoothstep(1.0, 0.5, life);
  mist *= 0.55 * smoothstep(0.28, 0.7, fbm(vec2(mx * 1.5, l.y * 1.5 - life * 2.0) + sd * 3.0, oct - 1.0));
  // droplets flung out of the plume
  vec2 dq = vec2(l.x - drift * 0.8, l.y - top * 0.3) * 32.0;
  vec2 dc = floor(dq);
  vec2 dp = dc + 0.25 + 0.5 * h22(dc + sd * 7.0);
  float dr = 0.07 + 0.12 * h12(dc + 3.0);
  float pxl = PX / sc * 32.0;
  float drop = smoothstep(dr + pxl, dr - pxl, length(dq - dp)) * step(h12(dc + 11.0 + sd), 0.12);
  drop *= exp(-x * x / (w * w * 1.6)) * smoothstep(1.35, 0.95, yy) * smoothstep(0.6, 1.0, yy) * smoothstep(0.8, 0.35, life) * smoothstep(0.03, 0.1, life);
  float a = clamp(max(dens, mist) + drop * 0.75, 0.0, 1.0);
  // light: overcast from above, silver forward scatter from the break through thin parts, lightning
  float thinP = 1.0 - smoothstep(0.2, 0.9, dens);
  float mu = max(dot(rd, SUN), 0.0);
  vec3 c = AMB * 1.55 * (0.72 + 0.4 * smoothstep(-0.4, 1.0, yy - x * 0.4));
  c += hazeC(q.x) * 0.2 * (0.3 + thinP) * (0.6 + 2.0 * pow(mu, 6.0));
  c += FLC * FL * 0.5;
  return vec4(c * a, a);
}
float impact(vec2 xz, out float S) {
  float u = WGC[0] + (0.5 * PI - WG[0].z * dot(WG[0].xy, xz)) / TAU;
  float age = fract(u);
  float tau = age * LOOP / WGM[0];
  float id = mod(floor(u), WGM[0]);
  // the other swells at the moment of impact decide how big this one is
  float s = 0.0;
  for (int j = 1; j < 3; j++) {
    vec4 w = WG[j];
    float ph = w.z * dot(w.xy, xz) - TAU * (WGC[j] - WGM[j] * tau / LOOP) - float(j) * 2.1;
    s += sin(ph) * (j == 1 ? 0.3 : 0.22);
  }
  float set = 0.75 + 0.5 * smoothstep(0.6, 1.0, sin(TAU * (5.0 * (Tw - tau) / LOOP) + 0.7));   // a big set every four minutes
  S = (0.55 + 0.9 * s + 0.4 * (h11(id * 1.37 + 0.5) - 0.5)) * set;
  return tau;
}
vec4 layerSpray(vec2 p) {
  vec2 q = p + u_par * PAR * 0.39;
  if (q.x < 0.0 || q.x > 0.9 || q.y > 0.62 || q.y < 0.33) return vec4(0.0);
  vec3 rd = normalize(vec3(q.x, q.y - YH, FOC));
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float sx = fi == 0.0 ? 0.192 : fi == 1.0 ? 0.118 : fi == 2.0 ? 0.30 : 0.6;
    float zz = fi == 1.0 ? 315.0 : footZ(sx);
    float sc = fi == 0.0 ? 0.075 : fi == 1.0 ? 0.05 : fi == 2.0 ? 0.06 : 0.07;
    vec2 site = vec2(sx, YH - CAMH * FOC / zz + 0.002);
    if (q.x < site.x - sc * 1.6 || q.x > site.x + sc * 4.2 || q.y < site.y - sc * 0.3 || q.y > site.y + sc * 3.3) continue;
    float S;
    float tau = impact(vec2(sx * zz / FOC, zz), S);
    vec4 b = burst(q, site, sc, tau, S, fi * 3.1 + 0.7, rd);
    acc += b * (1.0 - acc.a);
  }
  return acc;
}

// ---------------------------------------------------------------- lighthouse beam (layer 5)
// single scattering of two rotating gaussian beams in rain and mist, integrated
// analytically along the view ray (angle-space parameterisation)
vec3 beamScatter(vec3 v, float smax) {
  vec3 C = vec3(0.0, CAMH, 0.0);
  vec3 LC = LAMP - C;
  float sc = dot(LC, v);
  vec3 Q = v * sc - LC;
  float h = max(length(Q), 0.8);
  vec3 nq = Q / h;
  const float BA = 0.055;    // beam half-width (rad)
  vec3 d2 = vec3(-BD.x, BD.y, -BD.z);
  float R1 = length(vec2(dot(BD, nq), dot(BD, v))), R2 = length(vec2(dot(d2, nq), dot(d2, v)));
  float acc = 0.0003 * PI;   // the lantern's own glow (approx.)
  if (max(R1, R2) < 1.0 - 4.0 * BA * BA) return LAMPC * acc * 260.0 / h;
  float th0 = atan(-sc / h);
  float th1 = atan((smax - sc) / h);
  acc = 0.0003 * (th1 - th0);
  for (int b = 0; b < 2; b++) {
    vec3 d = b == 0 ? BD : d2;
    float A = dot(d, nq), B = dot(d, v);
    float R = b == 0 ? R1 : R2;
    if (R < 1.0 - 4.0 * BA * BA) continue;
    float thd = atan(B, A);
    float g = exp(-2.0 * (1.0 - R) / (BA * BA));
    float I = g * 0.8862 * BA * (erfA((th1 - thd) / BA) - erfA((th0 - thd) / BA));
    // mist streaming through the beam where it crosses the ray
    float s = sc + h * tan(clamp(thd, -1.4, 1.4));
    vec3 P = C + v * s;
    float mist = 0.45 + 1.1 * vnoiseP(vec2(P.x * 0.03 - Tw * (540.0 / LOOP), P.z * 0.03 + P.y * 0.05), 540.0);
    float cs = -B;
    float ph = 0.08 + 1.0 / pow(1.36 - 1.2 * cs, 1.5) * 0.12;   // forward-peaked (Henyey-Greenstein, g = 0.6)
    float ext = exp(-(max(s, 0.0) + length(P - LAMP)) / 2200.0);
    acc += I * ph * mist * ext;
  }
  return LAMPC * acc * 260.0 / h;
}
vec4 layerBeam(vec2 p) {
  vec2 q = p + u_par * PAR * 0.4;
  vec3 v = normalize(vec3(q.x, q.y - YH, FOC));
  float smax = v.y < -1e-4 ? CAMH / -v.y : 1e5;
  if (q.x > 0.17 && q.y < hlTop(q.x, 2.0)) smax = min(smax, max(footZ(q.x), 300.0) / v.z);
  vec3 L = beamScatter(v, smax);
  // rain glittering in the beam
  if (L.r > 0.004) {
    vec2 rq = vec2(q.x * 0.96 - q.y * 0.27, q.y);
    float rn = vnoiseP(vec2(rq.x * 900.0, rq.y * 18.0 + Tw * (21600.0 / LOOP)), 1440.0);
    L *= 0.82 + 0.4 * smoothstep(0.55, 0.95, rn);
  }
  // lens glare of the lantern
  vec2 dl = q - vec2(TX, TB + 0.1211);
  float r = length(dl);
  if (r < 0.5) {
    L += LAMPC * (0.04 + LGLOW) * (exp(-r / 0.0022) * 3.0 + exp(-r / 0.012) * 0.5 + exp(-r / 0.06) * 0.08);
    L += LAMPC * LGLOW * 0.25 * exp(-abs(dl.y) / 0.0012) * exp(-abs(dl.x) / 0.09);   // horizontal streak
  }
  return vec4(L, 0.0);
}

// ---------------------------------------------------------------- rain (layer 7)
float rainSheet(vec2 p, float cw, float ch, float len, float wid, float dens, float n0, float sd) {
  vec2 RD = normalize(vec2(0.27, -1.0));
  vec2 q = vec2(dot(p, vec2(-RD.y, RD.x)), -dot(p, RD));   // across, up
  float col = floor(q.x / cw);
  float nc = n0 + floor(h11(col * 1.37 + sd) * n0 * 0.5);   // rows per loop for this column
  float y = q.y / ch + nc * (Tw / LOOP) + h11(col * 3.1 + sd) * 7.0;
  float row = floor(y);
  vec2 hh = h22(vec2(col, mod(row, nc)) + sd);
  if (hh.x > dens) return 0.0;
  float cx = (col + 0.2 + 0.6 * hh.y) * cw;
  float dx = abs(q.x - cx);
  float dy = abs((fract(y) - 0.5) * ch) - len * 0.5;
  float aw = max(PX * 0.5, wid);
  float a = smoothstep(aw + PX * 0.7, aw - PX * 0.7, dx) * smoothstep(PX * 2.0, -PX * 2.0 - len * 0.3, dy);
  return a * min(wid / aw, 1.0) * (0.5 + 0.5 * hh.x / dens);
}
vec4 layerRain(vec2 p) {
  float a1 = rainSheet(p + u_par * PAR * 1.0, 0.0045, 0.11, 0.035, 0.00028, 0.5, 900.0, 1.3);
  float a2 = rainSheet(p + u_par * PAR * 1.15, 0.009, 0.2, 0.065, 0.0005, 0.35, 700.0, 7.9);
  float a3 = rainSheet(p + u_par * PAR * 1.3, 0.02, 0.42, 0.14, 0.0011, 0.22, 520.0, 3.7);
  float a = 1.0 - (1.0 - a1 * 0.18) * (1.0 - a2 * 0.2) * (1.0 - a3 * 0.16);
  if (a <= 0.0) return vec4(0.0);
  vec3 c = AMB * 1.5 + hazeC(p.x) * 0.25 + FLC * FL * 0.5;
  vec2 dl = p - vec2(TX, TB + 0.1211);
  c += LAMPC * LGLOW * 0.6 * exp(-length(dl) / 0.25);
  return vec4(c * a, a);
}

// ---------------------------------------------------------------- main
void initScene() {
  Tw = mod(u_time, LOOP);
  SUN = normalize(vec3(SUNP.x, SUNP.y - YH, FOC));
  GAPI = 0.8 + 0.2 * sin(TAU * 3.0 * Tw / LOOP + 1.0);
  // lightning: 30 slots per loop, about half with a flash of 2-4 strokes
  FL = 0.0; BOLT = 0.0; FLS = vec2(0.5, 0.58); FLW = vec3(0.0, HC, 1e4); FSEED = 0.0;
  float s = floor(Tw / 40.0);
  float dt = Tw - s * 40.0 - (3.0 + 30.0 * h11(s * 3.17 + 0.4));
  if (h11(s * 7.13 + 1.7) < 0.55 && dt > 0.0 && dt < 2.5) {
    float fsum = 0.0, tt = 0.0;
    float nst = 2.0 + floor(3.0 * h11(s * 1.93));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      if (fi >= nst) break;
      float ag = dt - tt;
      if (ag > 0.0) fsum += (fi == 0.0 ? 1.0 : 0.4 + 0.6 * h11(s + fi * 5.1)) * exp(-ag / (0.045 + 0.05 * h11(s * 2.0 + fi))) * smoothstep(0.0, 0.012, ag);
      tt += 0.06 + 0.22 * h11(s * 4.1 + fi);
    }
    fsum += 0.1 * exp(-dt / 0.6) * smoothstep(0.0, 0.02, dt);
    float side = h11(s * 9.7 + 2.0);
    FLS = vec2(side < 0.5 ? mix(-0.72, -0.12, side / 0.5) : mix(0.06, 0.2, (side - 0.5) / 0.5), 0.53 + 0.07 * h11(s * 6.1));
    FL = fsum * (0.6 + 0.7 * h11(s * 5.3));
    float zf = (HC - CAMH) * FOC / (FLS.y - YH);
    FLW = vec3(FLS.x * zf / FOC, HC, zf);
    BOLT = h11(s * 8.9 + 3.3) < 0.55 ? FL : 0.0;
    FSEED = s;
  }
  // the lighthouse and its beams (two, opposite; one turn every 24 s)
  TZ = footZ(TX);
  TB = footY(TX) + 24.5 * FOC / TZ;
  LAMP = vec3(TX * TZ / FOC, CAMH + (TB + 0.1211 - YH) * TZ / FOC, TZ);
  float th = TAU * fract(50.0 * Tw / LOOP) + 0.6;
  BD = normalize(vec3(cos(th), -0.012, sin(th)));
  vec3 toCam = normalize(vec3(0.0, CAMH, 0.0) - LAMP);
  float c1 = abs(dot(normalize(toCam.xz), BD.xz));
  float az = acos(min(c1, 1.0));
  LGLOW = exp(-az * az / 0.006);
}

vec4 layerK(int k, vec2 p, vec2 qs, float aFar, float aNear) {
  if (k == 0) return layerSky(p);
  if (k == 1) return aFar > 0.0 ? vec4(surface(qs) * aFar, aFar) : vec4(0.0);
  if (k == 2) return layerVeils(p);
  if (k == 3) return layerHeadland(p);
  if (k == 4) return layerSpray(p);
  if (k == 5) return layerBeam(p);
  if (k == 6) return aNear > 0.0 ? vec4(surface(qs) * aNear, aNear) : vec4(0.0);
  return layerRain(p);
}

void main() {
  PX = 1.0 / u_res.y;
  initScene();
  initWaves();
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.42 * smoothstep(0.1, 0.62, dot(vq, vq) * 1.6);
  vec2 qs = p + u_par * PAR * seaDepth(p.y);
  float dyq = YH - qs.y;
  float zP = CAMH * FOC / max(dyq, 1e-4);
  float hor = smoothstep(-0.75 * PX, 0.75 * PX, dyq);
  float aNear = dyq > 0.0 ? 1.0 - smoothstep(ZSPLIT - 20.0, ZSPLIT + 20.0, zP) : 0.0;
  float aFar = hor * smoothstep(ZSPLIT - 60.0, ZSPLIT - 20.0, zP);
  float dither = (h12(gl_FragCoord.xy + fract(Tw) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;

  if (u_layer > -0.5) {
    vec4 c = layerK(int(u_layer + 0.5), p, qs, aFar, aNear);
    vec3 col = c.a > 0.002 ? display(c.rgb / c.a) * c.a : display(c.rgb);
    float a = max(c.a, max(col.r, max(col.g, col.b)));
    fragColor = vec4(col + dither * a, a);
    return;
  }

  // full scene: front-to-back in linear light (identical to back-to-front
  // "over"), skipping what is already hidden; one tone map at the end
  vec3 acc = vec3(0.0);
  float T = 1.0;
  vec4 c = layerRain(p);
  acc += c.rgb; T *= 1.0 - c.a;
  vec3 sea = vec3(0.0);
  if (aNear > 0.0 || aFar > 0.0) sea = surface(qs);
  acc += T * aNear * sea; T *= 1.0 - aNear;
  if (T > 0.001) { c = layerBeam(p); acc += T * c.rgb; }
  if (T > 0.001) { c = layerSpray(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerHeadland(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerVeils(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  acc += T * aFar * sea; T *= 1.0 - aFar;
  if (T > 0.001) { c = layerSky(p); acc += T * c.rgb; }
  fragColor = vec4(display(acc) + dither, 1.0);
}
`,
}
