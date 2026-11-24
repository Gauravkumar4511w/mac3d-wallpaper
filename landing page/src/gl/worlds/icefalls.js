// Iceland Falls — a powerful waterfall plunging over a basalt-column cliff into a
// plunge pool, in a green mossy valley under a soft overcast sky with sunbreaks.
// The falling curtain is textured in release-time space (each streak keeps the
// time it left the lip, so it accelerates and stretches as it falls); a billowing
// spray cloud rises from the pool and drifts on the breeze; when the cloud deck
// opens, sunlight sweeps over the valley and a rainbow forms in the spray. A
// braided river winds toward the viewer past boulders; fulmars glide the cliffs.
//
// Every layer is rendered in linear light, tone-mapped (ACES fit) and
// gamma-encoded on its own, so the full scene is exactly the back-to-front
// "over" composite of the isolated layers shown in the exploded view.

export default {
  id: 'icefalls',
  name: 'Iceland Falls',
  tag: 'Waterfall valley',
  accent: '#58b86a',
  accent2: '#7fb4d8',
  ink: '#1e5a33',
  glow: '#e4f1e8',
  light: true,
  clockColor: '#15232b',
  sky: 'linear-gradient(180deg,#6f86a3 0%,#a9b8c8 22%,#d3dbe2 40%,#c7d0d6 46%,#8f9b8e 50%,#4a5a44 56%,#5e7c3a 62%,#7d8f86 66%,#56703a 76%,#3f5a26 88%,#2f4520 100%)',
  stillTime: 292,
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Highlands', depth: 0.07 },
    { name: 'Basalt cliff', depth: 0.26 },
    { name: 'Waterfall', depth: 0.28 },
    { name: 'Braided river', depth: 0.4 },
    { name: 'Spray and rainbow', depth: 0.44 },
    { name: 'Valley slopes', depth: 0.62 },
    { name: 'Mossy bank', depth: 1.0 },
    { name: 'Fulmars', depth: 1.2 },
  ],
  clockAfter: 1,
  frag: /* glsl */ `
#define TAU 6.2831853
#define PI 3.14159265
#define TP 1200.0
#define PK 0.030
#define YH 0.47
#define FOC 1.25
#define FX 0.07
#define LIP 0.601
#define BASEY 0.36
#define CH 22.0
#define ZC 250.0
#define GF 0.049
#define V0 0.012

float TM;    // u_time folded into a 1200 s loop; every oscillator is quantised to it
float PX;    // one pixel in scene units (height-relative)
float AA;    // half-width of an anti-aliased edge
float SUNV;  // how far the cloud deck has opened (0 overcast .. 1 broken sunshine)
float SH = 0.0; // direct sun reaching the current surface point (cloud shadows)

const vec3 LDIR = vec3(0.3999, 0.5199, -0.7548);  // towards the sun: behind the viewer, to the right
const vec3 SUNC = vec3(0.88, 0.78, 0.64);
const vec3 SKYC = vec3(0.58, 0.64, 0.72);

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
// value noise with its gradient
vec3 vnD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h12(i), b = h12(i + vec2(1.0, 0.0)), c = h12(i + vec2(0.0, 1.0)), d = h12(i + 1.0);
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y,
              du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}
// value noise, periodic in x / in y
float vnP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mod(i.x, per), b = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(a, i.y)), h12(vec2(b, i.y)), u.x), mix(h12(vec2(a, i.y + 1.0)), h12(vec2(b, i.y + 1.0)), u.x), u.y);
}
float vnPy(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mod(i.y, per), b = mod(i.y + 1.0, per);
  return mix(mix(h12(vec2(i.x, a)), h12(vec2(i.x + 1.0, a)), u.x), mix(h12(vec2(i.x, b)), h12(vec2(i.x + 1.0, b)), u.x), u.y);
}
float gq(vec2 i, vec2 f) { return dot(h22(i) * 2.0 - 1.0, f); }
float gn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(gq(i, f), gq(i + vec2(1.0, 0.0), f - vec2(1.0, 0.0)), u.x),
             mix(gq(i + vec2(0.0, 1.0), f - vec2(0.0, 1.0)), gq(i + 1.0, f - 1.0), u.x), u.y);
}
float gnP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = mod(i.x, per), b = mod(i.x + 1.0, per);
  return mix(mix(gq(vec2(a, i.y), f), gq(vec2(b, i.y), f - vec2(1.0, 0.0)), u.x),
             mix(gq(vec2(a, i.y + 1.0), f - vec2(0.0, 1.0)), gq(vec2(b, i.y + 1.0), f - 1.0), u.x), u.y);
}
float gnPy(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = mod(i.y, per), b = mod(i.y + 1.0, per);
  return mix(mix(gq(vec2(i.x, a), f), gq(vec2(i.x + 1.0, a), f - vec2(1.0, 0.0)), u.x),
             mix(gq(vec2(i.x, b), f - vec2(0.0, 1.0)), gq(vec2(i.x + 1.0, b), f - 1.0), u.x), u.y);
}
float fbmP(vec2 s, float per, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    v += w * a * gnP(s, per);
    s = s * 2.0 + vec2(0.0, 5.7);
    per *= 2.0; a *= 0.5;
  }
  return v;
}
vec4 over(vec4 b, vec4 f) { return f + b * (1.0 - f.a); }
vec3 rayDir(vec2 p) { return normalize(vec3(p.x, p.y - YH, FOC)); }

// ---------------------------------------------------------------- light
// the shadow-casting cloud deck (behind the viewer, where the sun is): an opening at deck point g (m)
float deckOpen(vec2 g) {
  vec2 s = g * (1.0 / 115.0) - vec2(TM * (12.0 / TP), 0.0);
  float n = 0.65 * vnP(s, 12.0) + 0.35 * vnP(s * 2.0 + vec2(0.0, 7.3), 24.0);
  float thr = mix(0.80, 0.50, SUNV);
  return smoothstep(thr, thr + 0.07, n);
}
// direct sunlight at camera-space point P (m, y up): trace towards the sun up to the deck
float sunAt(vec3 P) { return deckOpen(P.xz + LDIR.xz * ((1800.0 - P.y) / LDIR.y)); }
// distant terrain: large soft sun patches drifting across the highlands
float sunFar(vec2 p) {
  float n = vnP(vec2(p.x * 3.0 - TM * (6.0 / TP), p.y * 40.0), 6.0);
  float thr = mix(0.80, 0.35, SUNV);
  return smoothstep(thr - 0.06, thr + 0.10, n);
}

// ---------------------------------------------------------------- sky
vec3 skyBase(vec3 rd) {
  float e = max(rd.y, 0.0);
  vec3 c = mix(vec3(0.84, 0.87, 0.90), vec3(0.54, 0.65, 0.80), smoothstep(0.0, 0.25, e));
  c = mix(c, vec3(0.28, 0.42, 0.68), smoothstep(0.15, 0.75, e));
  return c * (1.0 + 0.10 * rd.x);
}
// the overcast as seen mirrored in water
vec3 reflSky(vec3 rd) { return mix(vec3(0.80, 0.83, 0.87), vec3(0.60, 0.65, 0.72), smoothstep(0.05, 0.6, rd.y)); }
float billowP(vec2 s, float per, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    v += w * a * abs(gnP(s, per)) * 2.0;
    s = s * 2.0 + vec2(0.0, 3.1);
    per *= 2.0; a *= 0.5;
  }
  return v;
}
vec4 skyLin(vec2 p) {
  vec3 rd = rayDir(p);
  vec3 sky = skyBase(rd);
  if (rd.y < 0.002) return vec4(sky, 1.0);
  float t = 1800.0 / rd.y;
  vec2 s = rd.xz * (t / 1400.0) - vec2(TM * (16.0 / TP), 0.0);
  float fp = t * PX / (FOC * rd.y * 1400.0);
  float oct = clamp(log2(0.6 / fp), 1.0, 7.0);
  vec2 w = vec2(vnP(s * 0.5, 8.0), vnP(s * 0.5 + vec2(0.0, 4.1), 8.0)) - 0.5;
  vec2 sw = s + w * vec2(1.1, 0.7);
  float n = fbmP(sw, 16.0, oct) + 0.22 * (billowP(sw * 2.0 + 3.0, 32.0, oct - 1.0) - 0.45);
  float big = vnP(s * 0.25 + vec2(0.0, 1.7), 4.0);
  // a stratocumulus deck; its gaps open into blue as the sun breaks through
  float cov = mix(-0.20, 0.07, SUNV) + 0.18 * (big - 0.5);
  float dens = smoothstep(cov - 0.05, cov + 0.14, n);
  float n2 = fbmP(sw + vec2(0.10, -0.14), 16.0, min(oct, 3.0));
  float thick = sat((n - cov) * 2.6);
  float lit = sat(0.5 + (n2 - n) * 4.0);
  // keep the clock band calm: lighter, lower-contrast cloud there
  float band = smoothstep(0.62, 0.70, p.y) * smoothstep(0.93, 0.85, p.y) * smoothstep(0.55, 0.25, abs(p.x));
  vec3 dark = vec3(0.37, 0.40, 0.45), light = vec3(0.93, 0.94, 0.95);
  vec3 col = mix(light, dark, thick * mix(0.92, 0.5, band) * (0.72 + 0.28 * smoothstep(0.72, 1.0, p.y)));
  col *= 0.86 + 0.26 * lit * (1.0 - 0.5 * band);
  col += SUNC * 0.35 * SUNV * lit * (1.0 - thick);
  float hz = 1.0 - exp(-t / 45000.0);
  col = mix(col, sky, hz);
  return vec4(mix(sky, col, dens), 1.0);
}
// aerial perspective colour
vec3 hazeC(float y) { return vec3(0.72, 0.77, 0.83) * (1.0 + 0.05 * sat((y - 0.5) * 4.0)); }

// ---------------------------------------------------------------- highlands
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
float iceH(float x) {
  return 0.597 + 0.044 * exp(-sq((x + 0.08) / 0.55)) + 0.003 * g1(x * 4.0 + 1.0) + 0.0012 * g1(x * 13.0 + 3.0);
}
float rangeH(float x, float oct) {
  return 0.588 + 0.034 * exp(-sq((x - 0.36) / 0.16)) + 0.024 * exp(-sq((x + 0.62) / 0.18))
       + 0.022 * (ridgeP(x * 3.4 + 2.0, oct) - 0.55);
}
float moorH(float x) { return 0.593 + 0.004 * g1(x * 4.0 + 7.0) + 0.0015 * g1(x * 15.0); }
vec4 highLin(vec2 p) {
  vec2 q = p + u_par * (0.07 * PK);
  float x = q.x, y = q.y;
  float oct = clamp(log2(0.3 / (3.4 * PX)), 2.0, 8.0);
  float hi = iceH(x), hr = rangeH(x, oct), hm = moorH(x);
  if (y > max(max(hi, hr), hm) + 2.0 * PX || y < 0.575) return vec4(0.0);
  vec4 res = vec4(0.0);
  // the ice cap: a broad, softly shaded dome with faint outlet glaciers
  float ai = smoothstep(AA, -AA, y - hi);
  if (ai > 0.0) {
    SH = sunFar(vec2(x, y));
    float sl = (iceH(x + 0.01) - iceH(x - 0.01)) / 0.02;
    float dd = hi - y;
    float fl = vn(vec2(x * 40.0 + dd * 25.0 * sl, dd * 260.0));
    vec3 N = normalize(vec3(-sl * 2.2 - (fl - 0.5) * 0.25, 0.75 - dd * 6.0, -0.55));
    vec3 alb = vec3(0.86, 0.89, 0.93) * (0.94 + 0.06 * fl);
    vec3 c = alb * (SKYC * 1.0 + SUNC * 2.0 * max(dot(N, LDIR), 0.0) * SH);
    res = vec4(mix(c, hazeC(y), 0.55), 1.0) * ai;
  }
  // rugged ranges: dark rock streaked with snow
  float ar = smoothstep(AA, -AA, y - hr);
  if (ar > 0.0) {
    SH = sunFar(vec2(x + 3.1, y));
    float dd = hr - y;
    float s = (rangeH(x + 0.004, 4.0) - rangeH(x - 0.004, 4.0)) / 0.008;
    float gu = 1.0 - abs(gn(vec2((x + dd * clamp(s, -2.0, 2.0) * 0.5) * 70.0, dd * 110.0)) * 2.0);
    vec3 N = normalize(vec3(-clamp(s, -3.0, 3.0) * 0.8, 0.5, -0.7));
    float snow = smoothstep(0.42, 0.72, gu * 0.7 + 0.45 * smoothstep(0.016, 0.0, dd) + 0.25 * vn(vec2(x * 200.0, y * 300.0)));
    vec3 alb = mix(vec3(0.07, 0.068, 0.07), vec3(0.85, 0.88, 0.92), snow);
    vec3 c = alb * (SKYC * 1.0 + SUNC * 2.2 * max(dot(N, LDIR), 0.0) * SH);
    res = over(res, vec4(mix(c, hazeC(y), 0.50), 1.0) * ar);
  }
  // nearer moorland plateau
  float am = smoothstep(AA, -AA, y - hm);
  if (am > 0.0) {
    SH = sunFar(vec2(x * 1.7 + 7.3, y));
    vec3 alb = mix(vec3(0.050, 0.060, 0.032), vec3(0.085, 0.075, 0.045), vn(vec2(x * 40.0, y * 400.0)));
    vec3 c = alb * (SKYC * 1.0 + SUNC * 2.0 * 0.5 * SH);
    res = over(res, vec4(mix(c, hazeC(y), 0.34), 1.0) * am);
  }
  return res;
}

// ---------------------------------------------------------------- rock and talus materials
// jittered 1D cells: (column id, position across the column 0..1, width)
vec3 colCell(float u) {
  float i = floor(u);
  float b0 = i + 0.34 * (h11(i * 1.37 + 0.5) - 0.5);
  if (u < b0) i -= 1.0;
  else if (u >= i + 1.0 + 0.34 * (h11((i + 1.0) * 1.37 + 0.5) - 0.5)) i += 1.0;
  float s0 = i + 0.34 * (h11(i * 1.37 + 0.5) - 0.5);
  float s1 = i + 1.0 + 0.34 * (h11((i + 1.0) * 1.37 + 0.5) - 0.5);
  return vec3(i, (u - s0) / (s1 - s0), s1 - s0);
}
// A basalt face in metres: u along the face, h above the valley floor, fu metres per pixel.
// N0 is the face normal and T its horizontal tangent (camera space). Three stacked lava flows,
// each a regular colonnade under a hackly entablature, capped by red scoria; buttresses and
// bays, deep fractures, moss on ledges and in the spray zone.
vec3 basalt(float u, float h, float fu, vec3 N0, vec3 T, float wet, float spray) {
  float b1 = 14.0 + 1.6 * g1(u * 0.031 + 2.0);
  float b2 = 31.0 + 2.2 * g1(u * 0.024 + 5.0);
  float fid = h < b1 ? 0.0 : (h < b2 ? 1.0 : 2.0);
  float fb = fid < 0.5 ? 0.0 : (fid < 1.5 ? b1 : b2);
  float ft = fid < 0.5 ? b1 : (fid < 1.5 ? b2 : 49.0);
  float f = (h - fb) / (ft - fb);
  float ent = step(0.45 + 0.12 * g1(u * 0.07 + fid * 3.0), f);
  float rel = 0.55 * gn(vec2(u * 0.030, fid * 1.7 + 0.3)) + 0.25 * gn(vec2(u * 0.09, h * 0.02 + fid));
  vec3 Nf = normalize(N0 + T * rel);
  vec3 Tf = normalize(T - N0 * rel);
  float bay = smoothstep(0.1, -0.3, rel);
  float fa, crack, joint, ledge, tone, cvis;
  if (ent < 0.5) {
    // colonnade: tall prisms whose width drifts along the face
    float cw = 1.15 * (0.75 + 0.5 * n1(u * 0.02 + fid * 5.0));
    vec3 cc = colCell(u / cw);
    vec4 hc = h42(vec2(cc.x, fid * 3.0 + 1.0));
    float lu = cc.y;
    float pxu = fu / (cw * cc.z);
    cvis = smoothstep(0.8, 0.25, pxu);
    float f1 = 0.16 + 0.26 * hc.x, f2 = 0.58 + 0.28 * hc.y;
    float e1 = smoothstep(f1 - pxu, f1 + pxu, lu), e2 = smoothstep(f2 - pxu, f2 + pxu, lu);
    fa = mix(mix(-0.7, 0.0, e1), 0.7, e2) * cvis;
    float js = 0.8 * (0.7 + 0.6 * hc.z);
    float jv = (h - fb) / js + hc.w * 7.0 + 0.35 * sq(lu - 0.5);
    float ji = floor(jv), jf = fract(jv);
    float jpx = fu / js;
    float jvis = smoothstep(0.7, 0.2, jpx);
    joint = smoothstep(0.05 + jpx, 0.05 - jpx, min(jf, 1.0 - jf)) * jvis * 0.3;
    ledge = smoothstep(0.22 + jpx, 0.22 - jpx, jf) * step(h12(vec2(cc.x, ji + fid * 50.0)), 0.14) * jvis;
    crack = smoothstep(0.06 + pxu, 0.06 - pxu, min(lu, 1.0 - lu)) * cvis;
    tone = mix(1.0, 0.75 + 0.5 * hc.z, cvis);
  } else {
    // entablature: thin, irregular, hackly columns read as a fractured, organic texture
    float pxu = fu / 0.5;
    cvis = smoothstep(0.8, 0.25, pxu);
    vec2 ec = vec2(u * 1.6 + 1.2 * gn(vec2(u * 0.12, h * 0.25) + fid * 4.0), h * 0.9);
    float r1 = gn(ec + fid * 7.0), r2 = gn(ec * vec2(2.3, 1.7) + 13.0);
    fa = (r1 * 1.1 + r2 * 0.5) * cvis;
    float fw = 0.05 + fu * 1.2;
    crack = (smoothstep(fw, 0.0, abs(r1)) * 0.7 + smoothstep(fw, 0.0, abs(r2)) * 0.4) * cvis;
    joint = 0.0;
    ledge = smoothstep(0.80, 0.92, vn(vec2(u * 0.6, h * 2.5) + fid)) * smoothstep(0.8, 0.25, fu / 0.6) * 0.8;
    tone = mix(1.0, 0.8 + 0.4 * vn(vec2(u * 1.3, h * 0.7)), cvis);
  }
  // deep fractures cleaving a flow
  float fc = floor(u / 16.0);
  float fxp = (fc + 0.2 + 0.6 * h11(fc * 1.7 + fid * 13.0)) * 16.0 + 0.5 * g1(h * 0.18 + fc);
  float frac = smoothstep(0.25 + fu, max(0.25 - fu, 0.0), abs(u - fxp)) * step(h11(fc * 3.1 + fid * 7.0), 0.5);
  // albedo: per-column tone, red scoria caps, lichen, water stains, moss
  vec3 alb = mix(vec3(0.080, 0.078, 0.075), vec3(0.058, 0.056, 0.054), ent) * tone;
  float v1 = vn(vec2(u * 0.25, h * 0.12));
  alb *= 0.80 + 0.40 * v1;
  float sco = smoothstep(0.88, 0.94, f + 0.03 * g1(u * 0.4));
  alb = mix(alb, vec3(0.12, 0.062, 0.038) * (0.8 + 0.4 * v1), sco);
  alb = mix(alb, vec3(0.16, 0.17, 0.14), smoothstep(0.72, 0.88, vn(vec2(u * 0.7, h * 0.45))) * 0.35 * (1.0 - wet));
  float stain = smoothstep(0.55, 0.82, vn(vec2(u * 0.7, h * 0.035 + 2.0)));
  alb *= (1.0 - 0.35 * stain) * (1.0 - 0.5 * wet);
  float mn = 0.6 * vn(vec2(u * 0.4, h * 0.6)) + 0.4 * vn(vec2(u * 1.4, h * 2.0));
  float mossAmt = mn + 0.45 * spray + 0.6 * ledge + 0.25 * sco + 0.3 * smoothstep(8.0, 2.0, h) - 0.3 * wet + 0.2 * bay;
  float moss = smoothstep(0.66, 0.84, mossAmt) * (1.0 - 0.7 * crack);
  vec3 mossC = mix(vec3(0.035, 0.080, 0.014), vec3(0.085, 0.13, 0.022), vn(vec2(u * 2.0, h * 1.6)));
  alb = mix(alb, mossC, moss);
  vec3 N = normalize(Tf * fa + Nf * sqrt(1.0 - fa * fa));
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0) + Nf * 0.3, max(ledge, moss * 0.3)));
  float occ = (1.0 - 0.6 * crack) * (1.0 - 0.5 * joint * (1.0 - ledge)) * (1.0 - 0.35 * bay) * (1.0 - 0.75 * frac);
  float dif = max(dot(N, LDIR), 0.0);
  vec3 col = alb * (SKYC * (0.62 + 0.38 * N.y) * occ + SUNC * 2.7 * dif * SH * (0.35 + 0.65 * occ));
  col += wet * (1.0 - crack) * SKYC * 0.03 * (0.4 + 0.6 * vn(vec2(u * 1.3, h * 0.13)));
  return col;
}
// mossy talus and grass slopes in metres (u along, h up); fp: metres per pixel along u and h —
// noise is stretched where it would alias so detail holds under heavy foreshortening
vec3 talus(float u, float h, vec2 fp, vec3 N0, vec3 T, float lush) {
  vec2 c = vec2(u, h);
  float big = vn(c * vec2(0.05, 0.08) + 3.0);
  float mid = vn(c / max(vec2(5.0, 4.0), fp * 1.5) + 1.0);
  float scr = smoothstep(0.62, 0.80, vn(vec2(u / max(8.0, fp.x * 1.5), h * 0.035) + 7.0) * 0.65 + 0.35 * mid) * (1.0 - lush);
  float ocr = smoothstep(0.74, 0.80, vn(c / max(vec2(11.0, 7.0), fp * 1.5) + 17.0) * 0.8 + 0.2 * mid) * (1.0 - 0.6 * lush);
  vec2 s3 = max(vec2(0.13), fp * 1.5);
  float a3 = 0.13 / sqrt(s3.x * s3.y);
  float b3 = vn(c / s3 + 11.0);
  vec2 s1 = max(vec2(0.9), fp * 1.5), s2 = max(vec2(0.32), fp * 1.5);
  float a1 = 0.9 / sqrt(s1.x * s1.y), a2 = 0.32 / sqrt(s2.x * s2.y);
  vec3 b = vnD(c / s1);
  vec3 b2 = vnD(c / s2 + 5.0);
  vec2 gr = b.yz / s1 * 0.35 * a1 + b2.yz / s2 * 0.12 * a2;
  // scattered boulders
  vec2 bc = c / 3.2;
  vec2 bi = floor(bc);
  vec4 bh = h42(bi + 41.0);
  vec2 bl = (fract(bc) - 0.5 - (bh.xy - 0.5) * 0.4) / (0.12 + 0.18 * bh.z);
  float bm = step(bh.w, 0.16 + 0.5 * scr) * smoothstep(1.0 + fp.y, 1.0 - fp.y, length(bl * vec2(1.0, 1.3))) * smoothstep(1.4, 0.6, fp.x);
  vec3 N = normalize(N0 - T * gr.x * 0.7 - vec3(0.0, 1.0, 0.0) * gr.y * 0.3);
  N = normalize(mix(N, normalize(N0 + T * bl.x * 0.6 + vec3(0.0, 0.5, 0.0) * bl.y), bm * 0.8));
  vec3 grass = mix(vec3(0.034, 0.075, 0.018), vec3(0.075, 0.115, 0.028), sat(big * 0.5 + mid * 0.3 + (b.x - 0.5) * 0.5 * a1 + (b2.x - 0.5) * 0.45 * a2 + 0.1));
  grass *= 1.0 + 0.55 * (b3 - 0.5) * a3;
  grass = mix(grass, vec3(0.095, 0.090, 0.042), smoothstep(0.66, 0.82, vn(c / max(vec2(6.0, 4.0), fp * 1.5) + 9.0)) * 0.45);
  vec3 alb = mix(grass, vec3(0.095, 0.094, 0.090) * (0.75 + 0.5 * mix(0.5, b2.x, a2)), scr * 0.85);
  alb = mix(alb, vec3(0.085, 0.083, 0.078) * (0.7 + 0.4 * b.x + 0.4 * (b3 - 0.5) * a3), ocr * 0.75);
  alb = mix(alb, mix(vec3(0.11, 0.11, 0.10), vec3(0.07, 0.11, 0.03), smoothstep(0.0, 0.8, bl.y) * 0.7), bm);
  float occ = (0.80 + 0.20 * mix(0.5, b.x, a1)) * (0.9 + 0.2 * mix(0.5, b2.x, a2)) * (1.0 - 0.15 * ocr);
  return alb * (SKYC * (0.5 + 0.5 * N.y) * occ + SUNC * 2.7 * max(dot(N, LDIR), 0.0) * SH);
}

// ---------------------------------------------------------------- basalt cliff (back wall)
float rimY(float x) {
  float d = x - FX;
  return 0.594 + 0.010 * exp(-sq(d / 0.25)) + 0.004 * g1(x * 7.0 + 2.0) + 0.0016 * g1(x * 23.0 + 1.0)
       + 0.0006 * g1(x * 80.0) - 0.006 * exp(-sq(d / 0.05));
}
float talusY(float x) {
  float ad = abs(x - FX);
  return BASEY + 0.002 + 0.125 * smoothstep(0.10, 0.50, ad) * (1.0 + 0.15 * g1(x * 6.0 + 4.0)) + 0.005 * g1(x * 19.0) * smoothstep(0.09, 0.16, ad);
}
vec4 cliffLin(vec2 p) {
  vec2 q = p + u_par * (0.267 * PK);
  float x = q.x, y = q.y, d = x - FX;
  float rim = rimY(x);
  float fr = 0.0018 * (n1(x * 700.0) - 0.3) * smoothstep(2.5, 0.8, PX * 700.0) + 0.0009 * n1(x * 160.0);
  if (y > rim + 0.004 || y < BASEY - 0.002) return vec4(0.0);
  float a = smoothstep(AA, -AA, y - rim - fr);
  if (a <= 0.0) return vec4(0.0);
  float u = x * 200.0, h = (y - BASEY) * 200.0, fu = PX * 200.0;
  SH = sunAt(vec3(u, h - CH, ZC));
  // amphitheatre round the falls: the walls turn towards the plunge
  float yaw = -0.7 * clamp(d / 0.12, -1.0, 1.0) * exp(-sq(d / 0.22));
  vec3 N0 = vec3(sin(yaw), 0.0, -cos(yaw));
  vec3 T = vec3(cos(yaw), 0.0, sin(yaw));
  float spray = exp(-sq(d / 0.20)) * smoothstep(40.0, 8.0, h);
  float wet = exp(-sq(d / 0.085)) * smoothstep(52.0, 30.0, h);
  vec3 col = basalt(u, h, fu, N0, T, wet, spray);
  col *= 1.0 - 0.35 * exp(-sq(d / 0.075));
  // soil band and turf overhang at the rim
  float rh = (rim - y) * 200.0;
  float soil = smoothstep(2.6, 1.6, rh + 0.6 * g1(x * 60.0));
  vec3 sc = mix(vec3(0.07, 0.05, 0.035), vec3(0.11, 0.075, 0.045), vn(vec2(u * 2.0, h * 6.0))) * (SKYC * 0.55 + SUNC * 1.2 * SH);
  col = mix(col, sc, soil);
  float turf = smoothstep(1.1, 0.5, rh + 0.4 * g1(x * 150.0));
  vec3 tc = mix(vec3(0.05, 0.11, 0.022), vec3(0.10, 0.15, 0.035), vn(vec2(u * 3.0, h * 3.0))) * (SKYC * 0.95 + SUNC * 2.2 * SH);
  col = mix(col, tc, turf);
  // mossy talus at the foot
  float tY = talusY(x);
  if (y < tY + 2.0 * AA) {
    float tm = smoothstep(AA, -AA, y - tY);
    vec3 tN = normalize(vec3(-sign(d) * 0.3, 0.62, -0.72));
    col = mix(col, talus(u, h, vec2(fu), tN, vec3(1.0, 0.0, 0.0), 0.3 * exp(-sq(d / 0.2))), tm);
  }
  col = mix(col, hazeC(y), 0.05);
  return vec4(col, 1.0) * a;
}

// ---------------------------------------------------------------- waterfall
float fallHW(float dd) { return 0.047 + 0.020 * pow(sat(dd / 0.24), 1.4); }
// one layer of crisp vertical streaks: jittered columns across the curtain, each brightening and
// dimming along release time (so the pattern falls with the water); edges filtered to the pixel
float streaks(float xr, float R, float cwid, float k, float seed, float lodX) {
  vec3 cc = colCell(xr / cwid + seed);
  float aw = max(lodX / (cwid * cc.z), 1e-4);
  float b0 = vnPy(vec2(cc.x * 7.3 + seed, R * k), TP * k);
  float nb = cc.y < 0.5 ? cc.x - 1.0 : cc.x + 1.0;
  float t = cc.y < 0.5 ? sat((aw - cc.y) / (2.0 * aw)) : sat((cc.y - 1.0 + aw) / (2.0 * aw));
  float b1 = vnPy(vec2(nb * 7.3 + seed, R * k), TP * k);
  return mix(mix(b0, b1, t), 0.5, smoothstep(0.25, 0.6, aw));
}
vec4 fallLin(vec2 p) {
  vec2 q = p + u_par * (0.27 * PK);
  float d = LIP - q.y;
  if (d < -0.006 || q.y < BASEY - 0.002) return vec4(0.0);
  float dd = max(d, 0.0);
  float hw = fallHW(dd);
  float xr = (q.x - FX) / hw;
  if (abs(xr) > 1.5) return vec4(0.0);
  // release-time coordinate: a parcel that left the lip at time R has fallen dd by now
  float v = sqrt(V0 * V0 + 2.0 * GF * dd);
  float R = TM - (v - V0) / GF;
  float lodS = PX / v, lodX = PX / hw;
  float topE = LIP + 0.0026 * (1.0 - xr * xr) + 0.0007 * g1(xr * 9.0 + 2.0);
  float aTop = smoothstep(AA, -AA, q.y - topE);
  // ragged sides that fray as the water falls, and strands peeling off them
  float side = xr < 0.0 ? -1.0 : 1.0;
  float fray = sat(dd / 0.2);
  float ej = (0.025 + 0.14 * fray) * gnPy(vec2(side * 4.3 + xr * 0.8, R * 1.5), TP * 1.5)
           + (0.010 + 0.07 * fray) * gnPy(vec2(side * 9.1 + xr * 2.0, R * 4.0), TP * 4.0);
  float ax = abs(xr);
  float core = smoothstep(1.0 + ej + lodX + 0.02, 1.0 + ej - lodX - 0.02, ax);
  float strand = 0.0;
  if (ax > 0.75) {
    float su = ax * 9.0;
    float si = floor(su);
    vec4 hs = h42(vec2(si, side + 5.0));
    float sx = si + 0.5 + 0.35 * (hs.x - 0.5);
    float swd = 0.06 + 0.10 * hs.y;
    float on = smoothstep(0.0, 0.3, gnPy(vec2(si * 3.1 + side, R * 3.0), TP * 3.0) + 0.15 * fray);
    strand = smoothstep(swd + lodX * 9.0, swd - lodX * 9.0, abs(su - sx)) * on * smoothstep(1.45, 1.05, ax) * sat(dd / 0.03);
  }
  float halo = exp(-sq((ax - 1.0) / (0.10 + 0.35 * fray))) * fray * 0.25 * step(1.0, ax + 0.2);
  float alpha = max(max(core, strand * 0.8), halo) * aTop;
  if (alpha <= 0.0) return vec4(0.0);
  // broad ropes of water set by the lip, slowly shifting
  float pil = 0.55 * n1(xr * 3.2 + 4.0) + 0.45 * vnPy(vec2(xr * 4.5 + 2.0, R * 0.25), TP * 0.25);
  float pil2 = 0.55 * n1((xr + 0.06) * 3.2 + 4.0) + 0.45 * vnPy(vec2((xr + 0.06) * 4.5 + 2.0, R * 0.25), TP * 0.25);
  // streaks at three widths, plus lumpy texture running down each streak
  float S = 0.37 * streaks(xr, R, 1.0 / 7.0, 0.8, 0.0, lodX) + 0.29 * streaks(xr, R, 1.0 / 16.0, 1.6, 31.0, lodX)
          + 0.21 * streaks(xr, R, 1.0 / 38.0, 3.2, 77.0, lodX) + 0.13 * streaks(xr, R, 1.0 / 92.0, 6.4, 151.0, lodX);
  float lump = gnPy(vec2(xr * 22.0, R * 6.0), TP * 6.0) * sat(1.6 - 3.0 * max(22.0 * lodX, 6.0 * lodS));
  // fine aerated texture: droplet clusters that only resolve on big screens (4K and up)
  float fine = gnPy(vec2(xr * 70.0 + 5.0, R * 18.0), TP * 18.0) * sat(1.6 - 3.0 * max(70.0 * lodX, 18.0 * lodS));
  // falling lumps: rounded heads leading long tails
  float cm = 0.0;
  {
    float cxx = xr * 3.5;
    float cy = R * 0.6;
    float ci = floor(cxx + 0.5);
    for (int j = 0; j < 2; j++) {
      float cyi = floor(cy) - float(j);
      vec4 h = h42(vec2(ci + 11.0, mod(cyi, TP * 0.6)));
      if (h.w > 0.62) continue;
      float x0 = ci + 0.45 * (h.x - 0.5);
      float ty = cy - (cyi + h.y);
      float L = 0.35 + 0.8 * h.z;
      float prof = ty < 0.0 ? exp(-sq(ty * v / (0.6 * 0.007))) : exp(-ty / L);
      float wdt = (0.08 + 0.07 * h.w) * (1.0 - 0.5 * sat(ty / L));
      cm = max(cm, prof * exp(-sq((cxx - x0) / wdt)));
    }
  }
  float aer = smoothstep(0.003, 0.040, dd);
  float dens = 0.22 + 0.40 * pil + 1.15 * (S - 0.5) + 0.22 * lump + 0.16 * fine + 0.38 * cm + 0.25 * smoothstep(0.03, 0.2, dd);
  dens = mix(0.35 + 0.3 * (S - 0.5), dens, aer) + 0.30 * smoothstep(0.17, 0.24, dd);
  SH = sunAt(vec3(q.x * 200.0, (q.y - BASEY) * 200.0 - CH, 245.0));
  vec3 N = normalize(vec3(xr * 0.55 - (pil2 - pil) / 0.06 * 0.25, 0.10, -1.0));
  float sd = max(dot(N, LDIR), 0.0) * SH;
  vec3 Lw = SKYC * (0.95 + 0.25 * pil) * (1.0 - 0.22 * xr * xr) + SUNC * 1.9 * sd;
  float wb = smoothstep(0.10, 0.95, dens);
  vec3 col = mix(vec3(0.20, 0.27, 0.31), vec3(0.88, 0.91, 0.94), wb) * Lw;
  // glassy tongue: dark water mirroring the sky in flow lines
  float fl = 0.5 + 0.5 * gn(vec2(xr * 18.0, 1.3));
  vec3 glass = vec3(0.035, 0.055, 0.05) * Lw + SKYC * (0.16 + 0.32 * smoothstep(0.55, 0.9, fl)) * smoothstep(-0.004, 0.004, d);
  col = mix(glass, col, aer);
  col = mix(col, vec3(0.80, 0.84, 0.88) * Lw, halo * (1.0 - core));
  float al = alpha * mix(0.40, 1.0, sat(smoothstep(0.10, 0.60, dens) * 0.85 + 0.15 * (1.0 - aer)));
  return vec4(col * al, al);
}

// ---------------------------------------------------------------- braided river and valley floor
float rivC(float Z) { return 1.0 + 10.0 * cos((Z - 110.0) * 0.05236) + 2.0 * sin(Z * 0.09 + 1.0); }
float rivW(float Z) { return 8.0 + 0.08 * max(228.0 - Z, 0.0); }
vec3 vnDPy(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  float a = h12(vec2(i.x, y0)), b = h12(vec2(i.x + 1.0, y0)), c = h12(vec2(i.x, y1)), d = h12(vec2(i.x + 1.0, y1));
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y, du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}
// gradient noise with its gradient (quintic), periodic in y: organic wavelets with no value-noise
// cell grid showing through in the reflections
vec3 gnDPy(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  vec2 ga = h22(vec2(i.x, y0)) * 2.0 - 1.0, gb = h22(vec2(i.x + 1.0, y0)) * 2.0 - 1.0;
  vec2 gc = h22(vec2(i.x, y1)) * 2.0 - 1.0, gd = h22(vec2(i.x + 1.0, y1)) * 2.0 - 1.0;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - 1.0);
  float k4 = va - vb - vc + vd;
  float v = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k4;
  vec2 d = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k4 + vec2(vb - va, vc - va));
  return vec3(v, d);
}
// what the water mirrors along reflected ray R from floor point (X, Z): cliff, falls or overcast
vec3 reflCol(vec3 R, float X, float Z, float blur) {
  vec3 sky = reflSky(R);
  float t = (ZC - Z) / max(R.z, 0.05);
  float hgt = R.y * t;
  float xs = (X + R.x * t) * FOC / ZC;
  float ys = BASEY + hgt * FOC / ZC;
  float rim = rimY(xs);
  float hit = smoothstep(rim + blur, rim - blur, ys);
  vec3 cl = mix(vec3(0.050, 0.058, 0.048), vec3(0.055, 0.095, 0.03), smoothstep(0.46, 0.38, ys) * smoothstep(0.08, 0.2, abs(xs - FX)));
  float dfx = abs(xs - FX) / fallHW(max(LIP - ys, 0.0));
  cl = mix(cl, vec3(0.58, 0.61, 0.65), smoothstep(1.05 + blur * 20.0, 0.7, dfx) * smoothstep(LIP + blur, LIP - blur, ys));
  cl = mix(cl, vec3(0.62, 0.65, 0.69), smoothstep(0.012 + blur, 0.0, ys - BASEY) * exp(-sq((xs - FX) / 0.2)));
  return mix(sky, cl, hit);
}
vec4 riverLin(vec2 p) {
  float dep = clamp(66.7 * (YH - p.y) / (CH * FOC), 0.267, 1.0);
  vec2 q = p + u_par * (dep * PK);
  if (q.y > BASEY + 0.003) return vec4(0.0);
  float a = smoothstep(AA, -AA, q.y - BASEY - 0.001);
  float D = max(YH - q.y, 0.01);
  float Z = CH * FOC / D;
  float X = q.x * Z / FOC;
  float fX = PX * Z / FOC, fZ = PX * Z * Z / (CH * FOC);
  vec2 fp = vec2(fX, fZ) * 1.5;
  SH = sunAt(vec3(X, -CH, Z));
  vec3 rd = rayDir(q);
  // water: plunge pool, a sinuous main channel, and side channels that split off and rejoin
  // round lens-shaped gravel bars
  float rc = rivC(Z), rw = rivW(Z);
  float u = (X - rc) / rw;
  float cor = smoothstep(1.15, 0.80, abs(u));
  float mX = rc + 0.15 * rw * sin(Z * 0.05 + 0.5) + 1.2 * g1(Z * 0.08);
  float mw = (2.5 + 0.035 * max(228.0 - Z, 0.0)) * (0.6 + 0.8 * vn(vec2(Z * 0.035, 3.0)));
  float bank = 0.7 * g1(Z * 0.35 + X * 0.15) + 0.35 * g1(Z * 1.1 + 2.0);
  float e0 = (mw - abs(X - mX) + bank) / mw;
  float sp1 = max(sin(Z * 0.045 + 1.3), 0.0);
  float w1 = (0.8 + 2.4 * sp1) * (0.7 + 0.6 * vn(vec2(Z * 0.05, 7.0)));
  float e1 = (w1 - abs(X - mX - 0.95 * rw * sp1 * sp1) + 0.6 * bank) / w1;
  float sp2 = max(sin(Z * 0.06 + 4.0), 0.0);
  float w2 = (0.7 + 1.8 * sp2) * (0.7 + 0.6 * vn(vec2(Z * 0.06, 9.0)));
  float e2 = (w2 - abs(X - mX + 0.85 * rw * sp2 * sp2) + 0.6 * bank) / w2;
  vec2 pv = vec2((X - 14.0) / 30.0, (Z - 238.0) / 13.0);
  float pool = 1.0 - length(pv) + 0.22 * (vn(vec2(X * 0.12, Z * 0.15)) - 0.5) + 0.10 * (vn(vec2(X * 0.4, Z * 0.5) + 3.0) - 0.5);
  float deep = max(max(e0, max(e1, e2) - 3.0 * (1.0 - cor)), pool * 3.0);
  float aw = (fX + 0.15 * fZ) / max(mw, 1.0) * 1.5;
  float wm = smoothstep(-aw, aw, deep);
  // ground: meadow with hummocks (thufur), grey gravel in the corridor, wet margins by the water.
  // Noise is stretched along whichever ground axis the pixel footprint would alias.
  float p1 = vn(vec2(X * 0.025, Z * 0.018) + 2.0);
  float p2 = vn(vec2(X, Z) / max(vec2(9.0), fp) + 7.0);
  vec2 s1 = max(vec2(1.5), fp), s2 = max(vec2(0.5), fp), s3 = max(vec2(0.18), fp);
  float a1 = 1.5 / sqrt(s1.x * s1.y), a2 = 0.5 / sqrt(s2.x * s2.y), a3 = 0.18 / sqrt(s3.x * s3.y);
  vec3 hm = vnD(vec2(X, Z) / s1);
  float g3 = vn(vec2(X, Z) / s2 + 3.0), g4 = vn(vec2(X, Z) / s3 + 9.0);
  vec3 mea = mix(vec3(0.034, 0.072, 0.018), vec3(0.075, 0.112, 0.030), p1);
  mea = mix(mea, vec3(0.095, 0.088, 0.045), smoothstep(0.55, 0.80, p2) * 0.65);
  mea = mix(mea, vec3(0.035, 0.058, 0.025), smoothstep(0.62, 0.85, vn(vec2(X * 0.05, Z * 0.035) + 13.0)) * 0.6);
  mea *= (1.0 + 0.40 * (hm.x - 0.5) * a1) * (1.0 + 0.5 * (g3 - 0.5) * a2) * (1.0 + 0.6 * (g4 - 0.5) * a3);
  float gravA = smoothstep(0.25, 0.55, cor + 0.30 * (vn(vec2(X * 0.05, Z * 0.03)) - 0.5));
  // a gravel and boulder shore round the plunge pool
  gravA = max(gravA, smoothstep(-0.45, -0.05, pool + 0.15 * (vn(vec2(X * 0.3, Z * 0.2) + 5.0) - 0.5)));
  vec3 grav = mix(vec3(0.105, 0.105, 0.102), vec3(0.165, 0.150, 0.125), vn(vec2(X * 0.2, Z * 0.1)));
  float sorted = vn(vec2(X, Z) / max(vec2(1.2, 7.0), fp) + 23.0);
  grav *= 0.78 + 0.44 * sorted;
  grav = mix(grav, vec3(0.16, 0.15, 0.13), smoothstep(0.62, 0.8, vn(vec2(X * 0.15, Z * 0.06) + 41.0)) * 0.5);
  grav *= 1.0 - 0.3 * smoothstep(0.55, 0.75, vn(vec2(X * 0.09, Z * 0.05) + 51.0));
  float tuft = smoothstep(0.66, 0.82, vn(vec2(X, Z) / max(vec2(2.0), fp) + 61.0)) * smoothstep(-0.6, -1.4, deep);
  grav = mix(grav, vec3(0.06, 0.10, 0.025) * (0.7 + 0.6 * g4), tuft * 0.8);
  grav *= (1.0 + 0.55 * (g3 - 0.5) * a2) * (1.0 + 0.7 * (g4 - 0.5) * a3);
  // cobbles at two sizes, resolved only where the footprint allows
  for (int k = 0; k < 2; k++) {
    float cs = k == 0 ? 0.30 : 0.13;
    float pvis = smoothstep(0.55, 0.25, max(fX, fZ * 0.6) / cs);
    if (pvis <= 0.0) break;
    vec2 pc = vec2(X, Z) / cs + float(k) * 0.5;
    vec2 pi = floor(pc);
    vec4 ph = h42(pi + 5.0 + float(k) * 9.0);
    vec2 pl = (fract(pc) - 0.5 - (ph.xy - 0.5) * 0.5) / (0.22 + 0.2 * ph.z);
    float pd = dot(pl, pl);
    float peb = smoothstep(1.0, 0.7, pd) * step(0.25 * float(k), ph.w);
    vec3 pcol = vec3(0.13, 0.128, 0.122) * (0.55 + 0.9 * h12(pi + 8.0)) * mix(vec3(1.0), vec3(1.18, 1.0, 0.82), step(0.85, ph.z));
    grav = mix(grav, mix(grav * 0.7, pcol * (1.05 - 0.3 * pd + 0.35 * max(pl.y, 0.0)), peb), pvis);
  }
  float oldBar = smoothstep(0.55, 0.75, vn(vec2(X * 0.06, Z * 0.025) + 21.0)) * smoothstep(-0.3, -1.2, deep);
  vec3 alb = mix(mea, mix(grav, mea * 0.9, oldBar * 0.8), gravA);
  vec3 under = grav * vec3(0.62, 0.74, 0.74);
  alb *= 1.0 - 0.45 * smoothstep(-0.30, 0.0, deep) * gravA;
  float bump = 0.5 * a1 * (1.0 - gravA);
  vec3 N = normalize(vec3(-hm.y / s1.x * bump, 1.0, -hm.z / s1.y * bump));
  vec3 col = alb * (SKYC * (0.80 + 0.2 * N.y) + SUNC * 2.7 * max(dot(N, LDIR), 0.0) * SH);
  if (wm > 0.0) {
    // wavelet slopes, elongated across the flow and advected downstream (towards the viewer)
    float inPool = smoothstep(0.0, 0.12, pool);
    float shal = smoothstep(0.65, 0.0, deep);
    // three octaves of wavelets, each faded out before it gets near the pixel footprint
    float rf1 = smoothstep(0.6, 0.25, max(fX * 0.7, fZ * 1.2)), rf2 = smoothstep(0.6, 0.25, max(fX * 1.9, fZ * 3.1));
    float rf3 = smoothstep(0.6, 0.25, max(fX * 4.3, fZ * 7.0));
    vec3 n1v = gnDPy(vec2(X * 0.7 + 0.35 * sin(Z * 0.21), (Z + TM * 1.8) * 1.2), 2592.0);
    vec3 n2v = gnDPy(vec2(X * 1.9 + 5.0 + 0.5 * n1v.x, (Z + TM * 2.4) * 3.1), 8928.0);
    vec3 n3v = rf3 > 0.0 ? gnDPy(vec2(X * 4.3 + 11.0, (Z + TM * 3.0) * 7.0), 25200.0) : vec3(0.0);
    float rough = 0.075 + 0.09 * shal + 0.10 * inPool;
    vec2 gs = (n1v.yz * vec2(0.7, 1.2) * rf1 + 0.40 * n2v.yz * vec2(1.9, 3.1) * rf2 + 0.16 * n3v.yz * vec2(4.3, 7.0) * rf3) * rough;
    vec3 Nw = normalize(vec3(-gs.x, 1.0, -gs.y));
    vec3 R = reflect(rd, Nw);
    float cosi = max(dot(-rd, Nw), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
    // unresolved wavelets blur the mirror image instead of breaking it into hard dashes
    // (and so does the change of slope across one pixel, which would otherwise alias the mirrored
    // cliff edge into hard dashes): blur ~ d(ys)/d(R.y) * slope change per pixel
    float dsl = rough * 3.0 * (0.84 * max(fX * 0.7, fZ * 1.2) * rf1 + 1.24 * max(fX * 1.9, fZ * 3.1) * rf2 + 1.1 * max(fX * 4.3, fZ * 7.0) * rf3);
    float blur = 0.004 + 0.05 * (3.0 - rf1 - rf2 - rf3) * rough + 0.002 * fZ + 5.0 * dsl;
    vec3 refl = reflCol(R, X, Z, blur);
    vec3 Lb = SKYC + SUNC * 1.2 * SH;
    vec3 body = mix(vec3(0.045, 0.070, 0.072), under, shal * 0.85) * Lb;
    body = mix(body, vec3(0.018, 0.042, 0.040) * Lb, inPool * 0.75);
    vec3 wc = mix(body, refl, sat(fres));
    // riffles over the shallows; foam swirling out of the pool
    float rn = vnPy(vec2(X * 0.35, (Z + TM * 2.16) * 0.45), 1166.4);
    float rz = smoothstep(0.50, 0.75, vn(vec2(X * 0.08, Z * 0.05) + 31.0));
    float rif = smoothstep(0.60, 0.88, rn * 0.55 + 0.45 * (0.5 + 0.9 * n2v.x)) * rz * smoothstep(0.05, 0.3, deep) * smoothstep(0.9, 0.4, deep) * (1.0 - inPool);
    float pd = length(vec2((X - 14.0) / 28.0, (Z - 246.0) / 12.0));
    float swirl = vnPy(vec2(atan(Z - 246.0, X - 14.0) * 5.0, pd * 7.0 - TM * 0.3), 360.0);
    // foam boils up at the foot of the falls and spreads in streaky swirls; the rest of the pool is
    // dark water mirroring the cliff and the white column of the falls
    float swirl2 = vnPy(vec2(atan(Z - 246.0, X - 14.0) * 11.0 + 3.0, pd * 15.0 - TM * 0.45), 540.0);
    float foam = (smoothstep(0.55, 0.85, swirl * 0.6 + swirl2 * 0.4) * smoothstep(0.95, 0.25, pd) * 0.85
                + smoothstep(0.34, 0.04, pd) * (0.55 + 0.45 * swirl)) * inPool;
    vec3 fc = vec3(0.86, 0.89, 0.92) * (SKYC * 1.1 + SUNC * 2.0 * SH * 0.52);
    wc = mix(wc, fc, sat(rif * 0.7 + foam * 0.9));
    col = mix(col, wc, wm);
  }
  // boulders: rockfall near the flanks, a few in and along the channels (each fits inside its
  // 12 m cell across, and reaches at most one cell further back on screen)
  for (int j = 0; j < 2; j++) {
    vec2 cell = vec2(floor(X / 12.0), floor(Z / 12.0) - float(j));
    vec4 h = h42(cell + 17.0);
    float Xr = (cell.x + 0.2 + 0.6 * h.x) * 12.0, Zr = (cell.y + 0.15 + 0.7 * h.y) * 12.0;
    float ur = abs(Xr - rivC(Zr)) / rivW(Zr);
    float prob = 0.08 + 0.40 * smoothstep(1.4, 2.6, ur) + 0.15 * smoothstep(0.1, 0.4, ur) * smoothstep(1.2, 0.8, ur);
    if (h.w > prob || Zr > 244.0) continue;
    float Rr = 0.6 + 1.6 * h.z * h.z;
    float yb = YH - CH * FOC / Zr;
    float rs = Rr * FOC / Zr;
    vec2 l = vec2((q.x - Xr * FOC / Zr) / rs, (q.y - yb) / rs);
    float ry = 0.50 + 0.25 * h.x;
    vec2 e = vec2(l.x, (l.y - ry * 0.5) / ry);
    float an = atan(e.y, e.x);
    float rr = length(e) * (1.0 + 0.10 * g1(an * 2.0 + h.y * 30.0) + 0.04 * g1(an * 6.0 + h.z * 20.0));
    float pe = PX / rs * 1.2;
    float m = smoothstep(1.0 + pe, 1.0 - pe, rr) * step(-0.25, l.y);
    // a foam wake trails downstream (towards the viewer) from rocks standing in the water
    float wake = wm * smoothstep(0.2, -0.3, l.y) * exp(-sq(l.x / (0.7 - 0.5 * l.y))) * exp(l.y * 0.6)
               * smoothstep(0.35, 0.75, vnPy(vec2(l.x * 3.0 + h.x * 9.0, (Z + TM * 2.0) * 1.2), 2880.0));
    col = mix(col, vec3(0.86, 0.89, 0.92) * (SKYC * 1.1 + SUNC * 1.0 * SH), wake * 0.8 * (1.0 - m));
    col *= 1.0 - 0.3 * exp(-sq(length(vec2(l.x * 0.8, l.y * 2.0)) - 0.6) * 3.0) * smoothstep(0.2, -0.1, l.y) * (1.0 - m) * (1.0 - wm);
    if (m <= 0.0) continue;
    vec3 bb = vnD(e * 3.0 + h.xy * 20.0);
    vec3 b2 = vnD(e * 9.0 + h.zw * 20.0);
    vec3 Nr = normalize(vec3(e.x + bb.y * 0.15 + b2.y * 0.05, max(e.y, 0.0) * 0.9 + 0.35 + bb.z * 0.15 + b2.z * 0.05, -sqrt(max(1.0 - dot(e, e), 0.0)) - 0.25));
    vec3 ra = vec3(0.092, 0.090, 0.086) * (0.75 + 0.35 * bb.x + 0.2 * b2.x);
    ra = mix(ra, vec3(0.16, 0.17, 0.14), smoothstep(0.6, 0.8, b2.x) * 0.5);
    ra = mix(ra, vec3(0.05, 0.09, 0.022), smoothstep(0.1, 0.7, e.y + 0.3 * bb.x) * (0.25 + 0.5 * h.x) * (1.0 - wm));
    ra *= 1.0 - 0.55 * smoothstep(0.0, -0.8, e.y) * (0.5 + 0.5 * wm);
    vec3 rc2 = ra * (SKYC * (0.55 + 0.45 * Nr.y) + SUNC * 2.7 * max(dot(Nr, LDIR), 0.0) * SH);
    col = mix(col, rc2, m);
  }
  col = mix(col, hazeC(0.4), 0.04 + 0.05 * smoothstep(0.2, 0.36, q.y));
  return vec4(col, 1.0) * a;
}

// ---------------------------------------------------------------- spray and rainbow
vec3 bowCol(float t) {
  float r = smoothstep(0.40, 0.78, t) * smoothstep(1.15, 0.92, t) + 0.30 * smoothstep(0.22, 0.0, t) * smoothstep(-0.20, 0.0, t);
  float g = 0.95 * exp(-sq((t - 0.55) / 0.21));
  float b = exp(-sq((t - 0.20) / 0.17));
  return vec3(r, g, b);
}
// The spray plume. A smooth envelope (rising from the plunge, leaning downwind and spreading as
// it climbs) is modulated - never thresholded - by domain-warped turbulence that expands out of
// the plunge in log-polar coordinates, so the cloud has soft, wispy edges and thins into the air
// instead of breaking into cotton-ball puffs. A whiteout hides the foot of the curtain and a low
// veil rolls out over the pool. All noise is periodic over the loop.
vec4 mistLin(vec2 p) {
  vec2 q = p + u_par * (0.28 * PK);
  vec2 l = q - vec2(FX, BASEY);
  if (l.y > 0.30 || l.y < -0.05 || abs(l.x + 0.05) > 0.66) return vec4(0.0);
  float h = max(l.y, 0.0);
  // the falls surge: the plume swells and settles on a few incommensurate periods
  float puff = 0.84 + 0.09 * wav(1.0 / 37.5, 0.0) + 0.09 * wav(1.0 / 92.3, 1.0) + 0.05 * wav(1.0 / 13.3, 2.0);
  float cx = -0.30 * h - 0.012 + 0.006 * wav(1.0 / 60.0, 0.5) * h / (h + 0.03);
  float wdt = 0.070 + 0.52 * h;
  float Hs = 0.115 * puff;
  float env = exp(-sq((l.x - cx) / wdt)) * exp(-h / Hs) * smoothstep(-0.016, 0.008, l.y);
  float foot = exp(-sq((l.x + 0.004) / 0.072)) * exp(-sq((l.y - 0.006) / 0.040)) * smoothstep(-0.020, 0.004, l.y) * puff;
  float veil = exp(-sq((l.x + 0.03) / 0.26)) * exp(-sq((l.y + 0.004) / 0.022));
  float haze = exp(-sq((l.x + 0.06) / 0.34)) * exp(-h / 0.16) * smoothstep(-0.035, 0.0, l.y);
  float edgeF = smoothstep(0.66, 0.46, abs(l.x + 0.05));
  veil *= edgeF; haze *= edgeF;
  if (env + foot + veil + haze < 0.006) return vec4(0.0);
  // turbulence expanding out of the plunge (periodic over the loop: s.y gains 720 per loop)
  vec2 v = q - vec2(FX, BASEY - 0.03);
  float rho = length(v * vec2(1.0, 1.3));
  float ang = atan(v.x, v.y);
  vec2 s = vec2(ang * 2.4, log(rho) * 3.0 - TM * 0.6);
  vec2 wq = vec2(gnPy(s * vec2(0.5, 0.5) + vec2(3.1, 0.0), 360.0), gnPy(s * vec2(0.5, 0.5) + vec2(8.7, 2.3), 360.0));
  s += wq * vec2(1.1, 0.9);
  float oct = clamp(log2(0.5 * rho / (5.0 * PX)), 1.0, 5.0);
  float n = 0.0, am = 0.5, per = TP * 0.6;
  for (int i = 0; i < 5; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    n += w * am * gnPy(s, per);
    s = s * 2.0 + vec2(1.7, 0.0); per *= 2.0; am *= 0.5;
  }
  // n is roughly in [-0.5, 0.5]: lumps of denser cloud, wisps and clear gaps, all with soft edges
  float tex = sat(0.5 + 1.25 * n);
  float vn2 = vnP(vec2(q.x * 18.0 + TM * (36.0 / TP), q.y * 60.0), 36.0);
  float cloud = env * (0.22 + 1.55 * smoothstep(0.18, 0.92, tex + 0.22 * env));
  float dn = cloud * (0.75 + 0.9 * env) + foot * (0.9 + 0.5 * tex) + veil * (0.42 + 0.8 * (vn2 - 0.5) + 0.3 * (tex - 0.5)) + haze * (0.16 + 0.10 * tex);
  float al = 1.0 - exp(-dn * 2.0);
  if (al <= 0.001) return vec4(0.0);
  SH = sunAt(vec3(FX * 200.0, -10.0, 240.0));
  // lit from the bright overcast above: lumps catch light on top, the thick core is shaded below
  float envU = exp(-sq((l.x - cx + 0.0075) / (wdt + 0.014))) * exp(-(h + 0.025) / Hs);
  float shade = sat(0.55 + 0.8 * n) * (1.0 - 0.35 * envU) + 0.25 * smoothstep(0.0, 0.14, l.y);
  vec3 col = vec3(0.87, 0.90, 0.93) * (SKYC * (0.66 + 0.55 * shade) + SUNC * 1.6 * SH * (0.45 + 0.55 * shade));
  // rainbow: primary at ~42 deg round the antisolar point, faint secondary, brighter inside the bow
  vec3 rd = rayDir(q);
  float ga = degrees(acos(clamp(dot(rd, -LDIR), -1.0, 1.0)));
  vec3 bw = bowCol((ga - 40.6) / 1.9) + bowCol((53.6 - ga) / 3.0) * 0.35;
  bw += vec3(0.12) * smoothstep(41.0, 36.0, ga);
  bw -= vec3(0.06) * smoothstep(42.6, 44.0, ga) * smoothstep(50.4, 49.0, ga);
  col += bw * SUNC * 3.2 * SH * SUNV * (0.55 + 0.45 * (1.0 - sat(dn)));
  return vec4(col, 1.0) * al;
}

// ---------------------------------------------------------------- valley flanks
// Each flank is a talus apron rising to a basalt band and the plateau rim, running towards the
// viewer. Profile X(h): talus from (0, xf) to (ht, xr), then a near-vertical band. A pixel is solved
// for (X, h, Z) from (y - YH) / x = (h - CH) / X(h).
vec4 flankGeo(vec2 q, float s) {
  float xf = s < 0.0 ? -50.0 : 58.0;
  float xr = s < 0.0 ? -80.0 : 88.0;
  float ht = s < 0.0 ? 25.0 : 22.0;
  float k = (xr - xf) / ht;
  float kb = s * 0.06;
  float xb0 = xr - kb * ht;
  float r = (q.y - YH) / q.x;
  float h = (CH + r * xf) / (1.0 - r * k);
  float band = 0.0;
  if (h > ht) { h = (CH + r * xb0) / (1.0 - r * kb); band = 1.0; }
  float X = band > 0.5 ? xb0 + kb * h : xf + k * h;
  return vec4(X, h, X * FOC / q.x, band);
}
float flankRim(float Z, float s) { return (s < 0.0 ? 50.0 : 48.0) + 2.5 * g1(Z * 0.045 + s * 3.0) + 1.0 * g1(Z * 0.17) + 0.35 * g1(Z * 0.7); }
vec4 slopeLin(vec2 p) {
  float s = p.x < FX ? -1.0 : 1.0;
  if (p.x * s < 0.18) return vec4(0.0);
  vec4 g0 = flankGeo(p, s);
  float dep = clamp(66.7 / max(g0.z, 1.0), 0.267, 1.0);
  vec2 q = p + u_par * (dep * PK);
  vec4 g = flankGeo(q, s);
  float X = g.x, h = g.y, Z = g.z;
  if (Z <= 0.0 || Z > 262.0 || h < -2.0) return vec4(0.0);
  float rimH = flankRim(Z, s);
  if (h > rimH + 3.0) return vec4(0.0);
  float sc = FOC / Z;
  float a = smoothstep(-AA, AA, (rimH - h) * sc) * smoothstep(-AA, AA, h * sc * 0.7);
  // the talus fades patchily into the back wall's talus; the band meets it in a corner
  float endN = 250.0 - Z + 7.0 * (vn(vec2(h * 0.15, s * 3.0)) - 0.5);
  a *= g.w > 0.5 ? smoothstep(-AA, AA, (250.0 - Z) * abs(q.x) / Z) : smoothstep(0.0, 12.0, endN);
  a *= smoothstep(0.3, 2.2, h - 2.8 * vn(vec2(Z * 0.07, s * 5.0)) - 0.8 * vn(vec2(Z * 0.4, 1.0)));
  if (a <= 0.0) return vec4(0.0);
  SH = sunAt(vec3(X, h - CH, Z));
  float u = s < 0.0 ? Z : Z + 400.0;
  float fuu = PX * Z * Z / (abs(X) * FOC);
  float fuh = PX * Z / FOC;
  if (g.w < 0.5) fuu = fuh * 1.6;
  vec3 T = vec3(0.0, 0.0, -s);
  float ttop = (s < 0.0 ? 23.0 : 20.0) + 8.0 * sq(n1(Z * 0.055 + s * 2.0)) + 1.5 * g1(Z * 0.3);
  vec3 col;
  if (h > ttop) {
    vec3 N0 = normalize(vec3(-s, 0.08, -0.12));
    col = basalt(u, h, max(fuu, fuh), N0, T, 0.0, 0.0);
  } else {
    vec3 N0 = normalize(vec3(-s * 0.64, 0.77, -0.06));
    col = talus(u, h, vec2(PX * Z / abs(q.x), fuh / 1.5), N0, T, 0.0);
  }
  // turf over the rim
  float rh = rimH - h;
  float soil = smoothstep(2.4, 1.5, rh + 0.5 * g1(Z * 0.9));
  col = mix(col, vec3(0.08, 0.055, 0.04) * (SKYC * 0.55 + SUNC * 1.0 * SH), soil);
  float turf = smoothstep(1.0, 0.4, rh + 0.4 * g1(Z * 2.1));
  col = mix(col, mix(vec3(0.05, 0.11, 0.022), vec3(0.10, 0.15, 0.035), vn(vec2(Z * 0.8, h))) * (SKYC * 0.95 + SUNC * 2.2 * SH), turf);
  col = mix(col, hazeC(q.y), 0.05 * smoothstep(80.0, 250.0, Z));
  return vec4(col, 1.0) * a;
}

// ---------------------------------------------------------------- mossy bank (foreground)
float bankY(float x) {
  return 0.016 + 0.080 * smoothstep(0.15, 0.95, x - 0.05) + 0.055 * smoothstep(0.25, 0.95, -x)
       + 0.008 * g1(x * 6.0 + 2.0) + 0.003 * g1(x * 23.0);
}
float gustF(float x) {
  float d = TM * (40.0 / TP);
  return smoothstep(0.25, 0.9, vnP(vec2(x * 2.0 - d, 0.5), 40.0));
}
vec4 fgLin(vec2 p) {
  vec2 q = p + u_par * (1.0 * PK);
  float x = q.x, y = q.y;
  float by = bankY(x);
  if (y > by + 0.10) return vec4(0.0);
  float blur = 0.0009;
  float aa = AA + blur;
  SH = sunAt(vec3(x * 25.0 / FOC, -2.0, 25.0));
  vec4 acc = vec4(0.0);
  float m = smoothstep(aa, -aa, y - by);
  if (m > 0.0) {
    // the crest of the knoll: moss cushions, grey woolly fringe-moss, grass, a few half-buried stones
    vec2 mc = q * 95.0;
    vec3 b1 = vnD(mc), b2 = vnD(mc * 2.3 + 4.0), b3 = vnD(mc * 5.1 + 9.0);
    float f3 = smoothstep(1.2, 0.4, PX * 95.0 * 5.1);
    vec2 gr = b1.yz + 0.6 * b2.yz + 0.35 * b3.yz * f3;
    float sx = floor(x / 0.06);
    vec4 sh = h42(vec2(sx, 3.0));
    vec2 sl = (q - vec2((sx + 0.25 + 0.5 * sh.x) * 0.06, by - 0.010 - 0.02 * sh.y)) / vec2(0.016 + 0.012 * sh.z, 0.011 + 0.006 * sh.z);
    float st = step(sh.w, 0.35) * smoothstep(1.0 + aa * 80.0, 1.0 - aa * 80.0, length(sl) + 0.08 * g1(atan(sl.y, sl.x) * 3.0 + sx));
    vec3 Nb = normalize(vec3(0.0, 0.75, -0.66));
    Nb = normalize(mix(Nb, normalize(vec3(sl.x, sl.y + 0.4, -0.8)), st));
    vec3 N = normalize(Nb + vec3(-gr.x, -gr.y, 0.0) * 0.16);
    float cush = b1.x * 0.55 + b2.x * 0.3 + b3.x * 0.15;
    vec3 green = mix(vec3(0.032, 0.078, 0.016), vec3(0.085, 0.14, 0.030), smoothstep(0.35, 0.8, cush));
    vec3 woolly = mix(vec3(0.13, 0.15, 0.10), vec3(0.21, 0.22, 0.16), b2.x);
    float wz = smoothstep(0.45, 0.72, vn(q * 9.0 + 3.0));
    vec3 alb = mix(green, woolly, wz * 0.85);
    alb = mix(alb, vec3(0.10, 0.10, 0.095) * (0.75 + 0.5 * b3.x), st);
    float occ = (0.50 + 0.50 * smoothstep(0.2, 0.8, cush)) * mix(0.5, 1.0, smoothstep(0.0, by * 0.8, y));
    vec3 c = alb * (SKYC * (0.55 + 0.45 * N.y) * occ + SUNC * 2.7 * max(dot(N, LDIR), 0.0) * SH * (0.4 + 0.6 * occ));
    c += alb * SUNC * 0.5 * SH * smoothstep(0.6, 0.9, cush) * (1.0 - st);
    acc = vec4(c, 1.0) * m;
  }
  // grass blades and cotton-grass heads along the crest, swaying in the gusts
  float gs = gustF(x);
  for (int r = 0; r < 3; r++) {
    float fr = float(r);
    float bw = 0.0085 - 0.0022 * fr;
    float uu = x / bw + fr * 0.37;
    float ui = floor(uu);
    for (int j = 0; j <= 1; j++) {
      float c = ui + float(j) - (fract(uu) < 0.5 ? 1.0 : 0.0);
      vec4 h = h42(vec2(c, 13.0 + fr * 7.0));
      vec4 h2 = h42(vec2(c, 29.0 + fr * 7.0));
      float bx = (c + h.x) * bw;
      float base = bankY(bx) - 0.003 - 0.010 * h.y - 0.004 * fr;
      float hgt = (0.022 + 0.055 * h.z) * (0.45 + 0.75 * smoothstep(0.15, 0.7, abs(bx - 0.06))) * (1.0 - 0.25 * fr);
      float t = (y - base) / hgt;
      if (t < 0.0 || t > 1.1) continue;
      float lean = (h.w - 0.5) * 0.35 + gs * 0.45 + 0.06 * wav(0.25 + 0.2 * h.y, h.x * TAU);
      float sx = bx + lean * hgt * t * t;
      float hwid = 0.0008 * (1.0 - 0.85 * t) + 0.00018;
      float dx = (x - sx) / sqrt(1.0 + sq(2.0 * lean * t));
      float bm = smoothstep(hwid + aa, hwid - aa, abs(dx)) * step(t, 1.0) * min(1.0, (hwid + 0.4 * AA) / (hwid + blur));
      vec3 ga = mix(vec3(0.05, 0.10, 0.022), mix(vec3(0.20, 0.26, 0.07), vec3(0.40, 0.36, 0.17), h2.x), t);
      vec3 bc = ga * (SKYC * (0.55 + 0.45 * t) + SUNC * 2.4 * SH * (0.75 + 0.25 * clamp(dx / hwid, -1.0, 1.0)) * (0.4 + 0.6 * t));
      acc = over(acc, vec4(bc, 1.0) * bm);
      if (r == 0 && h2.y < 0.22) {
        vec2 tip = vec2(bx + lean * hgt, base + hgt);
        vec2 lt = (q - tip - vec2(0.0005, 0.003)) / vec2(0.0032, 0.0050);
        float fuzz = 1.0 + 0.22 * (vn(lt * 5.0 + c) - 0.5);
        float cm = smoothstep(1.0 + aa / 0.0032, 1.0 - aa / 0.0032, length(lt) * fuzz);
        vec3 cc = vec3(0.90, 0.91, 0.89) * (SKYC * 1.05 + SUNC * 2.3 * SH) * (0.78 + 0.25 * lt.y);
        acc = over(acc, vec4(cc, 1.0) * cm * 0.92);
      }
    }
  }
  return acc;
}

// ---------------------------------------------------------------- fulmars
float fulmarShape(vec2 g, float flap, float pxs) {
  float ax = abs(g.x);
  float e = 0.22;
  float he = 0.05 + 0.18 * flap;
  float dr = 0.10 - 0.22 * flap;
  float t = clamp((ax - e) / (1.0 - e), 0.0, 1.0);
  float yc = ax < e ? he * ax / e : he - dr * t * (0.5 + 0.5 * t);
  float sl = ax < e ? he / e : dr * (0.5 + t) / (1.0 - e);
  float th = mix(0.085, 0.018, smoothstep(0.1, 1.0, ax));
  float dw = (abs(g.y - yc + th * 0.2) - th) / sqrt(1.0 + sl * sl);
  dw = max(dw, ax - 1.0);
  float db = (length((g - vec2(0.0, -0.01)) / vec2(0.15, 0.07)) - 1.0) * 0.07;
  return smoothstep(pxs, -pxs, min(dw, db));
}
vec2 birdPath(float id, float t) {
  return vec2(0.50 * wavt(0.0031 + 0.0011 * id, id * 2.1, t) + 0.10 * wavt(0.013, id * 4.0, t) - 0.02,
              0.47 + 0.05 * wavt(0.0047 + 0.0009 * id, id * 1.3, t) + 0.02 * wavt(0.021, id * 3.0, t) + 0.035 * id);
}
vec4 birdLin(vec2 p) {
  vec4 acc = vec4(0.0);
  if (p.y < 0.36 || p.y > 0.86) return acc;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    bool nearB = i == 3;
    float dep = nearB ? 1.2 : 0.35 + 0.1 * fi;
    vec2 q = p + u_par * (dep * PK);
    vec2 c = nearB ? vec2(1.5 * wavt(1.0 / 240.0, 1.0, TM), 0.74 + 0.04 * wavt(1.0 / 120.0, 0.3, TM)) : birdPath(fi, TM);
    float span = nearB ? 0.040 : 0.010 + 0.0025 * fi;
    vec2 g = (q - c) / span;
    if (abs(g.x) > 1.3 || abs(g.y) > 0.9) continue;
    vec2 c2 = nearB ? vec2(1.5 * wavt(1.0 / 240.0, 1.0, TM + 0.5), 0.74 + 0.04 * wavt(1.0 / 120.0, 0.3, TM + 0.5)) : birdPath(fi, TM + 0.5);
    vec2 vel = c2 - c;
    float bank = clamp(vel.y * 40.0, -0.4, 0.4) + 0.12 * wav(0.05 + 0.01 * fi, fi);
    float cb = cos(bank), sb = sin(bank);
    g = mat2(cb, sb, -sb, cb) * g;
    // stiff glides broken by short bursts of quick, shallow flaps
    float burst = smoothstep(0.85, 0.97, wav(1.0 / 17.0 + 0.003 * fi, fi * 2.0));
    float flap = 0.08 * wav(0.2, fi) + burst * 0.6 * wav(4.5, fi * 3.0);
    float m = fulmarShape(g, flap, PX / span * 1.2);
    if (m <= 0.0) continue;
    SH = sunAt(vec3(c.x * 120.0, 10.0, 160.0));
    float under = smoothstep(0.02, -0.04, g.y - 0.02);
    vec3 alb = mix(vec3(0.40, 0.43, 0.48), vec3(0.86, 0.87, 0.88), max(under, smoothstep(0.25, 0.1, abs(g.x))));
    alb *= 1.0 - 0.45 * smoothstep(0.75, 0.95, abs(g.x));
    vec3 col = alb * (SKYC * 1.0 + SUNC * 2.0 * SH * 0.6);
    acc = over(acc, vec4(col, 1.0) * m);
  }
  return acc;
}

// ---------------------------------------------------------------- output
float VIG = 1.0;   // vignette for this pixel (every layer applies it, so the composite stays exact)
vec3 toDisp(vec3 c) {
  c *= 1.02 * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  // gentle filmic grade: a touch of contrast, greens held back from going neon
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(lum), c, 0.90);
}
vec4 finish(vec4 v) {
  if (v.a <= 0.0) return vec4(0.0);
  return vec4(toDisp(v.rgb / v.a) * v.a, v.a);
}
vec4 layerLin(int k, vec2 p) {
  if (k == 0) return skyLin(p);
  if (k == 1) return highLin(p);
  if (k == 2) return cliffLin(p);
  if (k == 3) return fallLin(p);
  if (k == 4) return riverLin(p);
  if (k == 5) return mistLin(p);
  if (k == 6) return slopeLin(p);
  if (k == 7) return fgLin(p);
  return birdLin(p);
}

void main() {
  TM = mod(u_time, TP);
  PX = 1.0 / u_res.y;
  AA = 0.75 * PX;
  float b1 = 0.5 + 0.5 * cos(TAU * TM / 300.0);
  float b2 = 0.5 + 0.5 * cos(TAU * TM / 400.0 + 2.0);
  SUNV = smoothstep(0.40, 0.92, 0.6 * b1 + 0.4 * b2);
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - vec2(0.5, 0.56)) * vec2(1.0, 0.9);
  VIG = 1.0 - 0.30 * smoothstep(0.10, 0.55, dot(vq, vq) * 1.5);
  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  if (u_layer >= 0.0) {
    vec4 c = finish(layerLin(int(u_layer + 0.5), p));
    fragColor = vec4(c.rgb + dith * c.a, c.a);
    return;
  }
  // front-to-back with early-out once opaque (identical to back-to-front "over")
  vec4 acc = finish(birdLin(p));
  acc += (1.0 - acc.a) * finish(fgLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(slopeLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(mistLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(riverLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(fallLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(cliffLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(highLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(skyLin(p));
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4) + dith, 1.0);
}
`,
}
