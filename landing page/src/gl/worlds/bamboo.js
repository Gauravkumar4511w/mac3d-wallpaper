// Bamboo Grove — a dense bamboo forest just after sunrise.
// Tall green-gold culms with nodes, wax bloom and papery sheaths stand in
// rows that recede into soft morning mist; a winding flagstone path with
// mossy joints and gravel borders runs between low yotsume-gaki bamboo
// fences towards a bright misty vanishing point. High up, sprays of fine
// leaves fill the canopy; the low sun breaks through in slowly shifting
// shafts with dust motes drifting in the beams. Culms sway at their own
// phases, the canopy rustles and dry leaves flutter down. Long cycles: a gust
// ripples through the grove every 120 s and shakes a flurry of leaves loose;
// every 200 s the mist thins and the sun brightens for a while.
//
// Everything is rendered from one 3D camera (cursor parallax moves it), so
// parallax is correct per depth. Fog is integrated analytically along each
// ray (height fog + two slabs of sun shafts); layers behind the "sun rays and
// mist" layer carry the fog from the split depth ZS onwards, layers in front
// of it carry their own. Every layer is lit in linear light, tone-mapped
// (ACES fit) and gamma-encoded on its own, so the full scene is the
// back-to-front "over" composite of the isolated layers.
// Time: TM = u_time mod 1200 s; every oscillator and drift is quantised to it.

export default {
  id: 'bamboo',
  name: 'Bamboo Grove',
  tag: 'Misty morning path',
  accent: '#5f9e2c',
  accent2: '#e0ac3e',
  ink: '#2c5612',
  glow: '#e3f0c6',
  light: true,
  clockColor: '#1c3114',
  sky: 'linear-gradient(180deg,#b9cf9c 0%,#d9e4c4 30%,#e8eddc 45%,#c4c9b0 55%,#8e9a6e 70%,#6b7552 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Morning mist', depth: 0 },
    { name: 'Path and forest floor', depth: 0.12 },
    { name: 'Far culms', depth: 0.22 },
    { name: 'Grove', depth: 0.42 },
    { name: 'Sun rays and mist', depth: 0.6 },
    { name: 'Bamboo fence', depth: 0.75 },
    { name: 'Near culms', depth: 1.0 },
    { name: 'Falling leaves', depth: 1.2 },
  ],
  clockAfter: 4,
  stillTime: 40,
  frag: /* glsl */ `
#define TAU 6.2831853
#define LOOP 1200.0
#define PK 0.030
#define FOC 1.2
#define CAMH 1.6
#define PITCH 0.07
#define CORR 1.95
#define ZS 7.2
#define ZM 16.2
#define HC 15.0
#define FW 1.55

float TM;          // u_time folded into the loop
float PX;          // one pixel in screen units (height-relative)
float VIG;         // vignette
float GPH;         // phase inside the 120 s gust cycle
float GSTR;        // strength of this cycle's gust
float SUNI;        // sun intensity (brightens during the clearing event)
float FOGK;        // mist density factor (thins during the clearing event)
float WISP;        // patchiness of the low mist along this ray
vec3 CAM;          // camera position (cursor parallax moves it)
vec3 RD;           // view ray (unnormalised: RD.z is depth per unit)
vec3 RDN;          // view ray, normalised
float KX, KY;      // RD.x / RD.z, RD.y / RD.z
float RM;          // ray length per unit depth
float CW;          // cosine of the ray's horizontal angle
float ZG;          // depth where the ray meets the ground (1e5 if never)
float BACK;        // how much this ray looks into the sun (leaf translucency)
vec3 LS;           // direction to the sun
vec2 LSH, PERP;    // sun azimuth on the ground and its perpendicular
vec2 SUNS;         // sun position on screen
vec3 LAMB;         // ambient in-scatter of the mist along this ray
vec3 LB1, LB2;     // sun-shaft in-scatter: near slab, far slab
float TZS, TB0, TB1, TB2; // optical depth at the split and the slab bounds

const vec3 SUNC = vec3(1.0, 0.80, 0.55);
const vec3 MISTC = vec3(0.60, 0.68, 0.54);

float sat(float x) { return clamp(x, 0.0, 1.0); }
float sq(float x) { return x * x; }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

// seamless oscillator: frequency snapped to the loop
float wav(float f, float ph) { return sin(TAU * fract(floor(f * LOOP + 0.5) / LOOP * TM) + ph); }
// loop-periodic drift: whole cycles per loop
float drift(float cyc) { return TM * (cyc / LOOP); }

float n1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec4 over(vec4 b, vec4 f) { return f + b * (1.0 - f.a); }
// exact box filter of the band |x| < w over a footprint fw
float band(float d, float w, float fw) {
  float a = clamp(d - 0.5 * fw, -w, w), b = clamp(d + 0.5 * fw, -w, w);
  return (b - a) / fw;
}
// box-filtered pulse train: bars of width w centred on multiples of P
float pulseI(float x, float P, float w) { float y = x + 0.5 * w; return floor(y / P) * w + min(mod(y, P), w); }
float pulse(float x, float P, float w, float fw) { return (pulseI(x + 0.5 * fw, P, w) - pulseI(x - 0.5 * fw, P, w)) / fw; }

// ---------------------------------------------------------------- world
// the path's centre line as it winds away from the camera
float pathX(float z) { return 0.1 - 2.0 * smoothstep(8.0, 34.0, z) + 2.6 * smoothstep(30.0, 66.0, z) + 0.12 * sin(z * 0.23); }
float pathD(float z) { return (pathX(z + 0.05) - pathX(z - 0.05)) * 10.0; }

// gust: one front per 120 s cycle travelling right to left (from the sun side)
float gustAt(float x) {
  float t = GPH - (24.0 - x) / 4.0;
  return (t > 0.0 && t < 10.0) ? GSTR * sq(sin(3.14159 * t / 10.0)) : 0.0;
}
// horizontal sway of a culm at height y (h: its hash)
float swayX(float xc, float y, float hgt, vec4 h) {
  float k = sq(y / hgt);
  float s = 0.20 * wav(0.10 + 0.07 * h.x, h.z * TAU) + 0.08 * wav(0.23 + 0.11 * h.y, h.w * TAU);
  float g = gustAt(xc);
  s -= g * (0.45 + 0.20 * wav(0.55 + 0.2 * h.x, h.y * TAU));
  return k * s;
}

// sun flecks: canopy gaps along the sun ray, and the shadows of stems upstream
float sunVis(vec3 P) {
  vec2 Q = P.xz + LS.xz / LS.y * (HC - P.y);
  Q += vec2(0.25 * wav(0.05, 1.0) + 0.12 * wav(0.13, 2.0), 0.2 * wav(0.07, 3.0));
  Q.x -= 0.6 * gustAt(Q.x) * wav(0.5, 0.0);
  float g = vn(Q * 0.45 + vec2(drift(6.0), 0.0)) * 0.6 + vn(Q * 1.3 + vec2(3.1, drift(-10.0))) * 0.4;
  float gap = smoothstep(0.50, 0.74, g);
  float u = dot(P.xz, PERP);
  float st = n1(u * 1.25 + 4.0) * 0.6 + n1(u * 3.3 + 9.0) * 0.4;
  return gap * smoothstep(0.42, 0.62, st);
}

// ---------------------------------------------------------------- mist
float hgPhase(float c) { float g = 0.72; return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5); }
// optical depth from the camera to depth z along the current ray
#define FS0 0.0125
#define FS1 0.030
#define FH 2.2
float E0;
float tauAt(float z) {
  z = min(z, ZG);
  float b = abs(KY) < 1e-4 ? E0 * z : FH / KY * (E0 - exp(-(CAM.y + KY * z) / FH));
  return RM * FOGK * (FS0 * z + FS1 * WISP * b);
}
// in-scatter between optical depths t0 and tz (as seen from t0)
vec3 inscat(float t0, float tz) {
  float T = exp(t0 - tz);
  vec3 s = LAMB * (1.0 - T);
  float a = exp(t0 - clamp(TB0, t0, tz)), b = exp(t0 - clamp(TB1, t0, tz)), c = exp(t0 - clamp(TB2, t0, tz));
  return s + LB1 * (a - b) + LB2 * (b - c);
}
vec3 fogApply(vec3 col, float t0, float z) {
  float tz = tauAt(z);
  return col * exp(t0 - tz) + inscat(t0, tz);
}
// radiance of the bright misty surroundings in direction d (for reflections)
vec3 envRad(vec3 d) {
  vec3 e = MISTC * (0.70 + 0.35 * smoothstep(-0.2, 0.6, d.z)) * (0.8 + 0.3 * sat(d.y + 0.3));
  return e + SUNC * SUNI * 0.05 * hgPhase(dot(d, LS));
}
// sun shafts in screen space: streaks radiating from the sun (behind the canopy)
float shafts(vec2 q, float seed, float f) {
  vec2 d = q - SUNS;
  float a = atan(d.x, -d.y);
  float k = a * f + 0.35 * wav(0.004, seed) + 0.2 * wav(0.011, seed * 2.0);
  float n = n1(k + seed * 17.0) * 0.6 + n1(k * 2.3 + seed * 5.0) * 0.4;
  float b = smoothstep(0.40, 0.82, n);
  float r = length(d);
  // patchy mist along the beams
  b *= 0.65 + 0.35 * vn(vec2(k * 0.5, r * 5.0 - drift(30.0)));
  return b * smoothstep(0.12, 0.6, r) * (0.55 + 0.45 * smoothstep(1.9, 0.6, r));
}

// ---------------------------------------------------------------- culms
// placement: rows of depth dz, cells of width sx along x (jittered); one culm per cell
vec2 rowP(float j, float seed) { return vec2(0.92 * (0.85 + 0.3 * h11(j * 1.37 + seed)), h11(j * 7.13 + seed * 3.1) * 13.0); }
vec4 cellH(float c, float j, float seed) { return h42(vec2(c, j) + seed * 0.731 + 0.37); }
// node coordinate: internodes are short at the base and lengthen upwards
float nodeS(float y) { return y / 0.36 + 5.0 * (1.0 - exp(-y / 0.7)); }

// shade one culm. nx: across the visible face (-1..1), y: height, dp: offset from the path
vec3 culmShade(float nx, float y, vec2 cxz, vec4 h, vec4 h2, float fw, float dp, float r) {
  float age = h2.x;
  vec3 alb;
  if (age < 0.30) alb = mix(vec3(0.040, 0.15, 0.022), vec3(0.075, 0.19, 0.030), age / 0.30);
  else if (age < 0.80) alb = mix(vec3(0.10, 0.20, 0.035), vec3(0.20, 0.22, 0.045), (age - 0.30) / 0.50);
  else if (age < 0.92) alb = vec3(0.30, 0.24, 0.06);
  else alb = vec3(0.17, 0.18, 0.11);
  float young = 1.0 - smoothstep(0.2, 0.45, age);
  float ang = asin(clamp(nx, -1.0, 1.0));
  // nodes
  float s = nodeS(max(y, 0.0)) + h2.z;
  float Li = 1.0 / (1.0 / 0.36 + 7.14 * exp(-max(y, 0.0) / 0.7));
  float dn = (fract(s + 0.5) - 0.5) * Li;
  float fs = fract(s);
  float node = floor(s);
  // colour drift along the culm and between internodes
  alb *= 0.82 + 0.34 * vn(vec2(y * 0.6, h.x * 50.0));
  alb *= 0.92 + 0.16 * h11(node + h.y * 30.0);
  float fA = smoothstep(3.0, 0.8, fw / (r * 0.05));
  float st = vn(vec2(ang * 18.0 + h.w * 40.0, y * 1.2 + node * 3.0)) * 0.7 + vn(vec2(ang * 60.0 + h.w * 9.0, y * 3.0)) * 0.3;
  alb *= 1.0 + 0.26 * (st - 0.5) * fA;
  // lichen and weathering on older culms, low down; damp darkening at the foot
  float old = smoothstep(0.55, 0.95, age);
  float lic = smoothstep(0.60, 0.72, vn(vec2(ang * 2.2 + h.x * 20.0, y * 3.0))) * old * smoothstep(7.0, 1.0, y);
  alb = mix(alb, vec3(0.30, 0.32, 0.27), lic * 0.75 * (0.4 + 0.6 * fA));
  alb *= 0.6 + 0.4 * smoothstep(0.0, 0.5, y);
  // white wax bloom under each node (young culms) and fading up the internode
  float wax = band(dn + 0.034, 0.03, fw) * (0.35 + 0.65 * young);
  alb = mix(alb, vec3(0.36, 0.40, 0.34), wax * 0.5 + 0.12 * young * (1.0 - fs));
  // node ridge, the shadowed groove under it and the sheath scar above
  float ridge = band(dn - 0.004, 0.0032, fw);
  float groove = band(dn + 0.0015, 0.0018, fw);
  float scar = band(dn - 0.016, 0.0016, fw);
  // papery sheaths on the lower nodes of young culms
  float sh = 0.0;
  if (young > 0.0 && y < 0.6 + 1.6 * h.y) {
    float top = 0.45 + 0.25 * n1(ang * 5.0 + node * 3.1) + 0.12 * h11(node * 1.7 + h.x);
    if (h11(node * 3.3 + h.w * 11.0) < 0.6) sh = smoothstep(top + 0.02, top - 0.02, fs) * young;
  }
  vec3 shc = vec3(0.34, 0.27, 0.16) * (0.75 + 0.5 * vn(vec2(ang * 6.0, y * 9.0)));
  shc = mix(shc, vec3(0.08, 0.05, 0.03), smoothstep(0.64, 0.72, vn(vec2(ang * 9.0 + node, y * 18.0))) * 0.8 * fA);
  alb = mix(alb, shc, sh);
  alb *= 1.0 - 0.45 * groove + 0.30 * ridge - 0.25 * scar * (1.0 - sh);

  // lighting
  vec2 vh = normalize(RD.xz);
  float nz = sqrt(max(1.0 - nx * nx, 0.0));
  vec2 nxz = nx * vec2(vh.y, -vh.x) - nz * vh;
  vec3 N = vec3(nxz.x, 0.25 * ridge, nxz.y);
  float ndl = max(dot(N, LS), 0.0);
  vec3 P = vec3(cxz.x + nxz.x * r, y, cxz.y + nxz.y * r);
  float sv = sunVis(P) * SUNI;
  float ao = (0.45 + 0.55 * smoothstep(0.0, 3.0, y)) * mix(1.0, 0.70, smoothstep(2.5, 8.0, abs(dp)));
  ao *= 0.85 + 0.15 * smoothstep(4.0, 9.0, y);
  vec3 env = mix(vec3(0.20, 0.25, 0.17), vec3(0.36, 0.42, 0.30), 0.5 + 0.5 * dot(nxz, LSH));
  vec3 c = alb * (env * ao + SUNC * 3.4 * ndl * sv);
  // glossy skin: the bright mist and the sun reflect along the edges
  vec3 R = reflect(RDN, N);
  float cv = max(dot(-RDN, N), 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - cv, 5.0);
  float gloss = mix(0.50, 0.15, max(sh, lic));
  c += F * envRad(R) * gloss * ao;
  c += SUNC * SUNI * sv * pow(max(dot(R, LS), 0.0), 40.0) * F * 6.0;
  return c;
}

// ---------------------------------------------------------------- leaves
float leafW(float t) { return sqrt(sat(t * 5.0)) * pow(max(1.0 - t, 0.0), 0.9) * 1.25; }
vec3 leafLight(vec3 alb, float hi, vec3 P, float sv) {
  vec3 c = alb * mix(vec3(0.24, 0.30, 0.20), vec3(0.42, 0.48, 0.36), hi);
  // translucent leaves glow where the sun shines through them
  c += alb * SUNC * (0.35 + 3.2 * BACK) * sv * (0.5 + 0.8 * hi);
  // glossy leaves catch the bright sky now and then
  c += vec3(0.50, 0.58, 0.50) * 0.16 * smoothstep(0.84, 0.98, fract(hi * 7.3 + 0.08 * wav(0.4, hi * TAU)));
  return c;
}
// bamboo leaf sprays on a vertical sheet: twigs carrying fans of drooping leaves.
// W: (X, Y) on the sheet, fw: pixel footprint (m)
vec4 sprays(vec2 W, float fw, float dens, float seed, float Zs, float gs, float big) {
  float C = 0.40 * big;
  vec2 g = W / C;
  vec2 ic = floor(g);
  vec2 f = g - ic;
  vec2 o = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float sv = sunVis(vec3(W.x, W.y, Zs)) * SUNI;
  for (int k = 0; k < 4; k++) {
    vec2 cell = ic + vec2(float(k & 1), float(k >> 1)) * o;
    vec4 h = h42(cell + seed);
    if (h.w > dens) continue;
    vec2 O = (cell + 0.5 + 0.3 * (h.xy - 0.5)) * C;
    O.x += (0.04 * wav(0.21 + 0.1 * h.x, h.y * TAU) - 0.12 * gs) * (0.5 + h.z) * big;
    vec2 v = W - O;
    if (dot(v, v) > 0.05 * big * big) continue;
    // the twig: from up and to one side down to the spray
    float side = h.z < 0.5 ? -1.0 : 1.0;
    vec2 td = normalize(vec2(side * (0.5 + 0.4 * h.y), 1.0));
    float tu = dot(v, td);
    float tw = band(dot(v, vec2(-td.y, td.x)), 0.0028 * big, fw) * step(0.0, tu) * step(tu, 0.16 * big);
    if (tw > 0.0) {
      vec3 twc = vec3(0.12, 0.13, 0.06) * (vec3(0.22, 0.27, 0.19) + SUNC * 1.5 * sv);
      acc += T * tw * twc;
      T *= 1.0 - tw;
    }
    float base = -1.5708 + 1.2 * (h.z - 0.5);
    float nl = 4.0 + floor(h.x * 2.99);
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      if (fi >= nl) break;
      float hi = h11(h.x * 91.0 + fi * 7.7 + seed);
      float fl = 0.10 * wav(0.6 + 0.5 * hi, hi * TAU) * (1.0 + 3.0 * gs);
      float a = base + (fi - 0.5 * (nl - 1.0)) * 0.40 + 0.3 * (hi - 0.5) + fl;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 lv = v - dir * 0.012 * big;
      float Lf = (0.10 + 0.06 * hi) * big;
      float t = dot(lv, dir) / Lf;
      if (t < 0.0 || t > 1.0) continue;
      float w = dot(lv, vec2(-dir.y, dir.x)) - (hi - 0.5) * 0.5 * t * t * Lf;
      float hw = 0.0105 * big * (0.7 + 0.3 * hi) * leafW(t);
      float cov = band(w, hw, fw);
      if (cov <= 0.0) continue;
      vec3 alb = mix(vec3(0.09, 0.20, 0.030), vec3(0.22, 0.30, 0.045), hi);
      alb = mix(alb, vec3(0.36, 0.30, 0.10), step(0.94, hi));
      vec3 col = leafLight(alb, hi, vec3(W, Zs), sv);
      col *= 1.0 + 0.35 * band(w, 0.0008 * big, fw) - 0.25 * smoothstep(0.4, 1.0, abs(w) / max(hw, 1e-5)) * smoothstep(1.0, 0.3, fw / max(hw, 1e-5));
      acc += T * cov * col;
      T *= 1.0 - cov;
      if (T < 0.02) break;
    }
    if (T < 0.02) break;
  }
  return vec4(acc, 1.0 - T);
}
// a canopy sheet at depth Zs (part of a culm band); fogged from optical depth t0
vec4 canopy(float Zs, float seed, float t0) {
  if (Zs > ZG) return vec4(0.0);
  float X = CAM.x + KX * Zs, Y = CAM.y + KY * Zs;
  float hb = 5.6 + 1.8 * n1(X * 0.35 + seed) + 0.04 * Zs;
  if (Y < hb - 0.5) return vec4(0.0);
  float d = abs(X - pathX(Zs));
  // the corridor stays open overhead, narrowing a little with height
  float open = CORR - 0.7 - 0.10 * (Y - hb) + 0.6 * (n1(Y * 1.1 + seed) - 0.5);
  float dens = smoothstep(open - 0.3, open + 0.5, d) * smoothstep(hb - 0.5, hb + 0.8, Y);
  dens *= 0.55 + 0.45 * smoothstep(0.25, 0.55, vn(vec2(X, Y) * 0.6 + seed));
  if (dens <= 0.02) return vec4(0.0);
  float fw = PX * Zs / RD.z;
  float gs = gustAt(X) * (0.5 + 0.5 * wav(0.6, X));
  vec2 W = vec2(X - sq(Y / 16.0) * (0.25 * wav(0.12, X * 0.3 + seed) - 0.5 * gs), Y);
  vec4 c = sprays(W, fw, dens, seed, Zs, gs, 1.0);
  if (c.a <= 0.0) return c;
  return vec4(fogApply(c.rgb / c.a, t0, Zs), 1.0) * c.a;
}

// Culms in rows of depth dz between depths za and zb, front to back, with up to three
// canopy sheets (depths sz, 0 = none) in between. t0: optical depth the fog starts from.
vec4 culmRows(float za, float zb, float dz, float t0, vec3 sz, float seed) {
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float ja = floor(za / dz + 0.01);
  float jend = min(floor(zb / dz + 0.01), floor(ZG / dz) + 1.0);
  int si = 0;
  float fwk = PX / RD.z;
  for (int i = 0; i < 24; i++) {
    float j = ja + float(i);
    if (j >= jend) break;
    float zr = (j + 0.5) * dz;
    // canopy sheet whose depth we've just passed
    float szc = si == 0 ? sz.x : (si == 1 ? sz.y : sz.z);
    if (szc > 0.0 && szc < zr) {
      vec4 cs = canopy(szc, seed + float(si) * 13.0, t0);
      acc += T * cs.rgb;
      T *= 1.0 - cs.a;
      si++;
      if (T < 0.01) break;
    }
    float xr = CAM.x + KX * zr;
    if (abs(xr - pathX(zr)) < CORR - 1.2) continue;
    vec2 rp = rowP(j, seed);
    float c0 = floor((xr + rp.y) / rp.x);
    // three candidates, nearest first
    vec4 hA = cellH(c0 - 1.0, j, seed), hB = cellH(c0, j, seed), hC = cellH(c0 + 1.0, j, seed);
    vec3 cz = (j + 0.5 + 0.6 * (vec3(hA.y, hB.y, hC.y) - 0.5)) * dz;
    vec3 ci = vec3(c0 - 1.0, c0, c0 + 1.0);
    if (cz.y < cz.x) { cz.xy = cz.yx; ci.xy = ci.yx; vec4 t = hA; hA = hB; hB = t; }
    if (cz.z < cz.y) { cz.yz = cz.zy; ci.yz = ci.zy; vec4 t = hB; hB = hC; hC = t; }
    if (cz.y < cz.x) { cz.xy = cz.yx; ci.xy = ci.yx; vec4 t = hA; hA = hB; hB = t; }
    for (int k = 0; k < 3; k++) {
      float zc = k == 0 ? cz.x : (k == 1 ? cz.y : cz.z);
      vec4 h = k == 0 ? hA : (k == 1 ? hB : hC);
      if (zc > ZG || h.w > 0.88) continue;
      float c = k == 0 ? ci.x : (k == 1 ? ci.y : ci.z);
      float xc = (c + 0.5 + 0.56 * (h.x - 0.5)) * rp.x - rp.y;
      float xray = CAM.x + KX * zc;
      float yr = CAM.y + KY * zc;
      // cheap reject: farther than any lean, bend and sway could carry it
      if (abs(xray - xc) > 0.12 + yr * (0.022 + 0.0016 * yr) + 0.95 * sq(yr / 12.5)) continue;
      float dp = xc - pathX(zc);
      if (abs(dp) < CORR + 0.4 * fract(h.z * 7.31)) continue;
      vec4 h2 = h42(vec2(c, j) + seed * 0.37 + 11.3);
      float hgt = 12.5 + 7.0 * h2.w;
      if (yr > hgt) continue;
      float r = (0.040 + 0.042 * h.z) * mix(1.0, 0.55, smoothstep(0.55 * hgt, hgt, yr));
      r *= 1.0 + 0.16 * exp(-max(yr, 0.0) / 0.22);
      float sg = sign(dp);
      float xs = xc + (0.024 * (h2.y - 0.5) - 0.008 * sg) * yr - 0.0016 * sg * yr * yr + swayX(xc, yr, hgt, h2);
      float dperp = (xray - xs) * CW;
      float fw = fwk * zc;
      float cov = band(dperp, r * 1.03, fw);
      if (cov <= 0.0) continue;
      float nx = clamp(dperp / r, -1.0, 1.0);
      float zh = zc - r * sqrt(max(1.0 - nx * nx, 0.0)) * CW;
      float yh = CAM.y + KY * zh;
      vec3 col = culmShade(nx, yh, vec2(xc, zc), h, h2, fw, dp, r);
      col = fogApply(col, t0, zc);
      acc += T * cov * col;
      T *= 1.0 - cov;
    }
    if (T < 0.01) break;
  }
  // remaining sheets behind the last row
  if (T > 0.01 && si < 3) {
    float szc = si == 0 ? sz.x : (si == 1 ? sz.y : sz.z);
    if (szc > 0.0) {
      vec4 cs = canopy(szc, seed + float(si) * 13.0, t0);
      acc += T * cs.rgb;
      T *= 1.0 - cs.a;
    }
  }
  return vec4(acc, 1.0 - T);
}

// distance from ground point (x, z) to the nearest culm foot (for contact shading)
float footDist(float x, float z) {
  float dz = z < ZM ? 0.9 : 1.35;
  float seed = z < ZS ? 0.0 : (z < ZM ? 2.0 : 5.0);
  float best = 9.0;
  float j0 = floor(z / dz);
  for (int jj = -1; jj <= 1; jj++) {
    float j = j0 + float(jj);
    vec2 rp = rowP(j, seed);
    float u = (x + rp.y) / rp.x;
    float c0 = floor(u);
    for (int k = 0; k < 2; k++) {
      float c = c0 + (k == 0 ? 0.0 : (fract(u) < 0.5 ? -1.0 : 1.0));
      vec4 h = cellH(c, j, seed);
      if (h.w > 0.88) continue;
      float xc = (c + 0.5 + 0.56 * (h.x - 0.5)) * rp.x - rp.y;
      float zc = (j + 0.5 + 0.6 * (h.y - 0.5)) * dz;
      if (abs(xc - pathX(zc)) < CORR + 0.4 * fract(h.z * 7.31)) continue;
      best = min(best, length(vec2(x - xc, z - zc)) - (0.040 + 0.042 * h.z) * 1.16);
    }
  }
  return best;
}

// ---------------------------------------------------------------- layers
// 0: the misty depths: the far grove (~70 m) dissolved in mist, sky glow over the canopy
vec4 bgLin(vec2 p) {
  float ZF = 70.0;
  float tf = tauAt(ZF);
  float Tf = exp(TZS - tf);
  float X = CAM.x + KX * ZF, Y = CAM.y + KY * ZF;
  float fwv = PX * ZF / RD.z;
  float stems = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cw = 0.55 + 0.2 * fi;
    float u = (X + fi * 3.7) / cw;
    float ci = floor(u);
    vec4 h = h42(vec2(ci, fi + 50.0));
    float xc = (ci + 0.5 + 0.5 * (h.x - 0.5)) * cw;
    stems = max(stems, band(X + fi * 3.7 - xc, 0.06 + 0.04 * h.y, fwv) * step(h.z, 0.7) * (0.5 + 0.5 * h.w));
  }
  float cano = smoothstep(9.0, 14.0, Y + 3.0 * vn(vec2(X * 0.2, Y * 0.3))) * (1.0 - smoothstep(19.0, 26.0, Y + 4.0 * vn(vec2(X * 0.13, 4.0))));
  vec3 far = mix(vec3(0.16, 0.21, 0.12), vec3(0.15, 0.20, 0.09), cano);
  float wall = max(stems * 0.75, cano * 0.85);
  float dpx = abs(X - pathX(ZF));
  wall *= 1.0 - 0.6 * smoothstep(3.0, 1.5, dpx) * smoothstep(12.0, 4.0, Y);
  vec3 skyc = MISTC * 1.12 + SUNC * SUNI * 0.22;
  vec3 c = mix(skyc, far, wall);
  c = c * Tf + inscat(TZS, tf);
  return vec4(c, 1.0);
}

// 1: forest floor: flagstone path with mossy joints and gravel borders, leaf litter and
// moss between the culms
vec4 groundLin(vec2 p) {
  if (ZG > 1e4) return vec4(0.0);
  float Z = ZG;
  float X = CAM.x + KX * Z;
  float fwx = PX * Z / RD.z;
  float fwz = fwx * Z / CAM.y;
  float d = X - pathX(Z);
  float ad = abs(d);
  float en = vn(vec2(Z * 1.1, d > 0.0 ? 3.0 : 9.0));
  float pw = 1.22 + 0.10 * (en - 0.5);
  float pm = 1.0 - smoothstep(pw - 0.04 - fwx, pw + 0.04 + fwx, ad);
  vec2 w = vec2(X, Z);
  vec3 alb;
  float wet = 0.0;
  // --- flagstones: irregular cells, rounded edges, moss in the joints
  float sw = pw - 0.22 - 0.06 * en;
  vec3 path = vec3(0.0);
  if (pm > 0.0) {
    vec2 g = w / vec2(0.46, 0.40);
    vec2 gi = floor(g), gf = fract(g);
    float d1 = 9.0, d2 = 9.0;
    vec2 c1 = vec2(0.0), c2 = vec2(0.0), id = vec2(0.0);
    for (int yy = -1; yy <= 1; yy++) {
      for (int xx = -1; xx <= 1; xx++) {
        vec2 o = vec2(float(xx), float(yy));
        vec2 c = o + 0.2 + 0.6 * h42(gi + o + 17.0).xy;
        float dd = dot(c - gf, c - gf);
        if (dd < d1) { d2 = d1; c2 = c1; d1 = dd; c1 = c; id = gi + o; }
        else if (dd < d2) { d2 = dd; c2 = c; }
      }
    }
    vec2 nrm = normalize((c2 - c1) * vec2(0.46, 0.40));
    float e = dot(0.5 * (c1 + c2) - gf, normalize(c2 - c1)) * (0.46 * abs(nrm.x) + 0.40 * abs(nrm.y));
    float fwe = abs(nrm.x) * fwx + abs(nrm.y) * fwz + 1e-4;
    float joint = 1.0 - sat((e - 0.012 + 0.5 * fwe) / fwe);
    float bevel = smoothstep(0.06, 0.012, e) * smoothstep(1.2, 0.3, fwe / 0.03);
    vec4 sh = h42(id + 5.0);
    vec3 stone = mix(vec3(0.33, 0.32, 0.29), vec3(0.36, 0.31, 0.25), sh.x) * (0.78 + 0.35 * sh.y);
    stone *= 0.85 + 0.3 * vn(w * 9.0 + sh.zw * 40.0) * smoothstep(1.5, 0.4, fwz / 0.11);
    stone = mix(stone, vec3(0.20, 0.27, 0.12), smoothstep(0.62, 0.8, vn(w * 4.0 + sh.xy * 9.0)) * 0.5);
    stone *= 1.0 - 0.22 * bevel;
    vec3 jc = mix(vec3(0.06, 0.13, 0.025), vec3(0.08, 0.07, 0.05), smoothstep(0.4, 0.6, vn(w * 6.0)));
    vec3 flags = mix(stone, jc, joint);
    wet = (1.0 - joint) * (0.5 + 0.5 * sh.z);
    // fine gravel border between the stones and the moss
    float gb = smoothstep(sw - 0.03, sw + 0.03, ad);
    vec3 grav = vec3(0.30, 0.28, 0.24) * (0.8 + 0.4 * vn(w * 30.0) * smoothstep(1.0, 0.3, fwz / 0.04));
    path = mix(flags, grav, gb);
    wet *= 1.0 - gb;
  }
  // --- outside: dry bamboo leaf litter, moss, dark soil
  vec3 outc = vec3(0.0);
  float fd = 9.0;
  if (pm < 1.0) {
    vec3 lit = mix(vec3(0.22, 0.15, 0.07), vec3(0.34, 0.26, 0.11), vn(w * 2.5));
    lit *= 0.7 + 0.5 * vn(w * 0.7 + 3.0);
    float lodL = smoothstep(1.2, 0.35, fwz / 0.09);
    if (lodL > 0.0) {
      for (int l = 0; l < 2; l++) {
        vec2 lw = w * (1.0 + 0.3 * float(l)) + float(l) * 3.7;
        vec2 li = floor(lw / 0.09);
        vec4 lh = h42(li + 3.0 + float(l) * 19.0);
        float la = lh.x * 3.14159;
        vec2 lv = lw - (li + 0.5 + 0.4 * (lh.yz - 0.5)) * 0.09;
        lv = mat2(cos(la), sin(la), -sin(la), cos(la)) * lv;
        float t = lv.x / 0.075 + 0.5;
        float lfw = mix(fwx, fwz, abs(cos(la))) * (1.0 + 0.3 * float(l));
        float leaf = band(lv.y, 0.011 * leafW(t), lfw) * step(0.0, t) * step(t, 1.0);
        vec3 lc = lh.w < 0.45 ? vec3(0.40, 0.30, 0.13) : (lh.w < 0.8 ? vec3(0.28, 0.19, 0.08) : vec3(0.16, 0.11, 0.05));
        lit = mix(lit, lc * (0.8 + 0.4 * lh.y), leaf * lodL);
      }
    }
    float mz = vn(w * 0.55 + 4.0) * 0.65 + vn(w * 2.2) * 0.35;
    float moss = smoothstep(0.52, 0.68, mz + 0.35 * smoothstep(pw + 0.55, pw + 0.05, ad));
    vec3 mossc = mix(vec3(0.05, 0.13, 0.02), vec3(0.12, 0.21, 0.03), vn(w * 5.0));
    mossc *= 0.85 + 0.3 * vn(w * 25.0) * smoothstep(1.0, 0.3, fwz / 0.03);
    outc = mix(lit, mossc, moss);
    // culm feet: damp dark soil and a ring of moss
    if (Z < 30.0) {
      fd = footDist(X, Z);
      outc = mix(outc, mossc * 0.7, smoothstep(0.25, 0.04, fd) * 0.6);
    }
  }
  alb = mix(outc, path, pm);
  // light: open sky over the path, deep shade among the culms
  float sv = sunVis(vec3(X, 0.0, Z)) * SUNI * mix(0.35, 1.0, pm);
  float ao = mix(0.55, 1.0, pm) * (1.0 - 0.25 * smoothstep(pw + 0.2, pw + 3.0, ad));
  ao *= 0.35 + 0.65 * smoothstep(0.0, 0.35, fd);
  vec3 c = alb * (vec3(0.42, 0.48, 0.36) * ao + SUNC * 3.0 * LS.y * sv * (0.4 + 0.6 * smoothstep(0.0, 0.3, fd)));
  // dewy stones mirror the bright end of the corridor
  float cosv = max(-RDN.y, 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  c += F * envRad(reflect(RDN, vec3(0.0, 1.0, 0.0))) * pm * (0.10 + 0.25 * wet);
  float t0 = Z > ZS ? TZS : tauAt(Z);
  c = fogApply(c, t0, Z);
  return vec4(c, 1.0);
}

// 2: far culms (16 - 36 m) and the high canopy
vec4 farLin(vec2 p) { return culmRows(ZM, 36.0, 1.35, TZS, vec3(18.0, 23.5, 30.0), 5.0); }
// 3: the grove (7 - 16 m)
vec4 midLin(vec2 p) { return culmRows(ZS, ZM, 0.9, TZS, vec3(10.4, 13.8, 0.0), 2.0); }

// 4: mist and sun shafts between the camera and the grove, with dust motes in the beams
vec4 mistLin(vec2 p) {
  float z1 = min(ZS, ZG);
  float t1 = z1 >= ZS ? TZS : tauAt(z1);
  vec4 res = vec4(inscat(0.0, t1), 1.0 - exp(-t1));
  // dust and pollen drifting in the light (emissive: adds light, no coverage)
  vec2 q = p + u_par * (0.6 * PK);
  float bm = shafts(q, 1.0, 26.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float cs = 0.05 + 0.04 * fi;
    vec2 w = q + vec2(drift(-6.0 + 2.0 * fi) * cs * 8.0, drift(4.0 - fi) * cs * 8.0);
    w += 0.012 * vec2(wav(0.05 + 0.02 * fi, fi), wav(0.04, fi * 3.0));
    vec2 ci = floor(w / cs);
    vec2 cf = w / cs - ci;
    vec4 h = h42(ci + fi * 31.0);
    if (h.z > 0.45) continue;
    vec2 c = 0.5 + 0.6 * (h.xy - 0.5) + 0.12 * vec2(wav(0.07 + 0.05 * h.w, h.x * TAU), wav(0.06 + 0.04 * h.z, h.y * TAU));
    float rad = (0.0007 + 0.0009 * h.w) * (1.0 + 0.6 * fi);
    float sig = max(rad, 0.6 * PX);
    float m = exp(-0.5 * sq(length((cf - c) * cs) / sig)) * sq(rad / sig);
    float tw = 0.55 + 0.45 * wav(0.3 + 0.4 * h.x, h.w * TAU);
    res.rgb += SUNC * SUNI * 1.6 * tw * (0.08 + 0.92 * bm) * m;
  }
  return res;
}

// 5: low yotsume-gaki fences along both sides of the path
vec4 fenceLin(vec2 p) {
  if (KY >= -1e-4) return vec4(0.0);
  float zlo = max((CAM.y - 1.0) / -KY, 0.5);
  float zhi = min(ZG, 140.0);
  if (zlo >= zhi) return vec4(0.0);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float fwk = PX / RD.z;
  for (int side = 0; side < 2; side++) {
    float sg = side == 0 ? -1.0 : 1.0;
    // first crossing of the fence line within [zlo, zhi]: march in 1/z, then bisect
    float ia = 1.0 / zlo, ib = 1.0 / zhi;
    float za = zlo;
    float fa = CAM.x + KX * za - pathX(za) - sg * FW;
    float zb = za;
    bool hit = false;
    for (int i = 1; i <= 7; i++) {
      zb = 1.0 / mix(ia, ib, float(i) / 7.0);
      float fb = CAM.x + KX * zb - pathX(zb) - sg * FW;
      if (sign(fb) != sign(fa)) { hit = true; break; }
      za = zb; fa = fb;
    }
    if (!hit) continue;
    for (int i = 0; i < 6; i++) {
      float zm = 0.5 * (za + zb);
      float fm = CAM.x + KX * zm - pathX(zm) - sg * FW;
      if (sign(fm) == sign(fa)) { za = zm; fa = fm; } else zb = zm;
    }
    float fb = CAM.x + KX * zb - pathX(zb) - sg * FW;
    float Z = za - fa * (zb - za) / (fb - fa);
    float Y = CAM.y + KY * Z;
    float fwy = fwk * Z;
    float fws = clamp(fwk * Z / max(abs(KX - pathD(Z)), 0.02), fwy, 3.0);
    float s = Z + 3.7 * sg;
    // rails, vertical poles and posts
    float rl = 0.0, rlc = 0.0;
    for (int k = 0; k < 3; k++) {
      float ry = 0.24 + 0.30 * float(k);
      float b = band(Y - ry, 0.018, fwy);
      if (b > rl) { rl = b; rlc = (Y - ry) / 0.018; }
    }
    float pole = pulse(s, 0.27, 0.022, fws) * band(Y - 0.46, 0.46, fwy);
    float post = pulse(s + 0.135, 2.16, 0.06, fws) * band(Y - 0.49, 0.49, fwy);
    vec3 bam = vec3(0.32, 0.27, 0.15) * (0.75 + 0.45 * h11(floor(s / 0.27 + 0.5) + sg * 7.0));
    vec3 pst = vec3(0.17, 0.13, 0.08);
    float sv = sunVis(vec3(CAM.x + KX * Z, Y, Z)) * SUNI;
    vec3 L = vec3(0.40, 0.46, 0.34) + SUNC * 1.1 * sv;
    // rail: lit from above, darker below
    vec3 railc = vec3(0.34, 0.29, 0.16) * L * (0.70 + 0.50 * clamp(rlc * 0.8 + 0.3, 0.0, 1.0));
    vec3 polec = bam * L * 0.85;
    vec3 postc = pst * L;
    // ties: black palm-fibre rope where rails cross the poles
    float tie = rl * pulse(s, 0.27, 0.03, fws) * 0.85;
    railc = mix(railc, vec3(0.02, 0.018, 0.015), tie);
    vec3 col = railc * rl;
    float cov = rl;
    col += (1.0 - cov) * polec * pole;
    cov += (1.0 - cov) * pole;
    col += (1.0 - cov) * postc * post;
    cov += (1.0 - cov) * post;
    if (cov <= 0.0) continue;
    col = fogApply(col / cov, 0.0, Z) * cov;
    acc += T * col;
    T *= 1.0 - cov;
  }
  return vec4(acc, 1.0 - T);
}

// 6: near culms (2 - 7 m) and low sprays of leaves reaching into the top corners
vec4 nearLin(vec2 p) {
  vec4 c = culmRows(1.8, ZS, 0.9, 0.0, vec3(0.0), 0.0);
  if (c.a < 0.99 && p.y > 0.70 && abs(p.x) > 0.25) {
    for (int i = 0; i < 2; i++) {
      float Zs = i == 0 ? 3.9 : 4.8;
      float X = CAM.x + KX * Zs, Y = CAM.y + KY * Zs;
      float side = sign(X - pathX(Zs));
      float dx = (X - pathX(Zs)) * side;
      float dens = smoothstep(0.7, 1.5, dx) * smoothstep(2.7, 3.3, Y + 0.6 * n1(X * 1.5 + float(i) * 7.0));
      dens *= smoothstep(0.30, 0.55, vn(vec2(X * 0.8, Y * 0.8) + float(i) * 5.0 + side * 3.0));
      if (dens <= 0.02) continue;
      float fw = PX * Zs / RD.z;
      float gs = gustAt(X) * (0.5 + 0.5 * wav(0.7, X));
      vec4 s = sprays(vec2(X, Y), fw, dens, 70.0 + float(i) * 9.0, Zs, gs, 1.15);
      if (s.a <= 0.0) continue;
      vec3 col = fogApply(s.rgb / s.a, 0.0, Zs) * s.a;
      c.rgb += (1.0 - c.a) * col;
      c.a += (1.0 - c.a) * s.a;
    }
  }
  return c;
}

// 7: dry leaves fluttering down (a flurry when the gust passes)
vec4 fallLeaves(vec2 q, float cs, float sz, float K, float seed, float dens) {
  vec2 qq = q + vec2(-drift(16.0) * cs, drift(K) * 12.0 * cs);
  vec2 ci = floor(qq / cs);
  vec2 cf = qq / cs - ci;
  vec4 h = h42(mod(ci, vec2(16.0, 12.0)) + seed);
  if (h.z > dens) return vec4(0.0);
  vec4 h2 = h42(mod(ci, vec2(16.0, 12.0)) + seed + 9.0);
  float sw = wav(0.18 + 0.15 * h2.x, h2.y * TAU);
  vec2 d = (cf - vec2(0.5 + (h.x - 0.5) * 0.3 + 0.18 * sw, 0.5 + (h.y - 0.5) * 0.3)) * cs / sz;
  if (dot(d, d) > 1.3) return vec4(0.0);
  float roll = sw * 1.1 + h2.z * TAU;
  float flip = wav(0.3 + 0.4 * h2.w, h.w * TAU);
  d = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * d;
  float fl = max(abs(flip), 0.1);
  float t = d.y * 0.5 + 0.5;
  if (t < 0.0 || t > 1.0) return vec4(0.0);
  float hw = 0.13 * leafW(t) / 1.25 * fl;
  float m = band(d.x, hw, 1.5 * PX / sz);
  if (m <= 0.0) return vec4(0.0);
  vec3 alb = h.w < 0.6 ? mix(vec3(0.46, 0.36, 0.13), vec3(0.56, 0.46, 0.18), h2.x) : (h.w < 0.85 ? vec3(0.36, 0.25, 0.09) : vec3(0.26, 0.34, 0.07));
  float face = abs(flip);
  vec3 col = alb * (vec3(0.40, 0.46, 0.35) + SUNC * SUNI * (0.3 + 1.6 * BACK) * face * face) * (flip > 0.0 ? 1.0 : 0.75);
  col *= 1.0 - 0.3 * band(d.x, 0.006, 1.5 * PX / sz) * face;
  return vec4(col, 1.0) * m;
}
vec4 leavesLin(vec2 p) {
  float g = max(gustAt(0.0), gustAt(-6.0));
  vec4 acc = vec4(0.0);
  acc = over(acc, fallLeaves(p + u_par * (0.7 * PK), 0.11, 0.0075, 40.0, 11.0, 0.04 + 0.30 * g));
  acc = over(acc, fallLeaves(p + u_par * (1.0 * PK), 0.19, 0.012, 32.0, 23.0, 0.04 + 0.30 * g));
  acc = over(acc, fallLeaves(p + u_par * (1.3 * PK), 0.31, 0.020, 24.0, 37.0, 0.03 + 0.22 * g));
  return acc;
}

// ---------------------------------------------------------------- output
vec3 toDisp(vec3 c) {
  c *= 0.95 * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  return c;
}
vec4 finish(vec4 v) {
  if (v.a <= 0.0) return vec4(0.0);
  return vec4(toDisp(v.rgb / v.a) * v.a, v.a);
}
vec4 layerLin(int k, vec2 p) {
  if (k == 0) return bgLin(p);
  if (k == 1) return groundLin(p);
  if (k == 2) return farLin(p);
  if (k == 3) return midLin(p);
  if (k == 4) return mistLin(p);
  if (k == 5) return fenceLin(p);
  if (k == 6) return nearLin(p);
  return leavesLin(p);
}

void main() {
  TM = mod(u_time, LOOP);
  PX = 1.0 / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.9);
  VIG = 1.0 - 0.22 * smoothstep(0.12, 0.65, dot(vq, vq) * 1.6);
  GPH = mod(TM, 120.0);
  GSTR = 0.75 + 0.25 * h11(floor(TM / 120.0) + 3.0);
  float sp = mod(TM + 140.0, 200.0);
  float sb = sp < 34.0 ? sq(sin(3.14159 * sp / 34.0)) : 0.0;
  SUNI = 1.0 + 0.55 * sb;
  FOGK = 1.0 - 0.30 * sb;

  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  CAM = vec3(u_par.x * 0.07, CAMH + u_par.y * 0.045, 0.0);
  float cp = cos(PITCH), spi = sin(PITCH);
  vec3 d = vec3(p.x, p.y - 0.5, FOC);
  RD = vec3(d.x, d.y * cp + d.z * spi, -d.y * spi + d.z * cp);
  RDN = normalize(RD);
  KX = RD.x / RD.z;
  KY = RD.y / RD.z;
  RM = length(RD) / RD.z;
  CW = RD.z / length(RD.xz);
  ZG = KY < -1e-5 ? CAM.y / -KY : 1e5;
  E0 = exp(-CAM.y / FH);

  LS = normalize(vec3(0.50, 0.50, 0.78));
  LSH = normalize(LS.xz);
  PERP = vec2(LSH.y, -LSH.x);
  vec3 ls = vec3(LS.x, LS.y * cp - LS.z * spi, LS.y * spi + LS.z * cp);
  SUNS = vec2(ls.x / ls.z * FOC, 0.5 + ls.y / ls.z * FOC);
  BACK = pow(max(dot(RDN, LS), 0.0), 3.0);

  // patchy low mist drifting through the grove (sampled where the ray is 12 m out)
  vec2 wq = vec2(CAM.x + KX * 12.0, CAM.y + KY * 12.0);
  WISP = 0.55 + 0.9 * vn(vec2(wq.x * 0.30 - drift(14.0), wq.y * 1.4)) * (0.7 + 0.3 * vn(vec2(wq.x * 0.9 + drift(9.0), wq.y * 3.0)));

  // in-scatter along this ray: luminous ambient mist, forward-scattered sun, shafts
  float hg = hgPhase(dot(RDN, LS));
  vec2 vp = vec2(-0.03, 0.44);
  vec2 dv = (p - vp) * vec2(1.0, 1.5);
  float vg = exp(-dot(dv, dv) / 0.07);
  LAMB = MISTC * (1.0 + 0.40 * vg) + SUNC * SUNI * 0.05 * hg;
  vec2 q1 = p + u_par * (0.45 * PK), q2 = p + u_par * (0.2 * PK);
  LB1 = SUNC * SUNI * (0.25 + 0.12 * hg) * shafts(q1, 1.0, 26.0) * 1.3;
  LB2 = SUNC * SUNI * (0.25 + 0.12 * hg) * shafts(q2, 4.0, 41.0) * 1.0;
  TZS = tauAt(ZS);
  TB0 = tauAt(2.5);
  TB1 = tauAt(13.0);
  TB2 = tauAt(48.0);

  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  if (u_layer >= 0.0) {
    vec4 c = finish(layerLin(int(u_layer + 0.5), p));
    fragColor = vec4(c.rgb + dith * c.a, c.a);
    return;
  }
  // front-to-back with early-out once opaque (identical to back-to-front "over")
  vec4 acc = finish(leavesLin(p));
  acc += (1.0 - acc.a) * finish(nearLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(fenceLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(mistLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(midLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(farLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(groundLin(p));
  if (acc.a < 0.999) acc += (1.0 - acc.a) * finish(bgLin(p));
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4) + dith, 1.0);
}
`,
}
