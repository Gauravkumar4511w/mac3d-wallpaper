// Turquoise Bay: a tropical bay in bright afternoon sun.
// A deep tropical sky with drifting cumulus, hazy karst islands and a jungle
// headland; a lagoon of crystal-clear water over white coral sand (refraction,
// wavelength-dependent absorption, dancing caustics, seagrass and coral
// patches) that drops off past a surf-lined reef into deep blue; soft breakers,
// a swash with foam lace and glossy wet sand; coconut palms swaying in the trade
// wind with their shadows on the sand; cloud shadows sliding over the sea, a
// sailboat crossing beyond the reef and gliding seabirds.
//
// Every layer is lit in linear light and tone-mapped on its own (ACES fit), so
// the full scene is the back-to-front "over" composite of the isolated layers.
// Every periodic phase is quantised to the master loop (LOOP; cloud drift to
// CLOOP), so u_time can grow forever without precision loss or pops.

// Frond tables for the two palms: (dir.x, dir.y, length, wind response) and
// (gravity bend.x, .y, sin phase, cos phase); reach = crown radius in frond lengths.
function fronds(seed, a0, side) {
  let st = seed
  const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647
  const sm = (x) => { const t = Math.min(Math.max((x - 0.1) / 0.8, 0), 1); return t * t * (3 - 2 * t) }
  const f0 = [], f1 = [], f2 = [], box = [0, 0, 0, 0]
  for (let i = 0; i < 14; i++) {
    const ang = (Math.PI * 2 * (i + 0.4 * rnd())) / 14 + a0
    const dx = Math.cos(ang), dy = Math.sin(ang)
    const len = (0.78 + 0.3 * rnd()) * (1 - 0.5 * sm(side * dx))   // fronds reaching into the frame are seen end-on
    const dr = 0.72 + 0.32 * rnd(), w = 0.7 + 0.6 * rnd(), ph = rnd() * Math.PI * 2
    const px = dy * dx, py = -1 + dy * dy, pm = Math.hypot(px, py)
    const k = (dr * (dy > 0 ? 0.5 + 0.22 * pm : 0.72 * pm)) / Math.max(pm, 1e-3)
    const gx = px * k, gy = py * k
    f0.push([dx, dy, len, w])
    f1.push([gx, gy, Math.sin(ph), Math.cos(ph)])
    // static bounding circle (frond-length units from the crown): chord, bow, leaflets, wind and sway
    const tx = dx + gx - 0.1 * w, ty = dy + gy
    const r = len * (0.5 * Math.hypot(tx, ty) + 0.25 * Math.hypot(gx, gy) + 0.27 + 0.1 * w + 0.08) + 0.06
    const cx = 0.05 * dx + 0.5 * len * tx, cy = 0.05 * dy + 0.5 * len * ty
    f2.push([cx, cy, r, 0])
    box[0] = Math.min(box[0], cx - r); box[1] = Math.min(box[1], cy - r)
    box[2] = Math.max(box[2], cx + r); box[3] = Math.max(box[3], cy + r)
  }
  const ord = [0, 2, 4, 6, 8, 10, 12, 1, 3, 5, 7, 9, 11, 13]   // back half first, then the front half
  const arr = (a) => `vec4[14](${ord.map((i) => `vec4(${a[i].map((x) => x.toFixed(5)).join(', ')})`).join(', ')})`
  return { f0: arr(f0), f1: arr(f1), f2: arr(f2), box: `vec4(${box.map((x) => (x + Math.sign(x) * 0.05).toFixed(3)).join(', ')})` }
}
const PALM_A = fronds(48271, 0.9, 1)
const PALM_B = fronds(91253, 2.3, -1)

export default {
  id: 'turquoisebay',
  name: 'Turquoise Bay',
  tag: 'Tropical sea',
  accent: '#16bfc0',
  accent2: '#ffb45e',
  ink: '#0a5762',
  glow: '#b4f8ef',
  light: true,
  clockColor: '#0b2c3c',
  sky: 'linear-gradient(180deg,#2a5fb4 0%,#4d86d2 26%,#9fc2e8 44%,#d3e4f2 48%,#1f5f98 49%,#2b9fb6 53%,#4fcbcc 60%,#9be2da 74%,#e6decb 80%,#efe7d6 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Karst islands', depth: 0.06 },
    { name: 'Jungle headland', depth: 0.14 },
    { name: 'Reef and open sea', depth: 0.22 },
    { name: 'Sailboats', depth: 0.26 },
    { name: 'Lagoon and beach', depth: 0.7 },
    { name: 'Coconut palms', depth: 1.05 },
    { name: 'Seabirds', depth: 1.25 },
  ],
  clockAfter: 4,
  stillTime: 140,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float YH = 0.52;       // horizon height on screen
const float FOC = 1.35;      // focal length in screen heights
const float CAMH = 4.5;      // eye height above the still water (m)
const float LOOP = 1440.0;   // master loop (s)
const float CLOOP = 2880.0;  // cloud drift loop (s)
const float PB = 9.0;        // breaker period (s)
const float NB = 160.0;      // LOOP / PB
const float KB = 0.62;       // breaker spacing constant
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float ZSPLIT = 110.0;  // lagoon / open sea layer split (m)
const float ZMARCH = 45.0;   // ray-marched surf zone limit (m)
const vec3 SUN = vec3(-0.70533, 0.66601, -0.24489);   // high on the left, a little behind the viewer
const vec3 LS = vec3(-0.70533, 0.66601, 0.24489);     // the same in the screen frame (z toward the viewer)
const vec3 SUNC = vec3(1.0, 0.95, 0.87);
const float ES = 2.6;                      // direct sun
const vec3 AMB = vec3(0.25, 0.36, 0.56);   // skylight
const float EXPO = 0.8;
const vec3 SA = vec3(0.42, 0.072, 0.05);   // water absorption (1/m)
const vec3 WLAG = vec3(0.012, 0.13, 0.165); // lagoon in-scatter (milky turquoise)
const vec3 WSEA = vec3(0.004, 0.03, 0.095); // open ocean in-scatter (deep blue)
// palms: billboards at depth PZ (m); trunk Bezier root, bend, crown (screen units)
const vec2 PA0 = vec2(-0.83, 0.0527), PA1 = vec2(-0.80, 0.46), PA2 = vec2(-0.61, 0.87);
const vec2 PB0 = vec2(0.70, 0.1403), PB1 = vec2(0.715, 0.48), PB2 = vec2(0.86, 0.83);
const float PZA = 13.0, PZB = 16.0;

float Tw;    // wrapped time (LOOP)
float Tc;    // wrapped time (CLOOP)
float PX;    // one pixel in screen-height units
float VIG;   // vignette
float WIND;  // trade-wind strength with gusts
float FLUT;  // leaflet flutter

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
float vnoiseP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(x0, i.y)), h12(vec2(x1, i.y)), u.x), mix(h12(vec2(x0, i.y + 1.0)), h12(vec2(x1, i.y + 1.0)), u.x), u.y);
}
// gradient noise periodic in x, with its analytic gradient: (value, d/dx, d/dy)
vec3 gnPD(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  vec2 ga = h22(vec2(x0, i.y)) * 2.0 - 1.0, gb = h22(vec2(x1, i.y)) * 2.0 - 1.0;
  vec2 gc = h22(vec2(x0, i.y + 1.0)) * 2.0 - 1.0, gd = h22(vec2(x1, i.y + 1.0)) * 2.0 - 1.0;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - 1.0);
  float k = va - vb - vc + vd;
  return vec3(va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
              ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (vec2(vb - va, vc - va) + u.yx * k));
}
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
// x-periodic fbm: a shear keeps every octave periodic (period doubles per octave)
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
// billowy (|gradient noise|) x-periodic fbm: rounded lobes with sharp creases.
// Returns (value, relief gradient). The gradient weights the fine octaves down,
// so small lobes shape the edges without turning the body into cotton wool.
// BLOW = the two largest octaves alone (the big lobes and the creases between them).
float BLOW;
vec3 billowD(vec2 p, float per, float oct) {
  float s = 0.0, a = 0.5, gw = 1.0;
  vec2 g = vec2(0.0);
  mat2 J = mat2(1.0);
  BLOW = 0.54;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    float w = clamp(oct - fi, 0.0, 1.0);
    vec3 n = gnPD(p, per);
    float sa = sqrt(n.x * n.x + 0.003);   // |n|, rounded off in the creases
    s += a * mix(0.36, sa * 2.0, w);
    g += (a * w * gw * 2.0 * n.x / sa) * (transpose(J) * n.yz);
    if (i == 0) BLOW = s + 0.25 * 0.36;
    if (i == 1) BLOW = s;
    float sh = (i == 0 || i == 2 || i == 4) ? 0.61 : -0.61;
    p = vec2(2.0 * p.x + sh * p.y, 2.0 * p.y + 5.31);
    J = mat2(2.0, 0.0, sh, 2.0) * J;
    per *= 2.0;
    a *= 0.5;
    gw *= 0.6;
  }
  return vec3(s + a * 0.72, g);
}
vec3 fbmD(vec2 p, float oct) {
  vec3 s = vec3(0.0);
  float a = 0.5;
  mat2 J = mat2(1.0);
  for (int i = 0; i < 6; i++) {
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
float sat01(float x) { return clamp(x, 0.0, 1.0); }
float octFor(float freq) { return clamp(log2(1.0 / (2.5 * PX * freq)), 1.0, 9.0); }
// seamless oscillator: cyc whole cycles per loop
float osc(float cyc, float ph) { return sin(TAU * fract(cyc * Tw / LOOP) + ph); }

// ---------------------------------------------------------------- colour
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
  vec3 c = mix(vec3(0.54, 0.70, 0.90), vec3(0.16, 0.37, 0.80), smoothstep(0.0, 0.11, e));
  c = mix(c, vec3(0.04, 0.14, 0.50), smoothstep(0.06, 0.42, e));
  c = mix(c, vec3(0.80, 0.87, 0.95), 0.55 * exp(-e * 70.0));
  c *= 0.84 + 0.32 * (0.5 + 0.5 * mu);
  c += SUNC * 0.2 * pow(max(mu, 0.0), 6.0);
  return c;
}
vec3 horizonC(float x) { return skyBase(normalize(vec3(x, 0.002, FOC))); }

// cumulus: a wide flat-based body crowned with turrets (ellipsoid domes) that
// pile up toward an off-centre core, eroded and modelled by billowy lobes;
// screen-space billboards drifting left with the trade wind. Lit like a
// cloud: wrapped sunlight (light diffuses round into the shaded flank),
// creases between lobes, a grey flat base lit from below by the lagoon, and
// edges whose opacity follows their optical thickness, so thin parts thin out
// into the sky instead of ending in a cut-out line.
// One row period = 8 cells of 3 cloud units (S screen units each).
vec4 cumulusRow(vec2 p, float y0, float S, float cyc, float seed, float dens, float haze, float tall) {
  float ly = (p.y - y0) / S;
  if (ly < -0.15 || ly > 1.45 + tall) return vec4(0.0);
  float xs = p.x / S + fract(Tc / CLOOP * cyc) * 24.0;
  float ci = floor(xs / 3.0);
  float dmin = 9.0, wsum = 0.0;
  vec3 nsum = vec3(0.0);
  for (int k = -1; k <= 1; k++) {
    float c = ci + float(k);
    float id = mod(c, 8.0) + seed;
    if (h11(id * 7.31) > dens) continue;
    float sz = 0.55 + 0.6 * h11(id * 5.77);
    float cx = c * 3.0 + 1.5 + (h11(id * 3.13) - 0.5) * 0.8;
    float bw = sz * (1.0 + 0.45 * h11(id * 2.3));
    if (abs(xs - cx) > bw + sz * 0.55 * (1.0 + tall) + 0.45) continue;
    float core = (h11(id * 9.71) - 0.5) * 0.9;   // where the tallest turrets rise
    for (int j = 0; j < 7; j++) {
      float fj = float(j);
      vec3 hh = vec3(h11(id * 13.1 + fj * 1.71), h11(id * 17.3 + fj * 2.93), h11(id * 11.9 + fj * 5.37));
      vec2 ce = vec2(cx, 0.2 * sz), rad = vec2(bw, 0.4 * sz);
      if (j > 0) {
        float u = (fj - 3.5) / 3.0 * 0.85 + (hh.y - 0.5) * 0.3;
        float pk = 1.0 - min(abs(u - core), 1.0);
        float rr = sz * (0.16 + 0.26 * hh.x) * (0.8 + 0.5 * pk) * (1.0 + tall * pk);
        ce = vec2(cx + u * bw, 0.2 * sz + 0.4 * sz * sqrt(max(1.0 - u * u, 0.0)) - rr * 0.3 + tall * hh.z * 0.6 * sz * pk);
        rad = vec2(rr);
      }
      vec2 dn = (vec2(xs, ly) - ce) / rad;
      float L = length(dn), m = min(rad.x, rad.y);
      dmin = min(dmin, (L - 1.0) * m);
      if (L < 1.0) {
        float q = 1.0 - L * L;
        float w = q * q * (j == 0 ? 0.6 : 1.0 + 2.0 * hh.z);   // nearer turrets dominate, smoothly
        nsum += w * normalize(vec3(dn * m / rad, sqrt(q)));
        wsum += w;
      }
    }
  }
  if (dmin > 0.3) return vec4(0.0);
  vec3 nrm = wsum > 0.0 ? normalize(nsum) : vec3(0.0, 0.0, 1.0);
  float pxs = PX / S;
  vec2 ev = 0.7 * vec2(cos(TAU * Tc / CLOOP), sin(TAU * Tc / CLOOP));   // slow billowing
  vec2 np = vec2(xs, ly) * 2.0 + ev;
  float oct = clamp(log2(0.3 / (pxs * 2.0)), 1.0, 7.0);
  vec3 bn = billowD(np, 48.0, oct);
  // silhouette: the turrets eroded by the lobes; opacity from optical thickness
  float lower = smoothstep(0.45, -0.5, nrm.y + 0.6 * (0.25 - ly));   // the lower flanks are ragged and thin
  float edge = -dmin + mix(0.34, 0.46, lower) * (bn.x - 0.42);
  float soft = max(mix(0.04, 0.13, lower), 1.3 * pxs);
  float a = 1.0 - exp(-max(edge, 0.0) / soft);
  a *= smoothstep(-0.03 - pxs, 0.09 + pxs, ly + 0.07 * (bn.x - 0.4));   // the flat base
  if (a <= 0.002) return vec4(0.0);
  // relief: big lobes from the turrets, smaller ones from the billows (flatter toward the base)
  float flt = smoothstep(0.0, 0.3, ly);
  vec3 n = normalize(nrm + vec3(-bn.yz * 0.3 * (0.35 + 0.65 * flt), 0.0));
  float sun = smoothstep(-0.22, 1.0, dot(n, LS));
  float ao = mix(0.66, 1.0, smoothstep(0.12, 0.5, BLOW));                  // creases between the big lobes
  float body = mix(0.42, 1.0, flt) * mix(0.8, 1.0, smoothstep(0.2, 1.1, ly));   // light comes down through the cloud
  vec3 col = SUNC * ES * 0.84 * sun * ao * body
           + vec3(0.31, 0.41, 0.6) * (0.72 + 0.28 * n.y) * mix(0.78, 1.0, ao) * mix(0.8, 1.0, flt)
           + vec3(0.05, 0.13, 0.13) * (1.0 - flt);                         // the lagoon's glow on the base
  col = mix(col, horizonC(p.x), haze);
  return vec4(col, 1.0) * a;
}

vec4 layerSky(vec2 p) {
  vec3 rd = normalize(vec3(p.x, p.y - YH, FOC));
  vec3 c = skyBase(rd);
  for (int i = 0; i < 3; i++) {
    // far bank on the horizon, towering cumulus behind it, fair-weather puffs overhead
    vec4 R0 = i == 0 ? vec4(YH + 0.002, 0.02, 1.0, 0.0) : i == 1 ? vec4(YH + 0.012, 0.042, 2.0, 23.0) : vec4(0.915, 0.085, 4.0, 51.0);
    vec3 R1 = i == 0 ? vec3(0.8, 0.5, 0.15) : i == 1 ? vec3(0.55, 0.28, 0.9) : vec3(0.45, 0.02, 0.4);
    vec4 cl = cumulusRow(p, R0.x, R0.y, R0.z, R0.w, R1.x, R1.y, R1.z);
    c = c * (1.0 - cl.a) + cl.rgb;
  }
  return outL(c, 1.0);
}

// ---------------------------------------------------------------- far land
// limestone karst islands 6-9 km out
float ISU, ISI;   // the island that makes the skyline at x: position across it (-1..1), index
float islandTop(float x, float oct) {
  float y = -1.0;
  ISU = 0.0; ISI = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 I = i == 0 ? vec3(-0.335, 0.042, 0.044) : i == 1 ? vec3(-0.27, 0.026, 0.06) : i == 2 ? vec3(-0.205, 0.034, 0.038) : vec3(-0.125, 0.03, 0.022);
    float u = (x - I.x) / I.y;
    if (abs(u) > 1.0) continue;
    float h = I.z * sqrt(clamp((1.0 - abs(u)) / 0.2, 0.0, 1.0)) * (0.62 + 0.38 * (1.0 - u * u));
    h *= 0.62 + 0.5 * fbm1(x * 70.0 + float(i) * 7.0, oct) + 0.12 * (fbm1(x * 260.0 + float(i), oct - 2.0) - 0.5);
    if (h > y) { y = h; ISU = u; ISI = float(i); }
  }
  return YH + y - 0.0006;
}
// sheer limestone towers capped and ledged with jungle, 6-9 km away: sunlit
// faces toward the left, buttresses and flutes, dark rain streaks, and a lot of
// sea haze, thickest at the waterline
vec4 layerIslands(vec2 p) {
  vec2 q = p + u_par * PAR * 0.06;
  if (q.y > YH + 0.085 || q.y < YH - 0.003 || q.x < -0.38 || q.x > -0.09) return vec4(0.0);
  float oct = octFor(55.0);
  float top = islandTop(q.x, oct);
  float a = smoothstep(-PX, PX, top - q.y) * smoothstep(-PX, PX, q.y - (YH - 0.0008));
  if (a <= 0.0) return vec4(0.0);
  float h = q.y - YH, dt = top - q.y;
  float u = ISU, sd = ISI * 7.3;
  // buttresses and flutes: a relief that runs down the walls (normal from its x slope)
  vec3 fl = fbmD(vec2(q.x * 380.0 + sd, h * 90.0 + 0.6 * sin(q.x * 300.0)), clamp(octFor(380.0), 1.0, 4.0));
  float facing = clamp(-0.85 * u * abs(u) + 0.45 * fl.y, -1.0, 1.0);   // + toward the sun
  float lit = smoothstep(-0.75, 0.9, facing);
  // jungle covers everything but the sheer walls: the flanks of the towers and
  // tall bare scars down their faces, themselves broken by vegetated ledges
  float streak = smoothstep(0.45, 0.8, fbm(vec2(q.x * 900.0 + sd, h * 30.0), clamp(octFor(900.0), 1.0, 3.0)));
  float wall = smoothstep(0.55, 0.85, abs(u) + 0.3 * (fl.x - 0.5));
  wall = max(wall, smoothstep(0.6, 0.72, vnoise(vec2(q.x * 170.0 + sd, h * 14.0))) * smoothstep(0.003, 0.01, dt));
  wall *= smoothstep(0.002, 0.006, dt) * (1.0 - 0.85 * smoothstep(0.6, 0.75, vnoise(vec2(q.x * 150.0 + sd, h * 520.0))));
  vec3 rock = vec3(0.3, 0.29, 0.27) * (1.0 - 0.45 * streak) * (0.85 + 0.3 * fl.x);
  rock = mix(rock, vec3(0.44, 0.36, 0.27), 0.3 * smoothstep(0.7, 0.88, vnoise(vec2(q.x * 120.0 + sd, h * 40.0))));   // fresh orange scars
  vec3 alb = mix(vec3(0.05, 0.088, 0.034) * (0.75 + 0.5 * fl.x), rock, wall);
  vec3 c = alb * (SUNC * ES * 0.8 * lit + AMB * (0.7 + 0.3 * lit));
  // aerial perspective: 6-9 km of humid air, densest near the water
  c = mix(c, horizonC(q.x) * 0.9, 0.46 + 0.24 * exp(-h / 0.008));
  c *= 1.0 - 0.18 * smoothstep(0.0012, 0.0, h);   // the wave-cut notch at sea level
  return outL(c, a);
}

// jungle headland on the right, ~1.1 km away
float headTop(float x, float oct) {
  float t = x - 0.235;
  if (t < 0.0) return YH - 0.02;
  float y = 0.05 * smoothstep(0.0, 0.17, t) + 0.064 * smoothstep(0.2, 0.46, t) - 0.012 * smoothstep(0.52, 0.8, t);
  y *= smoothstep(-0.004, 0.02, t);
  y += 0.008 * (fbm1(x * 16.0 + 3.0, oct) - 0.5);
  // emergent tree crowns along the skyline
  float cw = 0.0105, ci = floor(x / cw), cr = 0.0;
  for (int i = -1; i <= 1; i++) {
    float c = ci + float(i);
    float r = cw * (0.5 + 0.45 * h11(c * 3.7));
    float dx = x - (c + 0.5 + 0.35 * (h11(c) - 0.5)) * cw;
    if (abs(dx) < r) cr = max(cr, sqrt(r * r - dx * dx) * 0.8 - r * 0.3);
  }
  return YH + y + cr * smoothstep(0.0, 0.03, t);
}
vec4 layerHead(vec2 p) {
  vec2 q = p + u_par * PAR * 0.14;
  if (q.x < 0.225 || q.y > YH + 0.13 || q.y < YH - 0.0065) return vec4(0.0);
  float top = headTop(q.x, octFor(16.0));
  float base = YH - CAMH * FOC / 1100.0;
  float a = smoothstep(-PX, PX, top - q.y) * smoothstep(-PX, PX, q.y - base);
  if (a <= 0.0) return vec4(0.0);
  float dt = top - q.y;
  // terrain under the canopy: spurs and gullies running down the slopes
  vec3 tr = fbmD(q * vec2(24.0, 32.0) + 2.0, clamp(octFor(32.0), 1.0, 4.5));
  vec3 nt = normalize(vec3(-tr.yz * 0.85, 1.0));
  // canopy: crowns of very different sizes (a power diagram: big crowns crowd
  // out small ones), each a leafy dome lit from the upper left, with shadowed
  // gaps between them
  vec2 cq = q * vec2(110.0, 140.0);
  cq += (vec2(vnoise(cq * 0.37), vnoise(cq * 0.37 + 7.1)) - 0.5) * 1.1;   // crowns are not round
  vec2 ci = floor(cq), cf = fract(cq);
  float d1 = 9.0;
  vec2 bd = vec2(0.0), bid = vec2(0.0);
  float br = 1.0;
  for (int yy = -1; yy <= 1; yy++)
  for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 hc = h22(ci + g);
    float r = 0.5 + 0.62 * h12(ci + g + 3.7);
    vec2 o = g + 0.05 + 0.9 * hc - cf;
    float d = dot(o, o) / (r * r);
    if (d < d1) { d1 = d; bd = -o; bid = ci + g; br = r; }
  }
  float fine = smoothstep(2.5, 6.0, (1.0 / 140.0) / PX);   // crowns resolved (pixels per crown)
  vec2 l = bd / br;
  float dome = 1.0 - d1;
  vec3 lv = vnoiseD(cq * 3.1 + bid * 1.7);                  // leafy clumps on each crown
  vec3 nc = normalize(vec3(l * 0.6 + (lv.yz - 0.0) * 0.12 * smoothstep(8.0, 20.0, (1.0 / 140.0) / PX), sqrt(max(dome, 0.03))));
  vec3 n = normalize(mix(nt, normalize(nc + nt - vec3(0.0, 0.0, 1.0)), fine));
  float ndl = max(dot(n, LS), 0.0);
  float ao = mix(0.78, smoothstep(-0.7, 0.6, dome) * (0.78 + 0.22 * lv.x), fine);
  // tree species in stands and single crowns: dark and mid greens, yellow-green,
  // the odd pale palm or flowering crown
  float stand = vnoise(q * vec2(28.0, 36.0) + 5.0);
  vec3 hb = vec3(h22(bid * 1.3), h12(bid + 9.1));
  float tone = mix(stand, hb.x, 0.55 * fine);
  vec3 alb = mix(vec3(0.035, 0.075, 0.022), vec3(0.085, 0.125, 0.03), tone);
  alb = mix(alb, vec3(0.12, 0.14, 0.045), smoothstep(0.88, 0.97, hb.y) * fine);
  alb = mix(alb, vec3(0.16, 0.1, 0.06), step(0.985, hb.z) * fine);
  vec3 c = alb * (SUNC * ES * 0.9 * ndl * ao + AMB * (0.35 + 0.45 * ao) * (0.75 + 0.25 * nt.y));
  // rocky shore and surf at the waterline
  float hb2 = q.y - base;
  float rockL = 0.0045 + 0.004 * fbm1(q.x * 160.0, 3.0) - 0.003 * smoothstep(0.3, 0.24, q.x);
  float rock = smoothstep(rockL + PX, rockL - PX, hb2);
  vec3 rc = vec3(0.26, 0.24, 0.21) * (0.6 + 0.6 * fbm(q * vec2(900.0, 1500.0), clamp(octFor(900.0), 1.0, 4.0)));
  c = mix(c, rc * (SUNC * ES * 0.55 + AMB), rock);
  // a small sandy cove at the point
  float cove = smoothstep(0.235, 0.245, q.x) * smoothstep(0.335, 0.31, q.x) * smoothstep(0.0022 + PX, 0.0022 - PX, hb2);
  c = mix(c, vec3(0.78, 0.74, 0.64) * (SUNC * ES * 0.7 + AMB), cove);
  float surf = smoothstep(0.0011 + 0.0007 * osc(160.0, q.x * 140.0) + PX, 0.0, hb2) * smoothstep(0.3, 0.6, fbm(q * vec2(1200.0, 400.0), 3.0) + 0.15);
  c = mix(c, vec3(0.95) * (SUNC * ES * 0.65 + AMB), surf);
  // aerial perspective (thicker toward the water)
  c = mix(c, horizonC(q.x), 0.34 + 0.12 * smoothstep(0.06, 0.0, q.y - YH));
  c += vec3(0.02, 0.03, 0.05) * smoothstep(0.003, 0.0, dt);
  return outL(c, a);
}

// ---------------------------------------------------------------- sea
float shoreZ(float x) { return 19.0 + 0.2 * x + 3.0 * (vnoise1(x * 0.035 + 2.0) - 0.5) + 0.7 * (vnoise1(x * 0.13 + 5.0) - 0.5); }
float reefR(float x) { return 126.0 + 24.0 * (vnoise1(x * 0.009 + 1.0) - 0.5) + 5.0 * (vnoise1(x * 0.06) - 0.5); }
float wig(float x) { return 0.08 * sin(x * 0.07 + 1.0) + 0.05 * sin(x * 0.19 + 2.3); }
float seaEnv(float r) { return smoothstep(-0.5, 3.0, r) * (0.55 + 0.45 * smoothstep(8.0, 80.0, r)); }

// small breakers: (height, foam density, lip translucency, wave coordinate u)
// and the analytic height gradient
vec4 breaker(vec2 xz, out vec2 grad) {
  grad = vec2(0.0);
  float x = xz.x;
  float r = xz.y - shoreZ(x);
  if (r < -1.0 || r > 80.0) return vec4(0.0);
  float wg = wig(x);
  float sq = sqrt(r + 3.0);
  float u = KB * sq + Tw / PB + wg;
  float n = floor(u), fr = u - n;
  float id = mod(n, NB);
  float hs = h11(id * 1.37 + 0.5);
  float sc = (n + 0.3 - Tw / PB - wg) / KB;
  float rc = sign(sc) * sc * sc - 3.0;           // crest distance from the shore
  float rb = 4.5 + 5.0 * hs + 4.0 * (vnoise1(x * 0.11 + id * 3.1) - 0.5);
  float sh = clamp(1.0 - (rc - rb) / 30.0, 0.0, 1.0);
  float brk = smoothstep(rb + 0.4, rb - 2.0, rc);
  float b = clamp((rb - rc) / rb, 0.0, 1.0);
  float A0 = (0.2 + 0.28 * hs) * (0.55 + 0.9 * vnoise1(x * 0.17 + id * 7.7));
  float A = A0 * (0.3 + 0.7 * pow(sh, 1.3)) * mix(1.0, 0.16, pow(b, 1.1));
  float c = mix(0.48, 0.18, sh);
  c = mix(c, 0.1, brk);
  float y, dy;
  if (fr < c) {
    float pw = mix(1.3, 2.6, sh), tt = fr / c;
    y = pow(tt, pw);
    dy = pw / c * pow(tt, pw - 1.0);
  } else {
    float t = 1.0 - (fr - c) / (1.0 - c);
    y = t * t * (3.0 - 2.0 * t);
    dy = -6.0 * t * (1.0 - t) / (1.0 - c);
  }
  float m = smoothstep(-0.8, 1.2, r);
  float H = A * y * m;
  float dudz = KB / (2.0 * sq);
  float dudx = -dudz * 0.2 + 0.0056 * cos(x * 0.07 + 1.0) + 0.0095 * cos(x * 0.19 + 2.3);
  grad = A * dy * m * vec2(dudx, dudz);
  float cover = clamp(0.2 + 3.5 * b, 0.0, 1.0);
  float ff = fr < c ? smoothstep(1.0 - cover - 0.15, 1.0 - cover + 0.1, y) * smoothstep(0.0, 0.2, fr / c) : 0.0;
  float ft = fr >= c ? exp(-(fr - c) / (0.04 + 0.1 * b)) * (1.0 - smoothstep(0.5, 1.0, fr)) : 0.0;
  float foam = brk * max(ff, ft) * (1.0 - 0.6 * b);
  float lip = (1.0 - brk) * sh * sh * smoothstep(0.5, 1.0, y) * (fr < c ? 1.0 : 0.35);
  return vec4(H, foam, lip, u);
}

// wave set: (direction, wavenumber, amplitude), 34 m down to 6 cm; WM = angular
// frequency in cycles per loop (deep-water dispersion, quantised to LOOP)
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
float WT[22];
void initWaves() {
  for (int i = 0; i < 22; i++) WT[i] = TAU * fract(WM[i] * Tw / LOOP) - float(i) * 1.7;
}
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
// gradient, filtered slope variance, height; sub-pixel waves hand their slope
// variance to the reflection
vec4 seaDetail(vec2 pos, vec2 fp, float amp) {
  vec2 g = vec2(0.0);
  float var = 0.0, h = 0.0;
  vec2 pp = pos;
  for (int i = 0; i < 22; i++) {
    vec4 wv = WV[i];
    wv.w *= amp;
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
  return (breaker(xz, gd).x + seaEnv(r) * 0.5 * seaGeo(xz)) * smoothstep(ZMARCH, ZMARCH - 15.0, xz.y);
}

// Voronoi border distance (F2 - F1), periodic in x
float vorEdge(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int yy = -1; yy <= 1; yy++)
  for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 c = i + g;
    c.x = mod(c.x, per);
    vec2 d = g + 0.15 + 0.7 * h22(c) - f;
    float dd = dot(d, d);
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
  }
  return sqrt(d2) - sqrt(d1);
}
// foam: solid where dense, a bubbly net where thin; aa = footprint in cells
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
  // thin foam is never a complete net: it lies in patches and its strands break up
  float brk = vnoiseP(p * 2.0 + vec2(4.0, 1.3), per * 2.0);
  float pch = smoothstep(0.45, 0.75, wn + 1.5 * fd - 0.3);
  float f = max(net * smoothstep(0.35, 0.6, brk + 0.8 * fd), fine * 0.8 * smoothstep(0.45, 0.7, brk + 0.6 * fd)) * pch * smoothstep(0.0, 0.12, fd);
  return clamp(max(f, smoothstep(0.72, 0.95, fd)), 0.0, 1.0);
}

// swash on the beach: (water cover, foam density, wetness, film depth)
float runup(float id, float x) { return (2.0 + 3.6 * h11(id * 1.37 + 0.5)) * (0.8 + 0.4 * vnoise1(x * 0.05 + id * 7.7)); }
float swEdge(float phi) {
  if (phi < 0.3) { float t = 1.0 - phi / 0.3; return 1.0 - t * t; }
  return pow(1.0 - (phi - 0.3) / 0.7, 1.6);
}
float dryTime(float up, float Rc) { return 0.3 + 0.7 * (1.0 - pow(clamp(up / Rc, 0.0, 1.0), 1.0 / 1.6)); }
vec4 swash(float x, float up, float fz, out vec2 fo) {
  float ph = Tw / PB - (0.09 - wig(x) - KB * 1.7320508);
  float n = floor(ph), phi = ph - n;
  float idc = mod(n, NB), idp = mod(n - 1.0, NB);
  float Rc = runup(idc, x) + (vnoise1(x * 1.1 + idc * 5.3) - 0.5) * 1.1 + (vnoise1(x * 3.7 + idc * 2.1) - 0.5) * 0.4;
  float Rp = runup(idp, x) + (vnoise1(x * 1.1 + idp * 5.3) - 0.5) * 1.1 + (vnoise1(x * 3.7 + idp * 2.1) - 0.5) * 0.4;
  float eNow = swEdge(phi) * Rc;
  float d = eNow - up;
  float cover = smoothstep(-fz, fz, d) * step(0.0, eNow);
  float wet = 0.0, rem = 0.0;
  if (up > 0.0 && up < Rc) {
    float pr = dryTime(up, Rc);
    if (phi > pr) { wet = exp(-(phi - pr) * 3.2); rem = exp(-(phi - pr) * 5.0); }
  }
  if (up > 0.0 && up < Rp) wet = max(wet, exp(-(phi + 1.0 - dryTime(up, Rp)) * 3.2));
  wet = max(max(wet, cover), smoothstep(1.8, 0.0, up));
  float lead = exp(-max(d, 0.0) / (0.25 + 1.0 * phi)) * cover;
  float foam = lead * mix(0.95, 0.45, smoothstep(0.3, 0.9, phi)) + cover * 0.14 * (1.0 - phi) + rem * 0.35;
  fo = vec2(idc * 3.7, -eNow * 0.85 + idc * 1.3);
  return vec4(cover, clamp(foam, 0.0, 1.0), wet, max(d, 0.0));
}

// seabed: depth (m) below the mean surface at offshore distance r
float bedDepth(vec2 xz, float r) {
  float d = 3.2 * (1.0 - exp(-max(r, 0.0) / 36.0));
  d *= 0.68 + 0.64 * vnoise(xz * vec2(0.021, 0.034) + 3.0);
  float rr = r - reefR(xz.x);
  d = mix(d, 0.7 + 0.5 * vnoise(xz * 0.13), smoothstep(-26.0, -6.0, rr));
  d = mix(d, 38.0, smoothstep(-1.0, 26.0, rr));
  return d + 0.03;
}
// white coral sand, seagrass meadows, coral heads toward the reef
vec3 bedAlb(vec2 b, float r, float fg) {
  float m = fbm(b * 0.6, clamp(log2(0.2 / (fg * 0.6)), 1.0, 4.0));
  vec3 alb = vec3(0.78, 0.75, 0.64) * (0.8 + 0.35 * m);
  float rw = smoothstep(0.12, 0.04, fg);
  if (rw > 0.0) alb *= 1.0 + 0.1 * rw * sin(b.y * 10.5 + b.x * 1.2 + 6.0 * vnoise(b * 0.6));
  float g = vnoise(b * vec2(0.05, 0.08) + 7.0) + 0.3 * vnoise(b * 0.37 + 2.0) + 0.1 * m;
  float grass = smoothstep(0.88, 1.0, g) * smoothstep(18.0, 40.0, r);
  alb = mix(alb, vec3(0.06, 0.09, 0.04) * (0.7 + 0.6 * m), grass);
  float rr = r - reefR(b.x);
  float cor = smoothstep(-32.0, -12.0, rr) * smoothstep(0.42, 0.62, vnoise(b * 0.45) * 0.7 + 0.3 * m + 0.1);
  return mix(alb, vec3(0.17, 0.12, 0.11) * (0.6 + 0.8 * m), cor);
}
// caustic network: two drifting Voronoi-border layers whose points dance on
// loop-quantised orbits; fpc = pixel footprint in cells (widens the filaments,
// keeping the mean at 1)
float causV(vec2 p, float k) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int yy = -1; yy <= 1; yy++)
  for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 h = h22(i + g + k);
    vec2 cyc = floor(LOOP / (1.9 + 1.4 * h));
    vec2 o = g + 0.5 + 0.36 * sin(TAU * (h.yx + fract(cyc * Tw / LOOP))) - f;
    float d = dot(o, o);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
float caustic(vec2 p, float fpc) {
  p += 0.28 * sin(p.yx * vec2(0.83, 1.07) + TAU * fract(vec2(211.0, 173.0) * Tw / LOOP));
  p += 0.2 * sin(p.yx * vec2(2.9, 3.3) + vec2(1.3, 4.1) + TAU * fract(vec2(331.0, 293.0) * Tw / LOOP));   // curl the filaments
  float w = 0.07 + 0.7 * fpc;
  float e1 = causV(p, 0.0), e2 = causV(p * 1.41 + 3.7, 19.0);
  float c = exp(-e1 * e1 / (w * w)) + 0.6 * exp(-e2 * e2 / (w * w * 1.6));
  return 0.4 + 0.6 * c / (3.9 * w);
}
// drifting cloud shadows (the trade wind carries them left)
float cloudShadow(vec2 xz, float fz) {
  float n = 0.65 * vnoiseP(vec2(xz.x / 380.0 + fract(Tw / LOOP) * 32.0, xz.y / 260.0), 32.0)
          + 0.35 * vnoiseP(vec2(xz.x / 140.0 + fract(Tw / LOOP) * 87.0, xz.y / 110.0 + 5.0), 87.0);
  float w = 0.05 + fz / 300.0;
  return 1.0 - 0.72 * smoothstep(0.65 - w, 0.65 + w, n);
}

// sky as seen in a mirror, with the land reflected
vec3 skyRefl(vec3 R) {
  R.y = max(R.y, 0.0015);
  vec3 c = skyBase(R);
  c = mix(c, vec3(0.86, 0.89, 0.93), 0.3 * exp(-R.y * 45.0));
  if (R.z > 0.05 && R.y < 0.1 * R.z) {
    vec2 rs = vec2(R.x / R.z * FOC, YH + R.y / R.z * FOC);
    if (rs.x > 0.22) c = mix(c, vec3(0.13, 0.19, 0.14), smoothstep(-0.002, 0.004, headTop(rs.x, 2.0) - rs.y) * 0.85);
    else if (rs.x > -0.38 && rs.x < -0.09) c = mix(c, horizonC(rs.x) * 0.72, smoothstep(-0.002, 0.003, islandTop(rs.x, 2.0) - rs.y) * 0.55);
  }
  return c;
}
vec3 foamC() { return vec3(0.93, 0.95, 0.96) * (SUNC * ES * 0.62 + AMB * 0.75); }

// ---------------------------------------------------------------- palms
// Each palm is a billboard: a vertical plane facing the camera at depth PZ (m),
// in screen units at zero parallax. The trunk is a quadratic Bezier; the crown
// is 14 fronds (tables FA/FB built in JS), each an arched rachis: a parabola
// bent by gravity across the rachis and by the wind pushing left, with
// leaflets hanging from both sides.
const vec4 FA0[14] = ${PALM_A.f0};
const vec4 FA1[14] = ${PALM_A.f1};
const vec4 FA2[14] = ${PALM_A.f2};
const vec4 FB0[14] = ${PALM_B.f0};
const vec4 FB1[14] = ${PALM_B.f1};
const vec4 FB2[14] = ${PALM_B.f2};
const vec4 BXA = ${PALM_A.box}, BXB = ${PALM_B.box};   // crown boxes (frond lengths from the crown)
float SW1, CW1, SW2, CW2;   // sway phases (set in main)
float WBP, GLP;             // leaflet wobble and glint phases (set in main)

// closest parameter on S(t) = t b1 + t^2 b2, t in [0,1]: Newton from the chord
float qbT(vec2 q, vec2 b1, vec2 b2) {
  vec2 ch = b1 + b2;
  float t = clamp(dot(q, ch) / dot(ch, ch), 0.0, 1.0);
  for (int i = 0; i < 3; i++) {
    vec2 sv = (b1 + b2 * t) * t - q;
    vec2 d1 = b1 + 2.0 * t * b2;
    t = clamp(t - dot(sv, d1) / max(dot(d1, d1) + 2.0 * dot(sv, b2), 1e-6), 0.0, 1.0);
  }
  return t;
}

// one frond (in units of its length L). Returns (alpha, shade, t, leaflet hash);
// full = 0: a soft envelope only, for its shadow
vec4 frond(vec2 p, vec2 C, vec2 dir, vec2 g, float L, float sd, float aa, float full) {
  vec2 q = (p - C) / L, ch = dir + g;
  float hc = clamp(dot(q, ch) / dot(ch, ch), 0.0, 1.0);
  if (length(q - ch * hc) > 0.25 * length(g) + 0.27 + aa / L) return vec4(0.0);   // capsule around the chord
  float t = qbT(q, dir, g);
  vec2 dv = (q - (dir + g * t) * t) * L;
  vec2 tg = normalize(dir + 2.0 * t * g);
  float e = tg.x * dv.y - tg.y * dv.x;
  float ae = abs(e), side = e < 0.0 ? -1.0 : 1.0;
  float hang = clamp(-side * tg.x, 0.0, 1.0);             // this side hangs under the rachis
  float env = pow(sin(PI * t), 0.5) * smoothstep(0.03, 0.15, t);
  float lmax = L * mix(0.15, 0.25, hang) * env;
  float rw = L * 0.0075 * (1.0 - 0.7 * t);
  float rach = smoothstep(rw + aa, rw - aa, ae) * step(t, 0.995) * step(0.001, t);
  if (full < 0.5) {
    // as a shadow the leaflets blur together, but the frond keeps its ragged
    // outline, the torn gaps between groups of leaflets, and thinner tips
    float gs = (t * L - ae * mix(1.5, 0.65, hang)) / (L / 10.0);
    float le = lmax * (0.62 + 0.4 * vnoise1(gs * 2.3 + sd * 7.0 + side * 3.0));
    float torn = smoothstep(0.78, 0.9, vnoise1(gs + sd * 5.0 + side * 2.0));
    float cv = 0.86 * mix(1.0, 0.5, sat01(ae / max(le, 1e-5))) * (1.0 - 0.8 * torn);
    return vec4(max(cv * smoothstep(le + aa, le - aa, ae), rach), 0.0, 0.0, 0.0);
  }
  if (ae > lmax + aa && rach <= 0.0) return vec4(0.0);
  float lt = t * L;
  float cotp = mix(1.5, 0.65, hang) * (1.0 + 0.5 * t);
  float spc = L / 50.0;
  float wob = FLUT * sin(WBP - t * 9.0 + sd * 2.0);
  float s0 = lt - ae * (cotp + 0.3 * wob) - ae * ae / L * 2.0 * hang;
  s0 += spc * 0.8 * (vnoise1(s0 / spc * 0.22 + sd * 7.0 + side) - 0.5);   // leaflets clump in the wind
  s0 += spc * 0.35 * sin(ae / L * 22.0 + t * 17.0 + sd * 5.0 + side);   // and bend along their length
  float kq = floor(s0 / spc);
  float f = s0 / spc - kq;
  float hk = h11(kq * 1.37 + sd * 11.0 + side * 3.1);
  float len = lmax * (0.6 + 0.55 * hk) * step(0.16, h11(floor(kq / 5.0) * 7.1 + sd * 5.0 + side * 2.0));   // torn gaps
  float u = ae / max(len, 1e-5);
  float sinp = inversesqrt(1.0 + cotp * cotp);
  float across = spc * sinp;
  float wl = sqrt(max(1.0 - u * u, 0.0));
  float hw = across * 0.48 * wl;
  float sharp = smoothstep(hw + aa, hw - aa, abs(f - 0.5) * across);
  float filt = smoothstep(0.2, 0.6, aa / across);
  float leaf = mix(sharp, 0.75 * wl, filt) * step(0.08, hk) * step(u, 1.0);
  float a = max(leaf, rach);
  float shade = rach > leaf ? -1.0 : mix(f > 0.5 ? 1.0 : 0.62, 0.82, filt) * mix(1.0, 0.85, hang) * (0.65 + 0.35 * smoothstep(0.0, 0.45, u)) * (0.8 + 0.35 * h11(kq * 3.7 + sd));
  return vec4(a, shade, t, hk);
}

// palm k (0: near left, 1: right): premultiplied linear colour (full = 1), alpha
// (0) or crown alpha only (-1). Fronds 0-6 are behind the trunk, 7-13 in front.
vec4 palm(vec2 p, int k, float aa, float full) {
  bool isA = k == 0;
  vec2 P0 = isA ? PA0 : PB0, P1 = isA ? PA1 : PB1, C = isA ? PA2 : PB2;
  float sc = FOC / (isA ? PZA : PZB);   // screen units per metre
  float L = 3.5 * sc;
  vec2 dc = p - C;
  vec4 bx = (isA ? BXA : BXB) * L + vec4(-aa, -aa, aa, aa);
  bool crown = dc.x > bx.x && dc.y > bx.y && dc.x < bx.z && dc.y < bx.w;
  bool trunk = p.x > min(P0.x, C.x) - 0.3 * sc && p.x < max(max(P0.x, P1.x), C.x) + 0.3 * sc && p.y < C.y + 0.3 * sc && p.y > P0.y - 0.3 * sc;
  if (!crown && !trunk) return vec4(0.0);
  float kf = float(k);
  vec2 Cs = C + sc * vec2(-0.14 * WIND + 0.05 * (isA ? SW1 : CW1), 0.03 * (isA ? CW2 : SW2));
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 14; i++) {
    if (i == 7) {
      if (trunk && full > -0.5) {
        vec2 b1 = 2.0 * (P1 - P0), b2 = P0 - 2.0 * P1 + C;
        float t = qbT(p - P0, b1, b2);
        vec2 pt = P0 + (b1 + b2 * t) * t;
        vec2 tg = normalize(b1 + 2.0 * t * b2);
        vec2 nr = vec2(tg.y, -tg.x);
        float hw = sc * (0.16 - 0.045 * t + 0.07 * smoothstep(0.08, 0.0, t));
        float u = clamp(dot(p - pt, nr) / hw, -1.0, 1.0);
        float ta = smoothstep(hw + aa, hw - aa, length(p - pt)) * step(t, 0.999) * smoothstep(-aa, aa, p.y - P0.y + 0.07 * sc * sqrt(1.0 - u * u));
        if (ta > 0.0) {
          vec3 tc = vec3(0.0);
          if (full > 0.5) {
            vec3 nn = vec3(nr * u, sqrt(1.0 - u * u));
            // bark: leaf-scar rings, fine fissures, sun-bleached grey above
            float s = t * 9.5;
            float ring = fract(s / 0.1 + 0.15 * u * u + 0.1 * vnoise(vec2(u * 2.0, s * 3.0)));
            float rk = smoothstep(0.6, 0.2, 0.75 * aa / (sc * 0.1));
            float groove = mix(1.0, smoothstep(0.0, 0.22, ring) * (0.75 + 0.25 * smoothstep(1.0, 0.7, ring)), rk);
            float fis = vnoise(vec2(u * 9.0 + 3.0, s * 8.5));
            vec3 alb = mix(vec3(0.2, 0.16, 0.12), vec3(0.28, 0.25, 0.21), smoothstep(0.1, 0.8, t)) * (0.55 + 0.45 * groove) * (0.85 + 0.3 * fis);
            alb = mix(alb, vec3(0.36, 0.38, 0.30), smoothstep(0.62, 0.75, vnoise(vec2(u * 3.0, s * 1.3) + 7.0)) * 0.6);   // lichen
            float under = smoothstep(0.86, 0.99, t);
            tc = alb * (SUNC * ES * 0.95 * max(dot(nn, LS), 0.0) * (1.0 - 0.7 * under) + AMB * (0.55 + 0.35 * nn.z) * (1.0 - 0.5 * under));
          }
          acc = vec4(tc, 1.0) * ta + acc * (1.0 - ta);
        }
      }
      if (full > 0.5 && dot(dc, dc) < 0.6 * sc * sc) {
        // the crown's heart (frond bases, husks) and its coconuts
        float ha = smoothstep(aa, -aa, length((p - Cs) / vec2(1.0, 0.75)) - 0.2 * sc);
        if (ha > 0.0) acc = vec4(vec3(0.07, 0.075, 0.03) * (SUNC * ES * 0.3 * (0.4 + 0.6 * vnoise((p - Cs) / sc * 14.0)) + AMB * 0.35), 1.0) * ha + acc * (1.0 - ha);
        for (int n = 0; n < 5; n++) {
          float fn = float(n);
          vec2 l = (p - C - sc * vec2(-0.3 + 0.15 * fn + 0.05 * h11(fn + kf * 7.0), -0.18 - 0.14 * h11(fn * 3.1 + kf))) / (0.13 * sc);
          float ca = smoothstep(1.0 + aa / (0.13 * sc), 1.0 - aa / (0.13 * sc), length(l));
          if (ca > 0.0) {
            vec3 nn = vec3(l, sqrt(max(1.0 - dot(l, l), 0.0)));
            vec3 alb = mix(vec3(0.16, 0.2, 0.04), vec3(0.3, 0.17, 0.05), step(0.6, h11(fn * 5.3 + kf)));
            acc = vec4(alb * (SUNC * ES * 0.6 * max(dot(nn, LS), 0.0) + AMB * 0.4), 1.0) * ca + acc * (1.0 - ca);
          }
        }
      }
    }
    if (!crown) continue;
    vec4 f2 = isA ? FA2[i] : FB2[i];
    vec2 fd = dc - f2.xy * L;
    if (dot(fd, fd) > f2.z * f2.z * L * L) continue;
    float back = i < 7 ? 1.0 : 0.0;
    vec4 f0 = isA ? FA0[i] : FB0[i];
    vec4 f1 = isA ? FA1[i] : FB1[i];
    // sway: two global phases shifted per frond (angle-sum identities, no trig here)
    float s1 = SW1 * f1.w + CW1 * f1.z;
    float s2 = SW2 * (f1.w * f1.w - f1.z * f1.z) + CW2 * 2.0 * f1.z * f1.w;
    vec2 dir = normalize(f0.xy + WIND * (0.05 * s1 + 0.02 * s2) * f0.w * vec2(-f0.y, f0.x));
    vec2 g = f1.xy - vec2(0.2 * WIND * f0.w, 0.0);
    float fi = float(i);
    vec4 fr = frond(p, Cs + dir * 0.05 * L, dir, g, L * f0.z, fi + kf * 13.0, aa, full);
    if (fr.x <= 0.0) continue;
    vec4 c = vec4(0.0, 0.0, 0.0, fr.x);
    if (full > 0.5) {
      float old = step(0.78, h11(fi * 9.7 + kf * 5.0)) * smoothstep(-0.2, -0.7, dir.y);
      bool rach = fr.y < 0.0;
      float sh = rach ? 0.75 : fr.y;
      vec3 alb = mix(vec3(0.06, 0.13, 0.018), vec3(0.17, 0.21, 0.03), clamp(fr.w * 0.6 + 0.35 * fr.z, 0.0, 1.0));
      alb = mix(alb, vec3(0.20, 0.16, 0.05), smoothstep(0.86, 0.97, fr.w) * smoothstep(0.5, 0.9, fr.z));   // browned leaflet tips
      if (rach) alb = vec3(0.16, 0.17, 0.05);
      alb = mix(alb, vec3(0.24, 0.15, 0.06), old);
      float inner = smoothstep(0.32 * L, 0.0, length(p - Cs));
      sh *= (1.0 - 0.62 * back) * (1.0 - 0.55 * inner);
      vec3 col = alb * (SUNC * ES * 0.9 * sh + AMB * (0.45 + 0.25 * sh));
      col += vec3(0.03, 0.05, 0.08) * sh * (1.0 - back);   // waxy sheen of the sky
      // leaflets catching the sun as they flutter
      if (!rach) col += SUNC * 0.8 * (1.0 - back) * pow(max(sin(GLP + fr.w * 60.0 + fi), 0.0), 60.0) * step(0.7, fr.w) * step(0.85, fr.y) * (1.0 - old);
      c = vec4(col, 1.0) * fr.x;
    }
    acc = c + acc * (1.0 - c.a);
  }
  return acc;
}
// shadow of the palms on the beach: project the ground point along the sun
// onto each palm's billboard
float PSH = 1.0;   // palm shadow at this pixel's ground point (set in main)
const vec2 SHK = vec2(1.05903, 0.36770);   // ground shift per metre of height, away from the sun
const vec2 SHD = vec2(0.93985, 0.32631), SHE = vec2(-0.32631, 0.93985);   // along / across the shadows
vec2 toGround(vec2 b, float pz) {   // billboard point -> its shadow on the ground (x, z)
  float h = CAMH + (b.y - YH) * pz / FOC;
  return vec2(b.x * pz / FOC + SHK.x * h, pz + SHK.y * h);
}
float palmShadow(vec2 G) {
  float s = 1.0;
  for (int k = 0; k < 2; k++) {
    if (k == 0 ? G.x > 10.0 : G.x < 6.0) continue;
    bool isA = k == 0;
    float pz = isA ? PZA : PZB, sc = FOC / pz;
    vec2 C = isA ? PA2 : PB2;
    // trunk: the Bezier projected onto the ground along the sun
    vec2 g0 = toGround(isA ? PA0 : PB0, pz), g1 = toGround(isA ? PA1 : PB1, pz), g2 = toGround(C, pz);
    vec2 b1 = 2.0 * (g1 - g0), b2 = g0 - 2.0 * g1 + g2;
    float t = qbT(G - g0, b1, b2);
    float hh = t * (CAMH + (C.y - YH) / sc);
    float pen = 0.0093 * hh / SUN.y + 0.01;
    float rT = 0.16 - 0.045 * t;
    s *= 1.0 - 0.92 * smoothstep(rT + pen, rT - pen, length(G - g0 - (b1 + b2 * t) * t));
    // crown: its silhouette on a vertical plane through it, facing the sun
    vec2 d = G - g2;
    if (dot(d, d) > 80.0) continue;
    vec2 ps = C + vec2(dot(d, SHE), dot(d, SHD) / length(SHK)) * sc;
    s *= 1.0 - 0.92 * palm(ps, k, (0.0093 * (CAMH + (C.y - YH) / sc) / SUN.y) * sc + 0.5 * PX, -1.0).a;
  }
  return s;
}

vec4 layerPalms(vec2 p) {
  bool isA = p.x < 0.15;
  vec4 c = palm(p + u_par * PAR * (isA ? 0.97 : 0.83), isA ? 0 : 1, 0.75 * PX, 1.0);
  if (c.a <= 0.0) return vec4(0.0);
  return vec4(display(c.rgb / c.a) * c.a, c.a);
}

// ---------------------------------------------------------------- beach and water
vec3 shadeBeach(vec3 pos, vec3 rd, float fx, float fz) {
  float x = pos.x;
  float up = shoreZ(x) - pos.z;
  vec2 fo;
  vec4 sw = swash(x, up, fz, fo);
  vec2 sp = pos.xz;
  float fg = sqrt(fx * fz);
  vec3 und = fbmD(sp * vec2(0.22, 0.3), 3.0);
  vec3 alb = vec3(0.56, 0.5, 0.4) * (0.86 + 0.24 * und.x);
  alb *= 0.9 + 0.2 * fbm(sp * 6.0, clamp(log2(0.12 / (fg * 6.0)), 0.0, 5.0));
  // bits of shell and coral, and dark grains
  vec2 gc = floor(sp * 14.0);
  float gd = length(sp * 14.0 - gc - 0.2 - 0.6 * h22(gc));
  float gr = 0.05 + 0.08 * h12(gc + 5.0);
  float gk = smoothstep(gr + fg * 14.0, gr - fg * 14.0, gd) * step(0.88, h12(gc + 2.0)) * smoothstep(0.02, 0.006, fg);
  alb = mix(alb, h12(gc + 9.0) > 0.25 ? vec3(0.92, 0.86, 0.8) : vec3(0.36, 0.3, 0.24), gk);
  float wetA = sw.z;
  // dry-sand relief: soft wind ripples and undulations
  vec3 und2 = fbmD(sp * vec2(0.9, 1.2) + 4.0, 3.0);
  vec2 rg = (und.yz * vec2(0.22, 0.3) * 0.5 + und2.yz * vec2(0.9, 1.2) * 0.06) * (1.0 - wetA);
  float rw = smoothstep(2.0, 5.0, 0.12 / fz) * (1.0 - wetA) * smoothstep(3.0, 6.0, up);
  if (rw > 0.0) {
    float rph = (sp.y * 0.9 - 0.4 * sp.x + 1.8 * fbm(sp * 0.4, 2.0)) * TAU / 0.12;
    float sl = (cos(rph) + 0.4 * cos(2.0 * rph)) * 0.06 * rw;
    rg += vec2(-0.4, 0.9) * sl;
  }
  // old footprints: soft oval hollows trodden into the dry sand
  if (fx < 0.03) {
    vec2 c = floor(sp / 0.8);
    if (h12(c + 41.0) < 0.3) {
      float an = h12(c + 7.0) * 1.4 - 0.7;
      vec2 d = sp - (c + 0.3 + 0.4 * h22(c + 3.0)) * 0.8;
      d = mat2(cos(an), sin(an), -sin(an), cos(an)) * d;
      vec2 ab = vec2(0.055, 0.13);
      float e = exp(-2.0 * dot(d / ab, d / ab));
      vec2 gd = 4.0 * 0.025 * e * d / (ab * ab) * (1.0 - wetA) * smoothstep(1.0, 3.0, up);
      rg += mat2(cos(an), -sin(an), sin(an), cos(an)) * gd;
    }
  }
  vec3 n = normalize(vec3(-rg.x, 1.0, -rg.y));
  float ndl = max(dot(n, SUN), 0.0);
  float sh = PSH * cloudShadow(sp, fz);
  vec3 col = alb * (SUNC * ES * ndl * sh + (AMB + vec3(0.2, 0.18, 0.15)) * (0.85 + 0.15 * und.x));
  // wrack line of dried seagrass at the last high tide
  float wl = 4.3 + 0.7 * sin(x * 0.09 + 1.0) + 0.8 * (vnoise1(x * 0.35) - 0.5);
  if (abs(up - wl) < 1.5) {
    float band = exp(-pow((up - wl) / 0.3, 2.0));
    float clump = smoothstep(0.45, 0.75, vnoise(sp * vec2(1.2, 3.0)) + 0.3 * band - 0.15);   // the line breaks into clumps
    // strands of dried seagrass lying along the line
    float fib = fbm(sp * vec2(4.0, 30.0) + vec2(0.0, 3.0 * vnoise(sp * vec2(2.0, 1.0))), clamp(log2(0.11 / (fg * 30.0)), 1.0, 5.0));
    float wr = band * clump * smoothstep(0.48, 0.64, fib);
    vec3 wc = mix(vec3(0.2, 0.16, 0.1), vec3(0.07, 0.055, 0.035), smoothstep(0.58, 0.78, fib));   // sun-bleached to fresh
    col = mix(col, wc * (SUNC * ES * 0.85 * sh * (0.5 + 0.5 * ndl) + AMB), wr * 0.8);
  }
  // wet sand and the swash film: dark, glossy, mirroring the sky
  if (wetA > 0.002) {
    float film = sw.x;
    vec2 wg = (vec2(vnoise(sp * 2.1), vnoise(sp * 2.1 + 7.0)) - 0.5) * mix(0.02, 0.05, film);
    vec3 nw = normalize(vec3(wg.x, 1.0, wg.y));
    float ndv = max(dot(nw, -rd), 0.02);
    float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec3 refl = skyRefl(reflect(rd, nw));
    vec3 under = alb * 0.7 * (SUNC * ES * ndl * sh + AMB + vec3(0.2, 0.18, 0.15));
    if (film > 0.0) {
      float cs = fg < 0.2 ? mix(caustic(sp / 0.3 + vec2(0.0, sw.w * 2.0), fg / 0.3), 1.0, smoothstep(0.08, 0.2, fg)) : 1.0;
      cs = mix(1.0, cs, smoothstep(0.0, 0.4, sw.w) * 0.3);   // a film this thin barely focuses light
      vec3 thru = alb * 0.7 * (SUNC * ES * 0.72 * sh * cs + AMB) * exp(-SA * (0.05 + 0.04 * sw.w));
      under = mix(under, thru, film);
    }
    vec3 wetC = mix(under, refl, F * mix(0.45, 1.0, film));
    col = mix(col, wetC, wetA);
  }
  if (sw.y > 0.01) {
    float aa = 0.7 * sqrt(fx * 1.3 * fz * 2.2) + 0.02;
    float foam = foamPat(vec2(x * 1.3, up * 2.2) + fo * vec2(1.0, 2.2), 1e5, sw.y, aa);
    col = mix(col, foamC() * (0.6 + 0.4 * sh), foam);
  }
  return col;
}

vec3 shadeWater(vec3 pos, vec3 rd, float z, float r, vec2 fp) {
  vec2 bg;
  vec4 br = breaker(pos.xz, bg);
  float rr = r - reefR(pos.x);
  vec4 sd = seaDetail(pos.xz, fp, mix(0.5, 0.72, smoothstep(-15.0, 25.0, rr)));
  float env = seaEnv(r);
  vec2 g = sd.xy * env + bg;
  float var = sd.z * env * env + 0.0004 + 0.002 * smoothstep(0.0, 30.0, rr);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = -rd;
  float ndv = dot(n, V);
  if (ndv < 0.03) { n = normalize(n + V * (0.03 - ndv)); ndv = 0.03; }
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(rd, n);
  R = normalize(R + vec3(0.0, sqrt(var) * 1.1, 0.0));
  vec3 refl = skyRefl(R);
  float shd = cloudShadow(pos.xz, fp.y);
  // light through the water: seabed under caustics, absorbed and scattered
  float hgt = br.x + sd.w * env;
  float D = bedDepth(pos.xz, r) + hgt;
  vec3 T = refract(rd, n, 0.75);
  float Lv = D / max(-T.y, 0.3);
  vec3 W = mix(WLAG, WSEA, smoothstep(-4.0, 20.0, rr)) * (0.4 + 0.6 * shd);
  vec3 under = W * (1.0 - exp(-(SA + 0.04) * Lv));
  if (Lv < 60.0) {
    vec2 B = pos.xz + T.xz * Lv;
    float fg = sqrt(fp.x * fp.y);
    vec3 alb = bedAlb(B, B.y - shoreZ(B.x), fg) * 0.66;
    float fpc = fg / 0.45;
    float kc = smoothstep(0.03, 0.4, D) * (1.0 - 0.8 * smoothstep(1.2, 3.5, D)) * (1.0 - smoothstep(0.3, 0.8, fpc));
    float cs = kc > 0.02 ? mix(1.0, caustic(B / 0.45, fpc), kc) : 1.0;
    // swell crests focus broad bands of light that roll toward the shore
    cs *= 1.0 + 0.5 * br.z * smoothstep(0.0, 0.6, D);
    float psh = r < 9.0 ? PSH : 1.0;
    vec3 E = SUNC * ES * 0.72 * exp(-SA * D * 1.18) * cs * shd * psh + AMB * exp(-SA * D * 1.5);
    under += alb * E * exp(-SA * Lv);
  }
  vec3 col = mix(under, refl, F);
  // foam: breaking whitewater, residual lace, foam drifting off the reef
  float foam = 0.0, fsh = 1.0;
  if (r < 30.0) {
    float dudz = KB / (2.0 * sqrt(max(r, 0.0) + 3.0));
    float fzc = fp.y * 22.0 * dudz, fxc = fp.x * 3.0;
    float an = clamp(sqrt(fxc / max(fzc, 1e-6)), 0.5, 1.0);
    vec2 fq = vec2(br.w * 22.0 + br.x * 8.0, pos.x * 3.0 / an);
    float fpc = max(fzc, fxc / an);
    vec2 fq0 = fq;
    fq += (vec2(vnoiseP(fq * 0.5, NB * 11.0), vnoiseP(fq * 0.5 + vec2(0.0, 7.7), NB * 11.0)) - 0.5) * 1.6;
    float tex = fbmP(fq, NB * 22.0, clamp(log2(0.5 / (fpc + 1e-4)), 1.0, 5.5));
    float fw = br.y * (0.95 + 0.3 * vnoiseP(vec2(br.w * 3.0, pos.x * 0.4 / an), NB * 3.0));
    float lw = 0.07 + 0.8 * fpc;
    float white = smoothstep(1.0 - fw - lw, 1.0 - fw + lw, tex) * smoothstep(0.0, 0.1, fw);
    if (fw > 0.03 && fw < 0.85) {
      float net = foamPat(fq0 * vec2(0.5, 0.35), NB * 11.0, fw * 1.15, fpc * 0.5 + 0.02);
      white = mix(net, white, smoothstep(0.55, 0.85, fw));
    }
    float fres = smoothstep(16.0, 3.0, r) * smoothstep(-1.0, 1.5, r) * smoothstep(0.6, 0.85, n.y);
    float ridge = 1.0 - abs(2.0 * tex - 1.0);
    float lace = fres * mix(smoothstep(0.82, 0.94, ridge) * smoothstep(0.35, 0.65, vnoiseP(fq * 0.25, NB * 5.5)), 0.08, smoothstep(0.08, 0.35, fpc));
    foam = max(white, lace * 0.45);
    fsh = 0.8 + 0.25 * smoothstep(0.25, 0.85, tex);
  }
  if (rr > -30.0 && rr < 4.0) {
    float fpz = fp.y / 6.0;
    float rf = fbm(vec2(pos.x / 9.0, (rr + Tw * 0.0) / 6.0) + vec2(0.0, 3.0), clamp(log2(0.5 / fpz), 1.0, 4.0));
    float band = smoothstep(-28.0, -4.0, rr) * smoothstep(4.0, -1.0, rr);
    foam = max(foam, band * mix(smoothstep(0.64, 0.74, rf), 0.1 * smoothstep(0.45, 0.7, rf), smoothstep(0.3, 1.0, fpz)) * 0.7);
  }
  col = mix(col, foamC() * fsh * (0.55 + 0.45 * shd), foam);
  // aerial perspective
  float fog = 1.0 - exp(-z / 7000.0);
  return mix(col, horizonC(rd.x / rd.z * FOC), fog);
}

// cheap shade of a wave crest top, for blending across silhouettes
vec3 crestColor(vec3 pos, vec3 rd) {
  vec2 bg;
  vec4 br = breaker(pos.xz, bg);
  vec3 n = normalize(vec3(-bg.x, 1.0, -bg.y));
  float ndv = max(dot(n, -rd), 0.03);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 body = vec3(0.12, 0.62, 0.62) * (1.0 + br.z);
  vec3 c = mix(body, skyRefl(reflect(rd, n)), F);
  return mix(c, foamC(), smoothstep(0.2, 0.7, br.y));
}

// water + beach for a (parallax-warped) screen point below the horizon
vec3 surface(vec2 q) {
  initWaves();
  float dy = max(YH - q.y, 0.25 * PX);
  vec3 rd = normalize(vec3(q.x, -dy, FOC));
  float sl = dy / FOC;
  float zP = CAMH / sl;
  float z = zP;
  float rmin = 1e9, zm = 0.0, gm = 0.0;
  // only the surf zone is ray-marched; elsewhere the water is a plane with
  // full-detail normals
  if (zP < 120.0 && zP > shoreZ(q.x * zP / FOC) - 1.5) {
    float zB = min((CAMH + 0.35) / sl, ZMARCH);
    float zA = max((CAMH - 0.8) / sl, 12.0);
    if (zB > zA) {
      float minSt = (zB - zA) / 7.0;
      float zc = zA;
      float gc = CAMH - sl * zc - Hgeo(vec2(q.x * zc / FOC, zc));
      float gp = 1e9, pxk = FOC / PX;
      z = zB;
      for (int i = 0; i < 8; i++) {
        float zn = zc + max(gc / (sl + 0.5), minSt);
        if (zn >= zB) { z = zP; break; }
        float gn = CAMH - sl * zn - Hgeo(vec2(q.x * zn / FOC, zn));
        float ratio = gc * pxk / zc;
        if (ratio < rmin && gn > gc && gc < gp) { rmin = ratio; zm = zc; gm = gc; }
        if (gn < 0.0) {
          float lo = zc, hi = zn, glo = gc, ghi = gn;
          for (int j = 0; j < 3; j++) {
            float mid = 0.5 * (lo + hi);
            float gmd = CAMH - sl * mid - Hgeo(vec2(q.x * mid / FOC, mid));
            if (gmd > 0.0) { lo = mid; glo = gmd; } else { hi = mid; ghi = gmd; }
          }
          z = lo + (hi - lo) * glo / max(glo - ghi, 1e-6);
          break;
        }
        gp = gc;
        zc = zn;
        gc = gn;
        z = zP;
      }
    }
  }
  z = min(z, 7000.0);
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
  float cov = 0.5 * (1.0 - smoothstep(0.0, 1.0, rmin));
  if (cov > 0.01) col = mix(col, crestColor(vec3(q.x * zm / FOC, CAMH - sl * zm - gm, zm), rd), cov);
  return col;
}
float surfDepth(float y) { return 0.06 + pow(clamp((YH - y) / YH, 0.0, 1.0), 0.85); }

// ---------------------------------------------------------------- reef surf
// whitewater standing up where the swell breaks on the reef edge, peeling along it
vec4 reefSurf(vec2 q) {
  if (q.y < YH - 0.06 || q.y > YH - 0.018) return vec4(0.0);
  float z = 150.0, xw = 0.0;
  for (int i = 0; i < 2; i++) { xw = q.x * z / FOC; z = shoreZ(xw) + reefR(xw); }
  xw = q.x * z / FOC;
  float s = FOC / z;
  float h = (q.y - (YH - CAMH * s)) / s;   // metres above the water at the reef edge
  if (h < -0.6 || h > 3.2) return vec4(0.0);
  float ph = Tw / PB + xw * 0.012;
  float n = floor(ph), fr = ph - n;
  float id = mod(n, NB);
  float set = smoothstep(-0.3, 0.9, sin(TAU * id * 9.0 / NB + 1.0));
  float big = set * smoothstep(0.2, 0.7, vnoise1(xw * 0.03 + id * 1.7));
  float pm = PX / s;
  float oc = clamp(log2(0.4 / (pm * 1.6)), 1.0, 5.0);
  float t1 = fbm(vec2(xw * 0.8, fr * 3.0 + id * 3.1), oc);
  float t2 = fbm(vec2(xw * 0.35 + 9.0, h * 0.9 - fr * 1.2 + id), min(oc, 3.0));
  // a crashing plume when the crest hits, settling into a low band of whitewater
  float H = big * (1.5 * smoothstep(0.0, 0.06, fr) * exp(-fr * 3.0) + 0.35) * (0.4 + 1.1 * t1);
  float a = smoothstep(H + pm, H - 0.12 - pm, h) * smoothstep(-0.45, -0.15, h) * smoothstep(0.32, 0.55, t2 + 0.25 * big);
  if (a <= 0.0) return vec4(0.0);
  vec3 c = foamC() * mix(0.72, 1.05, smoothstep(-0.2, H, h)) * (0.55 + 0.45 * cloudShadow(vec2(xw, z), 30.0));
  c = mix(c, horizonC(q.x), 1.0 - exp(-z / 7000.0));
  return outL(c, a);
}
vec4 layerSea(vec2 qs, vec3 water, float aSea) {
  vec4 rs = reefSurf(qs);
  return rs + vec4(water, 1.0) * aSea * (1.0 - rs.a);
}

// ---------------------------------------------------------------- sailboats
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float sg = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), sg * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), sg * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), sg * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
// a sloop in local metres (bow toward +x): (colour, alpha), linear
vec4 sloop(vec2 l, float aa, float heel) {
  float cs = cos(heel), sn = sin(heel);
  vec2 r = vec2(cs * l.x + sn * l.y, -sn * l.x + cs * l.y);
  float hull = max(sdBox(r - vec2(-0.1, 0.35), vec2(4.3, 0.55)), dot(r - vec2(4.0, 0.0), vec2(0.88, -0.47)));
  float cab = sdBox(r - vec2(-0.8, 1.05), vec2(1.4, 0.22)) - 0.08;
  float mast = sdBox(r - vec2(0.5, 6.5), vec2(0.07, 5.6));
  float mainS = sdTri(r, vec2(0.42, 1.6), vec2(0.42, 11.8), vec2(-3.9, 1.75));
  float jib = sdTri(r, vec2(0.6, 10.6), vec2(4.3, 1.1), vec2(1.3, 1.3));
  vec3 E = SUNC * ES * 0.62 + AMB * 0.85;
  float aH = smoothstep(aa, -aa, min(hull, cab));
  float aM = smoothstep(aa, -aa, mast);
  float aS = smoothstep(aa, -aa, mainS);
  float aJ = smoothstep(aa, -aa, jib);
  vec3 c = vec3(0.0);
  float a = 0.0;
  // back to front: mainsail, mast, jib, hull
  c = vec3(0.86, 0.85, 0.82) * E * (0.86 + 0.12 * clamp(r.y / 11.0, 0.0, 1.0)) * aS; a = aS;
  c = vec3(0.5) * E * aM + c * (1.0 - aM); a = aM + a * (1.0 - aM);
  c = vec3(0.84, 0.84, 0.82) * E * (0.7 + 0.12 * clamp((r.x - 1.0) / 3.0, 0.0, 1.0)) * aJ + c * (1.0 - aJ); a = aJ + a * (1.0 - aJ);
  vec3 hc = (r.y < 0.18 ? vec3(0.04, 0.07, 0.16) : vec3(0.85, 0.85, 0.83)) * E * (r.y > 0.8 && hull > cab ? 0.7 : 1.0);
  c = hc * aH + c * (1.0 - aH); a = aH + a * (1.0 - aH);
  return vec4(c, a);
}
vec4 boat(vec2 p, float zb, float x0, float x1, float t0, float dur, float sz, float sd) {
  float tt = (Tw - t0) / dur;
  if (tt < 0.0 || tt > 1.0) return vec4(0.0);
  float s = FOC / zb;
  float yb = YH - CAMH * s;
  vec2 q = p + u_par * PAR * surfDepth(yb);
  vec2 l = (q - vec2(mix(x0, x1, tt) * s, yb)) / (s * sz);
  if (abs(l.x) > 60.0 || abs(l.y) > 13.0) return vec4(0.0);
  float dir = sign(x1 - x0);
  l.x *= dir;
  float aa = 0.8 * PX / (s * sz);
  l.y += 0.08 * osc(160.0 + sd, sd);   // gentle pitch on the swell
  float heel = 0.07 + 0.03 * osc(97.0, sd);
  vec4 b = sloop(l, aa, heel);
  // reflection: mirrored, broken by the ripples
  if (l.y < 0.0) {
    vec2 rl = vec2(l.x + 0.35 * sin(l.y * 2.6 + TAU * fract(330.0 * Tw / LOOP)), -l.y * 1.15);
    vec4 rf = sloop(rl, aa * 2.0, heel);
    b = rf * 0.3 * smoothstep(-12.0, -0.5, l.y) * vec4(vec3(0.7, 0.8, 0.95), 1.0);
  }
  // wake: a short foam trail and the bow wave
  float wk = smoothstep(0.35 + aa, 0.0, abs(l.y + 0.02)) * (smoothstep(-4.0, -4.6, l.x) * exp((l.x + 4.0) / 16.0) * 0.7 + smoothstep(5.0, 4.0, l.x) * smoothstep(3.0, 4.0, l.x) * 0.8);
  wk *= smoothstep(0.35, 0.6, vnoise(vec2(l.x * 0.6 + Tw * 1.5 * dir, l.y * 3.0)) + 0.3);
  b = b + vec4(foamC() * 0.8, 1.0) * wk * (1.0 - b.a);
  if (b.a <= 0.0) return vec4(0.0);
  vec3 c = mix(b.rgb / b.a, horizonC(q.x), 1.0 - exp(-zb / 3500.0));
  return outL(c, b.a);
}
vec4 layerBoats(vec2 p) {
  if (p.y < YH - 0.045 || p.y > YH + 0.05) return vec4(0.0);
  vec4 a = boat(p, 520.0, -400.0, 420.0, 40.0, 300.0, 1.0, 1.0);
  vec4 b = boat(p, 880.0, 640.0, -620.0, 720.0, 520.0, 1.15, 2.0);
  return a + b * (1.0 - a.a);
}

// ---------------------------------------------------------------- seabirds
float segT(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
// a bird seen from below: bent wings (flap -1..1), body, forked tail
float birdD(vec2 g, float flap, float fork) {
  vec2 a = vec2(abs(g.x), g.y);
  vec2 w = vec2(0.36, 0.1 + 0.22 * flap);
  vec2 tip = vec2(1.0, -0.06 + 0.55 * flap);
  float d = min(segT(a, vec2(0.0, 0.0), w, 0.075, 0.05), segT(a, w, tip, 0.05, 0.006));
  d = min(d, segT(g, vec2(0.0, 0.14), vec2(0.0, -0.2), 0.035, 0.028));
  d = min(d, segT(a, vec2(0.0, -0.18), vec2(0.1 * fork, -0.5 - 0.1 * fork), 0.022, 0.004));
  return d;
}
vec4 layerBirds(vec2 p) {
  vec2 q = p + u_par * PAR * 1.25;
  float a = 0.0, white = 0.0;
  // frigatebirds soaring high, drifting with the wind
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float ph = fract(Tw / 360.0 + fi * 0.43);
    if (ph > 0.45) continue;
    float tt = ph / 0.45;
    vec2 c = vec2(mix(1.0, -1.0, tt), 0.925 + 0.03 * fi + 0.018 * sin(TAU * tt * 1.3 + fi * 2.0));
    float span = 0.034 + 0.008 * fi;
    vec2 g = (q - c) / span;
    if (dot(g, g) > 2.0) continue;
    float bank = 0.18 * sin(TAU * tt * 1.7 + fi);
    g = mat2(cos(bank), sin(bank), -sin(bank), cos(bank)) * g;
    float flex = 0.08 * sin(TAU * fract(floor(LOOP / 3.0) * Tw / LOOP + fi * 0.3));
    a = max(a, smoothstep(PX / span, -PX / span, birdD(g, 0.15 + flex, 1.0)));
  }
  // white terns over the lagoon, flapping
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ph = fract(Tw / 240.0 + fi * 0.031);
    if (ph > 0.3) continue;
    float tt = ph / 0.3;
    vec2 c = vec2(mix(-1.0, 1.0, tt) + fi * 0.045, 0.565 + 0.012 * fi + 0.01 * sin(TAU * tt * 2.0 + fi));
    float span = 0.013 - 0.002 * fi;
    vec2 g = (q - c) / span;
    if (dot(g, g) > 2.0) continue;
    float fl = sin(TAU * fract(floor(LOOP * 2.6) * Tw / LOOP + fi * 0.37));
    float aw = smoothstep(PX / span, -PX / span, birdD(g, fl * 0.9, 0.6));
    white = max(white, aw);
  }
  float at = max(a, white);
  if (at <= 0.0) return vec4(0.0);
  vec3 dark = vec3(0.035, 0.035, 0.045) + vec3(0.06, 0.09, 0.14) * 0.6;
  vec3 wc = vec3(0.92, 0.93, 0.94) * (SUNC * ES * 0.55 + AMB * 0.9);
  vec3 c = white > a ? wc : dark;
  return outL(c, at);
}

void main() {
  PX = 1.0 / u_res.y;
  Tw = mod(u_time, LOOP);
  Tc = mod(u_time, CLOOP);
  WIND = 0.62 + 0.38 * (0.5 * osc(3.0, 0.0) + 0.3 * osc(7.0, 1.3) + 0.2 * osc(17.0, 2.1));
  FLUT = WIND * (0.7 + 0.3 * osc(41.0, 0.7));
  SW1 = sin(TAU * fract(330.0 * Tw / LOOP)); CW1 = cos(TAU * fract(330.0 * Tw / LOOP));
  SW2 = sin(TAU * fract(1020.0 * Tw / LOOP)); CW2 = cos(TAU * fract(1020.0 * Tw / LOOP));
  WBP = TAU * fract(1730.0 * Tw / LOOP); GLP = TAU * fract(floor(LOOP * 0.9) * Tw / LOOP);
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.24 * smoothstep(0.15, 0.62, dot(vq, vq) * 1.6);
  vec2 qs = p + u_par * PAR * surfDepth(p.y);
  float dyq = YH - qs.y;
  float zP = CAMH * FOC / max(dyq, 1e-4);
  float hor = smoothstep(-0.75 * PX, 0.75 * PX, dyq);
  float aSurf = dyq > 0.0 ? 1.0 - smoothstep(ZSPLIT - 15.0, ZSPLIT + 15.0, zP) : 0.0;
  float aSea = hor * smoothstep(ZSPLIT - 45.0, ZSPLIT - 15.0, zP);
  if (dyq > 0.0 && zP < 40.0) {
    vec2 G = vec2(qs.x * zP / FOC, zP);
    if (zP - shoreZ(G.x) < 9.0) PSH = palmShadow(G);
  }
  float dither = (h12(gl_FragCoord.xy + fract(Tw) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;

  if (u_layer > -0.5) {
    int k = int(u_layer + 0.5);
    vec4 c = vec4(0.0);
    if (k == 0) c = layerSky(p);
    else if (k == 1) c = layerIslands(p);
    else if (k == 2) c = layerHead(p);
    else if (k == 3) c = layerSea(qs, aSea > 0.0 ? display(surface(qs)) : vec3(0.0), aSea);
    else if (k == 4) c = layerBoats(p);
    else if (k == 5) { if (aSurf > 0.0) c = vec4(display(surface(qs)), 1.0) * aSurf; }
    else if (k == 6) c = layerPalms(p);
    else if (k == 7) c = layerBirds(p);
    fragColor = vec4(c.rgb + dither * c.a, c.a);
    return;
  }

  // full scene: front-to-back "under" compositing, skipping hidden layers
  vec3 acc = vec3(0.0);
  float T = 1.0;
  vec4 c = layerBirds(p);
  acc += T * c.rgb; T *= 1.0 - c.a;
  c = layerPalms(p);
  acc += T * c.rgb; T *= 1.0 - c.a;
  vec3 water = vec3(0.0);
  if (T > 0.001 && (aSurf > 0.0 || aSea > 0.0)) water = display(surface(qs));
  acc += T * aSurf * water; T *= 1.0 - aSurf;
  if (T > 0.001) { c = layerBoats(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerSea(qs, water, aSea); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerHead(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerIslands(p); acc += T * c.rgb; T *= 1.0 - c.a; }
  if (T > 0.001) { c = layerSky(p); acc += T * c.rgb; }
  fragColor = vec4(acc + dither, 1.0);
}
`,
}
