// Window Seat — flying high above a sea of clouds at sunrise.
// (work in progress)

export default {
  id: 'windowseat',
  name: 'Window Seat',
  tag: 'Flying above the clouds',
  accent: '#ffb35c',
  accent2: '#5f8fe0',
  ink: '#8a4a12',
  glow: '#ffd8a8',
  light: false,
  clockColor: '#fff7ee',
  sky: 'linear-gradient(180deg,#0f2a63 0%,#2a5aa6 38%,#9bb0cc 52%,#f4c48c 56%,#8d93ad 60%,#5d6788 78%,#4a5478 100%)',
  layers: [
    { name: 'Stratosphere', depth: 0 },
    { name: 'Cloud towers', depth: 0.05 },
    { name: 'Contrail', depth: 0.12 },
    { name: 'Sea of clouds', depth: 0.3 },
    { name: 'Wing', depth: 1.0 },
    { name: 'Sun glare', depth: 1.3 },
  ],
  clockAfter: 2,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float LOOP = 3600.0;   // master loop (s)
const float FL = 1.3;        // focal length (screen heights)
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float DK = 5.0;        // eye height above the mean cloud-top level (km)
const float RE = 6371.0;     // earth radius (km)
const float CELL = 3.2;      // base cloud cell (km, across the wind)
const float SX = 1.25;       // along-wind stretch
const float PER = 256.0;     // cells per world period
const float WPER = CELL * SX * PER;  // world period along the flight path (km)
const float VEL = WPER / LOOP;       // ground speed (km/s)
const float HMAX = 2.3;      // highest cloud top above the mean level (km)
const float EXPO = 1.0;

float TM;     // u_time folded into LOOP
vec4 DBG = vec4(0.0);
float PX;     // one pixel (screen heights)
float PXA;    // one pixel (radians)
vec3 SUN;     // direction to the sun (world)
vec3 SUNL;    // light direction used for the cloud sea (sun a few degrees higher: long but not total shadows)
vec3 CF, CR, CU;  // camera basis (world)
vec3 SUNC;    // sunlight at the cloud tops
vec3 SUNW;    // sunlight at flight level
vec2 ROCK;    // turbulence: (roll, pitch) of the airframe against the world (rad)
float STROBE; // wing-tip strobe intensity

// ---------------------------------------------------------------- hashing / noise
// cheap 2D integer hash (3 multiplies), 32 random bits per cell
uint ih2(ivec2 c) {
  uvec2 v = uvec2(c);
  uint h = v.x * 0x9E3779B1u + v.y * 0x85EBCA77u;
  h ^= h >> 15;
  h *= 0xC2B2AE3Du;
  h ^= h >> 13;
  h *= 0x27D4EB2Fu;
  h ^= h >> 16;
  return h;
}
vec2 grd(float x, float y) { uint h = ih2(ivec2(int(x), int(y))); return vec2(uvec2(h, h >> 16) & 0xffffu) * (2.0 / 65535.0) - 1.0; }
// loop-periodic oscillator (frequency snapped to LOOP)
float wv(float f, float ph) { return sin(TAU * fract(floor(f * LOOP + 0.5) / LOOP * TM) + ph); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// gradient noise, periodic in x, with analytic derivatives (value, d/dx, d/dy)
vec3 gnD(vec2 p, float per) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  vec2 ga = grd(x0, i.y), gb = grd(x1, i.y), gc = grd(x0, i.y + 1.0), gd = grd(x1, i.y + 1.0);
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - 1.0);
  float k = va - vb - vc + vd;
  float v = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k;
  vec2 d = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(vb, vc) - va);
  return vec3(v, d);
}
float gn(vec2 p, float per) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  float va = dot(grd(x0, i.y), f), vb = dot(grd(x1, i.y), f - vec2(1.0, 0.0));
  float vc = dot(grd(x0, i.y + 1.0), f - vec2(0.0, 1.0)), vd = dot(grd(x1, i.y + 1.0), f - 1.0);
  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}

// ---------------------------------------------------------------- cloud sea
// Cloud-top height (km above the mean level) at world position w (km, x along
// the flight path, already advected). Octave 0 makes separate cumulus heaps,
// the next ones pile cauliflower lumps on them; octaves 0..2 shape the march,
// the finer ones only shade.
// Cumulus are built from puffs: each octave is a jittered grid of hemispherical
// caps (nearest 2x2 cells), and every octave piles smaller caps on the last.
const float ASP = 0.5;   // puff height / radius
vec3 puffs(vec2 s, float per, float cov, float rmin, float soft) {
  vec2 i = floor(s - 0.5);
  float acc = 0.0;
  vec2 gacc = vec2(0.0);
  for (int j = 0; j < 4; j++) {
    vec2 c = i + vec2(float(j & 1), float(j >> 1));
    uint hh = ih2(ivec2(int(mod(c.x, per)), int(c.y)));
    vec4 r = vec4(uvec4(hh, hh >> 8, hh >> 16, hh >> 24) & 0xffu) * (1.0 / 255.0);
    vec2 d = s - (c + 0.5 + (r.xy - 0.5) * 0.5);
    float R = mix(rmin, 0.6, r.z) * smoothstep(r.w - 0.12, r.w + 0.12, cov);   // coverage grows/shrinks puffs smoothly
    float q = max(R * R - dot(d, d), 0.0);
    float in0 = step(1e-7, q);
    // hemispherical cap (heaps) or a soft paraboloid (fine cauliflower)
    float hs = sqrt(q + 0.01) - 0.1;
    float h = mix(hs, q / max(R, 1e-3), soft);
    vec2 gh = mix(-d / (hs + 0.1), -2.0 * d / max(R, 1e-3), soft) * in0;
    // soft union, independent of cell order (p-norm of the caps)
    float h2 = h * h;
    acc += h2 * h2;
    gacc += h2 * h * gh;
  }
  float H = sqrt(sqrt(acc));
  return vec3(H, gacc / max(H * H * H, 1e-6));
}
// envelope: warped octave-0 coords, and (heap coverage, heap amplitude, regional offset)
void envelope(vec2 s, out vec2 s0, out vec3 e) {
  vec3 tg = gnD(s * 0.25 + vec2(0.0, 11.3), PER * 0.25);
  float m = tg.x;
  s0 = s + 0.9 * tg.yz;
  e = vec3(0.4 + 0.6 * m, 0.75 + 0.7 * smoothstep(0.1, 0.5, m), 0.5 * m - 0.1);
}
float deckLo(vec2 w, float oc) {
  vec2 s = vec2(w.x / (CELL * SX), w.y / CELL), s0;
  vec3 e;
  envelope(s, s0, e);
  float H = e.z + ASP * CELL * e.y * puffs(s0, PER, e.x, 0.3, 0.0).x;
  s = vec2(2.0 * s.x + 0.73 * s.y, 2.0 * s.y + 5.31);
  float a = ASP * CELL * 0.5 * (0.3 + 0.7 * e.y), per = PER * 2.0;
  for (int i = 1; i < 3; i++) {
    float wt = clamp(oc - float(i), 0.0, 1.0);
    if (wt <= 0.0) break;
    H += wt * a * puffs(s, per, 0.9, 0.35, 0.0).x;
    s = vec2(2.0 * s.x - 0.73 * s.y, 2.0 * s.y + 5.31);
    per *= 2.0;
    a *= 0.5;
  }
  return H;
}
// the same surface split for the march: heaps (x) and an upper bound of what the
// finer lumps can add (y); the lumps themselves only when the ray is that close
const float PUFMAX = 0.75;   // highest a puff union can reach (in puff units)
vec2 deckHeaps(vec2 w, float oc, out vec2 sF, out float aF) {
  vec2 s = vec2(w.x / (CELL * SX), w.y / CELL), s0;
  vec3 e;
  envelope(s, s0, e);
  float H = e.z + ASP * CELL * e.y * puffs(s0, PER, e.x, 0.3, 0.0).x;
  sF = vec2(2.0 * s.x + 0.73 * s.y, 2.0 * s.y + 5.31);
  aF = ASP * CELL * 0.5 * (0.3 + 0.7 * e.y);
  return vec2(H, PUFMAX * aF * (clamp(oc - 1.0, 0.0, 1.0) + 0.5 * clamp(oc - 2.0, 0.0, 1.0)));
}
float deckLumps(vec2 s, float a, float oc) {
  float H = 0.0, per = PER * 2.0;
  for (int i = 1; i < 3; i++) {
    float wt = clamp(oc - float(i), 0.0, 1.0);
    if (wt <= 0.0) break;
    H += wt * a * puffs(s, per, 0.9, 0.35, 0.0).x;
    s = vec2(2.0 * s.x - 0.73 * s.y, 2.0 * s.y + 5.31);
    per *= 2.0;
    a *= 0.5;
  }
  return H;
}

// full-detail height and gradients: (H, dH/dx, dH/dz) in km and km/km, and the
// gradient of the diffusion-smoothed surface (features > ~300 m) in gS
vec3 deckHi(vec2 w, float oct, float oc, float fpv, vec3 rd, out vec2 gS, out float h4, out float h1) {
  vec2 k = vec2(1.0 / (CELL * SX), 1.0 / CELL);
  vec2 s = vec2(w.x / (CELL * SX), w.y / CELL), s0;
  vec3 e;
  envelope(s, s0, e);
  vec3 pf = puffs(s0, PER, e.x, 0.3, 0.0);
  float A0 = ASP * CELL * e.y;
  float H = e.z + A0 * pf.x;
  h1 = H;
  vec2 g = A0 * pf.yz;                      // warp Jacobian neglected
  float a = ASP * CELL * 0.5 * (0.3 + 0.7 * e.y), per = PER * 2.0;
  mat2 M = mat2(2.0, 0.0, 0.73, 2.0);
  s = M * s + vec2(0.0, 5.31);
  mat2 J = M;
  gS = vec2(0.0);
  h4 = H;
  for (int i = 1; i < 10; i++) {
    if (i == 3) {
      // detail budget from the true footprint: surfaces seen edge-on get fewer octaves
      vec3 np = normalize(vec3(-g.x * k.x, 1.0, -g.y * k.y));
      oct = min(oct, log2(CELL * max(dot(np, -rd), 0.06) / (2.0 * fpv)));
    }
    float wt = clamp((i < 3 ? oc : oct) - float(i), 0.0, 1.0);
    if (wt <= 0.0) break;
    if (i == 4) { gS = g; h4 = H; }
    vec3 d = i < 3 ? puffs(s, per, 0.9, 0.35, 0.0) : puffs(s, per, 0.72, 0.2, 1.0);
    float aw = a * wt * (i < 3 ? 1.0 : 0.65);
    H += aw * d.x;
    g += aw * (transpose(J) * d.yz);
    M = mat2(2.0, 0.0, (i % 2 == 1) ? -0.73 : 0.73, 2.0);
    s = M * s + vec2(0.0, 5.31);
    J = M * J;
    per *= 2.0;
    a *= 0.5;
  }
  if (oct < 4.0) { gS = g; h4 = H; }
  gS *= k;
  return vec3(H, g * k);
}

// ---------------------------------------------------------------- sky
float hgP(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

vec3 skyCol(vec3 r) {
  float e = r.y;
  float mu = dot(r, SUN);
  vec2 hz = normalize(r.xz + vec2(1e-5, 0.0));
  float az = 0.5 + 0.5 * dot(hz, normalize(SUN.xz));   // 1 towards the sun
  float w = az * az * az;
  float eh = max(e + 0.04, 0.0);                        // above the cloud horizon
  vec3 zen = vec3(0.026, 0.07, 0.25);
  vec3 mid = vec3(0.12, 0.22, 0.48);
  vec3 low = mix(vec3(0.36, 0.34, 0.46), vec3(1.0, 0.66, 0.36), w);
  vec3 hor = mix(vec3(0.62, 0.43, 0.42), vec3(2.6, 1.05, 0.32), w);
  vec3 c = mix(mid, zen, smoothstep(0.06, 0.42, eh));
  c = mix(low, c, smoothstep(0.0, 0.17, eh));
  c = mix(hor, c, smoothstep(0.0, 0.04, eh));
  // aureole
  float ang = acos(clamp(mu, -1.0, 1.0));
  c += vec3(1.0, 0.7, 0.4) * (2.2 * exp(-ang / 0.02) + 0.55 * exp(-ang / 0.08)) + vec3(1.0, 0.55, 0.25) * 0.18 * exp(-ang / 0.3) * exp(-eh * 5.0);
  return c;
}

// ---------------------------------------------------------------- tone
vec3 acesFit(vec3 c) {
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 encodeC(vec3 c) {
  c *= EXPO;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return srgb(clamp(c, 0.0, 1.0));
}

// ---------------------------------------------------------------- layers
vec3 camRay(vec2 q) { return normalize(q.x * CR + (q.y - 0.5) * CU + FL * CF); }
// the outside world, rocked by turbulence relative to the airframe
vec3 worldRay(vec2 q) {
  vec3 r = camRay(q);
  return normalize(r + ROCK.x * cross(CF, r) + ROCK.y * cross(CR, r));
}

// environment seen in reflections: sky above the cloud horizon, the sunlit sea of clouds below
vec3 envCol(vec3 r) {
  vec3 hz = skyCol(vec3(r.x, max(r.y, -0.035), r.z));
  if (r.y > -0.035) return hz;
  float k = smoothstep(-0.035, -0.3, r.y);
  vec3 deck = vec3(0.08, 0.15, 0.38) * 0.55 + SUNC * 0.28;
  return mix(hz * 0.8, deck, k);
}

vec4 skyLayer(vec2 q) {
  vec3 r = worldRay(q);
  vec3 c = skyCol(r);
  float mu = dot(r, SUN);
  float ang = acos(clamp(mu, -1.0, 1.0));
  const float SR = 0.0058;
  float disc = clamp((SR - ang) / PXA + 0.5, 0.0, 1.0);
  float limb = sqrt(max(1.0 - ang * ang / (SR * SR), 0.0));
  c += vec3(1.0, 0.8, 0.55) * 90.0 * disc * (0.55 + 0.45 * limb);
  return vec4(c, 1.0);
}

vec4 deckLayer(vec2 q) {
  vec3 rd = worldRay(q);
  vec3 ro = vec3(0.0);
  float c2 = dot(rd.xz, rd.xz);
  float A = c2 / (2.0 * RE);
  // entry through the highest cloud tops
  float C0 = DK - HMAX;
  float disc = rd.y * rd.y - 4.0 * A * C0;
  if (rd.y >= 0.0 || disc <= 0.0) return vec4(0.0);
  float sq = sqrt(disc);
  float t = (-rd.y - sq) / (2.0 * A);
  float tEnd = (-rd.y + sq) / (2.0 * A);
  float adv = TM * VEL;   // we fly towards -x: the world streams aft (+x)
  float gPrev = 1e9, tPrev = t;
  bool hit = false;
  float gHit = 0.0;
  float minM = 1e9;
  float tm = t;
  // octave budget for the march, fixed per ray (a per-step LOD would ripple the surface)
  float oc = clamp(3.0 - t / 45.0, 1.0, 2.5);
  float nst = 0.0;
  for (int i = 0; i < 56; i++) {
    nst += 1.0;
    vec3 P = ro + rd * t;
    vec2 sF;
    float aF;
    vec2 H0 = deckHeaps(vec2(P.x - adv, P.z), oc, sF, aF);
    float g = P.y + DK - H0.x + t * t * A;
    // the finer lumps only matter once the ray is within their reach
    if (g < H0.y) {
      // octave 1, then octave 2 only if the ray is within its reach too
      float w1 = clamp(oc - 1.0, 0.0, 1.0), w2 = clamp(oc - 2.0, 0.0, 1.0);
      g -= w1 * aF * puffs(sF, PER * 2.0, 0.9, 0.35, 0.0).x;
      if (w2 > 0.0 && g < PUFMAX * 0.5 * aF * w2)
        g -= w2 * 0.5 * aF * puffs(vec2(2.0 * sF.x - 0.73 * sF.y, 2.0 * sF.y + 5.31), PER * 4.0, 0.9, 0.35, 0.0).x;
    }
    if (g < 0.0) { hit = true; gHit = g; break; }
    float mm = g / (t * PXA);
    if (mm < minM) { minM = mm; tm = t; }
    gPrev = g; tPrev = t;
    float desc = -(rd.y + 2.0 * A * t);
    // bold steps (overshoot is caught by the refinement), horizontally capped so
    // they cannot tunnel through a heap
    float dt = g / max(desc + 0.04, 0.02);
    dt = clamp(dt, 0.03 + 0.008 * t, 0.4 + 0.015 * t);
    t += dt;
    if (t > tEnd) break;
  }
  float alpha = 1.0;
  if (!hit && t <= tEnd) { hit = true; gHit = -0.001; }   // ran out of steps skimming a top: call it a hit
  if (hit) {
    // secant refinement
    float tH = t;
    for (int k = 0; k < 3; k++) {
      float tn = tPrev + (tH - tPrev) * clamp(gPrev / (gPrev - gHit), 0.1, 0.9);
      vec3 P = rd * tn;
      float g = P.y + DK - deckLo(vec2(P.x - adv, P.z), oc) + tn * tn * A;
      if (g < 0.0) { tH = tn; gHit = g; } else { tPrev = tn; gPrev = g; }
    }
    t = tPrev + (tH - tPrev) * gPrev / (gPrev - gHit);
  } else {
    alpha = clamp(1.0 - minM, 0.0, 1.0);
    if (alpha <= 0.0) return vec4(0.0);
    t = tm;
  }
  vec3 P = ro + rd * t;
  vec2 w = vec2(P.x - adv, P.z);
  float fpv = t * PXA;
  float oct = clamp(log2(CELL / (2.0 * fpv)), 2.0, 10.0);
  vec2 gS;
  float h4, hl;
  vec3 hd = deckHi(w, oct, oc, fpv, rd, gS, h4, hl);
  vec3 n = normalize(vec3(-hd.y, 1.0, -hd.z));
  vec3 nS = normalize(vec3(-gS.x, 1.0, -gS.y));
  // optical depth towards the sun through the coarse cloud field: thin cloud
  // lets light through, big heaps cast long blue shadows
  float dep = 0.0;
  float st = 0.05, sl = 0.05;
  for (int i = 0; i < 7; i++) {
    vec3 Q = P + SUNL * st;
    float d2 = dot(Q.xz, Q.xz);
    float inside = deckLo(vec2(Q.x - adv, Q.z), i < 2 ? 1.6 : 1.0) - d2 / (2.0 * RE) - DK - Q.y;
    dep += sl * clamp(inside / 0.12, 0.0, 1.0);
    sl = st * 0.9;
    st *= 2.05;
  }
  float Tsun = exp(-dep * 2.2);
  DBG = vec4(Tsun, n.x * 0.5 + 0.5, n.z * 0.5 + 0.5, nst / 40.0);
  // local terminator on the puffs (light wraps a little: it diffuses inside)
  float loc = smoothstep(-0.2, 0.4, mix(dot(nS, SUNL), dot(n, SUNL), 0.6));
  // cavities between puffs at two scales
  float ao = clamp(0.5 + (hd.x - h4) / 0.09, 0.35, 1.0) * clamp(0.75 + 0.5 * (h4 - hl), 0.45, 1.1);
  vec3 amb = vec3(0.05, 0.11, 0.32) * 0.85 * (0.55 + 0.45 * n.y) * ao;
  float mu = dot(rd, SUN);
  float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.0);
  vec3 col = SUNC * Tsun * (0.05 + 0.95 * loc) * mix(0.7, 1.0, ao) + amb;
  // forward scattering: silver edges and a glowing path under the sun
  col += SUNC * min(hgP(mu, 0.7), 1.5) * 0.35 * (0.3 + 0.7 * rim) * mix(0.25, 1.0, Tsun);
  // aerial perspective
  // (short, steep paths in-scatter mostly Rayleigh blue; long grazing ones take the horizon glow)
  float T = exp(-t / 200.0);
  vec3 hz = mix(vec3(0.13, 0.2, 0.38), 0.62 * skyCol(normalize(vec3(rd.x, 0.0, rd.z))), 1.0 - exp(-t / 90.0));
  col = col * T + hz * (1.0 - T);
  return vec4(col, 1.0) * alpha;
}


// ---------------------------------------------------------------- distant cumulonimbus
// Billboards standing on the cloud sea 110-290 km out, drifting aft as we fly.
// Ordered far to near so overlapping towers composite correctly.
const int NT = 8;
float ADV;   // distance flown this loop (km)
vec4 towerP(int i, out vec2 sd) {
  float fi = float(i);
  vec4 h = vec4(h12(vec2(fi, 1.3)), h12(vec2(fi, 7.1)), h12(vec2(fi, 3.9)), h12(vec2(fi, 9.4)));
  sd = vec2(h12(vec2(fi, 5.5)), h12(vec2(fi, 2.2)));
  float X = (mod(fi * 3.0, float(NT)) + 0.15 + 0.7 * h.x) * WPER / float(NT);
  float dist = 290.0 - 22.0 * fi - 10.0 * h.y;
  return vec4(X, dist, 8.0 + 4.0 * h.z, 5.5 + 5.0 * h.w);   // track position, outward distance, height, column half-width (km)
}
float billow2(vec2 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * abs(gn(p, 1e5));
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1;
    a *= 0.5;
  }
  return v;
}
// signed distance-like field of a cumulonimbus in its billboard plane (km), <0 inside
float cbField(vec2 q, float H, float W, vec2 sd, int oct) {
  float hv = q.y / H;
  float x = q.x - (0.1 + 0.25 * sd.x) * q.y;                     // lean downwind
  // column: wide base, cauliflower turrets, narrowing a little with height
  float col = W * (0.75 - 0.25 * hv);
  float dCol = max(abs(x) - col, q.y - H * 0.86);
  dCol = min(dCol, length(vec2(x, max(q.y - H * 0.8, 0.0))) - col * 0.9);
  // anvil: flattened lens at the tropopause, sheared downwind
  float aw = W * (1.6 + 1.6 * sd.y);
  vec2 ac = vec2(x - aw * 0.35, (q.y - H * 0.93) * (aw / (H * 0.075)));
  float dAnv = (length(ac) - aw) * (H * 0.075) / aw;
  float d = min(dCol, dAnv);
  float tops = smoothstep(0.75, 0.95, hv);
  // billows: crisp cauliflower on the column, smoother streaky anvil
  float b = billow2(q * vec2(0.55, 0.65) + sd * 40.0, oct);
  d += mix(1.4, 0.5, tops) * (0.45 - b);
  return d;
}
vec4 towersLayer(vec2 q) {
  vec3 rd = worldRay(q);
  if (rd.y < -0.06 || rd.y > 0.09) return vec4(0.0);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < NT; i++) {
    vec2 sd;
    vec4 tp = towerP(i, sd);
    float xr = mod(tp.x + ADV + 0.5 * WPER, WPER) - 0.5 * WPER;
    vec3 C = vec3(xr, -DK - (xr * xr + tp.y * tp.y) / (2.0 * RE) + 0.2, -tp.y);
    vec3 nb = normalize(vec3(C.x, 0.0, C.z));
    float dn = dot(rd, nb);
    if (dn <= 0.0) continue;
    float t = dot(C, nb) / dn;
    vec3 P = rd * t;
    vec3 lat = vec3(-nb.z, 0.0, nb.x);
    vec2 uv = vec2(dot(P - C, lat), P.y - C.y);
    float H = tp.z, W = tp.w;
    if (abs(uv.x) > W * 5.0 || uv.y > H * 1.15 || uv.y < -2.0) continue;
    float px = t * PXA;
    int oct = int(clamp(log2(1.6 / px), 2.0, 5.0));
    float d = cbField(uv, H, W, sd, oct);
    float dens = clamp(0.5 - d / max(0.35, 1.5 * px), 0.0, 1.0);
    if (dens <= 0.0) continue;
    float e = 0.25;
    float dx = cbField(uv + vec2(e, 0.0), H, W, sd, oct) - d;
    float dy = cbField(uv + vec2(0.0, e), H, W, sd, oct) - d;
    vec2 g2 = normalize(vec2(dx, dy) + 1e-5);
    float bul = sqrt(clamp(-d / 1.6, 0.0, 1.0));                  // bulge towards us inside
    vec3 n = normalize((g2.x * lat + g2.y * vec3(0.0, 1.0, 0.0)) * sqrt(1.0 - bul * bul) - nb * bul);
    float ndl = dot(n, SUN);
    float lit = smoothstep(-0.35, 0.6, ndl);
    float hv = clamp(uv.y / H, 0.0, 1.0);
    vec3 sunT = mix(vec3(1.0, 0.46, 0.2), vec3(1.0, 0.6, 0.38), hv) * 1.5;   // tops catch whiter light
    float mu = dot(rd, SUN);
    float edge = 1.0 - bul;
    vec3 c = sunT * lit * (0.6 + 0.4 * hv) + vec3(0.06, 0.12, 0.32) * (0.7 + 0.3 * g2.y) + sunT * hgP(mu, 0.75) * 1.5 * edge * edge;
    // aerial perspective towards the horizon glow
    float dist = length(C);
    float T = exp(-dist / 170.0);
    c = c * T + 0.8 * skyCol(normalize(vec3(rd.x, max(rd.y, -0.03), rd.z))) * (1.0 - T);
    acc = vec4(c, 1.0) * dens + acc * (1.0 - dens);
  }
  return acc;
}

// ---------------------------------------------------------------- contrail (another airliner passes every few minutes)
const float PCT = 450.0;   // traffic cycle (s), 8 per loop
vec4 contrailLayer(vec2 q) {
  vec3 rd = worldRay(q);
  if (rd.y < -0.03 || rd.y > 0.16) return vec4(0.0);
  vec4 acc = vec4(0.0);
  for (int k = 1; k >= 0; k--) {
    float cyc = floor(TM / PCT) - float(k);
    float tau = TM - cyc * PCT;
    float ci = mod(cyc, LOOP / PCT);
    vec4 h = vec4(h12(vec2(ci, 4.1)), h12(vec2(ci, 8.3)), h12(vec2(ci, 1.7)), h12(vec2(ci, 6.6)));
    if (h.x > 0.72) continue;                              // quiet cycle
    float dist = 24.0 + 20.0 * h.y;
    float alt = 0.9 + 1.4 * h.z;
    float ang = (h.w - 0.5) * 0.6;
    vec3 Vo = 0.235 * vec3(cos(ang), 0.0, sin(ang));       // opposite direction, slightly oblique
    vec3 Vus = vec3(-VEL, 0.0, 0.0);
    vec3 o0 = vec3(-0.5 * dist - 4.0, alt, -dist);
    // trail line (camera-relative now), parameter s = emission time
    vec3 A = o0 - Vus * tau;
    vec3 B = Vo;
    float b = dot(rd, B), c = dot(B, B), dd = dot(rd, -A), e = dot(B, -A);
    float den = c - b * b;
    float s = (b * dd - e) / den;      // closest emission time on the infinite line
    s = clamp(s, 0.0, tau - 0.4);
    vec3 Ls = A + B * s;
    float tr = max(dot(Ls, rd), 0.1);
    float dperp = length(rd * tr - Ls);
    float age = tau - s;
    float w = 0.022 + 0.0032 * age;                         // spreading (km)
    float pxk = tr * PXA;
    float ww = max(w, 0.7 * pxk);
    // Crow instability: lumps along older trail, slight waviness
    float lump = 0.75 + 0.25 * sin(s * 2.1 + 3.0 * h.y) * smoothstep(40.0, 120.0, age);
    float dens = exp(-dperp * dperp / (ww * ww)) * (w / ww) * exp(-age / 210.0) * 0.9 * lump;
    dens *= smoothstep(0.0, 1.5, age) * step(0.0, tau - 0.4);
    // the airliner itself: a dark speck with a glint, at the head of the trail
    vec3 Pp = A + B * tau;
    float tp = max(dot(Pp, rd), 0.1);
    float dp = length(rd * tp - Pp);
    float sp = max(0.022, 0.8 * tp * PXA);
    float body = exp(-dp * dp / (sp * sp)) * 0.9;
    vec3 lc = vec3(1.0, 0.74, 0.5) * 1.6 * (0.55 + 0.45 * smoothstep(-0.2, 0.6, dot(normalize(cross(B, vec3(0.0, 1.0, 0.0))), SUN)));
    float mu = dot(rd, SUN);
    lc += vec3(1.0, 0.7, 0.45) * hgP(mu, 0.8) * 3.0;
    lc += vec3(0.06, 0.12, 0.3);
    vec3 col = lc;
    float a = clamp(dens, 0.0, 1.0);
    vec3 pc = vec3(0.05, 0.06, 0.08) + vec3(2.5, 2.2, 1.8) * exp(-dp * dp / (0.3 * sp * sp)) * 0.6;
    col = mix(col, pc, body / max(a + body, 1e-3));
    a = max(a, body);
    float T = exp(-tr / 170.0);
    col = col * T + 0.8 * skyCol(rd) * (1.0 - T);
    acc = vec4(col, 1.0) * a + acc * (1.0 - a);
  }
  return acc;
}

// ---------------------------------------------------------------- wing (metres; eye at the origin)
// Swept wing seen from a window just ahead of it, looking out and slightly aft.
// The planform lies in a plane (dihedral + turbulence flex); the upper surface
// takes its normal from the airfoil; a curved blend leads into a canted sharklet.
const vec3 WR0 = vec3(1.7, -2.0, -1.2);       // leading edge at the wing root
const float SPAN0 = 14.4;                     // root to the start of the winglet blend
const float BRAD = 0.6;                       // blend radius
const float KAP = 0.16;                       // winglet cant
const float HWL = 2.3;                        // winglet height
const float CR0 = 6.4, CTP = 1.6, CWT = 0.55; // root, tip and winglet-tip chords
const float TLE = 0.52, TLB = 0.95, TLW = 1.35; // leading-edge sweep (tan): wing, blend, winglet
const vec3 WX = vec3(1.0, 0.0, 0.0);          // chord direction (aft)
vec3 WS, WU;                                  // span direction, wing-plane normal

// upper-surface slope of the airfoil (thickness/chord tau) at chord fraction xi
float foilSlope(float xi, float tau) {
  xi = max(xi, 0.0004);
  return 5.0 * tau * (0.14845 / sqrt(xi) - 0.126 - 0.7032 * xi + 0.8529 * xi * xi - 0.406 * xi * xi * xi) - 0.035;
}
float ggx(float nh, float a) { float a2 = a * a; float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float lineAA(float d, float w) { float fw = fwidth(d) + 1e-5; return clamp((w - abs(d)) / fw + 0.5, 0.0, 1.0); }

vec3 shadeMetal(vec3 P, vec3 n, vec3 rd, vec3 alb, float rough, float f0, float occ) {
  vec3 V = -rd;
  float nv = max(dot(n, V), 1e-3);
  float nl = max(dot(n, SUN), 0.0);
  vec3 H = normalize(SUN + V);
  float F = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
  float Fs = f0 + (1.0 - f0) * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  float a = rough * rough;
  float k = a * 0.5;
  float G = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  float spec = ggx(max(dot(n, H), 0.0), a) * Fs * G / (4.0 * nv + 1e-3);
  // hemisphere: deep blue stratosphere above, bright sunlit cloud sea below
  vec3 up = vec3(0.19, 0.23, 0.37);
  vec3 dn = vec3(0.08, 0.15, 0.38) * 0.5 + SUNC * 0.22;
  vec3 amb = mix(dn, up, 0.5 + 0.5 * n.y);
  vec3 R = reflect(rd, n);
  vec3 env = envCol(normalize(mix(R, n, rough * rough)));
  vec3 col = alb * (1.0 - F) * (SUNW * nl + amb) * occ;
  col += env * F * mix(1.0, 0.55, rough) * occ + SUNW * spec;
  return col;
}

// strobe and navigation-light positions (world, metres)
vec3 tipPoint(float xi, float up) {
  return WR0 + SPAN0 * WS + WX * (TLE * SPAN0 + xi * CTP) + WU * up;
}

vec4 wingLayer(vec2 q) {
  vec3 rd = camRay(q);
  // ---- main wing panel
  float dn = dot(rd, WU);
  float tW = dot(WR0, WU) / dn;
  vec3 P = rd * tW;
  vec3 d = P - WR0;
  float u = dot(d, WS), x = dot(d, WX);
  float le = TLE * u, ch = CR0 + (CTP - CR0) * u / SPAN0;
  float teS = TLE + (CTP - CR0) / SPAN0;
  float sdW = min((x - le) * inversesqrt(1.0 + TLE * TLE), (le + ch - x) * inversesqrt(1.0 + teS * teS));
  float aW = clamp(sdW / (fwidth(sdW) + 1e-5) + 0.5, 0.0, 1.0) * step(0.0, tW) * step(u, SPAN0 + 0.01) * step(0.0, u + 3.0);
  // ---- blend: quarter cylinder along the chord
  vec3 CB = WR0 + SPAN0 * WS + BRAD * WU;
  vec2 o2 = vec2(dot(-CB, WS), dot(-CB, WU)), d2 = vec2(dot(rd, WS), dot(rd, WU));
  float qa = dot(d2, d2), qb = dot(o2, d2), qc = dot(o2, o2) - BRAD * BRAD;
  float qd = qb * qb - qa * qc;
  float tB = (-qb + sqrt(max(qd, 0.0))) / qa;
  vec2 s2 = o2 + tB * d2;
  float th = atan(s2.x, -s2.y);
  vec3 PB = rd * tB;
  float xB = dot(PB - WR0, WX);
  float thE = 0.5 * PI - KAP;
  float leB = TLE * SPAN0 + TLB * BRAD * th;
  float sdB = min(xB - leB, leB + CTP - xB) * 0.8;
  float aB = clamp(sdB / (fwidth(sdB) + 1e-5) + 0.5, 0.0, 1.0) * step(0.0, qd) * step(0.0, th) * step(th, thE);
  // ---- winglet
  vec3 E = CB + BRAD * (cos(KAP) * WS - sin(KAP) * WU);
  vec3 WD = sin(KAP) * WS + cos(KAP) * WU;
  vec3 WNL = -cos(KAP) * WS + sin(KAP) * WU;
  float tL = dot(E, WNL) / dot(rd, WNL);
  vec3 PL = rd * tL;
  float h = dot(PL - E, WD);
  float xL = dot(PL - WR0, WX);
  float leL = TLE * SPAN0 + TLB * BRAD * thE + TLW * h;
  float chL = CTP + (CWT - CTP) * h / HWL;
  float sdL = min(min(xL - leL, leL + chL - xL) * 0.6, (HWL - h) * 1.5);
  float aL = clamp(sdL / (fwidth(sdL) + 1e-5) + 0.5, 0.0, 1.0) * step(0.0, h) * step(0.0, tL);

  vec4 acc = vec4(0.0);
  // shade each visible piece (they barely overlap on screen; composite nearest first)
  vec4 cW = vec4(0.0), cB = vec4(0.0), cL = vec4(0.0);
  if (aW > 0.0) {
    float xi = clamp((x - le) / ch, 0.0, 1.0);
    float tau = mix(0.13, 0.105, u / SPAN0);
    float fs = foilSlope(xi, tau);
    vec3 n = WU - fs * WX + fs * (TLE + xi * (CTP - CR0) / SPAN0) * WS;
    // skin oil-canning between ribs and stringers (subtle reflection ripple)
    n += 0.006 * sin(TAU * u / 0.56) * WS + 0.004 * sin(TAU * x / 0.21) * WX * step(0.13, xi);
    n = normalize(n);
    // panels: slats, spar line, spoilers, flaps and aileron, skin joints
    float pl = 0.0;
    pl = max(pl, lineAA(xi - 0.12, 0.0035 * 6.0 / ch));
    pl = max(pl, lineAA(xi - 0.64, 0.003 * 6.0 / ch) * step(1.5, u));
    pl = max(pl, lineAA(xi - 0.79, 0.004 * 6.0 / ch));
    float sp = fract((u - 4.2) / 1.45);
    pl = max(pl, lineAA((sp - 0.5) * 1.45, 0.012) * step(0.64, xi) * step(xi, 0.79) * step(4.2, u) * step(u, 11.5));
    pl = max(pl, lineAA(u - 11.0, 0.014) * step(0.79, xi));
    pl = max(pl, lineAA(u - 5.6, 0.014) * step(0.79, xi));
    pl = max(pl, lineAA(fract(u / 1.9 + 0.3) * 1.9 - 0.95, 0.006) * step(0.13, xi) * step(xi, 0.63) * 0.5);
    vec3 alb = vec3(0.66, 0.68, 0.71);
    alb = mix(alb, vec3(0.72, 0.73, 0.75), step(xi, 0.12));               // bare-metal slats
    alb *= 0.93 + 0.07 * gn(vec2(x * 0.35, u * 1.7) + 3.0, 1e4);         // paint / grime streaks
    alb *= 0.95 + 0.05 * step(0.5, fract(floor(u / 1.9 + 0.3) * 0.37));
    float rough = mix(0.32, 0.22, step(xi, 0.12));
    vec3 c = shadeMetal(P, n, rd, alb, rough, mix(0.04, 0.12, step(xi, 0.12)), 1.0);
    c *= 1.0 - 0.55 * pl;
    cW = vec4(c, 1.0) * aW;
  }
  if (aB > 0.0) {
    float xi = clamp((xB - leB) / CTP, 0.0, 1.0);
    vec3 nB = normalize(-(s2.x * WS + s2.y * WU));
    vec3 n = normalize(nB - foilSlope(xi, 0.1) * WX);
    float k = smoothstep(0.2, 1.2, th);
    vec3 alb = mix(vec3(0.60, 0.62, 0.655), vec3(0.03, 0.06, 0.15), k);
    vec3 c = shadeMetal(PB, n, rd, alb, mix(0.3, 0.2, k), 0.045, 1.0);
    cB = vec4(c, 1.0) * aB;
  }
  if (aL > 0.0) {
    float xi = clamp((xL - leL) / chL, 0.0, 1.0);
    vec3 n = normalize(WNL - foilSlope(xi, 0.1) * WX);
    vec3 alb = mix(vec3(0.028, 0.055, 0.14), vec3(0.05, 0.1, 0.24), smoothstep(0.0, HWL, h));
    alb = mix(alb, vec3(0.75, 0.5, 0.18), lineAA(h - 0.35 - 0.25 * xi, 0.05) * 0.9);   // livery stripe
    vec3 c = shadeMetal(PL, n, rd, alb, 0.2, 0.05, 1.0);
    cL = vec4(c, 1.0) * aL;
  }
  // strobe flash lighting the tip
  vec3 Sp = tipPoint(1.0, 0.05);
  if (STROBE > 0.0) {
    vec3 Pn = aW > 0.0 ? P : aB > 0.0 ? PB : PL;
    float dd = length(Pn - Sp);
    vec3 fl = vec3(1.0, 0.98, 0.95) * STROBE * 4.0 / (dd * dd + 0.3);
    cW.rgb += fl * cW.a * 0.6; cB.rgb += fl * cB.a * 0.6; cL.rgb += fl * cL.a * 0.6;
  }
  // nearest first
  float zW = aW > 0.0 ? tW : 1e9, zB = aB > 0.0 ? tB : 1e9, zL = aL > 0.0 ? tL : 1e9;
  vec4 a0 = cW, a1 = cB, a2 = cL;
  float z0 = zW, z1 = zB, z2 = zL;
  if (z1 < z0) { vec4 tc = a0; a0 = a1; a1 = tc; float tz = z0; z0 = z1; z1 = tz; }
  if (z2 < z1) { vec4 tc = a1; a1 = a2; a2 = tc; float tz = z1; z1 = z2; z2 = tz; }
  if (z1 < z0) { vec4 tc = a0; a0 = a1; a1 = tc; }
  acc = a0;
  acc += (1.0 - acc.a) * a1;
  acc += (1.0 - acc.a) * a2;
  return acc;
}

// ---------------------------------------------------------------- glare (sun bloom, wing lights)
vec3 lightGlow(vec2 q, vec3 Lw, vec3 col, float I, float sz) {
  vec3 r = camRay(q);
  vec3 dl = normalize(Lw);
  float a = acos(clamp(dot(r, dl), -1.0, 1.0)) * FL;   // screen heights
  return col * I * (exp(-a / (sz * 0.12)) + 0.25 * exp(-a / sz));
}
vec3 glareLayer(vec2 q) {
  vec3 r = worldRay(q);
  float a = acos(clamp(dot(r, SUN), -1.0, 1.0)) * FL;
  vec3 g = vec3(1.0, 0.78, 0.5) * (0.9 * exp(-a / 0.012) + 0.22 * exp(-a / 0.05) + 0.035 * exp(-a / 0.22));
  // navigation light (green, steady) and strobe
  g += lightGlow(q, tipPoint(-0.02, 0.62), vec3(0.25, 1.0, 0.45), 0.9, 0.012);
  g += lightGlow(q, tipPoint(1.0, 0.05), vec3(1.0, 0.98, 0.95), STROBE * 6.0, 0.04);
  return g;
}

void main() {
  TM = mod(u_time, LOOP);
  ADV = TM * VEL;
  PX = 1.0 / u_res.y;
  PXA = PX / FL;
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  int lay = u_layer < 0.0 ? -1 : int(u_layer + 0.5);
  bool full = lay < 0;

  // camera: right-hand window just ahead of the wing, looking out and a little aft
  float yaw = -0.26, pitch = -0.02;
  vec3 f0 = vec3(-sin(yaw), 0.0, -cos(yaw));
  CR = vec3(cos(yaw), 0.0, -sin(yaw));
  CF = f0 * cos(pitch) + vec3(0.0, 1.0, 0.0) * sin(pitch);
  CU = cross(CR, CF);

  // turbulence: gentle, irregular rocking with bumpier spells (loop-periodic)
  float env = 0.45 + 0.55 * smoothstep(-0.3, 0.9, wv(1.0 / 97.0, 0.4) * 0.6 + wv(1.0 / 41.0, 2.0) * 0.4);
  ROCK = env * vec2(0.0021 * (0.6 * wv(0.23, 0.0) + 0.3 * wv(0.41, 1.3) + 0.12 * wv(0.93, 2.1)),
                    0.0016 * (0.6 * wv(0.17, 0.7) + 0.3 * wv(0.53, 2.9) + 0.14 * wv(1.13, 0.2)));
  float flex = env * 0.0045 * (0.6 * wv(0.31, 1.7) + 0.3 * wv(0.67, 0.4) + 0.15 * wv(1.37, 2.6));
  float dih = 0.085 + flex;
  WS = vec3(0.0, sin(dih), -cos(dih));
  WU = vec3(0.0, cos(dih), sin(dih));
  // anti-collision strobe: double flash every 1.25 s
  float sp = fract(TM / 1.25);
  STROBE = exp(-pow((sp - 0.02) / 0.012, 2.0)) + 0.8 * exp(-pow((sp - 0.13) / 0.012, 2.0));

  // the sun just above the cloud horizon, fixed in the world
  SUN = normalize(-0.48 * CR + 0.065 * CU + FL * CF);
  SUNL = normalize(SUN + vec3(0.0, 0.075, 0.0));
  SUNC = vec3(1.0, 0.47, 0.17) * 1.45;
  SUNW = vec3(1.0, 0.68, 0.42) * 2.4;

  vec3 col = vec3(0.0);   // linear composite (full scene)
  vec3 lc = vec3(0.0);    // isolated layer (premultiplied)
  float la = 0.0;

  // front to back
  vec3 glare = vec3(0.0);
  if (full || lay == 5) glare = glareLayer(p + u_par * 1.3 * PAR);
  vec4 wg = vec4(0.0);
  if (full || lay == 4) wg = wingLayer(p + u_par * 1.0 * PAR);
  vec4 dk = vec4(0.0);
  if ((full && wg.a < 0.999) || lay == 3) dk = deckLayer(p + u_par * 0.3 * PAR);
  bool behind = full && wg.a < 0.999 && dk.a < 0.999;
  vec4 ct = vec4(0.0);
  if (behind || lay == 2) ct = contrailLayer(p + u_par * 0.12 * PAR);
  vec4 tw = vec4(0.0);
  if ((behind && ct.a < 0.999) || lay == 1) tw = towersLayer(p + u_par * 0.05 * PAR);
  vec4 sk = vec4(0.0);
  if ((behind && ct.a < 0.999 && tw.a < 0.999) || lay == 0) sk = skyLayer(p);

  if (full) {
    col = sk.rgb;
    col = tw.rgb + col * (1.0 - tw.a);
    col = ct.rgb + col * (1.0 - ct.a);
    col = dk.rgb + col * (1.0 - dk.a);
    col = wg.rgb + col * (1.0 - wg.a);
    col += glare;
  } else if (lay == 0) { lc = sk.rgb; la = 1.0; }
  else if (lay == 1) { lc = tw.rgb; la = tw.a; }
  else if (lay == 2) { lc = ct.rgb; la = ct.a; }
  else if (lay == 3) { lc = dk.rgb; la = dk.a; }
  else if (lay == 4) { lc = wg.rgb; la = wg.a; }
  else if (lay == 5) { lc = glare; la = 0.0; }

  float dith = (h12(gl_FragCoord.xy) + h12(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  if (full) {
    fragColor = vec4(encodeC(col) + dith, 1.0);
    if (u_par.x > 0.9) fragColor = u_par.y > 0.5 ? vec4(DBG.xxx, 1.0) : u_par.y < -0.5 ? vec4(DBG.yz, 0.5, 1.0) : vec4(DBG.www, 1.0);
  } else {
    vec3 c = clamp(encodeC(lc) + dith * step(0.002, la + dot(lc, vec3(1.0))), 0.0, 1.0);
    float a = max(la, max(c.r, max(c.g, c.b)));
    fragColor = vec4(min(c, vec3(a)), a);
  }
}
`,
}
