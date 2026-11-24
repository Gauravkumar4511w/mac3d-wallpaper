// Coral Aquarium — a sunlit tropical reef seen through clear water.
//
// Everything is procedural and works in linear light: each depth layer is lit,
// pushed through wavelength-dependent water extinction (red dies first, the
// distance goes blue-green), tone-mapped (ACES) and gamma-encoded on its own,
// then composited front-to-back in display space. The full scene is exactly the
// back-to-front "over" composite of the isolated layers (u_layer = k).
//
// Time: T = u_time mod 100·2π, and every angular frequency is a multiple of
// 0.01 rad/s, so every sin(T·w) loops seamlessly. Linear motions (fish lanes,
// bubbles, marine snow) wrap with mod() over a 64-cell hash period.

export default {
  id: 'aquarium',
  name: 'Coral Aquarium',
  tag: 'Living reef',
  accent: '#2fd4e8',
  accent2: '#ff8a3c',
  ink: '#0b5f73',
  glow: '#a6f2ff',
  light: true,
  clockColor: '#062a3c',
  sky: 'linear-gradient(180deg,#c9f6ff 0%,#6fd0e2 14%,#2f9cbc 40%,#145f7c 66%,#0a3a4c 100%)',
  layers: [
    { name: 'Surface and water', depth: 0 },
    { name: 'Far reef', depth: 0.12 },
    { name: 'Light rays', depth: 0.22 },
    { name: 'Silver school', depth: 0.38 },
    { name: 'Reef and sand', depth: 0.62 },
    { name: 'Reef fish', depth: 0.85 },
    { name: 'Near coral', depth: 1.05 },
    { name: 'Bubbles and snow', depth: 1.3 },
  ],
  clockAfter: 4,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

float PX;   // one pixel in height-relative units
float T;    // periodic time (see header comment)
float AR;   // aspect ratio

const float YH = 0.40;   // horizon (eye level)
const float CAMH = 1.6;  // camera height above the sand (m)
const float CAMD = 4.5;  // camera depth below the surface (m)
const vec3 SIG = vec3(0.14, 0.050, 0.038);   // water extinction per metre
const vec2 SUN = vec2(-0.55, 1.75);          // where the sun rays converge
const vec3 LDIR = vec3(-0.30, 0.86, 0.41);   // light direction on screen-facing surfaces
const vec3 AMB = vec3(0.05, 0.17, 0.27);    // blue-green ambient from the water

// ---------------------------------------------------------------- noise
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 h31(float p) { vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
// value noise with analytic derivatives: (value, d/dx, d/dy)
vec3 vnd(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * (vec2(k1, k2) + k4 * u.yx));
}
// signed fbm whose octaves fade out before they alias (fp = footprint of p per pixel)
float fbmR(vec2 p, float fp, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    float k = 1.0 - smoothstep(0.2, 0.5, fp);
    if (k <= 0.0) break;
    s += a * k * (vn(p) * 2.0 - 1.0);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
    fp *= 2.0;
    a *= 0.5;
  }
  return s;
}
// detail fade for a pattern with 'freq' cycles per unit at footprint fp
float fadeF(float freq, float fp) { return 1.0 - smoothstep(0.12, 0.4, freq * fp); }
float fill(float d, float w) { return 1.0 - smoothstep(-w, w, d); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec4 ftb(vec4 acc, vec4 c) { return acc + (1.0 - acc.a) * c; }

void voro(vec2 x, out float f1, out float f2, out vec2 id, out vec2 rr) {
  vec2 n = floor(x), f = fract(x);
  f1 = 8.0; f2 = 8.0; id = n; rr = vec2(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + 0.1 + 0.8 * h22(n + g) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = n + g; rr = r; }
    else if (d < f2) f2 = d;
  }
  f1 = sqrt(f1); f2 = sqrt(f2);
}

// animated caustic network: distance to the moving voronoi borders
float causticV(vec2 p, float spd) {
  p += 0.22 * vec2(sin(p.y * 1.7 + T * 0.31), sin(p.x * 1.9 - T * 0.27));
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.5 + 0.4 * sin(T * spd + TAU * h22(n + g));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
// bright caustic filaments; blur in cell units keeps the average energy constant
float caustics(vec2 p, float blur) {
  float w = 0.075 + blur;
  float e1 = causticV(p, 1.17);
  float e2 = causticV(p * 1.61 + 4.1, 1.43);
  float c1 = exp(-e1 * e1 / (w * w));
  float c2 = exp(-e2 * e2 / (w * w * 1.6));
  return (c1 + 0.6 * c2 + 1.6 * c1 * c2) * (0.075 / w);
}

// ---------------------------------------------------------------- light and water
vec3 sunAt(float d) { return vec3(1.0, 0.95, 0.86) * 3.4 * exp(-SIG * d * 0.75); }
vec3 fogz(vec3 c, float z, vec3 w) { vec3 t = exp(-SIG * z); return c * t + w * (1.0 - t); }
vec4 fog4(vec4 c, float z, vec3 w) { vec3 t = exp(-SIG * z); return vec4(c.rgb * t + w * (1.0 - t) * c.a, c.a); }

// colour of the water itself along a view ray (also the fog colour)
vec3 waterCol(vec2 p) {
  float y = p.y;
  vec3 c = mix(vec3(0.003, 0.025, 0.07), vec3(0.010, 0.115, 0.23), smoothstep(-0.05, 0.42, y));
  c = mix(c, vec3(0.06, 0.40, 0.60), smoothstep(0.36, 0.92, y));
  c = mix(c, vec3(0.20, 0.64, 0.78), smoothstep(0.82, 1.06, y));
  vec2 d = (p - vec2(SUN.x * 0.7, 1.05)) * vec2(0.55, 1.4);
  c += vec3(0.09, 0.22, 0.20) * exp(-2.2 * length(d));
  return c;
}

vec2 wave(vec2 S, vec2 d, float k, float a, float om, float fp) {
  float att = fadeF(k / TAU, fp);
  return d * (a * k * cos(dot(d, S) * k - T * om) * att);
}

// the underside of the surface: total internal reflection with Snell's-window glints
vec3 surface(vec2 p, vec3 w) {
  float dy = p.y - YH;
  float zs = CAMD / dy;
  vec2 S = vec2(p.x * zs, zs);
  float fp = zs * zs / CAMD * PX;
  vec2 Sw = S + 0.5 * vec2(sin(S.y * 0.37 + T * 0.21), sin(S.x * 0.29 - T * 0.17));
  vec2 g = wave(Sw, vec2(0.80, 0.60), 1.10, 0.060, 0.93, fp);
  g += wave(Sw, vec2(-0.55, 0.83), 1.70, 0.045, 1.27, fp);
  g += wave(Sw, vec2(0.21, -0.98), 2.90, 0.030, 1.61, fp);
  g += wave(Sw, vec2(0.97, -0.24), 4.30, 0.022, 2.03, fp);
  g += wave(Sw, vec2(-0.86, -0.51), 7.10, 0.015, 2.57, fp);
  g += wave(Sw, vec2(0.45, 0.89), 11.3, 0.0100, 3.31, fp);
  g += wave(Sw, vec2(-0.31, 0.95), 17.9, 0.0065, 4.17, fp);
  g += wave(Sw, vec2(0.93, 0.37), 27.7, 0.0042, 5.23, fp);
  float elev = atan(dy) + g.y * 0.9 + abs(g.x) * 0.35;
  float win = smoothstep(0.6, 0.78, elev);
  vec3 refl = waterCol(vec2(p.x, YH - dy * 0.6)) * 1.9 + vec3(0.10, 0.24, 0.26);
  float sunX = exp(-abs(p.x - SUN.x * 0.8) * 1.8);
  vec3 sky = vec3(1.7, 2.2, 2.3) * (1.1 + 2.2 * sunX);
  vec3 c = mix(refl, sky, win);
  c += vec3(0.4, 0.7, 0.7) * smoothstep(0.35, 0.8, elev) * 0.3;
  float dist = sqrt(zs * zs + CAMD * CAMD);
  return fogz(c, dist * 1.15, w);
}

// ---------------------------------------------------------------- layer 0: surface and water
vec4 layerWater(vec2 p) {
  vec3 w = waterCol(p);
  vec3 c = w;
  if (p.y < YH) {
    float z = CAMH / max(YH - p.y, 1e-4);
    vec3 sand = vec3(0.62, 0.55, 0.42) * (sunAt(CAMD + CAMH) * 0.62 + AMB);
    c = fogz(sand, z, w);
  } else if (p.y > YH + 0.07) {
    c = surface(p, w);
  }
  return vec4(c, 1.0);
}

// ---------------------------------------------------------------- layer 1: far reef
vec4 layerFar(vec2 p) {
  if (p.y > 0.56 || p.y < 0.28) return vec4(0.0);
  vec3 w = waterCol(p);
  vec4 acc = vec4(0.0);
  float blur = 0.0022 + PX;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float base = 0.318 + 0.022 * fi;
    float z = CAMH / (YH - base);
    float x = p.x * (1.0 + 0.35 * fi) + fi * 13.7;
    float m = n1(x * 1.3 + 2.0);
    float hgt = (0.025 + 0.09 * m * m + 0.03 * n1(x * 4.1) + 0.02 * abs(n1(x * 13.0) - 0.5) + 0.012 * n1(x * 37.0) + 0.006 * n1(x * 83.0)) * (1.0 - 0.3 * fi);
    float top = base + hgt;
    float a = fill(p.y - top, blur) * smoothstep(base - 0.03, base + 0.01, p.y);
    if (a <= 0.0) continue;
    float tex = vn(p * vec2(60.0, 80.0) + fi * 7.0) * 0.6 + vn(p * vec2(140.0, 180.0)) * 0.4;
    float vf = smoothstep(base, top, p.y);
    vec3 alb = vec3(0.22, 0.20, 0.17) * (0.5 + 1.0 * tex);
    vec3 col = alb * (sunAt(CAMD) * (0.15 + 0.6 * vf) + AMB * 0.6);
    col = fogz(col, z, w);
    acc = ftb(acc, vec4(col * a, a));
  }
  return acc;
}

// ---------------------------------------------------------------- layer 2: light rays
vec4 layerRays(vec2 p) {
  vec2 d = p - SUN;
  float ang = atan(d.x, -d.y);
  float dist = length(d);
  vec2 o = 6.0 * vec2(cos(T * 0.01), sin(T * 0.01));
  vec2 o2 = 3.0 * vec2(cos(T * 0.07), sin(T * 0.07));
  float r = vn(vec2(ang * 34.0 + o.x, o.y)) * 0.6 + vn(vec2(ang * 83.0 - o.y * 1.7, o.x * 1.3 + 9.0)) * 0.4;
  r = smoothstep(0.38, 0.95, r);
  r *= r;
  float lm = 0.5 + 0.5 * vn(vec2(ang * 11.0 + o.y, dist * 2.6 - o.x * 0.4));
  float fl = 0.7 + 0.3 * vn(vec2(ang * 50.0 + o2.x, o2.y));
  float depthFade = smoothstep(-0.05, 0.95, p.y);
  float topFade = 1.0 - 0.7 * smoothstep(0.86, 1.0, p.y);
  float I = r * lm * fl * depthFade * topFade * 0.42;
  vec3 col = vec3(0.62, 0.96, 1.0) * 2.4;
  return vec4(col * I, I);
}

// ---------------------------------------------------------------- fish
float bodyH(float x, float H, float pw) {
  float u = x * 2.0;
  bool rear = u < 0.15;
  float kx = (u - 0.15) / (rear ? 1.15 : 0.85);
  float hb = 0.5 * H * pow(max(1.0 - kx * kx, 0.0), rear ? 0.85 : pw);
  float ped = 0.5 * H * 0.2 * smoothstep(-1.17, -1.05, u);
  return max(hb, u < -0.5 ? ped : 0.0);
}

// One fish in body space: q.x along the body (snout +0.5, peduncle -0.5), q.y up,
// in units of body length. sp: 0 blue tang, 1 yellow tang, 2 clownfish, 3 silver.
// ph: tail-beat phase; fp: body units per pixel. Returns premultiplied linear colour.
vec4 fish(vec2 q, int sp, float ph, float fp, vec3 sun, float rnd) {
  float H, tL, tH, fork, dF, aF, pw;
  if (sp == 0) { H = 0.42; tL = 0.25; tH = 0.36; fork = 0.32; dF = 0.065; aF = 0.055; pw = 0.5; }
  else if (sp == 1) { H = 0.50; tL = 0.21; tH = 0.32; fork = 0.10; dF = 0.15; aF = 0.13; pw = 0.68; }
  else if (sp == 2) { H = 0.36; tL = 0.21; tH = 0.28; fork = -0.35; dF = 0.085; aF = 0.065; pw = 0.42; }
  else { H = 0.20; tL = 0.27; tH = 0.24; fork = 0.75; dF = 0.035; aF = 0.025; pw = 0.55; }
  if (q.x > 0.56 || q.x < -0.62 - tL || abs(q.y) > 0.5 * H + max(dF, aF) + 0.06) return vec4(0.0);
  float sb = sin(ph), cb = cos(ph);
  // travelling body wave seen side-on: a slight vertical sway that grows toward the tail
  q.y -= 0.012 * sin(ph - q.x * 5.0) * (0.55 - q.x);
  float aa = fp;
  float hb = bodyH(q.x, H, pw);
  float sl = (bodyH(q.x + 0.006, H, pw) - bodyH(q.x - 0.006, H, pw)) / 0.012;
  float db = (abs(q.y) - hb) / sqrt(1.0 + min(sl * sl, 60.0));
  float aBody = fill(db, aa);
  // median fins
  float fd = dF * pow(max(sin(clamp((q.x + 0.48) / 0.72, 0.0, 1.0) * PI), 0.0), 0.6);
  float fa = aF * pow(max(sin(clamp((q.x + 0.46) / 0.52, 0.0, 1.0) * PI), 0.0), 0.6);
  if (sp == 2) fd *= 0.75 + 0.25 * cos(clamp((q.x + 0.1) / 0.12, -1.0, 1.0) * PI); // notched dorsal
  float fh = q.y > 0.0 ? fd : fa;
  float dfin = abs(q.y) - hb - fh;
  float aFin = fill(dfin, aa) * smoothstep(0.0, 0.004, fh);
  // caudal fin: foreshortens as it beats toward and away from the camera
  float fs = 0.6 + 0.4 * abs(cb);
  float tl = tL * fs;
  float tx = (-0.575 - q.x) / tl;
  float ty = q.y - 0.05 * sb * max(tx, 0.0) * tl;
  float th = 0.5 * tH * (0.2 + 0.8 * sqrt(clamp(tx, 0.0, 1.5)));
  float txm = 1.0 - fork * (1.0 - pow(min(abs(ty) / th, 1.0), 1.5));
  float dt = max(max(abs(ty) - th, (tx - txm) * tl), -tx * tl - 0.03);
  float aTail = fill(dt, aa);
  if (aBody + aFin + aTail <= 0.0) return vec4(0.0);

  float u = q.x * 2.0;
  float wv = clamp(q.y / max(hb, 1e-4), -1.0, 1.0);
  // ---- albedos
  vec3 bodyA, finA, tailA;
  float k = fadeF(1.0, aa * 25.0);   // fine-pattern visibility
  if (sp == 0) {
    bodyA = mix(vec3(0.010, 0.085, 0.62), vec3(0.06, 0.26, 0.78), smoothstep(0.0, -0.9, -wv) * 0.0 + smoothstep(-0.2, -1.0, wv) * 0.5);
    // the black "palette" marking
    float up = smoothstep(0.03, 0.07, wv - (0.05 + 0.12 * u)) * (1.0 - smoothstep(0.72, 0.8, u));
    float ov = length(vec2((u + 0.08) / 0.40, (wv - 0.52) / 0.19));
    up *= smoothstep(0.92, 1.05, ov);
    float arm = (1.0 - smoothstep(0.10, 0.15, abs(wv - (0.02 + 0.55 * (u + 0.15))))) * smoothstep(-1.1, -0.95, u) * (1.0 - smoothstep(-0.25, -0.1, u));
    bodyA = mix(bodyA, vec3(0.008, 0.01, 0.025), max(up, arm));
    finA = vec3(0.01, 0.012, 0.03);
    tailA = vec3(0.92, 0.62, 0.02);
  } else if (sp == 1) {
    bodyA = vec3(0.93, 0.60, 0.015) * (0.9 + 0.1 * wv);
    float spine = 1.0 - smoothstep(0.03, 0.05, length(vec2((u + 0.86) * 0.9, q.y * 1.6)));
    bodyA = mix(bodyA, vec3(0.9, 0.88, 0.8), spine);
    finA = vec3(0.95, 0.55, 0.01);
    tailA = vec3(0.92, 0.55, 0.01);
  } else if (sp == 2) {
    bodyA = vec3(0.92, 0.20, 0.012);
    float c1 = 0.40 + 0.07 * (1.0 - wv * wv), c2 = -0.10 + 0.11 * (1.0 - wv * wv), c3 = -0.93;
    float wb = 0.0, bl = 0.0;
    vec3 cs = vec3(c1, c2, c3), hw = vec3(0.075, 0.09, 0.045);
    for (int i = 0; i < 3; i++) {
      float dd = abs(u - cs[i]);
      wb = max(wb, fill(dd - hw[i], aa * 2.0));
      bl = max(bl, fill(dd - hw[i] - 0.035, aa * 2.0));
    }
    bodyA = mix(bodyA, vec3(0.012, 0.01, 0.01), bl);
    bodyA = mix(bodyA, vec3(0.92, 0.92, 0.88), wb);
    finA = vec3(0.92, 0.22, 0.012);
    tailA = finA;
  } else {
    float flash = pow(0.5 + 0.5 * sin(T * 0.71 + rnd * TAU + u * 0.8), 6.0);
    bodyA = mix(vec3(0.55, 0.62, 0.68), vec3(0.05, 0.12, 0.20), smoothstep(0.15, 0.55, wv));
    bodyA = mix(bodyA, vec3(0.92, 0.95, 0.97), smoothstep(-0.2, -0.8, wv) * 0.7);
    bodyA *= 1.0 + 1.8 * flash * (1.0 - smoothstep(0.2, 0.6, wv));
    bodyA = mix(bodyA, vec3(0.75, 0.68, 0.25), (1.0 - smoothstep(0.04, 0.09, abs(wv - 0.32))) * 0.5);
    finA = vec3(0.45, 0.55, 0.6);
    tailA = vec3(0.35, 0.45, 0.52);
  }
  // ---- lighting
  vec3 L = vec3(0.0, 0.86, 0.51);
  vec3 col4 = vec3(0.0);
  vec4 acc = vec4(0.0);
  // eye (front-most)
  float ex = 0.355, ey = 0.22 * bodyH(0.355, H, pw) + 0.01;
  float er = sp == 2 ? 0.042 : 0.034;
  float de = length(q - vec2(ex, ey)) - er;
  float aEye = fill(de, aa) * aBody;
  if (aEye > 0.0) {
    float pr = length(q - vec2(ex + 0.004, ey));
    vec3 ec = mix(sp == 2 ? vec3(0.7, 0.35, 0.05) : vec3(0.35, 0.3, 0.12), vec3(0.005), 1.0 - smoothstep(er * 0.55, er * 0.7, pr));
    ec *= sun * 0.35 + AMB;
    float spec = 1.0 - smoothstep(er * 0.15, er * 0.32, length(q - vec2(ex - er * 0.3, ey + er * 0.35)));
    ec += sun * 0.6 * spec;
    acc = ftb(acc, vec4(ec * aEye, aEye));
  }
  // pectoral fin, flapping
  vec2 pq = q - vec2(0.15, -0.12 * H);
  pq = rot(-0.55 + 0.3 * sin(ph * 2.0 + 1.0)) * pq;
  float dp = (length(pq / vec2(0.12, 0.038)) - 1.0) * 0.038;
  float aPec = fill(dp, aa) * 0.7 * aBody;
  if (aPec > 0.0) {
    vec3 pc = (sp == 0 ? vec3(0.9, 0.62, 0.02) : sp == 3 ? vec3(0.6, 0.7, 0.75) : finA) * (sun * 0.6 + AMB * 1.2);
    acc = ftb(acc, vec4(pc * aPec, aPec));
  }
  // body
  if (aBody > 0.0) {
    float nz = sqrt(max(1.0 - wv * wv, 0.0));
    float nx = smoothstep(0.25, 0.5, q.x) * 0.8 - smoothstep(-0.3, -0.55, q.x) * 0.25;
    vec3 n = normalize(vec3(nx, wv * 0.95, nz + 0.05));
    float diff = max(dot(n, L), 0.0);
    diff *= 1.0 + 0.16 * sin(ph - u * 2.2) * (1.0 - smoothstep(-0.8, 0.6, u));
    vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, hv), 0.0), 28.0);
    // scales: resolution-aware, appear only when they can be resolved
    vec2 sc = q * vec2(46.0, 58.0);
    float row = floor(sc.y);
    sc.x += 0.5 * mod(row, 2.0);
    vec2 sf = fract(sc) - 0.5;
    float scl = smoothstep(0.28, 0.5, length(sf * vec2(1.0, 0.85) + vec2(0.18, 0.0)));
    float ks = fadeF(58.0, aa);
    float gill = (1.0 - smoothstep(0.0, 0.025, abs(u - 0.56 - 0.08 * wv * wv))) * k;
    vec3 alb = bodyA * (1.0 - 0.14 * scl * ks) * (1.0 - 0.25 * gill);
    vec3 c = alb * (sun * diff * 0.85 + AMB * (0.75 + 0.35 * wv)) + sun * spec * (sp == 3 ? 0.35 : 0.12);
    c *= 0.55 + 0.45 * smoothstep(-1.0, -0.4, wv); // belly occlusion
    acc = ftb(acc, vec4(c * aBody, aBody));
  }
  // fins and tail (translucent, behind the body)
  float aF2 = max(aFin * 0.88, aTail * 0.9);
  if (aF2 > 0.0) {
    bool isTail = aTail > aFin;
    vec3 fa2 = isTail ? tailA : finA;
    float rays = 0.85 + 0.15 * sin((isTail ? q.y * 140.0 : q.x * 160.0)) * fadeF(25.0, aa);
    float edge;
    if (isTail) edge = smoothstep(-0.03, -0.006, dt); else edge = smoothstep(-0.03, -0.006, dfin);
    if (sp == 0) {
      if (!isTail) fa2 = mix(fa2, vec3(0.02, 0.15, 0.7), edge);
      else fa2 = mix(fa2, vec3(0.01), smoothstep(0.6, 0.85, abs(ty) / th) * 0.9);
    } else if (sp == 2) {
      fa2 = mix(fa2, vec3(0.01), smoothstep(-0.05, -0.03, isTail ? dt : dfin));
      fa2 = mix(fa2, vec3(0.9), edge * 0.8);
    }
    vec3 c = fa2 * rays * (sun * 0.55 + AMB * 1.1);
    acc = ftb(acc, vec4(c * aF2, aF2));
  }
  return acc;
}

// a lane of fish swimming at distance z (m); cell tiling = unbounded fish for one evaluation
vec4 fishLane(vec2 p, float seed, float z, float yc, float yamp, float dir, float lenM, float spdM, float dens, float mixB, int spA, int spB) {
  float s = lenM / z;
  if (abs(p.y - yc) > yamp * 1.3 + 0.6 * s) return vec4(0.0);
  float cw = s * 3.0;
  float v = spdM / z;
  float P = 64.0 * cw / v;
  float X = p.x - dir * mod(u_time, P) * v;
  float ci = floor(X / cw);
  float cm = mod(ci, 64.0);
  vec3 h = h31(cm * 7.31 + seed * 113.0);
  float grp = floor(cm / 6.0);
  float gh = h11(grp * 3.7 + seed * 19.0);
  if (h.x > dens * (0.3 + 0.9 * gh)) return vec4(0.0);
  int sp = h11(grp * 5.1 + seed * 7.0) < mixB ? spB : spA;
  float sz = s * (0.82 + 0.3 * h.z);
  float fx = (ci + 0.5 + 0.3 * (h.y - 0.5) + 0.07 * sin(T * 0.37 + h.z * TAU)) * cw;
  float a1 = cm * TAU * 3.0 / 64.0 + seed * 5.0, a2 = cm * TAU * 7.0 / 64.0 + seed * 2.0;
  float path = 0.6 * sin(a1) + 0.4 * sin(a2);
  float dpath = (0.6 * cos(a1) * 3.0 + 0.4 * cos(a2) * 7.0) * TAU / 64.0;
  float fy = yc + yamp * path + 0.7 * yamp * (h.z - 0.5) + 0.35 * yamp * sin(T * 0.07 + cm * 0.9 + seed) + 0.004 * sin(T * 0.53 + h.y * TAU);
  vec2 q = vec2((X - fx) * dir, p.y - fy) / sz;
  q = rot(clamp(yamp * dpath / cw, -0.35, 0.35) * dir * -1.0) * q;
  float ph = T * (floor((6.0 + 4.0 * h.y) * 100.0) / 100.0) + h.x * 40.0;
  vec4 c = fish(q, sp, ph, PX / sz * (1.0 + z * 0.04), sunAt(CAMD - 0.3), h.z);
  return fog4(c, z, waterCol(p));
}

// ---------------------------------------------------------------- layer 3: silver school
vec4 layerSchool(vec2 p) {
  float bc = 0.565 + 0.06 * sin(p.x * 1.6 + T * 0.05) + 0.025 * sin(p.x * 4.3 - T * 0.09);
  float bh = 0.05 + 0.02 * sin(p.x * 2.2 + T * 0.07 + 1.0);
  float dy = (p.y - bc) / bh;
  if (abs(dy) > 1.3) return vec4(0.0);
  float ex = -0.3 + 0.4 * sin(T * 0.02);
  float env = 1.0 - smoothstep(0.3, 0.8, abs(p.x - ex));
  if (env <= 0.0) return vec4(0.0);
  float dens = (1.0 - smoothstep(0.3, 1.15, abs(dy))) * env;
  float slope = 0.06 * 1.6 * cos(p.x * 1.6 + T * 0.05) + 0.025 * 4.3 * cos(p.x * 4.3 - T * 0.09);
  vec3 w = waterCol(p);
  vec4 acc = vec4(0.0);
  for (int g = 0; g < 2; g++) {
    float fg = float(g);
    float z = 15.0 + 3.5 * fg;
    float s = 0.17 / z;
    float cw = s * 2.6, ch = s * 1.3;
    float v = 0.42 / z;
    float P = 64.0 * cw / v;
    float X = p.x - mod(u_time, P) * v + fg * 0.37 * cw;
    float Y = p.y - bc + fg * 0.5 * ch;
    vec2 ci = floor(vec2(X / cw, Y / ch));
    vec2 cm = vec2(mod(ci.x, 64.0), ci.y);
    vec3 h = h31(dot(cm, vec2(1.0, 67.0)) + fg * 311.0);
    if (h.x > dens * 1.2) continue;
    vec2 fc = (ci + 0.5 + (h.yz - 0.5) * vec2(0.42, 0.6)) * vec2(cw, ch);
    fc.x += 0.06 * cw * sin(T * 0.41 + h.y * TAU);
    vec2 q = (vec2(X, Y) - fc) / s;
    q = rot(-atan(slope)) * q;
    vec4 c = fish(q, 3, T * 9.0 + h.z * TAU, PX / s * 1.3, sunAt(CAMD - 1.0), h.y);
    acc = ftb(acc, fog4(c, z, w));
  }
  return acc;
}

// ---------------------------------------------------------------- coral building blocks
// muted natural albedos with a few saturated accents
vec3 palette(float h) {
  if (h < 0.18) return vec3(0.38, 0.33, 0.17);   // olive
  if (h < 0.34) return vec3(0.52, 0.39, 0.19);   // ochre
  if (h < 0.46) return vec3(0.42, 0.30, 0.24);   // brown
  if (h < 0.56) return vec3(0.44, 0.30, 0.36);   // mauve
  if (h < 0.66) return vec3(0.50, 0.27, 0.17);   // rust
  if (h < 0.76) return vec3(0.58, 0.54, 0.42);   // pale cream
  if (h < 0.84) return vec3(0.33, 0.36, 0.26);   // grey-green
  if (h < 0.90) return vec3(0.45, 0.40, 0.52);   // lavender grey
  if (h < 0.95) return vec3(0.80, 0.34, 0.12);   // orange accent
  return vec3(0.55, 0.14, 0.30);                  // magenta accent
}

// palette with soft transitions, for continuous colour fields
vec3 paletteS(float x) {
  float i = floor(x * 10.0), f = smoothstep(0.15, 1.0, fract(x * 10.0));
  return mix(palette(fract(i / 10.0) + 0.001), palette(fract((i + 1.0) / 10.0) + 0.001), f);
}

float midBase(float x) { return 0.205 + 0.03 * n1(x * 2.1 + 5.3); }
float midSmooth(float x) {
  float ax = abs(x) / (AR * 0.5);
  float side = 0.32 + 0.68 * smoothstep(0.08, 0.85, ax);
  float m = n1(x * 1.9 + 1.7);
  m = m * m * (3.0 - 2.0 * m);
  return 0.212 + (0.04 + 0.16 * m) * side + 0.025 * (n1(x * 5.3 + 2.0) - 0.5);
}
float nearSmooth(float x) {
  float e = AR * 0.5 - abs(x);
  float side = exp(-max(e, 0.0) * 2.5);
  return -0.07 + 0.36 * side + 0.05 * n1(x * 2.7 + 11.0);
}
float reefProfile(float x, int mode) { return mode == 0 ? midSmooth(x) : nearSmooth(x); }

// irregular reef silhouette above the profile: colony lobes of varied size plus
// rough, resolution-aware detail. sc = lobe size (screen units)
float reefEdge(float x, float sc, float seed) {
  float lx = x / sc + seed;
  float wl = lx + 0.7 * n1(lx * 0.37 + 3.0);
  float cell = floor(wl);
  float f = fract(wl);
  float amp = 0.3 + 0.7 * h11(cell + seed);
  float lobe = sqrt(max(1.0 - pow(2.0 * f - 1.0, 2.0), 0.0)) * amp;
  float r = 0.55 * lobe + 0.32 * n1(lx * 2.3) + 0.16 * abs(n1(lx * 5.9) - 0.5) * 2.0;
  r += 0.08 * (n1(lx * 13.0) - 0.5) * fadeF(13.0 / sc, PX);
  r += 0.04 * (n1(lx * 31.0) - 0.5) * fadeF(31.0 / sc, PX);
  return r * sc;
}

// one continuous coral mass: domain-warped colonies with smooth relief, deep crevices,
// encrusting growth over rock, paler colony tips, bump-mapped colony textures
vec3 reefSurface(vec2 p, float cs, float seed, float topY, float baseY, float dM, float blur, float sunK) {
  float fp = (PX + blur) * cs;
  vec2 w = p * cs + seed;
  w += 1.4 * (vec2(vn(w * 0.43 + 3.1), vn(w * 0.43 + 8.7)) - 0.5);
  // colonies: paraboloid domes of varied size, merged with a soft maximum (no seams);
  // colony colours blend with the same weights
  vec2 v = w * 0.75;
  vec2 vi = floor(v), vf2 = fract(v);
  float sw = 0.0, sh = 0.0, bw = -1.0;
  vec2 sg = vec2(0.0), id = vi;
  vec3 scol = vec3(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 gc = vec2(float(i), float(j));
    vec3 hh = h31(dot(vi + gc, vec2(1.0, 157.0)) + seed);
    vec2 d = gc + 0.15 + 0.7 * hh.xy - vf2;
    float r2 = pow(0.5 + 0.55 * hh.z, 2.0);
    float hg = 1.0 - dot(d, d) / r2;
    float wgt = exp(5.0 * hg);
    sw += wgt;
    sh += wgt * hg;
    sg += wgt * (2.0 * d / r2);
    scol += wgt * (0.55 + 0.45 * cos(TAU * (hh.y * 1.3 + vec3(0.0, 0.3, 0.55))));
    if (wgt > bw) { bw = wgt; id = vi + gc; }
  }
  float dome = sh / sw;
  vec2 dg = sg / sw * 0.75;
  vec3 colonyTint = scol / sw;
  vec3 hc = h31(dot(id, vec2(17.13, 131.7)) + seed);
  vec3 A = vnd(w * 1.15), B = vnd(w * 2.45 + 5.0), C = vnd(w * 5.2 + 9.0);
  float kb = fadeF(2.45, fp), kc = fadeF(5.2, fp);
  float H = 0.42 * clamp(dome, -0.3, 1.0) + 0.3 * A.x + 0.18 * mix(0.5, B.x, kb) + 0.1 * mix(0.5, C.x, kc);
  vec2 g = 0.42 * dg + 0.345 * A.yz + 0.44 * B.yz * kb + 0.52 * C.yz * kc;
  vec3 n = normalize(vec3(-g * 0.4, 1.0));
  // colony texture (height t + gradient for bump lighting)
  vec2 tq = w * 1.7 + hc.yz * 40.0;
  float tfp = fp * 1.7;
  float cfield = vn(w * 0.32 + seed * 0.7) * 0.8 + vn(w * 0.9 + 4.0) * 0.2;
  float ty = hc.x * 5.0;
  float t, k;
  vec2 gr;
  if (ty < 1.2) {        // brain: meanders = contour lines of noise
    vec3 a = vnd(tq * 0.45), b = vnd(tq * 0.93 + 3.0);
    float v = a.x + 0.5 * b.x;
    t = 0.5 + 0.5 * sin(v * 17.0);
    gr = 8.5 * cos(v * 17.0) * (0.45 * a.yz + 0.465 * b.yz);
    k = fadeF(2.5, tfp);
  } else if (ty < 2.4) { // knobby boulder
    vec3 a = vnd(tq * 1.3), b = vnd(tq * 2.7 + 5.0);
    t = 0.65 * a.x + 0.35 * b.x;
    gr = 0.85 * a.yz + 0.95 * b.yz;
    k = fadeF(1.3, tfp);
  } else if (ty < 3.2) { // encrusting ledges
    vec3 a = vnd(tq * 0.35), b = vnd(tq * 1.7 + 2.0);
    float ph = tq.y * 0.9 + 4.0 * a.x;
    t = (0.5 + 0.5 * sin(ph)) * (0.7 + 0.3 * b.x);
    gr = 0.5 * cos(ph) * (vec2(0.0, 0.9) + 1.4 * a.yz) + 0.3 * b.yz;
    k = fadeF(0.35, tfp);
  } else if (ty < 4.1) { // digitate: dense rounded finger tips
    vec2 gq = tq * 2.3 + vec2(0.0, 0.5 * vnd(tq * 0.4).x);
    vec2 gf = fract(gq) - 0.5 + (h22(floor(gq) + 7.0) - 0.5) * 0.4;
    float dd = length(gf);
    t = 1.0 - smoothstep(0.05, 0.45, dd);
    gr = -gf / max(dd, 1e-3) * t * (1.0 - t) * 6.0;
    k = fadeF(2.3, tfp);
  } else {               // polyps
    vec2 gq = tq * 1.5 + 0.6 * vnd(tq * 0.5).x;
    vec2 hg = h22(floor(gq));
    vec2 gf = fract(gq) - 0.5 + (hg - 0.5) * 0.6;
    float dd = length(gf) / (0.6 + 0.6 * hg.x);
    t = (1.0 - smoothstep(0.1, 0.38, dd)) * (0.55 + 0.45 * hg.y);
    gr = -gf / max(length(gf), 1e-3) * t * (1.0 - t) * 7.0;
    k = fadeF(1.5, tfp);
  }
  n = normalize(n - vec3(gr * 0.12 * k, 0.0));
  // albedo: clustered muted colonies, paler tips, darker bases, encrusted rock patches
  vec3 alb = paletteS(fract(cfield * 1.7 + 0.13)) * (0.85 + 0.3 * vn(w * 0.7 + 21.0));
  alb *= mix(vec3(1.0), colonyTint * 1.25, 0.45);
  alb *= mix(0.5, 1.15, smoothstep(0.15, 0.95, H));
  alb = mix(alb, vec3(0.62, 0.58, 0.48), smoothstep(0.78, 1.05, H) * 0.3);
  float rock = smoothstep(0.55, 0.78, vn(w * 0.2 + 11.0));
  alb = mix(alb, vec3(0.38, 0.30, 0.31) * (0.75 + 0.5 * C.x), rock * 0.75);
  alb *= mix(1.0, 0.62 + 0.5 * t, k);
  // occlusion: deep crevices along some colony borders, cavities in the relief
  // occlusion: near-black cavities where the relief is low, soft darkening along colony borders
  float cav = 1.0 - smoothstep(0.02, 0.34, H + 0.1 * vn(w * 3.1 + 5.0));
  float ao = (1.0 - 0.94 * cav) * mix(0.3, 1.0, smoothstep(0.2, 0.85, H));
  float vf = smoothstep(baseY, topY, p.y);
  float edgeUp = exp(-max(topY - p.y, 0.0) * cs * 0.9);
  float diff = max(dot(n, LDIR), 0.0);
  vec2 cq = p * vec2(70.0, 90.0) + seed;
  float c1 = sin(cq.x + 1.7 * sin(cq.y * 0.63 + T * 0.53)) * sin(cq.y + 1.5 * sin(cq.x * 0.71 - T * 0.47));
  float cau = pow(abs(c1), 3.0) * 1.6 * fadeF(0.14, (PX + blur) * 90.0) + 0.3;
  vec3 lit = sunAt(dM) * sunK * (diff * (0.12 + 0.88 * vf) * (0.55 + 0.9 * cau * max(n.y + 0.3, 0.0)) + 0.25 * edgeUp)
           + AMB * (0.3 + 0.6 * vf);
  float gn = fbmR(p * 260.0 + seed, 260.0 * (PX + blur), 5);
  return alb * lit * ao * (1.0 + 0.35 * gn);
}

vec3 segD(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  vec2 v = pa - ba * t;
  float r = mix(ra, rb, t);
  float s = (v.x * ba.y - v.y * ba.x) / (length(ba) * r);
  return vec3(length(v) - r, t, s);
}

// finger and fleshy soft-coral studs poking out of a reef silhouette
vec4 reefStuds(vec2 p, float cw, float hmax, float seed, int mode, float sc, float es, float aa, vec3 sun, float dens) {
  float ci = floor(p.x / cw);
  vec3 h = h31(ci * 3.71 + seed);
  if (h.x > dens) return vec4(0.0);
  float x0 = (ci + 0.3 + 0.4 * h.y) * cw;
  float hF = hmax * (0.45 + 0.55 * h.z);
  float top = reefProfile(x0, mode) + reefEdge(x0, sc, es);
  vec2 q = p - vec2(x0, top - 0.3 * hF);
  if (q.y < -0.05 * hF || q.y > 1.15 * hF || abs(q.x) > 0.5 * cw) return vec4(0.0);
  bool fleshy = h.y > 0.6;
  float sw = 0.04 * sin(T * 0.53 + h.x * 40.0);
  float dm = 1e5, bt = 0.0, bs = 0.0, bz = -1e5;
  for (int i = 0; i < 3; i++) {
    vec3 hr = h31(ci * 7.7 + float(i) * 3.1 + seed);
    float ang = (float(i) - 1.0) * 0.38 + (hr.x - 0.5) * 0.3 + sw;
    float len = hF * (0.55 + 0.45 * hr.y);
    vec2 a = vec2((hr.z - 0.5) * 0.3 * cw, 0.0);
    vec2 b = a + vec2(sin(ang), cos(ang)) * len;
    float r0 = cw * (fleshy ? 0.1 : 0.065), r1 = r0 * (fleshy ? 0.9 : 0.45);
    vec3 d = segD(q, a, b, r0, r1);
    float zz = d.x < 0.0 ? sqrt(max(1.0 - d.z * d.z, 0.0)) * mix(r0, r1, d.y) + hr.x * r0 : -1e4 - d.x;
    dm = min(dm, d.x);
    if (zz > bz) { bz = zz; bt = d.y; bs = d.z; }
    if (!fleshy) {
      vec2 m = mix(a, b, 0.55);
      float an2 = ang + (hr.y > 0.5 ? 0.6 : -0.6);
      vec2 b2 = m + vec2(sin(an2), cos(an2)) * len * 0.38;
      d = segD(q, m, b2, r1 * 1.1, r1 * 0.6);
      zz = d.x < 0.0 ? sqrt(max(1.0 - d.z * d.z, 0.0)) * r1 + hr.x * r0 : -1e4 - d.x;
      dm = min(dm, d.x);
      if (zz > bz) { bz = zz; bt = 0.55 + 0.45 * d.y; bs = d.z; }
    }
  }
  float a = fill(dm, aa) * smoothstep(-0.05 * hF, 0.05 * hF, q.y);
  if (a <= 0.0) return vec4(0.0);
  bs = clamp(bs, -1.0, 1.0);
  vec3 n = normalize(vec3(bs, 0.3, sqrt(max(1.0 - bs * bs, 0.0))));
  vec3 alb = fleshy ? mix(vec3(0.22, 0.20, 0.12), vec3(0.34, 0.27, 0.20), bt)
                    : mix(palette(h.z) * 0.8, vec3(0.66, 0.60, 0.62), smoothstep(0.65, 1.0, bt));
  float ao = 0.3 + 0.7 * smoothstep(0.0, 0.7, q.y / hF);
  vec3 c = alb * (sun * max(dot(n, LDIR), 0.0) * ao * 0.9 + AMB * (0.35 + 0.5 * ao));
  return vec4(c * a, a);
}

// staghorn coral clump. q relative to the clump base, S = height
vec4 staghorn(vec2 q, float S, float seed, float aa, vec3 sun, vec3 tip) {
  if (q.y < -0.12 * S || q.y > 1.12 * S || abs(q.x) > 0.95 * S) return vec4(0.0);
  // coverage from the nearest branch; shading from the front-most branch surface
  float dm = 1e5, tb = 0.0, sb = 0.0, lenb = 1.0, rb = 1.0, bz = -1e5;
  for (int i = 0; i < 9; i++) {
    vec3 hr = h31(seed * 31.7 + float(i) * 7.13);
    float ang = (float(i) / 8.0 - 0.5) * 1.9 + (hr.x - 0.5) * 0.35;
    float len = S * (0.5 + 0.5 * hr.y) * (1.0 - 0.3 * abs(ang));
    vec2 a = vec2((hr.z - 0.5) * 0.4 * S, -0.1 * S);
    float sw = 0.02 * sin(T * 0.47 + hr.x * TAU);
    vec2 b = a + vec2(sin(ang + sw), cos(ang + sw)) * len;
    float r0 = max(S * 0.032, PX * 1.2), r1 = max(S * 0.012, PX * 0.7);
    float zo = hr.x * 0.8 * r0;
    vec3 d = segD(q, a, b, r0, r1);
    float rr = mix(r0, r1, d.y);
    float zz = d.x < 0.0 ? sqrt(max(1.0 - d.z * d.z, 0.0)) * rr + zo : -1e4 - d.x;
    dm = min(dm, d.x);
    if (zz > bz) { bz = zz; tb = d.y; sb = d.z; lenb = len; rb = rr; }
    // two twigs per branch, on alternating sides
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float tt = 0.32 + 0.3 * fk + 0.1 * hr.y;
      vec2 m = mix(a, b, tt);
      float side = (mod(float(i) + fk, 2.0) < 1.0 ? 1.0 : -1.0);
      float ang2 = ang + side * (0.55 + 0.2 * hr.z) + sw;
      vec2 b2 = m + vec2(sin(ang2), cos(ang2)) * len * (0.38 - 0.12 * fk) * (0.7 + 0.5 * hr.z);
      float rm = mix(r0, r1, tt) * 0.85;
      d = segD(q, m, b2, rm, r1 * 0.8);
      rr = mix(rm, r1 * 0.8, d.y);
      zz = d.x < 0.0 ? sqrt(max(1.0 - d.z * d.z, 0.0)) * rr + zo : -1e4 - d.x;
      dm = min(dm, d.x);
      if (zz > bz) { bz = zz; tb = mix(tt, 1.0, d.y); sb = d.z; lenb = len * 0.35; rb = rr; }
    }
  }
  float a = fill(dm, aa) * smoothstep(-0.1 * S, -0.03 * S, q.y);
  if (a <= 0.0) return vec4(0.0);
  sb = clamp(sb, -1.0, 1.0);
  vec3 n = normalize(vec3(sb, 0.25, sqrt(max(1.0 - sb * sb, 0.0))));
  float diff = max(dot(n, LDIR), 0.0);
  float cor = (vn(vec2(tb * lenb / rb * 1.6, sb * 2.0 + seed)) - 0.5) * 2.0 * fadeF(0.3 / rb, aa);
  vec3 alb = mix(vec3(0.50, 0.35, 0.18), tip, smoothstep(0.7, 0.97, tb));
  alb *= 0.85 + 0.15 * cor;
  float ao = 0.45 + 0.55 * smoothstep(-0.1, 0.75, q.y / S);
  vec3 c = alb * (sun * diff * ao * 0.9 + AMB * (0.4 + 0.5 * ao));
  return vec4(c * a, a);
}

vec4 brainCoral(vec2 q, vec2 R, float seed, float aa, vec3 sun) {
  vec2 e = q / R;
  if (e.y < -0.45 || abs(e.x) > 1.45 || dot(e, e) > 1.25 + max(-e.y, 0.0)) return vec4(0.0);
  float r = length(e);
  // contact shadow on whatever lies around the base
  float sh = 0.6 * exp(-pow((e.y + 0.1) / 0.16, 2.0)) * (1.0 - smoothstep(0.85, 1.4, abs(e.x)));
  vec4 shadow = vec4(vec3(0.002, 0.008, 0.012) * sh, sh);
  float a = fill((r - 1.0 - 0.015 * (vn(e * 18.0) - 0.5)) * min(R.x, R.y), aa) * smoothstep(-0.3, 0.05, e.y + 0.08 * (vn(e * 9.0) - 0.5));
  if (a <= 0.0) return shadow;
  float nz = sqrt(max(1.0 - r * r, 0.0));
  float fsh = 0.25 + 0.75 * nz;
  vec2 uv = e / fsh * 2.6 + seed;
  float v = vn(uv) + 0.5 * vn(uv * 2.03 + 5.0) + 0.25 * vn(uv * 4.1 + 2.0);
  float ph = v * 19.0;
  float m = sin(ph);
  float k = fadeF(19.0 * 2.6 * 0.35 / fsh / TAU * 2.0, aa / min(R.x, R.y));
  float ridge = mix(0.55, smoothstep(-0.5, 0.75, m), k);
  vec3 n = normalize(vec3(e, nz + 0.08));
  n = normalize(n + vec3(0.0, 0.25 * cos(ph) * k, 0.0));
  vec3 alb = mix(vec3(0.16, 0.13, 0.06), vec3(0.58, 0.46, 0.24), ridge);
  float diff = max(dot(n, LDIR), 0.0);
  vec3 c = alb * (sun * diff * (0.45 + 0.55 * ridge) + AMB * (0.4 + 0.6 * max(n.y, 0.0)));
  c *= 0.18 + 0.82 * smoothstep(-0.3, 0.45, e.y);
  c *= 1.0 + 0.3 * fbmR(q * 300.0, 300.0 * aa, 4);
  return ftb(vec4(c * a, a), shadow);
}

vec4 tableCoral(vec2 q, float W, float stalk, float seed, float aa, vec3 sun, vec3 alb) {
  float ry = W * 0.16, th = W * 0.11;
  if (abs(q.x) > W * 1.12 || q.y > ry * 1.6 || q.y < -ry - th - stalk - W * 0.15) return vec4(0.0);
  float xn = q.x / W;
  float edge = 1.0 + 0.07 * (n1(xn * 7.0 + seed) - 0.5) + 0.03 * (n1(xn * 29.0 + seed) - 0.5);
  float xr = abs(xn) / edge;
  float yu = ry * sqrt(max(1.0 - xr * xr, 0.0));
  float fr = 0.35 * th * n1(q.x / W * 90.0 + seed) * fadeF(90.0 / W, aa);
  // upward branchlet fringe on the top surface
  float tuft = th * 0.55 * smoothstep(0.35, 0.8, n1(q.x / W * 55.0 + seed * 3.0)) * fadeF(55.0 / W, aa * 0.5);
  float d = max(max(q.y - yu - tuft, -yu - th - fr - q.y), (xr - 1.0) * W);
  float a = fill(d, aa);
  vec4 res = vec4(0.0);
  if (a > 0.0) {
    vec3 c;
    if (q.y > -yu) {
      vec2 e = vec2(xn, q.y / ry);
      float an = atan(e.y, e.x);
      float lines = sin(an * 60.0 + length(e) * 9.0 + 4.0 * n1(an * 6.0 + seed));
      float mott = vn(q / W * vec2(14.0, 40.0) + seed) * 0.6 + vn(q / W * vec2(40.0, 110.0) + seed) * 0.4;
      c = alb * (sun * (0.45 + 0.4 * length(e)) * (0.8 + 0.2 * lines * fadeF(10.0 / W, aa)) * (0.6 + 0.7 * mott) + AMB);
      c *= 1.0 - 0.35 * smoothstep(yu - th * 0.2, yu + tuft, q.y) * step(yu, q.y);
    } else {
      float f = clamp((-yu - q.y) / th, 0.0, 1.0);
      c = alb * (sun * 0.18 * (1.0 - f) + AMB * 0.35);
    }
    res = vec4(c * a, a);
  }
  float st = abs(q.x) - W * (0.07 + 0.05 * smoothstep(-ry - stalk, -ry, q.y));
  float as = fill(st, aa) * step(q.y, -ry * 0.5);
  res = ftb(res, vec4(alb * AMB * 0.25 * as, as));
  // the plate's shadow on the reef beneath it
  float ush = 0.55 * (1.0 - smoothstep(0.7, 1.05, abs(xn))) * smoothstep(-ry - th - stalk - W * 0.15, -ry - th, q.y) * step(q.y, -ry - th);
  res = ftb(res, vec4(vec3(0.0, 0.006, 0.01) * ush, ush));
  return res;
}

vec4 seaFan(vec2 q, float Hf, float seed, float aa, vec3 sun, vec3 alb, float blur) {
  if (q.y < -0.04 * Hf || q.y > Hf * 1.12 || abs(q.x) > Hf * 0.75) return vec4(0.0);
  float hy = clamp(q.y / Hf, 0.0, 1.0);
  q.x -= (0.07 * sin(T * 0.43 + seed) + 0.03 * sin(T * 1.07 + seed * 2.0)) * Hf * hy * hy;
  vec2 e = (q - vec2(0.0, Hf * 0.5)) / vec2(Hf * 0.62, Hf * 0.46);
  float ang = atan(e.x, e.y);
  float r = length(e);
  float edge = 1.0 + 0.12 * (n1(ang * 4.0 + seed) - 0.5) + 0.06 * (n1(ang * 13.0 + seed) - 0.5);
  float shape = fill((r - edge) * Hf * 0.5, aa) * smoothstep(0.03 * Hf, 0.1 * Hf, q.y);
  float rim = 1.0 - 0.6 * smoothstep(edge - 0.35, edge, r);   // thinner, more open toward the rim
  float trunk = fill(abs(q.x) - Hf * 0.022 * (1.2 - hy * 2.0), aa) * (1.0 - smoothstep(0.1, 0.22, hy)) * step(-0.04 * Hf, q.y);
  // mesh: irregular, warped voronoi borders in base-polar coordinates
  vec2 mp = vec2(atan(q.x, q.y + 0.1 * Hf) * 37.0, length(q) / Hf * 49.0) + seed;
  mp += 0.9 * (vec2(vn(mp * 0.13), vn(mp * 0.13 + 7.0)) - 0.5) * 2.0;
  float f1, f2; vec2 id, rr;
  voro(mp, f1, f2, id, rr);
  float cellPx = (aa + blur) / Hf * 49.0;
  float lw = 0.05 + 0.04 * h21(id) + cellPx;
  float mesh = 1.0 - smoothstep(lw * 0.5, lw, f2 - f1);
  // a few thicker radial branches
  float vein = 1.0 - smoothstep(0.0, 0.06 + cellPx * 0.1, abs(fract(mp.x * 0.125 + 0.3 * vn(mp * 0.05)) - 0.5) - 0.0) ;
  float cov = clamp((mesh * 0.8 + vein * 0.35 * (1.0 - hy)) * rim + cellPx * 0.35, 0.0, 1.0);
  float a = max(shape * cov, trunk);
  if (a <= 0.0) return vec4(0.0);
  vec3 c = alb * (sun * (0.22 + 0.28 * hy) + AMB * 0.9);
  c *= 0.65 + 0.6 * vn(mp * 0.4);
  return vec4(c * a, a);
}

// cluster of tube sponges. q relative to the cluster base, S = tallest tube
vec4 tubeSponge(vec2 q, float S, float seed, float aa, vec3 sun, vec3 alb) {
  if (abs(q.x) > 0.7 * S || q.y < -0.06 * S || q.y > 1.15 * S) return vec4(0.0);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 h = h31(seed * 13.0 + float(i) * 5.7);
    float r = S * (0.085 + 0.045 * h.x);
    float ht = S * (0.45 + 0.55 * h.y) * (i == 1 ? 1.0 : 0.8);
    float lean = (h.z - 0.5) * 0.35 + 0.02 * sin(T * 0.29 + h.x * TAU);
    float cx = (float(i) - 1.5) * 0.27 * S + (h.z - 0.5) * 0.08 * S + lean * q.y;
    float rough = 1.0 + 0.07 * (vn(vec2(q.y / r * 2.2, float(i) * 7.0)) - 0.5) + 0.05 * sin(q.y / S * 9.0 + h.x * 9.0);
    float s = (q.x - cx) / (r * rough);
    float lipW = 0.28 + 0.12 * h.z;                       // rim height varies tube to tube
    vec2 e = vec2(q.x - cx - lean * ht + lean * q.y, q.y - ht) / vec2(r * rough, r * lipW);
    float re = length(e);
    float dBody = max(abs(q.x - cx) - r * rough, q.y - ht);
    float dTop = (re - 1.0) * r * lipW;
    float a = max(fill(dBody, aa), fill(dTop, aa)) * smoothstep(-0.06 * S, 0.04 * S, q.y);
    if (a <= 0.0) continue;
    vec3 ab = alb * (0.8 + 0.4 * h.y);
    vec3 c;
    if (re < 1.0 && q.y > ht - r * lipW) {
      float lip = smoothstep(0.6 + 0.15 * h.x, 0.92, re);
      // the inside darkens with depth into the tube
      float depth = clamp((ht + r * lipW * 0.2 - q.y) / (r * lipW * 1.2), 0.0, 1.0);
      c = mix(ab * AMB * mix(0.35, 0.03, depth), ab * (sun * 0.5 + AMB), lip);
    } else {
      float nz = sqrt(max(1.0 - s * s, 0.0));
      float diff = max(dot(normalize(vec3(s, 0.15, nz)), LDIR), 0.0);
      // porous surface: irregular pits plus fine roughness
      vec2 pq = vec2(s * 3.2 * nz, q.y / r * 1.6) + h.xy * 30.0;
      vec2 pc = fract(pq) - 0.5 + (h22(floor(pq)) - 0.5) * 0.5;
      float pit = (1.0 - smoothstep(0.08, 0.2, length(pc) * (0.7 + 0.6 * h21(floor(pq))))) * fadeF(1.6 / r, aa);
      float rgh = vn(vec2(s * 9.0, q.y / r * 5.0) + h.xz * 20.0);
      c = ab * (sun * diff * (0.4 + 0.6 * q.y / max(ht, 1e-3)) + AMB * 0.6) * (0.7 + 0.45 * rgh) * (1.0 - 0.7 * pit);
    }
    acc = ftb(acc, vec4(c * a, a));
  }
  return acc;
}

// bubble-tip anemone: two rings of swaying tentacles radiating from a hidden column
vec4 anemone(vec2 q, float S, float aa, vec3 sun) {
  vec2 c = q + vec2(0.0, 0.55 * S);
  float r = length(c) / S;
  if (r > 1.8 || q.y < -0.12 * S) return vec4(0.0);
  float a = atan(c.x, c.y);
  vec4 acc = vec4(0.0);
  float dA = 0.12;
  for (int l = 0; l < 2; l++) {
    float off = float(l) * 0.5;
    float cmn = (0.13 * sin(T * 0.83 - r * 2.6 + off * 2.0) + 0.05 * sin(T * 1.91 + r * 4.0)) * smoothstep(0.5, 1.6, r);
    float j0 = floor((a - cmn) / dA + off + 0.5);
    for (int jj = -1; jj <= 1; jj++) {
      float j = j0 + float(jj);
      vec3 h = h31(j * 3.17 + float(l) * 51.0);
      float aj = (j - off) * dA + (h.x - 0.5) * 0.4 * dA;
      if (abs(aj) > 1.45) continue;
      float bend = cmn + 0.05 * sin(T * 1.31 + j * 1.7 - r * 3.0) * smoothstep(0.5, 1.5, r);
      float rt = (1.12 + 0.25 * h.y) * (1.0 - 0.18 * aj * aj) - 0.1 * float(l);
      float wd = S * 0.058 * (1.0 - 0.15 * r);
      float arc = (a - aj - bend) * r * S;
      float along = (r - rt) * S;
      float bulb = wd * 1.45;
      float d;
      if (along > -bulb) d = length(vec2(arc, along + bulb)) - bulb;
      else d = abs(arc) - wd;
      d = max(d, (0.45 - r) * S);
      float al = fill(d, aa) * smoothstep(-0.12 * S, 0.06 * S, q.y);
      if (al <= 0.0) continue;
      float s = clamp(arc / (along > -bulb ? bulb : wd), -1.0, 1.0);
      float nz = sqrt(max(1.0 - s * s, 0.0));
      float tipm = smoothstep(rt - 0.24, rt - 0.06, r);
      vec3 alb = mix(vec3(0.30, 0.36, 0.16), vec3(0.75, 0.40, 0.38), smoothstep(0.55, 1.0, r));
      alb = mix(alb, vec3(0.98, 0.20, 0.42), tipm);
      alb = mix(alb, vec3(0.98, 0.80, 0.72), (1.0 - smoothstep(0.0, 0.05, abs(r - (rt - 0.24)))) * 0.55);
      vec3 col = alb * (sun * (0.2 + 0.6 * nz) * (0.7 + 0.3 * r) + AMB * (0.6 + 0.4 * nz));
      col += vec3(0.5, 0.05, 0.2) * tipm * 0.25;
      col *= (l == 0 ? 1.0 : 0.55) * (0.5 + 0.5 * smoothstep(0.45, 0.95, r));
      acc = ftb(acc, vec4(col * al, al));
    }
  }
  return acc;
}

// ---------------------------------------------------------------- layer 4: reef and sand
vec4 sandFloor(vec2 p, vec3 w, float base) {
  float y = p.y;
  float z = CAMH / (YH - y);
  vec2 G = vec2(p.x * z, z);
  float fpz = z * z / CAMH * PX;
  float fpx = z * PX;
  float warp = vn(G * 0.35) * 2.0 + vn(G * 1.3) * 0.5;
  float ph = G.y * 48.0 + G.x * 9.0 + warp * 7.0;
  float kr = fadeF(48.0 / TAU, fpz);
  float slope = (cos(ph) + 0.45 * cos(2.0 * ph + 1.0)) * kr * (0.6 + 0.4 * vn(G * 0.8 + 3.0));
  vec3 alb = vec3(0.74, 0.66, 0.51);
  float ptc = vn(G * 0.45 + 11.0);
  alb *= 0.82 + 0.3 * ptc;
  alb = mix(alb, vec3(0.50, 0.50, 0.36), smoothstep(0.65, 0.9, vn(G * 0.22 + 4.0)) * 0.5);
  float grain = fbmR(G * 70.0, 70.0 * max(fpz, fpx), 5);
  alb *= 1.0 + 0.22 * grain;
  float cau = caustics(G * 1.7, 1.7 * fpz * 1.2);
  float ao = 0.4 + 0.6 * smoothstep(0.0, 0.04, base - y);
  vec3 lit = sunAt(CAMD + CAMH) * (0.72 + 0.28 * slope) * (0.3 + 1.15 * cau) * ao + AMB * (0.7 + 0.3 * ao);
  vec3 c = fogz(alb * lit, z, w);
  float a = 1.0 - smoothstep(0.27, 0.31, y);
  return vec4(c * a, a);
}

vec4 layerReef(vec2 p) {
  if (p.y > 0.72) return vec4(0.0);
  vec3 w = waterCol(p);
  float base = midBase(p.x);
  float zM = CAMH / (YH - base);
  vec3 sun = sunAt(CAMD - 0.2);
  float aa = PX;
  vec4 acc = vec4(0.0);
  // sea fans
  {
    float cw = 0.47;
    float ci = floor((p.x + 0.11) / cw);
    vec3 h = h31(ci * 5.3 + 1.0);
    if (h.x < 0.55) {
      float cx = (ci + 0.3 + 0.4 * h.y) * cw - 0.11;
      float Hf = 0.085 + 0.07 * h.z;
      vec3 fc = h.y < 0.55 ? vec3(0.36, 0.07, 0.22) : vec3(0.55, 0.14, 0.08);
      acc = ftb(acc, fog4(seaFan(p - vec2(cx, midSmooth(cx) + 0.01), Hf, ci * 1.7 + 3.0, aa, sun, fc, 0.0), zM + 0.6, w));
    }
  }
  // table corals
  {
    float cw = 0.61;
    float ci = floor((p.x - 0.2) / cw);
    vec3 h = h31(ci * 9.1 + 4.0);
    if (h.x < 0.6) {
      float cx = (ci + 0.3 + 0.4 * h.y) * cw + 0.2;
      float W = 0.055 + 0.04 * h.z;
      float stalk = 0.008 + 0.006 * h.y;
      float py = midSmooth(cx) + 0.03 + stalk;
      vec3 tc = h.z < 0.5 ? vec3(0.30, 0.25, 0.16) : vec3(0.26, 0.23, 0.28);
      acc = ftb(acc, fog4(tableCoral(p - vec2(cx, py), W, stalk, ci, aa, sun, tc), zM - 0.4, w));
    }
  }
  // staghorn clumps
  {
    float cw = 0.17;
    float ci = floor((p.x + 0.05) / cw);
    vec3 h = h31(ci * 2.9 + 7.0);
    if (h.x < 0.62) {
      float cx = (ci + 0.3 + 0.4 * h.y) * cw - 0.05;
      float S = 0.045 + 0.045 * h.z;
      vec3 tip = h.y < 0.5 ? vec3(0.50, 0.45, 0.78) : vec3(0.80, 0.70, 0.50);
      acc = ftb(acc, fog4(staghorn(p - vec2(cx, midSmooth(cx) + 0.012), S, ci, aa, sun, tip), zM, w));
    }
  }
  // brain coral domes
  {
    float cw = 0.33;
    float ci = floor((p.x - 0.07) / cw);
    vec3 h = h31(ci * 4.3 + 2.0);
    if (h.x < 0.45) {
      float cx = (ci + 0.3 + 0.4 * h.y) * cw + 0.07;
      vec2 R = vec2(1.15, 0.85) * (0.03 + 0.025 * h.z);
      acc = ftb(acc, fog4(brainCoral(p - vec2(cx, midSmooth(cx) + 0.02 - 0.1 * R.y), R, ci * 3.0, aa, sun), zM, w));
    }
  }
  if (acc.a > 0.999) return acc;
  // the reef wall: one continuous coral mass with an irregular top edge
  const float SCm = 0.03;
  float prof = midSmooth(p.x);
  if (p.y < prof + SCm * 1.2 + 0.03) {
    acc = ftb(acc, fog4(reefStuds(p, 0.05, 0.03, 11.0, 0, SCm, 3.7, aa, sun, 0.75), zM * 1.2, w));
    float top = prof + reefEdge(p.x, SCm, 3.7);
    float topR = midSmooth(p.x + PX) + reefEdge(p.x + PX, SCm, 3.7);
    float sl = (topR - top) / PX;
    float a = fill((p.y - top) / sqrt(1.0 + sl * sl), aa) * smoothstep(base - 0.012, base + 0.004, p.y);
    if (a > 0.0 && acc.a < 0.999) {
      vec3 c = reefSurface(p, 26.0, 3.7, top, base, CAMD, 0.0, 1.0);
      acc = ftb(acc, fog4(vec4(c * a, a), zM * 1.3, w));
    }
  }
  if (acc.a > 0.999 || p.y > 0.315) return acc;
  return ftb(acc, sandFloor(p, w, base));
}

// ---------------------------------------------------------------- layer 6: near coral
float nearTop(float x) { return nearSmooth(x) + 0.05; }
vec2 anemoneBase() { float x = AR * 0.5 - 0.42; return vec2(x, nearTop(x) - 0.01); }

vec4 seaGrass(vec2 p, float aa, vec3 sun) {
  if (p.y > 0.27) return vec4(0.0);
  vec4 acc = vec4(0.0);
  for (int s = 0; s < 2; s++) {
    float cw = s == 0 ? 0.019 : 0.014;
    float ci0 = floor(p.x / cw);
    for (int jj = -1; jj <= 1; jj++) {
      float ci = ci0 + float(jj);
      vec3 h = h31(ci * 1.37 + float(s) * 91.0);
      float x0 = (ci + 0.2 + 0.6 * h.x) * cw;
      float env = (1.0 - smoothstep(0.12, 0.5, abs(x0 + 0.04))) * (0.55 + 0.45 * n1(x0 * 9.0));
      if (h.y > env) continue;
      float y0 = -0.03 + 0.03 * h.z;
      float Hb = (0.08 + 0.14 * h.z) * (0.6 + 0.4 * env);
      float t = (p.y - y0) / Hb;
      if (t < 0.0 || t > 1.08) continue;
      float sway = 0.24 * sin(T * 0.61 - x0 * 3.5) + 0.08 * sin(T * 1.37 + h.x * TAU) + 0.15 * (h.x - 0.5);
      float xc = x0 + Hb * sway * t * t;
      float slope = 2.0 * sway * t;
      float wd = 0.0028 * (1.0 - 0.6 * t) * (0.8 + 0.4 * h.y);
      float d = (abs(p.x - xc) - wd) / sqrt(1.0 + slope * slope);
      d = max(d, (t - 1.0) * Hb);
      float al = fill(d, aa);
      if (al <= 0.0) continue;
      float tw = 0.6 + 0.4 * sin(t * 5.0 + h.x * 10.0 + sway * 4.0);
      vec3 alb = mix(vec3(0.07, 0.14, 0.04), vec3(0.26, 0.40, 0.09), smoothstep(0.0, 0.7, t));
      alb = mix(alb, vec3(0.50, 0.56, 0.16), smoothstep(0.7, 1.0, t) * 0.6);
      vec3 col = alb * (sun * (0.2 + 0.5 * t) * tw + AMB * 0.8);
      acc = ftb(acc, vec4(col * al * 0.95, al * 0.95));
    }
  }
  return acc;
}

vec4 layerNear(vec2 p) {
  if (p.y > 0.68) return vec4(0.0);
  vec3 w = waterCol(p);
  float blur = 0.001 + 0.002 * (1.0 - smoothstep(0.0, 0.3, p.y));
  float aa = PX + blur;
  float z = 2.8;
  vec3 sun = sunAt(CAMD - 0.8);
  vec4 acc = vec4(0.0);
  float xl = -AR * 0.5, xr = AR * 0.5;
  acc = ftb(acc, fog4(seaGrass(p, aa, sun), 2.5, w));
  float sx = xl + 0.15;
  acc = ftb(acc, fog4(staghorn(p - vec2(sx, nearTop(sx) - 0.06), 0.40, 3.0, aa, sun, vec3(0.62, 0.62, 0.86)), z, w));
  float sx2 = xl + 0.63;
  acc = ftb(acc, fog4(tubeSponge(p - vec2(sx2, nearSmooth(sx2) + 0.03), 0.2, 8.0, aa, sun, vec3(0.30, 0.16, 0.30)), z + 0.8, w));
  vec2 A = anemoneBase();
  acc = ftb(acc, fog4(anemone(p - A, 0.08, aa, sun), z, w));
  float fx = xr - 0.12;
  acc = ftb(acc, fog4(seaFan(p - vec2(fx, nearTop(fx) - 0.03), 0.32, 5.0, aa, sun, vec3(0.20, 0.05, 0.11), blur), 3.6, w));
  float bx = xl + 0.39;
  acc = ftb(acc, fog4(brainCoral(p - vec2(bx, nearSmooth(bx) + 0.02), vec2(0.13, 0.105), 2.0, aa, sun), z, w));
  const float SCn = 0.07;
  float prof = nearSmooth(p.x);
  if (acc.a < 0.999 && p.y < prof + SCn * 1.2 + 0.06) {
    acc = ftb(acc, fog4(reefStuds(p, 0.09, 0.055, 23.0, 1, SCn, 17.0, aa, sun, 0.7), z, w));
    float top = prof + reefEdge(p.x, SCn, 17.0);
    float topR = nearSmooth(p.x + PX) + reefEdge(p.x + PX, SCn, 17.0);
    float sl = (topR - top) / PX;
    float a = fill((p.y - top) / sqrt(1.0 + sl * sl), aa);
    if (a > 0.0 && acc.a < 0.999) {
      vec3 c = reefSurface(p, 17.0, 17.0, top, top - 0.3, CAMD + 0.4, blur * 0.3, 0.55) * vec3(1.3, 1.02, 0.85);
      acc = ftb(acc, fog4(vec4(c * a, a), z, w));
    }
  }
  return acc;
}

// ---------------------------------------------------------------- layer 5: reef fish
vec4 layerFish(vec2 p0) {
  vec4 acc = vec4(0.0);
  // clownfish pair hosted by the anemone (they share its parallax)
  vec2 pn = p0 + u_par * 0.03 * 1.05;
  vec2 A = anemoneBase();
  if (abs(pn.x - A.x) < 0.2 && pn.y > A.y - 0.02 && pn.y < A.y + 0.22) {
    vec3 w = waterCol(pn);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float t1 = T * 0.23 + fi * 2.4, t2 = T * 0.61 + fi * 1.3;
      vec2 c = A + vec2(0.06 * sin(t1) + 0.02 * sin(t2), 0.085 + 0.02 * sin(T * 0.37 + fi * 0.9) + 0.01 * sin(T * 0.83 + fi));
      float vx = 0.06 * 0.23 * cos(t1) + 0.02 * 0.61 * cos(t2);
      float face = vx / (abs(vx) + 0.0035);
      float sz = i == 0 ? 0.062 : 0.05;
      vec2 q = (pn - c) / sz;
      q.x /= sign(face + 1e-4) * max(abs(face), 0.3);
      vec4 f = fish(q, 2, T * 11.0 + fi * 2.0, PX / sz / max(abs(face), 0.3), sunAt(CAMD - 0.8), fi);
      acc = ftb(acc, fog4(f, 2.9, w));
    }
  }
  // lanes, nearest first; each lane has its own parallax from its distance
  vec2 pp;
  pp = p0 + u_par * 0.03 * 1.0;
  acc = ftb(acc, fishLane(pp, 1.0, 3.2, 0.50, 0.07, -1.0, 0.24, 0.20, 0.30, 0.25, 1, 0));
  pp = p0 + u_par * 0.03 * 0.92;
  acc = ftb(acc, fishLane(pp, 2.0, 4.6, 0.37, 0.06, 1.0, 0.26, 0.24, 0.50, 0.25, 0, 1));
  pp = p0 + u_par * 0.03 * 0.82;
  acc = ftb(acc, fishLane(pp, 3.0, 6.5, 0.47, 0.07, -1.0, 0.22, 0.24, 0.60, 0.5, 1, 0));
  pp = p0 + u_par * 0.03 * 0.72;
  acc = ftb(acc, fishLane(pp, 4.0, 9.5, 0.40, 0.05, 1.0, 0.20, 0.25, 0.60, 0.5, 0, 1));
  return acc;
}

// ---------------------------------------------------------------- layer 7: bubbles and marine snow
vec4 snow(vec2 p, float cell, float r, float blur, float amt, float seed, float fallV, float driftV) {
  vec2 sh = vec2(mod(u_time, 64.0 * cell / driftV) * driftV, -mod(u_time, 64.0 * cell / fallV) * fallV);
  vec2 g = (p - sh) / cell;
  vec2 id = floor(g);
  vec2 cm = mod(id, 64.0);
  vec3 h = h31(dot(cm, vec2(1.0, 64.0)) + seed);
  if (h.x > 0.4) return vec4(0.0);
  vec2 c = 0.22 + 0.56 * h.yz + 0.05 * vec2(sin(T * 0.31 + h.x * 40.0), cos(T * 0.23 + h.y * 30.0));
  float d = length((g - id - c) * cell);
  float rr = r * (0.5 + h.z);
  float sig = max(rr, PX * 0.8) + blur;
  float a = exp(-d * d / (sig * sig)) * min(rr * rr / (sig * sig), 1.0) * amt * (0.4 + 0.6 * h.y);
  if (blur > 0.0) a = (1.0 - smoothstep(sig * 0.85, sig, d)) * amt * (0.6 + 0.4 * smoothstep(sig * 0.5, sig * 0.9, d)) * (0.4 + 0.6 * h.y);
  vec3 col = vec3(0.75, 0.93, 0.95) * (0.7 + 1.3 * clamp(p.y, 0.0, 1.0));
  return vec4(col * a, a);
}

vec4 bubbleStream(vec2 p, float x0, float src, float seed) {
  if (abs(p.x - x0) > 0.09 || p.y < src) return vec4(0.0);
  float hgt = p.y - src;
  float bend = 0.05 * hgt * sin(T * 0.13 + seed) + 0.02 * hgt;
  float ch = 0.034;
  float v = 0.10 + 0.02 * h11(seed);
  float P = 64.0 * ch / v;
  float Y = p.y - mod(u_time, P) * v;
  float cy = floor(Y / ch);
  vec3 hb = h31(mod(cy, 64.0) * 1.7 + seed * 9.1);
  if (hb.x > 0.72) return vec4(0.0);
  float r = mix(0.0022, 0.0085, hb.y * hb.y) * (1.0 + 0.6 * hgt);
  float by = (cy + 0.5 + 0.25 * (hb.z - 0.5)) * ch;
  float bx = x0 + bend + (hb.z - 0.5) * 0.014 + 0.006 * sin(Y * 37.0 + hb.y * TAU) * (0.3 + 2.0 * hgt);
  vec2 e = vec2(p.x - bx, Y - by);
  e = e / (r * vec2(1.12 + 0.06 * sin(T * 3.1 + hb.x * 30.0), 0.86));
  float d = length(e);
  float aa = PX / r;
  float inside = fill(d - 1.0, aa);
  if (inside <= 0.0) return vec4(0.0);
  float rim = smoothstep(0.55, 0.98, d);
  float hi = 1.0 - smoothstep(0.1, 0.3, length(e - vec2(-0.38, 0.42)));
  float lo = (1.0 - smoothstep(0.05, 0.16, length(e - vec2(0.32, -0.5)))) * 0.5;
  float a = clamp(0.06 + rim * 0.7 + hi + lo, 0.0, 1.0) * inside;
  a *= smoothstep(0.0, 0.03, hgt) * (1.0 - smoothstep(0.9, 0.99, p.y));
  vec3 col = mix(vec3(0.6, 0.88, 0.98) * 1.4, vec3(4.0), clamp(hi + lo, 0.0, 1.0));
  return vec4(col * a, a);
}

vec4 layerParticles(vec2 p) {
  vec4 acc = vec4(0.0);
  acc = ftb(acc, snow(p, 0.11, 0.011, 0.006, 0.10, 7.0, 0.012, 0.010));
  float xl = -AR * 0.5, xr = AR * 0.5;
  acc = ftb(acc, bubbleStream(p, xl + 0.27, nearTop(xl + 0.27) + 0.02, 1.0));
  acc = ftb(acc, bubbleStream(p, xr - 0.29, nearTop(xr - 0.29) + 0.02, 2.0));
  acc = ftb(acc, bubbleStream(p, xl + 0.50, nearTop(xl + 0.50) + 0.03, 3.0));
  acc = ftb(acc, snow(p, 0.045, 0.0016, 0.0, 0.55, 3.0, 0.007, 0.006));
  acc = ftb(acc, snow(p, 0.03, 0.0009, 0.0, 0.40, 5.0, 0.004, 0.004));
  return acc;
}

// ---------------------------------------------------------------- compositing
vec4 layerK(int k, vec2 p) {
  vec2 par = u_par * 0.03;
  if (k == 0) return layerWater(p);
  if (k == 1) return layerFar(p + par * 0.12);
  if (k == 2) return layerRays(p + par * 0.22);
  if (k == 3) return layerSchool(p + par * 0.38);
  if (k == 4) return layerReef(p + par * 0.62);
  if (k == 5) return layerFish(p);
  if (k == 6) return layerNear(p + par * 1.05);
  return layerParticles(p + par * 1.3);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

vec4 toDisplay(vec4 c, float vig) {
  if (c.a <= 1e-5) return vec4(0.0);
  vec3 col = c.rgb / c.a;
  col = pow(aces(col * 1.05), vec3(1.0 / 2.2)) * vig;
  return vec4(col * c.a, c.a);
}

void main() {
  PX = 1.0 / u_res.y;
  AR = u_res.x / u_res.y;
  T = mod(u_time, 628.3185307);
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 uv = gl_FragCoord.xy / u_res;
  float vig = 1.0 - 0.3 * pow(clamp(length((uv - 0.5) * vec2(1.0, 0.85)) * 1.3, 0.0, 1.0), 2.5);
  float dith = (h21(gl_FragCoord.xy) + h21(gl_FragCoord.xy + 71.3) - 1.0) / 255.0;
  if (u_layer >= 0.0) {
    vec4 c = toDisplay(layerK(int(u_layer + 0.5), p), vig);
    fragColor = vec4(clamp(c.rgb + dith * c.a, 0.0, c.a), c.a);
    return;
  }
  vec4 acc = vec4(0.0);
  for (int k = 7; k >= 0; k--) {
    acc = ftb(acc, toDisplay(layerK(k, p), vig));
    if (acc.a > 0.997) break;
  }
  fragColor = vec4(acc.rgb + dith, 1.0);
}
`,
}
