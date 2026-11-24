// Flower Valley — an alpine valley in warm morning light.
// Sky with drifting cumulus, a snow-capped range with aerial perspective,
// forested slopes around a glinting lake, and a wind-combed wildflower
// meadow (poppies, lupines, daisies, buttercups) with pollen and butterflies.
//
// Every layer is rendered in linear light, tone-mapped (ACES fit) and
// gamma-encoded on its own, so the full scene is exactly the back-to-front
// "over" composite of the isolated layers shown in the exploded view.

export default {
  id: 'flowervalley',
  name: 'Flower Valley',
  tag: 'Alpine bloom',
  accent: '#e8412c',
  accent2: '#8466e8',
  ink: '#a3261a',
  glow: '#ffd9ae',
  light: true,
  clockColor: '#14223c',
  sky: 'linear-gradient(180deg,#4a82cc 0%,#8fb4e0 30%,#c9dbee 44%,#e2e8ee 50%,#a3a6ad 55%,#46604c 61%,#86a85a 66%,#5f8f2c 72%,#4b7a20 88%,#3b621a 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Far peaks', depth: 0.1 },
    { name: 'Forest slopes', depth: 0.3 },
    { name: 'Valley lake', depth: 0.5 },
    { name: 'Meadow', depth: 0.8 },
    { name: 'Wildflowers', depth: 1.0 },
    { name: 'Pollen and butterflies', depth: 1.15 },
    { name: 'Foreground bokeh', depth: 1.3 },
  ],
  clockAfter: 1,
  frag: /* glsl */ `
#define TAU 6.2831853
#define TP 600.0
#define PK 0.030
#define VX -0.15
#define YH 0.365

float SHADE = 1.0; // drifting cloud-shadow factor on direct sun (set per layer / row)
float TM;   // u_time folded into a 600 s loop; every oscillator is quantised to it
float PX;   // one pixel in scene units (height-relative)
float AA;   // half-width of an anti-aliased edge

const vec2 SUN = vec2(-0.62, 0.885);
const vec3 SUNC = vec3(1.0, 0.84, 0.64);
const vec3 LDIR = vec3(-0.801, 0.513, 0.308);
const vec3 AMB = vec3(0.32, 0.45, 0.72);

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

// ---------------------------------------------------------------- sky
vec3 skyBase(vec2 p) {
  float h = sat((p.y - 0.40) / 0.60);
  vec3 c = mix(vec3(0.56, 0.66, 0.80), vec3(0.25, 0.44, 0.78), smoothstep(0.0, 0.40, h));
  c = mix(c, vec3(0.065, 0.17, 0.48), smoothstep(0.30, 1.0, h));
  float r = length(p - SUN);
  c += SUNC * (0.22 * exp(-r * 1.8) + 0.45 * exp(-r * 6.0) + 1.4 * exp(-r * 26.0));
  c += vec3(0.26, 0.15, 0.05) * exp(-h * 6.0) * exp(-abs(p.x - SUN.x) * 1.0);
  return c;
}
// aerial-perspective in-scatter: Rayleigh blue plus warm forward scatter towards the sun
vec3 hazeCol(float x, float y) {
  return vec3(0.36, 0.47, 0.66) + vec3(0.24, 0.15, 0.05) * exp(-abs(x - SUN.x) * 1.6) + vec3(0.04) * smoothstep(0.55, 0.35, y);
}

#define CLS 10.0
float n1P(float x, float per) { float i = floor(x), f = fract(x); return mix(h11(mod(i, per)), h11(mod(i + 1.0, per)), f * f * (3.0 - 2.0 * f)); }
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

// cumulus bank rising behind the range (flat bases, cauliflower tops)
vec4 cumulus(vec2 p, vec3 sky) {
  if (p.y < 0.50 || p.y > 0.76) return vec4(0.0);
  float xs = p.x - mod(u_time, 3000.0) * (CLS / 3000.0);
  float base = 0.545 + 0.010 * n1P(xs * 6.0, 60.0);
  float tow = n1P(xs * 2.2, 22.0);
  tow = tow * tow * (3.0 - 2.0 * tow);
  float top = base + 0.03 + 0.115 * pow(tow, 1.5) + 0.03 * n1P(xs * 5.4 + 3.0, 54.0);
  vec2 s = vec2(xs, p.y) * 14.0;
  float oct = clamp(log2(0.5 / (14.0 * PX)), 2.0, 8.0);
  float b = billow(s, 140.0, oct);
  float e = top + 0.055 * (b - 0.45) - p.y;
  float dens = smoothstep(0.0, 0.02, e) * smoothstep(base - 0.004, base + 0.016, p.y + 0.012 * (b - 0.5));
  if (dens <= 0.0) return vec4(0.0);
  float b2 = billow(s + vec2(-0.30, 0.22), 140.0, min(oct, 4.0));
  float hgt = smoothstep(base, top, p.y);
  float lit = sat(0.35 + (b - b2) * 2.2 + 0.55 * hgt);
  vec3 col = mix(vec3(0.36, 0.42, 0.56), SUNC * 1.55, lit);
  col *= mix(0.78, 1.0, smoothstep(base, base + 0.035, p.y));
  col += SUNC * 0.9 * smoothstep(0.012, 0.0, e) * (0.5 + 0.5 * lit);
  col = mix(col, sky, 0.22);
  return vec4(col, 1.0) * dens * 0.97;
}

// scattered fair-weather cumulus on a perspective cloud plane, kept off the clock band
vec4 cloudsHigh(vec2 p, vec3 sky) {
  if (p.y < 0.72) return vec4(0.0);
  float dy = p.y - 0.40;
  float z = 0.26 / dy;
  vec2 cq = vec2(p.x * z, z * 1.5) * 2.2;
  float fy = PX * z * z / 0.26 * 1.5 * 2.2;
  float oct = clamp(log2(0.5 / fy), 2.0, 8.0);
  vec2 sq0 = cq - vec2(mod(u_time, 6000.0) * (24.0 / 6000.0), 0.0);
  float n = fbmP(sq0, 24.0, min(oct, 4.0)) + 0.35 * (billow(sq0 * 2.0 + 7.0, 48.0, oct - 1.0) - 0.45);
  float cov = 0.06 + 0.32 * smoothstep(0.93, 0.80, p.y);
  float dens = sat((n - cov) * 3.5);
  if (dens <= 0.0) return vec4(0.0);
  vec2 sd = normalize(SUN - p);
  float n2 = fbmP(sq0 + vec2(sd.x, -sd.y) * 0.18, 24.0, min(oct, 3.0));
  float lit = sat(0.6 + (n - n2) * 3.5);
  vec3 c = mix(vec3(0.42, 0.50, 0.66), SUNC * 1.5, lit);
  c *= mix(1.0, 0.82, dens * dens);
  float r = length(p - SUN);
  c += SUNC * 2.2 * exp(-r * 4.5) * (1.0 - dens);
  return vec4(c, 1.0) * dens * smoothstep(0.72, 0.80, p.y);
}

float birdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * sat(dot(pa, ba) / dot(ba, ba))); }
float birds(vec2 p) {
  if (p.y < 0.88 || p.y > 0.985) return 0.0;
  float a = 0.0;
  float T = 420.0;
  float ph = mod(u_time, T) / T;
  vec2 flock = vec2(mix(-1.5, 1.5, ph), 0.935 + 0.012 * wav(0.011, 1.0));
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec4 h = h42(vec2(fi, 3.7));
    vec2 c = flock + vec2((h.x - 0.5) * 0.12 - fi * 0.018, (h.y - 0.5) * 0.035) + 0.004 * vec2(wav(0.05 + 0.02 * h.z, fi), wav(0.07, fi * 2.0));
    float S = 0.0042 * (0.8 + 0.4 * h.w);
    vec2 l = (p - c) / S;
    if (dot(l, l) > 4.0) continue;
    float fl = wav(2.2 + 0.6 * h.z, fi * 1.7);
    vec2 tip = vec2(1.0, 0.55 * fl);
    vec2 mid = vec2(0.45, 0.18 + 0.1 * fl);
    vec2 la = vec2(abs(l.x), l.y);
    float d = min(birdSeg(la, vec2(0.0), mid), birdSeg(la, mid, tip));
    float w = 0.12 * (1.0 - 0.5 * min(la.x, 1.0));
    a = max(a, smoothstep(w + AA / S, w - AA / S, d));
  }
  return a;
}

vec4 skyLin(vec2 p) {
  vec3 sky = skyBase(p);
  float r = length(p - SUN);
  vec3 c = sky + SUNC * (30.0 * smoothstep(0.011 + AA, 0.011 - AA, r) + 3.0 * exp(-r * 95.0));
  vec4 cl = cloudsHigh(p, sky);
  c = c * (1.0 - cl.a) + cl.rgb;
  cl = cumulus(p, sky);
  c = c * (1.0 - cl.a) + cl.rgb;
  c = mix(c, vec3(0.08, 0.10, 0.14), birds(p) * 0.85);
  return vec4(c, 1.0);
}
// ---------------------------------------------------------------- far peaks
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
float peakEnv(float x) {
  return 0.455 + 0.105 * exp(-sq((x + 0.42) / 0.26)) + 0.13 * exp(-sq((x - 0.30) / 0.24))
       + 0.07 * exp(-sq((x - 1.05) / 0.30)) + 0.08 * exp(-sq((x + 1.10) / 0.32)) + 0.03 * exp(-sq((x + 0.05) / 0.12));
}
float peakH(float x, float oct) { return peakEnv(x) + 0.12 * (ridgeP(x * 2.3 + 5.3, oct) - 0.55); }
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

vec4 peaksLin(vec2 p) {
  vec2 q = p + u_par * (0.10 * PK);
  float x = q.x;
  float oct = clamp(log2(0.35 / (2.3 * PX)), 3.0, 9.0);
  float H = peakH(x, oct);
  float hb = 0.505 + 0.04 * exp(-sq(x / 0.6)) + 0.075 * (ridgeP(x * 3.4 + 1.7, oct - 0.5) - 0.5);
  if (q.y > max(H, hb) + 3.0 * PX || q.y < 0.355) return vec4(0.0);
  vec3 haze = hazeCol(x, q.y);
  vec4 res = vec4(0.0);
  if (q.y > H - 2.0 * PX) {
    float ab = smoothstep(AA, -AA, q.y - hb);
    if (ab > 0.0) {
      // distant range: isotropic 2D relief (no column streaks); crest slope only right at the top
      float sb = (ridgeP(x * 3.4 + 1.72, 3.0) - ridgeP(x * 3.4 + 1.68, 3.0)) * 0.075 / 0.0118;
      vec2 bp = q * 20.0 + vec2(3.1, 0.7);
      float b0 = rid2(bp, 3.0);
      float bx = rid2(bp + vec2(0.07, 0.0), 3.0) - b0;
      float by = rid2(bp + vec2(0.0, 0.07), 3.0) - b0;
      float topb = 1.0 - smoothstep(0.0, 0.015, hb - q.y);
      vec3 Nb = normalize(vec3(-sb * 0.8 * topb - bx * 9.0, 0.5 - by * 6.0, 1.0));
      float dif = max(dot(Nb, LDIR), 0.0) * 1.2;
      float snow = smoothstep(-0.032, -0.012, q.y - hb + 0.012 * gn(q * 45.0) + 0.02 * (0.5 - b0)) * smoothstep(0.49, 0.52, q.y);
      vec3 alb = mix(vec3(0.18, 0.17, 0.16), vec3(0.85, 0.87, 0.90), snow);
      vec3 c = alb * (SUNC * 2.0 * dif + AMB * 0.6);
      res = vec4(mix(c, haze, 0.64), 1.0) * ab;
    }
  }
  float af = smoothstep(AA, -AA, q.y - H) * smoothstep(0.355, 0.365, q.y);
  if (af <= 0.0) return res;
  float e = 0.005;
  float sBig = (peakH(x + 2.0 * e, 2.5) - peakH(x - 2.0 * e, 2.5)) / (4.0 * e);
  float sMid = (peakH(x + e, 4.5) - peakH(x - e, 4.5)) / (2.0 * e);
  float depth = H - q.y;
  float s = clamp(mix(sMid, sBig, smoothstep(0.0, 0.05, depth)), -3.5, 3.5);
  // buttresses and spurs: sharp-crested ridges that fan out down the fall line
  // fan-out shear from the smooth envelope slope (no seam under the summits)
  float sEnv = (peakEnv(x + 0.02) - peakEnv(x - 0.02)) / 0.04;
  float xb = x + depth * clamp(sEnv, -2.5, 2.5) * 0.5;
  float wid = 1.0 / (1.0 + depth * 4.0);
  float eb = 0.0016;
  float F0 = 0.6 * sq(1.0 - abs(g1(xb * 7.0 * wid + 1.3))) + 0.4 * sq(1.0 - abs(g1(xb * 17.0 * wid + 4.1)));
  float F1 = 0.6 * sq(1.0 - abs(g1((xb + eb) * 7.0 * wid + 1.3))) + 0.4 * sq(1.0 - abs(g1((xb + eb) * 17.0 * wid + 4.1)));
  float dF = (F1 - F0) / eb;
  float bfade = 1.0 - smoothstep(0.03, 0.10, depth);
  F0 = mix(0.5, F0, bfade);
  vec2 gp = vec2((x + depth * clamp(sEnv, -2.5, 2.5) * 0.45) * 12.0, q.y * 8.5);
  float go = clamp(log2(0.4 / (13.0 * PX)), 1.0, 6.0);
  float e0 = rid2(gp, go);
  float ex = rid2(gp + vec2(0.06, 0.0), go) - e0;
  float ey = rid2(gp + vec2(0.0, 0.06), go) - e0;
  float topw = 1.0 - smoothstep(0.0, 0.06, depth);
  vec3 N = normalize(vec3(-s * 0.9 * topw - dF * 0.035 * (1.0 - 0.5 * topw) * bfade - ex * 7.0, 0.45 - ey * 5.0, 1.0));
  float dif = max(dot(N, LDIR), 0.0);
  float sl = 0.528 + 0.018 * g1(x * 5.0 + 1.3) + 0.010 * g1(x * 13.0);
  float steep = abs(N.x) / max(N.z, 0.2);
  float snow = smoothstep(-0.010, 0.016, q.y - sl + 0.035 * (F0 - 0.5) + 0.04 * (0.45 - e0));
  snow *= 1.0 - 0.8 * smoothstep(0.9, 1.6, steep) * smoothstep(sl + 0.10, sl + 0.05, q.y);
  snow *= smoothstep(0.95, 0.70, e0);
  // snow-dusted ledges across the rock band
  float lf = smoothstep(2.0, 0.7, PX * 160.0);
  float ledge = smoothstep(0.70, 0.82, vn(vec2(x * 80.0, q.y * 220.0 + x * 12.0 * s)) * (0.6 + 0.4 * vn(vec2(x * 300.0, q.y * 500.0)))  * 1.25) * smoothstep(0.47, 0.51, q.y) * lf;
  snow = max(snow, ledge * 0.85 * (1.0 - smoothstep(1.2, 2.0, steep)));
  float sf = smoothstep(2.5, 0.8, PX * 700.0);
  float strata = mix(0.5, vn(vec2(x * 90.0, q.y * 700.0 + x * 40.0 * s)), sf);
  // fine rock grain that resolves further at higher resolutions
  float g1f = smoothstep(1.5, 0.5, PX * 260.0), g2f = smoothstep(1.5, 0.5, PX * 700.0);
  float grain = 1.0 + 0.30 * g1f * (vn(vec2(x * 260.0, q.y * 330.0)) - 0.5) + 0.25 * g2f * (vn(vec2(x * 700.0, q.y * 900.0) + 5.0) - 0.5);
  vec3 rock = mix(vec3(0.19, 0.16, 0.13), vec3(0.10, 0.095, 0.09), F0) * (0.7 + 0.6 * strata) * grain;
  vec3 alb = mix(vec3(0.022, 0.045, 0.026), rock, smoothstep(0.475, 0.505, q.y + 0.03 * e0 + 0.025 * F0 + 0.01 * gn(q * 30.0)));
  alb = mix(alb, vec3(0.92, 0.94, 0.97) * (0.94 + 0.06 * grain), snow);
  float occ = 0.55 + 0.45 * mix(e0, F0, 0.5);
  vec3 c = alb * (SUNC * 2.5 * dif + AMB * 0.55 * occ * (0.6 + 0.4 * N.y));
  c = mix(c, haze, 0.15 + 0.17 * smoothstep(0.60, 0.40, q.y));
  return over(res, vec4(c, 1.0) * af);
}

// ---------------------------------------------------------------- forest slopes
float hillH(float x) {
  float d = x - VX;
  float k = d < 0.0 ? 0.11 : 0.085;
  return 0.398 + k * smoothstep(0.03, 1.05, abs(d)) + 0.011 * g1(x * 5.3 + 2.0) + 0.005 * g1(x * 13.1 + 7.0);
}
// morning mist pooled at the forest foot: wispy, uneven, drifting (periodic in x, loops seamlessly)
float mistF(float x, float y) {
  float d = mod(u_time, 1200.0) * (48.0 / 1200.0);
  float n = 0.65 * vnP(vec2(x * 6.0 + d, y * 45.0), 48.0) + 0.35 * vnP(vec2((x * 6.0 + d) * 2.0, y * 95.0 + 3.0), 96.0);
  float topY = 0.367 + 0.024 * n;
  return smoothstep(0.45, 0.85, n) * smoothstep(topY, topY - 0.012, y);
}
#define TW 0.0024
vec4 forestLin(vec2 p) {
  vec2 q = p + u_par * (0.30 * PK);
  float x = q.x;
  float hh = hillH(x);
  if (q.y > hh + TW * 4.5 || q.y < 0.30) return vec4(0.0);
  float ci = floor(x / TW);
  float top = hh;
  for (int j = -1; j <= 1; j++) {
    float c = ci + float(j);
    vec2 r = h22(vec2(c, 11.3));
    float cx = (c + 0.2 + 0.6 * r.x) * TW;
    float th = TW * (1.2 + 2.2 * r.y * r.y);
    float dx = abs(x - cx) / (TW * 0.9);
    top = max(top, hh + th * (1.0 - dx) - TW * 0.4);
  }
  float a = smoothstep(AA, -AA, q.y - top) * smoothstep(0.30, 0.31, q.y);
  if (a <= 0.0) return vec4(0.0);
  float dd = hh - q.y;
  // rows of conifers following the slope
  // irregular canopy: two jittered grids of conifer crowns following the slope
  float soft = 0.08 + PX / TW;
  float shade = 0.30;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 tc = vec2(x / TW, (dd + TW * (2.0 + 0.55 * fk)) / (TW * 1.1));
    float row = floor(tc.y);
    tc.x += h11(row * 1.7 + fk * 13.0) * 7.3;
    vec2 ti = floor(tc), tf = fract(tc);
    vec4 r = h42(ti + 3.1 + fk * 17.0);
    if (r.w < 0.12) continue;
    float lx = (tf.x - 0.5 - (r.x - 0.5) * 0.5) / (0.8 + 0.5 * r.z);
    float ty = tf.y - r.y * 0.25;
    float cone = smoothstep(-soft, soft, ty * 0.55 - abs(lx)) * step(0.0, ty);
    float cs = mix(1.15, 0.5, smoothstep(-0.25, 0.25, lx)) * (0.7 + 0.6 * r.z) * mix(1.0, 0.75, ty);
    shade = mix(shade, cs, cone);
  }
  shade = mix(shade, 0.62, smoothstep(0.12, 0.35, PX / TW));
  float sH = (hillH(x + 0.01) - hillH(x - 0.01)) / 0.02;
  float light = sat(0.5 + 1.5 * sH);
  float clear = 0.0;
  shade *= 0.8 + 0.4 * vn(vec2(x * 30.0, q.y * 90.0));
  vec3 alb = mix(vec3(0.020, 0.048, 0.020), vec3(0.11, 0.16, 0.045), clear);
  shade = mix(shade, 0.9, clear);
  vec3 c = alb * (SUNC * 2.3 * light * shade + AMB * 0.45 * (0.5 + 0.5 * shade));
  vec3 haze = hazeCol(x, q.y + 0.04);
  c = mix(c, haze, 0.13 + 0.04 * smoothstep(0.48, 0.40, q.y));
  if (q.y < 0.40) c = mix(c, haze * 1.05, mistF(x, q.y) * 0.18);
  return vec4(c, 1.0) * a;
}

// ---------------------------------------------------------------- valley + lake
float valleyH(float x) { return 0.366 + 0.05 * smoothstep(0.36, 1.1, abs(x - VX)) + 0.0035 * g1(x * 9.0 + 3.0); }
#define LX (VX - 0.04)
#define LW 0.42
// lake depth below the far shore at x (<= 0 where there is no lake): irregular coves, tapered ends
float lakeW(float x) {
  float u = sat(1.0 - sq((x - LX) / LW));
  return 0.031 * pow(u, 0.6) * (0.72 + 0.56 * n1(x * 6.0 + 2.0)) + 0.004 * g1(x * 23.0) + 0.0018 * g1(x * 61.0) - 0.004;
}
vec4 valleyLin(vec2 p) {
  vec2 q = p + u_par * (0.50 * PK);
  float x = q.x;
  float vh = valleyH(x);
  float lw = lakeW(x);
  float tl = smoothstep(0.004, -0.004, lw);
  float top = vh;
  if (tl > 0.0) {
    float tw2 = 0.0042;
    float ci = floor(x / tw2);
    for (int j = -1; j <= 1; j++) {
      float c = ci + float(j);
      vec2 r = h22(vec2(c, 5.7));
      if (r.y < 0.3) continue;
      float cx = (c + 0.2 + 0.6 * r.x) * tw2;
      float th = tw2 * (1.0 + 1.8 * r.y) * tl;
      top = max(top, vh + th * (1.0 - abs(x - cx) / (tw2 * 0.75)) - tw2 * 0.3);
    }
  }
  float a = smoothstep(AA, -AA, q.y - top) * smoothstep(0.26, 0.27, q.y);
  if (a <= 0.0) return vec4(0.0);
  vec3 haze = hazeCol(x, 0.42);
  float below = vh - q.y;
  // soft, irregular shoreline: water fades in over a narrow wet margin
  float sw = max(AA, 0.0011);
  float lake = lw > -0.002 ? smoothstep(-sw, sw, q.y - (vh - lw)) * step(q.y, vh) : 0.0;
  // land: foreshortened pasture with groves gathered towards the forest edge (with their shadows)
  vec2 vs = vec2(x * 40.0, q.y * 105.0);
  float f1 = vn(vs * vec2(0.5, 0.35));
  float gr = 0.65 * vn(vs) + 0.35 * vn(vs * 2.3 + 5.0);
  // groves only gather along the forest edge and thin out onto the pasture
  float edgeB = smoothstep(0.03, 0.0, below) * 0.42 - 0.12;
  float grove = smoothstep(0.62, 0.72, gr + edgeB) * smoothstep(0.004, -0.006, lw);
  float gsh = smoothstep(0.62, 0.72, 0.65 * vn(vs - vec2(0.5, -0.4)) + 0.35 * vn((vs - vec2(0.5, -0.4)) * 2.3 + 5.0) + edgeB);
  float cf = smoothstep(1.0, 0.4, PX * 500.0);
  float crown = mix(0.5, vn(vec2(x * 500.0, q.y * 800.0)), cf);
  vec3 alb = mix(vec3(0.035, 0.085, 0.022), vec3(0.085, 0.13, 0.03), f1);
  vec3 land = alb * (SUNC * 2.0 * (1.0 - 0.55 * gsh * (1.0 - grove)) + AMB * 0.5);
  float edge = step(vh + 0.0004, q.y);
  vec3 treeC = vec3(0.025, 0.05, 0.022) * (SUNC * 2.0 * (0.25 + 0.7 * crown) * (1.0 - edge * 0.6) + AMB * 0.5);
  land = mix(land, treeC, max(grove, edge));
  // wet margin along the near shore
  land *= 1.0 - 0.35 * smoothstep(0.004, 0.0, abs(q.y - (vh - lw))) * step(-0.002, lw);
  float mist = mistF(x, q.y + 0.004);
  land = mix(land, haze, 0.14 + 0.10 * smoothstep(0.34, 0.37, q.y));
  land = mix(land, haze * 1.05, mist * 0.16);
  vec3 c = land;
  if (lake > 0.0) {
    float drift = mod(u_time, 1200.0) * (64.0 / 1200.0);
    float rip = gnP(vec2(x * 40.0 - drift, q.y * 900.0), 64.0);
    float across = sat(below / max(lw, 0.002));          // 0 at the far shore .. 1 at the near shore
    vec2 rq = vec2(x + rip * 0.0010, vh + below + rip * 0.0012 * (1.0 + below * 60.0));
    vec2 rp = rq - u_par * (0.50 * PK);
    vec3 skyR = skyBase(vec2(rp.x, 0.60 + below * 6.0));
    vec4 fo = forestLin(rp);
    vec3 refl = skyR * (1.0 - fo.a) + fo.rgb * vec3(0.62, 0.78, 0.66);
    // wind sheen: rippled patches mirror the open sky; strongest mid-lake
    float sheen = smoothstep(0.40, 0.75, vnP(vec2(x * 7.0 - mod(u_time, 1200.0) * (32.0 / 1200.0), q.y * 110.0), 32.0));
    sheen *= pow(sin(3.14159 * across), 0.7);
    refl = mix(refl, skyBase(vec2(x, 0.80)), sheen * 0.75);
    // Fresnel: grazing (far) water mirrors, steeper near water shows its green-dark body
    float fres = mix(0.92, 0.50, across);
    vec3 body = mix(vec3(0.010, 0.026, 0.024), vec3(0.030, 0.065, 0.035), across);
    vec3 wc = mix(body, refl, fres);
    float wsun = exp(-abs(x - SUN.x - 0.05) * 3.5);
    wc += SUNC * 0.12 * wsun * (0.3 + sheen);
    vec2 gc = vec2(x * 300.0, q.y * 700.0);
    vec2 gi = floor(gc), gf = fract(gc);
    vec4 gh = h42(gi + 7.0);
    float tw = pow(max(0.0, sin(TAU * fract(TM * floor((0.4 + 1.2 * gh.z) * TP) / TP) + gh.w * TAU)), 10.0);
    vec2 dp = (gf - (0.3 + 0.4 * gh.xy)) * vec2(1.0 / 300.0, 1.0 / 700.0);
    float rs = max(0.00035, 0.6 * PX);
    float spark = exp(-(sq(dp.x / (rs * 1.8)) + sq(dp.y / rs))) * step(gh.x, 0.006 + 0.22 * wsun) * tw;
    wc += SUNC * 10.0 * spark * (0.1 + wsun) * (0.4 + 0.6 * sheen);
    wc = mix(wc, haze * 1.05, mist * 0.06);
    c = mix(land, wc, lake);
  }
  return vec4(c, 1.0) * a;
}
// ---------------------------------------------------------------- meadow
#define WPER 256.0
// wind gusts over the ground plane (g = (x / depth, 1 / depth)); drifts downwind, loops seamlessly
float gustF(vec2 g) {
  float d = mod(u_time, TP) * (WPER / TP);
  vec2 n = vec2(g.x * 1.7 - d, g.y * 0.45);
  return smoothstep(0.30, 0.90, vnP(n, WPER));
}
// slow cloud shadows sweeping over the meadow (ground coords), seamless loop
float cloudShade(vec2 g) {
  float d = mod(u_time, 1800.0) * (32.0 / 1800.0);
  return 1.0 - 0.40 * smoothstep(0.55, 0.80, vnP(vec2(g.x * 0.3 - d, g.y * 0.12), 32.0));
}
float meadowH(float x) { return 0.318 + 0.032 * smoothstep(0.0, 0.95, x) + 0.022 * smoothstep(-0.55, -1.2, x) + 0.005 * g1(x * 4.3 + 7.0); }

vec3 flowerAlb(float t, float v) {
  if (t < 0.30) return mix(vec3(0.72, 0.035, 0.010), vec3(0.80, 0.09, 0.015), v);    // poppy
  if (t < 0.55) return mix(vec3(0.11, 0.05, 0.42), vec3(0.36, 0.07, 0.30), v * v);   // lupine
  if (t < 0.80) return vec3(0.80, 0.80, 0.76);                                       // daisy
  return vec3(0.88, 0.56, 0.008);                                                    // buttercup
}
// regional drifts (g = (x / (depth + 0.12), -log depth): patches foreshorten with distance without
// fanning into perspective rays): weights for poppy swathes, lupine stands, daisy drifts and a
// sparse buttercup background; where all are low the meadow is nearly grass-only
vec4 driftW(vec2 g) {
  float A = vn(g * vec2(1.0, 1.5) + 11.0);
  float B = vn(g * vec2(2.6, 5.0) + 41.0);
  return vec4(smoothstep(0.52, 0.72, A) * 1.1, smoothstep(0.64, 0.78, B) * 1.0, smoothstep(0.46, 0.28, A) * 0.85, 0.12);
}
// pick a flower type from drift weights: returns 0.15 poppy, 0.42 lupine, 0.67 daisy, 0.9 buttercup
float pickType(vec4 w, float u) {
  u *= w.x + w.y + w.z + w.w;
  if (u < w.x) return 0.15;
  u -= w.x;
  if (u < w.y) return 0.42;
  u -= w.y;
  return u < w.z ? 0.67 : 0.9;
}

vec4 meadowLin(vec2 p) {
  vec2 q = p + u_par * (0.80 * PK);
  float mt = meadowH(q.x);
  float fr = 0.0025 * n1(q.x * 420.0) * smoothstep(3.0, 1.0, PX * 840.0);
  if (q.y > mt + 0.004) return vec4(0.0);
  float a = smoothstep(AA, -AA, q.y - mt - fr);
  if (a <= 0.0) return vec4(0.0);
  float D = max(YH - q.y, 0.004);
  float Z = 1.0 / D;
  vec2 g = vec2(q.x * Z, Z);
  float lz = -log(D);
  float gust = gustF(g);
  SHADE = cloudShade(g);
  float m1 = vn(g * vec2(1.2, 0.5));
  float m2 = vn(g * vec2(3.0, 1.2) + 3.0);
  vec3 lo = mix(vec3(0.018, 0.050, 0.010), vec3(0.035, 0.07, 0.012), m1);
  vec3 hi = mix(vec3(0.085, 0.19, 0.030), vec3(0.19, 0.23, 0.045), m2 * m2);
  vec3 sunG = SUNC * 2.0 * (0.85 + 0.45 * gust) * SHADE;
  float bfar = smoothstep(0.9, 0.35, PX / (D * 0.011));
  float base = mix(0.48, 0.22, bfar);
  vec3 c = mix(lo, hi, base) * (sunG * mix(0.3, 1.0, base) + AMB * 0.45);
  // flowers: drift-weighted types; they shrink and pack towards the horizon until only a colour
  // wash of the drifts remains, and thin out close up where the large plants take over
  vec4 w = driftW(vec2(q.x / (D + 0.12), lz));
  float tot = w.x + w.y + w.z + w.w;
  vec3 lt = SUNC * 1.9 * SHADE + AMB * 0.5;
  vec3 wash = (w.x * vec3(0.76, 0.05, 0.012) + w.y * vec3(0.16, 0.06, 0.40) + w.z * vec3(0.78, 0.78, 0.72) + w.w * vec3(0.88, 0.56, 0.01)) / tot * lt;
  float pres0 = min(tot, 1.0) * smoothstep(0.36, 0.16, D);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float cs = k == 0 ? 0.06 : (k == 1 ? 0.04 : 0.027);
    float fpc = PX / (cs * D);
    float far = smoothstep(0.12, 0.5, fpc);
    float pres = pres0 * (0.85 - 0.15 * fk);
    // far field: expected colour of the drifts (no per-cell sampling, so no sparkle)
    c = mix(c, wash, far * pres * 0.15 * (0.6 + 0.8 * m2));
    if (far >= 1.0) continue;
    float rowc = lz / cs + fk * 0.61;
    float ri = floor(rowc);
    float Dr = exp(-(ri + 0.5 - fk * 0.61) * cs);
    vec2 lc = vec2(q.x / (cs * Dr) + gust * 0.6 + h11(ri + fk * 7.0) * 50.0, rowc);
    vec2 ci = floor(lc), cf = fract(lc);
    vec4 h = h42(ci + fk * 31.0);
    if (h.w > pres) continue;
    float t = pickType(w, h.z);
    bool lup = t >= 0.30 && t < 0.55;
    vec3 fa = flowerAlb(t, h.x);
    float r = (0.09 + 0.06 * h.y) * (t > 0.8 ? 0.8 : 1.0) * (t >= 0.55 && t < 0.8 ? 0.85 : 1.0);
    vec2 cc = vec2(0.5 + (h.x - 0.5) * 0.6, 0.62 + 0.25 * (h.y - 0.5));
    vec2 dv = cf - cc;
    float dd = lup ? length((dv - vec2(0.0, r)) * vec2(1.6, 0.55)) : length(dv * vec2(1.0, 1.1 + 0.5 * h.z));
    float m = smoothstep(r + fpc, r - fpc, dd) * (1.0 - far);
    float stem = smoothstep(0.03 + fpc, 0.03 - fpc, abs(cf.x - cc.x + dv.y * 0.15)) * step(cf.y, cc.y) * (1.0 - far);
    float lit = 1.05 - 0.45 * sat(dv.x / r) + 0.25 * sat(-dv.x / r);
    vec3 fc = fa * (SUNC * 1.9 * lit * SHADE + AMB * 0.5) + fa * SUNC * 0.5 * SHADE;
    if (t >= 0.55 && t < 0.80) fc = mix(fc, vec3(0.9, 0.5, 0.02) * 2.0, smoothstep(r * 0.45 + fpc, r * 0.45 - fpc, dd));
    if (t < 0.30) fc = mix(fc, vec3(0.02), smoothstep(r * 0.35 + fpc, r * 0.35 - fpc, dd) * 0.8);
    c = mix(c, vec3(0.03, 0.07, 0.015) * (SUNC * 1.5 + AMB * 0.4), stem * 0.85);
    c = mix(c, fc, m);
  }
  // screen-upright grass blades in staggered log-depth rows; each blade rises into the row behind it
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
      float w = 0.40 * (1.0 - t);
      float m = (t < 1.0 && t > 0.0) ? smoothstep(w + fpx, w - fpx, abs(uf - cx)) : 0.0;
      m *= smoothstep(0.7, 0.3, fpx);
      bval = mix(bval, mix(0.15, 1.0, t) * (0.65 + 0.6 * h.w), m);
      bm = max(bm, m);
    }
  }
  vec3 bc = mix(lo, hi, bval) * (sunG * mix(0.3, 1.0, bval) + AMB * 0.45) + vec3(0.03, 0.035, 0.008) * gust * bval;
  c = mix(c, bc, bm);
  c = mix(c, hazeCol(q.x, 0.40), 0.22 * smoothstep(0.10, 0.012, D));
  return vec4(c, 1.0) * a;
}
// ---------------------------------------------------------------- plants (near rows)
vec3 litAlb(vec3 alb, float sun, float amb) { return alb * (SUNC * 2.0 * sun * SHADE + AMB * 0.55 * amb); }

// one radial flower head for poppies, daisies and buttercups (l: local, squashed for tilt; units of R)
vec4 radialHead(vec2 l, float aal, float sd, float t) {
  float r = length(l);
  if (r > 1.05 + aal) return vec4(0.0);
  float th = atan(l.y, l.x);
  bool pop = t < 0.30;
  bool dai = t >= 0.55 && t < 0.80;
  float cc = cos((pop ? 2.0 : (dai ? 21.0 : 2.5)) * th + sd * (dai ? 30.0 : 6.0));
  float detail = smoothstep(0.35, 0.15, aal * (dai ? 6.0 : 1.0));
  float edge, gap = 1.0;
  if (dai) {
    float pet = 0.5 + 0.5 * cc;
    edge = mix(0.92, 0.80 + 0.22 * sqrt(pet), detail);
    gap = mix(1.0, smoothstep(0.02, 0.22, pet + 0.5 * (0.45 - r)), detail);
  } else {
    edge = (pop ? 0.80 : 0.72) + (pop ? 0.20 : 0.28) * sqrt(abs(cc)) + (pop ? 0.04 * sin(th * 9.0 + sd * 20.0) * detail : 0.0);
  }
  float m = smoothstep(edge + aal, edge - aal, r) * gap;
  if (m <= 0.0) return vec4(0.0);
  float rr = r / edge;
  float sun = sat(0.8 - 0.42 * l.x + 0.15 * l.y);
  vec3 c;
  if (pop) {
    // cupped red petals: darker inner base with a black blotch, translucent glowing rims
    vec3 alb = mix(vec3(0.46, 0.012, 0.006), vec3(0.84, 0.05, 0.012), smoothstep(0.15, 0.75, rr));
    alb = mix(vec3(0.015, 0.012, 0.01), alb, smoothstep(0.17, 0.30, rr));
    float seam = smoothstep(0.85, 1.0, 1.0 - abs(cc)) * smoothstep(0.3, 0.6, rr) * detail;
    float cr = 1.0 + 0.12 * sin(th * 14.0 + rr * 9.0 + sd * 40.0) * detail;
    float cup = mix(1.0, 0.72, smoothstep(0.1, -0.6, l.y) * smoothstep(0.5, 0.9, rr));
    c = litAlb(alb * cr * (1.0 - 0.4 * seam), sun * cup, 1.0) + alb * SUNC * 1.7 * smoothstep(0.35, 1.0, rr) * SHADE;
    c = mix(c, vec3(0.10, 0.13, 0.05) * 1.6, smoothstep(0.13, 0.08, rr));
  } else if (dai) {
    vec3 alb = vec3(0.80, 0.80, 0.76) * (0.72 + 0.28 * smoothstep(0.2, 0.7, r)) * mix(1.0, 0.8 + 0.2 * (0.5 + 0.5 * cc), detail);
    c = litAlb(alb, sun, 1.0) + alb * SUNC * 0.45 * SHADE;
    vec3 dc = litAlb(vec3(0.85, 0.45, 0.01) * (0.7 + 0.5 * sat(1.0 - length(l - vec2(-0.1, 0.1)) / 0.3)), sun, 1.0);
    c = mix(c, dc, smoothstep(0.30 + aal, 0.30 - aal, r));
  } else {
    vec3 alb = vec3(0.90, 0.58, 0.008) * (0.7 + 0.3 * smoothstep(0.1, 0.6, r));
    c = litAlb(alb, sun, 1.0) + alb * SUNC * 0.7 * SHADE;
    vec2 hl = l - vec2(-0.32, 0.22);
    c += SUNC * 3.0 * SHADE * exp(-dot(hl, hl) * 25.0);
    c = mix(c, vec3(0.5, 0.45, 0.05), smoothstep(0.16, 0.10, r));
  }
  return vec4(c, 1.0) * m;
}
// poppy as a cup seen at elevation 'tilt' (1 = from above, ~0.3 = from the side): the open mouth
// (inner petals, black blotches, seed pod) above the outer face of the bowl; thin petals glow backlit
vec4 poppyCup(vec2 l, float aal, float sd, float tilt) {
  if (dot(l, l) > 2.2) return vec4(0.0);
  float detail = smoothstep(0.35, 0.15, aal);
  vec2 e = vec2(l.x, l.y / tilt);
  float re = length(e);
  float th = atan(e.y, e.x);
  float cc = cos(2.0 * th + sd * 6.0);
  float rimR = 0.80 + 0.20 * sqrt(abs(cc)) + 0.04 * sin(th * 9.0 + sd * 20.0) * detail;
  float ae = aal / sqrt(tilt);
  float mouth = smoothstep(rimR + ae, rimR - ae, re);
  float dB = 0.12 + 0.85 * (1.0 - tilt);
  float bl = length(vec2(l.x / 0.93, l.y / dB));
  float bowl = l.y < 0.0 ? smoothstep(1.0 + aal / dB, 1.0 - aal / dB, bl) : 0.0;
  float m = max(mouth, bowl);
  if (m <= 0.0) return vec4(0.0);
  float rr = re / rimR;
  vec3 inA = mix(vec3(0.40, 0.010, 0.005), vec3(0.82, 0.05, 0.012), smoothstep(0.15, 0.8, rr));
  inA = mix(vec3(0.012, 0.010, 0.008), inA, smoothstep(0.16, 0.30, rr));
  float seam = smoothstep(0.85, 1.0, 1.0 - abs(cc)) * smoothstep(0.3, 0.6, rr) * detail;
  float wall = mix(1.0, 0.6, (1.0 - tilt) * smoothstep(0.2, -0.6, e.y));
  vec3 inC = litAlb(inA * (1.0 - 0.4 * seam), sat(0.85 - 0.4 * l.x) * wall, 1.0) + inA * SUNC * 1.5 * smoothstep(0.4, 1.0, rr) * SHADE;
  inC = mix(inC, vec3(0.10, 0.13, 0.05) * 1.6, smoothstep(0.13, 0.08, rr));
  float vein = 1.0 + 0.12 * sin(atan(l.x, l.y + dB) * 22.0 + sd * 30.0) * detail;
  vec3 outA = vec3(0.80, 0.04, 0.012) * vein;
  float up = sat(1.0 + l.y / dB);
  vec3 outC = litAlb(outA, sat(0.75 - 0.45 * l.x) * mix(0.5, 1.0, up), 1.0)
            + outA * SUNC * SHADE * (0.5 + 1.7 * up * up) * (0.7 + 0.3 * sat(-l.x));
  outC = mix(outC, vec3(0.06, 0.12, 0.03) * (SUNC * 1.2 + AMB * 0.5), smoothstep(0.25, 0.0, up) * 0.7);
  vec3 c = mix(outC, inC, mouth);
  c += vec3(1.0, 0.25, 0.04) * SUNC * SHADE * 0.6 * smoothstep(0.75, 1.0, rr) * mouth;
  return vec4(c, 1.0) * m;
}
// lupine spike: l in units of the spike width, v along the spike [0,1]
vec4 lupineSpike(vec2 l, float len, float aal, float sd, float hue) {
  float v = l.y / len;
  if (v < -0.05 || v > 1.05) return vec4(0.0);
  float fv = v * 13.0 + sd * 3.0;
  float fr = fract(fv);
  float taper = (1.0 - pow(sat(v), 1.6)) * 0.85 + 0.12;
  float detail = smoothstep(0.4, 0.15, aal * 3.0);
  float w = taper * mix(1.0, 0.82 + 0.3 * sin(fr * 3.14159), detail);
  float m = smoothstep(w + aal, w - aal, abs(l.x)) * smoothstep(-0.05, 0.02, v) * smoothstep(1.05, 0.95, v);
  if (m <= 0.0) return vec4(0.0);
  vec3 alb = mix(vec3(0.11, 0.05, 0.45), vec3(0.40, 0.07, 0.32), hue);
  float banner = smoothstep(0.7, 0.9, fr) * smoothstep(0.45, 0.2, abs(l.x)) * detail * step(v, 0.75);
  alb = mix(alb, vec3(0.85, 0.82, 0.88), banner * 0.6);
  alb = mix(alb, vec3(0.32, 0.30, 0.40), smoothstep(0.75, 1.0, v));
  float sh = mix(1.0, 0.55 + 0.6 * fr, detail);
  float sun = sat(0.85 - 0.6 * l.x / max(w, 0.1)) * sh;
  vec3 c = litAlb(alb, sun, sh) + alb * SUNC * 0.9 * smoothstep(0.3, 1.0, abs(l.x) / max(w, 0.1));
  return vec4(c, 1.0) * m;
}

// one depth row of grass blades and flowering plants
vec4 plantRow(vec2 q, float yc, float rowH, float seed, float blur, float dens) {
  float D = YH - yc;
  vec4 acc = vec4(0.0);
  float aa = AA + blur;
  // wind and flower-drift fields vary slowly: sample once per row at this pixel
  vec2 gRow = vec2(q.x / D, 1.0 / D);
  float gs = gustF(gRow);
  vec4 dw = driftW(vec2(q.x / (D + 0.12), -log(D)));
  float dpres = dens * min(1.0, (dw.x + dw.y + dw.z + dw.w) * 1.1);
  // grass blades
  // look up cells around where the wind has carried the blades at this height
  float dyr = max(q.y - yc, 0.0);
  float bw = D * 0.032;
  float bu = (q.x - gs * 0.28 * min(dyr * dyr / (0.27 * D), 0.27 * D)) / bw;
  float bi = floor(bu) + (fract(bu) < 0.5 ? -1.0 : 0.0);
  // blades thinner than a pixel are already carried by the meadow texture (they appear at higher resolutions)
  int nb = D * 0.0045 < 0.6 * PX ? 0 : 2;
  for (int j = 0; j < nb; j++) {
    float c = bi + float(j);
    vec4 h = h42(vec2(c, seed));
    float bx = (c + h.x) * bw;
    float by = yc + (h.y - 0.5) * rowH;
    float H = D * (0.15 + 0.25 * h.z);
    float t = (q.y - by) / H;
    if (t < 0.0 || t > 1.0) continue;
    float lean = (h.w - 0.5) * 0.14 + gs * 0.28 + 0.04 * wav(0.4 + 0.3 * h.y, h.x * TAU);
    float sx = bx + lean * H * t * t;
    float slope = 2.0 * lean * t;
    float dx = (q.x - sx) / sqrt(1.0 + slope * slope);
    float hw = D * 0.0045 * (1.0 - t * 0.9);
    float m = smoothstep(hw + aa, hw - aa, abs(dx)) * min(1.0, (hw + 0.4 * AA) / (hw + blur));
    if (m <= 0.0) continue;
    vec3 alb = mix(vec3(0.045, 0.12, 0.02), vec3(0.20, 0.29, 0.05), t * 0.7 + 0.3 * h.y);
    float side = dx / hw;
    float sun = mix(1.15, 0.45, smoothstep(-0.7, 0.7, side));
    float ao = mix(0.22, 1.0, smoothstep(0.0, 0.6, t));
    vec3 col = litAlb(alb, sun * ao * (0.85 + 0.4 * gs), ao) + alb * SUNC * 1.1 * t * t;
    acc = over(acc, vec4(col, 1.0) * m);
  }
  // flowers
  // two nearest cells around where the wind has carried the heads at this height
  float fw = D * 0.09;
  float fu = (q.x - gs * 0.32 * min(dyr * dyr / (0.33 * D), 0.33 * D)) / fw;
  float fi = floor(fu) + (fract(fu) < 0.5 ? -1.0 : 0.0);
  for (int j = 0; j <= 1; j++) {
    float c = fi + float(j);
    vec4 h = h42(vec2(c, seed + 5.0));
    vec4 h2 = h42(vec2(c, seed + 9.0));
    if (h2.w > dpres) continue;
    float bx = (c + 0.3 + 0.4 * h.x) * fw;
    float by = yc + (h.y - 0.5) * rowH;
    float t = pickType(dw, h.z);
    if (blur > 0.003 && t >= 0.55 && t < 0.80) t = 0.15;
    bool isLup = t >= 0.30 && t < 0.55;
    float H = D * (isLup ? 0.30 + 0.16 * h2.x : 0.24 + 0.18 * h2.x);
    float bend = (h.w - 0.5) * 0.22 + gs * 0.32 + 0.05 * wav(0.3 + 0.25 * h2.y, h2.z * TAU);
    float hx = bx + bend * H;
    float hy = by + H * (1.0 - 0.12 * bend * bend);
    float R = t < 0.30 ? D * (0.035 + 0.012 * h2.y) : (isLup ? D * 0.017 : (t < 0.80 ? D * 0.028 : D * 0.018));
    float topY = isLup ? hy + R * 7.0 : hy + R;
    if (q.y < by - aa || q.y > topY + aa) continue;
    float st = sat((q.y - by) / (hy - by));
    float sx = bx + bend * H * st * st;
    vec2 l = q - vec2(hx, hy);
    float ang = isLup ? -bend * 0.8 : -bend * 0.6 + (h2.x - 0.5) * 0.5;
    l = vec2(l.x + ang * l.y, l.y - ang * l.x);   // small-angle rotation
    bool nearHead = isLup ? (abs(l.x) < R * 1.2 + aa && l.y > -R && l.y < R * 7.2) : dot(l, l) < sq(R * (t < 0.30 ? 1.6 : 1.1) + aa);
    float shw = D * 0.0028;
    if (!nearHead && abs(q.x - sx) > shw * 3.0 + aa) continue;
    // stem
    float slope = 2.0 * bend * st;
    float sdx = (q.x - sx) / sqrt(1.0 + slope * slope);
    float sm = smoothstep(shw + aa, shw - aa, abs(sdx)) * step(q.y, hy) * step(by, q.y) * min(1.0, (shw + 0.4 * AA) / (shw + blur));
    if (sm > 0.0) {
      float ao = mix(0.25, 1.0, smoothstep(0.0, 0.5, st));
      vec3 sc = litAlb(vec3(0.07, 0.15, 0.03), mix(1.1, 0.5, smoothstep(-0.8, 0.8, sdx / shw)) * ao, ao) + vec3(0.05, 0.09, 0.01) * SUNC * st;
      acc = over(acc, vec4(sc, 1.0) * sm);
    }
    if (!nearHead) continue;
    float aal = aa / R;
    float tilt = 0.32 + 0.62 * h2.z;
    vec4 hd;
    if (isLup) hd = lupineSpike(l / R, 7.0, aal, h2.y, step(0.7, h2.z) * h2.x);
    else if (t < 0.30) hd = poppyCup(l / R - vec2(0.0, 0.5 * (1.0 - tilt)), aal, h2.y, tilt);
    else {
      float tl = t >= 0.80 ? tilt + 0.2 : tilt;
      hd = radialHead(vec2(l.x, l.y / tl) / R, aal / tl, h2.y, t);
    }
    acc = over(acc, hd);
  }
  return acc;
}

vec4 flowersLin(vec2 p) {
  vec2 q = p + u_par * (1.0 * PK);
  if (q.y > 0.35) return vec4(0.0);
  vec4 acc = vec4(0.0);
  // cloud shadows are huge: one sample per pixel serves every row
  float Dp = max(YH - q.y, 0.01);
  SHADE = cloudShade(vec2(q.x / Dp, 1.0 / Dp));
  for (int r = 0; r < 6; r++) {
    float fr = float(r);
    float yc = 0.262 - fr * 0.042 - fr * fr * 0.0022;
    float D = YH - yc;
    // bases scatter across most of the gap to the next row, so rows never read as lines
    float rowH = 0.85 * (0.042 + 0.0022 * (2.0 * fr + 1.0));
    if (q.y < yc - rowH * 0.5 - 0.004 || q.y > yc + rowH * 0.5 + D * 0.60) continue;
    float blur = fr >= 5.0 ? 0.0012 : 0.0;
    acc = over(acc, plantRow(q, yc, rowH, 17.0 + fr * 13.0, blur, 0.85));
  }
  return acc;
}

// ---------------------------------------------------------------- air: pollen, sparkles, butterflies
vec2 bPath(float t, float id) {
  return vec2(0.60 * wavt(0.0105 + 0.004 * id, id * 2.0, t) + 0.14 * wavt(0.043, id * 5.0, t) + 0.03 * wavt(0.21, id, t),
              0.22 + 0.07 * wavt(0.027 + 0.006 * id, id * 1.3, t) + 0.025 * wavt(0.11, id * 3.0, t) + 0.012 * wavt(0.6, id * 4.0, t));
}
vec4 butterfly(vec2 q, float id) {
  vec2 c = bPath(TM, id);
  float S = 0.0135;
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
  vec3 alb;
  if (id < 0.5) {
    alb = mix(vec3(0.85, 0.30, 0.025), vec3(0.70, 0.18, 0.02), mh * (1.0 - mf));
    alb = mix(alb, vec3(0.02, 0.015, 0.01), smoothstep(0.72, 0.85, max(fwd * mf, hwd * mh * (1.0 - mf))));
    alb = mix(alb, vec3(0.9, 0.88, 0.8), smoothstep(0.12, 0.06, length(w - vec2(0.88, 0.55))) * mf);
  } else {
    alb = vec3(0.86, 0.86, 0.78);
    alb = mix(alb, vec3(0.05, 0.05, 0.05), smoothstep(0.25, 0.15, length(w - vec2(0.95, 0.62))) * mf);
    alb = mix(alb, vec3(0.08), smoothstep(0.08, 0.04, length(w - vec2(0.62, 0.30))) * mf);
  }
  vec3 col = litAlb(alb, 0.6 + 0.5 * o, 1.0) + alb * SUNC * 1.2 * (1.0 - o * 0.5);
  float body = smoothstep(1.0 + 4.0 * k, 1.0 - 4.0 * k, length(l / vec2(0.07, 0.42)));
  col = mix(col, vec3(0.03, 0.025, 0.02), body);
  return vec4(col, 1.0) * max(m, body);
}
vec4 airLin(vec2 p) {
  vec2 q = p + u_par * (1.15 * PK);
  if (q.y > 0.44) return vec4(0.0);
  SHADE = 1.0;
  vec4 acc = vec4(0.0);
  float fade = smoothstep(0.42, 0.30, q.y);
  for (int k = 0; k < 2; k++) {
    float cs = k == 0 ? 0.045 : 0.075;
    float per = k == 0 ? 48.0 : 32.0;
    float perY = k == 0 ? 13.0 : 7.0;
    float tt = mod(u_time, 150.0) / 150.0;
    vec2 qq = q - vec2(tt * per * cs, -tt * perY * cs) * (k == 0 ? 1.0 : 2.0);
    vec2 ci = floor(qq / cs);
    vec2 cf = fract(qq / cs);
    vec4 h = h42(vec2(mod(ci.x, per), mod(ci.y, perY)) + float(k) * 17.0);
    if (h.z > 0.55) continue;
    vec2 pos = 0.5 + (h.xy - 0.5) * 0.55 + 0.12 * vec2(wav(0.13 + 0.1 * h.w, h.x * TAU), wav(0.17 + 0.1 * h.z, h.y * TAU));
    float d = length(cf - pos) * cs;
    float rad = (k == 0 ? 0.0007 : 0.0012) + 0.0012 * h.w;
    float core = smoothstep(rad + AA, rad - AA, d);
    float glow = exp(-d * d / (rad * rad * 6.0)) * 0.45;
    float tw = 0.65 + 0.35 * wav(0.5 + h.x, h.y * TAU);
    float al = max(core, glow) * fade * (k == 0 ? 0.75 : 0.55);
    vec3 pc = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.95, 0.8), h.y) * 2.4 * tw;
    acc = over(acc, vec4(pc, 1.0) * al);
  }
  // star glints
  {
    float cs = 0.13;
    vec2 ci = floor(q / cs), cf = fract(q / cs);
    vec4 h = h42(ci + 51.0);
    if (h.z < 0.22 && q.y < 0.33) {
      float tw = pow(max(0.0, wav(0.15 + 0.2 * h.w, h.x * TAU)), 10.0);
      vec2 d = (cf - (0.25 + 0.5 * h.xy)) * cs;
      float st = exp(-abs(d.x) / 0.0009) * exp(-abs(d.y) / 0.012) + exp(-abs(d.y) / 0.0009) * exp(-abs(d.x) / 0.012) + exp(-dot(d, d) / 0.000004);
      float al = sat(st * tw) * 0.9;
      acc = over(acc, vec4(vec3(1.0, 0.92, 0.75) * 3.0, 1.0) * al);
    }
  }
  acc = over(acc, butterfly(q, 0.0));
  acc = over(acc, butterfly(q, 1.0));
  return acc;
}

// ---------------------------------------------------------------- foreground bokeh
vec4 bokehLin(vec2 p) {
  vec2 q = p + u_par * (1.3 * PK);
  if (q.y > 0.25) return vec4(0.0);
  vec4 acc = vec4(0.0);
  SHADE = cloudShade(vec2(q.x / 0.4, 2.5));
  if (q.y < 0.19) {
    acc = over(acc, plantRow(q, 0.005, 0.04, 211.0, 0.0045, 0.45));
    acc = over(acc, plantRow(q, -0.055, 0.05, 307.0, 0.0095, 0.35));
  }
  // soft specular bokeh discs, kept low and to the sides
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
    vec3 bc = mix(vec3(1.0, 0.80, 0.42), vec3(0.80, 0.95, 0.45), h.x) * 2.2 * tw;
    acc = over(acc, vec4(bc, 1.0) * disc * zone * 0.12);
  }
  return acc;
}

// ---------------------------------------------------------------- output
vec3 toDisp(vec3 c) {
  c *= 0.95;
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
  if (k == 2) return forestLin(p);
  if (k == 3) return valleyLin(p);
  if (k == 4) return meadowLin(p);
  if (k == 5) return flowersLin(p);
  if (k == 6) return airLin(p);
  return bokehLin(p);
}

void main() {
  TM = mod(u_time, TP);
  PX = 1.0 / u_res.y;
  AA = 0.75 * PX;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
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
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(valleyLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(forestLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(peaksLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(skyLin(p));
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4) + dith, 1.0);
}
`,
}
