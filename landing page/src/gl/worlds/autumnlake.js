// Autumn Lake — a still mountain lake on a misty autumn morning.
// A low sun stands behind the spruces on the right-hand ridge; hillsides of
// maples, birches, larches and spruce glow red, orange and gold above a mirror
// lake. Layered blue ranges fade into haze, steam fog rises off the water and
// light shafts fan out through the mist from the gaps between the crest trees.
// A weathered dock with a cedar canoe in the foreground; leaves tumble down and
// drift on the water. Long cycles: a breeze sweeps a ripple front across the
// lake with a flurry of leaves (every 150 s); two geese fly low over the water
// (every 300 s).
//
// Every layer is lit in linear light, tone-mapped (ACES fit) and gamma-encoded
// on its own, so the full scene is the back-to-front "over" composite of the
// isolated layers. The lake mirrors each layer about its own shoreline; the dock
// and canoe are ray-traced in 3D, so their reflections are true reflections.
// Time: TM = u_time mod 1200 s; every oscillator and drift is quantised to it.

export default {
  id: 'autumnlake',
  name: 'Autumn Lake',
  tag: 'Misty morning',
  accent: '#e2622a',
  accent2: '#e8b43c',
  ink: '#8a3412',
  glow: '#ffdcb0',
  light: true,
  clockColor: '#1d2734',
  sky: 'linear-gradient(180deg,#5f86ba 0%,#9fb6d4 26%,#d9d3c6 40%,#c8a57a 46%,#7a3a22 52%,#9a5a32 56%,#6b6660 62%,#4a525d 76%,#2a2e36 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Morning sky', depth: 0 },
    { name: 'Blue ranges', depth: 0.06 },
    { name: 'Far ridge', depth: 0.15 },
    { name: 'Autumn hillsides', depth: 0.3 },
    { name: 'Mirror lake', depth: 0.5 },
    { name: 'Mist and sun rays', depth: 0.62 },
    { name: 'Dock and canoe', depth: 0.9 },
    { name: 'Falling leaves', depth: 1.15 },
  ],
  clockAfter: 3,
  stillTime: 36,
  frag: /* glsl */ `
#define TAU 6.2831853
#define LOOP 1200.0
#define PK 0.030
#define YH 0.452
#define FOC 1.5
#define CAMH 1.6

float TM;    // u_time folded into the loop
float PX;    // one pixel in scene units (height-relative)
float AA;    // half-width of an anti-aliased edge
float VIG;   // vignette factor
float GUST;  // breeze event envelope (0 between gusts)
float GPH;   // breeze front progress [0,1]
vec3 CAM;    // 3D camera for the lake and the foreground (parallax moves it)
vec3 SUNW;   // world-space sun direction
vec3 CPOS;   // canoe pose: position, yaw (cos, sin), roll
vec2 CYAW;
float CROLL;
float SUNVIS; // how much of the sun disc clears the crest trees (per frame)

const vec2 SUN = vec2(0.535, 0.5575);
const vec3 SUNC = vec3(1.0, 0.78, 0.55);
const vec3 AMB = vec3(0.30, 0.39, 0.56);

float sat(float x) { return clamp(x, 0.0, 1.0); }
float sq(float x) { return x * x; }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

// seamless oscillator: frequency snapped to the loop
float wav(float f, float ph) { return sin(TAU * fract(floor(f * LOOP + 0.5) / LOOP * TM) + ph); }

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
// value noise periodic in both axes (drifts wrap with the loop)
float vnP(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, per), b = mod(i + 1.0, per);
  return mix(mix(h12(a), h12(vec2(b.x, a.y)), u.x), mix(h12(vec2(a.x, b.y)), h12(b), u.x), u.y);
}
float ridgeP(float x, float oct) {
  float h = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 9; i++) {
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
  for (int i = 0; i < 4; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    float n = 1.0 - abs(vn(p) * 2.0 - 1.0);
    s += w * a * n * n;
    p = p * 2.1 + vec2(1.7, 9.2);
    a *= 0.55;
  }
  return s;
}
vec4 over(vec4 b, vec4 f) { return f + b * (1.0 - f.a); }

// breeze front: a band of wind sweeping left to right across the scene
float gustAt(float x) {
  if (GUST <= 0.0) return 0.0;
  float d = x - mix(-1.5, 1.7, GPH);
  return GUST * (d > 0.0 ? exp(-d * d / 0.02) : exp(-d * d / 0.25));
}

// ---------------------------------------------------------------- sky
vec3 skyBase(vec2 p) {
  float e = max(p.y - YH, 0.0);
  vec3 c = mix(vec3(0.72, 0.68, 0.62), vec3(0.38, 0.49, 0.68), smoothstep(0.0, 0.20, e));
  c = mix(c, vec3(0.12, 0.23, 0.50), smoothstep(0.14, 0.60, e));
  float r = length((p - SUN) * vec2(1.0, 1.2));
  c += SUNC * (0.26 * exp(-r * 2.4) + 0.62 * exp(-r * 8.0) + 1.7 * exp(-r * 30.0));
  c += vec3(0.30, 0.15, 0.04) * exp(-e * 10.0) * exp(-abs(p.x - SUN.x) * 1.3);
  return c;
}
// air and mist colour low in the scene: cool blue-grey, warm and bright towards the sun
vec3 hazeCol(vec2 p) {
  float r = length((p - SUN) * vec2(1.0, 1.7));
  return vec3(0.48, 0.53, 0.61) + SUNC * (0.30 * exp(-r * 2.6) + 0.80 * exp(-r * 9.0));
}

// thin cirrus veils on a perspective cloud plane, drifting slowly; sparse over the clock
vec4 cirrus(vec2 p, vec3 sky) {
  if (p.y < 0.60) return vec4(0.0);
  float z = 0.30 / (p.y - YH);
  vec2 s = vec2(p.x * z * 1.3, z * 3.6);
  s.x -= TM * (16.0 / LOOP);
  vec2 w = vec2(vnP(s * vec2(0.5, 0.7), vec2(8.0, 64.0)), vnP(s * vec2(0.5, 0.7) + 5.3, vec2(8.0, 64.0))) - 0.5;
  s += w * vec2(1.6, 0.8);
  float fy = PX * z * z / 0.30 * 7.0;
  float n = 0.55 * vnP(s * vec2(1.0, 2.0), vec2(16.0, 128.0)) + 0.30 * vnP(s * vec2(2.0, 5.0) + 3.1, vec2(32.0, 640.0));
  n += 0.15 * vnP(s * vec2(4.0, 6.0) + 7.7, vec2(64.0, 768.0)) * smoothstep(1.0, 0.3, fy * 6.0);
  float clk = exp(-sq(p.x / 0.42)) * smoothstep(0.62, 0.74, p.y) * smoothstep(0.95, 0.85, p.y);
  float d = smoothstep(0.52, 0.90, n) * smoothstep(0.60, 0.72, p.y) * (1.0 - 0.7 * clk) * 0.45;
  if (d <= 0.0) return vec4(0.0);
  float r = length(p - SUN);
  vec3 c = mix(sky * 1.10 + vec3(0.05), SUNC * 1.7, exp(-r * 4.0));
  return vec4(c, 1.0) * d;
}

vec4 skyQ(vec2 q, float lod) {
  vec3 c = skyBase(q);
  float r = length(q - SUN);
  c += SUNC * (30.0 * smoothstep(0.0105 + AA, 0.0105 - AA, r) + 6.0 * exp(-r * 150.0));
  if (lod > 0.5) {
    vec4 cl = cirrus(q, c);
    c = c * (1.0 - cl.a) + cl.rgb;
  }
  return vec4(c, 1.0);
}

// ---------------------------------------------------------------- blue ranges
float rngA(float x, float oct) { return 0.457 + 0.090 * exp(-sq((x + 0.10) / 0.15)) + 0.045 * exp(-sq((x - 0.22) / 0.20)) + 0.05 * exp(-sq((x + 0.55) / 0.25)) + 0.045 * (ridgeP(x * 2.7 + 3.1, oct) - 0.5); }
float rngB(float x, float oct) { return 0.455 + 0.036 * exp(-sq((x - 0.10) / 0.18)) + 0.03 * exp(-sq((x + 0.38) / 0.2)) + 0.028 * (ridgeP(x * 4.3 + 7.3, oct) - 0.5); }
float rngC(float x, float oct) { return 0.452 + 0.018 * exp(-sq((x + 0.02) / 0.22)) + 0.014 * (ridgeP(x * 7.5 + 1.1, oct) - 0.5); }

vec4 mtnQ(vec2 q, float lod) {
  if (q.y > 0.60 || q.y < 0.445) return vec4(0.0);
  float oct = clamp(log2(0.30 / (4.0 * PX)), 3.0, 8.0);
  if (lod < 0.5) oct = min(oct, 5.0);
  float x = q.x;
  vec3 hz = hazeCol(q);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  // nearest range first (front-to-back)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float H = i == 0 ? rngC(x, oct) : (i == 1 ? rngB(x, oct) : rngA(x, oct));
    float a = smoothstep(AA, -AA, q.y - H);
    if (a <= 0.0) continue;
    float e = 0.004;
    float s = ((i == 0 ? rngC(x + e, 3.0) : (i == 1 ? rngB(x + e, 3.0) : rngA(x + e, 3.0)))
             - (i == 0 ? rngC(x - e, 3.0) : (i == 1 ? rngB(x - e, 3.0) : rngA(x - e, 3.0)))) / (2.0 * e);
    float dep = H - q.y;
    // faint relief: rock and forest texture lit from the sun side
    float tex = rid2(q * vec2(36.0, 70.0) * (1.0 + fi) + fi * 7.0, lod > 0.5 ? 3.0 : 2.0);
    float lit = sat(0.45 - 0.9 * s + (tex - 0.45) * 0.9);
    vec3 tone = i == 0 ? vec3(0.07, 0.11, 0.16) : (i == 1 ? vec3(0.16, 0.23, 0.36) : vec3(0.30, 0.38, 0.55));
    vec3 c = tone * (0.7 + 0.7 * lit);
    if (i == 2) {
      float snow = smoothstep(0.512, 0.53, q.y + 0.012 * (tex - 0.5)) * smoothstep(0.2, 0.6, tex);
      c = mix(c, vec3(0.60, 0.66, 0.80) * (0.8 + 0.45 * lit), snow * 0.85);
    }
    // valley mist pooled at the foot of each range, combed by drift
    float mn = vnP(vec2(x * 9.0 + TM * (24.0 / LOOP) + fi * 13.0, q.y * 140.0), vec2(24.0, 256.0));
    float mist = smoothstep(0.0, 0.045 - 0.01 * fi, dep + 0.012 * (mn - 0.5));
    float aer = i == 0 ? 0.24 : (i == 1 ? 0.42 : 0.56);
    c = mix(c, hz, sat(aer + (1.0 - aer) * mist * 0.85));
    acc += T * a * c;
    T *= 1.0 - a;
    if (T < 0.005) break;
  }
  return vec4(acc, 1.0 - T);
}

// ---------------------------------------------------------------- forest canopy
// shoreline: world distance of the shore along azimuth x (left hill, far end, right hill)
float shoreD(float x) {
  float d = min(mix(1250.0, 5000.0, smoothstep(-0.17, -0.03, x)), mix(5000.0, 1450.0, smoothstep(0.17, 0.29, x)));
  return d * (1.0 + 0.12 * g1(x * 11.0 + 3.0));
}
float shoreY(float x) { return YH - CAMH * FOC / shoreD(x); }

float topL(float x) {
  float t = -0.05 - x;
  float y = shoreY(x) + 0.018 * smoothstep(0.0, 0.05, t) + 0.25 * pow(smoothstep(0.0, 0.80, t), 1.25);
  y += (0.012 * g1(x * 6.0 + 1.3) + 0.005 * g1(x * 15.0 + 4.0)) * smoothstep(0.0, 0.08, t);
  return t < 0.0 ? shoreY(x) + t * 4.0 : y;
}
float topR(float x) {
  float t = x - 0.21;
  float y = shoreY(x) + 0.014 * smoothstep(0.0, 0.05, t) + 0.20 * pow(smoothstep(0.0, 0.66, t), 1.15);
  y += (0.009 * g1(x * 7.0 + 8.3) + 0.004 * g1(x * 16.0 + 2.0)) * smoothstep(0.0, 0.08, t);
  return t < 0.0 ? shoreY(x) + t * 4.0 : y;
}
float ridgeTop(float x) { return shoreY(x) + 0.003 + 0.020 * exp(-sq((x - 0.05) / 0.30)) + 0.006 * g1(x * 7.0 + 1.0) + 0.003 * g1(x * 19.0 + 5.0); }

// leaf albedo by species: 0 spruce/fir, 1 red maple, 2 sugar maple, 3 birch/aspen, 4 larch, 5 oak rust / late green
vec3 leafAlb(int s, float v) {
  if (s == 0) return mix(vec3(0.009, 0.022, 0.017), vec3(0.020, 0.036, 0.022), v);
  if (s == 1) return mix(vec3(0.30, 0.018, 0.012), vec3(0.46, 0.045, 0.016), v);
  if (s == 2) return mix(vec3(0.52, 0.10, 0.012), vec3(0.62, 0.21, 0.020), v);
  if (s == 3) return mix(vec3(0.50, 0.29, 0.020), vec3(0.60, 0.42, 0.050), v);
  if (s == 4) return mix(vec3(0.40, 0.20, 0.035), vec3(0.50, 0.30, 0.060), v);
  return mix(vec3(0.20, 0.065, 0.020), vec3(0.09, 0.12, 0.028), v);
}

// light on one crown. l: crown-local coords; sunF: terrain exposure; back: how backlit it is
vec3 shadeCrown(vec2 l, bool con, vec3 alb, vec2 cp, float rpx, float sd, float lod, float sunF) {
  vec2 dv = SUN - cp;
  float dist = length(dv);
  float back = exp(-dist * 3.2);
  vec3 L = normalize(vec3(dv / max(dist, 1e-3), mix(0.35, -0.9, back)));
  vec3 N = con ? normalize(vec3(l.x * 0.9, 0.25 + 0.3 * (l.y - 0.5), sqrt(max(1.0 - l.x * l.x, 0.0)) + 0.1))
               : vec3(l.x, l.y, sqrt(max(1.0 - dot(l, l), 0.0)));
  float rel = 0.0, cl = 0.5;
  if (lod > 0.5 && rpx > 3.0) {
    vec2 cq = (con ? vec2(l.x * 1.4, l.y * 8.0) : l * 2.7) + sd * 37.0;
    cl = vn(cq);
    rel = cl - vn(cq + L.xy * 0.5);
    if (rpx > 12.0) cl = mix(cl, vn(cq * 3.3 + 9.0), 0.4);
  }
  float dif = sat(dot(N, L) * 0.62 + 0.38 - 0.30 * back + rel * 1.7);
  dif = dif * dif * sunF;
  float ao = (0.35 + 0.65 * smoothstep(-1.0, 0.6, con ? l.y * 2.0 - 1.0 : l.y)) * (0.55 + 0.45 * smoothstep(0.2, 0.75, cl));
  vec3 c = alb * (SUNC * 3.1 * dif * ao + AMB * 0.40 * (0.35 + 0.65 * ao));
  // thin leaves glow when the sun is behind them
  float tr = back * pow(1.0 - 0.9 * N.z, 3.0) * (0.45 + 0.55 * cl) * (0.4 + 0.6 * sunF);
  c += alb * SUNC * 2.6 * tr * (con ? 0.3 : 1.0);
  return c;
}

// rows of crowns climbing a hillside in perspective: hb = shoreline y, s0 = crown size at
// the shore, kk = how fast trees shrink with height up the slope. Front-to-back.
vec4 canopy(vec2 q, float hb, float top, float s0, float kk, float seed, float lod, float sunF) {
  float v = q.y - hb;
  float cs = 0.45 * s0;
  float r = (v + 0.5 * kk * v * v) / cs;
  float ir = floor(r);
  // conifer stands and maple / birch drifts (sampled once per pixel: they vary slowly)
  float stA = vn(vec2(q.x * 8.0, v * 20.0) + seed);
  float stB = vn(vec2(q.x * 14.0, v * 30.0) + seed + 31.0);
  float pc = 0.14 + 0.66 * smoothstep(0.45, 0.78, stA);
  float pm = mix(0.30, 0.85, stB);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float aa = AA * (lod > 0.5 ? 1.0 : 1.5);
  for (int i = 0; i < 5; i++) {
    float j = ir - 4.0 + float(i);
    float vj = (sqrt(max(1.0 + 2.0 * kk * cs * j, 0.02)) - 1.0) / kk;
    float sj = s0 / (1.0 + kk * vj);
    float yj = hb + vj;
    if (yj > top + 0.1 * sj) break;
    float cw = 0.62 * sj;
    float off = h11(j * 0.731 + seed) * 50.0;
    float u = q.x / cw + off;
    float c0 = floor(u);
    float c1 = c0 + (fract(u) < 0.5 ? -1.0 : 1.0);
    float rsp = cs * sj / s0;
    for (int k = 0; k < 2; k++) {
      float c = k == 0 ? c0 : c1;
      vec4 h = h42(vec2(c, j) + seed * 7.0);
      float bx = (c + 0.5 + 0.6 * (h.x - 0.5) - off) * cw;
      float by = yj + (h.y - 0.5) * 0.7 * rsp;
      if (by > top - 0.2 * sj) continue;
      float hv = fract(h.w * 7.31);
      int sp = 0;
      if (hv < pc) sp = hv < pc * 0.86 ? 0 : 4;
      else {
        float uu = (hv - pc) / (1.0 - pc);
        sp = uu < pm * 0.45 ? 1 : (uu < pm ? 2 : (uu < 0.92 ? 3 : 5));
      }
      bool con = sp == 0 || sp == 4;
      float cov;
      vec2 l;
      float R;
      if (con) {
        float H = sj * (1.05 + 0.50 * h.z);
        float hw = sj * (sp == 4 ? 0.34 : 0.27) * (0.9 + 0.2 * h.x);
        float t = (q.y - by) / H;
        float dx = q.x - bx;
        if (t < -0.03 || t > 1.0 || abs(dx) > hw + aa) continue;
        float tier = fract(t * (6.0 + 3.0 * h.w) + h.x * 3.0);
        float w = hw * (1.0 - t) * (0.68 + 0.32 * tier);
        cov = smoothstep(w + aa, w - aa, abs(dx)) * smoothstep(-0.03, 0.0, t);
        l = vec2(dx / (hw * max(1.0 - t, 0.06)), t);
        R = hw;
      } else {
        R = sj * (0.42 + 0.16 * h.z);
        vec2 l0 = (q - vec2(bx, by + R)) / R;
        if (sp == 3) l0.x *= 1.3;
        float rl = length(vec2(l0.x, l0.y * 1.04));
        if (rl > 1.25) continue;
        float lump = 0.0;
        if (rl > 0.62) lump = 0.18 * (vn(l0 * 2.6 + h.zw * 50.0) - 0.5) + (lod > 0.5 ? 0.08 * (vn(l0 * 6.5 + h.xy * 30.0) - 0.5) : 0.0);
        cov = smoothstep(1.0 + aa / R, 1.0 - aa / R, rl + lump);
        l = l0;
      }
      if (cov <= 0.0) continue;
      vec3 col = shadeCrown(l, con, leafAlb(sp, h.z), vec2(bx, by), R / PX, h.y, lod, sunF);
      acc += T * cov * col;
      T *= 1.0 - cov;
    }
    if (T < 0.01) break;
  }
  // understory between the crowns
  float fill = smoothstep(AA, -AA, q.y - top + 0.1 * s0);
  acc += T * fill * vec3(0.016, 0.012, 0.010) * (AMB + SUNC * 0.4 * sunF);
  T *= 1.0 - fill;
  return vec4(acc, 1.0 - T);
}

// sparse tall spruces standing above the canopy along a crest: (coverage, local x, height, hash)
vec4 skyTrees(vec2 q, float w, float seed, bool right, bool exact) {
  float c0 = floor(q.x / w);
  vec4 res = vec4(0.0);
  float baseQ = right ? topR(q.x) : topL(q.x);
  if (q.y < baseQ - 0.01) return res;
  for (int k = -1; k <= 1; k++) {
    float c = c0 + float(k);
    vec4 h = h42(vec2(c, seed));
    float bx = (c + 0.2 + 0.6 * h.x) * w;
    if (h.z > (right ? 0.30 + 0.55 * exp(-sq((bx - SUN.x) / 0.07)) : 0.16)) continue;
    float base = (exact ? (right ? topR(bx) : topL(bx)) : baseQ) - 0.003;
    float H = w * (0.9 + 1.5 * h.y * h.y);
    float hw = H * (0.15 + 0.05 * h.w);
    float t = (q.y - base) / H;
    if (t < 0.0 || t > 1.0) continue;
    float tier = fract(t * (7.0 + 4.0 * h.w) + h.x * 5.0);
    float wd = hw * pow(1.0 - t, 0.9) * (0.60 + 0.40 * tier) + 0.0008 * (1.0 - t);
    float dx = q.x - bx;
    float cv = smoothstep(wd + AA, wd - AA, abs(dx));
    if (cv > res.x) res = vec4(cv, dx / max(wd, 1e-4), t, h.w);
  }
  return res;
}

// terrain relief of a hillside: ribs and gullies running down the fall line.
// returns (sun exposure, hollow) where hollows collect the morning mist
vec2 terrain(vec2 q, float v, float seed, vec2 ld) {
  vec2 t = vec2(q.x * 11.0 + v * 6.0, v * 4.5) + seed;
  float a = vn(t) * 0.62 + vn(t * 2.4 + 7.0) * 0.38;
  vec2 o = ld * 0.16;
  float b = vn(t + o) * 0.62 + vn((t + o) * 2.4 + 7.0) * 0.38;
  return vec2(sat(0.78 + (a - b) * 5.5), smoothstep(0.50, 0.25, a));
}

// mist that pools at the foot of the slopes and in the hollows, drifting slowly
float slopeMist(vec2 q, float v, float hollow, float seed) {
  float dr = TM * (32.0 / LOOP);
  float n = vnP(vec2(q.x * 5.0 - dr + seed, v * 34.0 - q.x * 3.0), vec2(32.0, 512.0));
  float n2 = vnP(vec2(q.x * 15.0 - dr * 2.0, v * 60.0 + 3.0), vec2(64.0, 1024.0));
  float m = 0.62 * n + 0.38 * n2;
  float foot = smoothstep(0.05, 0.0, v - 0.03 * (m - 0.5)) * (0.5 + 0.5 * m);
  float hol = hollow * smoothstep(0.50, 0.80, m) * 0.38;
  return sat(foot * 0.85 + hol);
}

vec4 hillsQ(vec2 q, float lod) {
  float hb = shoreY(q.x);
  bool right = q.x > 0.1;
  if (!right && q.x > -0.03) return vec4(0.0);
  if (right && q.x < 0.17) return vec4(0.0);
  float top = right ? topR(q.x) : topL(q.x);
  if (q.y > top + 0.065 || q.y < hb - 0.02) return vec4(0.0);
  float v = q.y - hb;
  vec2 tr = terrain(q, v, right ? 5.0 : 0.0, right ? vec2(0.0, 1.0) : vec2(1.0, 0.25));
  float sunF = right ? mix(0.35, 0.8, tr.x) : tr.x;
  vec4 c = vec4(0.0);
  if (q.y < top + 0.022) c = canopy(q, hb, top, right ? 0.0105 : 0.0125, 3.0, right ? 11.0 : 3.0, lod, sunF);
  // tall spruces on the skyline, behind the canopy
  if (c.a < 0.999 && q.y > top - 0.01) {
    vec4 st = skyTrees(q, right ? 0.0105 : 0.013, right ? 41.0 : 17.0, right, true);
    if (st.x > 0.0) {
      vec2 l = vec2(st.y, st.z);
      vec3 col = shadeCrown(l, true, leafAlb(st.w < 0.85 ? 0 : 4, st.w), vec2(q.x, top), 0.0, st.w, 0.0, 1.0);
      c.rgb += (1.0 - c.a) * st.x * col;
      c.a += (1.0 - c.a) * st.x;
    }
  }
  if (c.a <= 0.0) return c;
  // aerial perspective, glare near the sun, and morning mist in the hollows
  float aer = right ? 0.07 + 0.30 * v : 0.10 + 0.55 * v;
  float m = slopeMist(q, v, tr.y, right ? 5.0 : 0.0);
  c.rgb = mix(c.rgb, hazeCol(q) * c.a, sat(aer + m * 0.7));
  return c;
}

// far wooded ridge closing the lake, softened by distance and mist
vec4 ridgeQ(vec2 q, float lod) {
  if (q.x < -0.30 || q.x > 0.40) return vec4(0.0);
  float top = ridgeTop(q.x);
  float hb = shoreY(q.x);
  if (q.y > top + 0.008 || q.y < hb - 0.006) return vec4(0.0);
  vec4 c = canopy(q, hb, top, 0.0045, 2.0, 23.0, 0.0, 0.85);
  if (c.a <= 0.0) return c;
  float v = q.y - hb;
  float m = slopeMist(q * vec2(1.0, 3.0), v * 2.5, 0.0, 9.0);
  c.rgb = mix(c.rgb, hazeCol(q) * c.a, sat(0.40 + 0.5 * m));
  return c;
}

// ---------------------------------------------------------------- lake
// ripple trains (direction, wavenumber, slope amplitude); the last four are wind ripples
const vec4 RW[8] = vec4[8](
  vec4(0.24, -0.97, 0.9, 0.0010),
  vec4(-0.50, -0.87, 1.6, 0.0009),
  vec4(0.66, -0.75, 2.9, 0.0008),
  vec4(-0.15, -0.99, 5.0, 0.0009),
  vec4(0.88, -0.47, 9.5, 0.011),
  vec4(0.50, -0.87, 15.0, 0.011),
  vec4(0.97, 0.24, 24.0, 0.010),
  vec4(0.70, -0.71, 38.0, 0.009));
float WT[8];
void initWaves() {
  for (int i = 0; i < 8; i++) {
    float k = RW[i].z;
    float om = sqrt(9.81 * k + 7.3e-5 * k * k * k);
    WT[i] = TAU * fract(floor(om / TAU * LOOP + 0.5) * TM / LOOP) + float(i) * 1.9;
  }
}
// cat's paws: drifting patches where a breath of wind roughens the surface
float pawMask(vec2 w) {
  vec2 s = vec2(w.x * 0.030, w.y * 0.020) - vec2(TM * (8.0 / LOOP), 0.0);
  return smoothstep(0.62, 0.90, vnP(s, vec2(8.0, 4096.0)));
}
// water slope (dh/dx, dh/dz) and unresolved slope variance at world point w
// The mirror is kept intact: each train's slope is capped by how strongly it would fold the
// reflection on screen (fold ~ slope * k * Z^2 / camera height); the excess becomes roughness.
vec3 waterSlope(vec2 w, vec2 fp, float gx) {
  float rough = 0.05 + 0.95 * max(pawMask(w) * 0.55, gustAt(gx));
  vec2 g = vec2(0.0);
  float var = 0.0;
  float z2 = w.y * w.y / CAMH;
  for (int i = 0; i < 8; i++) {
    vec4 wv = RW[i];
    float lam = TAU / wv.z;
    float fw = smoothstep(3.0, 10.0, lam / max(length(wv.xy * fp), 1e-5));
    float amp = wv.w * (i >= 4 ? rough : 1.0);
    float fold = 2.0 * amp * wv.z * abs(wv.y) * z2;
    float cap = min(1.0, (i >= 4 ? 1.1 : 0.4) / max(fold, 1e-6));
    var += 0.5 * amp * amp * (1.0 - fw * cap);
    amp *= cap;
    if (fw <= 0.0) continue;
    float ph = wv.z * dot(wv.xy, w) - WT[i];
    g += fw * amp * cos(ph) * wv.xy;
  }
  // rings where a fish rises or a leaf touches down: one source per 9 m cell, now and then
  if (w.y < 45.0) {
    vec2 cc = floor(w / 9.0);
    vec4 hr = h42(cc + 13.0);
    float per = hr.z < 0.5 ? 40.0 : 60.0;
    float age = mod(TM + hr.w * per, per);
    if (hr.x < 0.45 && age < 9.0) {
      vec2 d = w - (cc + 0.25 + 0.5 * hr.yz) * 9.0;
      float rr = length(d);
      float x = rr - 0.26 * age - 0.05;
      float lam = 0.30;
      float fw = smoothstep(1.5, 4.0, lam / max(fp.y, 1e-5));
      float s = min(0.03, 1.2 / (4.0 * TAU / lam * z2)) * exp(-age * 0.42) * smoothstep(0.0, 0.25, age) * sin(x * TAU / lam) * exp(-x * x / 0.06) * fw;
      g += s * d / max(rr, 1e-3);
    }
  }
  return vec3(g, var);
}

// ---------------------------------------------------------------- dock and canoe (3D)
#define DX0 -3.35
#define DX1 -1.75
#define DZ 15.4
vec2 boxT(vec3 ro, vec3 ird, vec3 b0, vec3 b1, out vec3 nr) {
  vec3 t0 = (b0 - ro) * ird, t1 = (b1 - ro) * ird;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z);
  float b = min(min(tf.x, tf.y), tf.z);
  nr = a == tn.x ? vec3(-sign(ird.x), 0.0, 0.0) : (a == tn.y ? vec3(0.0, -sign(ird.y), 0.0) : vec3(0.0, 0.0, -sign(ird.z)));
  return vec2(a, b);
}
// vertical post (axis along y) of radius r at (x, z), from y0 to y1
float postT(vec3 ro, vec3 rd, vec2 c, float r, float y0, float y1, inout vec3 nr) {
  vec2 o = ro.xz - c;
  float A = dot(rd.xz, rd.xz), B = dot(o, rd.xz), C = dot(o, o) - r * r;
  float D = B * B - A * C;
  if (D < 0.0) return 1e9;
  float t = (-B - sqrt(D)) / A;
  float y = ro.y + rd.y * t;
  if (t < 0.0 || y < y0 || y > y1) return 1e9;
  vec2 n2 = (o + rd.xz * t) / r;
  nr = vec3(n2.x, 0.0, n2.y);
  if (y > y1 - 0.01) nr = vec3(0.0, 1.0, 0.0);
  return t;
}
// canoe in its own frame: x across, y up from the waterline, z along (bow +z). Open hull, thin
// cedar shell, three thwarts. Returns a distance bound.
float canoeHull(vec3 p) {
  float s = clamp(p.z / 2.35, -1.0, 1.0);
  float b = 0.43 * sqrt(max(1.0 - s * s, 0.0)) + 0.003;
  float sh = 0.29 + 0.21 * pow(abs(s), 5.0);
  float dep = sh + 0.12;
  vec2 e = vec2(p.x / b, (p.y - sh) / dep);
  return max((length(e) - 1.0) * min(b, dep), abs(p.z) - 2.36);
}
float canoeD(vec3 p) {
  float d = canoeHull(p);
  float sh = 0.29 + 0.21 * pow(abs(clamp(p.z / 2.35, -1.0, 1.0)), 5.0);
  float hull = max(abs(d + 0.011) - 0.011, p.y - sh);
  float zi = clamp(floor(p.z / 0.95 + 0.5), -1.0, 1.0) * 0.95;
  float th = max(max(abs(p.z - zi) - 0.04, abs(p.y - sh + 0.075) - 0.012), d);
  return min(hull, th);
}
vec3 toCanoe(vec3 v) {
  vec3 r = vec3(CYAW.x * v.x - CYAW.y * v.z, v.y, CYAW.y * v.x + CYAW.x * v.z);
  float c = cos(CROLL), s = sin(CROLL);
  return vec3(c * r.x + s * r.y, -s * r.x + c * r.y, r.z);
}
vec3 fromCanoe(vec3 v) {
  float c = cos(CROLL), s = sin(CROLL);
  vec3 r = vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
  return vec3(CYAW.x * r.x + CYAW.y * r.z, r.y, -CYAW.y * r.x + CYAW.x * r.z);
}
float canoeT(vec3 ro, vec3 rd, float tmax, out vec3 pc) {
  vec3 o = toCanoe(ro - CPOS), d = toCanoe(rd);
  vec3 nb;
  vec2 bt = boxT(o, 1.0 / d, vec3(-0.46, -0.13, -2.4), vec3(0.46, 0.52, 2.4), nb);
  if (bt.x > bt.y || bt.y < 0.0 || bt.x > tmax) return 1e9;
  float t = max(bt.x, 0.0);
  for (int i = 0; i < 44; i++) {
    vec3 p = o + d * t;
    float dd = canoeD(p);
    if (dd < 0.0006 * t) { pc = p; return t; }
    t += max(dd * 0.85, 0.0015);
    if (t > bt.y) break;
  }
  return 1e9;
}

// nearest hit of the dock or canoe: returns t, normal and material
// (0 deck, 1 beams, 2 posts, 3 canoe)
float fgHit(vec3 ro, vec3 rd, out vec3 nr, out float mat, out vec3 pcan) {
  vec3 ird = 1.0 / rd;
  float t = 1e9;
  vec3 n;
  mat = -1.0;
  vec2 b = boxT(ro, ird, vec3(DX0 - 0.1, -3.0, 0.0), vec3(DX1 + 0.1, 0.70, DZ + 0.1), n);
  bool dock = b.x < b.y && b.y > 0.0;
  if (dock) {
  b = boxT(ro, ird, vec3(DX0, 0.40, 0.0), vec3(DX1, 0.46, DZ), n);
  if (b.x < b.y && b.x > 0.0) { t = b.x; nr = n; mat = 0.0; }
  b = boxT(ro, ird, vec3(DX0 + 0.04, 0.20, 0.0), vec3(DX1 - 0.04, 0.40, DZ - 0.04), n);
  if (b.x < b.y && b.x > 0.0 && b.x < t) { t = b.x; nr = n; mat = 1.0; }
  // posts: two rows, the nearest two of each row along the ray
  for (int row = 0; row < 2; row++) {
    float px = row == 0 ? DX1 - 0.06 : DX0 + 0.06;
    float zc = ro.z + rd.z * (px - ro.x) / rd.x;
    float k0 = clamp(floor((zc - 1.2) / 2.8), 0.0, 4.0);
    for (int k = 0; k < 2; k++) {
      float kk = min(k0 + float(k), 5.0);
      float pz = min(1.2 + kk * 2.8, DZ - 0.07);
      vec3 pn;
      float tp = postT(ro, rd, vec2(px, pz), 0.085, -3.0, kk > 4.5 ? 0.66 : 0.40, pn);
      if (tp < t) { t = tp; nr = pn; mat = 2.0; }
    }
  }
  }
  vec3 pc;
  float tc = canoeT(ro, rd, t, pc);
  if (tc < t) {
    t = tc; mat = 3.0; pcan = pc;
    vec2 k = vec2(1.0, -1.0);
    float ep = 0.002;
    vec3 nl = normalize(k.xyy * canoeD(pc + k.xyy * ep) + k.yyx * canoeD(pc + k.yyx * ep) + k.yxy * canoeD(pc + k.yxy * ep) + k.xxx * canoeD(pc + k.xxx * ep));
    nr = fromCanoe(nl);
  }
  return t;
}

vec3 skyDir(vec3 d) {
  vec2 s = vec2(d.x / max(d.z, 0.05) * FOC, YH + abs(d.y) / max(d.z, 0.05) * FOC);
  vec3 c = skyBase(s);
  float land = smoothstep(0.16, 0.02, abs(d.y)) * (0.6 + 0.4 * smoothstep(0.0, 0.5, abs(s.x - SUN.x)));
  c = mix(c, vec3(0.10, 0.055, 0.03), land);
  return d.y < 0.0 ? c * 0.35 : c;
}

vec3 shadeFg(vec3 pos, vec3 nr, float mat, vec3 rd, float fp, vec3 pc) {
  float ndl = max(dot(nr, SUNW), 0.0);
  float sky = 0.55 + 0.45 * nr.y;
  vec3 c;
  if (mat < 0.5) {
    // deck planks across the dock: weathered silver-grey, grain along the boards, dark gaps
    float pz = pos.z / 0.168;
    float pi = floor(pz), pf = fract(pz);
    float tone = h11(pi * 1.3);
    float fw = fp / 0.168 + 0.01;
    float gap = sat(smoothstep(0.925 - fw, 0.925 + fw, pf) + smoothstep(fw, -fw, pf - 0.012));
    float grain = vn(vec2(pos.x * 3.0 + pi * 7.0, pf * 14.0)) * 0.55 + vn(vec2(pos.x * 13.0, pf * 45.0 + pi)) * 0.45;
    vec3 alb = mix(vec3(0.19, 0.18, 0.165), vec3(0.22, 0.155, 0.10), tone * tone) * (0.72 + 0.45 * grain);
    alb *= 0.8 + 0.35 * smoothstep(0.2, 0.8, vn(vec2(pos.x * 0.7, pos.z * 0.9) + 3.0));
    if (nr.y > 0.5) {
      float nail = 0.0;
      for (int k = 0; k < 2; k++) {
        float nx = k == 0 ? DX1 - 0.07 : DX0 + 0.07;
        nail = max(nail, smoothstep(0.012 + fp, 0.012 - fp, length(vec2(pos.x - nx, (pf - 0.46) * 0.168))));
      }
      alb = mix(alb, vec3(0.04, 0.03, 0.025), nail * 0.8);
      alb *= 1.0 - 0.92 * gap;
      // morning dew: the boards mirror the bright sky towards the sun
      vec3 R = reflect(rd, normalize(vec3((tone - 0.5) * 0.06, 1.0, (pf - 0.5) * 0.14)));
      float fr = 0.03 + 0.6 * pow(1.0 - max(-rd.y, 0.0), 5.0);
      c = alb * (SUNC * 2.4 * ndl + AMB * sky) + skyDir(R) * fr * 0.6 * (1.0 - gap);
    } else {
      alb *= 0.7 * (1.0 - 0.85 * gap);
      c = alb * (SUNC * 2.4 * ndl + AMB * sky);
    }
  } else if (mat < 1.5) {
    vec3 alb = vec3(0.12, 0.095, 0.075) * (0.8 + 0.4 * vn(vec2(pos.z * 2.0, pos.y * 30.0)));
    c = alb * (SUNC * 2.4 * ndl + AMB * sky * 0.6);
  } else if (mat < 2.5) {
    float wet = smoothstep(0.30, 0.0, pos.y);
    vec3 alb = vec3(0.14, 0.11, 0.085) * (0.75 + 0.5 * vn(vec2(atan(nr.z, nr.x) * 3.0, pos.y * 9.0)));
    alb = mix(alb, vec3(0.045, 0.05, 0.028), wet * 0.85);
    c = alb * (SUNC * 2.4 * ndl + AMB * sky);
  } else {
    // canoe: green canvas outside, varnished cedar inside, ash gunwales and thwarts
    float s = clamp(pc.z / 2.35, -1.0, 1.0);
    float sh = 0.29 + 0.21 * pow(abs(s), 5.0);
    float d = canoeHull(pc);
    vec3 alb;
    float gloss;
    if (pc.y > sh - 0.028) { alb = vec3(0.26, 0.13, 0.055); gloss = 0.5; }
    else if (d > -0.006) {
      alb = vec3(0.012, 0.050, 0.030) * (0.9 + 0.2 * vn(pc.zy * vec2(3.0, 20.0)));
      gloss = 0.45;
    } else {
      float strip = vn(vec2(pc.z * 0.8, pc.y * 70.0)) * 0.5 + 0.5 * h11(floor(pc.y * 35.0 + 0.5 * pc.z));
      float rib = smoothstep(0.30, 0.45, abs(fract(pc.z * 3.4) - 0.5));
      alb = vec3(0.30, 0.13, 0.05) * (0.75 + 0.35 * strip) * (1.0 - 0.3 * rib);
      gloss = 0.35;
    }
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, nr), 0.0), 5.0);
    c = alb * (SUNC * 2.6 * ndl + AMB * sky) + skyDir(reflect(rd, nr)) * fr * gloss;
  }
  return c;
}

// ---------------------------------------------------------------- leaves
// leaf outline in local units (y along the midrib, tip up): maple (kind 0) or aspen/birch (kind 1)
float leafMask(vec2 l, float kind, float aal) {
  float r = length(l);
  float a = abs(atan(l.x, l.y));
  float e;
  if (kind < 0.5) {
    e = max(0.30, pow(max(cos(a * 2.4), 0.0), 2.5));
    e = max(e, 0.85 * pow(max(cos((a - 0.95) * 2.6), 0.0), 2.5));
    e = max(e, 0.52 * pow(max(cos((a - 1.95) * 2.8), 0.0), 2.5));
    e += 0.035 * (abs(sin(a * 16.0)) - 0.5) * smoothstep(0.35, 0.6, e) * smoothstep(0.4, 0.15, aal);
  } else {
    e = 0.64 * (1.0 + 0.30 * cos(a)) * (1.0 + 0.25 * smoothstep(0.5, 0.0, a));
    e += 0.02 * (abs(sin(a * 22.0)) - 0.5) * smoothstep(0.4, 0.15, aal);
  }
  float m = smoothstep(e + aal, e - aal, r);
  float st = smoothstep(0.035 + aal, 0.035 - aal, abs(l.x)) * smoothstep(0.0, -0.02, l.y) * smoothstep(-0.62, -0.55, l.y);
  return max(m, st);
}
vec3 leafColor(float hs) {
  if (hs < 0.35) return mix(vec3(0.40, 0.030, 0.014), vec3(0.56, 0.08, 0.02), hs / 0.35);
  if (hs < 0.65) return mix(vec3(0.60, 0.18, 0.02), vec3(0.64, 0.32, 0.04), (hs - 0.35) / 0.3);
  if (hs < 0.88) return vec3(0.58, 0.42, 0.06);
  return vec3(0.22, 0.10, 0.035);
}
// leaves drifting on the surface (world coords on the water plane): premultiplied colour
vec4 surfLeaves(vec2 w, float fx, float fz) {
  float cs = 1.1;
  vec2 dw = w - vec2(TM * (cs * 64.0 / LOOP), -TM * (cs * 16.0 / LOOP));
  vec2 ci = floor(dw / cs);
  vec2 cf = dw / cs - ci;
  vec4 h = h42(mod(ci, vec2(64.0, 16.0)) + 41.0);
  if (h.z > 0.30) return vec4(0.0);
  float sz = 0.05 + 0.045 * h.w;
  vec2 d = (cf - (0.25 + 0.5 * h.xy)) * cs;
  float ang = h.x * TAU + wav(0.004 + 0.004 * h.y, h.w * TAU) * 0.6;
  vec2 l = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d / sz;
  float aal = sqrt(fx * fz) / sz * 0.9;
  if (aal > 0.8 || dot(l, l) > 1.6) return vec4(0.0);
  float m = leafMask(l, step(0.55, h.y), aal);
  if (m <= 0.0) return vec4(0.0);
  vec3 alb = leafColor(h.y);
  float vein = smoothstep(0.03 + aal, 0.0, abs(l.x)) * 0.3;
  vec3 col = alb * (1.0 - vein) * (SUNC * 0.7 + AMB * 0.7) * (0.8 + 0.35 * vn(l * 3.0 + h.zw * 9.0));
  col += SUNC * 0.25 * pow(1.0 - fz / (fz + fx * 4.0), 8.0);
  return vec4(col, 1.0) * m * smoothstep(0.8, 0.4, aal);
}

// geese pair (world space), shared by the sky pass and the reflection
#define BPER 300.0
vec3 birdPos(float id) {
  float ph = mod(TM, BPER);
  return vec3(-48.0 + ph * 5.0 - id * 3.6, 2.6 + 0.2 * wav(0.21, id * 2.0) + id * 0.3, 60.0 + id * 5.0);
}
// a goose in flight (g in units of half its wingspan, facing +x): coverage
float gooseShape(vec2 g, float flap, float pxs) {
  float ax = abs(g.x + 0.05);
  float wy = flap * 0.7 * ax - 0.10 * ax * ax;
  float th = mix(0.10, 0.025, sat(ax));
  float dw = max(abs(g.y - wy) - th, ax - 0.95);
  float body = (length((g - vec2(0.0, -0.02)) / vec2(0.32, 0.085)) - 1.0) * 0.08;
  float neck = (length((g - vec2(0.43, 0.015)) / vec2(0.21, 0.035)) - 1.0) * 0.035;
  return smoothstep(pxs, -pxs, min(dw, min(body, neck)));
}
float birdsAt(vec2 q, float mirror) {
  if (mod(TM, BPER) > 22.0) return 0.0;
  float a = 0.0;
  for (int i = 0; i < 2; i++) {
    float id = float(i);
    vec3 b = birdPos(id);
    float Y = mirror > 0.5 ? -b.y : b.y;
    float zz = b.z - CAM.z;
    vec2 sp = vec2((b.x - CAM.x) * FOC / zz, YH + (Y - CAM.y) * FOC / zz);
    float S = 0.85 * FOC / zz;
    vec2 g = (q - sp) / S;
    if (mirror > 0.5) g.y = -g.y;
    if (abs(g.x) > 1.2 || abs(g.y) > 0.9) continue;
    a = max(a, gooseShape(g, wav(2.4 + 0.3 * id, id * 2.1), PX / S));
  }
  return a;
}

vec4 lakeLin(vec2 p) {
  vec2 q = p + u_par * (0.3 * PK);
  float ys = shoreY(q.x);
  if (q.y > ys + 2.0 * PX) return vec4(0.0);
  float alpha = smoothstep(0.7 * PX, -0.7 * PX, q.y - ys);
  float dy = max(YH - q.y, 0.25 * PX);
  float Z = min(FOC * CAM.y / dy, 8000.0);
  vec2 W = vec2(CAM.x + q.x * Z / FOC, Z);
  float fx = Z * PX / FOC, fz = fx * Z / CAM.y;
  vec3 sl = waterSlope(W, vec2(fx, fz), q.x);
  vec3 rdn = normalize(vec3(q.x, q.y - YH, FOC));
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  float cosv = max(dot(-rdn, n), 0.02);
  float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  // reflection: each layer mirrored about its own base line, displaced by the slope
  vec2 off = vec2(-2.0 * dy * sl.x, 2.0 * FOC * sl.y + 2.0 * q.x * sl.x);
  vec3 refl = vec3(0.0);
  float T = 1.0;
  vec4 c = hillsQ(vec2(q.x, 2.0 * ys - q.y) + off, 0.0);
  refl += c.rgb; T *= 1.0 - c.a;
  if (T > 0.01) {
    vec2 qr = p + u_par * (0.15 * PK);
    c = ridgeQ(vec2(qr.x, 2.0 * shoreY(qr.x) - qr.y) + off, 0.0);
    refl += T * c.rgb; T *= 1.0 - c.a;
  }
  if (T > 0.01) {
    vec2 qm = p + u_par * (0.06 * PK);
    c = mtnQ(vec2(qm.x, 2.0 * YH - qm.y) + off, 0.0);
    refl += T * c.rgb; T *= 1.0 - c.a;
  }
  if (T > 0.01) refl += T * skyQ(vec2(p.x, 2.0 * YH - p.y) + off, 0.0).rgb;
  // geese reflected
  float br = birdsAt(q - off * 0.5, 1.0);
  refl = mix(refl, vec3(0.02, 0.02, 0.025), br * 0.85);
  // dock and canoe reflected (true 3D reflection)
  if (Z < 40.0 && q.x < 0.2) {
    vec3 R = reflect(rdn, n);
    vec3 fn, pc; float fm;
    vec3 Wp = vec3(W.x, 0.0, W.y);
    float tf = fgHit(Wp + R * 0.001, R, fn, fm, pc);
    if (tf < 1e8) { refl = shadeFg(Wp + R * tf, fn, fm, R, 0.01, pc) * 0.92; T = 0.0; }
  }
  // body: peaty brown-green; the stony bed shows through in the shallows
  vec3 body = vec3(0.010, 0.014, 0.011) * (AMB * 1.2 + SUNC * 0.4);
  float depth = 0.3 + 0.10 * Z;
  float sh = exp(-depth * 1.4 / max(cosv, 0.1));
  if (sh > 0.01) {
    vec2 bw = W + rdn.xz / max(-rdn.y, 0.05) * depth * 0.7 + sl.xy * depth * 30.0;
    vec2 pc = bw * 4.0;
    vec2 pi = floor(pc), pf = fract(pc);
    vec4 ph = h42(pi + 3.0);
    float pd = length((pf - 0.5 - (ph.xy - 0.5) * 0.3) * vec2(1.0, 1.0 + ph.z));
    float stone = smoothstep(0.48, 0.30, pd);
    vec3 bed = mix(vec3(0.07, 0.06, 0.045), vec3(0.20, 0.17, 0.12) * (0.6 + 0.6 * ph.w), stone);
    bed *= 0.7 + 0.5 * vn(bw * 1.5);
    vec4 sunk = surfLeaves(bw * 1.7 + 50.0, fx * 1.7, fz * 1.7);
    bed = bed * (1.0 - sunk.a) + sunk.rgb * 0.35;
    bed *= vec3(0.55, 0.72, 0.55) * (SUNC * 1.1 + AMB * 0.7);
    body = mix(body, bed, sh);
  }
  vec3 col = mix(body, refl, F);
  // rippled patches mirror a wider cone of the sky: a soft silver sheen
  float sheen = sat(sl.z * 3000.0);
  col = mix(col, skyBase(vec2(q.x * 0.6, 0.64)) * F * 1.1, sheen * 0.55);
  // sun glitter from ripples too small to resolve
  vec3 H = normalize(SUNW - rdn);
  float cb = max(dot(H, n), 1e-3);
  float var = sl.z + 0.00004;
  float D = exp(-(1.0 - cb * cb) / (cb * cb * var)) / (3.14159 * var * cb * cb * cb * cb);
  // (only where the mirrored view sees open sky: the sun stands behind the crest trees)
  col += SUNC * min(0.02 * D * F / (4.0 * cosv), 40.0) * 0.3 * T;
  // floating leaves
  vec4 lf = surfLeaves(W, fx, fz);
  col = col * (1.0 - lf.a) + lf.rgb;
  return vec4(col, 1.0) * alpha;
}

// ---------------------------------------------------------------- mist, steam fog and shafts
// light shafts: how much sun gets past the right-hand crest in the direction of q. Above the
// crest line (which falls away to the left and rises to the right) the sky is open; below it
// the light leaks through the lacy treetops in narrow beams. A function of direction only, so
// the rays fan out from the sun.
float shaftLit(vec2 q) {
  vec2 d = q - SUN;
  float r = length(d);
  float a = atan(d.y, d.x);
  // open sky: above the crest rising to the right (slope ~0.35), or above it falling to the left (~0.3)
  float open = max(smoothstep(0.26, 0.40, a), smoothstep(-2.80, -2.92, a));
  // A few broad beams of irregular width and strength, built from domain-warped gradient
  // noise along the angle (never a regular comb). Each octave fades out before its angular
  // period gets near the pixel footprint, so the fan never aliases into stripes near the sun.
  float fa = PX / max(r, 1e-3);
  float x = a * 9.0 + 0.25 * g1(a * 3.0 + 4.0) + 0.06 * wav(0.0025, 1.0);
  float n = 0.55 * g1(x + 2.3);
  n += 0.30 * g1(x * 2.13 + 7.1 + 0.05 * wav(0.004, 2.0)) * smoothstep(0.35, 0.10, fa * 19.0);
  n += 0.15 * g1(x * 4.71 + 1.9 + 0.08 * wav(0.006, 3.0)) * smoothstep(0.35, 0.10, fa * 42.0);
  float beams = smoothstep(-0.30, 0.55, n);
  beams = 0.30 + 0.70 * beams * beams;
  // far from the sun the shafts are scattered into a general glow
  beams = mix(beams, 0.62, smoothstep(0.08, 0.55, r));
  return mix(beams, 1.0, open);
}
// steam fog lying on the water. The layer thins out exponentially with height (scale 1.1 m)
// and is integrated analytically along the ray, so it is continuous across the horizon and
// never breaks into perspective-squashed streaks. Lumpy banks of sea smoke drift over it at a
// few distances, each with its own soft rolling top and its own drift speed.
float steamTau(vec2 q, float zend) {
  float s = (q.y - YH) / FOC;     // ray height gained per metre of distance
  float k = s / 1.1;
  float I = abs(k * zend) < 1e-3 ? zend * (1.0 - 0.5 * k * zend) : (1.0 - exp(-k * zend)) / k;
  // broad patchiness along the shore, sampled where most of the fog on the ray lies
  float zr = min(zend, 50.0 + 0.30 * zend);
  float wx = CAM.x + q.x * zr / FOC;
  float px = wx / (9.0 + 0.10 * zr) - TM * (16.0 / LOOP);
  float pat = 0.65 * vnP(vec2(px, 3.7), vec2(16.0, 8.0)) + 0.35 * vnP(vec2(px * 2.3 + 1.7, 5.1), vec2(37.0, 8.0));
  float tau = 0.0021 * I * (0.15 + 1.9 * pat * pat);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float zk = 24.0 * pow(1.9, fi);
    float w = sat((zend - 0.72 * zk) / (0.62 * zk));   // how much of the bank's depth the ray crosses
    if (w <= 0.0) break;
    float hr = CAM.y + s * zk;                         // ray height at that distance (m)
    float tmax = 1.0 + 0.032 * zk;
    if (hr > tmax * 1.05) continue;
    float cw = 2.5 + 0.10 * zk;                        // bank size along the shore (m)
    float x = (CAM.x + q.x * zk / FOC) / cw;
    float dr = TM * ((32.0 + 32.0 * mod(fi, 2.0)) / LOOP);
    float n = 0.62 * vnP(vec2(x - dr, fi * 5.3), vec2(32.0, 64.0))
            + 0.38 * vnP(vec2(x * 2.6 - dr * 2.0 + 3.1, fi * 5.3 + 2.0), vec2(64.0, 64.0));
    float th = tmax * (0.15 + 0.85 * smoothstep(0.32, 0.85, n));
    tau += w * smoothstep(th, 0.2 * th, hr) * (0.15 + 0.55 * n) * min(zk * 0.012, 1.2);
  }
  return tau;
}
// the bank of mist on the far shore: density at height h (m) above the water, at the shore below x
float bankD(float x, float h) {
  float d = TM * (24.0 / LOOP);
  float n = vnP(vec2(x * 7.0 - d, h * 0.035), vec2(24.0, 64.0)) * 0.65 + vnP(vec2(x * 19.0 - d * 2.0, h * 0.09 + 3.0), vec2(48.0, 64.0)) * 0.35;
  float top = 14.0 + 46.0 * n * n;
  return smoothstep(top, top * 0.25, h) * (0.55 + 0.45 * n);
}
// colour of the mist: ambient grey-blue plus forward-scattered sun where the crest lets it through
vec3 mistCol(vec2 qm, float lit) {
  float r = length((qm - SUN) * vec2(1.0, 1.25));
  vec3 base = vec3(0.40, 0.45, 0.54) * (0.85 + 0.35 * exp(-r * 3.0));
  return base + SUNC * lit * (0.30 + 4.8 * exp(-r * 3.2));
}

vec4 mistLin(vec2 p) {
  vec2 q = p + u_par * (0.3 * PK);
  vec2 qm = p + u_par * (0.62 * PK);
  float r = length((qm - SUN) * vec2(1.0, 1.25));
  float bloom = 0.40 * exp(-r * 18.0) + 0.10 * exp(-r * 5.0);
  if (q.y > 0.68) return vec4(SUNC * 4.0, 1.0) * bloom * (0.25 + 0.75 * SUNVIS);
  float dy = YH - q.y;
  float zs = shoreD(q.x), ys = shoreY(q.x);
  float zend = dy > 0.0 ? min(FOC * CAM.y / max(dy, 1e-4), zs) : zs;
  // steam layer and banks of sea smoke on the water
  float fog = 1.0 - exp(-steamTau(q, zend));
  if (q.y < 0.51) {
    // the bank on the far shore (and lying on the far water)
    float hb = max((q.y - ys) * zs / FOC, 0.0);
    float reach = dy > 0.0 ? smoothstep(0.55, 0.95, zend / zs) : 1.0;
    float bk = bankD(q.x, hb) * reach;
    fog = 1.0 - (1.0 - fog) * exp(-2.2 * bk);
  }
  // general morning haze in the air above the lake, thicker towards the sun
  float air = (0.07 + 0.28 * exp(-r * 3.5)) * smoothstep(0.66, 0.50, q.y) * (1.0 - exp(-zend / 500.0));
  float a = sat(fog + air * (1.0 - fog));
  if (a + bloom <= 0.002) return vec4(0.0);
  float lit = a + bloom > 0.012 ? shaftLit(qm) : 1.0;
  vec4 res = vec4(mistCol(qm, lit), 1.0) * a;
  // the sun's glow over the crest trees, through the gaps
  res = over(res, vec4(SUNC * 4.0 * (0.3 + 0.7 * lit), 1.0) * bloom * (0.25 + 0.75 * SUNVIS));
  return res;
}

// ---------------------------------------------------------------- dock layer (2x2 supersampled)
vec4 dockLin(vec2 p) {
  vec2 q = p + u_par * (0.3 * PK);
  if (q.y > 0.40 || q.x > 0.08) return vec4(0.0);
  vec3 acc = vec3(0.0);
  float cov = 0.0;
  vec3 last = vec3(-1.0);   // (material, t, -) of the last shaded sample
  vec3 lastC = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 qq = q + (vec2(float(i & 1), float(i >> 1)) - 0.5) * 0.5 * PX;
    vec3 rd = normalize(vec3(qq.x, qq.y - YH, FOC));
    vec3 nr, pc; float mt;
    float t = fgHit(CAM, rd, nr, mt, pc);
    if (t > 1e8) continue;
    vec3 pos = CAM + rd * t;
    if (pos.y < 0.0) continue;
    vec3 c = lastC;
    if (mt != last.x || abs(t - last.y) > 0.02 * t || mt > 1.5) {
      c = shadeFg(pos, nr, mt, rd, t * PX / FOC, pc);
      c *= 0.55 + 0.45 * smoothstep(0.0, 0.07, pos.y);
      c = mix(c, hazeCol(qq) * 0.8, 0.02 + 0.004 * t);
      last = vec3(mt, t, 0.0);
      lastC = c;
    }
    acc += c;
    cov += 1.0;
  }
  if (cov <= 0.0) return vec4(0.0);
  return vec4(acc / 4.0, cov / 4.0);
}

// ---------------------------------------------------------------- falling leaves
// cs: cell size; K: whole hash periods fallen per loop (the fall wraps seamlessly)
vec4 fallLeaves(vec2 q, float cs, float sz, float K, float seed, float blur, float dens) {
  vec2 qq = q + vec2(-TM * (cs * 16.0 / LOOP), TM * (K * 12.0 * cs / LOOP));
  vec2 ci = floor(qq / cs);
  vec2 cf = qq / cs - ci;
  vec4 h = h42(mod(ci, vec2(16.0, 12.0)) + seed);
  if (h.z > dens) return vec4(0.0);
  vec4 h2 = h42(mod(ci, vec2(16.0, 12.0)) + seed + 9.0);
  float sw = wav(0.20 + 0.15 * h2.x, h2.y * TAU);
  vec2 d = (cf - vec2(0.5 + (h.x - 0.5) * 0.25 + 0.16 * sw, 0.5 + (h.y - 0.5) * 0.3)) * cs / sz;
  if (dot(d, d) > 2.0) return vec4(0.0);
  float roll = sw * 0.9 + h2.z * TAU;
  float flip = wav(0.35 + 0.4 * h2.w, h.w * TAU);
  d = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * d;
  float fl = max(abs(flip), 0.08);
  vec2 l = vec2(d.x / fl, d.y);
  float aal = (AA + blur) / sz / fl;
  float m = leafMask(l, step(0.5, h2.x), aal);
  if (m <= 0.0) return vec4(0.0);
  vec3 alb = leafColor(h.w);
  // backlit: the leaf glows when its face turns to us, goes dark edge-on
  float face = abs(flip);
  vec3 col = alb * (SUNC * (0.35 + 2.2 * face * face) + AMB * 0.35) * (flip > 0.0 ? 1.0 : 0.7);
  col *= 1.0 - 0.35 * smoothstep(0.04 + aal, 0.0, abs(l.x)) * face;
  return vec4(col, 1.0) * m;
}

vec4 leavesLin(vec2 p) {
  vec4 acc = vec4(0.0);
  float b = birdsAt(p + u_par * (0.3 * PK), 0.0);
  if (b > 0.0) acc = vec4(vec3(0.022, 0.020, 0.022), 1.0) * b;
  float g = GUST;
  acc = over(acc, fallLeaves(p + u_par * (0.8 * PK), 0.085, 0.0042, 50.0, 11.0, 0.0, 0.05 + 0.3 * g));
  acc = over(fallLeaves(p + u_par * (1.0 * PK), 0.15, 0.0080, 40.0, 23.0, 0.0, 0.06 + 0.3 * g), acc);
  acc = over(acc, fallLeaves(p + u_par * (1.3 * PK), 0.28, 0.016, 30.0, 37.0, 0.0025, 0.05 + 0.25 * g));
  return acc;
}

// ---------------------------------------------------------------- output
vec3 toDisp(vec3 c) {
  c *= 0.90 * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  return mix(c, c * c * (3.0 - 2.0 * c), 0.25);
}
vec4 finish(vec4 v) {
  if (v.a <= 0.0) return vec4(0.0);
  return vec4(toDisp(v.rgb / v.a) * v.a, v.a);
}
vec4 layerLin(int k, vec2 p) {
  if (k == 0) return skyQ(p, 1.0);
  if (k == 1) return mtnQ(p + u_par * (0.06 * PK), 1.0);
  if (k == 2) return ridgeQ(p + u_par * (0.15 * PK), 1.0);
  if (k == 3) return hillsQ(p + u_par * (0.3 * PK), 1.0);
  if (k == 4) return lakeLin(p);
  if (k == 5) return mistLin(p);
  if (k == 6) return dockLin(p);
  return leavesLin(p);
}

void main() {
  TM = mod(u_time, LOOP);
  PX = 1.0 / u_res.y;
  AA = 0.75 * PX;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.9);
  VIG = 1.0 - 0.30 * smoothstep(0.10, 0.60, dot(vq, vq) * 1.6);
  float ph = mod(TM, 150.0);
  GPH = ph / 34.0;
  GUST = ph < 34.0 ? sq(sin(3.14159 * GPH)) * (0.6 + 0.4 * h11(floor(TM / 150.0) + 3.0)) : 0.0;
  CAM = vec3(u_par.x * (6.0 * PK / FOC), CAMH + u_par.y * (6.0 * PK / FOC), 0.0);
  SUNW = normalize(vec3(SUN.x, SUN.y - YH, FOC));
  float yaw = 0.42 + 0.035 * wav(0.011, 0.0);
  CYAW = vec2(cos(yaw), sin(yaw));
  CROLL = 0.022 * wav(0.13, 1.0);
  CPOS = vec3(-0.72, 0.008 * wav(0.17, 2.0), 13.2);
  initWaves();
  SUNVIS = 0.55;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  if (u_layer >= 0.0) {
    vec4 c = finish(layerLin(int(u_layer + 0.5), p));
    fragColor = vec4(c.rgb + dith * c.a, c.a);
    return;
  }
  // front-to-back with early-out once opaque (identical to back-to-front "over")
  vec4 acc = finish(leavesLin(p));
  acc += (1.0 - acc.a) * finish(dockLin(p));
  acc += (1.0 - acc.a) * finish(mistLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(lakeLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(layerLin(3, p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(layerLin(2, p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(layerLin(1, p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(skyQ(p, 1.0));
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4) + dith, 1.0);
}
`,
}
