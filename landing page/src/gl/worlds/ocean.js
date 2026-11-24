// Golden Coast: a coastline at golden hour.
// Sky with a low sun and fbm clouds lit from below, an open sea of directional
// waves (Fresnel sky reflection, a Cox-Munk sun glitter path, turquoise
// translucency), breakers rolling onto a beach with a swash loop and wet sand,
// a hazy cliff headland and sea stacks with spray bursts, and gliding gulls.
//
// Everything runs on one master loop (LOOP seconds): every periodic phase is
// quantised to it, so u_time can grow forever without precision loss or pops.

export default {
  id: 'ocean',
  name: 'Golden Coast',
  tag: 'Ocean at golden hour',
  accent: '#f4b04c',
  accent2: '#3cb4a6',
  ink: '#8a4f0c',
  glow: '#ffd9a3',
  light: false,
  clockColor: '#fff5e6',
  sky: 'linear-gradient(180deg,#1f2135 0%,#4a3a4c 30%,#a56a52 44%,#f1b25e 50%,#4c5a58 51%,#2e3433 70%,#3b2f27 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Far headlands', depth: 0.08 },
    { name: 'Open sea', depth: 0.2 },
    { name: 'Sea stacks', depth: 0.3 },
    { name: 'Surf and beach', depth: 0.75 },
    { name: 'Cliffs', depth: 1.0 },
    { name: 'Spray', depth: 1.05 },
    { name: 'Gulls', depth: 1.25 },
  ],
  clockAfter: 2,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float YH = 0.5;        // horizon height on screen
const float FOC = 1.35;      // focal length in screen heights
const float CAMH = 7.0;      // camera height above the sea (m)
const float LOOP = 1440.0;   // master loop (s); every phase is periodic in it
const float PB = 8.0;        // breaker period (s)
const float NB = 180.0;      // LOOP / PB
const float KB = 0.6;        // breaker spacing constant
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float ZSPLIT = 120.0;  // open sea / surf layer split (m)
const float ZMARCH = 170.0;  // ray-marched surf zone limit (m)
const vec2 SUNP = vec2(0.14, 0.565);
const float SUNR = 0.0105;
const vec3 SUNC = vec3(1.0, 0.56, 0.25);
const float EXPO = 1.05;

float Tw;   // wrapped time
float PX;   // one pixel in screen-height units
vec3 SUN;   // sun direction

// ---------------------------------------------------------------- noise
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// value noise periodic in x (period per cells): lets drifting textures wrap with the loop
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

// fractional octave counts: the last octave fades in, missing ones add their mean
float fbm1(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 10; i++) {
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
// x-periodic fbm: a shear keeps every octave periodic (period doubles per octave)
float fbmP(vec2 p, float per, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoiseP(p, per), clamp(oct - fi, 0.0, 1.0));
    p = vec2(2.0 * p.x + 0.73 * p.y, 2.0 * p.y + 5.31);
    per *= 2.0;
    a *= 0.5;
  }
  return s + a;
}
// cloud fbm: x-periodic, billowy (ridged) fine octaves give cauliflower edges
float fbmC(vec2 p, float oct) {
  float s = 0.0, a = 0.5, per = 32.0;
  for (int i = 0; i < 9; i++) {
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

// ---------------------------------------------------------------- colour
float VIG;   // vignette for this pixel (applied in display space by every layer)
vec3 display(vec3 c) {
  c *= EXPO * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
vec4 outL(vec3 lin, float a) { return vec4(display(lin) * a, a); }

// ---------------------------------------------------------------- sky
vec3 skyBase(vec3 rd) {
  float e = max(rd.y, 0.0);
  float mu = dot(rd, SUN);
  vec2 hz = normalize(rd.xz + vec2(0.0, 1e-4));
  float tw = pow(max(dot(hz, normalize(SUN.xz)), 0.0), 14.0);
  vec3 horC = mix(vec3(0.62, 0.30, 0.22), vec3(1.45, 0.78, 0.34), tw);
  vec3 midC = mix(vec3(0.12, 0.075, 0.09), vec3(0.36, 0.19, 0.13), tw);
  vec3 topC = vec3(0.028, 0.032, 0.07);
  vec3 c = mix(horC, midC, smoothstep(0.0, 0.10, e));
  c = mix(c, topC, smoothstep(0.04, 0.30, e));
  float m = max(mu, 0.0);
  c += SUNC * (0.12 * pow(m, 10.0) + 0.6 * pow(m, 80.0) + 2.4 * pow(m, 800.0));
  return c;
}

vec4 clouds(vec3 rd, float octMax) {
  if (rd.y < 0.004) return vec4(0.0);
  float iy = 1.0 / rd.y;
  vec2 uv = rd.xz * iy;
  vec2 p = vec2(uv.x * 0.85, uv.y * 1.15 + 3.0);
  p.x += Tw * (32.0 / LOOP);                     // wind: one noise period per loop
  float fp = PX / FOC * iy * sqrt(iy * 1.44);
  float oct = clamp(log2(0.45 / fp), 1.0, octMax);
  if (octMax > 3.5) {
    vec2 wp = vec2(vnoiseP(p * 0.5, 16.0), vnoiseP(p * 0.5 + vec2(0.0, 5.2), 16.0)) - 0.5;
    p += wp * 0.9;
  }
  float covN = vnoiseP(p * 0.125, 4.0);
  float cov = mix(0.74, 0.47, covN);
  float n = fbmC(p, oct);
  float dens = smoothstep(cov + 0.04, cov + 0.2, n);
  if (dens <= 0.001) return vec4(0.0);
  float occ = octMax > 3.5 ? smoothstep(cov - 0.12, cov + 0.32, fbmP(p + vec2(0.05, 0.32), 32.0, min(oct, 3.0))) : dens;
  float mu = max(dot(rd, SUN), 0.0);
  float ph = 0.3 + 0.7 * pow(mu, 30.0) + 2.4 * pow(mu, 250.0);
  float thin = 1.0 - dens;
  float elev = smoothstep(0.03, 0.3, rd.y);
  vec3 sunL = mix(vec3(1.0, 0.47, 0.18), vec3(0.85, 0.34, 0.30), elev) * 2.4 * (1.0 - 0.66 * elev);
  vec3 col = vec3(0.03, 0.028, 0.05) * (0.6 + 0.4 * thin);
  col += sunL * ph * exp(-1.5 * occ) * (0.3 + 0.7 * thin);
  float hz = 1.0 - exp(-iy * 0.03);
  col = mix(col, skyBase(rd), hz);
  return vec4(col, dens * smoothstep(0.004, 0.04, rd.y));
}

// ---------------------------------------------------------------- land shapes
float farRight(float x, float oct) {
  float t = smoothstep(0.34, 1.3, x);
  float y = 0.072 * t * (0.75 + 0.5 * fbm1(x * 7.0 + 11.0, oct));
  y += 0.010 * smoothstep(0.28, 0.40, x) * (0.6 + 0.8 * fbm1(x * 31.0, oct - 1.0));
  return YH + y - 0.0015;
}
float farLeft(float x, float oct) {
  float t = smoothstep(-0.02, -0.6, x);
  return YH - 0.001 + 0.03 * t * (0.7 + 0.6 * fbm1(x * 6.0 + 3.0, oct));
}
// near headland (left foreground, its tip in the surf ~75 m out)
float nearTop(float x, float oct) {
  float t = -0.40 - x;
  if (t < 0.0) return 0.40 + t * 8.0;
  float y = 0.40 + 0.07 * smoothstep(0.0, 0.025, t) + 0.23 * (1.0 - exp(-t * 4.5));
  y += 0.05 * (fbm1(x * 5.0 + 3.0, 3.0) - 0.5) * smoothstep(0.0, 0.12, t);
  y += 0.025 * smoothstep(0.08, 0.1, t) * smoothstep(0.2, 0.17, t);
  y += 0.016 * (fbm1(x * 22.0 + 1.0, oct) - 0.5) * smoothstep(0.0, 0.03, t);
  y += 0.006 * (fbm1(x * 75.0 + 4.0, oct - 1.5) - 0.5) * smoothstep(0.0, 0.02, t);
  return y;
}
float nearFoot(float x, float oct) {
  float t = -0.40 - x;
  return 0.37 - 0.70 * t + 0.16 * t * t + 0.04 * (fbm1(x * 9.0 + 9.0, 3.0) - 0.5) + 0.024 * (fbm1(x * 30.0 + 2.0, oct) - 0.5);
}
// mid headland (~350 m out), hazier, with its feet in the sea
const float MIDB = 0.473;
float midTop(float x, float oct) {
  float t = -0.215 - x;
  if (t < 0.0) return MIDB + t * 6.0;
  float y = MIDB + 0.07 * smoothstep(0.0, 0.045, t) + 0.035 * (1.0 - exp(-t * 4.0));
  y += 0.022 * (fbm1(x * 7.0 + 8.0, 3.0) - 0.5) * smoothstep(0.0, 0.08, t);
  y += 0.006 * (fbm1(x * 40.0, oct) - 0.5) * smoothstep(0.0, 0.02, t);
  return y;
}
float cliffTop(float x, float oct) { return max(nearTop(x, oct), midTop(x, oct)); }

// ---------------------------------------------------------------- sea
float shoreZ(float x) { return 38.0 + 0.05 * x + 4.0 * (vnoise1(x * 0.03 + 2.0) - 0.5); }
float wig(float x) { return 0.10 * sin(x * 0.06 + 1.0) + 0.06 * sin(x * 0.17 + 2.3); }
float seaEnv(float r) { return smoothstep(-0.5, 3.0, r) * (0.6 + 0.4 * smoothstep(10.0, 90.0, r)); }

// breaking waves: (height, foam density, lip translucency, wave coordinate u)
// and the analytic height gradient
vec4 breaker(vec2 xz, out vec2 grad) {
  grad = vec2(0.0);
  float x = xz.x;
  float r = xz.y - shoreZ(x);
  if (r < -1.0 || r > 150.0) return vec4(0.0);
  float wg = wig(x);
  float sq = sqrt(r + 3.0);
  float u = KB * sq + Tw / PB + wg;
  float n = floor(u), fr = u - n;
  float id = mod(n, NB);
  float hs = h11(id * 1.37 + 0.5);
  float sc = (n + 0.3 - Tw / PB - wg) / KB;
  float rc = sign(sc) * sc * sc - 3.0;           // crest distance from the shore
  float rb = 17.0 + 13.0 * hs + 12.0 * (vnoise1(x * 0.11 + id * 3.1) - 0.5);
  float sh = clamp(1.0 - (rc - rb) / 45.0, 0.0, 1.0);
  float brk = smoothstep(rb + 0.5, rb - 3.0, rc);
  float b = clamp((rb - rc) / rb, 0.0, 1.0);
  float A0 = (1.0 + 1.1 * hs) * (0.5 + 0.9 * vnoise1(x * 0.17 + id * 7.7));
  float A = A0 * (0.25 + 0.75 * pow(sh, 1.3)) * mix(1.0, 0.14, pow(b, 1.1));
  float c = mix(0.48, 0.16, sh);
  c = mix(c, 0.09, brk);
  float y, dy;
  if (fr < c) {
    float pw = mix(1.3, 3.0, sh), tt = fr / c;
    y = pow(tt, pw);
    dy = pw / c * pow(tt, pw - 1.0);
  } else {
    float t = 1.0 - (fr - c) / (1.0 - c);
    y = t * t * (3.0 - 2.0 * t);
    dy = -6.0 * t * (1.0 - t) / (1.0 - c);
  }
  float m = smoothstep(-0.8, 1.5, r);
  float H = A * y * m;
  float dudz = KB / (2.0 * sq);
  float dudx = -dudz * 0.05 + 0.006 * cos(x * 0.06 + 1.0) + 0.0102 * cos(x * 0.17 + 2.3);
  grad = A * dy * m * vec2(dudx, dudz);
  float cover = clamp(0.2 + 3.5 * b, 0.0, 1.0);
  float ff = fr < c ? smoothstep(1.0 - cover - 0.15, 1.0 - cover + 0.1, y) * smoothstep(0.0, 0.2, fr / c) : 0.0;
  float ft = fr >= c ? exp(-(fr - c) / (0.05 + 0.12 * b)) * (1.0 - smoothstep(0.6, 1.0, fr)) : 0.0;
  float foam = brk * max(ff, ft) * (1.0 - 0.55 * b);
  foam = max(foam, (1.0 - brk) * smoothstep(0.85, 1.0, sh) * smoothstep(0.8, 1.0, y) * 0.7);
  float lip = (1.0 - brk) * sh * sh * smoothstep(0.6, 1.0, y) * (fr < c ? 1.0 : 0.35);
  return vec4(H, foam, lip, u);
}

// wave set: (direction, wavenumber, amplitude), wavelengths 34 m down to 6 cm,
// spreading wider as they shorten; WM = angular frequency in cycles per loop
// (deep-water dispersion, quantised so every wave is periodic in LOOP)
const vec4 WV[22] = vec4[22](
  vec4(0.27930, -0.96020, 0.18480, 0.28900),
  vec4(0.04111, -0.99915, 0.24973, 0.21386),
  vec4(-0.38113, -0.92452, 0.33747, 0.15826),
  vec4(0.44477, -0.89564, 0.45604, 0.11711),
  vec4(-0.46478, -0.88543, 0.61627, 0.08666),
  vec4(0.24854, -0.96862, 0.83280, 0.06413),
  vec4(0.32465, -0.94584, 1.12541, 0.04746),
  vec4(-0.64408, -0.76496, 1.52082, 0.03512),
  vec4(-0.56348, -0.82613, 2.05517, 0.02599),
  vec4(0.72087, -0.69307, 2.77725, 0.01923),
  vec4(0.08486, -0.99639, 3.75304, 0.01423),
  vec4(-0.73196, -0.68135, 5.07168, 0.01053),
  vec4(-0.62706, -0.77897, 6.85362, 0.00779),
  vec4(-0.25578, -0.96673, 9.26165, 0.00577),
  vec4(-0.17845, -0.98395, 12.51575, 0.00427),
  vec4(-0.72239, -0.69149, 16.91318, 0.00316),
  vec4(-0.66783, -0.74431, 22.85564, 0.00234),
  vec4(0.86240, -0.50623, 30.88600, 0.00173),
  vec4(-0.33841, -0.94100, 41.73784, 0.00128),
  vec4(-0.56676, -0.82388, 56.40249, 0.00095),
  vec4(-0.69233, -0.72158, 76.21958, 0.00070),
  vec4(-0.99811, -0.06153, 102.99943, 0.00052));
const float WM[22] = float[22](309.0, 359.0, 417.0, 485.0, 564.0, 655.0, 762.0, 885.0, 1029.0, 1196.0, 1391.0, 1617.0, 1879.0, 2185.0, 2539.0, 2952.0, 3432.0, 3989.0, 4637.0, 5391.0, 6267.0, 7285.0);
float WT[22];   // per-frame phase of each wave
void initWaves() {
  for (int i = 0; i < 22; i++) WT[i] = TAU * fract(WM[i] * Tw / LOOP) - float(i) * 1.7;
}

// directional waves: sharp-crested exp(sin) profiles with drag
float seaGeo(vec2 pos) {
  float h = 0.0;
  vec2 pp = pos;
  for (int i = 0; i < 3; i++) {
    vec4 w = WV[i];
    float ph = w.z * dot(w.xy, pp) - WT[i];
    float e = exp(sin(ph) - 1.0);
    h += 2.0 * w.w * (e - 0.31);
    pp += w.xy * (2.0 * w.w * e * cos(ph)) * 0.45;
  }
  return h;
}
// full detail: gradient, filtered slope variance, height. Waves smaller than
// the pixel footprint fade out and hand their slope variance to the specular.
vec4 seaDetail(vec2 pos, vec2 fp) {
  vec2 g = vec2(0.0);
  float var = 0.0, h = 0.0;
  vec2 pp = pos;
  for (int i = 0; i < 22; i++) {
    vec4 wv = WV[i];
    float sv = 0.8 * wv.w * wv.w * wv.z * wv.z;
    float w = smoothstep(1.5, 3.5, TAU / wv.z / max(length(wv.xy * fp), 1e-5));
    if (w <= 0.0) { var += sv * (22.0 - float(i)); break; }
    float ph = wv.z * dot(wv.xy, pp) - WT[i];
    float e = exp(sin(ph) - 1.0);
    float dh = 2.0 * wv.w * e * cos(ph);
    h += w * 2.0 * wv.w * (e - 0.31);
    g += w * dh * wv.z * wv.xy;
    var += (1.0 - w) * sv;
    pp += wv.xy * dh * 0.45 * w;
  }
  return vec4(g, var, h);
}
float Hgeo(vec2 xz) {
  float r = xz.y - shoreZ(xz.x);
  vec2 gd;
  return (breaker(xz, gd).x + seaEnv(r) * seaGeo(xz)) * smoothstep(ZMARCH, ZMARCH - 50.0, xz.y);
}

// Voronoi border distance (F2 - F1), periodic in x with period per
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
// foam: solid where dense, a bubbly net where thin. aa = pixel footprint in cells.
float foamPat(vec2 p, float per, float fd, float aa) {
  if (fd < 0.01) return 0.0;
  float wn = vnoiseP(p * 0.5, per * 0.5);
  float wn2 = vnoiseP(p * 0.5 + vec2(0.0, 9.3), per * 0.5);
  p += (vec2(wn, wn2) - 0.5) * 1.3;
  fd = clamp(fd + 0.45 * (wn - 0.5) * fd, 0.0, 1.0);
  float e1 = vorEdge(p, per);
  float e2 = vorEdge(p * 2.0 + vec2(0.0, 3.7), per * 2.0);
  float lw = (0.02 + 0.55 * fd * fd) * (0.5 + wn2);
  float net = smoothstep(lw + aa, lw - aa, e1);
  float fine = smoothstep(lw * 0.8 + 2.0 * aa, lw * 0.8 - 2.0 * aa, e2);
  float f = max(net, fine * 0.8) * smoothstep(0.0, 0.12, fd);
  return clamp(max(f, smoothstep(0.72, 0.95, fd)), 0.0, 1.0);
}

// swash on the beach: (water cover, foam density, wetness, film depth);
// fo returns the foam-texture offset (it rides up and back with the water)
float runup(float id, float x) { return (2.5 + 5.0 * h11(id * 1.37 + 0.5)) * (0.8 + 0.4 * vnoise1(x * 0.05 + id * 7.7)); }
float swEdge(float phi) {
  if (phi < 0.3) { float t = 1.0 - phi / 0.3; return 1.0 - t * t; }
  return pow(1.0 - (phi - 0.3) / 0.7, 1.6);
}
float dryTime(float up, float Rc) { return 0.3 + 0.7 * (1.0 - pow(clamp(up / Rc, 0.0, 1.0), 1.0 / 1.6)); }
vec4 swash(float x, float up, float fz, out vec2 fo) {
  float ph = Tw / PB - (0.09 - wig(x) - KB * 1.7320508);
  float n = floor(ph), phi = ph - n;
  float idc = mod(n, NB), idp = mod(n - 1.0, NB);
  float Rc = runup(idc, x) + (vnoise1(x * 1.1 + idc * 5.3) - 0.5) * 1.3 + (vnoise1(x * 3.7 + idc * 2.1) - 0.5) * 0.45;
  float Rp = runup(idp, x) + (vnoise1(x * 1.1 + idp * 5.3) - 0.5) * 1.3 + (vnoise1(x * 3.7 + idp * 2.1) - 0.5) * 0.45;
  float eNow = swEdge(phi) * Rc;
  float d = eNow - up;
  float cover = smoothstep(-fz, fz, d) * step(0.0, eNow);
  // drying: time since the backwash uncovered this point (this cycle and the last)
  float wet = 0.0, rem = 0.0;
  if (up > 0.0 && up < Rc) {
    float pr = dryTime(up, Rc);
    if (phi > pr) { wet = exp(-(phi - pr) * 3.2); rem = exp(-(phi - pr) * 5.0); }
  }
  if (up > 0.0 && up < Rp) wet = max(wet, exp(-(phi + 1.0 - dryTime(up, Rp)) * 3.2));
  wet = max(max(wet, cover), smoothstep(2.2, 0.0, up));
  float lead = exp(-max(d, 0.0) / (0.3 + 1.2 * phi)) * cover;
  float foam = lead * mix(0.95, 0.5, smoothstep(0.3, 0.9, phi)) + cover * 0.18 * (1.0 - phi) + rem * 0.45;
  fo = vec2(idc * 3.7, -eNow * 0.85 + idc * 1.3);
  return vec4(cover, clamp(foam, 0.0, 1.0), wet, max(d, 0.0));
}

// sky as seen in a mirror, with the land silhouettes reflected
vec3 skyRefl(vec3 R) {
  R.y = max(R.y, 0.0015);
  vec3 c = skyBase(R);
  vec4 cl = clouds(R, 2.0);
  c = mix(c, cl.rgb, cl.a);
  if (R.z > 0.05) {
    vec2 rs = vec2(R.x / R.z * FOC, YH + R.y / R.z * FOC);
    float far = YH + max(0.072 * smoothstep(0.34, 1.3, rs.x), 0.03 * smoothstep(-0.02, -0.6, rs.x));
    float hz = smoothstep(0.0, 0.006, far - rs.y);
    c = mix(c, c * 0.55 + vec3(0.03, 0.02, 0.025), hz * 0.7);
    float tn = -0.40 - rs.x, tm = -0.215 - rs.x;
    float land = max(tn < 0.0 ? 0.40 + tn * 8.0 : 0.47 + 0.23 * (1.0 - exp(-tn * 4.5)),
                     tm < 0.0 ? MIDB + tm * 6.0 : MIDB + 0.07 * smoothstep(0.0, 0.045, tm) + 0.035 * (1.0 - exp(-tm * 4.0)));
    float cm = smoothstep(-0.004, 0.012, land - rs.y);
    c = mix(c, vec3(0.03, 0.022, 0.02), cm);
  }
  return c;
}

vec3 foamLight(vec3 rd) {
  float fwd = pow(max(dot(rd, SUN), 0.0), 6.0);
  return vec3(0.9, 0.88, 0.85) * (SUNC * (0.22 + 0.55 * fwd) + vec3(0.17, 0.15, 0.18));
}

vec3 glint(vec3 n, vec3 V, float ndv, float var, float E) {
  vec3 Hh = normalize(SUN + V);
  float cb = max(dot(Hh, n), 1e-3);
  float c2 = cb * cb;
  float D = exp(-(1.0 - c2) / (c2 * var)) / (PI * var * c2 * c2);
  float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  return min(SUNC * E * Fh * D / (4.0 * ndv), vec3(40.0));
}

// pebbles with long shadows toward the camera: (shadow, coverage, sunward rim)
vec4 pebbles(vec2 sp, float fx, float fz, float z) {
  float tall = 0.7 * z / CAMH;   // a pebble's height seen at a grazing angle, as ground depth
  float cs = 0.8;
  vec2 c0 = floor(sp / cs);
  vec2 sd = normalize(SUN.xz);
  float shadow = 0.0, cov = 0.0, rim = 0.0, shell = 0.0;
  float dens = 0.15 * smoothstep(0.35, 0.8, vnoise(sp * 0.13 + 4.0));
  if (dens <= 0.0) return vec4(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 cc = c0 + vec2(float(i), float(j));
      if (h12(cc + 13.1) > dens) continue;
      vec2 o = h22(cc + 7.3);
      vec2 d = sp - (cc + 0.15 + 0.7 * o) * cs;
      float isShell = step(0.5, h12(cc + 2.7));
      float rad = (0.02 + 0.06 * o.x * o.y) * mix(1.0, 0.7, isShell);
      float along = -dot(d, sd);
      float perp = d.x * sd.y - d.y * sd.x;
      float L = rad * mix(13.0, 5.0, isShell);
      float wdt = rad * 0.8 * (1.0 - 0.7 * clamp(along / L, 0.0, 1.0));
      float pen = fx + along * 0.04;
      shadow = max(shadow, smoothstep(pen, -pen, abs(perp) - wdt) * smoothstep(-fz, fz, along) * smoothstep(L + fz, 0.0, along));
      vec2 e = vec2(d.x, d.y > 0.0 ? d.y / (1.0 + tall * mix(1.0, 0.25, isShell)) : d.y * 1.2) / rad;
      float pc = smoothstep(fx / rad, -fx / rad, length(e) - 1.0);
      if (pc > cov) { cov = pc; rim = smoothstep(0.3, 0.95, e.y); shell = isShell; }
    }
  }
  return vec4(shadow, cov, rim, shell);
}

vec3 shadeBeach(vec3 pos, vec3 rd, float fx, float fz) {
  float x = pos.x;
  float up = shoreZ(x) - pos.z;
  vec2 fo;
  vec4 sw = swash(x, up, fz, fo);
  vec2 sp = pos.xz;
  float fg = sqrt(fx * fz);
  vec3 und = fbmD(sp * vec2(0.15, 0.25), 3.0);
  float big = und.x;
  vec3 alb = vec3(0.44, 0.34, 0.25) * (0.78 + 0.44 * big);
  // large-scale tone: damp darker patches, drier lighter ridges
  float damp = smoothstep(0.45, 0.72, vnoise(sp * vec2(0.07, 0.12) + 3.0) + 0.25 * smoothstep(12.0, 4.0, up));
  alb *= mix(1.0, 0.7, damp) * (0.92 + 0.2 * smoothstep(0.55, 0.8, big));
  alb *= 0.85 + 0.3 * fbm(sp * 9.0, clamp(log2(0.11 / fg), 0.0, 3.0));
  // a shallow runnel left by the tide: still water mirroring the sky
  float rn1 = vnoise(vec2(x * 0.09, 1.3)), rn2 = vnoise(vec2(x * 0.13, 7.1));
  float pool = min(up - 3.4 - 1.2 * rn1, 6.4 + 1.0 * rn2 - up) - 3.0 * smoothstep(0.6, 0.35, vnoise(vec2(x * 0.045, 3.7)));
  float poolA = smoothstep(-fz, fz, pool);
  float wetA = max(sw.z, smoothstep(-1.2, 0.0, pool));
  // wind ripples on the dry sand, filtered by footprint
  float rl = 0.16;
  float rw = smoothstep(2.0, 5.0, rl / fz) * (1.0 - wetA) * (1.0 - 0.6 * damp) * smoothstep(0.35, 0.65, big);
  vec2 rg = vec2(0.0);
  float trough = 1.0;
  if (rw > 0.0) {
    // asymmetric wind ripples: gentle stoss, steep lee; lee slopes facing away
    // from the low sun fall into shadow
    float rph = (sp.y + 0.35 * sp.x + 2.2 * fbm(sp * 0.35, 2.0)) * TAU / rl;
    float sl = (cos(rph) + 0.45 * cos(2.0 * rph)) * 0.11 * rw;
    rg = vec2(0.35, 1.0) * sl;
    trough = mix(1.0, 0.25, smoothstep(0.01, 0.06, -sl) * rw);
  }
  rg += und.yz * vec2(0.15, 0.25) * 0.12 * (1.0 - wetA);
  vec3 n = normalize(vec3(-rg.x, 1.0, -rg.y));
  vec3 V = -rd;
  vec3 amb = vec3(0.11, 0.085, 0.085);
  float ndl = max(dot(n, SUN), 0.0);
  // pebbles with long shadows (close range only)
  vec4 peb = fx < 0.04 ? pebbles(sp, fx, fz, pos.z) : vec4(0.0);
  float sun = (1.0 - 0.6 * peb.x * (1.0 - sw.x) * (1.0 - poolA)) * trough;
  // a trail of footprints across the dry sand: shadowed hollows with a lit far lip
  float xt = -6.0 + 0.55 * (sp.y - 19.0) + 0.6 * sin(sp.y * 0.25);
  if (up > 8.5 && abs(sp.x - xt) < 0.5 && fx < 0.03) {
    float k0 = floor((sp.y - 19.0) / 0.72 + 0.5);
    for (int i = -1; i <= 1; i++) {
      float k = k0 + float(i);
      float zc = 19.0 + k * 0.72;
      vec2 c = vec2(-6.0 + 0.55 * (zc - 19.0) + 0.6 * sin(zc * 0.25) + (mod(k, 2.0) * 2.0 - 1.0) * 0.13 + 0.03 * (h11(k) - 0.5), zc);
      vec2 l = (sp - c) / vec2(0.09, 0.2);
      float rl2 = dot(l, l);
      float fade = smoothstep(0.85, 0.3, h11(k * 3.1)) * (1.0 - wetA);   // some prints are blurred away
      float hollow = smoothstep(1.0 + fx * 20.0, 0.7, rl2) * fade;
      float lip = smoothstep(0.6, 0.95, l.y) * smoothstep(1.6, 1.0, rl2) * smoothstep(0.8, 1.0, rl2) * fade;
      sun *= 1.0 - 0.85 * hollow;
      rg.y -= lip * 0.25;
    }
  }
  n = normalize(vec3(-rg.x, 1.0, -rg.y));
  ndl = max(dot(n, SUN), 0.0);
  vec3 col = alb * (SUNC * 3.4 * ndl * sun + amb * (1.0 - 0.35 * peb.x));
  col += alb * SUNC * 0.08 * pow(max(dot(rd, SUN), 0.0), 30.0) * sun;
  vec3 pc = mix(vec3(0.2, 0.17, 0.14), vec3(0.55, 0.48, 0.42), peb.w) * (amb * 1.3 + SUNC * 2.2 * peb.z);
  col = mix(col, pc, peb.y * (1.0 - wetA));
  // wrack line of dried weed at the last high tide
  float wl = 10.5 + 1.4 * sin(x * 0.08 + 1.0) + 1.2 * (vnoise1(x * 0.3) - 0.5);
  if (abs(up - wl) < 1.8) {
    float wrack = exp(-pow((up - wl) / 0.45, 2.0)) * smoothstep(0.56, 0.64, fbm(sp * vec2(9.0, 12.0), clamp(log2(0.11 / fg), 1.0, 5.0)));
    col = mix(col, vec3(0.026, 0.019, 0.011) * (0.7 + 0.6 * peb.z) + SUNC * 0.015, wrack);
  }
  // wet sand, swash film and runnel: dark, glossy, mirroring the sky
  if (wetA > 0.002) {
    float film = max(sw.x, poolA);
    vec2 wg = (vec2(vnoise(sp * 1.7), vnoise(sp * 1.7 + 7.0)) - 0.5) * mix(0.025, 0.008, poolA);
    vec3 nw = normalize(vec3(wg.x, 1.0, wg.y));
    float ndv = max(dot(nw, V), 0.02);
    float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec3 refl = skyRefl(reflect(rd, nw));
    vec3 under = alb * 0.42 * (SUNC * 2.2 * ndl + amb);
    under = mix(under, under * vec3(0.75, 1.0, 0.95) + vec3(0.0, 0.012, 0.012), film * smoothstep(0.0, 0.3, max(sw.w, pool)));
    float var = mix(0.03, mix(0.004, 0.0015, poolA), film);
    vec3 wetC = mix(under, refl, F * mix(0.75, 1.0, film)) + glint(nw, V, ndv, var, 0.12) * sun;
    col = mix(col, wetC, wetA);
  }
  // foam lace riding the swash
  if (sw.y > 0.01) {
    float aa = 0.7 * sqrt(fx * 1.3 * fz * 2.2) + 0.02;
    float foam = foamPat(vec2(x * 1.3, up * 2.2) + fo * vec2(1.0, 2.2), 1e5, sw.y, aa);
    col = mix(col, foamLight(rd) * 0.85, foam);
  }
  return col;
}

vec3 shadeWater(vec3 pos, vec3 rd, float z, float r, vec2 fp) {
  vec2 bg;
  vec4 br = breaker(pos.xz, bg);
  vec4 sd = seaDetail(pos.xz, fp);
  float env = seaEnv(r);
  vec2 g = sd.xy * env + bg;
  float var = sd.z * env * env + 0.0008 + 0.02 * smoothstep(60.0, 5.0, r);
  // streaks on steep wave faces (water drawn up the face), in (x, height) space
  float steep = smoothstep(0.4, 1.2, bg.y);
  if (steep > 0.0) {
    vec3 st = fbmD(vec2(pos.x * 2.2, br.x * 5.0 - br.w * 3.0), clamp(log2(0.4 / (fp.x * 2.2)), 1.0, 5.0));
    g.x += st.y * 2.2 * 0.25 * steep;
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = -rd;
  float ndv = dot(n, V);
  if (ndv < 0.03) { n = normalize(n + V * (0.03 - ndv)); ndv = 0.03; }
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(rd, n);
  R = normalize(R + vec3(0.0, sqrt(var) * 0.9, 0.0));   // unresolved slopes face the viewer: higher, darker sky
  vec3 refl = skyRefl(R);
  vec3 spec = glint(n, V, ndv, var, 0.2);
  // body: deep green-blue, light transmitted through the backlit wave faces
  float hgt = br.x + sd.w * env;
  float mu = max(dot(rd, SUN), 0.0);
  float fwd = 0.25 + 0.75 * pow(mu, 40.0);
  vec3 body = vec3(0.006, 0.024, 0.032) * (1.0 + 0.5 * fwd);
  float thick = smoothstep(0.0, 1.8, hgt);
  float face = clamp(0.4 - n.z * 1.8, 0.0, 1.0);
  body += vec3(0.06, 0.30, 0.20) * SUNC * (0.07 * thick * thick + 1.0 * br.z) * fwd * (0.35 + 0.65 * face);
  // shallow water at the beach shows the sand
  vec3 sandW = vec3(0.46, 0.33, 0.21) * 0.42 * vec3(0.21, 0.17, 0.16) * 2.2;
  body = mix(body, sandW, (1.0 - smoothstep(0.0, 7.0, r)) * 0.75);
  vec3 col = mix(body, refl, F);
  // foam: breaking whitewater, residual surf-zone lace, sparse whitecaps
  float fd = br.y;
  float foam, fshade = 1.0;
  if (r < 150.0) {
    // whitewater: billowy fbm mass, streaked along the crest, drifting with the wave
    float dudz = KB / (2.0 * sqrt(max(r, 0.0) + 3.0));
    // grazing view: stretch the texture across x so the pixel footprint is
    // isotropic in texture space (fine detail across, no aliasing along z);
    // u stays unscaled so the texture remains periodic in the loop
    float fzc = fp.y * 22.0 * dudz, fxc = fp.x * 3.0;
    float an = clamp(sqrt(fxc / fzc), 0.5, 1.0);
    vec2 fq = vec2(br.w * 22.0 + br.x * 8.0, pos.x * 3.0 / an);
    float fpc = max(fzc, fxc / an);          // filter by the larger footprint
    vec2 fq0 = fq;
    fq += (vec2(vnoiseP(fq * 0.5, NB * 11.0), vnoiseP(fq * 0.5 + vec2(0.0, 7.7), NB * 11.0)) - 0.5) * 1.6;
    float tex = fbmP(fq, NB * 22.0, clamp(log2(0.5 / (fpc + 1e-4)), 1.0, 5.5));
    // fresh whitewater: the threshold widens as detail is filtered away, so
    // sub-pixel foam averages to its coverage instead of forming blocks
    float fw = br.y * (0.95 + 0.3 * vnoiseP(vec2(br.w * 3.0, pos.x * 0.4 / an), NB * 3.0));
    float lw = 0.07 + 0.8 * fpc;
    float white = smoothstep(1.0 - fw - lw, 1.0 - fw + lw, tex) * smoothstep(0.0, 0.1, fw);
    // thinning, dissipating whitewater breaks up into a bubbly net
    if (fw > 0.03 && fw < 0.85) {
      float net = foamPat(fq0 * vec2(0.5, 0.35), NB * 11.0, fw * 1.15, fpc * 0.5 + 0.02);
      white = mix(net, white, smoothstep(0.55, 0.85, fw));
    }
    // residual lace left by earlier waves: a Voronoi net, footprint-filtered
    // residual lace left by earlier waves on the flatter water: filaments along
    // the ridges of the same texture, fading to their mean coverage when sub-pixel
    float fres = smoothstep(45.0, 6.0, r) * smoothstep(-1.0, 1.5, r) * smoothstep(0.6, 0.85, n.y);
    float ridge = 1.0 - abs(2.0 * tex - 1.0);
    float lace = fres * mix(smoothstep(0.8, 0.93, ridge) * smoothstep(0.3, 0.6, vnoiseP(fq * 0.25, NB * 5.5)), 0.12, smoothstep(0.08, 0.35, fpc));
    foam = max(white, lace * 0.7);
    // billows: lit tops, shadowed fronts (the sun is behind the wave)
    fshade = (0.84 + 0.22 * smoothstep(0.25, 0.85, tex)) * (0.72 + 0.28 * clamp(n.y * 1.6 - 0.45, 0.0, 1.0));
  } else {
    float wc = smoothstep(0.42, 0.62, sd.w) * smoothstep(0.55, 0.8, vnoise(pos.xz * 0.06)) * 0.8;
    foam = foamPat(pos.xz * vec2(0.35, 0.6), 1e5, wc, 0.7 * sqrt(fp.x * 0.35 * fp.y * 0.6) + 0.02);
  }
  col = mix(col, foamLight(rd) * fshade, foam);
  spec *= 1.0 - foam;
  // aerial perspective
  vec3 hzC = skyBase(normalize(vec3(rd.x, 0.0015, rd.z)));
  float fog = 1.0 - exp(-z / 3800.0);
  return mix(col, hzC, fog) + spec * (1.0 - 0.5 * fog);
}

// cheap shade of a wave crest top, for blending across silhouettes
vec3 crestColor(vec3 pos, vec3 rd) {
  vec2 bg;
  vec4 br = breaker(pos.xz, bg);
  vec3 n = normalize(vec3(-bg.x, 1.0, -bg.y));
  float ndv = max(dot(n, -rd), 0.03);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  float fwd = 0.25 + 0.75 * pow(max(dot(rd, SUN), 0.0), 40.0);
  vec3 body = vec3(0.006, 0.024, 0.032) + vec3(0.06, 0.30, 0.20) * SUNC * (0.07 + 1.0 * br.z) * fwd;
  vec3 c = mix(body, skyBase(normalize(reflect(rd, n) + vec3(0.0, 0.05, 0.0))), F);
  return mix(c, foamLight(rd) * 0.85, smoothstep(0.2, 0.7, br.y));
}

// water + beach surface for a (parallax-warped) screen point below the horizon
vec3 surface(vec2 q) {
  initWaves();
  float dy = max(YH - q.y, 0.25 * PX);
  vec3 rd = normalize(vec3(q.x, -dy, FOC));
  float sl = dy / FOC;
  float zP = CAMH / sl;
  float z = zP;
  float rmin = 1e9, zm = 0.0, gm = 0.0;
  // only the surf zone is ray-marched; beyond it the open sea is a plane
  // shaded with full-detail normals
  if (zP < 600.0) {
    float zB = min((CAMH + 0.5) / sl, ZMARCH);
    float zA = max((CAMH - 3.0) / sl, 30.0);
    if (zB > max(zA, 33.0)) {
      float minSt = (zB - zA) / 10.0;
      float zc = zA;
      float gc = CAMH - sl * zc - Hgeo(vec2(q.x * zc / FOC, zc));
      float gp = 1e9, pxk = FOC / PX;
      z = zB;
      for (int i = 0; i < 14; i++) {
        float zn = zc + max(gc / (sl + 0.5), minSt);
        if (zn >= zB) { z = zP; break; }
        float gn = CAMH - sl * zn - Hgeo(vec2(q.x * zn / FOC, zn));
        // a crest passed just under the ray: remember the closest one (clearance
        // in pixels) to anti-alias the wave's silhouette
        float ratio = gc * pxk / zc;
        if (ratio < rmin && gn > gc && gc < gp) { rmin = ratio; zm = zc; gm = gc; }
        if (gn < 0.0) {
          float lo = zc, hi = zn, glo = gc, ghi = gn;
          for (int j = 0; j < 3; j++) {
            float mid = 0.5 * (lo + hi);
            float gm = CAMH - sl * mid - Hgeo(vec2(q.x * mid / FOC, mid));
            if (gm > 0.0) { lo = mid; glo = gm; } else { hi = mid; ghi = gm; }
          }
          z = lo + (hi - lo) * glo / max(glo - ghi, 1e-6);   // final secant step
          break;
        }
        gp = gc;
        zc = zn;
        gc = gn;
        z = zP;
      }
    }
  }
  z = min(z, 6700.0);
  vec3 pos = vec3(q.x * z / FOC, CAMH - sl * z, z);
  float fx = z * PX / FOC;
  float fz = fx * z / max(CAMH - pos.y, 0.3);
  float r = pos.z - shoreZ(pos.x);
  vec2 fp = vec2(fx, fz);
  vec3 col;
  if (r < -fz) col = shadeBeach(pos, rd, fx, fz);
  else {
    col = shadeWater(pos, rd, z, r, fp);
    if (r < fz) col = mix(shadeBeach(pos, rd, fx, fz), col, smoothstep(-fz, fz, r));
  }
  // silhouette anti-aliasing: blend in the crest the ray grazed, by coverage
  float cov = 0.5 * (1.0 - smoothstep(0.0, 1.0, rmin));
  if (cov > 0.01) {
    vec3 pc = vec3(q.x * zm / FOC, CAMH - sl * zm - gm, zm);
    col = mix(col, crestColor(pc, rd), cov);
  }
  return col;
}
float surfDepth(float y) { return 0.06 + pow(clamp((YH - y) / YH, 0.0, 1.0), 0.85); }

// ---------------------------------------------------------------- layers
vec4 layerSky(vec2 p) {
  vec3 rd = normalize(vec3(p.x, p.y - YH, FOC));
  vec3 c = skyBase(rd);
  vec2 d = (p - SUNP) * vec2(1.0, 1.1);
  float r = length(d);
  float disk = smoothstep(SUNR + PX, SUNR - PX, r);
  float limb = sqrt(max(1.0 - r * r / (SUNR * SUNR), 0.0));
  c += disk * vec3(1.0, 0.66, 0.34) * 12.0 * (0.6 + 0.4 * limb);
  c += SUNC * 1.4 * exp(-r / 0.012);
  vec4 cl = clouds(rd, 6.0);
  c = mix(c, cl.rgb, cl.a);
  return outL(c, 1.0);
}

vec4 layerFar(vec2 p) {
  vec2 q = p + u_par * PAR * 0.08;
  if (q.y > YH + 0.1 || q.y < YH - 0.02) return vec4(0.0);
  float oct = octFor(7.0);
  float yr = farRight(q.x, oct), yl = farLeft(q.x, oct);
  float ar = smoothstep(-PX, PX, yr - q.y), al = smoothstep(-PX, PX, yl - q.y);
  float a = max(ar, al);
  if (a <= 0.0) return vec4(0.0);
  vec3 rd = normalize(vec3(q.x, 0.0015, FOC));
  vec3 hz = skyBase(rd);
  vec3 rock = vec3(0.05, 0.035, 0.045);
  // nearer right headland: less haze, warm rim on the ridge
  float tr = fbm(q * vec2(60.0, 140.0), 4.0);
  vec3 cr = mix(rock * (0.7 + 0.6 * tr), hz, 0.52);
  cr += SUNC * 0.35 * exp(-(yr - q.y) / 0.002) * smoothstep(0.9, 0.5, q.x);
  vec3 cL = mix(rock, hz, 0.74);
  vec3 c = ar >= al ? cr : cL;
  return outL(c, a);
}

// three sea stacks off the right shore, ~700 m out
vec4 layerStacks(vec2 p) {
  vec2 q = p + u_par * PAR * 0.3;
  if (q.x < 0.33 || q.x > 0.66 || q.y > YH + 0.13 || q.y < YH - 0.02) return vec4(0.0);
  float base = YH - CAMH * FOC / 700.0;
  float a = 0.0, edge = 1.0, side = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x0 = fi == 0.0 ? 0.39 : fi == 1.0 ? 0.462 : 0.538;
    float hw = fi == 0.0 ? 0.012 : fi == 1.0 ? 0.023 : 0.010;
    float ht = fi == 0.0 ? 0.058 : fi == 1.0 ? 0.105 : 0.042;
    float t = (q.y - base) / ht;
    float u = (q.x - x0) / hw;
    float w = hw * (1.3 - 0.45 * clamp(t, 0.0, 1.0) + 0.12 * sin(t * 9.0 + fi * 2.0)) * (0.9 + 0.2 * fbm1(q.y * 160.0 + fi * 10.0, 4.0));
    float topY = base + ht * (1.0 - 0.2 * u * u + 0.08 * (fbm1(q.x * 220.0 + fi, 4.0) - 0.5));
    float dx = w - abs(q.x - x0);
    float dd = min(dx, topY - q.y);
    float ai = smoothstep(-PX, PX, dd);
    if (ai > a) { a = ai; edge = dd; side = (q.x - x0) / w; }
  }
  a *= smoothstep(-PX, PX, q.y - base);
  if (a <= 0.0) return vec4(0.0);
  vec3 hz = skyBase(normalize(vec3(q.x, 0.0015, FOC)));
  float tex = fbm(q * vec2(200.0, 520.0), octFor(400.0) - 2.0);
  vec3 rock = vec3(0.045, 0.032, 0.03) * (0.7 + 0.6 * tex);
  rock += SUNC * 0.6 * exp(-edge / 0.0018) * smoothstep(0.3, -0.9, side);   // rim facing the sun
  vec3 c = mix(rock, mix(hz, vec3(dot(hz, vec3(0.33))), 0.4) * 0.6, 0.32);
  // surf wrapping the base
  float pulse = 0.5 + 0.5 * sin(TAU * (Tw / PB) + q.x * 90.0);
  float fo = smoothstep(0.0025 + 0.002 * pulse, 0.0, q.y - base) * (0.6 + 0.4 * fbm(q * vec2(900.0, 300.0), 3.0));
  c = mix(c, foamLight(vec3(0.0, 0.0, 1.0)) * 0.8, fo);
  return outL(c, a);
}

// rock face shading shared by the headlands: dark backlit rock, ribs, strata,
// ambient from the sky behind the camera and warm bounce from the beach
vec3 rockFace(vec2 q, float scale, float side, float dd, bool near) {
  vec2 rp = vec2(q.x * 34.0, q.y * 15.0) * scale;
  vec3 nd = fbmD(rp, clamp(octFor(34.0 * scale) - 0.5, 1.0, 7.0));
  float strata = fbm1(q.y * 120.0 * scale + q.x * 30.0 * scale + nd.x * 3.0, clamp(octFor(120.0 * scale) - 1.0, 1.0, 5.0));
  vec2 tilt = vec2(0.0);
  float crack = 1.0, tone = 0.5;
  if (near) {
    // joints and fractures: thin dark ridged-noise lines, mostly vertical
    vec2 cq = q * vec2(36.0, 11.0) + nd.x * 0.9;
    float c1 = abs(vnoise(cq) * 2.0 - 1.0);
    float c2 = abs(vnoise(q * vec2(110.0, 40.0) + 5.0 + nd.x * 0.6) * 2.0 - 1.0);
    float aaF = PX * 60.0;
    crack = (0.55 + 0.45 * smoothstep(0.0, 0.05 + aaF, c1)) * (0.75 + 0.25 * smoothstep(0.0, 0.06 + 3.0 * aaF, c2));
    tilt = vec2(vnoise(cq * 0.5) - 0.5, 0.0) * 0.6;
    tone = vnoise(q * vec2(9.0, 4.0));
  }
  vec3 n = normalize(vec3(0.25 + tilt.x - nd.y * 0.6, 0.1 + tilt.y * 0.8 + (strata - 0.5) * 0.7 - nd.z * 0.3, -1.0));
  n = normalize(mix(n, normalize(vec3(0.9 - nd.y * 0.4, 0.05, 0.15)), side));
  float ao = (0.35 + 0.65 * smoothstep(0.2, 0.75, nd.x)) * crack;
  vec3 alb = vec3(0.15, 0.11, 0.085) * (0.5 + 1.0 * strata) * (0.75 + 0.5 * tone);
  float gq = octFor(700.0 * scale);
  if (gq > 1.0) alb *= 0.7 + 0.6 * fbm(q * vec2(700.0, 450.0) * scale, gq - 1.0);
  vec3 amb = mix(vec3(0.15, 0.09, 0.06), vec3(0.06, 0.065, 0.11), smoothstep(-0.6, 0.6, n.y));
  // bedding ledges: sky-lit tops over shadowed undercuts
  float ly = q.y * 48.0 * scale + nd.x * 1.2 + q.x * 6.0 * scale + 1.6 * vnoise(q * vec2(9.0, 5.0) * scale);
  float fl = fract(ly), lw = 48.0 * scale * PX * 1.5;
  float ledgeTop = smoothstep(0.93 - lw, 0.93 + lw, fl) * smoothstep(0.42, 0.7, vnoise(q * vec2(40.0, 3.0) * scale + floor(ly)));
  float under = smoothstep(0.22, 0.0, fl) * 0.45;
  vec3 c = alb * (amb * ao * (0.7 + 0.9 * smoothstep(-0.5, 0.5, n.y + n.x * 0.3)) * (1.0 - under) + SUNC * 3.0 * max(dot(n, SUN), 0.0) * (0.4 + 0.6 * ao));
  c += alb * (vec3(0.10, 0.09, 0.13) + SUNC * 0.12) * ledgeTop;
  // shrubs on the brow, lit through from behind
  float shrub = smoothstep(0.012, 0.004, dd) * smoothstep(0.45, 0.6, fbm(q * vec2(260.0, 160.0) * scale, 3.0));
  c = mix(c, vec3(0.03, 0.03, 0.012) + SUNC * 0.05, shrub);
  // backlit rim along the skyline
  c += SUNC * vec3(1.0, 0.85, 0.7) * 0.8 * exp(-dd / 0.0016);
  return c;
}

// near headland: fractal outline, boulder apron, side-lit rock facets
const vec3 LK = vec3(0.86, 0.40, 0.31);   // warm key light grazing the seaward face (normalised)
vec3 boulderShade(vec2 l, float wet, float seed) {
  // l: position in the boulder's unit ellipse
  vec3 n = normalize(vec3(l.x, l.y + 0.15, -sqrt(max(1.0 - dot(l, l), 0.05))));
  vec3 nd = fbmD(l * 3.0 + seed * 7.0, 3.0);
  n = normalize(n + vec3(-nd.y, -nd.z, 0.0) * 0.35);
  float ndl = max(dot(n.xy, LK.xy) + 0.05, 0.0);
  vec3 alb = vec3(0.12, 0.095, 0.078) * (0.6 + 0.8 * nd.x) * mix(1.0, 0.5, wet) * (0.75 + 0.5 * h11(seed * 1.3));
  vec3 amb = mix(vec3(0.14, 0.085, 0.06), vec3(0.06, 0.065, 0.11), smoothstep(-0.6, 0.6, n.y));
  vec3 c = alb * (amb * (0.5 + 0.5 * nd.x) * smoothstep(-1.0, 0.2, l.y) + SUNC * 2.2 * ndl * ndl);
  c += wet * vec3(0.55, 0.36, 0.26) * 0.22 * smoothstep(0.2, 0.9, n.y) ;   // wet sheen of the sky
  return c;
}

vec4 nearCliff(vec2 qn) {
  // coarse reject: well above the skyline (warp and detail add < 0.045)
  if (qn.y > nearTop(qn.x + 0.013, 1.0) + 0.045 && qn.y > nearTop(qn.x - 0.013, 1.0) + 0.045) return vec4(0.0);
  // warp x by a function of y: every edge, including the near-vertical tip, turns fractal
  float octW = octFor(24.0);
  vec2 wq = qn;
  wq.x += 0.02 * (fbm1(qn.y * 22.0 + 3.0, octW) - 0.5) + 0.006 * (fbm1(qn.y * 95.0 + 7.0, octW - 2.0) - 0.5);
  float fN = nearFoot(wq.x, octFor(40.0));
  if (qn.y < fN - 0.06 || qn.y > 0.76) return vec4(0.0);
  float oct = octFor(22.0);
  float e = 0.0015;
  float tn = nearTop(wq.x, oct);
  float sn = (nearTop(wq.x + e, 2.0) - nearTop(wq.x - e, 2.0)) / (2.0 * e);   // slope of the low octaves
  float dN = (tn - qn.y) / sqrt(1.0 + min(sn * sn, 30.0));
  float dF = (qn.y - fN) * 0.82;
  float aC = smoothstep(-PX, PX, dN) * smoothstep(-PX, PX, dF);
  // boulder apron: two rows of cell-tiled boulders along the foot
  float aB = 0.0;
  vec2 bl = vec2(0.0);
  float bseed = 0.0, bwet = 0.0;
  if (qn.x < -0.36 && qn.y < fN + 0.07) {
    for (int row = 0; row < 2; row++) {
      float cw = row == 0 ? 0.026 : 0.024;
      float k0 = floor(qn.x / cw);
      for (int i = -1; i <= 1; i++) {
        float k = k0 + float(i);
        vec2 hh = h22(vec2(k, float(row) * 17.0 + 3.0));
        if (row == 1 && hh.y > 0.4) continue;
        float cx = (k + 0.2 + 0.6 * hh.x) * cw;
        if (cx > -0.405) continue;
        float r = cw * (0.4 + 0.5 * h12(vec2(k, 9.0 + float(row)))) * mix(1.35, 0.85, smoothstep(-0.85, -0.42, cx));
        float cy = nearFoot(cx, 2.0) + (row == 0 ? -r * 0.15 : -r * 0.8 - 0.006);
        vec2 l = (qn - vec2(cx, cy)) / vec2(r, r * (0.55 + 0.3 * hh.y));
        // angular, chipped outline, sampled on the unit circle (no seam)
        vec2 dl = l / max(length(l), 1e-4);
        float rr = 1.0 + 0.32 * (vnoise(dl * 0.9 + k * 3.0) - 0.5) + 0.1 * (vnoise(dl * 3.2 + k * 7.0) - 0.5)
                 + 0.03 * (vnoise(dl * 11.0 + k * 5.0) - 0.5);
        float d = (length(l) - rr) * r * 0.6;
        float ai = smoothstep(PX, -PX, d) * smoothstep(-PX, PX, qn.y - (cy - r * 0.42));
        if (ai > aB) { aB = ai; bl = l / rr; bseed = k + float(row) * 31.0; bwet = float(row); }
      }
    }
  }
  float a = 1.0 - (1.0 - aC) * (1.0 - aB);
  if (a <= 0.0) return vec4(0.0);
  // is the foot in the swash or the sea here? (wet dark rock, foam)
  float zf = CAMH * FOC / max(YH - fN, 0.005);
  float rS = zf - shoreZ(qn.x * zf / FOC);
  float inSea = smoothstep(-2.0, 2.0, rS);
  float wetZone = smoothstep(-9.0, -3.0, rS);
  vec3 c = vec3(0.0);
  if (aC > 0.0) {
    // facets: smooth relief plus ridged creases at two scales (no tiling pattern)
    vec3 big = fbmD(qn * vec2(11.0, 6.0) + 2.0, 3.0);
    vec3 mid = fbmD(qn * vec2(34.0, 19.0) + big.x * 1.3, clamp(octFor(34.0) - 1.5, 1.0, 5.0));
    vec3 fin = fbmD(qn * vec2(120.0, 75.0) + 4.0, clamp(octFor(120.0) - 1.5, 1.0, 3.0));
    float ridge = sign(mid.x - 0.5);
    vec2 g = big.yz * 0.9 - ridge * mid.yz * 0.55 + fin.yz * 0.18;
    float t = -0.40 - wq.x;
    vec3 nM = normalize(mix(vec3(0.12, 0.05, -1.0), vec3(0.9, 0.05, -0.45), smoothstep(0.07, 0.0, t)));
    vec3 n = normalize(nM + vec3(-g.x, -g.y, 0.0) * 0.8);
    // irregular bedding: varying spacing, broken ledges
    float ly = qn.y * 40.0 + 7.0 * fbm1(qn.y * 6.0 + 1.0, 3.0) + big.x * 2.0 + qn.x * 5.0;
    float fl = fract(ly), lw = 40.0 * PX * 1.5;
    float brk = smoothstep(0.45, 0.7, vnoise(vec2(qn.x * 28.0, floor(ly) * 1.7)));
    float ledge = smoothstep(0.92 - lw, 0.92 + lw, fl) * brk;
    float under = smoothstep(0.2, 0.0, fl) * brk * 0.55;
    n = normalize(n + vec3(0.0, ledge * 1.4, 0.0));
    // joints: near-vertical fractures, fading in and out along their length
    float cv = vnoise(qn * vec2(70.0, 4.0) + big.x * 1.5);
    float crack = 1.0 - 0.5 * smoothstep(0.035 + PX * 70.0, 0.0, abs(cv - 0.5)) * smoothstep(0.4, 0.7, vnoise(qn * vec2(20.0, 30.0)));
    float ao = (0.3 + 0.7 * smoothstep(0.25, 0.7, big.x)) * crack * (1.0 - under);
    float strata = fbm1(ly * 0.5 + 3.0, 3.0);
    vec3 alb = vec3(0.16, 0.115, 0.085) * (0.6 + 0.8 * strata) * (0.75 + 0.5 * fin.x);
    alb = mix(alb, alb * vec3(0.8, 0.85, 0.95), smoothstep(0.55, 0.75, vnoise(qn * vec2(6.0, 14.0))));
    // key light grazes in from the sea side: facets turned toward it glow, recesses stay dark
    float ndl = max(dot(n.xy, LK.xy) + 0.05, 0.0);
    vec3 amb = mix(vec3(0.15, 0.09, 0.06), vec3(0.06, 0.065, 0.11), smoothstep(-0.6, 0.6, n.y));
    c = alb * (amb * ao * 1.1 + SUNC * 2.4 * ndl * ndl * ao);
    // vegetation: a grassy cap and tufts on the ledges
    float capH = (0.008 + 0.03 * smoothstep(0.03, 0.4, t)) * (0.5 + fbm1(qn.x * 13.0 + 4.0, 4.0));
    float veg = 0.0, vegN = 0.5;
    if (dN < capH + 0.004 || ledge > 0.0) {
      vegN = fbm(qn * vec2(140.0, 90.0), clamp(octFor(140.0) - 1.0, 1.0, 4.0));
      veg = max(smoothstep(capH + PX, capH - PX, dN) * smoothstep(0.38, 0.5, vegN), ledge * smoothstep(0.58, 0.68, vegN));
    }
    vec3 vc = vec3(0.035, 0.042, 0.016) * (0.6 + 0.8 * vegN) * (vec3(0.5) + SUNC * 2.2 * max(dot(normalize(n + vec3(0.0, 0.8, 0.0)), LK), 0.0));
    c = mix(c, vc, veg);
    // wet dark rock where the swash and surf reach
    float wet = max(wetZone, inSea) * smoothstep(0.03, 0.0, dF);
    c = mix(c, c * 0.45 + vec3(0.5, 0.33, 0.24) * 0.09 * smoothstep(0.0, 0.7, n.y + 0.3), wet);
    // backlit rim along the skyline
    c += SUNC * vec3(1.0, 0.85, 0.7) * 0.85 * exp(-dN / 0.0016);
    // surf washing the rocks where the foot stands in the sea
    float wash = 0.005 + 0.008 * pow(0.5 + 0.5 * sin(TAU * (Tw / PB) + qn.x * 30.0), 3.0);
    float fo = inSea * smoothstep(wash, 0.0, dF) * smoothstep(0.35, 0.65, fbm(qn * vec2(400.0, 700.0), 3.0) + 0.2) * smoothstep(0.3, 0.6, vnoise(vec2(qn.x * 60.0 + 2.5 * sin(TAU * Tw / PB), 1.0)));
    c = mix(c, foamLight(vec3(0.0, 0.0, 1.0)) * 0.7, fo);
  }
  if (aB > 0.0) {
    float w = max(max(wetZone, inSea), 0.6 * bwet) * smoothstep(0.2, -0.6, bl.y);
    vec3 cb = boulderShade(bl, w, bseed);
    cb += SUNC * 0.25 * smoothstep(0.85, 1.0, length(bl)) * smoothstep(0.2, 0.8, bl.x + bl.y);   // rim
    c = aC > 0.0 ? mix(c, cb, aB) : cb;
  }
  float zc = mix(22.0, 75.0, smoothstep(-0.9, -0.4, qn.x));
  c = mix(c, skyBase(normalize(vec3(qn.x, 0.02, FOC))) * 0.5, 1.0 - exp(-zc / 1500.0));
  return vec4(c, a);
}

vec4 layerCliffs(vec2 p) {
  if (p.x > -0.15) return vec4(0.0);
  float oct = octFor(22.0);
  // near headland
  vec2 qn = p + u_par * PAR * mix(0.85, 1.2, clamp((-0.4 - p.x) / 0.5, 0.0, 1.0));
  float e = 0.0015;
  vec4 nc = qn.x < -0.36 ? nearCliff(qn) : vec4(0.0);
  float aN = nc.a;
  // mid headland and its stack
  vec2 qm = p + u_par * PAR * 0.45;
  float dM = -1.0, aM = 0.0;
  if (qm.y < MIDB + 0.14 && qm.y > MIDB - 0.01 && aN < 1.0) {
    float tm = midTop(qm.x, oct);
    float sm = (midTop(qm.x + e, 2.0) - midTop(qm.x - e, 2.0)) / (2.0 * e);
    dM = (tm - qm.y) / sqrt(1.0 + min(sm * sm, 30.0));
    float pw = 0.0055 * (1.2 - 0.45 * clamp((qm.y - MIDB) / 0.032, 0.0, 1.0)) * (0.85 + 0.3 * fbm1(qm.y * 300.0, 4.0));
    float dP = min(pw - abs(qm.x + 0.192), MIDB + 0.032 * (1.0 - 0.2 * fbm1(qm.x * 500.0, 3.0)) - qm.y);
    dM = max(dM, dP);
    aM = smoothstep(-PX, PX, dM) * smoothstep(-PX, PX, qm.y - MIDB);
  }
  float a = max(aN, aM);
  if (a <= 0.0) return vec4(0.0);
  vec3 c;
  if (aN >= aM) {
    c = nc.rgb;
  } else {
    float t = -0.215 - qm.x;
    c = rockFace(qm, 2.5, smoothstep(0.04, 0.0, t) * 0.45, dM, false);
    vec3 hzm = skyBase(normalize(vec3(qm.x, 0.012, FOC)));
    c = mix(c, mix(hzm, vec3(dot(hzm, vec3(0.33))), 0.4) * 0.55, 0.3);
    float fo = smoothstep(0.0022 + 0.0015 * sin(TAU * (Tw / PB) + qm.x * 80.0), 0.0, qm.y - MIDB) * smoothstep(0.3, 0.6, fbm(qm * vec2(900.0, 400.0), 3.0) + 0.15);
    c = mix(c, foamLight(vec3(0.0, 0.0, 1.0)) * 0.6, fo);
  }
  a = aN + aM * (1.0 - aN);
  return outL(c, a);
}

// spray bursts against the rocks: a rising, spreading plume plus droplets
vec4 burst(vec2 p, vec2 site, float sc, float per, float seed, float depth) {
  vec2 q = p + u_par * PAR * depth;
  vec2 l = (q - site) / sc;
  if (abs(l.x) > 1.8 || l.y < -0.2 || l.y > 1.9) return vec4(0.0);
  float cyc = Tw / per + seed;
  float n = floor(cyc);
  float tau = cyc - n;
  float id = mod(n, LOOP / per);
  if (h11(id * 3.7 + seed * 17.0) < 0.35) return vec4(0.0);
  float life = tau / 0.4;
  if (life >= 1.0) return vec4(0.0);
  float hgt = (0.7 + 0.6 * h11(id * 5.1 + seed)) * (1.0 - pow(1.0 - min(life * 2.2, 1.0), 2.5));
  float yy = l.y / max(hgt, 0.05);
  float w = 0.08 + 0.4 * max(l.y, 0.0) + 0.35 * life;
  float fade = smoothstep(1.0, 0.4, life) * smoothstep(0.0, 0.04, life);
  float core = exp(-pow(l.x / w, 2.0) * 2.0) * smoothstep(1.05, 0.45, yy) * smoothstep(-0.12, 0.05, l.y);
  float nn = fbm(vec2(l.x * 3.0, l.y * 2.5 - life * 3.0) + seed * 9.0 + id, clamp(octFor(sc * 3.0), 2.0, 7.0));
  float dens = core * fade * smoothstep(0.32, 0.62, nn + 0.3 * (1.0 - yy));
  // droplets: one round drop per cell of a grid rising with the plume
  vec2 dq = vec2(l.x, l.y - life * 0.5) * 24.0;
  vec2 dc = floor(dq);
  vec2 dp = dc + 0.25 + 0.5 * h22(dc + id * 7.0);
  float dr = 0.08 + 0.14 * h12(dc + 3.0);
  float pxl = PX / sc * 24.0;
  float drop = smoothstep(dr + pxl, dr - pxl, length(dq - dp)) * step(h12(dc + 11.0 + id), 0.3);
  drop *= exp(-pow(l.x / (w * 1.4), 2.0)) * smoothstep(1.35, 0.7, yy) * fade;
  float a = clamp(dens + drop * 0.8, 0.0, 1.0);
  return vec4(vec3(a), a);
}
vec4 layerSpray(vec2 p) {
  vec4 b1 = burst(p, vec2(-0.217, MIDB), 0.035, 12.0, 0.13, 0.45);
  vec4 b2 = burst(p, vec2(0.462, YH - CAMH * FOC / 700.0), 0.03, 15.0, 0.61, 0.3);
  vec4 b3 = burst(p, vec2(-0.396, 0.372), 0.11, 9.0, 0.59, 0.85);
  float a = 1.0 - (1.0 - b1.a) * (1.0 - b2.a) * (1.0 - b3.a);
  if (a <= 0.0) return vec4(0.0);
  vec3 rd = normalize(vec3(p.x, p.y - YH, FOC));
  vec3 c = vec3(0.95, 0.9, 0.85) * (SUNC * (0.5 + 1.6 * pow(max(dot(rd, SUN), 0.0), 10.0)) + vec3(0.24, 0.21, 0.25));
  return outL(c, a);
}

// gulls: two grids of cells drifting across the sky, at most one bird per cell
float gullShape(vec2 g, float flap, float pxs) {
  float ax = abs(g.x);
  float e = 0.4;
  float he = 0.14 + 0.24 * flap;
  float dr = 0.26 - 0.32 * flap;
  float t = clamp((ax - e) / (1.0 - e), 0.0, 1.0);
  float yc = ax < e ? he * pow(ax / e, 0.7) : he - dr * t * (0.55 + 0.45 * t);
  float sl = ax < e ? he * 0.7 / e : dr * (0.55 + 0.9 * t) / (1.0 - e);
  float th = mix(0.07, 0.012, smoothstep(0.05, 1.0, ax));
  float d = (abs(g.y - yc + th * 0.25) - th) / sqrt(1.0 + sl * sl);
  d = max(d, ax - 1.0);
  float db = (length((g - vec2(0.0, -0.025)) / vec2(0.085, 0.06)) - 1.0) * 0.05;
  return smoothstep(pxs, -pxs, min(d, db));
}
vec4 layerGulls(vec2 p) {
  float a = 0.0;
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float span = fl == 0.0 ? 0.011 : 0.022;
    float cw = 0.3, ch = fl == 0.0 ? 0.11 : 0.17;
    float y0 = fl == 0.0 ? 0.53 : 0.57;
    float rows = fl == 0.0 ? 4.0 : 2.0;
    vec2 q = p + u_par * PAR * (fl == 0.0 ? 1.0 : 1.4);
    q.x -= fract(Tw / LOOP * (fl == 0.0 ? 9.0 : 14.0)) * 12.0 * cw;
    vec2 c = floor(vec2(q.x / cw, (q.y - y0) / ch));
    if (c.y < 0.0 || c.y >= rows) continue;
    float cid = mod(c.x, 12.0);
    float hs = h12(vec2(cid, c.y + fl * 7.0));
    if (hs > (fl == 0.0 ? 0.25 : 0.24)) continue;
    vec2 jit = h22(vec2(cid * 3.1, c.y + fl * 11.0));
    vec2 ctr = vec2((c.x + 0.25 + 0.5 * jit.x) * cw, y0 + (c.y + 0.3 + 0.4 * jit.y) * ch);
    float mb = floor(LOOP / (9.0 + 6.0 * jit.x));
    ctr.y += 0.012 * sin(TAU * fract(mb * Tw / LOOP) + hs * 40.0);
    float sz = span * (0.8 + 0.4 * jit.y);
    vec2 g = (q - ctr) / sz;
    if (abs(g.x) > 1.2 || abs(g.y) > 0.8) continue;
    float bank = 0.12 * sin(TAU * fract(mb * Tw / LOOP) + hs * 40.0 + 1.3);
    g = mat2(cos(bank), sin(bank), -sin(bank), cos(bank)) * g;
    float mf = floor(LOOP / 0.42);
    float fph = TAU * fract(mf * Tw / LOOP + jit.x);
    float burstF = smoothstep(0.75, 0.95, sin(TAU * fract(floor(LOOP / 11.0) * Tw / LOOP + hs * 5.0)));
    float flap = 0.1 * sin(TAU * fract(floor(LOOP / 6.0) * Tw / LOOP + jit.y)) + burstF * sin(fph) * 0.9;
    a = max(a, gullShape(g, flap, PX / sz * 0.9));
  }
  if (a <= 0.0) return vec4(0.0);
  vec3 rd = normalize(vec3(p.x, p.y - YH, FOC));
  vec3 c = vec3(0.03, 0.026, 0.03) + min(skyBase(rd), vec3(1.4)) * 0.08;
  return outL(c, a);
}

void main() {
  PX = 1.0 / u_res.y;
  Tw = mod(u_time, LOOP);
  SUN = normalize(vec3(SUNP.x, SUNP.y - YH, FOC));
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.38 * smoothstep(0.12, 0.62, dot(vq, vq) * 1.6);
  vec2 qs = p + u_par * PAR * surfDepth(p.y);
  float dyq = YH - qs.y;
  float zP = CAMH * FOC / max(dyq, 1e-4);
  float hor = smoothstep(-0.75 * PX, 0.75 * PX, dyq);
  float aSurf = dyq > 0.0 ? 1.0 - smoothstep(ZSPLIT - 20.0, ZSPLIT + 20.0, zP) : 0.0;
  float aSea = hor * smoothstep(ZSPLIT - 60.0, ZSPLIT - 20.0, zP);
  float dither = (h12(gl_FragCoord.xy + fract(Tw) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;

  if (u_layer > -0.5) {
    int k = int(u_layer + 0.5);
    vec4 c = vec4(0.0);
    if (k == 0) c = layerSky(p);
    else if (k == 1) c = layerFar(p);
    else if (k == 2) { if (aSea > 0.0) c = vec4(display(surface(qs)), 1.0) * aSea; }
    else if (k == 3) c = layerStacks(p);
    else if (k == 4) { if (aSurf > 0.0) c = vec4(display(surface(qs)), 1.0) * aSurf; }
    else if (k == 5) c = layerCliffs(p);
    else if (k == 6) c = layerSpray(p);
    else if (k == 7) c = layerGulls(p);
    fragColor = vec4(c.rgb + dither * c.a, c.a);
    return;
  }

  // full scene: front-to-back "under" compositing (identical to back-to-front
  // "over"), skipping layers that are already hidden
  vec3 acc = vec3(0.0);
  float T = 1.0;
  vec4 c = layerGulls(p);
  acc += T * c.rgb; T *= 1.0 - c.a;
  c = layerSpray(p);
  acc += T * c.rgb; T *= 1.0 - c.a;
  if (T > 0.001) { c = layerCliffs(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  vec3 water = vec3(0.0);
  if (T > 0.001 && (aSurf > 0.0 || aSea > 0.0)) water = display(surface(qs));
  acc += T * aSurf * water; T *= 1.0 - aSurf;
  if (T > 0.001) { c = layerStacks(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  acc += T * aSea * water; T *= 1.0 - aSea;
  if (T > 0.001) { c = layerFar(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerSky(p); acc += T * c.rgb; }
  fragColor = vec4(acc + dither, 1.0);
}
`,
}
