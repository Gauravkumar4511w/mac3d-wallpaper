// Arctic Fjord — a Norwegian fjord at night under a strong aurora.
// The aurora is modelled as vertical emission sheets 100-300 km up whose ground
// tracks fold and drift; every view ray (and every reflected ray) is searched
// for the sheets it crosses, which gives real perspective, edge-on folds,
// rays along the field lines, a sharp green lower border and violet tops.
// Under it: stars and the Milky Way, steep snow-covered peaks catching the
// green light, a still fjord mirroring everything with drifting cat's-paw
// ripples, red fishing cabins with warm windows, a moored boat and snowy
// boulders. Long-cycle events: substorm surges and shooting stars.
//
// Everything is lit in linear HDR, composited front-to-back, ACES-tonemapped
// and dithered. All motion is periodic in one master loop (TP seconds).

export default {
  id: 'fjord',
  name: 'Arctic Fjord',
  tag: 'Northern lights',
  accent: '#43f5a4',
  accent2: '#b07cff',
  ink: '#0d6e4c',
  glow: '#b6ffe0',
  light: false,
  clockColor: '#f0fff8',
  sky: 'linear-gradient(180deg,#05081a 0%,#0c1a33 25%,#14504a 45%,#0a1820 62%,#0b2a30 72%,#07141a 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Night sky', depth: 0 },
    { name: 'Aurora', depth: 0.03 },
    { name: 'Far peaks', depth: 0.12 },
    { name: 'Fjord water', depth: 0.3 },
    { name: 'Mountain walls', depth: 0.5 },
    { name: 'Fishing cabins', depth: 0.72 },
    { name: 'Boat', depth: 0.86 },
    { name: 'Snowy foreshore', depth: 1.1 },
  ],
  clockAfter: 2,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float YH = 0.34;     // horizon height on screen
const float FOC = 0.85;    // focal length (screen heights)
const float PAR = 0.03;    // parallax per unit depth (screen heights)
const float TP = 1200.0;   // master loop (s)
const float RE = 6371.0;   // earth radius (km)
const float CAMH = 5.0;    // camera height above the water (m)
const float EXPO = 1.5;

float TM, PX, AA;
float SURGE;   // substorm envelope (0..1)
float AUR;     // overall aurora brightness: lights snow, water and haze
vec3 PH;       // aurora fold phases
float ZS;      // arc drift (km)
vec3 AURL;     // light from the aurora on upward-facing snow
vec3 SKYL;     // star/airglow skylight

float sq(float x) { return x * x; }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

float n1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float n1P(float x, float P) { float i = floor(x), f = fract(x); return mix(h11(mod(i, P)), h11(mod(i + 1.0, P)), f * f * (3.0 - 2.0 * f)); }
float g1(float x) {
  float i = floor(x), f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return 2.0 * mix((h11(i) * 2.0 - 1.0) * f, (h11(i + 1.0) * 2.0 - 1.0) * (f - 1.0), u);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// value noise, periodic in x
float vnP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mod(i.x, per), b = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(a, i.y)), h12(vec2(b, i.y)), u.x), mix(h12(vec2(a, i.y + 1.0)), h12(vec2(b, i.y + 1.0)), u.x), u.y);
}
// value noise with analytic derivatives
vec3 vnD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h12(i), b = h12(i + vec2(1.0, 0.0)), c = h12(i + vec2(0.0, 1.0)), d = h12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
// fractional octave counts: the last octave fades in, missing ones add their mean
float fbm(vec2 p, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vn(p), clamp(oct - fi, 0.0, 1.0));
    p = ROT * p + vec2(3.1, 1.7);
    a *= 0.5;
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
    vec3 n = vnD(p);
    s.x += a * mix(0.5, n.x, w);
    s.yz += a * w * (transpose(J) * n.yz);
    p = ROT * p + vec2(3.1, 1.7);
    J = ROT * J;
    a *= 0.5;
  }
  s.x += a;
  return s;
}
float fbm1(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, n1(x), clamp(oct - fi, 0.0, 1.0));
    x = x * 2.03 + 1.7;
    a *= 0.5;
  }
  return s + a;
}
// ridged 1D fbm for skylines, ~[0, 1]
float ridge1(float x, float oct) {
  float h = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 10; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    float n = 1.0 - abs(g1(x * f + float(i) * 3.71));
    h += w * a * n * n;
    f *= 2.07; a *= 0.47;
  }
  return h;
}
// seamless oscillators: integer cycles per loop
float cyc(float n) { return fract(n * TM / TP); }
float osc(float n, float ph) { return sin(TAU * cyc(n) + ph); }

// ---------------------------------------------------------------- stars, Milky Way, meteors
vec3 starTint(float r) {
  vec3 c = mix(vec3(1.0, 0.66, 0.42), vec3(1.0, 0.9, 0.78), smoothstep(0.0, 0.2, r));
  c = mix(c, vec3(1.0, 0.97, 0.95), smoothstep(0.2, 0.5, r));
  return mix(c, vec3(0.74, 0.84, 1.0), smoothstep(0.62, 0.95, r));
}
vec3 starGrid(vec2 q, float cell, float prob, float fmin, float seed, float tw) {
  vec2 g = q / cell + seed;
  vec2 id = floor(g);
  vec4 h = h42(id);
  if (h.x > prob) return vec3(0.0);
  vec2 d = (fract(g) - (0.2 + 0.6 * h.yz)) * cell;
  float sig = 0.7 * PX;
  float F = fmin * min(pow(max(h.w, 1e-3), -0.85), 40.0);
  float I = F * exp(-dot(d, d) / (2.0 * sig * sig)) * (0.000625 / PX);
  float k = floor(fract(h.x * 91.7) * 150.0 + 50.0);
  I *= 1.0 + tw * osc(k, h.y * TAU) * smoothstep(0.3, 0.9, fract(h.w * 37.0));
  return starTint(fract(h.y * 13.1 + h.z * 7.3)) * I;
}
float mwFrame(vec2 q, out vec2 uv) {
  vec2 dir = normalize(vec2(1.0, 0.62));
  vec2 r = q - vec2(0.1, 0.78);
  uv = vec2(dot(r, dir), dot(r, vec2(-dir.y, dir.x)));
  return exp(-uv.y * uv.y / (2.0 * 0.13 * 0.13));
}
vec3 milkyWay(vec2 q) {
  vec2 uv;
  float band = mwFrame(q, uv);
  if (band < 0.01) return vec3(0.0);
  float wv = fbm(uv * vec2(2.0, 3.0) + 3.0, 3.0);
  float v = uv.y + 0.07 * (wv - 0.5);
  float core = exp(-v * v / (2.0 * 0.075 * 0.075));
  float clump = fbm(uv * vec2(6.0, 9.0) + 11.0, 4.0);
  float grain = fbm(uv * vec2(55.0, 62.0) - 4.0, 3.0);
  float dust = fbm(uv * vec2(3.5, 12.0) + vec2(2.0, 9.0), 5.0);
  float lane = smoothstep(0.55, 0.92, 1.0 - abs(dust - 0.5) * 2.0) * exp(-sq((v - 0.01) / 0.04));
  float b = (band * 0.25 + core * (0.3 + 1.6 * sq(smoothstep(0.3, 0.75, clump)))) * (0.55 + 0.9 * grain * grain) * (1.0 - 0.85 * lane);
  return mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.9, 0.76), core * 0.5) * b * 0.016;
}
// a shooting star every few minutes (most of the 100 s slots stay empty)
vec3 meteor(vec2 q) {
  float n = floor(TM / 100.0);
  vec4 h = h42(vec2(n, 3.7));
  if (h.x > 0.45) return vec3(0.0);
  float t = (TM - n * 100.0 - 10.0 - 70.0 * h.y) / 0.9;
  if (t < 0.0 || t > 1.0) return vec3(0.0);
  vec2 A = vec2(-0.55 + 1.1 * h.z, 0.72 + 0.2 * h.w);
  float ang = -0.5 - 0.6 * h.x / 0.45 + (h.z > 0.5 ? -1.3 : 0.0);
  vec2 dir = vec2(cos(ang), sin(ang));
  float L = 0.16 + 0.12 * h.w;
  vec2 d = q - A;
  float al = dot(d, dir), pe = dot(d, vec2(-dir.y, dir.x));
  float head = t * L;
  float tail = head - (0.05 + 0.25 * t) * L;
  float along = smoothstep(tail, head, al) * step(al, head + 1.5 * PX);
  float w = 0.6 * PX + 0.0006;
  float I = along * along * exp(-pe * pe / (2.0 * w * w)) * sin(PI * t) * 2.2;
  I += exp(-(sq(al - head) + pe * pe) / (2.0 * sq(1.2 * PX + 0.0008))) * sin(PI * t) * 3.0;
  return vec3(0.75, 1.0, 0.85) * I;
}

// ---------------------------------------------------------------- aurora
// Curtains: zero-isolines of a folded field over the ground (km; x east,
// z north of the camera), raised 100-300 km. A view ray's ground track is
// sampled between those altitudes; every sign change is a sheet crossing.
const vec3 KX = vec3(0.0058, 0.0163, 0.047), KZ = vec3(0.0024, -0.0041, 0.0073), FA = vec3(52.0, 26.0, 9.0);
float bend(float x) { return 0.45 * x / (1.0 + max(x, 0.0) / 650.0); }   // the arc swings east-west far to the east
float fieldB(vec2 P) {
  return P.y - 385.0 - ZS - bend(P.x) - dot(FA, sin(KX * P.x + KZ * P.y + PH));
}
// sheet k at ground point P (fb = fieldB(P)): main curtain, its twin, a quiet distant arc
float sheetF(vec2 P, float fb, int k) {
  if (k == 0) return fb;
  if (k == 1) return fb - 16.0 - 6.0 * sin(P.x * 0.031 + PH.y * 1.3);
  return P.y - 610.0 - 0.22 * P.x - 18.0 * sin(P.x * 0.0042 + PH.x * 0.5) - ZS * 0.5;
}
float sheetAt(vec2 P, int k) { return sheetF(P, k == 2 ? 0.0 : fieldB(P), k); }
// analytic gradient of sheet k
vec2 sheetGrad(vec2 P, int k) {
  if (k == 2) return vec2(-0.22 - 18.0 * 0.0042 * cos(P.x * 0.0042 + PH.x * 0.5), 1.0);
  vec3 c = FA * cos(KX * P.x + KZ * P.y + PH);
  float x = max(P.x, 0.0) / 650.0;
  vec2 g = vec2(-0.45 / ((1.0 + x) * (1.0 + x)) - dot(c, KX), 1.0 - dot(c, KZ));
  if (k == 1) g.x -= 6.0 * 0.031 * cos(P.x * 0.031 + PH.y * 1.3);
  return g;
}
vec3 sheet(float X, float h, float pf, float fpU, float k, float seed) {
  float u = X + seed * 131.0;
  float s1 = smoothstep(2.4, 0.8, fpU / 1.1), s2 = smoothstep(2.4, 0.8, fpU / 0.45), s0 = smoothstep(2.4, 0.8, fpU / 3.2);
  float env = n1P(u / 170.0 + 32.0 * cyc(1.0), 32.0);
  env = 0.12 + 0.88 * smoothstep(0.18, 0.72, env);
  float clump = n1P(u / 38.0 + 64.0 * cyc(2.0), 64.0);
  float r0 = n1P(u / 9.0 - 256.0 * cyc(2.0), 256.0);
  float r1 = 0.45, r2 = 0.45, r3 = 0.45;
  if (s0 > 0.0) r1 = mix(0.45, n1P(u / 3.2 + 512.0 * cyc(3.0), 512.0), s0);
  if (s1 > 0.0) r2 = mix(0.45, n1P(u / 1.1 - 1024.0 * cyc(4.0), 1024.0), s1);
  if (s2 > 0.0) r3 = mix(0.45, n1P(u / 0.45 + 2048.0 * cyc(3.0), 2048.0), s2);
  float rays = 0.1 + 2.4 * (0.5 * r0 * r0 * r0 + 0.35 * r1 * r1 * r1 + 0.25 * r2 * r2 * r2 + 0.12 * r3 * r3);
  float quiet = step(1.5, seed);                   // the distant arc: thin, calm, homogeneous
  rays = mix(rays, 0.75 + 0.25 * rays, quiet);
  env = mix(env, 0.55 + 0.45 * env, quiet);
  // lower border: undulating, pleated by the rays, dipping lower in a surge (N2 pink)
  float hb = 99.0 + 8.0 * (n1(u / 90.0 + seed) - 0.5) - 3.0 * (r1 - 0.45) * (1.0 - quiet) - 1.5 * (r2 - 0.45) - 5.0 * SURGE;
  float dh = h - hb;
  float len = n1P(u / 6.0 + 256.0 * cyc(1.0), 256.0);
  float topH = mix(30.0 + 95.0 * len * len * len + 45.0 * clump * r0, 16.0 + 26.0 * len, quiet);
  float edge = smoothstep(1.0 + 2.0 * SURGE, 5.0 + 3.0 * SURGE, dh);
  float green = edge * exp(-max(dh - 4.0, 0.0) / mix(20.0 + 22.0 * len, 9.0 + 6.0 * len, quiet)) * smoothstep(topH + 15.0, topH - 25.0, dh);
  float tops = smoothstep(120.0, 185.0, h) * exp(-max(h - 185.0, 0.0) / 60.0) * (0.25 + 0.75 * r0) * len * (1.0 - 0.9 * quiet);
  float pink = smoothstep(-1.5, 1.0, dh) * exp(-max(dh, 0.0) / (2.0 + 4.0 * SURGE)) * (0.12 + 1.3 * SURGE) * (0.4 + 0.6 * r1);
  // pulses racing along the curtain
  float p1 = 0.5 + 0.5 * sin(TAU * (u / 85.0 - cyc(700.0)));
  float p2 = 0.5 + 0.5 * sin(TAU * (u / 47.0 + cyc(1300.0)));
  p1 *= p1 * p1; p2 *= p2; p2 *= p2;
  float pul = p1 * p1 * smoothstep(0.35, 0.8, clump) + 0.7 * p2 * p2 * smoothstep(0.45, 0.75, r0);
  float B = k * pf * env * (0.5 + 0.8 * clump) * (1.0 + 0.6 * pul * (0.5 + SURGE)) * (1.0 + 1.4 * SURGE);
  vec3 GREEN = vec3(0.08, 1.0, 0.34);
  vec3 TOPC = vec3(0.55, 0.1, 0.85);
  vec3 PINK = vec3(1.0, 0.16, 0.5);
  return B * (GREEN * green * rays + TOPC * tops * 0.6 * mix(1.0, rays, 0.5) + PINK * pink * rays * 0.7);
}

// emission of sheet k crossed between ray distances s0 (field a) and s1 (field b);
// the ray's ground track (with the field-line lean) is O + D * s
vec3 crossing(vec2 O, vec2 D, float tE, float s0, float s1, float a, float b, int k, float blur) {
  // regula falsi, one refinement
  float w = a / (a - b);
  float fm = sheetAt(O + D * mix(s0, s1, w), k);
  float w2 = fm * a < 0.0 ? w * a / (a - fm) : w + (1.0 - w) * fm / (fm - b);
  float sc = mix(s0, s1, w2);
  vec2 Pc = O + D * sc;
  float hc = sc * tE + sc * sc / (2.0 * RE);
  // crossing angle from the field gradient: edge-on folds glow brightest
  vec2 gF = sheetGrad(Pc, k);
  float sn = abs(dot(gF, normalize(D))) / max(length(gF), 1e-3);
  float pf = 1.0 / sqrt(sn * sn + 0.03);
  float fpU = sc * PX / FOC * 1.5 + blur * sc * 0.02;
  float kk = k == 0 ? 1.0 : k == 1 ? 0.55 : 0.7;
  return sheet(Pc.x, hc, pf, fpU, kk, float(k));
}
vec3 aurora(vec3 rd, float blur, int N) {
  if (rd.y <= 0.0) return vec3(0.0);
  float hl = length(rd.xz);
  vec2 d2 = rd.xz / hl;
  float tE = rd.y / hl;
  // uniform steps in ground distance between the 86 km and 336 km altitudes;
  // every field phase is linear along the track, so the sines advance by rotation
  float sA = 2.0 * 86.0 / (tE + sqrt(tE * tE + 2.0 * 86.0 / RE));
  float sB = 2.0 * 336.0 / (tE + sqrt(tE * tE + 2.0 * 336.0 / RE));
  float ds = (sB - sA) / float(N - 1);
  vec2 D = vec2(d2.x, d2.y + 0.2 * tE);                // field lines lean south: rays fan out
  vec2 O = vec2(0.0, -20.0);
  // Only march the stretch of track where a sheet (or its diffuse glow) can be:
  // the fields are a northward ramp plus bounded wiggles, so each one can only
  // vanish inside a band of track distance. Same sample grid as a full march.
  float i0 = 0.0, i1 = float(N - 1);
  float slHi = D.y - 0.45 * D.x, slLo = D.y - 0.45 * min(D.x, 0.0), sl2 = D.y - 0.22 * D.x;
  if (slHi > 0.05 && sl2 > 0.05) {
    // sheets 0/1: |fieldB| < 54 (glow) with sum(FA) = 87; sheet 2: |f| < 72 with 18 of wiggle
    vec2 b01 = (vec2(385.0 + ZS - 87.0 - 56.0, 385.0 + ZS + 87.0 + 56.0) + 20.0) / vec2(slLo, slHi);
    vec2 b2 = (vec2(610.0 + 0.5 * ZS - 18.0 - 74.0, 610.0 + 0.5 * ZS + 18.0 + 74.0) + 20.0) / sl2;
    float lo = min(b01.x, b2.x), hi = max(b01.y, b2.y);
    i0 = max(floor((lo - sA) / ds) - 1.0, 0.0);
    i1 = min(ceil((hi - sA) / ds) + 1.0, float(N - 1));
    if (i0 > i1) return vec3(0.0);
  }
  vec2 P = O + D * (sA + ds * i0), dP = D * ds;
  vec3 ph = KX * P.x + KZ * P.y + PH, dph = KX * dP.x + KZ * dP.y;
  vec3 S = sin(ph), C = cos(ph), sD = sin(dph), cD = cos(dph);
  vec2 qh = vec2(0.031, 0.0042) * P.x + vec2(PH.y * 1.3, PH.x * 0.5), dqh = vec2(0.031, 0.0042) * dP.x;
  vec2 S2 = sin(qh), C2 = cos(qh), sD2 = sin(dqh), cD2 = cos(dqh);
  float glow = 0.0;
  vec3 fa = vec3(0.0), da = vec3(0.0);
  // crossings found by the march, shaded afterwards (kept in registers, no arrays)
  vec4 X0 = vec4(0.0), X1 = X0, X2 = X0, X3 = X0, X4 = X0;
  vec4 XK = vec4(0.0);
  float XK4 = 0.0;
  int nc = 0;
  int n = int(i1 - i0) + 1;
  for (int j = 0; j < 24; j++) {
    if (j >= n) break;
    float s = sA + ds * (i0 + float(j));
    float h = s * tE + s * s / (2.0 * RE);
    float fb = P.y - 385.0 - ZS - bend(P.x) - dot(FA, S);
    vec3 fv = vec3(fb, fb - 16.0 - 6.0 * S2.x, P.y - 610.0 - 0.22 * P.x - 18.0 * S2.y - ZS * 0.5);
    vec2 gk = max(1.0 - vec2(fv.x * fv.x / 2800.0, fv.z * fv.z / 5000.0), 0.0);
    glow += (gk.x * gk.x + 0.5 * gk.y * gk.y) * smoothstep(100.0, 118.0, h) * (1.0 - smoothstep(118.0, 250.0, h));
    vec3 dv = fv - fa;
    if (j > 0) {
      bvec3 cr = lessThan(fa * fv, vec3(0.0));
      bvec3 nm = j > 1 ? lessThan(dv * da, vec3(0.0)) : bvec3(false);
      nm = bvec3(vec3(nm) * vec3(lessThan(min(abs(fa), abs(fv)), vec3(0.3 * ds))));
      if (any(cr) || any(nm)) {
        for (int k = 0; k < 3; k++) {
          float a = fa[k], b = fv[k];
          vec4 v0 = vec4(s - ds, s, a, b), v1 = v0;
          int m = 0;
          if (a * b < 0.0) m = 1;
          else if (nm[k]) {
            // near miss at a fold: the ray may cross the sheet twice inside this interval
            float sm = s - 0.5 * ds;
            float fm = sheetAt(O + D * sm, k);
            if (fm * a < 0.0) { v0 = vec4(s - ds, sm, a, fm); v1 = vec4(sm, s, fm, b); m = 2; }
          }
          for (int c = 0; c < 2; c++) {
            if (c >= m) break;
            vec4 v = c == 0 ? v0 : v1;
            float fk = float(k);
            if (nc == 0) { X0 = v; XK.x = fk; }
            else if (nc == 1) { X1 = v; XK.y = fk; }
            else if (nc == 2) { X2 = v; XK.z = fk; }
            else if (nc == 3) { X3 = v; XK.w = fk; }
            else if (nc == 4) { X4 = v; XK4 = fk; }
            nc = min(nc + 1, 5);
          }
        }
      }
    }
    da = dv; fa = fv;
    // advance the track and rotate the phases
    P += dP;
    vec3 Sn = S * cD + C * sD; C = C * cD - S * sD; S = Sn;
    vec2 S2n = S2 * cD2 + C2 * sD2; C2 = C2 * cD2 - S2 * sD2; S2 = S2n;
  }
  vec3 col = vec3(0.0);
  for (int c = 0; c < 5; c++) {
    if (c >= nc) break;
    vec4 v = c == 0 ? X0 : c == 1 ? X1 : c == 2 ? X2 : c == 3 ? X3 : X4;
    float fk = c == 0 ? XK.x : c == 1 ? XK.y : c == 2 ? XK.z : c == 3 ? XK.w : XK4;
    col += crossing(O, D, tE, v.x, v.y, v.z, v.w, int(fk + 0.5), blur);
  }
  col += vec3(0.1, 1.0, 0.45) * glow * ds * 0.00055 * (1.0 + 1.5 * SURGE);
  float ext = exp(-0.05 / max(rd.y + 0.01, 0.004));
  return col * 0.28 * ext;
}

// ---------------------------------------------------------------- sky
vec3 skyBase(vec3 rd) {
  float e = max(rd.y, 0.0);
  vec3 c = mix(vec3(0.007, 0.012, 0.02), vec3(0.0025, 0.0042, 0.012), smoothstep(0.0, 0.4, e));
  c += vec3(0.002, 0.014, 0.009) * AUR * exp(-e * 6.0);    // aurora light scattered low in the air
  return c;
}
vec3 nightSky(vec2 q, float blur) {
  vec3 rd = normalize(vec3(q.x, q.y - YH, FOC));
  vec3 c = skyBase(rd);
  float ext = exp(-0.09 / max(rd.y + 0.015, 0.005));
  float tw = 0.18 + 0.5 * exp(-rd.y * 8.0);
  vec2 uvm;
  float band = mwFrame(q, uvm);
  float dens = 0.35 + 1.4 * band;
  vec3 st = starGrid(q, 0.0068, 0.3 * dens, 0.006, 0.0, tw) + starGrid(q, 0.012, 0.22 * dens, 0.014, 17.0, tw) + starGrid(q, 0.028, 0.35, 0.035, 41.0, tw);
  c += (st * (1.0 - blur) + milkyWay(q)) * ext;
  c += meteor(q) * ext;
  return c;
}

// ---------------------------------------------------------------- mountains
// ridge ids: 0 left wall, 1 left spur, 2 right wall, 3 right spur, 4 fjord head
float ridgeEnv(int id, float x) {
  if (id == 0) { float t = -0.29 - x; return t < 0.0 ? YH + t * 5.0 : YH + 0.2 * (1.0 - exp(-t * 10.0)) + 0.085 * exp(-sq((x + 0.55) / 0.055)) + 0.055 * exp(-sq((x + 0.74) / 0.06)); }
  if (id == 1) { float t = -0.06 - x; return t < 0.0 ? YH + t * 4.0 : YH + 0.1 * (1.0 - exp(-t * 11.0)) + 0.075 * exp(-sq((x + 0.235) / 0.04)); }
  if (id == 2) { float t = x - 0.34; return t < 0.0 ? YH + t * 5.0 : YH + 0.19 * (1.0 - exp(-t * 9.0)) + 0.09 * exp(-sq((x - 0.6) / 0.05)) + 0.045 * exp(-sq((x - 0.77) / 0.05)); }
  if (id == 3) { float t = x - 0.06; return t < 0.0 ? YH + t * 4.0 : YH + 0.09 * (1.0 - exp(-t * 10.0)) + 0.055 * exp(-sq((x - 0.215) / 0.04)); }
  return YH + 0.014 + 0.05 * exp(-sq(x / 0.06)) + 0.035 * exp(-sq((x + 0.11) / 0.045)) + 0.03 * exp(-sq((x - 0.12) / 0.05));
}
float ridgeScale(int id) { return id == 4 ? 0.3 : (id == 1 || id == 3) ? 0.6 : 1.0; }
float ridgeTop(int id, float x, float oct) {
  float sc = ridgeScale(id);
  float amp = id == 4 ? 0.014 : 0.046 * sc;
  return ridgeEnv(id, x) + amp * (ridge1(x * 8.0 / sc + float(id) * 7.3, oct) - 0.42);
}
// right shore waterline (fishing cabins frame)
float shoreY(float x) { return YH - 0.004 - 0.05 * pow(smoothstep(0.2, 0.95, x), 1.3); }
float ridgeFoot(int id, float x) {
  if (id == 0) return YH - 0.004 - 0.02 * smoothstep(-0.3, -0.85, x);
  if (id == 2) return shoreY(x) + 0.004;
  return id == 4 ? YH - 0.0008 : YH - 0.0025;
}
float ridgeDepth(int id) { return id == 4 ? 0.12 : (id == 1 || id == 3) ? 0.4 : 0.62; }

const vec3 LA = vec3(-0.32, 0.93, -0.18);   // aurora light: high, from the left, a little behind the peaks

// snow and rock on a steep face; d = depth below the crest
// gradient noise with analytic derivatives (value ~[-0.7, 0.7])
vec3 gnD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = h22(i) * 2.0 - 1.0, gb = h22(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  vec2 gc = h22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, gd = h22(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - vec2(1.0, 1.0));
  float k = va - vb - vc + vd;
  return vec3(va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
              ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(vb, vc) - va));
}
vec3 gfbmD(vec2 p, float oct) {
  vec3 s = vec3(0.0);
  float a = 0.5;
  mat2 J = mat2(1.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float w = clamp(oct - fi, 0.0, 1.0);
    vec3 n = gnD(p) * w;
    s.x += a * n.x;
    s.yz += a * (transpose(J) * n.yz);
    p = ROT * p + vec2(1.7, 9.2);
    J = ROT * J;
    a *= 0.5;
  }
  return s;
}
// ridged gradient fbm with derivative: thin branching ribs, value ~[0, 0.6]
vec3 ridgeGD(vec2 p, float oct) {
  vec3 s = vec3(0.0);
  float a = 0.5;
  mat2 J = mat2(1.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float w = clamp(oct - fi, 0.0, 1.0);
    vec3 n = gnD(p);
    float r = 1.0 - min(abs(n.x) * 1.5, 1.0);
    vec2 dr = -1.5 * sign(n.x) * n.yz;
    s.x += a * mix(0.3, r * r, w);
    s.yz += a * w * (transpose(J) * (2.0 * r * dr));
    p = ROT * p + vec2(1.7, 9.2);
    J = ROT * J;
    a *= 0.5;
  }
  return s;
}
vec3 faceShade(vec2 q, float d, float sl, float sc, float ft, float seed, float lod) {
  float K = 6.0 / sc;
  vec2 S = vec2(2.4, 0.9) * K;                          // stretched along the fall line
  float oct = clamp(log2(0.5 / (S.x * PX)) - lod * 2.0, 1.0, 8.0);
  vec2 g = q * S + seed * 7.1;
  vec3 W = gfbmD(g * 0.3 + 5.0, 2.0);
  g += vec2(0.7, 0.25) * W.x;
  // relief (height toward the viewer): big forms, branching ribs, strata ledges
  vec3 M = gfbmD(g * 0.5 + 2.0, 3.0);
  vec3 R = ridgeGD(g, oct);
  vec2 dM = M.yz * S * 0.5, dR = R.yz * S;
  float lower = smoothstep(0.0, 0.2 * sc, d);
  float crest = smoothstep(0.03 * sc, 0.0, d);
  float kT = 60.0 / sc;
  float ly = q.y * kT + 2.5 * W.x + 3.0 * M.x + q.x * kT * 0.22;
  float brk = smoothstep(0.45, 0.75, vn(vec2(q.x * kT * 0.7, floor(ly) * 3.7))) * smoothstep(-0.1, 0.2, M.x + 0.3 * lower);
  float ly2 = q.y * kT * 2.6 - 1.5 * W.x + 2.0 * R.x - q.x * kT * 0.4;
  float brk2 = smoothstep(0.5, 0.8, vn(vec2(q.x * kT * 1.8, floor(ly2) * 2.3)));
  float lf = smoothstep(0.6, 0.2, kT * PX * 2.0) * (1.0 - lod);
  float lf2 = smoothstep(0.6, 0.2, kT * 2.6 * PX * 2.0) * (1.0 - lod);
  float tread = mix(0.25 * brk, pow(fract(ly), 6.0) * brk, lf) + mix(0.2 * brk2, pow(fract(ly2), 5.0) * brk2, lf2) * 0.8;
  // broad snowfields: smooth, wind-packed, hiding the crags
  float fieldN = gfbmD(g * vec2(0.22, 0.4) + seed * 2.9, 2.0).x + 0.14 * lower - 0.25 * crest + 0.25 * (R.x - 0.35) + 0.1 * M.x;
  float field = smoothstep(0.03, 0.1, fieldN);
  float A = 0.045 * sc * (1.0 - 0.7 * field);
  vec3 U = gfbmD(g * vec2(0.5, 0.9) + seed * 4.4, 3.0);   // drifts and rolls under the snowfields
  vec2 grad = dM * A + dR * A * 0.35 + U.yz * S * vec2(0.5, 0.9) * 0.02 * sc * field;
  vec3 N = normalize(vec3(-grad.x, 0.24 + 0.32 * lower + 0.25 * field - grad.y + 0.8 * tread * (1.0 - field), 1.0));
  // snow settles on whatever faces the sky: shelves, gully floors, lower slopes
  float sv = N.y + 0.1 * M.x - 0.05 * crest;
  float w = 0.02 + clamp(S.x * 3.0 * PX, 0.0, 0.15);
  float snow = max(smoothstep(0.43 - w, 0.43 + w, sv), field * smoothstep(0.12, 0.3, R.x + 0.2 - 0.25 * crest));
  snow = max(snow, smoothstep(0.004 * sc, 0.0, d) * smoothstep(-0.1, 0.1, M.x));   // cornices
  float ao = 0.5 + 0.5 * smoothstep(0.05, 0.4, R.x + 0.4 * M.x);
  // birch forest above the shore, a dark tide line
  float fh = (0.006 + 0.016 * n1(q.x * 25.0 / sc + seed)) * sc;
  float up = q.y - ft;
  float forest = smoothstep(fh + 0.003 * sc, fh - 0.003 * sc, up);
  float tf = smoothstep(1.2, 0.5, 1400.0 / sc * PX) * (1.0 - lod);
  float trees = mix(0.45, smoothstep(0.5, 0.72, vn(q * vec2(1400.0, 700.0) / sc)), tf) * forest;
  float tide = smoothstep(0.0022 * sc + AA, 0.0022 * sc - AA, up);
  vec3 rk = vec3(0.032, 0.034, 0.038) * (0.6 + 1.2 * R.x);
  vec3 alb = mix(rk, vec3(0.82, 0.86, 0.92), snow * (1.0 - tide));
  alb = mix(alb, vec3(0.016, 0.018, 0.016), trees);
  float ndl = max(dot(N, LA), 0.0);
  // the aurora light reaches the upper slopes best; the shore lies in its own shade
  vec3 L = AURL * (1.0 + 0.35 * smoothstep(0.3, -0.6, q.x)) * (0.45 + 0.55 * smoothstep(0.0, 0.14, q.y - ft));
  vec3 c = alb * (L * (0.05 + 1.35 * ndl) + SKYL * (0.25 + 0.75 * max(N.y, 0.0))) * ao;
  c += L * 0.3 * exp(-d / (0.0018 * sc)) * snow;      // backlit snow on the skyline
  return c;
}

vec4 ridge(int id, vec2 q, float lod) {
  float ft = ridgeFoot(id, q.x);
  if (q.y < ft - 0.003) return vec4(0.0);
  if (q.y > ridgeEnv(id, q.x) + 0.06) return vec4(0.0);
  float sc = ridgeScale(id);
  float oct = clamp(log2(0.5 * sc / (8.0 * PX)) / 1.05 - lod * 2.0, 1.0, 10.0);
  float tp = ridgeTop(id, q.x, oct);
  float e = 0.002;
  float sl = (ridgeTop(id, q.x + e, 3.0) - ridgeTop(id, q.x - e, 3.0)) / (2.0 * e);
  float dT = (tp - q.y) / sqrt(1.0 + min(sl * sl, 20.0));
  float a = smoothstep(-AA, AA, dT) * smoothstep(ft - AA, ft + AA, q.y);
  if (a <= 0.0) return vec4(0.0);
  float slE = (ridgeEnv(id, q.x + 0.02) - ridgeEnv(id, q.x - 0.02)) / 0.04;
  vec3 c = faceShade(q, max(tp - q.y, 0.0), slE, sc, ft, float(id), lod);
  // aerial perspective: cold air glowing faintly under the aurora
  float hz = id == 4 ? 0.5 : (id == 1 || id == 3) ? 0.25 : 0.1;
  vec3 haze = vec3(0.012, 0.03, 0.04) * (0.6 + 0.5 * AUR);
  c = mix(c, haze, hz);
  return vec4(c, a);
}

// ---------------------------------------------------------------- fishing cabins (rorbuer)
// x, scale (screen units per metre), seed, lit windows mask
const vec4 CAB[5] = vec4[5](vec4(0.43, 0.0, 0.1, 1.0), vec4(0.475, 0.0, 0.6, 0.0), vec4(0.53, 0.0, 0.3, 1.0), vec4(0.595, 0.0, 0.9, 1.0), vec4(0.665, 0.0, 0.5, 0.0));
float cabScale(float x) { return (YH - shoreY(x)) / CAMH; }   // screen units per metre at the shore
const vec3 WARM = vec3(1.0, 0.52, 0.18);

// returns premultiplied linear colour + alpha
vec4 village(vec2 q, float lod) {
  if (q.x < 0.2 || q.y > YH + 0.06) return vec4(0.0);
  float ys = shoreY(q.x);
  if (q.y < ys - 0.02) return vec4(0.0);
  float m = cabScale(q.x);
  // snowy bank between the water and the mountain
  float xm = q.x / m;
  float bankTop = ys + m * (2.4 + 1.4 * fbm1(q.x * 60.0, 4.0) + 0.5 * (n1(q.x * 900.0) - 0.5) * smoothstep(1.5, 0.5, 900.0 * PX)) * smoothstep(0.2, 0.3, q.x);
  float aB = smoothstep(-AA, AA, bankTop - q.y) * smoothstep(ys - AA, ys + AA, q.y);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (aB > 0.0) {
    float up = (q.y - ys) / m;
    // snow over a boulder shore: dark stones and wet rock at the waterline
    float st = vn(vec2(xm * 0.9, up * 1.4));
    float rocks = smoothstep(1.4, 0.3, up) * smoothstep(0.4, 0.62, st + 0.15 * (1.0 - up));
    float wet = smoothstep(0.35, 0.1, up);
    vec3 alb = mix(vec3(0.82, 0.86, 0.92), vec3(0.03, 0.032, 0.035) * (0.6 + 0.8 * st), max(rocks, wet));
    float topF = smoothstep(-0.5, 0.0, up - (bankTop - ys) / m + 0.6);
    vec3 c = alb * (AURL * (0.35 + 0.6 * topF) + SKYL * (0.75 + 0.25 * topF));
    // warm pools of window light on the snow
    float spill = 0.0;
    for (int i = 0; i < 5; i++) {
      vec4 cb = CAB[i];
      float sx = (q.x - cb.x) / cabScale(cb.x);
      spill += cb.w * exp(-sx * sx / 30.0) * smoothstep(0.0, 1.5, up);
    }
    c += alb * WARM * 0.05 * spill;
    c += vec3(0.25, 0.55, 0.5) * AURL.g * 0.5 * exp(-up / 0.12);     // ice rim
    col = c * aB;
    alpha = aB;
  }
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 cb = CAB[i];
    float sx = cb.x;
    float yb = shoreY(sx);
    float s = cabScale(sx);
    vec2 l = (q - vec2(sx, yb)) / s;       // metres, origin at the waterline below the cabin
    float hw = 3.2 + 0.6 * cb.z;             // half width
    float wallTop = 4.3 + 0.8 * cb.z;
    float base = 1.4;                        // on stilts
    float roofH = hw * 0.75;
    if (abs(l.x) > hw + 0.6 || l.y < -0.5 || l.y > wallTop + roofH + 0.8) {
      // light spill on the snow and the warm halo
      float r2 = dot(l - vec2(0.0, 3.0), l - vec2(0.0, 3.0));
      glow += WARM * cb.w * 0.004 * exp(-r2 / 30.0);
      continue;
    }
    float pxm = PX / s;
    float wall = smoothstep(pxm, -pxm, abs(l.x) - hw) * smoothstep(-pxm, pxm, l.y - base) * smoothstep(pxm, -pxm, l.y - wallTop);
    float roofY = wallTop + roofH * (1.0 - abs(l.x) / (hw + 0.4));
    float roof = smoothstep(pxm, -pxm, abs(l.x) - hw - 0.4) * smoothstep(-pxm, pxm, l.y - wallTop + 0.05) * smoothstep(pxm * 1.5, -pxm * 1.5, l.y - roofY);
    // stilts
    float st = 0.0;
    for (int j = 0; j < 4; j++) {
      float xj = -hw + 0.3 + float(j) * (2.0 * hw - 0.6) / 3.0;
      st = max(st, smoothstep(pxm + 0.12, -pxm + 0.12, abs(l.x - xj)) * step(l.y, base) * step(-0.4, l.y));
    }
    float a = max(max(wall, roof), st);
    if (a <= 0.0) continue;
    // falu red wood, white trim, snow on the roof
    float plank = 0.85 + 0.15 * smoothstep(0.3, 0.0, abs(fract(l.y * 3.0) - 0.5) * 2.0) * smoothstep(1.0, 0.4, pxm * 6.0);
    vec3 red = vec3(0.32, 0.035, 0.03) * plank;
    float trim = smoothstep(0.22, 0.12, abs(abs(l.x) - hw + 0.1)) * wall;
    vec3 alb = mix(red, vec3(0.7, 0.7, 0.68), trim);
    vec3 c = alb * (SKYL * 1.5 + AURL * 0.15) + alb * WARM * 0.05 * cb.w;
    // windows: two on the gable end, one upstairs
    float win = 0.0;
    for (int j = 0; j < 3; j++) {
      vec2 wc = j == 2 ? vec2(0.0, wallTop + 1.2) : vec2(j == 0 ? -1.4 : 1.4, base + 1.6);
      vec2 dw = abs(l - wc) - vec2(0.45, 0.55);
      float wi = smoothstep(pxm, -pxm, max(dw.x, dw.y));
      float lit = cb.w * step(0.25, h11(cb.z * 13.0 + float(j)));
      win = max(win, wi);
      c = mix(c, mix(vec3(0.006, 0.008, 0.012), WARM * (2.6 + 0.6 * h11(float(j) + cb.z)), lit), wi);
    }
    // snow-loaded roof, lit from above by the aurora
    vec3 rc = vec3(0.78, 0.82, 0.88) * (AURL * 0.9 + SKYL) * (0.85 + 0.15 * smoothstep(0.0, 0.6, roofY - l.y));
    c = mix(c, rc, roof * (1.0 - wall * step(l.y, wallTop)));
    c = mix(c, vec3(0.012, 0.01, 0.01), st * (1.0 - wall) * (1.0 - roof));
    col = col * (1.0 - a) + c * a;
    alpha = alpha + a * (1.0 - alpha);
    float r2 = dot(l - vec2(0.0, 3.0), l - vec2(0.0, 3.0));
    glow += WARM * cb.w * 0.004 * exp(-r2 / 30.0);
  }
  // jetty with a lamp
  {
    float sx = 0.4;
    float s = cabScale(sx);
    vec2 l = (q - vec2(sx, shoreY(sx))) / s;
    float pxm = PX / s;
    if (l.x > -18.0 && l.x < 4.0 && l.y > -0.5 && l.y < 6.0) {
      float deck = smoothstep(pxm, -pxm, abs(l.y - 1.2) - 0.18);
      float posts = smoothstep(pxm + 0.1, -pxm + 0.1, abs(fract(l.x / 3.0) - 0.5) * 3.0) * step(l.y, 1.2) * step(-0.3, l.y);
      float pole = smoothstep(pxm + 0.07, -pxm + 0.07, abs(l.x + 15.0)) * step(l.y, 5.0) * step(1.0, l.y);
      float a = max(max(deck, posts), pole) * step(-17.0, l.x);
      vec3 c = vec3(0.6, 0.65, 0.7) * (AURL * 0.6 + SKYL) * deck + vec3(0.01) * (1.0 - deck);
      col = col * (1.0 - a) + c * a;
      alpha = alpha + a * (1.0 - alpha);
      vec2 dl = l - vec2(-15.0, 5.1);
      glow += vec3(1.0, 0.62, 0.28) * (2.0 * exp(-dot(dl, dl) / 0.08) + 0.05 * exp(-dot(dl, dl) / 4.0) + 0.004 * exp(-dot(dl, dl) / 60.0));
    }
  }
  col += glow * (lod > 0.5 ? 0.6 : 1.0);
  return vec4(col, alpha);
}

// ---------------------------------------------------------------- boat
const vec2 BOAT = vec2(0.12, 0.0);
float boatWL() { return YH - CAMH * FOC / 58.0; }   // 58 m out
vec4 boat(vec2 q, float bob, float roll) {
  float s = FOC / 58.0;                              // screen units per metre
  vec2 l = (q - vec2(BOAT.x, boatWL() + bob)) / s;
  float cr = cos(roll), sr = sin(roll);
  l = vec2(cr * l.x + sr * l.y, -sr * l.x + cr * l.y);
  if (abs(l.x) > 4.6 || l.y < -0.6 || l.y > 6.5) return vec4(0.0);
  float pxm = PX / s;
  // hull: sheer rising to the bow (right), raked stem, small transom
  float gun = 0.95 + 0.5 * sq(smoothstep(0.5, 3.6, l.x));
  float stem = 3.55 + 0.35 * l.y;
  float hull = smoothstep(pxm, -pxm, l.y - gun) * smoothstep(pxm, -pxm, l.x - stem) * smoothstep(-pxm, pxm, l.x + 3.4 - 0.15 * l.y) * smoothstep(-pxm, pxm, l.y + 0.05);
  // wheelhouse
  vec2 wh = l - vec2(-1.2, gun);
  float house = smoothstep(pxm, -pxm, max(abs(wh.x - 0.1 * wh.y) - 0.95, abs(wh.y - 0.85) - 0.85));
  float roofL = smoothstep(pxm, -pxm, max(abs(wh.x) - 1.15, abs(wh.y - 1.75) - 0.08));
  // mast and anchor light
  float mast = smoothstep(pxm + 0.05, -pxm + 0.05, abs(l.x - 1.0)) * step(gun, l.y) * step(l.y, 5.6);
  float a = max(max(hull, house), max(roofL, mast));
  vec3 c = vec3(0.0);
  if (a > 0.0) {
    float rub = smoothstep(0.12 + pxm, 0.12 - pxm, abs(l.y - gun + 0.18));
    vec3 hc = mix(vec3(0.62, 0.64, 0.66), vec3(0.18, 0.02, 0.02), rub);
    float upF = smoothstep(gun - 0.4, gun, l.y);
    c = hc * (SKYL * (1.2 + 0.6 * upF) + AURL * (0.12 + 0.35 * upF));
    c *= 0.75 + 0.25 * smoothstep(-0.05, 0.6, l.y);
    vec3 hcol = vec3(0.55, 0.5, 0.42) * (SKYL * 1.3 + AURL * 0.2);
    // lit front window
    float win = smoothstep(pxm, -pxm, max(abs(wh.x - 0.45) - 0.32, abs(wh.y - 1.15) - 0.3));
    hcol = mix(hcol, WARM * 2.2, win);
    float sw = smoothstep(pxm, -pxm, max(abs(wh.x + 0.4) - 0.35, abs(wh.y - 1.15) - 0.28));
    hcol = mix(hcol, vec3(0.01, 0.012, 0.015), sw);
    c = mix(c, hcol, house);
    c = mix(c, vec3(0.7, 0.75, 0.8) * (AURL * 0.8 + SKYL), roofL);
    c = mix(c, vec3(0.03), mast * (1.0 - house));
  }
  vec2 dl = l - vec2(1.0, 5.75);
  vec3 g = vec3(1.0, 0.95, 0.85) * (2.5 * exp(-dot(dl, dl) / 0.03) + 0.04 * exp(-dot(dl, dl) / 1.2));
  vec2 dw = l - vec2(-0.75, gun + 1.15);
  g += WARM * 0.02 * exp(-dot(dw, dw) / 1.5);
  return vec4(c * a + g, a);
}
float BOB, ROLL;

// ---------------------------------------------------------------- snowy foreshore
float bankEdge(float x, float oct) {
  return -0.012 + 0.16 * smoothstep(-0.24, -0.92, x) + 0.016 * (fbm1(x * 9.0 + 2.0, oct) - 0.5) + 0.006 * (fbm1(x * 40.0, oct - 2.0) - 0.5);
}
// snow-glitter: ice crystals catching the aurora, shifting as the eye moves
float glints(vec2 q, float cell) {
  vec2 gc = q / cell;
  vec2 gi = floor(gc);
  vec4 gh = h42(gi + 7.0);
  float g = step(0.955, gh.x) * smoothstep(0.42, 0.0, length(fract(gc) - 0.5 - 0.3 * (gh.yz - 0.5)));
  return g * pow(0.5 + 0.5 * sin(gh.w * 40.0 + u_par.x * 9.0 + u_par.y * 6.0 + TAU * cyc(floor(20.0 + 40.0 * gh.y))), 8.0);
}
vec4 foreshore(vec2 q) {
  if (q.x > -0.2 || q.y > 0.26) return vec4(0.0);
  float oct = clamp(log2(0.4 / (9.0 * PX)), 1.0, 8.0);
  float be = bankEdge(q.x, oct);
  float aBank = smoothstep(AA, -AA, q.y - be);
  // rocks pushing through the snow
  float aR = 0.0;
  vec2 rl = vec2(0.0);
  float rid = 0.0, rsz = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 b = i == 0 ? vec4(-0.6, 0.085, 0.07, 0.05) : i == 1 ? vec4(-0.435, 0.015, 0.035, 0.024) : i == 2 ? vec4(-0.82, 0.15, 0.055, 0.042) : vec4(-0.68, 0.04, 0.022, 0.015);
    vec2 l = (q - b.xy) / b.zw;
    if (dot(l, l) > 2.2) continue;
    vec2 dl = l / max(length(l), 1e-4);
    float rr = 1.0 + 0.16 * (vn(dl * 1.2 + float(i) * 5.0) - 0.5) + 0.08 * (vn(dl * 3.5 + float(i) * 3.0) - 0.5) + 0.03 * (vn(dl * 10.0) - 0.5);
    float d = (length(l) - rr) * min(b.z, b.w);
    // buried: the snow surface cuts the rock off below a wavy line
    float bur = (l.y + 0.35 + 0.15 * sin(l.x * 3.0 + float(i))) * b.w;
    float ai = smoothstep(AA, -AA, d) * smoothstep(-AA, AA, bur);
    if (ai > aR) { aR = ai; rl = l / rr; rid = float(i); rsz = b.w; }
  }
  float a = max(aBank, aR);
  if (a <= 0.0) return vec4(0.0);
  vec3 c = vec3(0.0);
  float gS = smoothstep(1.2, 0.4, 300.0 * PX);
  if (aBank > 0.0) {
    // wind-packed snow: soft drifts and sastrugi, foreshortened with distance
    vec2 sp = vec2(q.x * 14.0, q.y * 34.0 - q.x * 6.0);
    vec3 nd = gfbmD(sp, clamp(log2(0.4 / (34.0 * PX)), 1.0, 6.0));
    vec3 n = normalize(vec3(-nd.y * 0.35, 1.0, 0.45 - nd.z * 0.25));
    float dEdge = be - q.y;
    float ndl = max(dot(n, LA), 0.0);
    // blue hollows around the rocks
    float occ = 1.0;
    {
      vec2 l0 = (q - vec2(-0.6, 0.085)) / vec2(0.07, 0.05), l1 = (q - vec2(-0.435, 0.015)) / vec2(0.035, 0.024), l2 = (q - vec2(-0.82, 0.15)) / vec2(0.055, 0.042);
      occ = 1.0 - 0.45 * exp(-max(dot(l0, l0) - 0.8, 0.0) * 1.5) - 0.4 * exp(-max(dot(l1, l1) - 0.8, 0.0) * 1.5) - 0.4 * exp(-max(dot(l2, l2) - 0.8, 0.0) * 1.5);
    }
    vec3 alb = vec3(0.84, 0.88, 0.95);
    vec3 cs = alb * (AURL * (0.1 + 0.95 * ndl) * occ + SKYL * (0.7 + 0.3 * occ));
    cs += vec3(0.6, 1.0, 0.85) * glints(q, 0.0011) * gS * 0.5 * AUR * smoothstep(0.0, 0.01, dEdge);
    // shore: wet dark stones under a rim of clear ice
    float wetE = smoothstep(0.0055, 0.0015, dEdge);
    float stones = smoothstep(0.4, 0.65, vn(q * vec2(260.0, 380.0)));
    vec3 ce = mix(vec3(0.008, 0.01, 0.012), vec3(0.025, 0.03, 0.034), stones);
    ce += vec3(0.25, 0.55, 0.5) * AURL.g * 0.6 * exp(-dEdge / 0.0012);
    c = mix(cs, ce, wetE);
  }
  if (aR > 0.0) {
    vec3 nd = gfbmD(rl * 4.0 + rid * 7.0, clamp(log2(0.4 / (4.0 * PX / rsz)), 1.0, 6.0));
    vec3 n = normalize(vec3(rl.x * 1.2 - nd.y * 0.5, rl.y + 0.3 - nd.z * 0.5, sqrt(max(1.0 - dot(rl, rl), 0.04))));
    float snow = smoothstep(0.55, 0.75, n.y + 0.25 * nd.x);
    float ndl = max(dot(n, LA), 0.0);
    vec3 alb = mix(vec3(0.03, 0.031, 0.034) * (0.75 + 0.5 * (nd.x + 0.5)), vec3(0.84, 0.88, 0.95), snow);
    vec3 cr = alb * (AURL * (0.06 + 1.1 * ndl) + SKYL * (0.3 + 0.7 * max(n.y, 0.0)));
    cr += AURL * 0.12 * pow(1.0 - max(n.z, 0.0), 3.0) * smoothstep(0.0, 0.5, n.y);   // rim
    c = mix(c, cr, aR);
  }
  return vec4(c * a, a);
}

// ---------------------------------------------------------------- water
const vec4 WV[7] = vec4[7](
  vec4(0.28, 0.96, 0.62, 0.007),
  vec4(-0.45, 0.89, 1.05, 0.0035),
  vec4(0.83, 0.56, 1.9, 0.0015),
  vec4(-0.2, 0.98, 3.3, 0.0007),
  vec4(0.6, 0.8, 6.0, 0.00028),
  vec4(-0.7, 0.71, 11.0, 0.00011),
  vec4(0.1, -0.99, 19.0, 0.00005));
float WT[7];
// cat's-paw patches: breaths of wind roughening the mirror, drifting down the fjord
float catsPaw(vec2 xz) {
  vec2 p = xz * vec2(0.022, 0.011) + vec2(cyc(3.0) * 8.0, 0.0);
  float n = vnP(p, 8.0) * 0.65 + vnP(p * 2.0 + 3.1, 16.0) * 0.35;
  return smoothstep(0.6, 0.85, n);
}
// returns slope (xy), slope variance hidden below the pixel (z)
vec3 waves(vec2 xz, vec2 fp) {
  vec2 g = vec2(0.0);
  float var = 0.0;
  for (int i = 0; i < 7; i++) {
    vec4 w = WV[i];
    float sv = 0.5 * sq(w.w * w.z);
    float lam = TAU / w.z;
    float vis = smoothstep(1.5, 3.5, lam / max(length(w.xy * fp), 1e-5));
    float ph = w.z * dot(w.xy, xz) - WT[i];
    g += vis * w.w * w.z * cos(ph) * w.xy;
    var += (1.0 - vis) * sv;
  }
  // wind ripples inside the cat's paws
  float cp = catsPaw(xz);
  if (cp > 0.0) {
    float rv = 0.0012 * cp;
    float vis = smoothstep(1.5, 3.5, 0.35 / max(fp.y, 1e-5));
    if (vis > 0.0) {
      vec3 rn = fbmD(xz * vec2(9.0, 6.0) + vec2(0.0, cyc(97.0) * 0.0) - vec2(cyc(41.0) * 18.0, 0.0), 3.0);
      g += vis * (rn.yz * vec2(9.0, 6.0)) * 0.003 * cp;
    }
    var += rv * (1.0 - vis) + 0.0002 * cp;
  }
  return vec3(g, var);
}
float waterDepth(float y) { return 0.12 + 0.95 * pow(clamp((YH - y) / YH, 0.0, 1.0), 0.8); }

// water surface at q (water frame): Fresnel, mirror displacement, blur
float waterGeo(vec2 q, out vec2 dq, out float blur) {
  float dy = max(YH - q.y, 0.4 * PX);
  float z = CAMH * FOC / dy;
  vec3 rd = normalize(vec3(q.x, -dy, FOC));
  vec2 xz = vec2(q.x * z / FOC, z);
  float fx = z * PX / FOC, fzz = fx * z / CAMH;
  vec3 wv = waves(xz, vec2(fx, fzz));
  vec3 n = normalize(vec3(-wv.x, 1.0, -wv.y));
  float ndv = max(dot(n, -rd), 0.02);
  vec3 r = reflect(rd, n);
  r.y = max(r.y, 0.0004);
  blur = clamp(sqrt(wv.z) * 9.0, 0.0, 1.0);
  // displacement of the mirror image by the resolved slopes
  vec2 pr = vec2(r.x / r.z * FOC, YH + r.y / r.z * FOC);
  dq = pr - vec2(q.x, 2.0 * YH - q.y);
  dq.y += sqrt(wv.z) * 0.6;                 // unresolved slopes lift the mean reflection
  return 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
}

// ---------------------------------------------------------------- output
vec3 acesFit(vec3 c) {
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 encodeC(vec3 c) { return srgb(acesFit(c * EXPO)); }

// mountains front to back (order 0..4 = left wall, right wall, left spur, right spur, fjord head);
// mirrored about each ridge's own waterline for reflections
vec4 ridgeStack(vec2 p, int i0, int i1, bool mir, vec2 dq, float lod) {
  vec3 acc = vec3(0.0);
  float T = 1.0;
  for (int i = i0; i < i1; i++) {
    if (T < 0.004) break;
    int k = i == 0 ? 0 : i == 1 ? 2 : i == 2 ? 1 : i == 3 ? 3 : 4;
    vec2 qr = p + u_par * PAR * ridgeDepth(k);
    if (mir) qr = vec2(qr.x + dq.x, 2.0 * ridgeFoot(k, qr.x) - qr.y + dq.y);
    vec4 m = ridge(k, qr, lod);
    acc += T * m.rgb * m.a;
    T *= 1.0 - m.a;
  }
  return vec4(acc, 1.0 - T);
}

void main() {
  TM = mod(u_time, TP);
  PX = 1.0 / u_res.y;
  AA = 0.75 * PX;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  // substorm: one surge per 300 s cycle, onset and strength vary per cycle
  {
    float n = floor(TM / 300.0), t = TM - n * 300.0;
    float t0 = 40.0 + 110.0 * h11(n * 7.3 + 1.0);
    float env = smoothstep(t0, t0 + 14.0, t) * (t < t0 + 40.0 ? 1.0 : exp(-(t - t0 - 40.0) / 45.0)) * smoothstep(300.0, 280.0, t);
    SURGE = env * (0.55 + 0.45 * h11(n * 3.1 + 5.0));
  }
  PH = vec3(TAU * cyc(2.0) + 0.6, -TAU * cyc(3.0) + 2.1, TAU * cyc(7.0) + 4.0) + vec3(0.25, 0.4, 0.6) * SURGE;
  ZS = 25.0 * osc(1.0, 0.3) - 30.0 * SURGE;
  AUR = (0.85 + 0.15 * osc(9.0, 1.0)) * (1.0 + 1.3 * SURGE);
  AURL = vec3(0.022, 0.11, 0.06) * AUR;
  SKYL = vec3(0.04, 0.056, 0.105);
  BOB = 0.0009 * osc(190.0, 0.0) + 0.0004 * osc(311.0, 1.3);
  ROLL = 0.025 * osc(233.0, 0.7) + 0.01 * osc(377.0, 2.0);
  for (int i = 0; i < 7; i++) {
    float wq = floor(sqrt(9.81 * WV[i].z) * TP / TAU + 0.5);
    WT[i] = TAU * cyc(wq) + float(i) * 1.7;
  }
  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  int lay = u_layer < -0.5 ? -1 : int(u_layer + 0.5);
  bool full = lay < 0;

  // Two passes share every heavy routine (one inlined copy each): pass 0 is the
  // direct view, pass 1 (water pixels only) the scene mirrored in the fjord.
  vec2 qw = p + u_par * PAR * waterDepth(p.y);
  bool isWater = qw.y < YH && (full || lay == 3);
  vec2 dq = vec2(0.0);
  float blur = 0.0, F = 0.0;
  if (isWater) F = waterGeo(qw, dq, blur);
  vec3 acc0 = vec3(0.0), accR = vec3(0.0);
  float T0 = 1.0;
  int passes = isWater ? 2 : 1;
  for (int pass = 0; pass < 2; pass++) {
    if (pass >= passes) break;
    bool R = pass == 1;
    vec3 acc = vec3(0.0);
    float T = 1.0;
    if (!R && (full || lay == 7)) {
      vec4 L = foreshore(p + u_par * PAR * 1.1);
      acc += L.rgb; T *= 1.0 - L.a;
    }
    if ((R || full || lay == 6) && T > 0.001) {
      vec2 qb = p + u_par * PAR * 0.86;
      if (R) qb = vec2(qb.x + dq.x, 2.0 * (boatWL() + BOB) - qb.y + dq.y);
      vec4 L = boat(qb, BOB, R ? -ROLL : ROLL);
      acc += T * L.rgb; T *= 1.0 - L.a;
    }
    if ((R || full || lay == 5) && T > 0.001) {
      vec2 qv = p + u_par * PAR * 0.72;
      if (R) qv = vec2(qv.x + dq.x, 2.0 * shoreY(qv.x) - qv.y + dq.y);
      vec4 L = village(qv, R ? 1.0 : 0.0);
      acc += T * L.rgb; T *= 1.0 - L.a;
    }
    if ((R || full || lay == 4 || lay == 2) && T > 0.001) {
      vec4 L = ridgeStack(p, lay == 2 ? 4 : 0, lay == 4 ? 4 : 5, R, dq, R ? 1.0 : 0.0);
      acc += T * L.rgb; T *= 1.0 - L.a;
    }
    bool sky = R || (!isWater && (full || lay <= 1));
    if (sky && T > 0.001) {
      vec2 qs = R ? vec2(p.x, 2.0 * YH - p.y) + dq : p;
      vec3 sk = vec3(0.0);
      if (R || full || lay == 0) sk += nightSky(qs, blur);
      if (R || full || lay == 1) {
        vec2 qa = R ? qs : qs + u_par * PAR * 0.03;
        sk += aurora(normalize(vec3(qa.x, qa.y - YH, FOC)), blur, R ? 11 : 19);
      }
      acc += T * sk;
      if (lay != 1) T = 0.0;
    }
    if (R) accR = acc;
    else { acc0 = acc; T0 = T; }
  }
  if (isWater) {
    // dark, clear water; the aurora light scattered inside it
    vec3 body = vec3(0.0006, 0.0018, 0.0022) + AURL * 0.004;
    acc0 += T0 * mix(body, accR, F);
    T0 = 0.0;
  }
  if (full) {
    fragColor = vec4(encodeC(acc0) + dith, 1.0);
    return;
  }
  float la = 1.0 - T0;
  vec3 c = clamp(encodeC(acc0) + dith * step(0.002, la + dot(acc0, vec3(1.0))), 0.0, 1.0);
  float a = max(la, max(c.r, max(c.g, c.b)));
  fragColor = vec4(min(c, vec3(a)), a);
}
`,
}
