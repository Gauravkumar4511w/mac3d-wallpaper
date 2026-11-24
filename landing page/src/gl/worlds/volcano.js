// Fire Mountain: an erupting stratovolcano at blue hour.
// A deep indigo twilight sky with the last afterglow low in the west, a distant
// cone and hazy ridges, and a dark basalt stratovolcano (a surface of
// revolution with radial gullies, lit by the sky, the vent and its own lava)
// with lava rivers whose cooling crust drifts and cracks over bright veins.
// Lava fountains pulse from the crater on an irregular rhythm, throwing
// incandescent bombs that arc out and tumble down the cone; a billowing ash
// column, lit from beneath, leans away on the wind and flickers with volcanic
// lightning while sparks stream off downwind. A lake mirrors it all (drifting
// wind patches, ripples, a glitter path) and a black-sand shore with damp basalt
// boulders frames the bottom.
// Long-cycle events: paroxysms (bigger fountains, brighter glow, more bombs,
// more lightning) and lightning flashes inside the plume.
//
// Every layer is lit in linear light, ACES tone-mapped and gamma-encoded on its
// own, so the full scene is exactly the back-to-front "over" composite of the
// isolated layers. Everything runs on one master loop (LOOP seconds): every
// phase and drift is quantised to it, so u_time can grow forever.

export default {
  id: 'volcano',
  name: 'Fire Mountain',
  tag: 'Volcano at blue hour',
  accent: '#ff6a2b',
  accent2: '#5468d8',
  ink: '#9a3410',
  glow: '#ffb27a',
  light: false,
  clockColor: '#fff1e6',
  sky: 'linear-gradient(180deg,#070a1e 0%,#0e1636 28%,#1f2a55 48%,#5a4054 60%,#2a2232 64%,#141522 70%,#0b0c14 86%,#060608 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Far ridges', depth: 0.08 },
    { name: 'Ash plume', depth: 0.22 },
    { name: 'Volcano', depth: 0.25 },
    { name: 'Lava fountain', depth: 0.26 },
    { name: 'Sparks', depth: 0.3 },
    { name: 'Lake', depth: 0.5 },
    { name: 'Black-sand shore', depth: 1.0 },
  ],
  clockAfter: 2,
  stillTime: 14,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float LOOP = 1200.0;   // master loop (s)
const float YH = 0.36;       // horizon / far shore on screen
const float FOC = 1.5;       // focal length (screen heights)
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float CAMH = 1.6;      // eye height above the lake (m)
const vec2 CR = vec2(0.34, 0.632);  // crater centre on screen
const float HS = 0.272;      // crater rim above the horizon (screen)
const float UC = 0.026;      // crater half-width
const float VLL = 0.37, VLR = 0.30;     // flank e-folding lengths, left / right
const float E0L = 0.0628, E0R = 0.0641; // exp(-(base - UC) / VL): bases at 1.05 / 0.85
const vec3 LAVA = vec3(1.0, 0.33, 0.07);
const vec3 AGD = vec3(-0.389, -0.09, 0.917);  // set sun, front-left
const float EXPO = 1.0;

float Tw;      // wrapped time
float PX;      // one pixel in screen-height units
float VIG;
float ERU;     // eruption strength now (1 = steady)
float PAROX;   // paroxysm envelope now
float FH;      // fountain height now (screen)
float FLASH;   // lightning brightness now
vec2 FLP;      // lightning position
float BOLT;    // bolt seed, < 0: no visible channel
float RBLUR;   // extra blur (screen units) for thin bright features seen in rippled reflections

// ---------------------------------------------------------------- noise
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vnoise1P(float x, float per) { float i = floor(x), f = fract(x); return mix(h11(mod(i, per)), h11(mod(i + 1.0, per)), f * f * (3.0 - 2.0 * f)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// bilinear value noise: faceted, angular shapes
float vnoiseL(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// value noise periodic in x
float vnoiseP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(x0, i.y)), h12(vec2(x1, i.y)), u.x), mix(h12(vec2(x0, i.y + 1.0)), h12(vec2(x1, i.y + 1.0)), u.x), u.y);
}
// value noise with analytic derivatives
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h12(i), b = h12(i + vec2(1.0, 0.0)), c = h12(i + vec2(0.0, 1.0)), d = h12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
// gradient noise periodic in y, with analytic derivatives
vec3 gnD(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  vec2 ga = h22(vec2(i.x, y0)) * 2.0 - 1.0, gb = h22(vec2(i.x + 1.0, y0)) * 2.0 - 1.0;
  vec2 gc = h22(vec2(i.x, y1)) * 2.0 - 1.0, gd = h22(vec2(i.x + 1.0, y1)) * 2.0 - 1.0;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - 1.0);
  float k = va - vb - vc + vd;
  return vec3(va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
              ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(vb, vc) - va));
}

float fbm1(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 9; i++) {
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
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoise(p), clamp(oct - fi, 0.0, 1.0));
    p = ROT * p + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return s + a;
}
// x-periodic fbm (period doubles per octave)
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
vec3 fbmD(vec2 p, float oct) {
  vec3 s = vec3(0.0);
  float a = 0.5;
  mat2 J = mat2(1.0);
  for (int i = 0; i < 8; i++) {
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
float octFor(float freq) { return clamp(log2(1.0 / (2.5 * PX * freq)), 1.0, 9.0); }

// ---------------------------------------------------------------- time
// phase in [0,1) of an oscillator of period ~per seconds, snapped to the loop
float ph(float per) { return fract(Tw * floor(LOOP / per + 0.5) / LOOP); }
// smooth noise of time with about one feature per per seconds, periodic in the loop
float tnoise(float per, float seed) {
  float n = floor(LOOP / per + 0.5);
  float x = Tw / LOOP * n;
  float i = floor(x), f = fract(x);
  return mix(h11(mod(i, n) + seed * 13.1), h11(mod(i + 1.0, n) + seed * 13.1), f * f * (3.0 - 2.0 * f));
}

// paroxysm: one in each 200 s window, at a random moment, never crossing a window
float paroxAt(float t) {
  float n = floor(t / 200.0);
  float id = mod(n, 6.0);
  float dt = t - (n * 200.0 + 15.0 + 115.0 * h11(id * 7.31 + 1.0));
  return (0.55 + 0.45 * h11(id * 3.17 + 5.0)) * smoothstep(0.0, 5.0, dt) * (1.0 - smoothstep(12.0, 48.0, dt));
}
// Strombolian bursts: a 3 s slot each, mostly small, sometimes big
float burstAt(float t) {
  float n = floor(t / 3.0);
  float e = 0.0;
  for (int k = 0; k < 3; k++) {
    float m = n - float(k);
    float id = mod(m, 400.0);
    float dt = t - m * 3.0 - 2.0 * h11(id * 1.37 + 0.2);
    float s = h11(id * 9.71 + 3.0);
    e += s * s * 1.4 * smoothstep(0.0, 0.3, dt) * exp(-max(dt, 0.0) / 1.3);
  }
  return e;
}

float plumeAxis(float s) { return CR.x + 0.02 * s + 0.75 * s * s; }
float plumeW(float s) { return 0.018 + 0.38 * s + 0.5 * s * s; }

void events() {
  PAROX = paroxAt(Tw);
  float b = burstAt(Tw);
  float slow = tnoise(9.0, 1.0);
  ERU = 0.8 + 0.4 * slow + 0.45 * b + 1.4 * PAROX;
  FH = 0.019 * (0.6 + 0.55 * slow + 0.6 * b + 1.8 * PAROX);
  // lightning: one candidate flash per 5 s slot, likelier during a paroxysm
  FLASH = 0.0;
  BOLT = -1.0;
  FLP = vec2(0.0);
  float n = floor(Tw / 5.0);
  float id = mod(n, 240.0);
  float t0 = n * 5.0 + 3.5 * h11(id * 2.13 + 0.7);
  float dt = Tw - t0;
  if (dt > 0.0 && dt < 1.3 && h11(id * 5.37 + 1.9) < 0.08 + 0.8 * paroxAt(t0)) {
    float f = 0.0;
    float ns = 1.0 + 3.0 * h11(id * 8.1);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      if (fk > ns) break;
      float tk = fk * (0.07 + 0.13 * h11(id * 3.3 + fk));
      float d = dt - tk;
      if (d > 0.0) f += (k == 0 ? 1.0 : 0.65) * (exp(-d / 0.035) + 0.15 * exp(-d / 0.25));
    }
    FLASH = f;
    float s = 0.06 + 0.2 * h11(id * 4.7 + 2.0);
    FLP = vec2(plumeAxis(s) + (h11(id * 6.1 + 4.0) - 0.5) * 1.1 * plumeW(s), CR.y + s);
    BOLT = h11(id * 7.7) < 0.55 ? id : -1.0;
  }
}

// ---------------------------------------------------------------- colour
vec3 display(vec3 c) {
  c *= EXPO * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
vec4 outL(vec4 c) { return vec4(display(c.rgb) * c.a, c.a); }
// incandescent lava: T in [0,1] (1 = fresh, yellow-white) -> linear radiance
vec3 lavaE(float T) {
  T = max(T, 0.0);
  float t2 = T * T;
  return vec3(1.0, 0.15 + 0.62 * t2, 0.02 + 0.3 * t2 * t2) * (exp(4.2 * T) - 1.0) * 0.12;
}

// ---------------------------------------------------------------- sky
vec3 skyBase(vec3 rd) {
  float e = max(rd.y, 0.0);
  vec2 hz = normalize(rd.xz + vec2(0.0, 1e-4));
  float az = max(dot(hz, normalize(AGD.xz)), 0.0);
  float a2 = az * az;
  vec3 c = mix(vec3(0.030, 0.043, 0.108), vec3(0.0042, 0.0075, 0.030), pow(smoothstep(0.0, 0.6, e), 0.55));
  float a5 = a2 * a2 * az;
  c += vec3(0.62, 0.19, 0.045) * a5 * a5 * exp(-e / 0.028);
  c += vec3(0.17, 0.095, 0.05) * a5 * exp(-e / 0.075);
  c += vec3(0.018, 0.038, 0.05) * a2 * exp(-e / 0.2);
  return c;
}
// light from the vent scattered by the haze around the summit
vec3 ventGlow(vec2 q) {
  vec2 d = (q - CR - vec2(0.0, 0.012)) * vec2(1.0, 1.25);
  float r = length(d);
  return LAVA * ERU * (0.055 * exp(-r / 0.05) + 0.022 * exp(-r / 0.22)) * (0.6 + 0.4 * smoothstep(0.1, -0.05, q.y - CR.y));
}
vec3 hazeAt(vec2 q) {
  return skyBase(normalize(vec3(q.x, 0.01 + 0.25 * max(q.y - YH, 0.0), FOC))) + 0.5 * ventGlow(q);
}

vec3 stars(vec2 q) {
  vec3 st = vec3(0.0);
  for (int L = 0; L < 2; L++) {
    float cell = L == 0 ? 0.028 : 0.061;
    vec2 g = q / cell + float(L) * 17.3;
    vec2 id = floor(g);
    if (h12(id + 3.1) > (L == 0 ? 0.5 : 0.7)) continue;
    vec2 o = h22(id + 1.7);
    vec2 d = (g - id - 0.15 - 0.7 * o) * cell;
    float F = (L == 0 ? 0.004 : 0.012) + (L == 0 ? 0.05 : 0.35) * pow(h12(id + 9.3), 5.0);
    float sig = 0.65 * PX;
    float tw = 1.0 + 0.25 * sin(TAU * (ph(0.9 + 0.8 * o.x) + o.y));
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), h12(id + 5.5));
    st += tint * F * tw * exp(-dot(d, d) / (2.0 * sig * sig)) * 1.3e-6 / (sig * sig);
  }
  return st;
}

// thin stratus streaks low in the west, their undersides lit by the afterglow
vec4 clouds(vec3 rd, float octMax) {
  if (rd.y < 0.008 || rd.y > 0.16) return vec4(0.0);
  float iy = 1.0 / rd.y;
  vec2 uv = rd.xz * iy;
  float mask = smoothstep(0.55, -0.2, rd.x / rd.z + 0.1 * rd.y * iy * 0.0) * smoothstep(0.008, 0.03, rd.y) * smoothstep(0.16, 0.07, rd.y);
  if (mask <= 0.0) return vec4(0.0);
  vec2 p = vec2(uv.x * 0.45, uv.y * 0.16);
  p.x -= Tw * (16.0 / LOOP);
  float fp = PX / FOC * iy * iy * 0.45;
  float oct = clamp(log2(0.4 / fp), 1.0, octMax);
  float n = fbmP(p + vec2(0.0, 3.0), 16.0, oct);
  float cov = mix(0.62, 0.5, vnoiseP(p * 0.25, 4.0));
  float dens = smoothstep(cov, cov + 0.22, n) * mask;
  if (dens <= 0.001) return vec4(0.0);
  vec2 hz = normalize(rd.xz);
  float az = max(dot(hz, normalize(AGD.xz)), 0.0);
  float lit = az * az * az * (0.45 + 0.55 * (1.0 - smoothstep(cov + 0.05, cov + 0.35, n)));
  vec3 col = vec3(0.016, 0.019, 0.042) + vec3(0.85, 0.32, 0.12) * 0.42 * lit * smoothstep(0.15, 0.02, rd.y);
  col = mix(col, skyBase(rd), 1.0 - exp(-iy * 0.012));
  return vec4(col, dens * 0.92);
}

vec3 skyLin(vec2 q, bool detail) {
  vec3 rd = normalize(vec3(q.x, q.y - YH, FOC));
  vec3 c = skyBase(rd) * (1.0 - 0.6 * smoothstep(0.0, -0.15, rd.y));
  if (detail) {
    float sv = smoothstep(0.05, 0.3, rd.y) * (1.0 - 0.8 * smoothstep(0.15, 0.0, length(q - CR - vec2(0.08, 0.1)) - 0.12));
    if (sv > 0.0) c += stars(q) * sv;
    // evening star in the afterglow
    vec2 dv = q - vec2(-0.47, 0.545);
    float rv = length(dv);
    float sgv = max(0.75 * PX, 0.0009);
    c += vec3(1.0, 0.95, 0.85) * (0.5 * exp(-rv * rv / (2.0 * sgv * sgv)) * 1.3e-6 / (sgv * sgv) + 0.01 * exp(-rv / 0.004));
    vec4 cl = clouds(rd, 6.0);
    c = mix(c, cl.rgb, cl.a);
  }
  c += ventGlow(q);
  return c;
}

// ---------------------------------------------------------------- far ridges
vec4 ridgesLin(vec2 q, float octCap) {
  if (q.y > YH + 0.12 || q.y < YH - 0.016) return vec4(0.0);
  float oct = min(octFor(9.0), octCap);
  // far range along the whole horizon
  float y1 = YH + 0.008 + 0.018 * fbm1(q.x * 3.2 + 4.0, oct) + 0.022 * smoothstep(0.0, -0.8, q.x);
  // a distant dormant cone, silhouetted against the afterglow
  float dc = q.x + 0.53;
  float yc = YH + 0.004 + 0.074 * exp(-sqrt(dc * dc + 0.0003) / 0.1) + 0.0035 * (fbm1(q.x * 60.0, oct - 2.0) - 0.5);
  // nearer wooded ridge on the far left
  float t2 = smoothstep(-0.22, -0.95, q.x);
  float y2 = YH - 0.002 + 0.06 * t2 * (0.45 + 0.8 * fbm1(q.x * 5.0 + 1.3, oct)) + 0.0025 * (fbm1(q.x * 140.0, oct - 3.0) - 0.5) * t2;
  float a1 = smoothstep(-PX, PX, max(y1, yc) - q.y);
  float a2 = smoothstep(-PX, PX, y2 - q.y);
  float a = max(a1, a2);
  if (a <= 0.0) return vec4(0.0);
  vec3 hz = skyBase(normalize(vec3(q.x, 0.03, FOC)));
  vec3 rock = vec3(0.010, 0.011, 0.02);
  vec3 c1 = mix(rock, hz, 0.5);
  // backlit rim on the cone and the far range
  float top = max(y1, yc);
  c1 += vec3(0.6, 0.25, 0.08) * 0.06 * exp(-max(top - q.y, 0.0) / 0.0012) * pow(max(dot(normalize(vec2(q.x, FOC)), normalize(AGD.xz)), 0.0), 40.0);
  vec3 c2 = mix(rock * (0.7 + 0.6 * fbm(q * vec2(90.0, 260.0), min(octFor(260.0), octCap) - 1.0)), hz, 0.3);
  c2 += vec3(0.5, 0.22, 0.08) * 0.03 * exp(-max(y2 - q.y, 0.0) / 0.0015);
  vec3 c = a2 >= a1 ? c2 : mix(c2, c1, a1 * (1.0 - a2));
  c += 0.35 * ventGlow(q);
  return vec4(c, a);
}

// ---------------------------------------------------------------- ash plume
const float PE0 = 0.013, PE1 = 0.115;  // eddy size at the vent and its growth with height
const float PV = 0.10666667;           // rise in eddy units per second (2 noise periods per loop)
// plume field (f, df/dx, df/dy); f > 0 inside. s = height above the vent
vec3 plumeF(vec2 q, float octMax, out float s, out vec3 nv) {
  s = q.y - CR.y + 0.01;
  nv = vec3(0.0);
  if (s < 0.0) return vec3(-1.0, 0.0, 0.0);
  float w = plumeW(s);
  float dx = q.x - plumeAxis(s);
  float a = dx / w;
  if (abs(a) > 1.9) return vec3(-1.0, 0.0, 0.0);
  float e = PE0 + PE1 * s;
  vec2 nq = vec2(dx / (1.25 * e), log(e / PE0) / PE1 - Tw * PV);
  vec2 jac = vec2(1.0 / (1.25 * e), 1.0 / e);
  float oct = clamp(log2(e / (2.0 * PX)), 1.0, octMax);
  // noise: big lobes (signed) then billows (|n|) for the cauliflower skin
  vec3 n = vec3(0.0), nLo = vec3(0.0);
  float amp = 0.75;
  vec2 p = nq * 0.5;
  float per = 32.0;
  mat2 J = mat2(0.5, 0.0, 0.0, 0.5);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float wt = clamp(oct - fi, 0.0, 1.0);
    vec3 g = gnD(p, per);
    if (i >= 1) g = vec3(abs(g.x) * 2.0 - 0.35, 2.0 * sign(g.x) * g.yz);
    n.x += amp * wt * g.x;
    n.yz += amp * wt * (transpose(J) * g.yz);
    if (i == 1) nLo = n;
    // alternating shear: decorrelates the octaves, keeps them y-periodic and isotropic
    float sh = (i % 2 == 0) ? 0.73 : -0.73;
    p = vec2(2.0 * p.x + 5.31, 2.0 * p.y + sh * p.x);
    J = mat2(2.0, sh, 0.0, 2.0) * J;
    per *= 2.0;
    amp *= 0.45;
  }
  float wp = 0.38 + 1.0 * s;   // dw/ds
  float dads = -(0.02 + 1.5 * s + a * wp) / w;
  float f = 1.0 - a * a + 1.25 * n.x;
  vec2 grad = vec2(-2.0 * a / w, -2.0 * a * dads) + 1.25 * n.yz * jac;
  if (oct < 2.0) nLo = n;
  nv = vec3(mix(nLo.x, n.x, 0.6), (nLo.yz * 0.8 + (n.yz - nLo.yz) * 0.07) * jac * e);   // billow relief: value and slope per eddy
  return vec3(f, grad);
}

vec4 plumeLin(vec2 q, float octMax) {
  float s;
  vec3 nv;
  vec3 f = plumeF(q, octMax, s, nv);
  if (f.x < -0.6) return vec4(0.0);
  float g = length(f.yz);
  float fw = max(g * PX * 1.2, 0.035);
  float soft = 0.12 + 0.35 * smoothstep(0.12, 0.35, s) * smoothstep(-0.2, 1.2, (q.x - plumeAxis(s)) / plumeW(s));   // feathered downwind
  float dens = smoothstep(-fw, fw + soft, f.x) * smoothstep(-0.01, 0.006, s);
  if (dens <= 0.0) return vec4(0.0);
  // normal: the column's round body plus the billows on its skin
  vec2 nn = -f.yz / max(g, 1e-4);
  float edge = exp(-max(f.x, 0.0) * 2.0);
  vec3 N = normalize(vec3(nn * 0.8 * edge - nv.yz * 0.3, 1.0));
  float core = clamp(f.x, 0.0, 1.5);
  float lump = smoothstep(-0.45, 0.45, nv.x);   // billow tops vs creases
  vec2 dv = CR - q;
  float r2 = dot(dv, dv);
  vec3 Lv = normalize(vec3(dv, 0.05));
  vec3 alb = vec3(0.30, 0.28, 0.27);
  // twilight sky: dome plus the brighter west
  vec3 col = alb * vec3(0.040, 0.052, 0.11) * (0.55 + 0.45 * N.y) * (0.55 + 0.45 * lump) * (1.0 - 0.25 * core);
  col += alb * vec3(0.07, 0.075, 0.13) * max(dot(N, normalize(vec3(-0.75, 0.45, 0.5))), 0.0) * (0.6 + 0.4 * lump);
  // underlit by the fountain: the skin facing the vent, fading up the column
  float ndl = max(dot(N, Lv), 0.0);
  col += alb * LAVA * ERU * 0.0042 / (r2 + 0.0009) * exp(-core * 1.3) * (0.25 + 0.75 * ndl) * (0.6 + 0.4 * lump);
  // incandescent ash at the base of the column
  col += LAVA * ERU * 1.2 * exp(-s / 0.011) * smoothstep(0.0, 0.3, core);
  // last sunlight on the top of the column, from the west
  col += alb * vec3(0.6, 0.22, 0.13) * 0.12 * max(dot(N, normalize(vec3(-0.9, 0.35, 0.25))), 0.0) * smoothstep(0.14, 0.4, s) * (0.5 + 0.5 * lump);
  // lightning inside the cloud
  if (FLASH > 0.0) {
    vec2 dl = q - FLP;
    col += vec3(0.62, 0.68, 1.0) * FLASH * (1.1 * exp(-dot(dl, dl) / 0.0011) + 0.14 * exp(-length(dl) / 0.08)) * (0.3 + 0.7 * exp(-core)) * (0.5 + 0.5 * lump);
  }
  col = mix(col, hazeAt(q), 0.1);
  return vec4(col, dens);
}

// lightning channel: a jagged, kinked walk from the flash point with a side branch
vec4 boltLin(vec2 q) {
  if (BOLT < 0.0 || FLASH < 0.05) return vec4(0.0);
  vec2 a = FLP;
  float side = h11(BOLT * 1.3) < 0.5 ? -1.0 : 1.0;
  float d = 1e3;
  vec2 br = a;
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    vec2 r = h22(vec2(BOLT, fk * 3.1)) - 0.5;
    vec2 b = a + vec2((0.006 + 0.014 * r.x) * side + 0.012 * r.y, -0.007 + 0.016 * r.y);
    vec2 pa = q - a, ba = b - a;
    float L = length(ba);
    float t = clamp(dot(pa, ba) / (L * L), 0.0, 1.0);
    float perp = (pa.x * ba.y - pa.y * ba.x) / L;
    float kink = 0.0025 * (fbm1(t * L * 900.0 + fk * 7.0 + BOLT, 3.0) - 0.5) * sin(PI * t);
    d = min(d, length(vec2((t - clamp(t, 0.0, 1.0)) * L, perp - kink)) + max(abs(dot(pa, ba) / L - t * L), 0.0));
    if (k == 2) br = b;
    a = b;
  }
  // a fainter side branch
  vec2 bb = br + vec2(-0.02 * side, -0.012);
  vec2 pa = q - br, ba = bb - br;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float db = length(pa - ba * t) + 0.0006;
  float w = 0.55 * PX;
  float core = exp(-d * d / (2.0 * w * w)) + 0.5 * exp(-db * db / (2.0 * w * w)) * (1.0 - t);
  float halo = exp(-d / 0.0035) * 0.3 + exp(-db / 0.003) * 0.1;
  float I = FLASH * (core + halo);
  return vec4(vec3(0.82, 0.86, 1.0) * 6.0, clamp(I * 0.6, 0.0, 1.0));
}

// ---------------------------------------------------------------- volcano
float flankU0(float h, float VL, float E0) { return UC - VL * log(E0 + clamp(h / HS, 0.0, 1.0) * (1.0 - E0)); }
float rimTop(float dx, float oct) {
  return HS + 0.0026 * (fbm1(dx * 95.0 + 2.0, oct) - 0.5) * 2.0 - 0.0035 * exp(-pow((dx + 0.0095) / 0.0035, 2.0)) - 0.002 * smoothstep(0.6, 1.0, abs(dx) / UC);
}
// screen y of the top of the cone's silhouette at x (rim or flank)
float coneTop(float x, float oct) {
  float dx = x - CR.x;
  float ax = abs(dx);
  if (ax < UC) return YH + rimTop(dx, oct);
  float VL = dx < 0.0 ? VLL : VLR, E0 = dx < 0.0 ? E0L : E0R;
  return YH + HS * (exp(-(ax - UC) / VL) - E0) / (1.0 - E0);
}

// lava rivers: start angle, start radius, end radius, phase
const vec4 RIV[4] = vec4[4](vec4(-0.36, 0.026, 0.43, 0.0), vec4(0.16, 0.07, 0.27, 1.7), vec4(0.60, 0.045, 0.47, 3.1), vec4(-1.0, 0.06, 0.21, 4.6));
float rivTheta(vec4 R, float rho) {
  float t = rho - R.y;
  return R.x + 0.09 * sin(rho * 9.0 + R.w) * smoothstep(0.0, 0.08, t) + 0.06 * (fbm1(rho * 24.0 + R.w * 5.0, 3.0) - 0.5) * smoothstep(0.0, 0.05, t) + 0.25 * t * sign(R.x + 0.2);
}
float rivWidth(vec4 R, float rho, float k) {
  return (0.0015 + 0.0065 * (rho - UC)) * (0.75 + 0.5 * h11(k * 3.3 + 1.0)) * (1.0 + 1.1 * smoothstep(R.z - 0.07, R.z, rho));
}
// Voronoi border distance (F2 - F1), periodic in y with period per
float vorEdge(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2 g = vec2(float(xx), float(yy));
      vec2 c = i + g;
      c.y = mod(c.y, per);
      vec2 d = g + 0.15 + 0.7 * h22(c) - f;
      float dd = dot(d, d);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

vec4 volcanoLin(vec2 q, float octCap) {
  float h = q.y - YH;
  if (h > HS + 0.004 || h < -0.014) return vec4(0.0);
  float dx = q.x - CR.x;
  float side = dx < 0.0 ? -1.0 : 1.0;
  float VL = side < 0.0 ? VLL : VLR, E0 = side < 0.0 ? E0L : E0R;
  float hc = max(h, 0.0);
  float U = flankU0(hc, VL, E0);
  float dUdh = -VL * (1.0 - E0) / HS / (E0 + hc / HS * (1.0 - E0));
  if (side > 0.0) U += 0.05 * exp(-pow((hc - 0.075) / 0.035, 2.0));   // an old shoulder on the right
  // limb roughness: ridges and gullies seen edge-on
  float octL = min(octFor(40.0), octCap);
  float lm = smoothstep(0.0, 0.035, HS - hc);
  float lr = 0.009 * (fbm1(hc * 40.0 + side * 7.0, octL) - 0.5) + 0.016 * (fbm1(hc * 9.0 + side * 3.0, 2.0) - 0.5);
  float lr2 = 0.009 * (fbm1((hc + 0.002) * 40.0 + side * 7.0, octL - 2.0) - 0.5) + 0.016 * (fbm1((hc + 0.002) * 9.0 + side * 3.0, 2.0) - 0.5);
  U += lr * lm;
  float slope = dUdh + (lr2 - lr) / 0.002 * lm;
  float dS = (U - abs(dx)) / sqrt(1.0 + slope * slope);
  float dT = rimTop(dx, min(octFor(95.0), octCap)) - h;
  float a = smoothstep(-PX, PX, min(dS, dT));
  if (a <= 0.0) return vec4(0.0);

  // ---- surface of revolution: azimuth, radius, profile slope
  float sN = clamp(dx / max(U, 1e-4), -0.995, 0.995);
  float th = asin(sN);
  float cth = sqrt(1.0 - sN * sN);
  float rho = flankU0(hc, 0.335, 0.0634);
  float SL = (HS / VLL) * (E0L + hc / HS * (1.0 - E0L)) / (1.0 - E0L);
  float SR = (HS / VLR) * (E0R + hc / HS * (1.0 - E0R)) / (1.0 - E0R);
  float S = mix(SL, SR, smoothstep(-0.3, 0.3, sN));
  vec3 n0 = normalize(vec3(S * sN, 1.0, -S * cth));
  vec3 tT = vec3(cth, 0.0, sN);
  vec3 tR = normalize(vec3(sN, -S, -cth));

  // ---- radial gullies: ridged noise in azimuth / log radius (self-similar,
  // stretched down the slope), deepest on the mid flanks
  vec2 G = vec2(th * 7.0, log(rho) * 1.15);
  float octG = clamp(log2(rho * max(cth, 0.15) / (7.0 * 2.0 * PX)), 0.0, min(7.0, octCap + 1.0));
  vec3 gs = vec3(0.0);
  float amp = 0.5;
  mat2 J = mat2(1.0);
  vec2 p = G;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= octG) break;
    float w = clamp(octG - fi, 0.0, 1.0);
    vec3 nz = vnoiseD(p);
    float v = 2.0 * nz.x - 1.0;
    float r = 1.0 - abs(v);
    vec2 dr = -2.0 * sign(v) * nz.yz;
    gs.x += amp * w * (r * r - 0.45);
    gs.yz += amp * w * 2.0 * r * (transpose(J) * dr);
    float sh = (i % 2 == 0) ? 0.35 : -0.35;
    p = mat2(2.0, 0.0, sh, 2.0) * p + vec2(1.7, 9.2);
    J = mat2(2.0, 0.0, sh, 2.0) * J;
    amp *= 0.43;
  }
  float A = 0.12 * mix(0.35, 1.0, smoothstep(0.03, 0.16, rho)) * mix(1.0, 0.55, smoothstep(0.45, 0.8, rho));
  vec3 n = normalize(n0 - A * (7.0 * gs.y * tT + 1.15 * gs.z * tR));
  float ao = clamp(0.6 + 1.1 * gs.x, 0.2, 1.0);

  // ---- materials
  vec2 sp = vec2(th * rho, hc);   // arc / height on the surface (screen units)
  float tex = fbm(sp * vec2(240.0, 240.0), clamp(min(octFor(240.0 / max(cth, 0.2)), octCap + 2.0) - 1.0, 1.0, 6.0));
  float forest = smoothstep(0.004, -0.004, hc - 0.028 - 0.03 * fbm(sp * vec2(14.0, 40.0), 3.0) + 0.012 * gs.x);
  float ash = smoothstep(0.1, 0.19, hc) * smoothstep(0.42, 0.62, vnoise(vec2(th * 26.0, log(rho) * 3.0)) - 0.25 * gs.x);
  vec3 alb = vec3(0.05, 0.048, 0.05) * (0.55 + 0.9 * tex);
  alb = mix(alb, vec3(0.10, 0.095, 0.092) * (0.8 + 0.4 * tex), ash * 0.75);
  alb = mix(alb, vec3(0.085, 0.048, 0.036) * (0.7 + 0.6 * tex), smoothstep(0.235, 0.27, hc));   // oxidised scoria at the rim
  alb = mix(alb, vec3(0.02, 0.028, 0.02) * (0.5 + 1.0 * tex), forest);

  // ---- lava rivers: patchy crust drifting downstream over bright cracks,
  // incandescent blocks tumbling from the flow fronts
  float glowR = 0.0;
  vec3 em = vec3(0.0), emB = vec3(0.0);
  float ra = 0.0;
  float aaA = (PX + RBLUR) / max(cth, 0.12);
  for (int k = 0; k < 4; k++) {
    vec4 R = RIV[k];
    float fk = float(k);
    if (rho < R.y - 0.02 || rho > R.z + 0.12) continue;
    float thr = rivTheta(R, min(rho, R.z + 0.1));
    float dTh = (th - thr) * rho;
    float d = abs(dTh);
    float wr = rivWidth(R, min(rho, R.z), fk);
    float over = max(rho - R.z, 0.0) * (0.25 + S) + max(R.y - rho, 0.0) * (0.25 + S);
    float tl = clamp((rho - R.y) / (R.z - R.y), 0.0, 1.0);
    float seg = smoothstep(0.3, 0.7, fbm1(rho * 48.0 + fk * 13.0, 4.0));
    // lava tubes: stretches roofed over, glowing only through skylights
    float tube = smoothstep(0.6, 0.68, fbm1(rho * 17.0 + fk * 5.7, 3.0)) * smoothstep(0.05, 0.1, rho - R.y) * smoothstep(0.03, 0.06, R.z - rho);
    float T = (0.8 - 0.34 * tl) * (0.55 + 0.6 * seg) + 0.16 * exp(-abs(rho - R.z) / 0.008);
    T *= 0.88 + 0.12 * ERU;
    float Tg = (0.8 - 0.34 * tl) * 0.85 + 0.12 * exp(-abs(rho - R.z) / 0.015);   // smooth along the flow: no banding
    float gI = (exp(4.0 * Tg) - 1.0) * 0.045 * (0.88 + 0.12 * ERU);
    glowR += gI * wr * wr * 16.0 / (d * d + over * over + wr * wr * 16.0) * 0.8 * (1.0 - 0.7 * tube);
    // channel
    float wre = wr * (0.8 + 0.4 * vnoise(vec2(rho * 520.0, fk * 5.0 + sign(dTh) * 2.0)));
    if (rho < R.z + 0.006 && rho > R.y - 0.004 && d < wre + 2.0 * aaA) {
      float cov = smoothstep(wre + aaA, wre - aaA, d) * wre / (wre + RBLUR) * smoothstep(R.z + 0.005, R.z - 0.002, rho + 0.004 * (d / wr) * (d / wr)) * smoothstep(R.y - 0.004, R.y + 0.002, rho);
      float across = clamp(d / wre, 0.0, 1.0);
      float Tl = T * (1.0 - 0.35 * across * across);
      float crust = max(smoothstep(0.0, 0.1, rho - R.y) * (0.3 + 0.7 * across) * (1.0 - 0.75 * seg), tube);
      float cellPx = 0.0034 * max(cth, 0.15) / PX;
      float det = RBLUR > 0.0 ? 0.0 : smoothstep(1.2, 3.5, cellPx);
      float cf = 0.25;
      if (det > 0.0) {
        vec2 cq = vec2(dTh / 0.0034 + fk * 7.3, (rho - Tw * 0.00072) / 0.0045);
        float eV = vorEdge(cq, 64.0);
        float cw = 0.04 + 0.1 * (1.0 - crust);
        float pxc = 1.0 / cellPx;
        cf = mix(cf, smoothstep(cw + pxc, cw - pxc, eV) * (0.6 + 0.4 * h12(floor(cq) + 3.0)), det);
      }
      float pulse = 0.9 + 0.1 * sin(TAU * ph(23.0) + rho * 60.0 + fk);
      float Tm = mix(Tl, Tl * mix(0.18, 0.95, cf * (1.0 - 0.75 * tube)), clamp(crust, 0.0, 1.0)) * pulse;
      em += lavaE(Tm) * cov;
      ra = max(ra, cov);
    }
    // incandescent blocks rolling down from the front (0.32 cells/s, 6 hash periods per loop)
    if (rho > R.z - 0.004 && rho < R.z + 0.11) {
      float bc = (rho - R.z) / 0.0055 - Tw * 0.32;
      float ci = floor(bc);
      float cm = mod(ci, 64.0);
      vec2 hb = h22(vec2(cm, fk * 17.0));
      if (hb.x < 0.42) {
        float off = (hb.y - 0.5) * 1.2 * wr;
        vec2 dd = vec2((dTh - off) * cth, (bc - ci - 0.5) * 0.0055 * (0.2 + S));
        float sig = max(0.0007, 0.65 * PX);
        float I = exp(-dot(dd, dd) / (2.0 * sig * sig)) * 0.0007 / sig * exp(-max(rho - R.z, 0.0) / 0.035) * (0.6 + 0.4 * sin(TAU * ph(0.31) + cm));
        emB += lavaE(0.72) * I + LAVA * 0.05 * exp(-length(dd) / 0.003) * exp(-max(rho - R.z, 0.0) / 0.035);
      }
    }
  }

  // ---- lighting: sky dome (brighter in the west), the vent, the lit plume, the lava
  vec3 col = alb * vec3(0.075, 0.10, 0.21) * (0.45 + 0.55 * n.y) * ao;
  col += alb * vec3(0.10, 0.11, 0.20) * max(dot(n, normalize(vec3(-0.55, 0.45, 0.7))), 0.0) * (0.5 + 0.5 * ao);
  col += alb * vec3(0.30, 0.12, 0.06) * 0.5 * max(dot(n, normalize(vec3(-0.45, 0.1, 0.89))), 0.0);
  vec3 toV = vec3(-sN * rho, HS + 0.012 + 0.4 * FH - hc, cth * rho);
  float dv2 = dot(toV, toV);
  col += alb * LAVA * ERU * 0.0055 / (dv2 + 0.0012) * max(dot(n, toV * inversesqrt(dv2)), 0.0) * (0.4 + 0.6 * ao);
  col += alb * LAVA * ERU * 0.06 * smoothstep(0.12, 0.27, hc) * max(n.y, 0.0) * ao;   // the lit plume overhead
  col += alb * LAVA * glowR * (0.45 + 0.55 * ao);
  // the crater's light spilling over the rim
  col += LAVA * ERU * 0.5 * exp(-max(dT, 0.0) / 0.0025) * smoothstep(UC + 0.012, UC - 0.004, abs(dx));
  col = col * (1.0 - ra) + em + emB;
  // aerial perspective: thicker near the base
  float fog = 0.07 + 0.3 * exp(-hc / 0.022);
  col = mix(col, hazeAt(q), fog);
  // glow of the lava in the air in front of it
  col += LAVA * min(glowR, 4.0) * 0.01;
  return vec4(col, a);
}

// ---------------------------------------------------------------- fountain
const vec2 VENT = vec2(0.338, 0.628);
vec4 fountainLin(vec2 q, vec2 qv, float octCap) {
  vec2 d = q - VENT;
  if (d.y < -0.22 || d.y > 0.2 || abs(d.x) > 0.2) return vec4(0.0);
  float H = FH;
  vec3 em = vec3(0.0);
  float a = 0.0;
  float mask = smoothstep(-PX, PX, qv.y - coneTop(qv.x, min(octFor(95.0), octCap)));
  // heat shimmer over the vent
  vec2 sh = vec2(vnoise1P(q.y * 260.0 - Tw * 8.0, 1600.0) - 0.5, vnoise1P(q.x * 200.0 + 3.0 + Tw * 4.0, 1600.0) - 0.5) * PX * 1.5;
  vec2 ds = d + sh * smoothstep(0.08, 0.0, length(d));
  if (mask > 0.0 && ds.y > -0.01 && ds.y < 1.25 * H + 0.006 && abs(ds.x) < 1.3 * H + 0.006) {
    // jets: parabolic arcs, continuous going up, breaking into clots coming down
    for (int j = 0; j < 14; j++) {
      float fj = float(j);
      float al = (h11(fj * 3.7 + 1.0) - 0.5) * 0.9 + 0.25 * (tnoise(2.3 + 1.7 * h11(fj * 2.9), fj + 9.0) - 0.5);
      float Hj = H * (0.2 + 1.0 * pow(tnoise(1.1 + 0.9 * h11(fj * 5.1), fj + 4.0), 1.5));
      al = sign(al + 1e-5) * max(abs(al), 0.1);
      Hj *= 1.0 - 0.35 * exp(-al * al / 0.04);   // near-vertical jets break up lower
      float xa = Hj * tan(al);
      float K = Hj / (xa * xa);
      float u = ds.x - xa;
      float f = ds.y - Hj + K * u * u;
      float dist = abs(f) / sqrt(1.0 + 4.0 * K * K * u * u);
      float tau = ds.x / (2.0 * xa);
      if (tau < -0.05 || tau > 1.35) continue;
      float wj = (0.0004 + 0.018 * Hj) * (0.6 + 0.8 * h11(fj * 6.3));
      float sig = max(wj, 0.6 * PX);
      float line = exp(-dist * dist / (2.0 * sig * sig)) * wj / sig;
      float br = smoothstep(0.08, 0.5, tau);
      float clot = mix(1.0, smoothstep(0.42, 0.72, vnoise1P(tau * 22.0 - Tw * 2.5 + fj * 7.0, 60.0)), br);
      line *= clot * smoothstep(1.35, 0.9, tau);
      float T = 0.86 - 0.4 * smoothstep(0.25, 1.3, tau) - 0.1 * h11(fj * 9.1);
      em += lavaE(T) * line;
      a = max(a, line);
    }
    // dense core of the fountain
    float cw = 0.0016 + 0.35 * max(ds.y, 0.0);
    float core = exp(-ds.x * ds.x / (cw * cw)) * smoothstep(1.05 * H, 0.15 * H, ds.y) * smoothstep(-0.004, 0.001, ds.y);
    core *= 0.55 + 0.45 * vnoise(vec2(ds.x * 900.0, ds.y * 300.0 - Tw * 6.0));
    em += lavaE(0.9) * core * 0.8;
    a = max(a, core * 0.8);
    em *= mask;
    a *= mask;
  }
  // bombs: ballistic arcs, hidden behind the cone or tumbling down its front
  if (d.y > -0.2 && d.y < 0.16 && abs(d.x) < 0.17) {
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      float cyc = Tw / 30.0 + h11(fk * 5.3 + 0.4);
      float n = floor(cyc);
      float tau = (cyc - n) * 30.0;
      float id = mod(n, 40.0) + fk * 41.0;
      if (h11(id * 1.37) > 0.55 + 0.4 * PAROX) continue;
      float g = 0.0018;
      float Hb = 0.02 + 0.07 * h11(id * 2.11 + 0.3);
      float vy = sqrt(2.0 * g * Hb);
      float be = (h11(id * 3.9 + 1.0) - 0.5) * 2.4;     // azimuth of flight
      float vh = 0.004 + 0.008 * h11(id * 4.4 + 2.0);
      float y0 = VENT.y + 0.002;
      // landing on the cone (linearised near the summit): y0 + vy t - g t^2 / 2 = YH + HS - S0 (vh t - UC)
      float S0 = 0.7;
      float bq = vy + S0 * vh;
      float cq = y0 - (YH + HS + S0 * UC);
      float tl = (bq + sqrt(max(bq * bq + 2.0 * g * cq, 0.0))) / g;
      bool front = cos(be) > 0.0;
      vec2 pos, vel;
      float T, I;
      if (tau < tl) {
        pos = vec2(VENT.x + vh * sin(be) * tau, y0 + vy * tau - 0.5 * g * tau * tau);
        vel = vec2(vh * sin(be), vy - g * tau);
        T = 0.9 - 0.012 * tau;
        I = 1.0;
      } else {
        if (!front) continue;
        float tr = tau - tl;
        float rr = vh * tl + 0.012 * tr - 0.00012 * tr * tr;
        float rb = max(rr, vh * tl);
        float VL = sin(be) < 0.0 ? VLL : VLR, E0 = sin(be) < 0.0 ? E0L : E0R;
        pos = vec2(VENT.x + rb * sin(be), YH + HS * (exp(-(rb - UC) / VL) - E0) / (1.0 - E0));
        vel = vec2(0.0);
        T = 0.75 - 0.05 * tr;
        I = exp(-tr / 5.0) * (0.6 + 0.4 * sin(TAU * ph(0.37) + fk));
      }
      if (T <= 0.0 || I < 0.01) continue;
      vec2 pa = q - pos, ba = -vel * 0.12;
      float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
      float dd = length(pa - ba * t);
      float sz = 0.0006 + 0.0006 * h11(id * 7.0);
      float sig = max(sz, 0.6 * PX);
      float dot0 = exp(-dd * dd / (2.0 * sig * sig)) * sz / sig;
      float vis = front ? 1.0 : smoothstep(-PX, PX, pos.y - coneTop(pos.x, 3.0));
      em += lavaE(T) * dot0 * I * vis * 1.3;
      em += LAVA * exp(-dd / 0.003) * 0.08 * I * vis;
      a = max(a, dot0 * I * vis);
    }
  }
  // glow of the fountain in the summit haze (and over the rim)
  vec2 dg = (d - vec2(0.0, 0.35 * H)) * vec2(1.0, 0.8);
  float rg = length(dg);
  float gl = ERU * (0.35 * exp(-rg / (0.004 + 0.3 * H)) + 0.1 * exp(-rg / 0.03));
  em += vec3(1.0, 0.42, 0.12) * gl * 1.6;
  a = max(a, clamp(gl, 0.0, 0.85));
  if (a <= 0.0) return vec4(0.0);
  return vec4(em / max(a, 1e-4), min(a, 1.0));
}

// ---------------------------------------------------------------- lake
float lakeDepth(float y) { return 0.25 + 0.62 * pow(clamp((YH - y) / YH, 0.0, 1.0), 0.8); }
// ripples: (direction, wavenumber, steepness); LM: cycles per loop (dispersion, quantised)
const vec4 LW[10] = vec4[10](
  vec4(0.5000, -0.8660, 2.094, 0.004), vec4(0.9063, -0.4226, 3.307, 0.006),
  vec4(-0.1736, -0.9848, 5.236, 0.009), vec4(0.7660, -0.6428, 7.854, 0.012),
  vec4(0.2588, -0.9659, 12.566, 0.016), vec4(0.9848, -0.1736, 19.635, 0.018),
  vec4(-0.4226, -0.9063, 31.416, 0.02), vec4(0.6428, -0.7660, 48.33, 0.02),
  vec4(0.0872, -0.9962, 78.54, 0.018), vec4(0.9659, 0.2588, 125.66, 0.016));
const float LM[10] = float[10](866.0, 1088.0, 1369.0, 1676.0, 2121.0, 2655.0, 3366.0, 4195.0, 5422.0, 7089.0);

float glintD(vec3 n, vec3 V, vec3 L, float var) {
  vec3 Hh = normalize(L + V);
  float cb = max(dot(Hh, n), 1e-3);
  float c2 = cb * cb;
  float D = exp(-(1.0 - c2) / (c2 * var)) / (PI * var * c2 * c2);
  float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  return Fh * D / (4.0 * max(dot(n, V), 0.03));
}

vec3 reflScene(vec2 r, float oct) {
  vec3 c = skyLin(r, false);
  vec4 l = ridgesLin(r, oct);
  c = mix(c, l.rgb, l.a);
  l = plumeLin(r, oct);
  c = mix(c, l.rgb, l.a);
  l = volcanoLin(r, oct);
  c = mix(c, l.rgb, l.a);
  l = fountainLin(r, r, oct);
  c = mix(c, l.rgb, l.a);
  return c;
}

float waterY(float x) {
  return 0.128 - 0.05 * smoothstep(-0.4, 0.9, x) + 0.010 * sin(x * 3.3 + 0.6) + 0.006 * (fbm1(x * 7.0 + 2.0, 4.0) - 0.5);
}

vec4 lakeLin(vec2 q) {
  float dy = YH - q.y;
  if (dy < -PX) return vec4(0.0);
  float aH = smoothstep(-0.7 * PX, 0.7 * PX, dy);
  dy = max(dy, 0.3 * PX);
  vec3 rd = normalize(vec3(q.x, -dy, FOC));
  float z = CAMH * FOC / dy;
  vec2 xz = vec2(q.x * z / FOC, z);
  float fx = z * PX / FOC, fz = fx * z / CAMH;
  // wind: calm glassy patches and rippled cat's-paws drifting across
  float wn = 0.7 * vnoiseP(vec2(xz.x * 0.012 - Tw * (64.0 / LOOP), xz.y * 0.025 + 3.0), 64.0) + 0.3 * vnoiseP(vec2(xz.x * 0.05 - Tw * (256.0 / LOOP), xz.y * 0.1 + 7.0), 256.0);
  float amp = mix(0.08, 0.85, smoothstep(0.45, 0.85, wn)) * mix(0.55, 1.0, smoothstep(30.0, 120.0, z));
  vec2 g = vec2(0.0);
  float var = 0.0;
  for (int i = 0; i < 10; i++) {
    vec4 w = LW[i];
    float sv = 0.5 * w.w * w.w * amp * amp;
    float vis = smoothstep(2.0, 5.0, TAU / w.z / max(length(w.xy * vec2(fx, fz)), 1e-5));
    if (vis <= 0.0) { var += sv * (10.0 - float(i)); break; }
    float phs = w.z * dot(w.xy, xz) - TAU * fract(LM[i] * Tw / LOOP) + float(i) * 2.1;
    g += vis * w.w * amp * cos(phs) * w.xy;
    var += (1.0 - vis) * sv;
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = -rd;
  float ndv = max(dot(n, V), 0.02);
  vec3 R = reflect(rd, n);
  R.y = max(R.y, 0.0015);
  R = normalize(R + vec3(0.0, sqrt(var) * 0.2, 0.0));
  vec2 pr = vec2(R.x / R.z * FOC, YH + R.y / R.z * FOC);
  RBLUR = PX * 2.0 + 0.5 * sqrt(var) + 0.02 * length(g);
  vec3 refl = reflScene(pr, 2.5);
  RBLUR = 0.0;
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // shallow water over black sand near the shore
  float zw = CAMH * FOC / max(YH - waterY(q.x), 0.01);
  vec3 body = mix(vec3(0.004, 0.0045, 0.006), vec3(0.0015, 0.0025, 0.0035), smoothstep(0.0, 6.0, z - zw));
  vec3 col = mix(body, refl, F);
  // glitter path of the fountain and the lava below it
  vec3 LF = normalize(vec3(CR.x, CR.y + 0.3 * FH - YH, FOC));
  col += vec3(1.0, 0.45, 0.15) * ERU * 0.0009 * glintD(n, V, LF, var + 0.0008);
  // mist over the far water, lit by the volcano near it
  float mist = exp(-dy / 0.006) * (0.5 + 0.5 * vnoiseP(vec2(q.x * 7.0 - Tw * (24.0 / LOOP), dy * 60.0), 24.0));
  col = mix(col, hazeAt(vec2(q.x, YH + 0.006)), mist * 0.4);
  return vec4(col, aH);
}

// ---------------------------------------------------------------- shore
// wave-worn basalt boulders: (centre x, base y, radius)
const vec3 BLD[6] = vec3[6](vec3(-0.77, 0.0, 0.13), vec3(-0.565, 0.032, 0.052), vec3(-0.465, 0.088, 0.019), vec3(0.71, -0.01, 0.095), vec3(0.585, 0.046, 0.034), vec3(-0.3, 0.018, 0.022));

vec4 shoreLin(vec2 q) {
  float yw = waterY(q.x);
  float lap = 0.0024 * pow(0.5 + 0.5 * sin(TAU * ph(7.0) + q.x * 5.0), 3.0);
  float aB = smoothstep(-PX, PX, yw + lap - q.y);
  // boulders
  float aR = 0.0, occ = 0.0;
  vec2 bl = vec2(0.0);
  float bs = 0.0;
  for (int i = 0; i < 6; i++) {
    vec3 B = BLD[i];
    vec2 l = (q - B.xy - vec2(0.0, 0.25 * B.z)) / vec2(B.z, B.z * 0.7);
    float l2 = dot(l, l);
    if (l2 > 2.6) continue;
    vec2 dl = l / max(length(l), 1e-4);
    float rr = 1.0 + 0.3 * (vnoiseL(dl * 1.3 + float(i) * 3.0) - 0.5) + 0.1 * (vnoiseL(dl * 4.0 + float(i) * 7.0) - 0.5) + 0.03 * (vnoise(dl * 14.0 + float(i)) - 0.5);
    float dd = (length(l) - rr) * B.z * 0.7;
    float base = (l.y + 0.36 + 0.08 * (vnoise(vec2(l.x * 3.0, float(i))) - 0.5)) * B.z * 0.7;
    float ai = smoothstep(PX, -PX, dd) * smoothstep(-PX, PX, base);
    // contact shadow on the sand around the foot
    occ = max(occ, exp(-max(dd, 0.0) / (0.12 * B.z)) * smoothstep(0.6, -0.4, l.y) * 0.7);
    if (ai > aR) { aR = ai; bl = l / rr; bs = float(i); }
  }
  float a = max(aB, aR);
  if (a <= 0.0) return vec4(0.0);
  vec3 col = vec3(0.0);
  vec3 AMBF = vec3(0.10, 0.13, 0.27);
  vec3 Lvol = normalize(vec3(CR.x, CR.y - YH, FOC));
  vec3 Lag = normalize(vec3(-0.39, 0.06, 0.92));
  vec3 rd = normalize(vec3(q.x, q.y - YH, FOC));
  if (aB > 0.0) {
    float dy = max(YH - q.y, 0.01);
    float z = CAMH * FOC / dy;
    vec2 xz = vec2(q.x * z / FOC, z);
    float fx = z * PX / FOC;
    float fz = fx * z / CAMH;
    float fg = sqrt(fx * fz);
    // distance up the beach from the water's edge (m)
    float up = CAMH * FOC / max(YH - yw - lap, 0.01) - z;
    // black sand: grain, backwash rills, a damp band that dries in patches
    float gr = fbm(xz * 34.0, clamp(log2(0.03 / fg), 1.0, 6.0));
    vec3 und = fbmD(xz * vec2(0.9, 1.6) + 3.0, 3.0);
    float rill = fbm(vec2(xz.x * 1.2, xz.y * 7.0), clamp(log2(0.14 / fz), 1.0, 4.0));
    float damp = smoothstep(2.6 + 1.6 * und.x, 0.4, up);
    float wet = clamp(max(smoothstep(0.7, 0.0, up), damp * smoothstep(0.38, 0.62, rill + 0.25 * und.x)), 0.0, 1.0);
    vec3 alb = vec3(0.036, 0.034, 0.036) * (0.65 + 0.7 * gr) * (0.85 + 0.3 * und.x);
    alb *= mix(1.0, 0.55, max(wet, damp * 0.6));
    vec3 nb = normalize(vec3(-und.y * 0.06, 1.0, -und.z * 0.1 - (rill - 0.5) * 0.08));
    col = alb * (AMBF * (0.5 + 0.5 * nb.y) + LAVA * ERU * 0.03 * max(dot(nb, Lvol), 0.0) + vec3(0.25, 0.1, 0.05) * 0.08 * max(dot(nb, Lag), 0.0));
    col *= 1.0 - occ;
    // wet sand mirrors the sky and the volcano, softly
    if (wet > 0.01) {
      vec3 nw = normalize(mix(nb, vec3(0.0, 1.0, 0.0), 0.75));
      vec3 R = reflect(rd, nw);
      R.y = max(R.y, 0.002);
      vec2 pr = vec2(R.x / R.z * FOC, YH + R.y / R.z * FOC);
      RBLUR = 0.004;
      vec3 rc = skyLin(pr, false);
      vec4 vl = volcanoLin(pr, 1.0);
      rc = mix(rc, vl.rgb, vl.a);
      RBLUR = 0.0;
      float F = 0.02 + 0.98 * pow(1.0 - max(dot(nw, -rd), 0.0), 5.0);
      col = mix(col, rc * (1.0 - occ), F * wet * 0.85);
    }
    // lace of foam where the wavelets run up
    float fo = exp(-abs(q.y - yw - lap) / 0.0011) * smoothstep(0.3, 0.7, vnoise(vec2(xz.x * 2.5, 3.0)) + lap * 80.0);
    col = mix(col, vec3(0.07, 0.08, 0.14), fo * 0.55);
  }
  if (aR > 0.0) {
    // angular lava rock: flat facets on a rough dome, creases between them
    vec2 l = bl;
    vec2 fq = l * 1.7 + bs * 5.0;
    vec2 fi = floor(fq), ff = fract(fq);
    float d1 = 9.0, d2 = 9.0;
    vec2 cc = vec2(0.0), cr = vec2(0.5);
    for (int yy = -1; yy <= 1; yy++) {
      for (int xx = -1; xx <= 1; xx++) {
        vec2 g = vec2(float(xx), float(yy));
        vec2 r = h22(fi + g + 0.5);
        vec2 dlt = g + r - ff;
        float dd = dot(dlt, dlt);
        if (dd < d1) { d2 = d1; d1 = dd; cc = fi + g + r; cr = h22(fi + g + 7.7); } else if (dd < d2) d2 = dd;
      }
    }
    vec2 lc = (cc - bs * 5.0) / 1.7;
    vec3 nDome = normalize(vec3(mix(l, lc, 0.6), 0.0) + vec3(0.0, 0.25, -sqrt(max(1.0 - dot(mix(l, lc, 0.6), mix(l, lc, 0.6)), 0.05))));
    vec3 nd = fbmD(l * 5.0 + bs * 7.0, clamp(octFor(5.0 / BLD[int(bs)].z), 1.0, 6.0));
    vec3 n = normalize(nDome + vec3(cr - 0.5, 0.0) * 0.22 + vec3(-nd.y, -nd.z, 0.0) * 0.1);
    float crease = 0.8 + 0.2 * smoothstep(0.0, 0.1 + PX / BLD[int(bs)].z * 3.0, sqrt(d2) - sqrt(d1));
    float ves = fbm(l * 40.0 + bs * 3.0, clamp(octFor(40.0 / BLD[int(bs)].z), 1.0, 5.0));
    vec3 alb = vec3(0.04, 0.039, 0.043) * (0.7 + 0.5 * nd.x) * (0.7 + 0.5 * ves);
    float ao = smoothstep(-0.5, 0.2, l.y) * (0.55 + 0.45 * crease);
    vec3 c = alb * (AMBF * (0.4 + 0.6 * max(n.y, 0.0)) * ao + vec3(0.30, 0.12, 0.06) * 0.15 * max(dot(n, Lag), 0.0));
    // damp, glassy facets mirror the sky and the eruption
    vec3 V = -rd;
    vec3 Rb = reflect(rd, n);
    float Fb = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 rb = normalize(vec3(Rb.x, max(Rb.y, 0.0) + 0.08, max(Rb.z, 0.05)));
    vec3 sk = skyBase(rb) + ventGlow(vec2(rb.x / rb.z * FOC, YH + rb.y / rb.z * FOC)) * 0.6;
    float wetR = mix(0.2, 0.7, smoothstep(0.2, -0.4, l.y));
    c += sk * Fb * wetR * smoothstep(-0.25, 0.2, Rb.y) * (0.5 + 0.5 * ves) * crease;
    c += vec3(1.0, 0.45, 0.15) * ERU * 0.0012 * glintD(n, V, normalize(vec3(CR.x, CR.y + 0.3 * FH - YH, FOC)), 0.02) * wetR * crease;
    col = aB > 0.0 ? mix(col, c, aR) : c;
  }
  return vec4(col, a);
}

// ---------------------------------------------------------------- sparks
// incandescent tephra thrown into the lower plume, carried off on the wind and
// falling out over the downwind flank, cooling as it goes
vec4 sparksLin(vec2 q) {
  vec2 d = q - CR;
  if (d.x < -0.06 || d.x > 0.34 || d.y < -0.16 || d.y > 0.16) return vec4(0.0);
  vec3 c = vec3(0.0);
  float a = 0.0;
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float cs = fl == 0.0 ? 0.006 : 0.0095;
    // wind drift right and a slow fall, periodic in the loop (200 x 300 cells)
    vec2 w = q - vec2(Tw * (fl == 0.0 ? 3.6 : 3.8) / LOOP * 200.0 * cs, -Tw * (fl == 0.0 ? 1.8 : 1.2) / LOOP * 300.0 * cs);
    vec2 id = floor(w / cs);
    vec2 idm = vec2(mod(id.x, 200.0), mod(id.y, 300.0));
    float hs = h12(idm + fl * 31.0);
    if (hs > 0.12) continue;
    vec2 o = h22(idm + fl * 17.0);
    vec2 ctr = (id + 0.25 + 0.5 * o) * cs;
    ctr += cs * 0.2 * vec2(sin(TAU * ph(3.0 + 4.0 * o.x) + hs * 40.0), sin(TAU * ph(2.5 + 3.0 * o.y) + hs * 23.0));
    vec2 rel = w - ctr;
    // where the drifting field is lit: a plume of sparks leaving the vent downwind
    vec2 e = ctr + (q - w) - CR;
    float along = e.x + 0.3 * max(-e.y, 0.0);
    float band = e.y - (0.03 + 0.25 * along - 1.2 * along * along);
    float m = smoothstep(-0.02, 0.02, e.x + 0.015) * exp(-along / 0.035) * exp(-band * band / (0.0008 + 0.02 * along * along));
    m *= ERU * (0.5 + 0.5 * smoothstep(0.0, 0.3, PAROX));
    float fl1 = 0.6 + 0.4 * sin(TAU * ph(0.3 + 0.4 * o.x) + hs * 9.0);
    float sz = (fl == 0.0 ? 0.0005 : 0.0008) * (0.6 + 0.8 * o.y);
    float sig = max(sz, 0.6 * PX);
    float I = exp(-dot(rel, rel) / (2.0 * sig * sig)) * sz / sig * m * fl1;
    if (I <= 0.002) continue;
    I = min(I * 1.6, 1.0);
    c += lavaE(0.55 + 0.25 * exp(-along / 0.05) * o.x) * I * 1.5;
    a = max(a, clamp(I, 0.0, 1.0));
  }
  if (a <= 0.0) return vec4(0.0);
  return vec4(c / a, a);
}

// ---------------------------------------------------------------- main
void main() {
  PX = 1.0 / u_res.y;
  Tw = mod(u_time, LOOP);
  RBLUR = 0.0;
  events();
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.36 * smoothstep(0.12, 0.62, dot(vq, vq) * 1.6);
  float dither = (h12(gl_FragCoord.xy + fract(Tw) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;
  vec2 qR = p + u_par * PAR * 0.08;
  vec2 qP = p + u_par * PAR * 0.22;
  vec2 qV = p + u_par * PAR * 0.25;
  vec2 qF = p + u_par * PAR * 0.26;
  vec2 qL = p + u_par * PAR * lakeDepth(p.y);
  vec2 qS = p + u_par * PAR * 1.0;
  vec2 qK = p + u_par * PAR * 0.3;

  if (u_layer > -0.5) {
    int k = int(u_layer + 0.5);
    vec4 c = vec4(0.0);
    if (k == 0) c = vec4(skyLin(p, true), 1.0);
    else if (k == 1) c = ridgesLin(qR, 9.0);
    else if (k == 2) { c = plumeLin(qP, 7.0); vec4 b = boltLin(qP); c = vec4(mix(c.rgb, b.rgb, b.a), c.a + b.a * (1.0 - c.a)); }
    else if (k == 3) c = volcanoLin(qV, 9.0);
    else if (k == 4) c = fountainLin(qF, qV, 9.0);
    else if (k == 5) c = sparksLin(qK);
    else if (k == 6) c = lakeLin(qL);
    else if (k == 7) c = shoreLin(qS);
    c = outL(c);
    fragColor = vec4(c.rgb + dither * c.a, c.a);
    return;
  }

  // full scene: front-to-back "under" compositing, skipping hidden layers
  vec3 acc = vec3(0.0);
  float T = 1.0;
  vec4 c = outL(shoreLin(qS));
  acc += T * c.rgb; T *= 1.0 - c.a;
  if (T > 0.001) { c = outL(lakeLin(qL)); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = outL(sparksLin(qK)); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = outL(fountainLin(qF, qV, 9.0)); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = outL(volcanoLin(qV, 9.0)); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) {
    vec4 pl = plumeLin(qP, 7.0);
    vec4 b = boltLin(qP);
    pl = vec4(mix(pl.rgb, b.rgb, b.a), pl.a + b.a * (1.0 - pl.a));
    c = outL(pl); acc += T * c.rgb; T *= 1.0 - c.a;
  }
  if (T > 0.001) { c = outL(ridgesLin(qR, 9.0)); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = outL(vec4(skyLin(p, true), 1.0)); acc += T * c.rgb; }
  fragColor = vec4(acc + dither, 1.0);
}
`,
}
