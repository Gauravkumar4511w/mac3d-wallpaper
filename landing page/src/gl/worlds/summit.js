// Above the Summit — standing high in the Himalaya at sunrise.
// A great snow-and-rock pyramid in pink-gold alpenglow, a sea of clouds
// flowing between the ridges far below, a jet-stream snow plume streaming
// off the summit, prayer flags on the near ridge and spindrift in the air.
//
// Every layer is lit in linear light, tone-mapped (ACES fit) and gamma-encoded
// on its own, so the full scene is exactly the back-to-front "over" composite
// of the isolated layers. Every motion is folded into one 1800 s loop (TP).
// Long-cycle events: a cloud bank veils the sun and its first rays sweep back
// down the range (every 600 s), and a cloud wave spills over the west col
// (every 450 s).

export default {
  id: 'summit',
  name: 'Above the Summit',
  tag: 'Himalayan sunrise',
  accent: '#f39a7c',
  accent2: '#3d6fd6',
  ink: '#7a3550',
  glow: '#ffd1bd',
  light: false,
  clockColor: '#fff7f2',
  sky: 'linear-gradient(180deg,#153487 0%,#2a4b9c 13%,#5475b8 25%,#6a83bb 34%,#9799bd 42%,#afa6b7 48%,#bcadb8 55%,#c3b5bf 58%,#9a8fad 62%,#877ea1 77%,#8085a3 86%,#8899c3 95%,#94a6cf 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Distant range', depth: 0.05 },
    { name: 'Sea of clouds', depth: 0.15 },
    { name: 'The summit', depth: 0.18 },
    { name: 'Snow plume', depth: 0.2 },
    { name: 'Cloud-piercing ridge', depth: 0.54 },
    { name: 'Near ridge', depth: 1.0 },
    { name: 'Prayer flags', depth: 1.1 },
    { name: 'Spindrift', depth: 1.3 },
  ],
  clockAfter: 4,
  stillTime: 200,
  frag: /* glsl */ `
#define TAU 6.2831853
#define TP 1800.0
#define PK 0.030
#define YE 0.425
#define KC 1.0
#define ZM 28.6
#define ZR 8.0
#define CF 0.85

float TM;    // u_time folded into the TP loop
float PX;    // one pixel in scene units (height-relative)
float AA;    // half-width of an anti-aliased edge
float VEIL;  // 0..1: the sun hidden behind a far cloud bank
float LINE;  // during the sweep: altitude of the edge of the returning sunlight (else -1)
float CDR;   // cloud-sea drift (cloud units)

const vec3 SUNC = vec3(1.0, 0.45, 0.21);
const vec3 LF = vec3(-0.881, 0.170, 0.441);   // towards the sun: x right, y up, z towards the viewer
const vec3 LG = vec3(-0.881, 0.170, -0.441);  // the same in ground space: x right, y up, z away
const vec3 AMB = vec3(0.115, 0.185, 0.42);

float sat(float x) { return clamp(x, 0.0, 1.0); }
float sq(float x) { return x * x; }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

// seamless oscillator: frequency snapped to the TP loop
float wav(float f, float ph) { return sin(TAU * fract(floor(f * TP + 0.5) / TP * TM) + ph); }
// loop-safe drift: 'n' whole periods per TP
float drift(float n) { return TM * (n / TP); }

float g1(float x) {
  float i = floor(x), f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return 2.0 * mix((h11(i) * 2.0 - 1.0) * f, (h11(i + 1.0) * 2.0 - 1.0) * (f - 1.0), u);
}
float n1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mod(i.x, per), b = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(a, i.y)), h12(vec2(b, i.y)), u.x), mix(h12(vec2(a, i.y + 1.0)), h12(vec2(b, i.y + 1.0)), u.x), u.y);
}
// gradient noise, periodic in x, with analytic derivatives: (value, d/dx, d/dy)
vec3 gnd(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  vec2 ga = h22(vec2(x0, i.y)) * 2.0 - 1.0;
  vec2 gb = h22(vec2(x1, i.y)) * 2.0 - 1.0;
  vec2 gc = h22(vec2(x0, i.y + 1.0)) * 2.0 - 1.0;
  vec2 gd = h22(vec2(x1, i.y + 1.0)) * 2.0 - 1.0;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - 1.0);
  float k = va - vb - vc + vd;
  return vec3(va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
              ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(vb, vc) - va));
}
float gn(vec2 p) { return gnd(p, 1e5).x; }
float gnP(vec2 p, float per) { return gnd(p, per).x; }
float fbmP(vec2 s, float per, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    v += w * a * gnP(s, per);
    s = s * 2.0 + vec2(0.0, 5.7);
    per *= 2.0; a *= 0.5;
  }
  return v;
}
float ridgeP(float x, float oct) {
  float h = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 8; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    float n = 1.0 - abs(g1(x * f + float(i) * 3.71));
    h += w * a * n * n;
    f *= 2.07; a *= 0.48;
  }
  return h;
}
vec4 over(vec4 b, vec4 f) { return f + b * (1.0 - f.a); }
vec3 smax3(vec3 a, vec3 b, float k) {
  float h = sat(0.5 + 0.5 * (a.x - b.x) / k);
  return vec3(mix(b.x, a.x, h) + k * h * (1.0 - h), mix(b.yz, a.yz, h));
}

// sunlight reaching altitude 'a' (screen height of the lit point) during the long-cycle event
float sunVis(float a) {
  float lit = LINE > -0.5 ? smoothstep(LINE - 0.016, LINE + 0.016, a) : 1.0 - VEIL;
  return mix(0.075, 1.0, lit);
}
// the first rays are the reddest
vec3 sunCol(float a) {
  float w = LINE > -0.5 ? exp(-max(a - LINE, 0.0) * 18.0) : 0.0;
  return SUNC * mix(vec3(1.0), vec3(1.05, 0.70, 0.55), w);
}

// ---------------------------------------------------------------- sky
vec3 skyCol(vec2 p) {
  float e = max(p.y - YE, 0.0);
  float x = p.x;
  vec3 c = mix(vec3(0.40, 0.42, 0.60), vec3(0.085, 0.18, 0.46), smoothstep(0.0, 0.20, e));
  c = mix(c, vec3(0.011, 0.040, 0.165), smoothstep(0.10, 0.56, e));
  // sunrise glow on the sun side (sun low, behind the left shoulder)
  float sw = exp(-max(x + 1.2, 0.0) * 1.25);
  c += vec3(1.0, 0.42, 0.12) * sw * (0.75 * exp(-e * 9.0) + 0.12 * exp(-e * 2.6));
  // anti-twilight arch on the far side: Belt of Venus over the blue Earth shadow
  float aw = smoothstep(-0.7, 0.8, x);
  c = mix(c, vec3(0.66, 0.43, 0.48), exp(-sq((e - 0.072) / 0.05)) * 0.55 * aw);
  c = mix(c, vec3(0.22, 0.25, 0.40), smoothstep(0.03, 0.0, e) * 0.55 * aw);
  return c;
}
// last-quarter moon high on the sun side
vec3 moon(vec2 p) {
  vec2 l = (p - vec2(-0.555, 0.835)) / 0.0118;
  float r = length(l);
  if (r > 1.2) return vec3(0.0);
  float a = AA / 0.0118;
  float disk = smoothstep(1.0 + a, 1.0 - a, r);
  float t = dot(l, vec2(-0.93, -0.36));
  float lit = smoothstep(-0.05, 0.08, t);
  float mar = 0.72 + 0.28 * smoothstep(0.35, 0.65, vn(l * 2.6 + 3.0)) + 0.08 * (vn(l * 9.0) - 0.5);
  float limb = 0.8 + 0.2 * sqrt(max(1.0 - r * r, 0.0));
  return vec3(0.98, 0.95, 0.92) * 1.15 * disk * lit * mar * limb;
}
vec4 skyLin(vec2 p) {
  vec3 c = skyCol(p);
  c += moon(p) * (1.0 - 0.5 * VEIL);
  return vec4(c, 1.0);
}
// aerial perspective in-scatter towards the horizon
vec3 hazeCol(float x, float y) {
  return mix(vec3(0.46, 0.44, 0.62), vec3(0.70, 0.52, 0.50), sat(0.5 - 0.6 * x) * 0.6) * mix(1.0, 0.8, VEIL);
}

// ---------------------------------------------------------------- cloud-sea height field
// cloud-top height above the cloud base at ground point w (x right, z away), with gradient.
// Stratocumulus: a long swell; cells (|noise| billows: broad domes parted by narrow creases);
// on them heaps of round puffs, and puffs on the puffs. Every octave is real relief (marched,
// shaded, self-shadowed). The deck flows right on the wind, each octave at its own pace, and
// the finer ones also wander on slow circles through the noise, so the puffs boil and re-form
// instead of sliding by as a rigid texture.
float CFN;   // the fine octaves' contribution to the last cloud call (crease depth / AO)
float CCN;   // the same for the big puffs
vec2 CBO[4]; // per-octave boil offsets (set once per pixel)
// round puffs: jittered domes on a grid (x period per), merged by a quadratic soft union so
// the creases between them stay soft; (value, d/dx, d/dy). Centres stay within a quarter cell
// of the middle and radii under 0.75, so the 2x2 cells around p hold every dome that reaches
// it, and a dome adds nothing (with zero slope) at its rim: the field is smooth everywhere.
vec3 puffN(vec2 p, float per) {
  vec2 b = floor(p - 0.5);
  float S = 0.0;
  vec2 G = vec2(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 c = b + vec2(float(k & 1), float(k >> 1));
    vec2 r = h22(vec2(mod(c.x, per), c.y) + 0.5);
    vec2 o = c + 0.25 + 0.5 * r - p;
    float rz = fract(r.x * 9.17 + r.y * 5.31);
    float iR2 = 1.0 / sq(0.52 + 0.23 * rz);
    float w = max(1.0 - dot(o, o) * iR2, 0.0);
    float rw = fract(r.y * 13.7 + rz * 3.3);
    float A = 0.55 + 0.55 * rw * rw;
    float P = A * w * w * (2.0 - w);
    S += P * P;
    G += P * A * w * (4.0 - 3.0 * w) * 2.0 * iR2 * o;
  }
  float v = sqrt(S + 1e-6);
  return vec3(v, G / v);
}
// one octave of the deck, flowing on the wind (dr) and boiling (CBO); x period 48 / f
vec2 deckP(vec2 w, float f, float dr, int i) {
  vec2 p = vec2(w.x - dr, w.y) * f + CBO[i];
  return vec2(p.x + 0.5 * p.y + 0.37 * float(i), p.y + 3.1 * float(i));   // sheared lattice keeps the x period
}
const float CAMP[5] = float[5](0.24, 0.125, 0.062, 0.029, 0.013);
// coarse deck: swell, billowed cells (|noise|: broad domes parted by narrow creases), big puffs
float cloudC(vec2 w, float oct, out vec2 g) {
  vec3 s = gnd(vec2(w.x - CDR, w.y) * vec2(0.0625, 0.07) + vec2(0.0, 3.0), 3.0);
  float h = 0.18 * (s.x + 0.6);
  g = 0.18 * s.yz * vec2(0.0625, 0.07);
  vec3 n = gnd(vec2(w.x - CDR, w.y) * 0.625 + CBO[0], 30.0);
  float bb = sqrt(n.x * n.x + 0.02);
  float a = CAMP[0] * sat(oct);
  h += a * bb;
  g += a * (n.x / bb) * n.yz * 0.625;
  CCN = 0.0;
  a = CAMP[1] * sat(oct - 1.0);
  if (a > 0.0) {
    n = puffN(deckP(w, 1.25, CDR, 1), 60.0);
    h += a * n.x;
    g += a * vec2(n.y, 0.5 * n.y + n.z) * 1.25;
    CCN = a * (n.x - 0.5);
  }
  return h;
}
// fine deck: small puffs (their facets count less in the normal: light diffuses through them)
float cloudF(vec2 w, float oct, out vec2 g) {
  float a = CAMP[2] * sat(oct - 2.0);
  vec3 n = puffN(deckP(w, 2.5, 2.0 * CDR, 2), 120.0);
  float h = a * (n.x - 0.5);   // zero-mean about the coarse deck
  g = a * 0.55 * vec2(n.y, 0.5 * n.y + n.z) * 2.5;
  CFN = a * (n.x - 0.5);
  a = CAMP[3] * sat(oct - 3.0);
  if (a > 0.0) {
    n = puffN(deckP(w, 5.0, 2.0 * CDR, 3), 240.0);
    h += a * (n.x - 0.5);
    g += a * 0.55 * vec2(n.y, 0.5 * n.y + n.z) * 5.0;
    CFN += a * (n.x - 0.5);
  }
  return h;
}
float cloudH(vec2 w, float oct, out vec2 g) {
  vec2 g2;
  float h = cloudC(w, oct, g);
  CFN = 0.0;
  if (oct > 2.0) { h += cloudF(w, oct, g2); g += g2; }
  // the finest cauliflower: shading only
  float a = CAMP[4] * sat(oct - 4.0);
  if (a > 0.0) {
    vec3 n = gnd(vec2(w.x - 3.0 * CDR, w.y) * 10.0 + CBO[3].yx, 480.0);
    float bb = sqrt(n.x * n.x + 0.02);
    g += a * 0.5 * (n.x / bb) * n.yz * 10.0;
    CFN += a * (bb - 0.35);
  }
  return h;
}
float cloudHq(vec2 w, float oct) { vec2 g; return cloudH(w, oct, g); }
float cloudCq(vec2 w, float oct) { vec2 g; return cloudC(w, oct, g); }
float cloudFq(vec2 w, float oct) { vec2 g; return cloudF(w, oct, g); }
// screen height of the cloud tops at distance Z (where a peak at that distance meets the clouds)
float cloudLine(float x, float Z) { return YE - (KC - cloudCq(vec2(x * Z, Z), 2.0)) / Z; }

// ---------------------------------------------------------------- distant range
float farH(float x, float oct) {
  float dl = x + 0.585;
  float e = 0.432 + 0.098 * exp(-(dl < 0.0 ? -dl / 0.12 : dl / 0.062)) + 0.03 * exp(-sq((x + 0.62) / 0.2))
          + 0.045 * exp(-abs(x + 0.70) / 0.035) + 0.012 * exp(-abs(x + 0.53) / 0.02)
          + 0.035 * exp(-abs(x + 0.33) / 0.05) + 0.022 * exp(-abs(x + 1.0) / 0.08)
          + 0.03 * exp(-abs(x - 0.98) / 0.07) + 0.02 * exp(-abs(x - 1.22) / 0.06) + 0.014 * exp(-abs(x + 0.12) / 0.06);
  return e + 0.022 * (ridgeP(x * 3.3 + 2.0, oct) - 0.45) + 0.008 * (ridgeP(x * 11.0 + 5.0, oct - 1.0) - 0.45);
}
float rid2(vec2 p, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    float n = 1.0 - abs(gn(p) * 1.6);
    s += w * a * n * n;
    p = p * 2.1 + vec2(1.7, 9.2);
    a *= 0.56;
  }
  return s;
}
vec4 farLin(vec2 p) {
  vec2 q = p + u_par * (0.05 * PK);
  if (q.y < YE - 0.01 || q.y > 0.56) return vec4(0.0);
  float oct = clamp(log2(0.35 / (3.3 * PX)), 3.0, 8.0);
  float H = farH(q.x, oct);
  float a = smoothstep(AA, -AA, q.y - H);
  if (a <= 0.0) return vec4(0.0);
  float e = 0.004;
  float s = clamp((farH(q.x + e, 3.0) - farH(q.x - e, 3.0)) / (2.0 * e), -3.0, 3.0);
  float dep = H - q.y;
  // flutes and ribs running down the fall line (a shear along the local slope), finer ones
  // between them, faded out before they get thinner than a pixel
  float u = q.x + dep * s * 0.8;
  vec3 g0 = gnd(vec2(u * 34.0, dep * 9.0 + 3.0), 1e5);
  vec3 g1v = gnd(vec2(u * 90.0 + 7.0, dep * 22.0), 1e5);
  float w0 = sat(0.4 / (34.0 * PX) - 1.0), w1 = sat(0.4 / (90.0 * PX) - 1.0);
  float sa0 = sqrt(g0.x * g0.x + 0.03), sa1 = sqrt(g1v.x * g1v.x + 0.03);
  vec2 d0 = (g0.x / sa0) * vec2(g0.y * 34.0, -g0.y * 34.0 * 0.8 * s - g0.z * 9.0);
  vec2 d1 = (g1v.x / sa1) * vec2(g1v.y * 90.0, -g1v.y * 90.0 * 0.8 * s - g1v.z * 22.0);
  vec2 rg = (0.010 * w0 * d0 + 0.0035 * w1 * d1) * smoothstep(0.0, 0.03, dep);
  float b0 = 1.0 - sa0;
  float topw = 0.45 + 0.55 * exp(-dep * 25.0);
  vec3 N = normalize(vec3(-s * 0.85 * topw + rg.x, 0.55 + rg.y, 1.0));
  float dif = max(dot(N, LF), 0.0);
  float snow = smoothstep(0.30, 0.42, N.y + 0.25 * (b0 - 0.5) + 0.12 * (vn(q * vec2(40.0, 90.0)) - 0.5));
  vec3 alb = mix(vec3(0.13, 0.115, 0.11), vec3(0.88, 0.89, 0.92), snow);
  vec3 c = alb * (sunCol(q.y + 0.1) * 1.5 * dif * sunVis(q.y + 0.1) + AMB * 0.75);
  c = mix(c, hazeCol(q.x, q.y), 0.58 - 0.18 * smoothstep(0.44, 0.53, q.y));
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- the summit massif
// pyramids: (apex x, apex y, left slope, right slope) and arete lean
#define NPY 6
const vec4 PY[6] = vec4[6](vec4(0.380, 0.775, 1.22, 1.10), vec4(0.470, 0.700, 1.60, 0.78), vec4(0.160, 0.598, 0.50, 0.66),
                           vec4(-0.120, 0.540, 0.80, 0.42), vec4(0.760, 0.585, 1.10, 0.48), vec4(1.070, 0.505, 0.60, 0.60));
const float PL[6] = float[6](0.24, 0.30, -0.06, 0.05, 0.12, 0.0);
vec3 pyr(vec2 q, int i) {
  vec4 a = PY[i];
  float dy = a.y - q.y;
  float dx = q.x - a.x - PL[i] * dy;
  float s = dx < 0.0 ? -a.z : a.w;
  return vec3(CF * (dy - s * dx), -CF * s, CF * (-1.0 - s * PL[i]));
}
float CAV;   // how deep in a couloir between two pyramids (0..1)
vec2 QW;     // warped position
int PI1, PI2;  // dominant and runner-up pyramid here
float PW;      // weight of the dominant one's detail
vec3 massifEnv(vec2 q) {
  // bend the aretes and couloirs: the warp grows with depth below the summit
  float dw = sat((0.78 - q.y) * 2.2);
  q.x += 0.034 * dw * gn(vec2(q.x * 3.0, q.y * 5.0) + 7.0);
  QW = q;
  vec3 h = pyr(q, 0);
  float b1 = h.x, b2 = -1e9;
  int i1 = 0, i2 = 0;
  CAV = 0.0;
  for (int i = 1; i < NPY; i++) {
    vec3 b = pyr(q, i);
    if (b.x > b1) { b2 = b1; i2 = i1; b1 = b.x; i1 = i; } else if (b.x > b2) { b2 = b.x; i2 = i; }
    float k = 0.035;
    float m = sat(0.5 + 0.5 * (h.x - b.x) / k);
    CAV = max(CAV, 4.0 * m * (1.0 - m) * step(abs(h.x - b.x), k));
    h = vec3(mix(b.x, h.x, m) + k * m * (1.0 - m), mix(b.yz, h.yz, m));
  }
  PI1 = i1; PI2 = i2;
  PW = sat(0.5 + 0.5 * (b1 - b2) / 0.03);
  return h;
}
// relief detail in coordinates that radiate from pyramid i's apex: buttresses, ribs, couloirs and
// flutes converge towards the summit and widen downwards; multifractal, so detail gathers on the
// crests while the couloirs stay smooth and snow-filled. (value, d/dx, d/dy); w = first rib octave
vec4 detailFor(int pi, int nOct) {
  vec2 ap = PY[pi].xy;
  float V = max(ap.y - QW.y + 0.11, 0.02);
  float X = QW.x - ap.x - PL[pi] * (ap.y - QW.y);
  float u = X / V + float(pi) * 3.7;
  vec2 du = vec2(1.0, PL[pi] + X / V) / V;   // d(u)/d(x, y)
  vec2 dv = vec2(0.0, -1.0);
  vec4 D = vec4(0.0);
  float amp = 0.030, k1 = 9.0, k2 = 6.5, wt = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= nOct) break;
    // pixel footprint across the ribs; creases are rounded off at that width (no stair-stepping)
    float fp = k1 * PX / V;
    float wgt = sat(0.40 / fp - 1.0);
    if (wgt <= 0.0) break;
    vec3 g = gnd(vec2(u * k1, V * k2) + vec2(1.7, 4.1) * float(i), 1e5);
    float e = 0.015 + 1.2 * fp;
    float sa = sqrt(g.x * g.x + e * e);
    float r = 1.0 - sa * 1.3;
    if (i == 0) D.w = r;
    float a = wgt * amp * wt * min(V * 5.0, 1.0);
    D.x += a * r;
    D.yz -= a * 1.3 * (g.x / sa) * (g.y * k1 * du + g.z * k2 * dv);
    wt = sat(0.3 + 0.9 * r);
    amp *= 0.48; k1 *= 2.1; k2 *= 2.5;
  }
  return D;
}
vec4 massifDetail(int nOct) {
  vec4 D = detailFor(PI1, nOct);
  if (PW < 0.999) D = mix(detailFor(PI2, nOct), D, PW);
  return D;
}
float massifLo(vec2 q) {
  vec3 env = massifEnv(q);
  return env.x + detailFor(PI1, 2).x;
}

vec4 massifLin(vec2 p) {
  vec2 q = p + u_par * (0.18 * PK);
  if (q.y > 0.80 || q.y < 0.36) return vec4(0.0);
  vec3 env = massifEnv(q);
  if (env.x < -0.04) return vec4(0.0);
  float yb = cloudLine(q.x, ZM);
  if (q.y < yb - 0.004) return vec4(0.0);
  vec4 D = massifDetail(8);
  float Hs = env.x + D.x - 0.034;
  vec2 gr = env.yz + D.yz;
  float ga = length(env.yz) + 0.4;
  float a = smoothstep(-AA * ga, AA * ga, Hs) * smoothstep(yb - AA, yb + AA, q.y);
  if (a <= 0.0) return vec4(0.0);
  vec3 N = normalize(vec3(-gr.x, -gr.y, 1.0));
  float rib = D.w, cav = CAV;
  // a band of tawny limestone across the summit pyramid, and darker gneiss below
  float ys = q.y + 0.12 * (q.x - 0.38) + 0.008 * gn(q * 6.0);
  float str = smoothstep(0.615, 0.632, ys) * smoothstep(0.69, 0.668, ys);
  // shadows: march the relief towards the low sun
  vec2 ld = normalize(LF.xy);
  float rise = LF.z / length(LF.xy);
  float H0 = massifLo(q);
  float sh = 1.0;
  float st = 0.0035;
  for (int i = 0; i < 5; i++) {
    float hs = massifLo(q + ld * st);
    sh = min(sh, sat((H0 + st * rise - hs) / (0.25 * st) + 0.5));
    st *= 2.0;
  }
  float ndl = max(dot(N, LF), 0.0);
  // materials: snow and ice where the relief holds it; rock on cliffs, rib crests and the bands
  float up = N.y;
  float nz = vn(q * vec2(50.0, 120.0)) - 0.5 + 0.5 * (vn(q * vec2(170.0, 400.0)) - 0.5) + 0.25 * (vn(q * vec2(600.0, 1100.0)) - 0.5);
  float sw = 0.02 + 0.6 * PX / 0.0012 * 0.02;
  float snow = smoothstep(0.215 - sw, 0.215 + sw, up + 0.10 * nz - 0.30 * smoothstep(0.80, 0.98, rib) - 0.22 * str + 0.25 * cav);
  // thin snow ledges pick out the bedding of the band
  float bed = smoothstep(0.55, 0.9, vn(vec2(q.x * 20.0, ys * 260.0))) * smoothstep(0.45, 0.6, vn(vec2(q.x * 60.0, ys * 90.0)));
  snow = max(snow, str * bed * 0.8 * smoothstep(0.15, 0.3, up));
  float g2 = vn(q * vec2(260.0, 420.0)) * 0.6 + 0.4 * vn(q * vec2(900.0, 1300.0));
  float strat = 0.75 + 0.5 * vn(vec2(q.x * 30.0, ys * 600.0));
  vec3 rock = mix(vec3(0.070, 0.060, 0.055), vec3(0.25, 0.18, 0.105) * strat, str) * (0.6 + 0.8 * g2);
  vec3 alb = mix(rock, vec3(0.92, 0.91, 0.93), snow);
  float ao = (0.45 + 0.55 * smoothstep(0.1, 0.95, rib)) * (1.0 - 0.35 * cav);
  float sv = sunVis(q.y + 0.04 * q.x);
  vec3 sunL = sunCol(q.y) * 1.8 * sv * sh * ndl;
  vec3 skyL = AMB * (0.26 + 0.40 * up) * ao;
  vec3 bounce = vec3(0.62, 0.45, 0.50) * 0.16 * smoothstep(0.52, 0.40, q.y) * (0.5 + 0.5 * sv);
  vec3 c = alb * (sunL + skyL + bounce);
  // snow in shade glows faintly blue (sub-surface)
  c += snow * vec3(0.012, 0.03, 0.075) * (1.0 - ndl * sh);
  // mist pooled at the foot, then aerial perspective
  float mist = exp(-(q.y - yb) / 0.016);
  c = mix(c, hazeCol(q.x, q.y) * 1.1, 0.65 * mist);
  c = mix(c, hazeCol(q.x, q.y), 0.08);
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- plume and the col spill
vec4 plumeLin(vec2 p) {
  vec2 q = p + u_par * (0.2 * PK);
  vec4 acc = vec4(0.0);
  // jet-stream plume torn off the summit and the lee of the east ridge, streaming away east
  float s = q.x - 0.376;
  if (s > -0.012 && q.y > 0.62 && q.y < 0.87) {
    float gust = 0.70 + 0.30 * wav(1.0 / 75.0, 0.0) * wav(1.0 / 180.0, 1.0);
    float ss = max(s, 0.0);
    // the plume's top leaves the summit almost level and rises a little; its base hugs the ridge at first
    float top = 0.779 + 0.05 * ss - 0.03 * ss * ss;
    float bot = max(0.779 - 1.10 * ss, 0.752 - 0.12 * ss - 0.06 * sqrt(ss));
    float mid = 0.5 * (top + bot), wd = max(0.5 * (top - bot), 0.003);
    float v = (q.y - mid) / wd;
    float len = 0.30 * gust + 0.10;
    float env = exp(-pow(abs(v), 2.5) * 0.9) * smoothstep(-0.012, 0.004, s) * exp(-ss / len) * smoothstep(0.0, 0.006, top - bot + 0.002);
    if (env > 0.003) {
      float u = s * 14.0 - drift(256.0);
      float sp = clamp(log2(0.45 / (14.0 * PX)), 2.0, 5.0);
      vec2 st = vec2(u, v * 0.6 + q.y * 22.0);
      float n = fbmP(st + vec2(0.0, 0.5 * fbmP(st * 0.5 + 9.0, 64.0, 2.0)), 128.0, sp);
      float puff = 0.7 + 0.3 * gnP(vec2(s * 4.0 - drift(64.0), 0.5), 16.0);
      float root = smoothstep(0.08, 0.0, ss);
      float d = sat(env * (0.75 + 1.6 * n) * puff * (1.3 + 0.8 * root));
      float d2 = sat(env * (0.65 + 1.5 * fbmP(st + vec2(0.0, -0.3), 128.0, 2.0)));
      float lit = 0.8 + 0.5 * sat(d - d2 + 0.15) + 0.2 * smoothstep(0.0, 1.0, v);
      vec3 col = sunCol(0.78) * 1.7 * lit * sunVis(0.78) + AMB * 0.8;
      acc = over(acc, vec4(col, 1.0) * d * 0.9);
    }
  }
  // a cloud wave welling up behind the east col, pouring over and down its couloir into the sea
  float ph = mod(TM, 450.0) / 450.0;
  if (q.x > 0.58 && q.x < 0.92 && q.y > 0.37 && q.y < 0.60 && ph < 0.70) {
    vec2 col0 = vec2(0.722, 0.538);
    float yF = col0.y + 0.01 - 0.175 * smoothstep(0.06, 0.30, ph);
    float yT = 0.61 - 0.25 * smoothstep(0.42, 0.68, ph);
    float sup = smoothstep(0.0, 0.10, ph) * smoothstep(0.56, 0.42, ph);
    float dn = col0.y - q.y;
    float cx = col0.x + 0.18 * max(dn, 0.0) + 0.006 * sin(dn * 40.0 - TAU * ph * 6.0);
    float wd = 0.012 + 0.30 * max(dn, 0.0);
    float v = (q.x - cx) / wd;
    float u = dn * 26.0 - drift(128.0);
    float oc = clamp(log2(0.5 / (26.0 * PX)), 2.0, 5.0);
    float n = fbmP(vec2(u, v * 1.6), 64.0, oc);
    float body = exp(-v * v * 1.3) * smoothstep(yF - 0.012, yF + 0.012, q.y) * smoothstep(yT + 0.01, yT - 0.01, q.y) * smoothstep(-0.02, 0.012, dn);
    // the bulge welling up behind the col and rolling over it
    float bl = length((q - col0 - vec2(-0.005, 0.004 + 0.012 * sup)) / vec2(0.06, 0.012 + 0.022 * sup));
    float n2 = fbmP(vec2(q.x * 60.0 - drift(64.0), q.y * 60.0), 64.0, oc);
    float bulge = smoothstep(1.0, 0.45, bl + 0.45 * n2 - 0.1) * sup;
    float d = sat(max(body * (0.6 + 1.4 * n) * 1.7 * smoothstep(0.0, 0.08, ph), bulge)) * 0.95;
    if (d > 0.0) {
      float lit = sat(0.6 - 0.45 * v + 0.7 * n + 0.5 * smoothstep(0.012, -0.012, dn) * (0.6 + 0.8 * n2) + 0.3 * (q.y - col0.y) * 30.0);
      vec3 col = sunCol(q.y) * 1.6 * lit * sunVis(q.y + 0.05) + AMB * 0.9 + vec3(0.05, 0.04, 0.06);
      acc = over(acc, vec4(col, 1.0) * d);
    }
  }
  return acc;
}

// ---------------------------------------------------------------- sea of clouds
// shadow of the ridges behind us over the near deck (1 = sunlit): trace towards the sun to the
// occluding crest line (z = -1.6); only puffs tall enough rise out of it into the sun
float ridgeShadow(float x, float Z, float h) {
  float tanE = LG.y / length(LG.xz);
  float tS = (Z + 1.6) / 0.447;
  float xo = x - 0.894 * tS;
  float lim = 2.35 + 0.30 * g1(xo * 0.21 + 3.0) + 0.12 * g1(xo * 0.83) - 0.045 * xo - tanE * tS;
  return smoothstep(lim - 0.03 - 0.006 * tS, lim + 0.03 + 0.006 * tS, h);
}
vec3 cloudShade(vec3 N, float h, float fine, float sh, float tsh, float Z, float qx) {
  // the sun is only ~10 degrees up: slopes turned to it blaze, the level tops get a fraction of
  // that and everything turned away is lit by the sky alone. Light diffuses through the cloud,
  // so the terminator is soft; recesses between the puffs stay dim
  float ndl = dot(N, LG);
  float dif = sat(ndl * 0.8 + 0.12);
  dif *= dif * (3.0 - 2.0 * dif);
  float ao = sat(0.66 + 3.2 * fine) * mix(0.55, 1.0, smoothstep(0.04, 0.38, h));
  float sv = sunVis(0.36 + 0.05 * sat(Z / 60.0) - 0.04 * qx);
  vec3 sc = sunCol(0.37);
  sh *= tsh;
  vec3 lit = sc * 1.9 * dif * sh * sv * mix(0.45, 1.0, ao);
  // sky light: domes open to the deep-blue zenith; faces turned to the bright sunward horizon are warmer
  vec3 amb = AMB * (0.50 + 0.42 * N.y) * ao + vec3(0.26, 0.15, 0.15) * 0.20 * sat(-N.x * 1.6 - N.z * 0.4) * ao;
  // light scattered inside the cloud deck keeps the shadows luminous: a little warmer next to
  // lit cloud, deep violet-blue under the ridge shadow
  amb += sc * 0.05 * sv * ao * mix(0.4, 1.0, tsh);
  vec3 c = vec3(0.96) * (lit + amb);
  // aerial perspective: distant cloud sea melts into the horizon haze
  float fz = 1.0 - exp(-Z * 0.016);
  return mix(c, hazeCol(qx, YE) * mix(0.8, 1.08, sv), fz * 0.86);
}
vec4 cloudSeaLin(vec2 p) {
  float d0 = YE - p.y;
  if (d0 <= 0.0) return vec4(0.0);
  float dep = 0.04 + 4.0 * d0 / KC;
  vec2 q = p + u_par * (min(dep, 1.0) * PK);
  float d = YE - q.y;
  if (d <= 0.0005) return vec4(0.0);
  float HT = 0.62;
  // octaves resolvable here: one pixel spans PX / d^2 ground units along the view
  // (octave i has a 1.6 / 2^i wavelength; it fades out between 5 and 2.5 px)
  float oct = clamp(log2(0.457 * d * d / PX) + 0.5, 1.0, 6.0);
  float hh = 0.3;
  if (d > 0.006) {
    // relief march down through the cell tops, plane by plane, then two secant steps
    float oc = min(oct, 2.0);
    hh = 0.0;
    float hp = HT, dp = 1.0, hg = 0.0, df = -1.0;
    for (int i = 1; i <= 6; i++) {
      hg = HT * (1.0 - float(i) / 6.0);
      float z = (KC - hg) / d;
      df = hg - cloudCq(vec2(q.x * z, z), oc);
      if (df < 0.0) break;
      hp = hg; dp = df;
    }
    if (df < 0.0) {
      for (int k = 0; k < 2; k++) {
        float hm = mix(hg, hp, df / (df - dp));
        float z = (KC - hm) / d;
        float dm = hm - cloudCq(vec2(q.x * z, z), oc);
        if (dm < 0.0) { hg = hm; df = dm; } else { hp = hm; dp = dm; }
      }
      hh = mix(hg, hp, df / (df - dp));
    }
    // ...then finely through the puffs heaped on them, so they stand up and hide each other
    // (the coarse deck is linearised around its hit; only the fine octaves are re-evaluated)
    if (oct > 2.0) {
      float zc = (KC - hh) / d;
      vec2 gc;
      float hc = cloudC(vec2(q.x * zc, zc), oc, gc);
      float sl = dot(gc, vec2(q.x, 1.0));
      float o4 = min(oct, 4.0);
      float top = hh + 0.085;
      df = 1.0;
      for (int i = 0; i <= 4; i++) {
        hg = top - 0.032 * float(i);
        float z = (KC - hg) / d;
        df = hg - (hc + sl * (z - zc)) - cloudFq(vec2(q.x * z, z), o4);
        if (df < 0.0) break;
        hp = hg; dp = df;
      }
      if (df < 0.0 && hg < top) {
        float hm = mix(hg, hp, df / (df - dp));
        float z = (KC - hm) / d;
        float dm = hm - (hc + sl * (z - zc)) - cloudFq(vec2(q.x * z, z), o4);
        if (dm < 0.0) { hg = hm; df = dm; } else { hp = hm; dp = dm; }
        hh = mix(hg, hp, df / (df - dp));
      } else hh = hg;
    }
  }
  float Z = (KC - hh) / d;
  vec2 w = vec2(q.x * Z, Z);
  vec2 gr;
  float h = cloudH(w, oct, gr);
  float fine = CFN + CCN;
  // far away the billows shrink below a pixel: flatten the normal towards the mean
  float far = smoothstep(0.03, 0.006, d);
  vec3 N = normalize(vec3(-gr.x * (1.0 - far), 1.0, -gr.y * (1.0 - far)));
  vec2 lg = normalize(LG.xz);
  float tanE = LG.y / length(LG.xz);
  // long, soft shadows of the cells towards the low sun
  float sh = 1.0;
  if (d > 0.006) {
    float sd = 0.16;
    for (int i = 0; i < 2; i++) {
      float hs = cloudCq(w + lg * sd, min(oct, 2.0));
      sh = min(sh, sat((h + sd * tanE - hs) / (0.3 * sd) + 0.5));
      sd *= 3.5;
    }
  }
  sh = mix(sh, 0.75, far);
  vec3 c = cloudShade(N, h, fine, sh, ridgeShadow(w.x, Z, h), Z, q.x);
  return vec4(c, 1.0);
}

// ---------------------------------------------------------------- cloud-piercing ridge
float ridgeTop(float x, float oct) {
  float d = x - 0.62;
  float e = 0.29 + 0.095 * exp(-(d < 0.0 ? -d / 0.07 : d / 0.17)) + 0.035 * exp(-abs(x - 0.80) / 0.05) + 0.05 * exp(-sq((x - 1.0) / 0.12)) + 0.075 * exp(-abs(x + 0.47) / 0.05);
  return e + 0.028 * (ridgeP(x * 9.0 + 11.0, oct) - 0.45);
}
vec4 ridgeLin(vec2 p) {
  vec2 q = p + u_par * (0.54 * PK);
  if (q.y > 0.43 || q.y < 0.27) return vec4(0.0);
  float oct = clamp(log2(0.35 / (7.0 * PX)), 3.0, 8.0);
  float H = ridgeTop(q.x, oct);
  if (q.y > H + 2.0 * PX) return vec4(0.0);
  float yb = cloudLine(q.x, ZR);
  if (q.y < yb - 0.004) return vec4(0.0);
  float a = smoothstep(AA, -AA, q.y - H) * smoothstep(yb - AA, yb + AA, q.y);
  if (a <= 0.0) return vec4(0.0);
  float e = 0.003;
  float s = clamp((ridgeTop(q.x + e, 4.0) - ridgeTop(q.x - e, 4.0)) / (2.0 * e), -3.0, 3.0);
  float dep = H - q.y;
  vec2 bp = vec2(q.x * 40.0 + dep * s * 12.0, q.y * 46.0);
  float go = clamp(log2(0.45 / (46.0 * PX)), 2.0, 5.0);
  float b0 = rid2(bp, go);
  float bx = rid2(bp + vec2(0.05, 0.0), go) - b0;
  float by = rid2(bp + vec2(0.0, 0.05), go) - b0;
  float topw = exp(-dep * 40.0);
  vec3 N = normalize(vec3(-s * 0.9 * topw - bx * 9.0, 0.5 - by * 7.0, 1.0));
  float dif = max(dot(N, LF), 0.0);
  float snow = smoothstep(0.42, 0.6, N.y + 0.3 * (b0 - 0.45));
  vec3 alb = mix(vec3(0.07, 0.065, 0.06), vec3(0.88, 0.90, 0.94), snow);
  float sv = sunVis(q.y + 0.08);
  vec3 c = alb * (sunCol(q.y) * 1.6 * dif * sv + AMB * (0.45 + 0.4 * N.y));
  // cloud wisps streaming across its foot
  float mist = exp(-(q.y - yb) / 0.012);
  float wisp = smoothstep(0.45, 0.8, vnP(vec2(q.x * 14.0 - drift(84.0) * 2.0, q.y * 90.0), 168.0)) * exp(-(q.y - yb) / 0.03);
  vec3 mc = sunCol(0.3) * 0.9 * sv + AMB * 0.9;
  c = mix(c, mc, sat(0.8 * mist + 0.6 * wisp));
  c = mix(c, hazeCol(q.x, q.y), 0.10);
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- near ridge
float crestY(float x) { return 0.150 - 0.085 * x + 0.010 * sin(x * 3.7 + 1.0) + 0.006 * g1(x * 9.0 + 2.0) + 0.0025 * g1(x * 23.0 + 5.0); }
// rock outcrops standing above the crest: a big slab on the right, the flag cairn, a fin
float rockH(float x) {
  float h = 0.060 * pow(sat(1.0 - abs(x - 0.60) / 0.26), 0.5) * (0.8 + 0.35 * n1(x * 14.0));
  // the cairn: a squat cone of stacked stones
  h = max(h, 0.038 * (1.0 - pow(sat(abs(x + 0.668) / 0.085), 1.15)));
  h = max(h, 0.022 * pow(sat(1.0 - abs(x - 0.165) / 0.035), 0.7));
  h = max(h, 0.028 * pow(sat(1.0 - abs(x + 0.30) / 0.045), 0.9));
  h = max(h, 0.016 * pow(sat(1.0 - abs(x + 0.93) / 0.12), 0.7));
  return h;
}
// bilinear value noise: faceted, angular shapes (rock outlines)
float vnL(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// rock roughness: ridged octaves (sharp arrises); (value, d/dx, d/dy)
vec3 rockRel(vec2 q) {
  vec3 R = vec3(0.0);
  float a = 0.016, f = 13.0;
  for (int i = 0; i < 7; i++) {
    float w = sat(0.45 / (f * PX) - 1.0);
    if (w <= 0.0) break;
    vec3 g = gnd(q * vec2(f, f * 1.25) + float(i) * 5.3, 1e5);
    float e = 0.02 + 1.5 * f * PX;
    float sa = sqrt(g.x * g.x + e * e);
    R.x += w * a * (1.0 - sa);
    R.yz -= w * a * (g.x / sa) * g.yz * vec2(f, f * 1.25);
    a *= 0.45; f *= 2.1;
  }
  return R;
}
// fractured rock: Voronoi blocks, each a flat face with its own tilt and a little proud of its
// neighbours; their borders are straight joints. (tilt x, tilt y, block height, joint distance)
vec4 blocks(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  vec2 c1 = vec2(0.0), o1 = vec2(0.0), o2 = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = g + 0.1 + 0.8 * h22(i + g) - f;
      float d = dot(o, o);
      if (d < d1) { d2 = d1; o2 = o1; d1 = d; o1 = o; c1 = i + g; } else if (d < d2) { d2 = d; o2 = o; }
    }
  }
  vec4 r = h42(c1 + 17.3);
  // exact distance to the border with the runner-up block
  float jd = dot(0.5 * (o1 + o2), normalize(o2 - o1));
  return vec4(r.xy - 0.5, r.z, jd);
}
// the near ridge still lies in the blue shadow of the ridge behind the viewer; only its
// highest points (the rock tops on the right, the pole and the upper flags) catch the sun
float nearSun(vec2 q) {
  float ys = 0.185 - 0.30 * (q.x - 0.05) + 0.010 * g1(q.x * 7.0 + 1.0) + 0.004 * g1(q.x * 23.0 + q.y * 9.0);
  ys = min(ys, 0.43 - 0.02 * q.x);
  return smoothstep(-0.005, 0.005, q.y - ys) * sunVis(0.42);
}
// fill light from the glowing sky on the sun side
const vec3 FILLD = vec3(-0.75, 0.45, 0.48);
// wind ripples on the crust: crests across the wind, gentle on the windward side and steep in
// the lee, wandering and forking, in patches. Returns the slope in the ground frame (x across,
// z away); fx / fz: the pixel footprint across / along the view; cr: on a crest
const vec2 WIND = vec2(0.94, 0.34);
vec2 ripples(vec2 g, float k, float amp, float fx, float fz, float seed, out float cr) {
  float u = dot(g, WIND) * k + 2.4 * gn(g * vec2(0.9, 2.6) + seed) + 0.7 * gn(g * vec2(3.1, 8.0) + seed * 2.0);
  float fp = k * length(WIND * vec2(fx, fz));        // ripple cycles per pixel
  float w = sat(0.35 / fp - 0.6) * smoothstep(0.42, 0.75, vn(g * vec2(0.7, 2.0) + seed * 3.0));
  float ph = TAU * u;
  float ps = ph + 0.55 * sin(ph);
  cr = w * smoothstep(0.6, 1.0, sin(ps));
  return WIND * (amp * w * cos(ps) * (1.0 + 0.55 * cos(ph)) * TAU * k);
}
vec4 nearLin(vec2 p) {
  vec2 q = p + u_par * PK;
  float cy = crestY(q.x);
  float rh = rockH(q.x);
  float cairn = sat(1.0 - abs(q.x + 0.668) / 0.08);
  float rt = cy + rh + (rh > 0.0 ? 0.006 * (ridgeP(q.x * 26.0, 5.0) - 0.4) * sat(rh * 50.0) * (1.0 - 0.8 * cairn) : 0.0);
  float top = max(cy, rt);
  if (q.y > top + 2.0 * PX) return vec4(0.0);
  float a = smoothstep(AA, -AA, q.y - top);
  float sv = nearSun(q);
  vec3 sc = sunCol(0.42);
  vec3 fillC = vec3(0.17, 0.14, 0.16);
  // ---- snow: a wind-packed slope falling away to the crest, seen in perspective
  float gz = 1.0 / max(0.36 - q.y, 0.05);
  vec2 g = vec2(q.x * gz, gz);
  float fpx = PX * gz * gz;
  // big soft drifts
  vec3 s0 = gnd(g * vec2(1.1, 1.7) + 4.0, 1e5);
  vec2 hg = 0.22 * s0.yz * vec2(1.1, 1.7);
  // the wind (from the left, a little from behind) has scoured the crust into long low swells
  // along its path, and combed ripples across it, big and small
  vec2 gw = vec2(0.94 * g.x + 0.34 * g.y, -0.34 * g.x + 0.94 * g.y) + 0.3 * s0.x;
  vec3 s1 = gnd(gw * vec2(1.0, 5.0) + vec2(0.0, 2.0), 1e5);
  vec2 d1 = 0.022 * s1.yz * vec2(1.0, 5.0) * sat(0.4 / (5.0 * fpx) - 0.5);
  hg += vec2(0.94 * d1.x - 0.34 * d1.y, 0.34 * d1.x + 0.94 * d1.y);
  float crest, cr2;
  hg += ripples(g, 7.0, 0.0028, PX * gz, fpx, 0.0, crest);
  hg += ripples(g * 1.13 + 0.4 * s1.x, 19.0, 0.0007, PX * gz, fpx, 7.0, cr2);
  crest = max(crest, 0.6 * cr2);
  // a trail of boot prints climbing to the flag cairn (ground frame: X across, gz away)
  float pao = 1.0;
  {
    vec2 pd = normalize(vec2(-1.04, 1.0));
    vec2 pn = vec2(pd.y, -pd.x);
    float sp = (g.y - 2.78) / pd.y;
    float i0 = floor(sp / 0.42 + 0.5);
    for (int k = -1; k <= 1; k++) {
      float i = i0 + float(k);
      if (i < 0.0 || i > 9.0) continue;
      float gzi = 2.78 + i * 0.42 * pd.y;
      float side = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
      vec2 c = vec2(-0.42 - 1.04 * (gzi - 2.78) + 0.12 * sin(gzi * 1.4), gzi) + pn * side * 0.075;
      vec2 l = g - c;
      l = vec2(dot(l, pn), dot(l, pd)) / vec2(0.055, 0.13);
      float r2 = dot(l, l) * (1.0 + 0.35 * gn(l * 2.5 + i * 7.0));
      if (r2 < 1.6) {
        // wall slope of the depression (the far wall faces us, the near wall turns away);
        // the trampled floor is smoother and the rim is pushed up a little
        vec2 gl = -0.07 * smoothstep(0.2, 0.9, r2) * (1.0 - smoothstep(0.9, 1.2, r2)) * (l.x * pn / 0.055 + l.y * pd / 0.13);
        gl += 0.03 * smoothstep(0.95, 1.15, r2) * (1.0 - smoothstep(1.15, 1.55, r2)) * (l.x * pn / 0.055 + l.y * pd / 0.13);
        hg = mix(hg, hg * 0.3, 1.0 - smoothstep(0.5, 0.9, r2)) + gl * 1.3;
        pao *= mix(1.0, 0.84, (1.0 - smoothstep(0.3, 1.0, r2)));
      }
    }
  }
  vec3 N = normalize(vec3(-hg.x, 1.0, -hg.y));
  // the crest rolls over into the void
  float edge = smoothstep(0.016, 0.0, cy - q.y);
  N = normalize(N + vec3(0.0, -0.4 * edge, 1.4 * edge));
  float ndl = dot(N, LG);
  float ssh = smoothstep(-0.02, 0.10, ndl);
  vec3 Nf = vec3(N.x, N.y, -N.z);   // to the face frame for the fill
  float skyv = 0.50 + 0.50 * N.y * N.y;
  // wind-packed grain: a faint mottling that keeps the slope from looking like plastic
  float grain = vn(g * vec2(9.0, 30.0)) * sat(0.3 / (30.0 * fpx)) + vn(g * vec2(23.0, 80.0) + 5.0) * sat(0.3 / (80.0 * fpx));
  vec3 salb = vec3(0.92) * (0.96 + 0.05 * grain);
  vec3 c = salb * (sc * 1.6 * sv * (0.25 + 1.15 * max(ndl, 0.0)) * ssh + AMB * skyv * (0.85 + 0.3 * smoothstep(0.0, 0.15, q.y)) + fillC * 1.4 * max(dot(Nf, FILLD), 0.0));
  c *= pao;
  // light scattered inside the snow: troughs and shaded scoops glow a deeper blue, sunlit crests
  // are a touch translucent and warm
  c += vec3(0.010, 0.026, 0.065) * (1.0 - ssh * sv) * (1.0 + 0.8 * (1.0 - crest));
  c += sc * 0.08 * sv * crest * ssh;
  // sparkles: ice grains catching the sun (a few glint even in the shade, from the bright sky)
  vec2 spc = g * vec2(70.0, 260.0);
  vec2 si = floor(spc), sf = fract(spc);
  vec4 sh4 = h42(si + 11.0);
  float tw = pow(max(0.0, sin(TAU * fract(TM * floor((0.3 + 0.9 * sh4.z) * TP) / TP) + sh4.w * TAU)), 12.0);
  vec2 sdp = (sf - (0.2 + 0.6 * sh4.xy)) / vec2(70.0, 260.0) / gz;
  float rs = max(0.0005, 0.6 * PX);
  c += (sc * 7.0 * sv * ssh + vec3(0.5, 0.6, 0.9) * 0.8) * exp(-dot(sdp, sdp) / (rs * rs)) * step(sh4.x, 0.05) * tw;
  // ---- rock: outcrops along the crest and boulders breaking through the snow, fractured into
  // blocks (angular outlines, flat faces, straight joints), their feet buried in drifted snow
  float ol = vnL(q * vec2(9.0, 12.0) + 2.0) * 0.62 + 0.38 * vnL(q * vec2(27.0, 33.0) + 7.0);
  float out1 = ol * 0.8 + 0.30 * smoothstep(-0.035, 0.004, q.y - cy) - 0.6 * smoothstep(-0.03, -0.06, q.y - cy)
             + 0.5 * smoothstep(0.0, 0.01, rh) * smoothstep(-0.05, -0.01, q.y - cy + 0.03 * (ol - 0.5)) * (1.0 - 0.6 * cairn);
  // a big boulder in the near corner
  float bang = atan(q.y + 0.02, q.x + 0.8);
  float bd = length((q - vec2(-0.80, -0.02)) / vec2(0.17, 0.115)) - 0.05 * g1(bang * 5.0) - 0.04 * (vnL(vec2(bang * 7.0, 1.0)) - 0.5);
  out1 = max(out1, smoothstep(1.02, 0.98, bd) * 0.8);
  bool crestRock = q.y > cy - 0.002 && rh > 0.0;
  if (out1 > 0.52 || crestRock) {
    vec4 B = blocks(q * vec2(26.0, 30.0) + 1.7);
    float jpx = PX * 30.0;
    // only some of the block borders are open joints
    float joint = mix(1.0, smoothstep(0.0, 0.015 + jpx, B.w), smoothstep(0.62, 0.75, vn(q * vec2(17.0, 21.0) + 9.0)));
    vec3 R = rockRel(q);
    float rf = out1 + 0.6 * (R.x - 0.02) + 0.10 * (B.z - 0.5) * joint;
    float rw = 0.008 + 0.5 * PX / 0.002;
    float rmask = smoothstep(0.70 - rw, 0.70 + rw, rf);
    if (crestRock) rmask = max(rmask, smoothstep(cy - 0.002, cy + 0.001, q.y) * smoothstep(0.0, 0.004, rh));
    // snow banked against the rocks, in their shade
    c *= 1.0 - 0.22 * smoothstep(0.58, 0.69, rf) * (1.0 - rmask);
    if (rmask > 0.0) {
      vec4 B2 = blocks(q * vec2(80.0, 92.0) + 5.1);
      // form: tops of the outcrops and the boulder's crown turn to the sky
      float tf = sat((rt - q.y) / max(rh + 0.01, 0.015));
      float formY = rh > 0.0 ? mix(0.85, 0.05, smoothstep(0.0, 0.6, tf)) : 0.2;
      formY = max(formY, smoothstep(0.9, 0.3, bd) * mix(0.9, 0.0, smoothstep(-0.02, 0.08, 0.095 - q.y)));
      vec2 tilt = B.xy * 0.55 + B2.xy * 0.2;
      vec3 RN = normalize(vec3(-R.y * 0.6 + tilt.x, formY - R.z * 0.6 + tilt.y, 1.0));
      float rdif = max(dot(RN, LF), 0.0);
      // dark gneiss with paler bands, rusty stains and lichen where it faces up
      float fo = clamp(log2(0.3 / (60.0 * PX)), 1.0, 4.0);
      float mn = fbmP(q * vec2(60.0, 75.0) + 3.0, 1e5, fo);
      float band = smoothstep(0.1, 0.5, gn(vec2(q.x * 14.0 + q.y * 30.0, q.y * 90.0 - q.x * 20.0)));
      vec3 ralb = mix(vec3(0.085, 0.082, 0.085), vec3(0.16, 0.15, 0.14), band * 0.6) * (0.75 + 0.8 * (mn + 0.25)) * (0.9 + 0.2 * B2.z) * (0.85 + 0.3 * B.z);
      ralb = mix(ralb, vec3(0.20, 0.12, 0.07), 0.35 * smoothstep(0.1, 0.4, mn) * (1.0 - band));
      float lich = smoothstep(0.25, 0.45, fbmP(q * 140.0 + 11.0, 1e5, clamp(log2(0.3 / (140.0 * PX)), 1.0, 3.0))) * sat(RN.y * 2.0);
      ralb = mix(ralb, vec3(0.30, 0.22, 0.07), 0.45 * lich);
      // joints: dark straight cracks, the big ones deeper
      float crk = (1.0 - joint) * 0.75;
      ralb *= 1.0 - 0.7 * sat(crk);
      float rsnow = smoothstep(0.58, 0.72, RN.y + 0.25 * (mn + 0.1) - 0.15) * joint;
      // the flag cairn: courses of flat stones, each a little different, with dark gaps between them
      float cw = cairn * step(cy - 0.012, q.y);
      if (cw > 0.0) {
        float yy = (q.y - cy) / 0.0076 + 3.0;
        float row = floor(yy + 0.18 * sin(q.x * 70.0 + floor(yy) * 2.1));
        float fy = yy + 0.18 * sin(q.x * 70.0 + row * 2.1) - row;
        float len = 0.010 + 0.010 * h11(row + 4.0);
        float sx = (q.x + 0.668) / len + h11(row) * 3.0;
        vec4 hs = h42(vec2(floor(sx), row));
        vec2 sc2 = vec2(fract(sx), fy);
        // each stone: a rounded slab, its top face catching the sky, its front bulging out
        vec2 e2 = min(sc2, 1.0 - sc2) * vec2(len, 0.0076);
        float rr = 0.0016 + 0.0008 * hs.x;
        float sd = rr - length(max(vec2(rr) - e2, 0.0));
        float gap = smoothstep(0.0, 0.0007 + 0.5 * PX, sd);
        vec2 bul = (sc2 - 0.5) * vec2(1.0, 1.6);
        RN = normalize(vec3(bul.x * 0.8 + R.y * 0.15, bul.y * 0.9 + 0.35 + 0.4 * smoothstep(0.75, 0.95, sc2.y), 1.0));
        rdif = max(dot(RN, LF), 0.0);
        vec3 stone = mix(vec3(0.10, 0.095, 0.09), vec3(0.17, 0.14, 0.11), hs.y) * (0.8 + 0.4 * mn);
        stone = hs.z > 0.9 ? vec3(0.42, 0.41, 0.40) : stone;   // a few white quartz offerings
        ralb = mix(ralb, stone * mix(0.15, 1.0, gap), cw);
        // snow lodged on the stones' upper faces
        rsnow = mix(rsnow, smoothstep(0.62, 0.9, sc2.y + 0.25 * (hs.w - 0.5)) * gap * smoothstep(0.3, 0.6, hs.w + 0.2 * mn) * 0.9, cw);
      }
      float rao = (0.45 + 0.55 * smoothstep(0.0, 0.03, R.x)) * (1.0 - 0.4 * sat(crk));
      float rfill = max(dot(RN, FILLD), 0.0);
      // light bounced up from the bright snow around the rocks reaches their lower faces
      vec3 bnc = vec3(0.30, 0.36, 0.52) * 0.55 * sat(0.6 - RN.y);
      vec3 rc = ralb * (sc * 1.7 * sv * rdif + (AMB * (0.42 + 0.45 * RN.y) + fillC * 1.5 * rfill + bnc) * rao);
      vec3 snc = vec3(0.92) * (sc * 1.55 * sv * (0.2 + 1.2 * rdif) + (AMB * (0.55 + 0.4 * RN.y) + fillC * rfill) * rao);
      snc += vec3(0.010, 0.026, 0.065) * (1.0 - sv * rdif);
      rc = mix(rc, snc, rsnow);
      c = mix(c, rc, rmask);
    }
  }
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- prayer flags
const vec3 FLC[5] = vec3[5](vec3(0.06, 0.16, 0.50), vec3(0.80, 0.80, 0.74), vec3(0.62, 0.075, 0.05), vec3(0.07, 0.36, 0.16), vec3(0.80, 0.58, 0.10));
// one string of flags from screen point a (perspective weight wa) to b (wb)
vec4 flagString(vec2 q, vec2 A, vec2 B, float wa, float wb, float nf, float sag, float seed) {
  float dx = B.x - A.x;
  float tx = (q.x - A.x) / dx;
  if (tx < -0.06 || tx > 1.02) return vec4(0.0);
  float ys = mix(A.y, B.y, tx) - sag * 4.0 * tx * (1.0 - tx);
  float sc0 = mix(wa, wb, sat(tx));
  float fh = 0.034 * sc0;
  if (q.y > ys + 0.004 || q.y < ys - fh * 1.4) return vec4(0.0);
  vec4 acc = vec4(0.0);
  // the string
  float slope = (B.y - A.y) / dx - sag * 4.0 * (1.0 - 2.0 * tx) / dx;
  float sd = abs(q.y - ys) / sqrt(1.0 + slope * slope);
  float sw = 0.0007 * sc0 + 0.25 * PX;
  float sm = smoothstep(sw + AA, sw - AA, sd) * step(0.0, tx) * step(tx, 1.0);
  // flags hang below it, blown down-wind (to the right) and rippling
  float shear = 0.42 + 0.10 * wav(1.0 / 30.0, seed);
  for (int k = 0; k < 1; k++) {
    float vy = ys - q.y;
    float xa = q.x - shear * max(vy, 0.0);
    float s = wb * (xa - A.x) / (wb * (xa - A.x) + wa * (B.x - xa));
    if (s < 0.0 || s > 1.0) continue;
    float fi = floor(s * nf);
    float fs = fract(s * nf);
    if (fs > 0.86) continue;
    vec4 h = h42(vec2(fi, seed));
    float sc = 1.0 / ((1.0 - s) / wa + s / wb);
    float fw = 0.034 * sc;
    float txa = (xa - A.x) / dx;
    float ysa = mix(A.y, B.y, txa) - sag * 4.0 * txa * (1.0 - txa);
    float v = (ysa - q.y) / fw;
    // each flag swings a little on its own
    float u = fs / 0.86 - (0.10 * (h.x - 0.5) + 0.05 * wav(0.13 + 0.05 * h.z, h.w * TAU)) * v;
    if (u < 0.0 || u > 1.0) continue;
    // rippling: waves run from the string to the free edge
    float ph = TAU * (1.6 * u + 0.9 * v) - TAU * fract(TM * floor((1.6 + 0.8 * h.x) * TP) / TP) + h.y * TAU;
    float flut = 0.06 * v * sin(ph);
    v += flut;
    float fa = AA / fw;
    float len = 1.15 - 0.35 * h.z * h.z - 0.06 * n1(u * 9.0 + fi * 3.0) * v - 0.05 * n1(u * 31.0 + fi * 7.0) * smoothstep(0.3, 0.0, fa);
    if (v < 0.0 || v > len) continue;
    float m = smoothstep(0.0, fa, v) * smoothstep(len, len - fa * 1.5, v) * smoothstep(0.0, fa / 0.86, u) * smoothstep(1.0, 1.0 - fa / 0.86, u);
    vec3 alb = FLC[int(mod(fi + seed, 5.0))];
    // sun-bleached and weathered, some more than others
    alb = mix(alb, vec3(0.62, 0.60, 0.56), 0.06 + 0.26 * h.w * h.w) * (0.85 + 0.15 * vn(vec2(u * 6.0, v * 6.0) + fi));
    // faded woodblock prayers: rows of dark marks and a central motif
    float ink = smoothstep(0.45, 0.7, vn(vec2(u * 26.0, floor(v * 8.0) * 5.0 + fi))) * smoothstep(0.15, 0.45, fract(v * 8.0)) * smoothstep(0.75, 0.55, fract(v * 8.0))
              * step(0.1, u) * step(u, 0.9) * step(0.1, v) * step(v, 0.9) * (1.0 - smoothstep(0.12, 0.2, length(vec2(u - 0.5, v - 0.45))));
    ink = max(ink * 0.5, smoothstep(0.17, 0.12, length(vec2(u - 0.5, v - 0.45) * vec2(1.0, 1.15))) * 0.4 * vn(vec2(u, v) * 18.0 + fi));
    alb *= 1.0 - 0.5 * ink * smoothstep(0.08, 0.02, fa);
    float fold = cos(ph) * 0.8 + 0.2 * cos(TAU * (3.1 * u - 1.3 * v) + h.z * 9.0);
    float lit = 0.55 + 0.45 * fold;
    // the flags fly above the ridge's shadow; only the far-left run dips into it
    float fsv = sunVis(0.45) * smoothstep(0.17, 0.26, q.y - 0.18 * (q.x + 0.66));
    vec3 col = alb * (sunCol(0.45) * 1.5 * lit * fsv + AMB * (0.75 + 0.25 * fold)) + alb * sunCol(0.45) * 0.5 * (1.0 - lit) * fsv;
    acc = over(acc, vec4(col, 1.0) * m);
  }
  acc = over(acc, vec4(vec3(0.05, 0.04, 0.035), 1.0) * sm * 0.9);
  return acc;
}
vec4 flagsLin(vec2 p) {
  vec2 q = p + u_par * (1.1 * PK);
  if (q.y > 0.48 || q.y < 0.10) return vec4(0.0);
  vec4 acc = vec4(0.0);
  vec2 top = vec2(-0.659, 0.458);
  acc = over(acc, flagString(q, top, vec2(0.165, 0.178), 1.0, 0.62, 21.0, 0.045, 3.0));
  acc = over(acc, flagString(q, vec2(-1.08, 0.14), top, 1.35, 1.0, 9.0, 0.03, 7.0));
  // the pole
  float px = mix(-0.671, -0.659, sat((q.y - 0.19) / 0.27));
  float pw = 0.0024;
  float pm = smoothstep(pw + AA, pw - AA, abs(q.x - px)) * step(0.17, q.y) * step(q.y, 0.462);
  if (pm > 0.0) {
    float side = (q.x - px) / pw;
    vec3 col = vec3(0.16, 0.10, 0.06) * (sunCol(0.45) * 1.6 * sat(0.6 - 0.7 * side) * sunVis(0.45) * smoothstep(0.24, 0.30, q.y) + AMB * 0.6);
    acc = over(vec4(col, 1.0) * pm, acc);
  }
  return acc;
}

// ---------------------------------------------------------------- spindrift and ice crystals
vec4 driftLin(vec2 p) {
  vec2 q = p + u_par * (1.3 * PK);
  if (q.y > 0.62) return vec4(0.0);
  vec4 acc = vec4(0.0);
  // snow streaming off the crest in the gusts, lofting as it leaves the edge
  float cy = crestY(q.x);
  float hgt = q.y - cy;
  if (hgt > -0.05 && hgt < 0.10) {
    float u = q.x * 7.0 - drift(384.0);
    float gust = smoothstep(0.25, 0.85, vnP(vec2(q.x * 1.6 - drift(32.0), 0.5), 32.0));
    float lift = hgt - 0.010 - 0.02 * sat(q.x + 0.2);
    vec2 st = vec2(u, lift * 55.0 - q.x * 3.0);
    float n = fbmP(st + vec2(0.0, 0.6 * fbmP(st * 0.5 + 3.0, 64.0, 2.0)), 128.0, clamp(log2(0.5 / (7.0 * PX)), 2.0, 5.0));
    float band = exp(-abs(lift) / 0.018) * smoothstep(-0.045, -0.01, hgt);
    float d = sat(smoothstep(-0.05, 0.35, n) * band * gust * 0.75);
    vec3 col = sunCol(0.42) * 1.5 * nearSun(q) + AMB * 1.7 + vec3(0.09, 0.08, 0.1);
    acc = over(acc, vec4(col, 1.0) * d);
  }
  // drifting ice crystals catching the sun
  float cs = 0.05;
  vec2 qq = q - vec2(drift(48.0) * cs * 32.0 / 48.0 * 1.0, 0.0);
  vec2 ci = floor(qq / cs), cf = fract(qq / cs);
  vec4 h = h42(vec2(mod(ci.x, 32.0), ci.y) + 5.0);
  if (h.z < 0.35 && !(abs(q.x) < 0.3 && q.y > 0.5)) {
    vec2 pos = 0.5 + (h.xy - 0.5) * 0.6 + 0.15 * vec2(wav(0.05 + 0.04 * h.w, h.x * TAU), wav(0.07 + 0.03 * h.z, h.y * TAU));
    vec2 dd = (cf - pos) * cs;
    float tw = pow(max(0.0, wav(0.2 + 0.3 * h.w, h.y * TAU)), 6.0);
    float r = 0.0007 + 0.0007 * h.w;
    float st = exp(-dot(dd, dd) / (r * r)) + 0.5 * (exp(-abs(dd.x) / 0.0006) * exp(-abs(dd.y) / 0.007) + exp(-abs(dd.y) / 0.0006) * exp(-abs(dd.x) / 0.007)) * tw;
    float al = sat(st * (0.35 + 0.65 * tw)) * 0.8;
    acc = over(acc, vec4(sunCol(0.5) * 2.0 * sunVis(0.5) + 0.3, 1.0) * al);
  }
  return acc;
}

// ---------------------------------------------------------------- output
vec3 toDisp(vec3 c) {
  c *= 0.92;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
vec4 finish(vec4 v) {
  if (v.a <= 0.0) return vec4(0.0);
  return vec4(toDisp(v.rgb / v.a) * v.a, v.a);
}
vec4 layerLin(int k, vec2 p) {
  if (k == 0) return skyLin(p);
  if (k == 1) return farLin(p);
  if (k == 2) return cloudSeaLin(p);
  if (k == 3) return massifLin(p);
  if (k == 4) return plumeLin(p);
  if (k == 5) return ridgeLin(p);
  if (k == 6) return nearLin(p);
  if (k == 7) return flagsLin(p);
  return driftLin(p);
}

void main() {
  TM = mod(u_time, TP);
  PX = 1.0 / u_res.y;
  AA = 0.75 * PX;
  CDR = drift(48.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float th = TAU * fract(TM * (5.0 + 3.0 * fi) / TP) + fi * 1.9;
    CBO[i] = (0.10 + 0.09 * fi) * vec2(cos(th), sin(th));
  }
  // long-cycle light: a far cloud bank slowly veils the sun, then its first rays sweep back down the range
  float ue = mod(TM, 600.0);
  VEIL = smoothstep(380.0, 440.0, ue) * step(ue, 470.0);
  LINE = (ue >= 470.0 && ue < 565.0) ? mix(0.80, -0.20, pow((ue - 470.0) / 95.0, 1.5)) : -1.0;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  if (u_layer >= 0.0) {
    vec4 c = finish(layerLin(int(u_layer + 0.5), p));
    fragColor = vec4(c.rgb + dith * c.a, c.a);
    return;
  }
  // front-to-back with early-out once opaque (identical to back-to-front "over")
  vec4 acc = finish(driftLin(p));
  acc += (1.0 - acc.a) * finish(flagsLin(p));
  acc += (1.0 - acc.a) * finish(nearLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(ridgeLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(plumeLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(massifLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(cloudSeaLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(farLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(skyLin(p));
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4) + dith, 1.0);
}
`,
}
