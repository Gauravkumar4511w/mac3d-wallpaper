// Valley of Flowers — the real Bhyundar valley in Uttarakhand's Garhwal
// Himalaya (Chamoli district, ~3,600 m, a UNESCO World Heritage Site) in its
// July–August monsoon bloom. Modelled on photographs of the valley:
//   · glaciated peaks at the valley head (the Gauri Parbat / Rataban massif)
//     wrapped in towering monsoon cumulus, lammergeiers circling above;
//   · steep glacial walls converging on the head: birch and fir forest cut by
//     bright avalanche chutes, grassy ledges, grey cliffs streaked with
//     waterfalls, snow bridges left in the gullies, cloud banks clinging on;
//   · the milky Pushpawati river over its stony bed through the meadows;
//   · a meadow of Himalayan balsam, white Selinum umbels, yellow Inula,
//     Wallich's geranium, pink bistort and the rare Himalayan blue poppy,
//     with tortoiseshells, clouded yellows and little blues on the wing.
//
// The valley walls are inclined planes in perspective: (Z, W) is distance
// along the valley and height on the wall, so gullies, forest and waterfalls
// all foreshorten towards the valley head the way they do in the photographs.
//
// Every layer is rendered in linear light, tone-mapped and gamma-encoded on
// its own, so the full scene is exactly the back-to-front "over" composite of
// the isolated layers shown in the exploded view.

export default {
  id: 'valleyofflowers',
  name: 'Valley of Flowers',
  tag: 'Uttarakhand, India',
  accent: '#d63c86',
  accent2: '#4f7fe0',
  ink: '#8e1d55',
  glow: '#ffd3e8',
  light: true,
  clockColor: '#15243a',
  stillTime: 100.05, // butterflies spread across the meadow, wings open
  sky: 'linear-gradient(180deg,#2c5aa8 0%,#7c9ed2 16%,#e8edf3 30%,#f2f2f0 40%,#9aa7b4 50%,#3f5f36 56%,#5f8d2c 63%,#7fa63a 70%,#4b7322 80%,#8a4b74 90%,#35521c 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Monsoon sky', depth: 0 },
    { name: 'Himalayan peaks', depth: 0.1 },
    { name: 'Valley walls', depth: 0.28 },
    { name: 'Drifting cloud', depth: 0.4 },
    { name: 'Pushpawati river', depth: 0.55 },
    { name: 'Meadow', depth: 0.8 },
    { name: 'Wildflowers', depth: 1.0 },
    { name: 'Butterflies', depth: 1.15 },
    { name: 'Foreground blooms', depth: 1.3 },
  ],
  clockAfter: 1,
  frag: /* glsl */ `
#define TAU 6.2831853
#define TP 600.0
#define PK 0.030
#define VX 0.10
#define YH 0.468
#define MS 0.55
#define CLS 10.0
#define WPER 256.0

float SHADE = 1.0; // cloud-shadow factor on direct sun (set per layer / row)
float TM;   // u_time folded into a 600 s loop; oscillators are quantised to it
float PX;   // one pixel in scene units (height-relative)
float AA;   // half-width of an anti-aliased edge
float VIG;  // lens vignette (same for every layer, so layers still composite exactly)
int ZI;     // a zero the compiler cannot see: keeps big loops as loops instead of unrolling them

// late-morning sun, high and a little to the right, behind the viewer
const vec3 SUNC = vec3(1.0, 0.89, 0.74);
const vec3 LDIR = vec3(0.279, 0.659, 0.699);
const vec3 AMB = vec3(0.34, 0.45, 0.66);
const mat2 RF = mat2(0.80, 0.60, -0.60, 0.80);

float sat(float x) { return clamp(x, 0.0, 1.0); }
float sq(float x) { return x * x; }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

// seamless oscillator: frequency snapped to the TP loop
float wavt(float f, float ph, float t) { return sin(TAU * fract(floor(f * TP + 0.5) / TP * t) + ph); }
float wav(float f, float ph) { return wavt(f, ph, TM); }

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
// value noise, periodic in x
float vnP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mod(i.x, per), b = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(a, i.y)), h12(vec2(b, i.y)), u.x), mix(h12(vec2(a, i.y + 1.0)), h12(vec2(b, i.y + 1.0)), u.x), u.y);
}
float gq(vec2 i, vec2 f) { return dot(h22(i) * 2.0 - 1.0, f); }
float gn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(gq(i, f), gq(i + vec2(1.0, 0.0), f - vec2(1.0, 0.0)), u.x),
             mix(gq(i + vec2(0.0, 1.0), f - vec2(0.0, 1.0)), gq(i + 1.0, f - 1.0), u.x), u.y);
}
// gradient noise, periodic in x
float gnP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = mod(i.x, per), b = mod(i.x + 1.0, per);
  return mix(mix(gq(vec2(a, i.y), f), gq(vec2(b, i.y), f - vec2(1.0, 0.0)), u.x),
             mix(gq(vec2(a, i.y + 1.0), f - vec2(0.0, 1.0)), gq(vec2(b, i.y + 1.0), f - 1.0), u.x), u.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec4 over(vec4 b, vec4 f) { return f + b * (1.0 - f.a); }

float billow(vec2 s, float per, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    v += w * a * abs(gnP(s, per)) * 2.0;
    s = s * 2.0 + vec2(0.0, 3.1);
    per *= 2.0; a *= 0.5;
  }
  return v;
}
float fbmP(vec2 s, float per, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    v += w * a * gnP(s, per);
    s = s * 2.0 + vec2(0.0, 5.7);
    per *= 2.0; a *= 0.5;
  }
  return v;
}
// value-noise fbm in [0,1]; missing (filtered) octaves keep the mean
float fbm(vec2 p, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    v += w * a * (vn(p) - 0.5);
    p = RF * p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return 0.5 + v;
}
float ridgeP(float x, float oct) {
  float h = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 10; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    float n = 1.0 - abs(g1(x * f + float(i) * 3.71));
    h += w * a * n * n;
    f *= 2.07; a *= 0.48;
  }
  return h;
}
float rid2(vec2 p, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    float n = 1.0 - abs(gn(p) * 1.6);
    s += w * a * n * n;
    p = p * 2.1 + vec2(1.7, 9.2);
    a *= 0.56;
  }
  return s;
}
// ridged relief, zero-mean-ish: crests (spurs) positive, gullies negative
float ridged(vec2 p, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    float n = 1.0 - abs(gn(p) * 1.7);
    v += w * a * (n * n - 0.42);
    p = p * 2.04 + vec2(1.7, 9.2);
    a *= 0.52;
  }
  return v;
}
vec3 litAlb(vec3 alb, float sun, float amb) { return alb * (SUNC * 2.0 * sun * SHADE + AMB * 0.55 * amb); }

// ---------------------------------------------------------------- sky
vec3 skyBase(vec2 p) {
  float h = sat((p.y - 0.44) / 0.56);
  vec3 c = mix(vec3(0.52, 0.62, 0.76), vec3(0.22, 0.40, 0.76), smoothstep(0.0, 0.40, h));
  c = mix(c, vec3(0.065, 0.18, 0.52), smoothstep(0.30, 1.0, h));
  c += vec3(0.09, 0.08, 0.06) * smoothstep(-0.3, 1.0, p.x) * (1.0 - 0.6 * h);
  return c;
}
// aerial perspective: cool Rayleigh blue, a touch warmer towards the sun side
vec3 hazeCol(float x, float y) {
  return vec3(0.47, 0.56, 0.70) + vec3(0.07, 0.06, 0.04) * smoothstep(-0.5, 0.9, x) - vec3(0.05, 0.04, 0.0) * smoothstep(0.50, 0.75, y);
}
// what distance does to the dark valley walls and floor: a veil of blue-grey air
vec3 hazeW(float x, float y) { return hazeCol(x, y) * vec3(0.62, 0.68, 0.76); }

// towering monsoon cumulus behind the head of the valley
float cuTop(float x) {
  return 0.585 + 0.17 * exp(-sq((x + 0.07) / 0.11)) + 0.21 * exp(-sq((x - 0.12) / 0.09)) + 0.09 * exp(-sq((x + 0.28) / 0.12))
       + 0.12 * exp(-sq((x - 0.36) / 0.10)) + 0.15 * exp(-sq((x - 0.60) / 0.12)) + 0.11 * exp(-sq((x + 0.60) / 0.13))
       + 0.10 * exp(-sq((x + 1.0) / 0.2)) + 0.10 * exp(-sq((x - 1.0) / 0.18)) + 0.035 * g1(x * 6.0 + 2.0) + 0.015 * g1(x * 15.0);
}
vec4 cumulus(vec2 p, vec3 sky) {
  if (p.y < 0.48 || p.y > 0.93) return vec4(0.0);
  float dr = mod(u_time, 3000.0) * (CLS / 3000.0);
  float sc = 11.0;
  vec2 s = vec2(p.x - dr, p.y) * sc;
  float oct = clamp(log2(0.5 / (sc * PX)), 2.0, 6.5);
  float b = billow(s, CLS * sc, oct);
  // a slower, counter-drifting coarse layer: the cloud boils as it moves
  float bb = billow(vec2(p.x + dr, p.y) * 5.5 + vec2(0.0, 1.7), CLS * 5.5, 3.0);
  b = 0.72 * b + 0.28 * bb;
  float top = cuTop(p.x);
  float e = min(top + 0.085 * (b - 0.45), top + 0.035) - p.y;
  float dens = smoothstep(0.0, 0.03, e);
  if (dens <= 0.0) return vec4(0.0);
  float b2 = billow(s + vec2(0.40, 0.32), CLS * sc, min(oct, 4.0));
  float hgt = sat((p.y - 0.52) / max(top - 0.52, 0.06));
  float lit = sat(0.42 + (b - b2) * 2.6 + 0.40 * hgt);
  float inner = sat(e / 0.12);
  vec3 col = mix(vec3(0.38, 0.44, 0.56), SUNC * 1.50, lit);
  col *= mix(1.0, 0.86, inner * (1.0 - hgt));
  col += SUNC * 0.75 * smoothstep(0.016, 0.0, e) * (0.4 + 0.6 * lit);
  col = mix(col, sky, 0.10 + 0.25 * smoothstep(0.60, 0.50, p.y));
  return vec4(col, 1.0) * dens;
}
// scattered fair-weather cumulus on a perspective cloud plane, high up
vec4 cloudsHigh(vec2 p, vec3 sky) {
  if (p.y < 0.78) return vec4(0.0);
  float dy = p.y - 0.42;
  float z = 0.30 / dy;
  vec2 cq = vec2(p.x * z, z * 1.5) * 2.0;
  float fy = PX * z * z / 0.30 * 1.5 * 2.0;
  float oct = clamp(log2(0.5 / fy), 2.0, 8.0);
  vec2 s0 = cq - vec2(mod(u_time, 6000.0) * (24.0 / 6000.0), 0.0);
  float n = fbmP(s0, 24.0, min(oct, 4.0)) + 0.35 * (billow(s0 * 2.0 + 7.0, 48.0, oct - 1.0) - 0.45);
  float cov = 0.10 + 0.22 * smoothstep(0.96, 0.82, p.y);
  float dens = sat((n - cov) * 3.0);
  if (dens <= 0.0) return vec4(0.0);
  float n2 = fbmP(s0 + vec2(0.10, -0.16), 24.0, min(oct, 3.0));
  float lit = sat(0.6 + (n - n2) * 3.5);
  vec3 c = mix(vec3(0.46, 0.53, 0.68), SUNC * 1.45, lit);
  c *= mix(1.0, 0.85, dens * dens);
  return vec4(c, 1.0) * dens * smoothstep(0.78, 0.86, p.y);
}
// lammergeiers soaring in slow circles
float raptor(vec2 p, float id) {
  float w = TAU * floor((0.0042 + 0.0011 * id) * TP + 0.5) / TP;
  float an = TM * w + id * 2.4;
  vec2 c = vec2(-0.50 + 1.02 * id, 0.905 - 0.035 * id) + vec2(0.075 * cos(an), 0.020 * sin(an));
  float S = 0.0105 - 0.0025 * id;
  vec2 l = (p - c) / S;
  if (dot(l, l) > 1.6) return 0.0;
  l = rot(0.22 * cos(an)) * l;
  float ax = abs(l.x);
  float k = AA / S;
  float wy = 0.06 * ax - 0.09 * ax * ax;
  float th = 0.085 * (1.0 - 0.5 * ax) + 0.02;
  float wing = smoothstep(th + k, th - k, abs(l.y - wy)) * smoothstep(1.0 + k, 1.0 - k, ax);
  float body = smoothstep(1.0 + 3.0 * k, 1.0 - 3.0 * k, length(vec2(l.x / 0.055, (l.y + 0.05) / 0.22)));
  float tl = -l.y - 0.18;
  float tail = step(0.0, tl) * step(tl, 0.20) * smoothstep(0.05 + 0.25 * tl + k, 0.05 + 0.25 * tl - k, ax);
  return max(max(wing, body), tail);
}
vec4 skyLin(vec2 p) {
  vec3 sky = skyBase(p);
  vec3 c = sky;
  vec4 cl = cloudsHigh(p, sky);
  c = c * (1.0 - cl.a) + cl.rgb;
  cl = cumulus(p, sky);
  c = c * (1.0 - cl.a) + cl.rgb;
  float b = max(raptor(p, 0.0), raptor(p, 1.0));
  c = mix(c, vec3(0.05, 0.05, 0.06), b * 0.9);
  return vec4(c, 1.0);
}

// ---------------------------------------------------------------- peaks at the valley head
float pkEnv(float x) {
  return 0.500 + 0.165 * exp(-sq((x - 0.19) / 0.115)) + 0.105 * exp(-sq((x + 0.07) / 0.12))
       + 0.090 * exp(-sq((x - 0.43) / 0.12)) + 0.05 * exp(-sq((x + 0.33) / 0.15)) + 0.045 * exp(-sq((x - 0.68) / 0.14));
}
float pkH(float x, float oct) { return pkEnv(x) + 0.05 * (ridgeP(x * 3.4 + 7.1, oct) - 0.5); }
// cloud wrapped around the foot of the massif
vec4 wrapCloud(vec2 q) {
  float yb = 0.552 + 0.012 * sin(q.x * 6.0 + 1.0) + 0.006 * sin(q.x * 15.0);
  float env = exp(-sq((q.y - yb) / 0.026)) * smoothstep(-0.45, -0.15, q.x) * smoothstep(0.75, 0.50, q.x);
  if (env < 0.02) return vec4(0.0);
  float dr = mod(u_time, 3000.0) * (CLS / 3000.0);
  float sc = 16.0;
  vec2 s = vec2(q.x - dr, q.y) * sc;
  float oct = clamp(log2(0.5 / (sc * PX)), 2.0, 7.0);
  float b = billow(s, CLS * sc, oct);
  float d = sat((b * env - 0.20) * 3.2);
  if (d <= 0.0) return vec4(0.0);
  float b2 = billow(s + vec2(0.3, 0.35), CLS * sc, min(oct, 3.0));
  float lit = sat(0.5 + (b - b2) * 2.5 + 0.25 * (q.y - yb) / 0.026);
  vec3 col = mix(vec3(0.46, 0.52, 0.62), SUNC * 1.35, lit);
  col = mix(col, hazeCol(q.x, q.y), 0.25);
  return vec4(col, 1.0) * d * 0.92;
}
vec4 peaksLin(vec2 p) {
  vec2 q = p + u_par * (0.10 * PK);
  float x = q.x;
  if (q.y < 0.44 || q.y > 0.72) return vec4(0.0);
  vec4 cl = wrapCloud(q);
  float oct = clamp(log2(0.35 / (3.4 * PX)), 3.0, 9.0);
  float H = pkH(x, oct);
  float af = smoothstep(AA, -AA, q.y - H);
  if (af <= 0.0) return cl;
  float depth = H - q.y;
  float e = 0.004;
  float s = clamp((pkH(x + e, 4.5) - pkH(x - e, 4.5)) / (2.0 * e), -3.5, 3.5);
  float sEnv = clamp((pkEnv(x + 0.02) - pkEnv(x - 0.02)) / 0.04, -2.5, 2.5);
  // ribs and couloirs fanning down the fall line
  float xb = x + depth * sEnv * 0.55;
  float wid = 1.0 / (1.0 + depth * 5.0);
  float eb = 0.0014;
  float F0 = 0.6 * sq(1.0 - abs(g1(xb * 9.0 * wid + 1.3))) + 0.4 * sq(1.0 - abs(g1(xb * 23.0 * wid + 4.1)));
  float F1 = 0.6 * sq(1.0 - abs(g1((xb + eb) * 9.0 * wid + 1.3))) + 0.4 * sq(1.0 - abs(g1((xb + eb) * 23.0 * wid + 4.1)));
  float dF = (F1 - F0) / eb;
  float bfade = 1.0 - smoothstep(0.04, 0.12, depth);
  vec2 gp = vec2((x + depth * sEnv * 0.5) * 16.0, q.y * 11.0);
  float go = clamp(log2(0.4 / (16.0 * PX)), 1.0, 6.0);
  float e0 = rid2(gp, go);
  float ex = rid2(gp + vec2(0.06, 0.0), go) - e0;
  float ey = rid2(gp + vec2(0.0, 0.06), go) - e0;
  float topw = 1.0 - smoothstep(0.0, 0.05, depth);
  vec3 N = normalize(vec3(-s * 0.9 * topw - dF * 0.03 * bfade - ex * 7.0, 0.5 - ey * 5.0, 0.9));
  float dif = max(dot(N, LDIR), 0.0);
  float steep = abs(N.x) / max(N.z, 0.2);
  // heavily glaciated: snow and ice everywhere but the steepest ribs
  float snow = smoothstep(0.512, 0.545, q.y + 0.03 * (F0 - 0.5) + 0.025 * (0.45 - e0) + 0.008 * gn(q * 60.0));
  snow *= 1.0 - 0.85 * smoothstep(1.1, 2.2, steep) * smoothstep(0.30, 0.55, F0 + 0.3 * e0);
  snow *= smoothstep(0.98, 0.72, e0);
  float grain = 1.0 + 0.25 * (vn(vec2(x * 300.0, q.y * 380.0)) - 0.5) * smoothstep(1.5, 0.5, PX * 300.0);
  vec3 rock = mix(vec3(0.15, 0.14, 0.13), vec3(0.08, 0.08, 0.085), F0) * grain;
  vec3 alb = mix(rock, vec3(0.90, 0.92, 0.96) * (0.95 + 0.05 * grain), snow);
  float occ = 0.6 + 0.4 * mix(e0, F0, 0.5);
  vec3 c = alb * (SUNC * 2.6 * dif + AMB * 0.75 * occ * (0.6 + 0.4 * N.y));
  vec3 haze = hazeCol(x, q.y);
  c = mix(c, haze, 0.30 + 0.25 * smoothstep(0.60, 0.48, q.y));
  return over(vec4(c, 1.0) * af, cl);
}

// ---------------------------------------------------------------- valley walls
// (Z, W) on an inclined valley wall: Z is distance along the valley, W height
// on the wall. side -1 = left wall, +1 = right wall.
vec2 wallZW(vec2 q, float side) {
  float a = side * (q.x - VX);
  float b = q.y - YH;
  float Z = 1.0 / max(a - MS * b, 0.0025);
  return vec2(Z, b * Z);
}
// summits and saddles along the crest (low frequency in Z: real peaks are
// broad, so they must not turn into needles as the wall recedes)
float crestW(float Z, float side, float oct) {
  float r = ridgeP(Z * 0.55 + (side < 0.0 ? 3.1 : 11.7), min(oct, 3.0));
  return (side < 0.0 ? 0.84 : 0.66) + 0.36 * (r - 0.36) - 0.12 * smoothstep(1.6, 6.0, Z);
}
// canopy of Himalayan birch and fir seen across the valley: (shade, birch share)
vec2 crowns(vec2 P, float side, float fz, float fw) {
  float kz = 120.0, kw = 100.0;
  float fp = max(kz * fz, kw * fw);
  float det = smoothstep(0.9, 0.35, fp);
  if (det <= 0.0) return vec2(0.55, 0.5);
  float s = 0.22, bsh = 0.5;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 cp = vec2(P.x * kz, P.y * kw) + fk * vec2(0.5, 0.37);
    vec2 ci = floor(cp), cf = fract(cp);
    vec4 h = h42(ci + side * 13.0 + fk * 29.0);
    vec2 d = cf - (0.5 + (h.xy - 0.5) * 0.55);
    float fir = step(0.5, h.z);
    float sz = 0.26 + 0.26 * h.w * h.w;
    float sd = fir > 0.5 ? max(abs(d.x) * 1.5 + d.y * 0.6 - sz * 0.8, -d.y - sz) : length(d * vec2(1.0, 1.15)) - sz;
    float soft = 0.06 + 0.5 * fp;
    float ins = smoothstep(soft, -soft, sd);
    float lit = sat(0.55 + 0.6 * (d.y - side * 0.4 * d.x) / sz);
    float v = mix(0.55, 1.15, lit) * (0.75 + 0.5 * h.w);
    s = mix(s, v, ins * (k == 0 ? 1.0 : 0.85));
    bsh = mix(bsh, 1.0 - fir, ins);
  }
  return vec2(mix(0.55, s, det), mix(0.5, bsh, det));
}
// waterfalls spilling down the gullies (monsoon-fed)
vec4 falls(vec2 P, float side, float fz) {
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    if (side < 0.0 && i == 1) break;
    float Z0 = side < 0.0 ? 1.70 : (i == 0 ? 1.52 : 2.35);
    float Wt = side < 0.0 ? 0.58 : 0.62 - 0.10 * fi;
    float Wb = 0.03 + 0.04 * fi;
    if (P.y > Wt + 0.01 || P.y < Wb - 0.03) continue;
    // the stream wanders down its gully, vanishing behind rock in places
    float zc = Z0 + 0.014 * sin(P.y * 17.0 + fi * 2.3 + side) + 0.006 * sin(P.y * 47.0 + fi) + 0.03 * (Wt - P.y);
    float wz = 0.0022 + 0.0035 * sat((Wt - P.y) / Wt);
    float aaz = max(fz * 0.8, 1e-6);
    float dz = abs(P.x - zc);
    float m = smoothstep(wz + aaz, max(wz - aaz, 0.0), dz) * min(1.0, wz / aaz);
    m *= smoothstep(Wt + 0.01, Wt - 0.02, P.y) * smoothstep(Wb - 0.03, Wb + 0.03, P.y);
    m *= mix(0.25, 1.0, smoothstep(0.30, 0.55, vn(vec2(fi * 13.0 + side * 5.0, P.y * 11.0))));
    if (m <= 0.0) continue;
    float fl = vnP(vec2(P.y * 140.0 + TM * (64.0 * 80.0 / TP), (P.x - zc) / wz * 1.5 + fi * 7.0), 64.0);
    vec3 col = vec3(0.80, 0.84, 0.88) * (0.6 + 0.5 * fl) * (SUNC * 1.5 + AMB * 0.8);
    acc = over(acc, vec4(col, 1.0) * m * (0.45 + 0.35 * fl));
  }
  return acc;
}
vec4 wallSide(vec2 q, float side) {
  vec2 P = wallZW(q, side);
  float Z = P.x, W = P.y;
  if (Z > 380.0) return vec4(0.0);
  float fz = PX * Z * Z;                         // Z units per pixel
  float fw = PX * Z * (1.0 + MS * max(W, 0.0));  // W units per pixel
  float oc = clamp(log2(0.5 / (0.55 * fz)) + 1.0, 0.0, 9.0);
  // crest: broad summits along the valley plus screen-space crags on the skyline
  float oq = clamp(log2(0.3 / (8.0 * PX)), 2.0, 8.0);
  float jag = 0.011 * (ridgeP(q.x * 8.0 + side * 5.0, oq) - 0.35);
  float Wc = crestW(Z, side, oc) + jag * Z * (1.0 + MS * 0.75);
  float aw = 0.75 * fw + 0.4 * fz;
  float a = smoothstep(aw, -aw, W - Wc);
  if (a <= 0.0) return vec4(0.0);
  // the valley is closed by the spur at its head: the walls end there
  a *= smoothstep(30.0, 22.0, Z);
  if (a <= 0.0) return vec4(0.0);
  // Surface detail lives in T = (log-distance, height): what you see of a wall at
  // a grazing angle is the camera-facing side of its spurs, so features shrink
  // with distance without stretching into streaks towards the vanishing point.
  vec2 T = vec2(log(Z) * 1.3, W) + (side < 0.0 ? vec2(0.0) : vec2(17.0, 5.0));
  float ft = PX * Z * 1.3;   // T units per pixel (both axes, roughly)
  // relief: big buttresses and bowls, then branching gullies (domain-warped so they wander)
  float wo = clamp(log2(0.5 / (2.0 * ft)) + 1.0, 0.0, 3.0);
  vec2 warp = 0.35 * vec2(gn(T * vec2(2.0, 2.6)), gn(T * vec2(2.0, 2.6) + 9.0)) * min(wo, 1.0);
  float ob = clamp(log2(0.5 / (2.2 * ft)) + 1.0, 0.0, 2.0);
  float ro = clamp(log2(0.5 / (7.0 * ft)) + 1.0, 0.0, 3.0);
  vec2 rb = vec2(T.x * 2.2, T.y * 1.6) + warp * 0.9;
  vec2 rf = vec2(T.x * 7.0, T.y * 4.6) + warp * 2.2;
  float ez = 0.012, ew = 0.015;
  float R = 0.70 * ridged(rb, ob) + 0.30 * ridged(rf, ro);
  float Rt = (0.70 * ridged(rb + vec2(ez * 2.2, 0.0), ob) + 0.30 * ridged(rf + vec2(ez * 7.0, 0.0), ro) - R) / ez;
  float Rw = (0.70 * ridged(rb + vec2(0.0, ew * 1.6), ob) + 0.30 * ridged(rf + vec2(0.0, ew * 4.6), ro) - R) / ew;
  // the wall surface is pushed towards the valley by k*R: its true normal
  // (view space, z towards the viewer) follows from the two tangents
  float kd = 0.16;
  vec3 N = normalize(vec3(-side, MS - kd * Rw, kd * Rt * 1.6));
  float dif = max(dot(N, LDIR), 0.0);
  float occ = sat(0.55 + 1.4 * R);
  float A = fbm(vec2(T.x * 2.2, W * 3.0) + side * 7.0, clamp(log2(0.5 / (3.0 * ft)) + 1.0, 0.0, 3.0));
  // cloud shadows sweeping across the wall (with the wind, to screen-right)
  float csd = vnP(vec2(T.x * 1.6 + side * mod(u_time, 1800.0) * (32.0 / 1800.0), W * 2.2 + side * 5.0), 32.0);
  SHADE = 1.0 - 0.6 * smoothstep(0.50, 0.72, csd);
  // vegetation zones: the left wall is greener, the right wall rockier
  float L = side < 0.0 ? 1.0 : 0.0;
  float tl = mix(0.24, 0.46, L) + 0.18 * (A - 0.5) + 0.35 * R;
  float forest = smoothstep(tl + 0.02, tl - 0.02, W);
  forest *= smoothstep(-0.16, -0.04, R + 0.12 * (A - 0.5));   // avalanche chutes stay open
  float rl = mix(0.34, 0.62, L);
  float rock = smoothstep(rl - 0.05, rl + 0.05, W + 0.45 * R + 0.25 * (A - 0.5));
  rock = max(rock, smoothstep(0.15, 0.30, R) * smoothstep(rl - 0.25, rl, W) * 0.8);
  float lg = smoothstep(0.55, 0.72, vn(vec2(T.x * 18.0, W * 40.0 + T.x * 4.0)));
  rock *= 1.0 - 0.75 * lg * smoothstep(0.85, 0.3, 40.0 * ft);   // grassy ledges
  forest *= 1.0 - rock;
  // snow: high gully fills, and avalanche snow bridges at the foot
  float snow = smoothstep(Wc - 0.16, Wc - 0.06, W) * smoothstep(-0.02, -0.14, R) * smoothstep(0.35, 0.6, A);
  snow = max(snow, smoothstep(0.06, 0.02, W) * smoothstep(-0.16, -0.26, R) * step(0.72, h11(floor(T.x * 7.0 + 0.5) + side)));
  // albedos
  float shf = smoothstep(0.8, 0.3, 50.0 * ft);
  vec3 grass = mix(vec3(0.060, 0.150, 0.026), vec3(0.135, 0.205, 0.042), A);
  if (shf > 0.0 && forest + rock < 0.99) grass *= 1.0 - 0.45 * shf * smoothstep(0.62, 0.78, vn(vec2(T.x * 40.0, W * 50.0)));   // dwarf rhododendron scrub
  float sf = smoothstep(0.8, 0.3, 110.0 * ft) * step(0.01, rock);
  float strata = sf > 0.0 ? vn(vec2(T.x * 30.0, W * 110.0 + T.x * 9.0)) : 0.5;
  vec3 rk = mix(vec3(0.15, 0.148, 0.14), vec3(0.09, 0.092, 0.095), A) * (0.8 + 0.45 * mix(0.5, strata, sf));
  rk *= 1.0 - 0.35 * smoothstep(-0.05, -0.2, R);   // wet, dark rock in the gullies
  vec2 cr = forest > 0.01 ? crowns(vec2(T.x, W), side, ft, ft) : vec2(0.55, 0.5);
  vec3 fo = mix(vec3(0.010, 0.026, 0.014), vec3(0.028, 0.058, 0.020), cr.y) * cr.x * 1.35 * (0.75 + 0.5 * A);
  vec3 alb = mix(grass, fo, forest);
  alb = mix(alb, rk, rock);
  alb = mix(alb, vec3(0.80, 0.84, 0.90), snow);
  vec3 c = alb * (SUNC * 2.4 * dif * SHADE * mix(1.0, occ, 0.5) + AMB * 0.55 * occ * (0.5 + 0.5 * N.y));
  vec4 wf = falls(P, side, PX * Z * Z);
  c = c * (1.0 - wf.a) + wf.rgb * mix(1.0, SHADE, 0.5);
  float hz = 0.85 * (1.0 - exp(-max(Z - 1.05, 0.0) * 0.06));
  c = mix(c, hazeW(q.x, q.y), 0.05 + 0.95 * hz);
  return vec4(c, 1.0) * a;
}
// the dark rock spur at the head of the valley, in front of the snow peaks
float spurH(float x, float oct) {
  return 0.468 + 0.088 * exp(-sq((x - 0.12) / 0.15)) + 0.045 * exp(-sq((x + 0.07) / 0.08))
       + 0.030 * exp(-sq((x - 0.33) / 0.07)) + 0.022 * (ridgeP(x * 7.0 + 2.2, oct) - 0.4);
}
vec4 spur(vec2 q) {
  float oct = clamp(log2(0.4 / (7.0 * PX)), 2.0, 8.0);
  float H = spurH(q.x, oct);
  float a = smoothstep(AA, -AA, q.y - H);
  if (a <= 0.0) return vec4(0.0);
  float e = 0.003;
  float s = (spurH(q.x + e, 4.0) - spurH(q.x - e, 4.0)) / (2.0 * e);
  vec2 bp = q * vec2(28.0, 40.0) + vec2(3.1, 0.7);
  float go = clamp(log2(0.4 / (40.0 * PX)), 1.0, 5.0);
  float b0 = rid2(bp, go);
  float bx = rid2(bp + vec2(0.07, 0.0), go) - b0;
  float by = rid2(bp + vec2(0.0, 0.07), go) - b0;
  float depth = H - q.y;
  float topw = 1.0 - smoothstep(0.0, 0.02, depth);
  vec3 Nn = normalize(vec3(-s * 0.7 * topw - bx * 8.0, 0.55 - by * 5.0, 0.9));
  float dif = max(dot(Nn, LDIR), 0.0);
  float snow = smoothstep(0.52, 0.545, q.y + 0.02 * (0.5 - b0) + 0.01 * gn(q * 80.0)) * smoothstep(0.35, 0.55, 1.0 - b0);
  float green = smoothstep(0.50, 0.485, q.y + 0.01 * gn(q * 50.0));
  vec3 alb = mix(vec3(0.10, 0.10, 0.10), vec3(0.05, 0.10, 0.03), green);
  alb = mix(alb, vec3(0.85, 0.88, 0.92), snow);
  vec3 c = alb * (SUNC * 2.3 * dif + AMB * 0.65 * (0.6 + 0.4 * Nn.y));
  c = mix(c, hazeW(q.x, q.y), 0.60);
  return vec4(c, 1.0) * a;
}
vec4 wallsLin(vec2 p) {
  vec2 q = p + u_par * (0.28 * PK);
  if (q.y < 0.40) return vec4(0.0);
  SHADE = 1.0;
  vec4 acc = wallSide(q, q.x < VX ? -1.0 : 1.0);
  if (acc.a < 0.999) acc = over(spur(q), acc);
  return acc;
}

// ---------------------------------------------------------------- drifting monsoon cloud
// a cloud bank lying along a wall at height Wm (wall coordinates, so it
// foreshortens with the wall); it drifts with the wind
vec4 cloudBank(vec2 q, float side, float Wm, float Ww, float z0, float z1, float thr, float seed) {
  vec2 P = wallZW(q, side);
  if (P.x > 60.0) return vec4(0.0);
  float env = exp(-sq((P.y - Wm) / Ww)) * smoothstep(z0, z0 + 0.4, P.x) * smoothstep(z1, z1 * 0.7, P.x);
  if (env < 0.03) return vec4(0.0);
  float sc = 2.6;
  float oct = clamp(log2(0.5 / (sc * PX * P.x * 1.6)) + 1.0, 1.0, 6.0);
  float dr = mod(u_time, 2400.0) * (16.0 / 2400.0);
  vec2 s = vec2(log(P.x) * 1.3 * sc + side * dr, P.y * sc * 2.2) + seed;
  float n = fbmP(s, 16.0, oct) * 1.1 + 0.5;
  float d = sat((n * env - thr) * 2.2);
  if (d <= 0.0) return vec4(0.0);
  float n2 = fbmP(s + vec2(0.0, 0.45), 16.0, min(oct, 3.0)) * 0.9 + 0.5;
  float lit = sat(0.55 + (n - n2) * 2.5);
  vec3 col = mix(vec3(0.50, 0.56, 0.66), SUNC * 1.30, lit);
  float hz = 1.0 - exp(-max(P.x - 1.0, 0.0) * 0.10);
  col = mix(col, hazeCol(q.x, q.y), hz * 0.8);
  return vec4(col, 1.0) * d * 0.88;
}
vec4 mistLin(vec2 p) {
  vec2 q = p + u_par * (0.40 * PK);
  if (q.y < 0.44) return vec4(0.0);
  vec4 acc = q.x < VX ? cloudBank(q, -1.0, 0.50, 0.17, 1.3, 8.0, 0.34, 0.0)
                      : cloudBank(q, 1.0, 0.66, 0.14, 1.2, 3.2, 0.33, 13.0);
  // a low veil lying in the head of the valley
  float yb = 0.485;
  float env = exp(-sq((q.y - yb) / 0.014)) * exp(-sq((q.x - VX) / 0.30));
  if (env > 0.03) {
    float dr = mod(u_time, 2400.0) * (16.0 / 2400.0);
    float n = fbmP(vec2(q.x * 10.0 - dr, q.y * 40.0), 16.0, 4.0) * 0.9 + 0.5;
    float d = sat((n * env - 0.32) * 2.5) * 0.45;
    vec3 col = mix(hazeCol(q.x, q.y), SUNC * 1.1, 0.3);
    acc = over(vec4(col, 1.0) * d, acc);
  }
  return acc;
}

// ---------------------------------------------------------------- valley floor and the Pushpawati
// where the valley floor meets the foot of the walls: two lines running into the
// vanishing point at the valley head
float floorTop(float x) {
  float d = x - VX;
  return YH - 0.006 - abs(d) * (d < 0.0 ? 0.040 : 0.036) + 0.003 * g1(x * 13.0 + 1.0) + 0.0015 * g1(x * 37.0 + 4.0);
}
// river centre (lateral ground units) at distance Z: out of the valley head,
// then sweeping right through the meadows
float rivC(float Z) { return 5.0 * pow(sat((40.0 - Z) / 28.0), 1.5) + 0.55 * sin(Z * 0.23 + 1.0) - 0.35; }
// slow cloud shadows sweeping over the ground (g = lateral, distance), seamless loop
float cloudShade(vec2 g) {
  float d = mod(u_time, 1800.0) * (32.0 / 1800.0);
  return 1.0 - 0.45 * smoothstep(0.52, 0.76, vnP(vec2(g.x * 0.25 - d, g.y * 0.09), 32.0));
}
// rounded boulders standing on the ground plane (two depth rows, so tall ones aren't cut)
vec4 boulders(vec2 q, vec2 g, float seed, float dens) {
  vec4 acc = vec4(0.0);
  float cz = floor(g.y / 2.0);
  for (int k = 0; k < 2; k++) {
    float zc = cz - float(k);
    float Zr = (zc + 0.5) * 2.0;
    if (Zr < 2.0) continue;
    float cx = floor((q.x - VX) * Zr / 1.6);
    vec4 h = h42(vec2(cx, zc) + seed);
    if (h.z > dens) continue;
    float Zb = (zc + 0.2 + 0.6 * h.y) * 2.0;
    float gx = (cx + 0.2 + 0.6 * h.x) * 1.6;
    vec2 sc = vec2(VX + gx / Zb, YH - 1.0 / Zb);
    float r = (0.10 + 0.22 * h.w * h.w) / Zb;
    if (r < 0.5 * PX) continue;
    vec2 l = (q - sc) / r;
    if (l.y < -0.2 || dot(l, l) > 1.6) continue;
    float sh = length(l * vec2(1.0, 1.25 + 0.4 * h.x));
    float m = smoothstep(1.0 + AA / r, 1.0 - AA / r, sh) * smoothstep(-0.15, 0.0, l.y);
    if (m <= 0.0) continue;
    vec3 n = normalize(vec3(l.x, l.y * 1.2 + 0.3, sqrt(max(1.0 - sh * sh, 0.0)) + 0.2));
    float dif = max(dot(n, LDIR), 0.0);
    float tex = vn(l * 6.0 + h.xy * 50.0);
    vec3 alb = mix(vec3(0.17, 0.165, 0.155), vec3(0.11, 0.115, 0.10), tex) * (0.85 + 0.3 * h.x);
    alb = mix(alb, vec3(0.08, 0.12, 0.05), smoothstep(0.1, -0.15, l.y) * 0.6);   // moss at the base
    vec3 c = alb * (SUNC * 2.3 * dif * SHADE + AMB * 0.55 * (0.5 + 0.5 * n.y));
    acc = over(acc, vec4(c, 1.0) * m);
  }
  return acc;
}
vec4 floorLin(vec2 p) {
  vec2 q = p + u_par * (0.55 * PK);
  float ft = floorTop(q.x);
  float top = ft;
  if (q.y > top + 2.0 * AA || q.y < 0.30) return vec4(0.0);
  float a = smoothstep(AA, -AA, q.y - top);
  if (a <= 0.0) return vec4(0.0);
  float D = max(YH - q.y, 0.006);
  float Z = 1.0 / D;
  vec2 g = vec2((q.x - VX) * Z, Z);
  float fl = PX * Z;       // lateral ground units per pixel
  float fd = PX * Z * Z;   // distance units per pixel
  SHADE = cloudShade(g);
  // rolling ground: lit and shaded swells of the glacial floor
  float o1 = clamp(log2(0.5 / max(0.8 * fl, 0.3 * fd)) + 1.0, 0.0, 5.0);
  vec2 hg = g * vec2(0.8, 0.30);
  float hh = fbm(hg, o1);
  float hx = fbm(hg + vec2(0.06, 0.0), o1) - hh;
  float hz = fbm(hg + vec2(0.0, 0.06), o1) - hh;
  float slope = sat(0.78 + hx * 9.0 + hz * 6.0);
  float m1 = vn(g * vec2(0.35, 0.12) + 3.0);
  vec3 alb = mix(vec3(0.042, 0.115, 0.020), vec3(0.105, 0.185, 0.030), smoothstep(0.3, 0.8, m1));
  float tf = smoothstep(0.9, 0.4, max(3.0 * fl, 1.2 * fd));
  alb *= 0.85 + 0.3 * mix(0.5, vn(g * vec2(3.0, 1.2) + 7.0), tf);
  // flower washes in the far meadow: pink balsam, white umbels, yellow Inula
  float fpk = smoothstep(0.55, 0.75, vn(g * vec2(1.2, 0.45) + 21.0));
  float fwh = smoothstep(0.60, 0.80, vn(g * vec2(1.4, 0.5) + 37.0));
  float fye = smoothstep(0.66, 0.84, vn(g * vec2(1.0, 0.4) + 53.0));
  alb = mix(alb, vec3(0.40, 0.10, 0.25), fpk * 0.22);
  alb = mix(alb, vec3(0.50, 0.52, 0.46), fwh * 0.18);
  alb = mix(alb, vec3(0.46, 0.36, 0.04), fye * 0.15);
  // birch groves and dwarf-rhododendron thickets
  float gv = vn(g * vec2(0.45, 0.16) + 11.0) * 0.65 + vn(g * vec2(1.3, 0.5) + 2.0) * 0.35;
  float grove = smoothstep(0.56, 0.64, gv + 0.12 * smoothstep(0.20, 0.5, abs(q.x - VX)));
  float cdet = smoothstep(0.9, 0.4, max(6.0 * fl, 2.5 * fd));
  float ct = vn(g * vec2(6.0, 2.5));
  vec3 gc = vec3(0.016, 0.040, 0.018) * mix(0.6, 0.35 + 0.8 * ct, cdet) * 1.6;
  float gsh = smoothstep(0.62, 0.70, vn((g - vec2(0.4, -0.5)) * vec2(0.45, 0.16) + 11.0) * 0.65 + vn((g - vec2(0.4, -0.5)) * vec2(1.3, 0.5) + 2.0) * 0.35);
  alb *= 1.0 - 0.45 * gsh * (1.0 - grove);
  alb = mix(alb, gc, grove);
  // birch and fir thickets along the foot of the walls
  float edge = smoothstep(ft - 0.0045 - 0.003 * vn(vec2(q.x * 160.0, 1.0)), ft - 0.0005, q.y);
  alb = mix(alb, vec3(0.016, 0.040, 0.018) * (0.6 + 0.8 * vn(vec2(q.x * 900.0, q.y * 600.0))), edge);
  // the Pushpawati: milky glacial water over a wide stony bed
  float rc = rivC(Z);
  float dl = g.x - rc;
  float rw = 0.16 + 0.05 * sin(Z * 0.7 + 1.0);
  float bw = rw * 1.6 + 0.15 * vn(vec2(Z * 0.8, 1.0));
  float bed = smoothstep(bw + fl, bw - fl, abs(dl)) * (1.0 - edge);
  float wat = smoothstep(rw + fl, rw - fl, abs(dl)) * (1.0 - edge);
  vec3 gravel = vec3(0.13, 0.13, 0.12) * (0.75 + 0.5 * mix(0.5, vn(g * vec2(9.0, 3.0)), smoothstep(0.9, 0.4, 9.0 * fl)));
  alb = mix(alb, gravel, bed);
  vec3 c = alb * (SUNC * 2.2 * slope * SHADE + AMB * 0.55);
  if (wat > 0.0) {
    vec2 fs = vec2(Z * 2.2 + TM * (64.0 * 30.0 / TP), dl / rw * 1.2);
    float fo = vnP(fs, 64.0) * 0.6 + vnP(fs * vec2(2.3, 2.0) + 5.0, 128.0) * 0.4;
    float foam = smoothstep(0.42, 0.75, fo) * mix(0.55, 1.0, smoothstep(0.3, 1.0, abs(dl) / rw));
    vec3 body = vec3(0.16, 0.24, 0.25) * (SUNC * 1.4 + AMB * 0.7);
    vec3 refl = skyBase(vec2(q.x, 0.62));
    vec3 w = mix(body, refl, 0.60);
    w = mix(w, vec3(0.86, 0.88, 0.90) * (SUNC * 1.6 + AMB * 0.6) * SHADE, foam * 0.85);
    vec2 sp = vec2(Z * 9.0, dl / rw * 4.0);
    vec4 sh = h42(floor(sp) + 3.0);
    float tw2 = pow(max(0.0, sin(TAU * fract(TM * floor((0.5 + 1.0 * sh.z) * TP) / TP) + sh.w * TAU)), 12.0);
    w += SUNC * 6.0 * step(0.86, sh.x) * tw2 * smoothstep(0.35, 0.0, length(fract(sp) - 0.5));
    c = mix(c, w, wat);
  }
  // boulders across the floor and in the riverbed
  vec4 bo = boulders(q, g, 91.0, 0.10 + 0.45 * bed);
  c = c * (1.0 - bo.a) + bo.rgb;
  float hzf = 0.85 * (1.0 - exp(-Z * 0.010));
  c = mix(c, hazeW(q.x, 0.46), 0.03 + 0.97 * hzf);
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- meadow
// wind gusts over the ground plane (g = (x / depth, 1 / depth)); drifts downwind, loops seamlessly
float gustF(vec2 g) {
  float d = mod(u_time, TP) * (WPER / TP);
  vec2 n = vec2(g.x * 1.7 - d, g.y * 0.45);
  return smoothstep(0.30, 0.90, vnP(n, WPER));
}
// the near meadow rolls up to a low rise, and climbs towards the foot of each wall
float meadowTop(float x) {
  float d = abs(x - VX);
  return 0.402 + 0.034 * smoothstep(0.25, 1.0, d) + 0.005 * g1(x * 4.3 + 7.0) + 0.003 * g1(x * 11.0);
}

// t: 0 balsam, 1 umbel, 2 Inula, 3 geranium, 4 blue poppy, 5 bistort
vec3 flowerAlb(float t, float v) {
  if (t < 0.5) return mix(vec3(0.58, 0.12, 0.38), vec3(0.45, 0.15, 0.50), v);   // Himalayan balsam
  if (t < 1.5) return vec3(0.80, 0.80, 0.70);                                  // Selinum umbels
  if (t < 2.5) return mix(vec3(0.86, 0.55, 0.012), vec3(0.88, 0.42, 0.010), v); // Inula
  if (t < 3.5) return mix(vec3(0.30, 0.13, 0.62), vec3(0.44, 0.17, 0.62), v);   // Wallich's geranium
  if (t < 4.5) return vec3(0.20, 0.38, 0.86);                                  // blue poppy
  return vec3(0.72, 0.26, 0.40);                                               // pink bistort
}
// regional drifts (g = (x / (depth + 0.12), -log depth)): balsam carpets everywhere,
// umbels and yellow Inula in drifts, geranium where the balsam thins
vec4 driftW(vec2 g) {
  float A = vn(g * vec2(1.0, 1.5) + 11.0);
  float B = vn(g * vec2(2.4, 4.6) + 41.0);
  float C = vn(g * vec2(1.7, 3.0) + 71.0);
  return vec4(0.16 + smoothstep(0.42, 0.62, A) * 1.3, 0.06 + smoothstep(0.52, 0.68, B) * 1.0,
              0.03 + smoothstep(0.60, 0.75, C) * 0.7, 0.05 + smoothstep(0.42, 0.25, A) * 0.6);
}
float pickType(vec4 w, float u) {
  u *= w.x + w.y + w.z + w.w;
  if (u < w.x) return 0.0;
  u -= w.x;
  if (u < w.y) return 1.0;
  u -= w.y;
  return u < w.z ? 2.0 : 3.0;
}
vec4 meadowLin(vec2 p) {
  vec2 q = p + u_par * (0.80 * PK);
  float mt = meadowTop(q.x);
  float fr = 0.0025 * n1(q.x * 420.0) * smoothstep(3.0, 1.0, PX * 840.0);
  if (q.y > mt + 0.004) return vec4(0.0);
  float a = smoothstep(AA, -AA, q.y - mt - fr);
  if (a <= 0.0) return vec4(0.0);
  float D = max(YH - q.y, 0.004);
  float Z = 1.0 / D;
  vec2 g = vec2(q.x * Z, Z);
  float lz = -log(D);
  float gust = gustF(g);
  SHADE = cloudShade(vec2((q.x - VX) * Z, Z));
  float m1 = vn(g * vec2(1.2, 0.5));
  float m2 = vn(g * vec2(3.0, 1.2) + 3.0);
  vec3 lo = mix(vec3(0.009, 0.030, 0.008), vec3(0.020, 0.050, 0.010), m1);
  vec3 hi = mix(vec3(0.055, 0.145, 0.024), vec3(0.120, 0.190, 0.034), m2 * m2);
  vec3 sunG = SUNC * 2.0 * (0.85 + 0.45 * gust) * SHADE;
  float bfar = smoothstep(0.9, 0.35, PX / (D * 0.011));
  float base = mix(0.50, 0.24, bfar);
  vec3 c = mix(lo, hi, base) * (sunG * mix(0.3, 1.0, base) + AMB * 0.45);
  // flowers: drift-weighted types that shrink and pack towards the distance until
  // only a colour wash of the drifts remains
  vec4 w = driftW(vec2(q.x / (D + 0.12), lz));
  float tot = w.x + w.y + w.z + w.w;
  vec3 lt = SUNC * 1.9 * SHADE + AMB * 0.5;
  vec3 wash = (w.x * flowerAlb(0.0, 0.3) + w.y * flowerAlb(1.0, 0.0) + w.z * flowerAlb(2.0, 0.0) + w.w * flowerAlb(3.0, 0.3)) / tot * lt;
  float pres0 = min(tot, 1.0) * smoothstep(0.44, 0.22, D);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float cs = k == 0 ? 0.06 : (k == 1 ? 0.04 : 0.027);
    float fpc = PX / (cs * D);
    float far = smoothstep(0.12, 0.5, fpc);
    float pres = pres0 * (0.85 - 0.15 * fk);
    c = mix(c, wash * 0.85, far * pres * 0.24 * (0.6 + 0.8 * m2));
    if (far >= 1.0) continue;
    float rowc = lz / cs + fk * 0.61;
    float ri = floor(rowc);
    float Dr = exp(-(ri + 0.5 - fk * 0.61) * cs);
    vec2 lc = vec2(q.x / (cs * Dr) + gust * 0.6 + h11(ri + fk * 7.0) * 50.0, rowc);
    vec2 ci = floor(lc), cf = fract(lc);
    vec4 h = h42(ci + fk * 31.0);
    if (h.w > pres) continue;
    float t = pickType(w, h.z);
    vec3 fa = flowerAlb(t, h.x);
    float r = (0.09 + 0.06 * h.y) * (t > 0.5 && t < 1.5 ? 1.2 : 1.0) * (t > 1.5 ? 0.8 : 1.0);
    vec2 cc = vec2(0.5 + (h.x - 0.5) * 0.6, 0.62 + 0.25 * (h.y - 0.5));
    vec2 dv = cf - cc;
    float dd = t > 0.5 && t < 1.5 ? length(dv * vec2(0.8, 1.9)) : (t < 0.5 ? min(length(dv - vec2(0.03, 0.0)), length(dv + vec2(0.05, 0.06))) * 1.15 : length(dv * vec2(1.0, 1.25)));
    float m = smoothstep(r + fpc, r - fpc, dd) * (1.0 - far);
    float stem = smoothstep(0.03 + fpc, 0.03 - fpc, abs(cf.x - cc.x + dv.y * 0.15)) * step(cf.y, cc.y) * (1.0 - far);
    float lit = 0.9 + 0.35 * sat(dv.x / r) - 0.25 * sat(-dv.x / r);
    vec3 fc = fa * (SUNC * 1.9 * lit * SHADE + AMB * 0.5) + fa * SUNC * 0.35 * SHADE;
    if (t > 1.5 && t < 2.5) fc = mix(fc, vec3(0.6, 0.25, 0.01) * 1.6, smoothstep(r * 0.4 + fpc, r * 0.4 - fpc, dd));
    c = mix(c, vec3(0.03, 0.07, 0.015) * (SUNC * 1.5 + AMB * 0.4), stem * 0.85);
    c = mix(c, fc, m);
  }
  // screen-upright blades and strap leaves in staggered log-depth rows
  float bval = 0.0, bm = 0.0;
  for (int rr = 1; rr >= 0; rr--) {
    for (int s = 0; s < 2; s++) {
      float fs = float(s);
      float rz = lz * 6.5 + fs * 0.5;
      float ri = floor(rz) - float(rr);
      float rf = rz - ri;
      float Dr = exp(-(ri + 0.5 - fs * 0.5) / 6.5);
      float bwid = Dr * 0.011;
      float fpx = PX / bwid;
      float u = q.x / bwid + h11(ri + fs * 50.0) * 137.0;
      float ui = floor(u), uf = fract(u);
      vec4 h = h42(vec2(ui, ri + fs * 71.0));
      float hb = 0.7 + 0.7 * h.x;
      float t = (rf - 0.6 * h.z) / hb;
      float lean = (h.y - 0.5) * 0.4 + gust * 0.25 - 0.1;
      float cx = 0.5 + (h.z - 0.5) * 0.3 + lean * t * t;
      float w2 = (h.w > 0.6 ? 0.55 * sin(3.14159 * min(t + 0.1, 1.0)) : 0.40 * (1.0 - t));
      float m = (t < 1.0 && t > 0.0) ? smoothstep(w2 + fpx, w2 - fpx, abs(uf - cx)) : 0.0;
      m *= smoothstep(0.7, 0.3, fpx);
      bval = mix(bval, mix(0.15, 1.0, t) * (0.65 + 0.6 * h.w), m);
      bm = max(bm, m);
    }
  }
  vec3 bc = mix(lo, hi, bval) * (sunG * mix(0.3, 1.0, bval) + AMB * 0.45) + vec3(0.03, 0.035, 0.008) * gust * bval;
  c = mix(c, bc, bm);
  c = mix(c, hazeCol(q.x, 0.40), 0.12 * smoothstep(0.17, 0.12, D));
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- flower heads (l in units of R)
// Two shared code paths (GPU threads drawing different species then run the same
// code instead of one branch after another): cluster heads and radial heads.
//
// Cluster heads. Himalayan balsam: a loose raceme of hooded, slipper-shaped
// lilac-pink florets. Selinum: a domed compound umbel of small white umbellets
// on fine rays from the stem tip (the stem tip is at (0, -0.85)).
vec4 clusterHead(vec2 l, float aal, float sd, bool umb) {
  if (abs(l.x) > 1.2 + aal || l.y > 1.15 || l.y < (umb ? -0.9 : -0.8)) return vec4(0.0);
  float det = smoothstep(0.30, 0.10, aal);
  vec4 acc = vec4(0.0);
  vec3 base = umb ? vec3(0.80, 0.80, 0.70) : mix(vec3(0.58, 0.12, 0.38), vec3(0.45, 0.15, 0.50), h11(sd * 17.0));
  vec3 rc = litAlb(vec3(0.09, 0.16, 0.05), 0.8, 1.0);
  // the raceme's turn: one rotation per plant, none per floret
  vec2 cs = vec2(cos(sd * TAU), sin(sd * TAU));
  int n = umb ? 6 : 4;
  for (int i = ZI; i < 6; i++) {
    if (i >= n) break;
    float fi = float(i);
    vec4 hf = h42(vec2(sd * 97.0, fi + 3.0));
    vec2 d;
    float e, ea;
    if (umb) {
      float u = (fi - 2.5) / 2.5;
      vec2 c = vec2(u * 0.58 + 0.07 * (hf.x - 0.5), 0.36 * sqrt(max(1.0 - u * u, 0.0)) - 0.04 + 0.08 * (hf.y - 0.5));
      float rr = 0.25 + 0.06 * hf.z;
      if (l.y < c.y && det > 0.0) {
        vec2 pa = l - vec2(0.0, -0.85), ba = c - vec2(0.0, -0.85);
        float hs = sat(dot(pa, ba) / dot(ba, ba));
        float ray = smoothstep(0.022 + aal, 0.022 - aal, length(pa - ba * hs)) * det * step(hs, 0.9);
        acc = over(vec4(rc, 1.0) * ray, acc);
      }
      d = (l - c) / rr;
      d.y *= 1.3;
      float d2 = dot(d, d);
      if (d2 > 1.4) continue;
      e = sqrt(d2) + 0.045 * det * sin(d.x * 9.0 + fi * 3.0) * sin(d.y * 7.0 + fi);
      ea = aal / rr;
    } else {
      // four florets a quarter-turn apart around the tip, hanging outwards
      vec2 b0 = i == 0 ? vec2(1.0, 0.0) : (i == 1 ? vec2(-0.09, 1.0) : (i == 2 ? vec2(-1.0, -0.17) : vec2(0.26, -0.97)));
      vec2 dir = vec2(b0.x * cs.x - b0.y * cs.y, b0.x * cs.y + b0.y * cs.x);
      vec2 c = vec2(0.55 * dir.y, 0.30 + 0.28 * dir.x - 0.08 * fi);
      vec2 d0 = l - c;
      if (dot(d0, d0) > 0.30) continue;
      vec2 o = normalize(vec2(1.0, -1.2 * dir.y - 0.3));
      d = vec2(o.x * d0.x + o.y * d0.y, -o.y * d0.x + o.x * d0.y);
      float taper = 0.55 + 0.45 * smoothstep(-0.45, 0.35, d.x);
      e = length(vec2(d.x / 0.48, d.y / (0.37 * taper)));
      ea = aal * 2.5;
    }
    float m = smoothstep(1.0 + ea, 1.0 - ea, e);
    if (m <= 0.0) continue;
    vec3 col;
    if (umb) {
      float flo = det * smoothstep(0.55, 0.25, length(fract(d * 3.2 + fi * 0.37) - 0.5));
      vec3 alb = base * (0.72 + 0.34 * flo) * mix(0.62, 1.06, sat(0.5 + d.y * 0.6)) * mix(0.82, 1.0, sat(1.3 - abs(fi - 2.5) / 2.5));
      col = litAlb(alb, sat(0.75 + 0.3 * d.x + 0.35 * d.y), 1.0) + alb * SUNC * 0.25 * SHADE;
      acc = over(acc, vec4(col, 1.0) * m);
    } else {
      vec3 alb = base * mix(0.70, 1.15, sat(0.5 + d.y / 0.30 * 0.6)) * (0.82 + 0.36 * hf.w);
      float throat = smoothstep(0.42, 0.15, length((d - vec2(0.26, -0.03)) / vec2(0.16, 0.11)));
      col = litAlb(alb, sat(0.75 + 0.35 * d.x / 0.5 + 0.3 * d.y / 0.30), 1.0) + alb * SUNC * 0.85 * smoothstep(0.55, 1.0, e) * SHADE;
      col = mix(col, litAlb(vec3(0.22, 0.03, 0.10), 0.6, 1.0), throat * 0.7);
      if (det > 0.5 && throat > 0.0) col = mix(col, litAlb(vec3(0.75, 0.62, 0.20), 0.9, 1.0), throat * smoothstep(0.5, 0.8, vn(d * 20.0 + fi)) * 0.4);
      acc = over(vec4(col, 1.0) * m, acc);
    }
  }
  return acc;
}
// Radial heads. t = 2 Inula (golden daisy, slender rays), 3 Wallich's geranium (five
// rounded violet petals, pale veined centre), 4 Himalayan blue poppy (silky sky-blue
// petals around a golden boss of stamens).
vec4 radialHead(vec2 l, float aal, float sd, float t) {
  float r = length(l);
  if (r > 1.12 + aal) return vec4(0.0);
  bool inu = t < 2.5, ger = t > 2.5 && t < 3.5;
  float det = smoothstep(0.35, 0.12, aal * (inu ? 4.0 : 1.0));
  float th = atan(l.y, l.x) + sd * TAU;
  float pet = 0.5 + 0.5 * cos((inu ? 30.0 : (ger ? 5.0 : 4.0)) * th + (inu ? 2.0 * sin(th * 3.0) : 0.0));
  float edge = mix(0.92, (inu ? 0.62 : (ger ? 0.70 : 0.80)) + (inu ? 0.40 : (ger ? 0.30 : 0.20)) * pow(pet, inu ? 0.6 : (ger ? 0.35 : 0.5)), det);
  if (!inu && !ger) edge += 0.05 * sin(th * 11.0 + sd * 30.0) * det;
  float gap = inu ? mix(1.0, smoothstep(0.05, 0.35, pet), det * smoothstep(0.35, 0.5, r)) : 1.0;
  float rd = inu ? 0.34 : (ger ? 0.09 : 0.30);
  float m = smoothstep(edge + aal, edge - aal, r) * gap;
  float disc = smoothstep(rd + aal, rd - aal, r);
  float cov = max(m, disc);
  if (cov <= 0.0) return vec4(0.0);
  float rr = r / edge;
  vec3 alb;
  if (inu) alb = vec3(0.88, 0.52, 0.012) * (0.75 + 0.25 * smoothstep(0.3, 0.8, r));
  else if (ger) {
    alb = mix(vec3(0.30, 0.13, 0.62), vec3(0.44, 0.17, 0.62), h11(sd * 9.0));
    alb = mix(vec3(0.82, 0.74, 0.86), alb, smoothstep(0.10, 0.42, r));
    alb = mix(alb, vec3(0.16, 0.04, 0.30), smoothstep(0.75, 1.0, cos(15.0 * th)) * smoothstep(0.15, 0.35, r) * smoothstep(0.95, 0.6, r) * det * 0.55);
  } else {
    alb = mix(vec3(0.10, 0.20, 0.70), vec3(0.30, 0.48, 0.95), smoothstep(0.2, 0.95, rr));
    alb *= (1.0 + 0.15 * sin(th * 23.0 + rr * 6.0 + sd * 17.0) * det) * (1.0 - 0.3 * smoothstep(0.85, 1.0, 1.0 - abs(cos(2.0 * th))) * smoothstep(0.3, 0.7, rr) * det);
  }
  float sun = sat(0.82 + 0.32 * l.x + 0.22 * l.y);
  vec3 col = litAlb(alb, sun, 1.0) + alb * SUNC * (inu ? 0.6 : (ger ? 0.35 : smoothstep(0.4, 1.0, rr))) * SHADE;
  vec3 dc = ger ? vec3(0.55, 0.45, 0.62) : (inu ? vec3(0.70, 0.32, 0.01) : vec3(0.88, 0.60, 0.06)) * (0.7 + 0.6 * det * vn(l * 29.0 + sd * 7.0));
  col = mix(col, litAlb(dc, ger ? 0.9 : sun, 1.0), disc);
  if (!inu && !ger) col = mix(col, litAlb(vec3(0.25, 0.30, 0.10), 0.8, 1.0), smoothstep(0.09, 0.05, r));
  return vec4(col, 1.0) * cov;
}
// pink bistort: a dense, blunt spike of tiny florets (l.x in units of its half-width)
vec4 bistortSpike(vec2 l, float len, float aal, float sd) {
  float v = l.y / len;
  if (v < -0.05 || v > 1.05) return vec4(0.0);
  float det = smoothstep(0.4, 0.15, aal * 3.0);
  float taper = 0.9 - 0.25 * v - 0.6 * smoothstep(0.75, 1.0, v);
  float fv = v * 16.0 + sd * 3.0;
  float w = taper * mix(1.0, 0.85 + 0.25 * sin(fract(fv) * 3.14159), det);
  float m = smoothstep(w + aal, w - aal, abs(l.x)) * smoothstep(-0.05, 0.03, v) * smoothstep(1.04, 0.96, v);
  if (m <= 0.0) return vec4(0.0);
  vec3 alb = mix(vec3(0.74, 0.28, 0.42), vec3(0.85, 0.55, 0.62), smoothstep(0.6, 1.0, v));
  float dots = det * smoothstep(0.35, 0.1, length(fract(vec2(l.x * 2.5, fv)) - 0.5));
  alb *= 0.85 + 0.3 * dots;
  float sun = sat(0.85 + 0.5 * l.x / max(w, 0.1));
  vec3 col = litAlb(alb, sun, 1.0) + alb * SUNC * 0.5 * SHADE;
  return vec4(col, 1.0) * m;
}
// a lanceolate leaf from 'base' along angle 'ang', drooping at the tip
vec4 leafShape(vec2 q, vec2 base, float ang, float len, float wid, float aa, float droop) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 d = q - base;
  float u = dot(d, dir) / len;
  if (u < 0.0 || u > 1.0) return vec4(0.0);
  d.y += droop * len * u * u;
  float v = (dir.x * d.y - dir.y * d.x) / len;
  float hw = wid * 2.6 * sqrt(u) * (1.0 - u);
  float m = smoothstep(hw + aa / len, hw - aa / len, abs(v));
  if (m <= 0.0) return vec4(0.0);
  float sdv = v / max(hw, 1e-4);
  float det = smoothstep(0.5, 0.2, aa / (len * wid));
  vec3 alb = mix(vec3(0.05, 0.13, 0.025), vec3(0.11, 0.21, 0.04), 0.5 + 0.5 * sdv);
  alb = mix(alb, vec3(0.16, 0.25, 0.08), smoothstep(0.14, 0.0, abs(sdv)) * det * (1.0 - u));
  float sun = 0.75 + 0.3 * sdv * sign(dir.x);
  vec3 col = litAlb(alb, sun, 1.0) + alb * SUNC * 0.45 * SHADE;
  return vec4(col, 1.0) * m;
}

// one depth row of grasses, leaves and flowering plants
vec4 plantRow(vec2 q, float yc, float rowH, float seed, float blur, float dens) {
  float D = YH - yc;
  vec4 acc = vec4(0.0);
  float aa = AA + blur;
  vec2 gRow = vec2(q.x / D, 1.0 / D);
  float gs = gustF(gRow);
  // plants grow in clumps and drifts, with gaps between; the drift weights that
  // pick each plant's species are only fetched once a plant actually reaches this pixel
  vec4 dw = vec4(-1.0);
  float clump = n1(q.x / (D * 0.35) + seed * 7.3);
  float dpres = dens * mix(0.55, 1.15, clump);
  float dyr = max(q.y - yc, 0.0);
  // grasses and strap leaves
  float bw = D * 0.030;
  float bu = (q.x - gs * 0.26 * min(dyr * dyr / (0.25 * D), 0.25 * D)) / bw;
  float bi = floor(bu) + (fract(bu) < 0.5 ? -1.0 : 0.0);
  int nb = D * 0.0045 < 0.6 * PX ? 0 : 2;
  for (int j = 0; j < nb; j++) {
    float c = bi + float(j);
    vec4 h = h42(vec2(c, seed));
    float bx = (c + h.x) * bw;
    float by = yc + (h.y - 0.5) * rowH;
    float H = D * (0.13 + 0.22 * h.z);
    float t = (q.y - by) / H;
    if (t < 0.0 || t > 1.0) continue;
    float lean = (h.w - 0.5) * 0.18 + gs * 0.26 + 0.04 * wav(0.4 + 0.3 * h.y, h.x * TAU);
    float sx = bx + lean * H * t * t;
    float slope = 2.0 * lean * t;
    float dx = (q.x - sx) / sqrt(1.0 + slope * slope);
    bool strap = h.y > 0.35;
    float hw = D * (strap ? 0.0085 * sin(3.14159 * min(t + 0.15, 1.0)) : 0.0045 * (1.0 - t * 0.85));
    float m = smoothstep(hw + aa, hw - aa, abs(dx)) * min(1.0, (hw + 0.4 * AA) / (hw + blur));
    if (m <= 0.0) continue;
    vec3 alb = mix(vec3(0.026, 0.082, 0.015), vec3(0.12, 0.21, 0.040), t * 0.7 + 0.3 * h.y);
    float side = dx / max(hw, 1e-5);
    float sun = mix(0.45, 1.15, smoothstep(-0.7, 0.7, side));
    float ao = mix(0.22, 1.0, smoothstep(0.0, 0.6, t));
    vec3 col = litAlb(alb, sun * ao * (0.85 + 0.4 * gs), ao) + alb * SUNC * 0.9 * t * t * SHADE;
    acc = over(acc, vec4(col, 1.0) * m);
  }
  // flowering plants: the two nearest cells around where the wind has carried the heads
  float fw = D * 0.085;
  float fu = (q.x - gs * 0.30 * min(dyr * dyr / (0.33 * D), 0.33 * D)) / fw;
  float fi = floor(fu) + (fract(fu) < 0.5 ? -1.0 : 0.0);
  for (int j = ZI; j <= 1; j++) {
    float c = fi + float(j);
    vec4 h = h42(vec2(c, seed + 5.0));
    vec4 h2 = h42(vec2(c, seed + 9.0));
    if (h2.w > dpres) continue;
    float bx = (c + 0.3 + 0.4 * h.x) * fw;
    float by = yc + (h.y - 0.5) * rowH;
    float by0 = yc + (h.y - 0.5) * rowH;
    if (q.y < by0 - aa || q.y > by0 + D * 0.70 + aa) continue;
    if (dw.x < 0.0) dw = driftW(vec2(q.x / (D + 0.12), -log(D)));
    float t = pickType(dw, h.z);
    if (h2.y < 0.04) t = 4.0;
    else if (h2.y > 0.92) t = 5.0;
    float H, R;
    if (t < 0.5) { H = 0.24 + 0.26 * h2.x; R = 0.040; }
    else if (t < 1.5) { H = 0.34 + 0.24 * h2.x; R = 0.064; }
    else if (t < 2.5) { H = 0.22 + 0.18 * h2.x; R = 0.027; }
    else if (t < 3.5) { H = 0.12 + 0.10 * h2.x; R = 0.021; }
    else if (t < 4.5) { H = 0.22 + 0.12 * h2.x; R = 0.030; }
    else { H = 0.18 + 0.14 * h2.x; R = 0.012; }
    H *= D;
    R *= D * (0.85 + 0.3 * h2.z);
    float bend = (h.w - 0.5) * 0.22 + gs * 0.30 + 0.05 * wav(0.3 + 0.25 * h2.y, h2.z * TAU);
    float hx = bx + bend * H;
    float hy = by + H * (1.0 - 0.12 * bend * bend);
    float ext = t < 0.5 ? 1.9 : (t < 1.5 ? 1.5 : (t < 4.5 ? 1.2 : 6.2));
    if (q.y < by - aa || q.y > hy + R * ext + aa) continue;
    bool leafy = (t < 0.5 || (t > 1.5 && t < 2.5) || t > 3.5) && D > 0.15;
    float reach = leafy ? H * 0.34 : 0.0;
    float st = sat((q.y - by) / (hy - by));
    float sx = bx + bend * H * st * st;
    vec2 l = q - vec2(hx, hy);
    float hw = t < 0.5 ? 1.3 : (t < 1.5 ? 1.2 : (t > 4.5 ? 1.0 : (t > 3.5 ? 1.5 : 1.15)));
    float hb = t < 0.5 ? -0.5 : (t < 1.5 ? -0.1 : (t > 4.5 ? -0.2 : (t > 3.5 ? -1.5 : -1.15)));
    bool nearHead = abs(l.x) < hw * R + aa && l.y > hb * R - aa;
    float shw = D * (t > 0.5 && t < 1.5 ? 0.0034 : 0.0026);
    if (!nearHead && abs(q.x - sx) > max(shw * 3.0, reach) + aa) continue;
    // leaves, alternating up the stem
    if (leafy && q.y < hy && D > 0.15) {
      for (int k = ZI; k < 2; k++) {
        float fk = float(k);
        float s0 = 0.30 + 0.28 * fk + 0.08 * h.x;
        vec2 lb = vec2(bx + bend * H * s0 * s0, by + (hy - by) * s0);
        float sgn = (k == 0 ? 1.0 : -1.0) * (h.x > 0.5 ? 1.0 : -1.0);
        float ang = sgn > 0.0 ? 0.55 + 0.3 * bend : 3.14159 - 0.55 + 0.3 * bend;
        float len = H * (t < 0.5 ? 0.24 : 0.20) * (0.75 + 0.5 * h2.z);
        acc = over(acc, leafShape(q, lb, ang, len, t > 3.5 ? 0.09 : 0.12, aa, 0.35));
      }
    }
    // stem
    float slope = 2.0 * bend * st;
    float sdx = (q.x - sx) / sqrt(1.0 + slope * slope);
    float sm = smoothstep(shw + aa, shw - aa, abs(sdx)) * step(q.y, hy) * step(by, q.y) * min(1.0, (shw + 0.4 * AA) / (shw + blur));
    if (sm > 0.0) {
      float ao = mix(0.25, 1.0, smoothstep(0.0, 0.5, st));
      vec3 sc = litAlb(vec3(0.07, 0.15, 0.03), mix(0.5, 1.1, smoothstep(-0.8, 0.8, sdx / shw)) * ao, ao) + vec3(0.05, 0.09, 0.01) * SUNC * st;
      acc = over(acc, vec4(sc, 1.0) * sm);
    }
    if (!nearHead) continue;
    float ang = -bend * 0.6 + (h2.x - 0.5) * 0.4;
    l = vec2(l.x + ang * l.y, l.y - ang * l.x);   // small-angle rotation
    float aal = aa / R;
    float tilt = 0.40 + 0.55 * h2.z;
    vec4 hd;
    if (R < 9.0 * PX + blur) {
      vec2 lb = l / R - vec2(0.0, t < 0.5 ? 0.55 : (t < 1.5 ? 0.95 : (t > 4.5 ? 3.0 : 0.0)));
      vec2 ax = t < 0.5 ? vec2(0.75, 0.65) : (t < 1.5 ? vec2(0.62, 0.42) : (t > 4.5 ? vec2(1.0, 3.0) : vec2(0.95, 0.95 * tilt)));
      float e = length(lb / ax);
      float m = smoothstep(1.0 + aal * 1.5, 1.0 - aal * 1.5, e);
      vec3 fa = flowerAlb(t, h2.x);
      vec3 col = litAlb(fa, sat(0.8 + 0.3 * lb.x + 0.2 * lb.y), 1.0) + fa * SUNC * 0.4 * SHADE;
      if (t > 1.5 && t < 4.5) col = mix(col, litAlb(t < 2.5 ? vec3(0.70, 0.32, 0.01) : vec3(0.85, 0.7, 0.5), 1.0, 1.0), smoothstep(0.4, 0.2, e));
      hd = vec4(col, 1.0) * m;
    } else if (t < 1.5) hd = clusterHead(l / R - vec2(0.0, t < 0.5 ? 0.35 : 0.85), aal, h2.y, t > 0.5);
    else if (t < 4.5) {
      // a blue poppy nods on its curved stem
      vec2 lr = t > 3.5 ? rot(0.55 * sign(h.x - 0.5)) * (l / R) - vec2(0.0, 0.25) : l / R;
      float tl = t > 3.5 ? 0.55 + 0.3 * h2.z : tilt;
      hd = radialHead(vec2(lr.x, lr.y / tl), aal / tl, h2.y, t);
    } else hd = bistortSpike(l / R, 6.0, aal, h2.y);
    acc = over(acc, hd);
  }
  return acc;
}

vec4 flowersLin(vec2 p) {
  vec2 q = p + u_par * (1.0 * PK);
  if (q.y > 0.45) return vec4(0.0);
  vec4 acc = vec4(0.0);
  // cloud shadows are huge: one sample per pixel serves every row
  float Dp = max(YH - q.y, 0.01);
  SHADE = cloudShade(vec2((q.x - VX) / Dp, 1.0 / Dp));
  for (int r = ZI; r < 4; r++) {
    float fr = float(r);
    float yc = 0.335 - fr * 0.082 - fr * fr * 0.0060;
    float D = YH - yc;
    // bases scatter across most of the gap to the next row, so rows never read as lines
    float rowH = 0.92 * (0.082 + 0.0060 * (2.0 * fr + 1.0));
    if (q.y < yc - rowH * 0.5 - 0.004 || q.y > yc + rowH * 0.5 + D * 0.70) continue;
    float blur = fr >= 3.0 ? 0.0010 : 0.0;
    acc = over(acc, plantRow(q, yc, rowH, 17.0 + fr * 13.0, blur, 1.0));
  }
  return acc;
}

// ---------------------------------------------------------------- air: butterflies and pollen
vec2 bPath(float t, float id) {
  return vec2(0.55 * wavt(0.0105 + 0.004 * id, id * 2.0, t) + 0.14 * wavt(0.043, id * 5.0, t) + 0.03 * wavt(0.21, id, t) + (id - 1.0) * 0.12,
              0.21 + 0.06 * wavt(0.027 + 0.006 * id, id * 1.3, t) + 0.025 * wavt(0.11, id * 3.0, t) + 0.012 * wavt(0.6, id * 4.0, t));
}
vec4 butterfly(vec2 q, float id) {
  vec2 c = bPath(TM, id);
  float S = 0.0165 - 0.0030 * id;
  vec2 l = (q - c) / S;
  if (dot(l, l) > 2.6) return vec4(0.0);
  vec2 v = bPath(TM + 0.05, id) - c;
  float flap = wav(5.0 + id * 0.8, id * 3.0);
  float o = 0.10 + 0.90 * abs(flap);
  l = rot(clamp(v.y * 30.0, -0.5, 0.5) * sign(v.x + 1e-5)) * l;
  float lx = abs(l.x) / o;
  vec2 w = vec2(lx, l.y);
  float fwd = length((w - vec2(0.55, 0.26)) / vec2(0.58, 0.48));
  float hwd = length((w - vec2(0.40, -0.30)) / vec2(0.42, 0.36));
  float k = AA / (S * 0.45 * o);
  float mf = smoothstep(1.0 + k, 1.0 - k, fwd);
  float mh = smoothstep(1.0 + k, 1.0 - k, hwd);
  float m = max(mf, mh);
  float rim = smoothstep(0.74, 0.90, max(fwd * mf, hwd * mh * (1.0 - mf)));
  vec3 alb;
  if (id < 0.5) {
    // Indian tortoiseshell: orange, dark wing roots, black costal bars, pale apical spot,
    // dark border with blue lunules
    alb = mix(vec3(0.82, 0.25, 0.02), vec3(0.66, 0.15, 0.02), mh * (1.0 - mf));
    float roots = smoothstep(0.38, 0.12, w.x);
    float bars = mf * step(0.28, w.y) * smoothstep(0.10, 0.04, abs(fract(w.x * 3.0 + 0.2) - 0.5) - 0.20);
    alb = mix(alb, vec3(0.03, 0.02, 0.015), max(max(roots * 0.7, rim), bars * 0.85));
    alb = mix(alb, vec3(0.92, 0.86, 0.60), smoothstep(0.11, 0.06, length(w - vec2(0.86, 0.50))) * mf);
    alb = mix(alb, vec3(0.10, 0.25, 0.75), rim * mh * (1.0 - mf) * smoothstep(0.2, 0.5, sin(atan(w.y + 0.3, w.x - 0.4) * 9.0)) * 0.8);
  } else if (id < 1.5) {
    // pale clouded yellow: dark apex, orange hindwing spot
    alb = vec3(0.86, 0.80, 0.40);
    alb = mix(alb, vec3(0.08, 0.06, 0.04), rim * mf * step(0.15, w.y));
    alb = mix(alb, vec3(0.80, 0.38, 0.05), smoothstep(0.08, 0.04, length(w - vec2(0.42, -0.30))) * mh);
  } else {
    // a little blue
    alb = vec3(0.20, 0.32, 0.78);
    alb = mix(alb, vec3(0.85, 0.86, 0.90), rim);
  }
  vec3 col = litAlb(alb, 0.6 + 0.5 * o, 1.0) + alb * SUNC * 1.2 * (1.0 - o * 0.5);
  float body = smoothstep(1.0 + 4.0 * k, 1.0 - 4.0 * k, length(l / vec2(0.07, 0.42)));
  col = mix(col, vec3(0.03, 0.025, 0.02), body);
  return vec4(col, 1.0) * max(m, body);
}
vec4 airLin(vec2 p) {
  vec2 q = p + u_par * (1.15 * PK);
  if (q.y > 0.46) return vec4(0.0);
  SHADE = 1.0;
  vec4 acc = vec4(0.0);
  float fade = smoothstep(0.44, 0.30, q.y);
  // pollen and drifting seed fluff in the sun
  for (int k = 0; k < 2; k++) {
    float cs = k == 0 ? 0.045 : 0.075;
    float per = k == 0 ? 48.0 : 32.0;
    float perY = k == 0 ? 13.0 : 7.0;
    float tt = mod(u_time, 150.0) / 150.0;
    vec2 qq = q - vec2(tt * per * cs, -tt * perY * cs) * (k == 0 ? 1.0 : 2.0);
    vec2 ci = floor(qq / cs);
    vec2 cf = fract(qq / cs);
    vec4 h = h42(vec2(mod(ci.x, per), mod(ci.y, perY)) + float(k) * 17.0);
    if (h.z > 0.45) continue;
    vec2 pos = 0.5 + (h.xy - 0.5) * 0.55 + 0.12 * vec2(wav(0.13 + 0.1 * h.w, h.x * TAU), wav(0.17 + 0.1 * h.z, h.y * TAU));
    float d = length(cf - pos) * cs;
    float rad = (k == 0 ? 0.0007 : 0.0012) + 0.0012 * h.w;
    float core = smoothstep(rad + AA, rad - AA, d);
    float glow = exp(-d * d / (rad * rad * 6.0)) * 0.45;
    float tw = 0.65 + 0.35 * wav(0.5 + h.x, h.y * TAU);
    float al = max(core, glow) * fade * (k == 0 ? 0.65 : 0.5);
    vec3 pc = mix(vec3(1.0, 0.92, 0.75), vec3(1.0, 0.98, 0.92), h.y) * 2.2 * tw;
    acc = over(acc, vec4(pc, 1.0) * al);
  }
  acc = over(acc, butterfly(q, 2.0));
  acc = over(acc, butterfly(q, 1.0));
  acc = over(acc, butterfly(q, 0.0));
  return acc;
}

// ---------------------------------------------------------------- foreground blooms
vec4 bokehLin(vec2 p) {
  vec2 q = p + u_par * (1.3 * PK);
  if (q.y > 0.27) return vec4(0.0);
  vec4 acc = vec4(0.0);
  SHADE = cloudShade(vec2((q.x - VX) / 0.45, 2.2));
  if (q.y < 0.25) {
    acc = plantRow(q, -0.035, 0.050, 211.0, 0.0065, 0.42);
  }
  // soft out-of-focus discs, kept low and to the sides
  float cs = 0.09;
  vec2 ci = floor(q / cs), cf = fract(q / cs);
  vec4 h = h42(ci + 77.0);
  if (h.z < 0.22) {
    float rad = 0.25 + 0.15 * h.w;
    vec2 c = 0.5 + (h.xy - 0.5) * (1.0 - 2.0 * rad);
    float d = length(cf - c) / rad;
    float disc = smoothstep(1.0, 0.85, d) * (0.6 + 0.4 * smoothstep(0.6, 0.95, d));
    float zone = smoothstep(0.24, 0.05, q.y) * (0.35 + 0.65 * smoothstep(0.25, 0.75, abs(q.x)));
    float tw = 0.7 + 0.3 * wav(0.08 + 0.05 * h.x, h.y * TAU);
    vec3 bc = mix(vec3(1.0, 0.70, 0.85), vec3(0.85, 0.95, 0.60), h.x) * 2.2 * tw;
    acc = over(acc, vec4(bc, 1.0) * disc * zone * 0.10);
  }
  return acc;
}

// ---------------------------------------------------------------- output
vec3 toDisp(vec3 c) {
  c *= 0.95 * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
vec4 finish(vec4 v) {
  if (v.a <= 0.0) return vec4(0.0);
  return vec4(toDisp(v.rgb / v.a) * v.a, v.a);
}
vec4 layerLin(int k, vec2 p) {
  if (k == 0) return skyLin(p);
  if (k == 1) return peaksLin(p);
  if (k == 2) return wallsLin(p);
  if (k == 3) return mistLin(p);
  if (k == 4) return floorLin(p);
  if (k == 5) return meadowLin(p);
  if (k == 6) return flowersLin(p);
  if (k == 7) return airLin(p);
  return bokehLin(p);
}

void main() {
  TM = mod(u_time, TP);
  ZI = int(min(u_res.x, 0.0));
  PX = 1.0 / u_res.y;
  AA = 0.75 * PX;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  VIG = 1.0 - 0.20 * pow(length((p - vec2(0.0, 0.52)) * vec2(0.66, 1.0)), 2.2);
  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  if (u_layer >= 0.0) {
    vec4 c = finish(layerLin(int(u_layer + 0.5), p));
    fragColor = vec4(c.rgb + dith * c.a, c.a);
    return;
  }
  // front-to-back with early-out once opaque (identical to back-to-front "over")
  vec4 acc = finish(bokehLin(p));
  acc += (1.0 - acc.a) * finish(airLin(p));
  acc += (1.0 - acc.a) * finish(flowersLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(meadowLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(floorLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(mistLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(wallsLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(peaksLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(skyLin(p));
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4) + dith, 1.0);
}
`,
}
