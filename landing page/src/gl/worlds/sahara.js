// Sahara: a sea of dunes at dusk.
// A ray-marched dune field (megadune ridges with sinuous seif dunes riding on
// them, razor brinks, slip faces at the angle of repose) under a low dusty
// sun. Sunlit faces glow orange; slip faces in shadow take the violet light of
// the dusk sky and the warm bounce of the sand around them. Wind ripples and
// sand waves (filtered to the pixel, so they hold from a card to 8K), grainflow
// tongues down the slip faces, sand streaming off the crests in gusts (with a
// strong gust sweeping the field every five minutes), a camel caravan climbing
// the great dune's sunlit flank with long shadows, heat shimmer over the far
// dunes, the evening star and the first stars.
//
// Parallax is a small camera translation, so every crest slides over the
// dunes behind it; the depth layers are distance bands of the one march, and
// every layer is tone-mapped on its own so the full frame is the exact
// back-to-front composite of the isolated layers.
// Everything runs on one master loop (LOOP seconds).

export default {
  id: 'sahara',
  name: 'Sahara',
  tag: 'Dunes at dusk',
  accent: '#f0a04b',
  accent2: '#5b6fb8',
  ink: '#8a4a12',
  glow: '#ffd29a',
  light: false,
  clockColor: '#fff3e2',
  sky: 'linear-gradient(180deg,#141a33 0%,#2b3152 22%,#6b5a6a 40%,#d98d55 52%,#f2b86a 56%,#7a4a33 60%,#3a2a35 72%,#5a3522 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Far dunes', depth: 0.003 },
    { name: 'Great dunes', depth: 0.01 },
    { name: 'Dune sea', depth: 0.036 },
    { name: 'Near dunes', depth: 0.09 },
    { name: 'Caravan', depth: 0.1 },
    { name: 'Foreground crest', depth: 0.45 },
    { name: 'Blowing sand', depth: 1.25 },
  ],
  clockAfter: 2,
  stillTime: 150,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265

const float YH = 0.5;        // horizon height on screen
const float FOC = 1.15;       // focal length (screen heights)
const float CAMH = 165.0;      // eye height above the interdune floor (m)
const float LOOP = 1200.0;    // master loop (s)
const float PAR = 0.03;       // parallax per unit depth (screen heights)
const float TCAM = 20.0 * PAR / FOC;   // camera shift (m) per unit parallax: depth = 20 m / distance
const float HMAX = 160.0;     // highest dune top (m)
const float ZFAR = 4500.0;    // end of the march; beyond it the far ranges are painted in 2D
const float HF = 122.0;       // highest top of the dune field away from the hero dune (m)
const vec2 SUNP = vec2(0.50, 0.548);
const float SUNR = 0.0105;
const float EXPO = 1.0;

float Tw;   // wrapped time
float PX;   // one pixel in screen heights
vec3 SUN;   // sun direction
vec3 CAM;   // camera position
float VIG;
float GUST; // wind strength now (gusts, and a strong sweep every 300 s)
float GFR;  // position of the strong gust's front across the field (m along the wind)
// the crest the ray skimmed most closely (for sand streaming off it): z, clearance (m), score
float PZc, PGc, PSC;

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
// value noise periodic in y (period per cells): time-driven textures that wrap with the loop
float vnoiseT(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  return mix(mix(h12(vec2(i.x, y0)), h12(vec2(i.x + 1.0, y0)), u.x), mix(h12(vec2(i.x, y1)), h12(vec2(i.x + 1.0, y1)), u.x), u.y);
}
// seamless oscillator: frequency snapped to the loop
float wav(float f, float ph) { return sin(TAU * fract(floor(f * LOOP + 0.5) / LOOP * Tw) + ph); }
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec4 over(vec4 b, vec4 f) { return f + b * (1.0 - f.a); }

// ---------------------------------------------------------------- colour
vec3 display(vec3 c) {
  c *= EXPO * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  // a touch of filmic contrast
  return mix(c, c * c * (3.0 - 2.0 * c), 0.18);
}

// ---------------------------------------------------------------- sky
const vec3 SUNC = vec3(1.0, 0.47, 0.18);   // low sun through dust
vec3 skyBase(vec3 rd) {
  float e = max(rd.y, 0.0);
  float mu = dot(rd, SUN);
  vec2 hz = normalize(rd.xz + vec2(0.0, 1e-4));
  float az = dot(hz, normalize(SUN.xz)) * 0.5 + 0.5;   // 1 towards the sun's azimuth
  vec3 zen = vec3(0.016, 0.026, 0.068);
  vec3 mid = vec3(0.060, 0.086, 0.165);
  vec3 low = mix(vec3(0.17, 0.15, 0.20), vec3(0.62, 0.40, 0.25), pow(az, 3.0));
  vec3 hor = mix(vec3(0.34, 0.23, 0.22), vec3(1.30, 0.66, 0.30), pow(az, 4.0));
  vec3 c = mix(hor, low, smoothstep(0.0, 0.05, e));
  c = mix(c, mid, smoothstep(0.03, 0.2, e));
  c = mix(c, zen, smoothstep(0.16, 0.42, e));
  float m = max(mu, 0.0);
  c += SUNC * (0.05 * pow(m, 4.0) + 0.28 * pow(m, 24.0) + 1.1 * pow(m, 300.0));
  return c;
}
// light scattered into the view by the dusty air (aerial perspective)
vec3 hazeCol(vec3 rd) {
  vec2 hz = normalize(rd.xz + vec2(0.0, 1e-4));
  float az = dot(hz, normalize(SUN.xz)) * 0.5 + 0.5;
  float mu = max(dot(normalize(rd), SUN), 0.0);
  vec3 c = mix(vec3(0.27, 0.19, 0.19), vec3(0.78, 0.46, 0.25), pow(az, 3.0));
  return c + SUNC * (0.18 * pow(mu, 8.0) + 0.45 * pow(mu, 50.0));
}
float fogF(float z) { return 1.0 - exp(-z / 5200.0); }

// first stars: a sparse field, most faint, a few bright, gently twinkling; the evening star
vec3 stars(vec2 p, float e) {
  vec3 c = vec3(0.0);
  // Venus, steady and bright in the afterglow
  vec2 dv = p - vec2(0.255, 0.835);
  float rv = length(dv) / PX;
  c += vec3(1.0, 0.95, 0.86) * (2.4 * exp(-rv * rv * 0.45) + 0.05 * exp(-rv * 0.25));
  if (e < 0.07) return c;
  float cs = 0.016;
  vec2 ci = floor(p / cs);
  if (h12(ci * 1.31 + 4.7) > 0.2) return c;
  vec2 hs = h22(ci + 17.0);
  vec2 sp = (ci + 0.2 + 0.6 * hs) * cs;
  float dp = length(p - sp) / PX;
  float mag = pow(h12(ci + 9.1), 7.0);
  float tw = 0.75 + 0.25 * sin(TAU * fract(floor(20.0 + 60.0 * hs.x) * Tw / LOOP) * 9.0 + hs.y * 40.0);
  float b = (0.05 + 1.6 * mag) * exp(-dp * dp * 1.3) * tw;
  vec3 col = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.72), hs.y);
  return c + col * b * smoothstep(0.07, 0.3, e);
}

// ---------------------------------------------------------------- dunes
// dune profile over one wavelength (phase t in [0,1)): a stoss rising to a
// brink at c (convex near the top), then a straight slip face at the angle of
// repose down to a smooth trough. The brink is rounded over kr (profile units,
// about one pixel footprint): razor sharp up close, never aliased far away.
// returns (h, dh/dt, weight of the stoss branch)
vec3 prof(float t, float c, float k, float kr) {
  float s = t / c;
  float a = 3.0 - k, b = k - 2.0;
  float hs = s * s * (a + b * s);
  float ds = s * (2.0 * a + 3.0 * b * s) / c;
  float sl = (1.0 - t) / (1.0 - c);
  // slip face: straight upper face, concave apron (continued straight beyond the brink)
  float hl = sl < 1.0 ? sl * sl * (1.7 - 0.7 * sl) : 1.0 + 1.3 * (sl - 1.0);
  float dl = -(sl < 1.0 ? sl * (3.4 - 2.1 * sl) : 1.3) / (1.0 - c);
  float m = clamp(0.5 + 0.5 * (hl - hs) / kr, 0.0, 1.0);
  return vec3(mix(hl, hs, m) - kr * m * (1.0 - m), mix(dl, ds, m), m);
}

const vec2 DD = vec2(-0.2588, -0.9659);     // megadune (draa) across-axis
const float LD = 560.0;
const vec2 DS = vec2(0.9659, -0.2588);  // seif across-axis (crests run away from the camera)
const float LS = 170.0;
const vec2 OFF = vec2(140.0, 60.0);

// 1D value noise with derivative (quintic)
vec2 vn1(float x) {
  float i = floor(x), f = x - i;
  float a = h11(i), b = h11(i + 1.0);
  float u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return vec2(a + (b - a) * u, (b - a) * 30.0 * f * f * (f * (f - 2.0) + 1.0));
}

// surface info from the last terrain(.., true) call
vec2 SC;      // grainflow streak frame: (along the brink, down the face) in m
float HERO;   // 1 on the hero dune
vec2 RDIR;    // march: horizontal ray direction per unit z
float DCR;    // march: z distance to the next brink ahead along the ray
float crestAhead(float t, float c, float dU) {
  if (dU > 0.0) return ((t < c ? c : c + 1.0) - t) / dU;
  return (t > c ? t - c : t + 1.0 - c) / max(-dU, 1e-7);
}

// height and gradient (h, dh/dx, dh/dz); fp = rounding of the brinks (m).
// mode 0: march (tracks the next brink ahead), 1: shadow, 2: shading (surface info)
vec3 terrain(vec2 p, float fp, int mode) {
  p += OFF;
  // ---- megadune ridges (transverse, sinuous); stoss faces the sun, slip face the camera
  vec2 DDp = vec2(DD.y, -DD.x);
  float ac = dot(p, DD), al = dot(p, DDp);
  // sinuous brinks: two incommensurate sines (cheap, smooth, never repeating in view)
  float a1 = al / 380.0 + ac / 1500.0 + 0.6 * sin(ac / 2100.0), a2 = al / 143.0 - ac / 830.0 + 2.1;
  float u = ac / LD + 0.42 * sin(a1) + 0.11 * sin(a2);
  vec2 du = DD / LD + 0.42 * cos(a1) * (DDp / 380.0 + DD / 1500.0 + 0.6 / 2100.0 * cos(ac / 2100.0) * DD) + 0.11 * cos(a2) * (DDp / 143.0 - DD / 830.0);
  float n = floor(u), t = u - n;
  vec2 am = vn1(al / 520.0 + n * 7.31);
  float A = 22.0 + 70.0 * am.x * am.x;
  vec2 dA = 140.0 * am.x * am.y * DDp / 520.0;
  vec3 pr = prof(t, 0.66, 0.9, fp / A);
  if (mode == 0) DCR = crestAhead(t, 0.66, dot(du, RDIR));
  float h = A * pr.x;
  vec2 g = A * pr.y * du + pr.x * dA;
  if (mode == 2) SC = vec2(al, (t - 0.66) * LD);
  // ---- seif ridges riding on the megadune stoss (slip faces and megadune brinks stay clean)
  if (t < 0.66) {
    vec2 DSp = vec2(DS.y, -DS.x);
    float sc = dot(p, DS), sl = dot(p, DSp);
    float b1 = sl / 260.0 + sc / 760.0 + 3.1, b2 = sl / 113.0 - sc / 520.0 + 1.7;
    float us = sc / LS + 0.33 * sin(b1) + 0.05 * sin(b2);
    vec2 dus = DS / LS + 0.33 * cos(b1) * (DSp / 260.0 + DS / 760.0) + 0.05 * cos(b2) * (DSp / 113.0 - DS / 520.0);
    float ns = floor(us), ts = us - ns;
    vec2 as = vn1(sl / 480.0 + ns * 4.37);
    float sm = t / 0.66;
    float mk = 4.0 * sm * (1.0 - sm);
    float msk = mk * mk;
    vec2 dmsk = 2.0 * mk * 4.0 * (1.0 - 2.0 * sm) / 0.66 * du;
    float S = (3.0 + 24.0 * as.x) * msk;
    vec2 dS = 24.0 * as.y * DSp / 480.0 * msk + (3.0 + 24.0 * as.x) * dmsk;
    vec3 ps = prof(ts, 0.6, 0.8, fp / max(S, 0.5));
    if (mode == 0) DCR = min(DCR, crestAhead(ts, 0.6, dot(dus, RDIR)));
    h += S * ps.x;
    vec2 gs = S * ps.y * dus + ps.x * dS;
    if (mode == 2 && length(gs) > length(g)) SC = vec2(sl, (ts - 0.6) * LS);
    g += gs;
  }
  if (mode == 2) HERO = 0.0;
  // ---- the hero ridge in the foreground: a sinuous crest from beneath the
  // camera's right towards the left, lit stoss flank on the right, slip face left
  p -= OFF;
  float zc = p.y;
  float xr = 3.0 - 0.26 * zc + 34.0 * (sin(zc / 120.0 + 0.3) - 0.2955);
  if (zc < 1000.0 && abs(p.x - xr) < 750.0) {
    float dxr = -0.26 + 34.0 / 120.0 * cos(zc / 120.0 + 0.3);
    float cs = inversesqrt(1.0 + dxr * dxr);
    float d = (p.x - xr) * cs;
    float Hr = 158.0 - 0.10 * zc - 0.00012 * zc * zc + 3.0 * sin(zc / 55.0 + 1.0) + 1.5 * sin(zc / 23.0 + 2.0);
    float dHr = -0.10 - 0.00024 * zc + 3.0 / 55.0 * cos(zc / 55.0 + 1.0) + 1.5 / 23.0 * cos(zc / 23.0 + 2.0);
    // stoss: convex near the brink, steepening downslope; slip face at the angle of repose
    float ds = max(d, -10.0);
    float hst = Hr - (0.10 * ds + 0.28 * ds * ds / (ds + 22.0));
    float fst = d > -10.0 ? 0.10 + 0.28 * ds * (ds + 44.0) / ((ds + 22.0) * (ds + 22.0)) : 0.0;
    float hsl = Hr + 0.64 * d;
    float kr = max(fp, 0.05);
    float mh = clamp(0.5 + 0.5 * (hsl - hst) / kr, 0.0, 1.0);
    float hh = mix(hsl, hst, mh) - kr * mh * (1.0 - mh);
    float fs = mix(-0.64, fst, mh);
    vec2 gh = vec2(-fs * cs, dHr + fs * dxr * cs);
    // the field is lower around the hero, so its flanks run cleanly down
    float ex = d / 260.0, ez = smoothstep(900.0, 350.0, zc);
    float e2 = exp(-ex * ex);
    float near = e2 * ez;
    vec2 dnear = near * (-2.0 * ex / 260.0) * vec2(cs, -dxr * cs) + e2 * vec2(0.0, -6.0 * (zc - 350.0) * (900.0 - zc) / 166375000.0) * step(350.0, zc) * step(zc, 900.0);
    g = g * (1.0 - 0.6 * near) - 0.6 * h * dnear;
    h *= 1.0 - 0.6 * near;
    // union with the field (polynomial smooth max)
    float k = 14.0;
    float m = clamp(0.5 + 0.5 * (hh - h) / k, 0.0, 1.0);
    if (mode == 0) {
      float dd = cs * (RDIR.x - dxr * RDIR.y);
      if (hh > h - 2.0 * k && d * dd < 0.0) DCR = min(DCR, -d / dd);
    }
    h = mix(h, hh, m) + k * m * (1.0 - m);
    g = mix(g, gh, m);
    if (mode == 2) {
      HERO = m;
      if (m > 0.5) SC = vec2(zc, d);
    }
  }
  return vec3(h, g);
}

// ---------------------------------------------------------------- march
// returns hit distance (z along the view axis, 1e9 if none); grazing info for
// silhouette anti-aliasing: rmin = clearance in pixels at the closest crest, zm its z, gm its clearance (m)
float march(vec3 ro, vec3 rd, out float rmin, out float zm, out float gm) {
  rmin = 1e9; zm = 0.0; gm = 0.0;
  float sy = rd.y;
  float z0 = 6.0, z1 = ZFAR;
  if (sy >= 0.0) {
    if (ro.y >= HMAX) return 1e9;
    z1 = min(z1, (HMAX - ro.y) / max(sy, 1e-5));
  } else {
    // enter the bounding volume: the field never tops HF; the hero dune near the
    // camera stays under 163 - 0.1 z - 0.00012 z^2 (a quadratic in z along the ray)
    float zf = (ro.y - HF) / -sy;
    float b = sy + 0.1, c = ro.y - 163.0;
    float disc = b * b - 0.00048 * c;
    float zh = (b < 0.0 && disc >= 0.0) ? (-b - sqrt(disc)) / 0.00024 : 1e9;
    z0 = max(z0, min(zf, zh));
  }
  float z = z0;
  float pxk = FOC / PX;
  float tolK = 0.5 * PX / FOC;   // half a pixel of clearance per metre of distance
  float fpk = 1.5 * PX / FOC;    // brink rounding: 1.5 pixels
  float gp = 1e9, gpp = 1e9, zp = z;
  float rate = 0.7 * length(rd.xz) - min(sy, 0.0);
  float lo = 0.0, hi = 0.0, glo = 0.0, ghi = 0.0;
  int nb = -1;                   // bisection steps taken (-1 while marching)
  RDIR = rd.xz;
  for (int i = 0; i < 112; i++) {
    float g = ro.y + sy * z - terrain(ro.xz + rd.xz * z, z * fpk, 0).x;
    if (nb >= 0) {
      // refine the crossing by bisection (same terrain call site as the march)
      if (g > 0.0) { lo = z; glo = g; } else { hi = z; ghi = g; }
      nb += 1;
      if (nb == 4) break;
      z = 0.5 * (lo + hi);
      continue;
    }
    if (g < 0.0) { lo = zp; glo = gp; hi = z; ghi = g; nb = 0; z = 0.5 * (lo + hi); continue; }
    if (g < tolK * z * (1.0 + z / 1500.0)) return z;
    // a crest passed under the ray: remember the closest (in pixels)
    if (gp < gpp && g > gp) {
      float ratio = gp * pxk / zp;
      if (ratio < rmin) { rmin = ratio; zm = zp; gm = gp; }
      // and the one it skims most closely in metres (sand streaming off it)
      float sc = gp / (1.0 + 0.004 * zp);
      if (sc < PSC) { PSC = sc; PZc = zp; PGc = gp; }
    }
    float dz = g / rate;
    // secant leap while the gap closes steadily; stride on while skimming. Never
    // past the next brink along the ray (thin crests must not be skipped);
    // overshooting into a dune body is caught by the bisection.
    float cr = (gp - g) / max(z - zp, 1e-3);
    float lim = max(0.92 * DCR, dz);
    if (cr > 0.0) dz = max(dz, min(0.85 * g / cr, 6.0 * dz));
    else dz = max(dz, 0.03 * z);
    dz = min(dz * (1.0 + 0.4 * smoothstep(600.0, 3000.0, z)), lim);
    gpp = gp;
    gp = g; zp = z;
    z += max(dz, 0.0018 * z);
    if (z > z1) return 1e9;
  }
  if (nb >= 0) return lo + (hi - lo) * glo / max(glo - ghi, 1e-6);
  // out of steps while skimming a surface: call it a hit
  return gp < 0.01 * zp ? zp : 1e9;
}

float shadowMarch(vec3 pos, float z) {
  float res = 1.0;
  float t = 0.5 + 0.002 * z;
  for (int i = 0; i < 16; i++) {
    vec3 sp = pos + SUN * t;
    if (sp.y > HMAX) break;
    float h = sp.y - terrain(sp.xz, 0.05 + 0.02 * t, 1).x;
    res = min(res, 18.0 * h / t);
    if (res < 0.0) break;
    t *= 1.5;
  }
  return clamp(res, 0.0, 1.0);
}


// ---------------------------------------------------------------- sand
const vec3 ALB = vec3(0.60, 0.40, 0.25);
// the low warm sun; the dusk sky (deep blue overhead, violet opposite the sun, glowing towards
// it); and the warm bounce from the sunlit sand around
vec3 sandLight(vec3 n, vec3 alb, float sh, float ao) {
  vec2 sz = normalize(SUN.xz);
  float side = dot(n.xz, sz);
  float ndl = max(dot(n, SUN), 0.0);
  vec3 sky = vec3(0.075, 0.10, 0.25) * (0.55 + 0.45 * n.y)
           + vec3(0.13, 0.085, 0.17) * max(-side, 0.0)
           + vec3(0.21, 0.11, 0.055) * max(side, 0.0);
  vec3 bounce = vec3(0.15, 0.075, 0.035) * clamp(0.65 - 0.55 * n.y, 0.0, 1.0);
  return alb * (SUNC * 4.6 * ndl * sh + (sky + bounce) * ao);
}

// Wind ripples (12 cm) and sand waves (1.7 m) on the open sand: the slope they add to the surface
// at p (m). Crests run across the wind (which blows over the stoss towards the slip faces),
// sinuous and patchy, with a gentle windward and a steep lee side. Each family fades out before
// its wavelength nears the pixel footprint fp (m), so nothing aliases at any size.
vec2 ripples(vec2 p, float fp, out float hgt) {
  hgt = 0.0;
  vec2 g = vec2(0.0);
  vec2 W = normalize(DD + vec2(0.25, 0.0));
  float warp = 1.7 * vnoise(p * 0.085 + 3.0) + 0.6 * vnoise(p * 0.29 + 11.0);
  float f2 = smoothstep(0.45, 0.2, fp / 1.7);
  if (f2 > 0.0) {
    vec2 W2 = vec2(W.x * 0.985 - W.y * 0.17, W.x * 0.17 + W.y * 0.985);
    float a = TAU * (dot(p, W2) / 1.7 + 1.2 * warp);
    float b = a + 0.7 * sin(a);
    float amp = 0.05 * f2 * smoothstep(0.25, 0.7, vnoise(p * 0.021 + 5.0));
    g += amp * cos(b) * (1.0 + 0.7 * cos(a)) * W2;
    hgt += 0.5 * amp * sin(b);
  }
  float f1 = smoothstep(0.45, 0.2, fp / 0.12);
  if (f1 > 0.0) {
    float a = TAU * (dot(p, W) / 0.12 + 3.0 * warp + 0.3 * sin(dot(p, vec2(-W.y, W.x)) * 0.7));
    float b = a + 0.8 * sin(a);
    float amp = 0.11 * f1 * (0.3 + 0.7 * smoothstep(0.25, 0.7, vnoise(p * 0.07 + 9.0)));
    g += amp * cos(b) * (1.0 + 0.8 * cos(a)) * W;
    hgt += amp * sin(b);
  }
  return g;
}

// ---------------------------------------------------------------- caravan
// A guide on foot leads a string of camels (some ridden, some carrying baggage) across the sunlit
// flank of the great dune and up over its crest. Every figure is a flat silhouette standing in the
// one vertical plane of the line of march, so it foreshortens, stands on the real sand, is hidden
// by nearer dunes and casts a long shadow up the slope. One pass every 300 s.
#define NFIG 7
const vec2 CVD = vec2(-0.970, 0.243);   // line of march (unit, xz)
const vec2 CVN = vec2(0.243, 0.970);    // normal of its vertical plane
const vec2 CV0 = vec2(55.0, 196.0);     // middle of the path
const float CVSP = 4.3;                 // spacing (m)
const float CVL = 300.0;                // path length (m); walking at 1 m/s
float CVS;                              // path position of the guide (m)

float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float sdEll(vec2 p, vec2 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// a dromedary in side view (m; x forward, y up from the hooves); ph: gait phase. Camels pace:
// both legs of one side swing together, the far side half a cycle later
float camelSD(vec2 p, float ph, float kind) {
  p.y -= 0.035 * cos(2.0 * ph);
  float d = sdEll(p - vec2(0.0, 1.47), vec2(0.88, 0.33));
  d = smin(d, sdEll(p - vec2(-0.10, 1.76), vec2(0.45, 0.32)), 0.10);
  d = smin(d, sdEll(p - vec2(-0.70, 1.44), vec2(0.30, 0.27)), 0.08);
  float nk = min(sdSeg(p, vec2(0.66, 1.56), vec2(1.10, 1.30)) - 0.14, sdSeg(p, vec2(1.10, 1.30), vec2(1.36, 1.80)) - 0.09);
  d = smin(d, nk, 0.10);
  d = smin(d, sdEll(p - vec2(1.53, 1.86), vec2(0.25, 0.095)), 0.05);
  d = min(d, sdSeg(p, vec2(-0.88, 1.52), vec2(-0.97, 1.08)) - 0.025);
  for (int k = 0; k < 4; k++) {
    float c = ph + float(k & 1) * PI;
    vec2 hip = vec2(k < 2 ? 0.52 : -0.58, 1.34);
    float a = 0.34 * sin(c);
    float bend = 0.55 * max(cos(c), 0.0);
    vec2 knee = hip + 0.63 * vec2(sin(a), -cos(a));
    vec2 hoof = knee + 0.70 * vec2(sin(a - bend), -cos(a - bend));
    d = min(d, sdSeg(p, hip, knee) - 0.075);
    d = min(d, sdSeg(p, knee, hoof) - 0.045);
  }
  if (kind < 0.5) {
    // a rider wrapped against the wind
    d = smin(d, sdSeg(p, vec2(-0.14, 1.98), vec2(-0.08, 2.42)) - 0.16, 0.06);
    d = min(d, length(p - vec2(-0.06, 2.62)) - 0.13);
  } else {
    // baggage slung over the hump
    d = smin(d, sdEll(p - vec2(-0.12, 1.98), vec2(0.58, 0.30)), 0.06);
  }
  return d;
}
// the guide in a long robe, holding the lead rope
float guideSD(vec2 p, float ph) {
  float d = sdEll(p - vec2(0.0, 0.95), vec2(0.24, 0.62));
  d = smin(d, sdSeg(p, vec2(0.0, 1.2), vec2(0.03, 1.45)) - 0.14, 0.05);
  d = min(d, length(p - vec2(0.05, 1.66)) - 0.12);
  d = min(d, sdSeg(p, vec2(0.06, 1.38), vec2(0.40, 1.08)) - 0.045);
  for (int k = 0; k < 2; k++) {
    float a = 0.38 * sin(ph + float(k) * PI);
    d = min(d, sdSeg(p, vec2(0.0, 0.75), vec2(0.0, 0.75) + 0.75 * vec2(sin(a), -cos(a))) - 0.05);
  }
  return d;
}
float figS(int i) { return mod(CVS - float(i) * CVSP + 0.5 * CVL, CVL) - 0.5 * CVL; }
float figH(float s) { return terrain(CV0 + CVD * s, 0.05, 1).x; }
float figureSD(int i, vec2 l, float s) {
  if (i == 0) return guideSD(l, TAU * s / 1.5);
  return camelSD(l, TAU * s / 2.2 + float(i) * 1.7, (i == 1 || i == 4 || i == 6) ? 0.0 : 1.0);
}
// figures fade in and out at the far ends of the path (both well off the sunlit flank)
float figFade(float s) { return smoothstep(150.0, 138.0, abs(s)); }

// signed distance (m) to the whole caravan at plane point (u along the path, y height),
// with the lead and tow ropes; f: fade of the nearest figure
float caravanSD(float u, float y, out float f) {
  float d = 1e3;
  f = 1.0;
  float sPrev = 0.0, hPrev = 0.0;
  for (int i = 0; i < NFIG; i++) {
    float s = figS(i);
    float lu = u - s;
    if (lu > -1.2 && lu < 2.0) {
      float di = figureSD(i, vec2(lu, y - figH(s)), s);
      if (di < d) { d = di; f = figFade(s); }
    }
    // rope from the figure ahead (guide's hand / camel's saddle) to this camel's head collar
    if (i > 0) {
      float sa = figS(i - 1);
      if (sa - s < CVSP + 0.1 && u > s + 1.2 && u < sa + 0.5) {
        vec2 a = vec2(sa + (i == 1 ? 0.40 : -0.80), figH(sa) + (i == 1 ? 1.08 : 1.40));
        vec2 b = vec2(s + 1.45, figH(s) + 1.72);
        vec2 m = 0.5 * (a + b) - vec2(0.0, 0.22);
        float dr = min(sdSeg(vec2(u, y), a, m), sdSeg(vec2(u, y), m, b)) - 0.012;
        if (dr < d) { d = dr; f = figFade(s) * 0.7; }
      }
    }
  }
  return d;
}

// the caravan's shadow on the sand at P: march towards the sun to the caravan's plane
float caravanShadow(vec3 P, float fp) {
  float dn = dot(SUN.xz, CVN);
  float t = dot(CV0 - P.xz, CVN) / dn;
  if (t < 0.0 || t > 130.0) return 1.0;
  vec3 Q = P + SUN * t;
  float u = dot(Q.xz - CV0, CVD);
  if (abs(u) > 0.5 * CVL + 3.0 || Q.y > 165.0) return 1.0;
  float f;
  float d = caravanSD(u, Q.y, f);
  float pen = 0.0047 * t + fp;
  return 1.0 - f * smoothstep(pen, -pen, d);
}

vec4 caravan(vec3 rd, vec3 rdn, float zhit) {
  float dn = dot(rd.xz, CVN);
  if (dn <= 0.0) return vec4(0.0);
  float t = dot(CV0 - CAM.xz, CVN) / dn;
  if (t <= 0.0 || t > zhit + 0.5) return vec4(0.0);
  vec3 H = CAM + rd * t;
  if (H.y < 30.0 || H.y > 160.0) return vec4(0.0);
  float u = dot(H.xz - CV0, CVD);
  if (abs(u) > 0.5 * CVL + 3.0) return vec4(0.0);
  float fp = t * PX / FOC / sqrt(max(abs(dot(rdn, vec3(CVN.x, 0.0, CVN.y))), 0.2));
  float f;
  float d = caravanSD(u, H.y, f);
  float cov = smoothstep(fp, -fp, d) * f;
  if (cov <= 0.0) return vec4(0.0);
  // backlit: the camera sees the shaded side, lit by the dusk sky; fur and cloth glow at the rim
  vec3 n = normalize(vec3(-rdn.x, 0.35, -rdn.z));
  vec3 col = sandLight(n, vec3(0.26, 0.17, 0.11), 0.0, 0.85);
  col += SUNC * 0.55 * exp(min(d, 0.0) / (1.5 * fp + 0.02)) * smoothstep(-0.25, 0.0, d);
  col = mix(col, hazeCol(rdn), fogF(t));
  return vec4(display(col), 1.0) * cov;
}

// ---------------------------------------------------------------- shading
float SLIPD;   // distance down a slip face from its brink (m; < 0 elsewhere)
float ALONG;   // position along that brink (m)

vec3 shadeSand(vec3 pos, vec3 rdn, float z) {
  float fp0 = z * PX / FOC;
  vec3 tg = terrain(pos.xz, z * 1.5 * PX / FOC, 2);
  vec2 g = tg.yz;
  float sl = length(g);
  float slip = smoothstep(0.44, 0.60, sl);   // slip faces stand at the angle of repose
  SLIPD = slip > 0.5 ? (HERO > 0.5 ? -SC.y : SC.y) : -1.0;
  ALONG = SC.x;
  vec3 n0 = normalize(vec3(-g.x, 1.0, -g.y));
  float cv = max(dot(n0, -rdn), 0.1);
  float fpv = fp0 / cv;    // footprint along the foreshortened axis
  // ripples and sand waves on the open sand; grainflow tongues down the slip faces
  float rh;
  vec2 rg = ripples(pos.xz, fpv, rh) * (1.0 - slip);
  // sand albedo: broad patches, paler high on the dunes, finer mottling up close
  float big = vnoise(pos.xz * 0.012 + 3.0) * 0.6 + vnoise(pos.xz * 0.05 + 7.0) * 0.4;
  vec3 alb = ALB * (0.86 + 0.28 * big) * mix(0.90, 1.05, smoothstep(30.0, 130.0, pos.y));
  float fm = smoothstep(0.5, 0.2, fpv / 0.7);
  if (fm > 0.0) alb *= 1.0 + 0.10 * fm * (vnoise(pos.xz * 1.4 + 1.0) - 0.5);
  alb *= 1.0 - 0.5 * rh;   // coarse dark grains gather on the ripple crests
  if (slip > 0.0) {
    vec2 up = g / max(sl, 1e-4);
    vec2 ac = vec2(-up.y, up.x);
    float u = dot(pos.xz, ac), v = dot(pos.xz, up);
    float fq = smoothstep(0.5, 0.2, fpv / 2.6) * slip;
    if (fq > 0.0) {
      float t1 = vnoise(vec2(u / 2.6, v / 24.0) + 17.0);
      float t2 = vnoise(vec2((u + 0.7) / 2.6, v / 24.0) + 17.0);
      rg += ac * (t2 - t1) * 0.35 * fq;
      alb *= 1.0 + 0.12 * (t1 - 0.5) * fq;
    }
  }
  vec3 n = normalize(vec3(-(g.x + rg.x), 1.0, -(g.y + rg.y)));
  float sh = dot(n0, SUN) > -0.03 ? shadowMarch(pos + n0 * 0.05, z) : 0.0;
  if (sh > 0.0) sh *= caravanShadow(pos, fp0);
  float fwd = pow(max(dot(rdn, SUN), 0.0), 6.0);
  vec3 col = sandLight(n, alb, sh, 1.0 - 0.25 * slip * (1.0 - sh)) * (1.0 + 0.6 * fwd);
  // glints of quartz grains catching the sun, close by
  if (fp0 < 0.03 && sh > 0.0) {
    vec2 cell = floor(pos.xz / max(fp0 * 1.3, 0.004));
    float gl = step(0.9972, h12(cell + 31.7)) * smoothstep(0.03, 0.012, fp0);
    col += SUNC * 2.5 * gl * max(dot(n, SUN), 0.0) * sh;
  }
  return mix(col, hazeCol(rdn), fogF(z));
}
// a brink seen edge-on (silhouette anti-aliasing): the lit stoss just behind it
vec3 shadeBrink(float z, vec3 rdn) {
  vec3 n = normalize(vec3(normalize(SUN.xz) * 0.35, 1.0).xzy);
  return mix(sandLight(n, ALB, 1.0, 1.0), hazeCol(rdn), fogF(z));
}

// ---------------------------------------------------------------- far ranges
// beyond the march: hazy dune ranges stacking up towards the horizon
float fbm1(float x, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi >= oct) break;
    s += a * mix(0.5, vnoise1(x), clamp(oct - fi, 0.0, 1.0));
    x = x * 2.03 + 1.7;
    a *= 0.5;
  }
  return s + a;
}
vec4 farRanges(vec2 q, vec3 rdn) {
  if (q.y > YH + 0.002) return vec4(0.0);
  float oct = clamp(log2(0.02 / PX) - 1.0, 2.0, 7.0);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float zk = 5200.0 * pow(1.5, fk);
    // rounded crests that sharpen a little at their tops, never into saw teeth
    float n = fbm1(q.x * (7.0 + 5.0 * fk) + fk * 13.7, oct);
    float hk = 55.0 + 105.0 * smoothstep(0.2, 0.9, n);
    float yk = YH + (hk - CAMH) * FOC / zk;
    if (q.y < yk + PX) {
      float a = smoothstep(yk + PX, yk - PX, q.y);
      float dd = (yk - q.y) * zk / FOC;   // metres below the crest line
      // shaded slip faces towards us; dust pools in the troughs and lightens them
      vec3 c = ALB * (vec3(0.085, 0.10, 0.22) + SUNC * 0.35 * exp(-dd / 18.0));
      float hz = fogF(zk) + (1.0 - fogF(zk)) * 0.55 * smoothstep(0.0, 70.0, dd);
      c = mix(c, hazeCol(rdn), hz);
      return vec4(c, a);
    }
  }
  return vec4(0.0);
}

// ---------------------------------------------------------------- blowing sand
// Sand streaming off the crests the ray skimmed (backlit, it glows), veils sliding down the slip
// faces below the brinks, and low drifts snaking over the sand near the camera. GUST breathes;
// every 300 s a strong gust front sweeps across the field towards the viewer.
float GEV;   // strength of the sweeping gust now
float gustAt(float b) { return GUST + GEV * (0.4 + 1.6 * exp(-(b - GFR) * (b - GFR) / 90000.0)) * step(GFR - 600.0, b); }
vec4 blowing(vec3 rd, vec3 rdn, float z, bool hit) {
  vec2 W = normalize(DD + vec2(0.25, 0.0));
  vec2 Wp = vec2(-W.y, W.x);
  float dens = 0.0, zr = 0.0;
  if (PZc > 0.0) {
    vec3 P = CAM + rd * PZc;
    float Hp = 0.7 + 0.0035 * PZc;
    float d0 = exp(-PGc / Hp) * smoothstep(2200.0, 250.0, PZc);
    if (d0 > 0.004) {
      float a = dot(P.xz, Wp), b = dot(P.xz, W);
      float gate = smoothstep(0.25, 0.80, vnoiseT(vec2(a / 30.0, Tw * 0.05), 60.0)) * gustAt(b);
      float w = vnoise(vec2(a / 2.5, PGc / 1.6) + 4.0);
      float fil = vnoiseT(vec2(a / (0.8 + 0.002 * PZc) + 1.6 * w, PGc / (0.5 + 0.0025 * PZc) - Tw * 1.5), 1800.0);
      dens += d0 * (0.25 + 0.75 * smoothstep(0.3, 0.85, fil)) * gate;
      zr = PZc;
    }
  }
  if (hit && SLIPD >= 0.0) {
    float dv = exp(-SLIPD / (2.5 + 0.004 * z)) * smoothstep(2200.0, 250.0, z);
    if (dv > 0.004) {
      vec3 P = CAM + rd * z;
      float gate = smoothstep(0.25, 0.80, vnoiseT(vec2(dot(P.xz, Wp) / 30.0, Tw * 0.05), 60.0)) * gustAt(dot(P.xz, W));
      float fil = vnoiseT(vec2(ALONG / (0.9 + 0.002 * z) + 1.3 * vnoise(vec2(ALONG / 3.0, SLIPD / 4.0)), SLIPD / (1.6 + 0.004 * z) - Tw * 2.0), 2400.0);
      dens += dv * (0.15 + 0.85 * smoothstep(0.35, 0.85, fil)) * gate * 0.8;
      zr = z;
    }
  }
  if (hit && z < 80.0 && SLIPD < 0.0) {
    // saltation: sand snakes slithering downwind over the surface
    vec3 P = CAM + rd * z;
    float fp0 = z * PX / FOC;
    float sn = vnoiseT(vec2(dot(P.xz, Wp) / 0.45, dot(P.xz, W) / 3.0 - Tw * 1.5), 1800.0);
    sn *= vnoiseT(vec2(dot(P.xz, Wp) / 1.7 + 7.0, dot(P.xz, W) / 9.0 - Tw * 0.5), 600.0);
    dens += 0.9 * smoothstep(0.30, 0.62, sn) * smoothstep(80.0, 20.0, z) * smoothstep(0.5, 0.15, fp0 / 0.45) * gustAt(dot(P.xz, W));
    zr = z;
  }
  if (dens <= 0.002) return vec4(0.0);
  float a = (1.0 - exp(-dens * 1.1)) * 0.7;
  float ph = pow(max(dot(rdn, SUN), 0.0), 5.0);
  vec3 col = SUNC * (0.55 + 4.5 * ph) * 0.55 + vec3(0.10, 0.085, 0.13);
  col = mix(col, hazeCol(rdn), fogF(zr));
  return vec4(display(col), 1.0) * a;
}

// ---------------------------------------------------------------- layers
// terrain distance bands (m): near edge of each band, back to front
const float B1 = 90.0, B2 = 300.0, B3 = 1000.0;
float bandA(float z, float lo, float hi) {
  float a = hi > 0.0 ? 1.0 - smoothstep(hi * 0.9, hi, z) : 1.0;
  if (lo > 0.0) a *= smoothstep(lo * 0.8, lo * 0.9, z);
  return a;
}
// which layer a terrain distance belongs to, as an alpha for layer k
float layerOfZ(int k, float z) {
  if (k == 2) return bandA(z, B3, 0.0);
  if (k == 3) return bandA(z, B2, B3);
  if (k == 4) return bandA(z, B1, B2);
  if (k == 6) return bandA(z, 0.0, B1);
  return 0.0;
}

vec3 skyColor(vec2 p, vec3 rdn) {
  vec3 c = skyBase(rdn);
  // the sun: flattened by refraction, reddened and dimmed by dust, shimmering
  vec2 d = p - SUNP;
  float sw = (vnoiseT(vec2(p.y * 900.0, Tw * 6.0), 7200.0) - 0.5) * 0.0012 * smoothstep(0.0, -0.012, d.y);
  d.x += sw;
  d.y *= 1.1;
  float r = length(d);
  float disk = smoothstep(SUNR + 0.8 * PX, SUNR - 0.8 * PX, r);
  float limb = sqrt(max(1.0 - r * r / (SUNR * SUNR), 0.0));
  c += disk * vec3(1.0, 0.60, 0.26) * 9.0 * (0.55 + 0.45 * limb);
  c += SUNC * (0.9 * exp(-r / 0.012) + 0.35 * exp(-r / 0.05));
  c += stars(p, rdn.y);
  return c;
}

void main() {
  PX = 1.0 / u_res.y;
  Tw = mod(u_time, LOOP);
  SUN = normalize(vec3(SUNP.x, SUNP.y - YH, FOC));
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.34 * smoothstep(0.12, 0.62, dot(vq, vq) * 1.6);
  CAM = vec3(u_par.x * TCAM, CAMH + u_par.y * TCAM, 0.0);
  float dither = (h12(gl_FragCoord.xy + fract(Tw) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;
  int L = u_layer > -0.5 ? int(u_layer + 0.5) : -1;
  // wind: breathing gusts, and a strong gust front sweeping the field every 300 s
  GUST = 0.42 + 0.20 * (0.5 + 0.5 * wav(1.0 / 37.5, 0.0)) + 0.14 * (0.5 + 0.5 * wav(1.0 / 13.6, 1.3));
  float ev = mod(Tw + 120.0, 300.0);
  GEV = smoothstep(0.0, 6.0, ev) * smoothstep(52.0, 30.0, ev);
  GFR = mix(-2600.0, 400.0, sat(ev / 42.0));
  CVS = mod(Tw, CVL) - 0.5 * CVL;

  // heat shimmer over the distant sand
  vec2 q = p;
  float hs = exp(-abs(p.y - YH + 0.01) / 0.02);
  q.y += (vnoiseT(vec2(p.x * 260.0, Tw * 5.0), 6000.0) - 0.5) * 0.0011 * hs;
  q.x += (vnoiseT(vec2(p.y * 700.0, Tw * 3.0), 3600.0) - 0.5) * 0.0004 * hs;
  vec3 rd = vec3(q.x / FOC, (q.y - YH) / FOC, 1.0);
  vec3 rdn = normalize(rd);

  // one march serves every terrain layer; every costly piece has one call site
  bool full = L < 0;
  bool tl = L == 2 || L == 3 || L == 4 || L == 6;
  float rmin = 1e9, zm = 0.0, gm = 0.0;
  float z = 1e9;
  PZc = -1.0; PGc = 1e3; PSC = 1e9;
  if (full || tl || L == 1 || L == 5 || L == 7) z = march(CAM, rd, rmin, zm, gm);
  bool hit = z < 1e8;
  float aT = full ? 1.0 : (tl ? layerOfZ(L, z) : 0.0);
  vec3 tc = vec3(0.0);
  SLIPD = -1.0;
  if (hit && (aT > 0.0 || L == 7)) tc = shadeSand(CAM + rd * z, rdn, z);
  vec3 sc = vec3(0.0);
  if (L == 0 || (full && !hit)) sc = skyColor(p, normalize(vec3(p.x / FOC, (p.y - YH) / FOC, 1.0)));
  vec4 fr = vec4(0.0);
  if (!hit && (full || L == 1)) fr = farRanges(q, rdn);
  float cov = 0.5 * (1.0 - smoothstep(0.0, 1.0, rmin));
  float aB = cov > 0.01 ? cov * (full ? 1.0 : (tl ? layerOfZ(L, zm) : 0.0)) : 0.0;
  vec3 bc = aB > 0.0 ? shadeBrink(zm, rdn) : vec3(0.0);
  vec4 cv = (full || L == 5) ? caravan(rd, rdn, hit ? z : 1e9) : vec4(0.0);
  vec4 bs = (full || L == 7) ? blowing(rd, rdn, z, hit) : vec4(0.0);

  if (full) {
    vec3 col = hit ? display(tc) : over(vec4(display(sc), 1.0), vec4(display(fr.rgb), 1.0) * fr.a).rgb;
    col = mix(col, display(bc), aB);
    col = cv.rgb + col * (1.0 - cv.a);
    col = bs.rgb + col * (1.0 - bs.a);
    fragColor = vec4(col + dither, 1.0);
    return;
  }
  vec4 c = vec4(0.0);
  if (L == 0) c = vec4(display(sc), 1.0);
  else if (L == 1) c = vec4(display(fr.rgb), 1.0) * fr.a;
  else if (L == 5) c = cv;
  else if (L == 7) c = bs;
  else if (tl) {
    if (hit) c = vec4(display(tc), 1.0) * aT;
    c = vec4(display(bc), 1.0) * aB + c * (1.0 - aB);
  }
  fragColor = vec4(c.rgb + dither * c.a, c.a);
}
`,
}
