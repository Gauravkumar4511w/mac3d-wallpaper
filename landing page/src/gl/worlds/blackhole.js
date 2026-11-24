// Event Horizon — a supermassive black hole seen just above its disk plane.
//
// Light is traced per pixel through the Schwarzschild metric in the photon's
// own orbital plane (the Binet equation u'' = -u + 3u², M = 1, RK4 with an
// adaptive step). That one cheap 1D integration gives everything: where the
// ray crosses the disk plane (the direct image, then the far side lensed up
// over the shadow and the underside below it), whether it falls in (the
// shadow) and how far it is bent on its way out (the lensed sky). The camera
// sits 80 M away, so perspective and the Einstein ring come out right.
//
// The disk is thin and partly transparent: Keplerian gas with relativistic
// Doppler beaming and gravitational redshift (approaching side brighter and
// bluer), sheared turbulence advected with the flow, slowly turning spiral
// arms, hot spots orbiting at their own Keplerian rate, and every few minutes
// a clump that spirals in, brightens and flashes at the ISCO. Behind: a
// lensed galaxy band and star field (stars splatted through the local lens
// Jacobian, so they stretch into arcs near the Einstein ring and never
// alias); a faint bipolar jet; a soft bloom; drifting foreground dust.
//
// Linear HDR, ACES fit, sRGB, dithered. Layers are premultiplied and the full
// scene is their back-to-front "over" composite in linear light.
//
// Time: one master loop (LOOP s). Orbits, flow phases, spirals, knots, drift
// and flares are all quantised to it, so u_time can grow forever.

const LOOP = 1800

export default {
  id: 'blackhole',
  name: 'Event Horizon',
  tag: 'Black hole, deep space',
  accent: '#ffab5e',
  accent2: '#ff5f8e',
  ink: '#a9520f',
  glow: '#ffd6a8',
  light: false,
  clockColor: '#f6f0ff',
  sky: 'radial-gradient(48% 40% at 69% 53%, #fff1d6 0%, #ffb35e 4%, #b4483a 9%, #3c1838 18%, #150c2c 36%, #08071a 62%, #040410 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Deep space', depth: 0 },
    { name: 'Star field', depth: 0.03 },
    { name: 'Relativistic jets', depth: 0.6 },
    { name: 'Shadow & photon ring', depth: 0.6 },
    { name: 'Accretion disk', depth: 0.6 },
    { name: 'Infalling clump', depth: 0.6 },
    { name: 'Glow', depth: 0.66 },
    { name: 'Drifting dust', depth: 1.2 },
  ],
  clockAfter: 2, // space, stars and jets behind the clock; the hole, its disk and the dust in front
  stillTime: 100,
  frag: /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718

// ---------------------------------------------------------------- scene setup
const float LOOP = ${LOOP}.0;          // master loop (s)
const float PAR = 0.03;              // parallax: screen heights per unit depth
const float DH = 0.6;                // depth of the black hole group
const float DG = 0.66;               // glow
const float DD = 1.2;                // dust
const vec2 HC = vec2(0.35, 0.415);    // hole centre (layer-local, screen heights)
const float DCAM = 80.0;             // camera distance (M = 1)
const float FL = 1.8;               // focal length (screen heights)
const float BC = 5.196152423;        // critical impact parameter 3*sqrt(3)
const float RIN = 6.0;               // ISCO
const float ROUT = 24.0;             // outer disk edge
const float INC = 1.37;              // disk normal vs line of sight (~78.5 deg: 11.5 deg above the plane)
const float ROLL = -0.07;            // tilt of the disk on screen
const float OM6 = TAU / 50.0;        // Keplerian angular speed at the ISCO (rad/s)
const float KS = 0.55;               // sky lens strength (background sources at a finite distance)
const float BFAR = 34.0;             // beyond this impact parameter: no disk, analytic bending
const float EXPOSURE = 0.9;
const float FP = 180.0;              // flare period (10 per loop)
const float TIN = 75.0;              // clump inspiral time
const float R0F = 15.0;              // clump start radius

vec3 gN, gD1, gD2;   // disk frame (camera space: x right, y up, z towards the camera)
float gT;            // loop time
float gFl;           // flare flash envelope (0..1)

float sq(float x) { return x * x; }

// ---------------------------------------------------------------- hashes & noise
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// fbm with a fractional octave count (resolution-aware fade-out)
float fbm(vec2 p, float oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 7; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    s += a * mix(0.5, vnoise(p), w);
    n += a;
    p = mat2(1.6, -1.2, 1.2, 1.6) * p + 7.31;
    a *= 0.5;
  }
  return n > 0.0 ? s / n : 0.5;
}
// value noise periodic in y with integer period P
float vnoiseP(vec2 p, float P) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, P), y1 = mod(i.y + 1.0, P);
  float a = hash12(vec2(i.x, y0)), b = hash12(vec2(i.x + 1.0, y0));
  float c = hash12(vec2(i.x, y1)), d = hash12(vec2(i.x + 1.0, y1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ---------------------------------------------------------------- tone mapping
vec3 acesFit(vec3 c) {
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}
vec3 srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 encodeC(vec3 c) { return srgb(acesFit(c * EXPOSURE)); }
float dither() {
  vec2 fc = gl_FragCoord.xy;
  return (hash12(fc) + hash12(fc + 71.3) - 1.0) / 255.0;
}

// ---------------------------------------------------------------- palette
// observed temperature (1 = ISCO at rest) -> colour: deep rose, coral, amber, white, blue-white
vec3 heat(float T) {
  vec3 c = mix(vec3(0.42, 0.05, 0.20), vec3(1.0, 0.30, 0.32), smoothstep(0.18, 0.42, T));
  c = mix(c, vec3(1.0, 0.60, 0.28), smoothstep(0.42, 0.66, T));
  c = mix(c, vec3(1.0, 0.88, 0.72), smoothstep(0.66, 0.95, T));
  c = mix(c, vec3(0.80, 0.90, 1.18), smoothstep(1.0, 1.45, T));
  return c;
}

// ---------------------------------------------------------------- ray tracing
// One photon traced back from the camera (r = DCAM, phi = 0) in its orbital
// plane. phc0 = first angle at which the ray lies in the disk plane; later
// crossings follow every pi. Records up to two crossings (u, du/dphi, phi),
// capture, and the escape angle.
float cu0, cw0, cph0, cu1, cw1, cph1;
float gCap, gPhiInf;

void trace(float b, float phc0) {
  cu0 = -1.0; cw0 = 0.0; cph0 = phc0;
  cu1 = -1.0; cw1 = 0.0; cph1 = phc0 + PI;
  gCap = 1.0;
  gPhiInf = 0.0;
  float u = 1.0 / DCAM;
  float w = sqrt(max(1.0 / (b * b) - u * u + 2.0 * u * u * u, 0.0));
  float ph = 0.0;
  float phc = phc0;
  int nc = 0;
  for (int i = 0; i < 280; i++) {
    float h = 0.15 / (1.0 + 7.0 * u);
    float k1w = u * (3.0 * u - 1.0);
    float u2 = u + 0.5 * h * w, w2 = w + 0.5 * h * k1w;
    float k2w = u2 * (3.0 * u2 - 1.0);
    float u3 = u + 0.5 * h * w2, w3 = w + 0.5 * h * k2w;
    float k3w = u3 * (3.0 * u3 - 1.0);
    float u4 = u + h * w3, w4 = w + h * k3w;
    float k4w = u4 * (3.0 * u4 - 1.0);
    float un = u + h / 6.0 * (w + 2.0 * w2 + 2.0 * w3 + w4);
    float wn = w + h / 6.0 * (k1w + 2.0 * k2w + 2.0 * k3w + k4w);
    float send = 1.0;
    if (un <= 0.0) {
      // escaped: root of the cubic Hermite segment
      float s = u / (u - un);
      for (int k = 0; k < 2; k++) {
        float s2 = s * s, s3 = s2 * s;
        float H = (2.0 * s3 - 3.0 * s2 + 1.0) * u + (s3 - 2.0 * s2 + s) * h * w + (3.0 * s2 - 2.0 * s3) * un + (s3 - s2) * h * wn;
        float dH = (6.0 * s2 - 6.0 * s) * u + (3.0 * s2 - 4.0 * s + 1.0) * h * w + (6.0 * s - 6.0 * s2) * un + (3.0 * s2 - 2.0 * s) * h * wn;
        s = clamp(s - H / dH, 0.0, 1.0);
      }
      gPhiInf = ph + s * h;
      gCap = 0.0;
      send = s;   // a crossing can still fall inside this last step
    }
    if (nc < 2 && ph + h * send >= phc) {
      float s = (phc - ph) / h;
      float s2 = s * s, s3 = s2 * s;
      float uc = (2.0 * s3 - 3.0 * s2 + 1.0) * u + (s3 - 2.0 * s2 + s) * h * w + (3.0 * s2 - 2.0 * s3) * un + (s3 - s2) * h * wn;
      float wc = mix(w, wn, s);
      if (nc == 0) { cu0 = uc; cw0 = wc; } else { cu1 = uc; cw1 = wc; }
      nc++;
      phc += PI;
    }
    if (un <= 0.0 || un >= 0.5) break;
    u = un;
    w = wn;
    ph += h;
    if (ph > phc0 + 2.0 * PI) break;   // still orbiting: part of the photon ring
  }
}

// weak-field bending for rays that pass far from the hole (no disk out there)
float farPhiInf(float b) {
  float ib = 1.0 / b;
  float delta = ib * (4.0 + ib * (11.780972 + ib * (42.666667 + ib * 170.0841)));
  float x = b / DCAM;
  float y = 1.0 - x * x;
  float inc = asin(x) - ib * (inversesqrt(y) + sqrt(y) - 2.0);
  return PI + delta - inc;
}

// ---------------------------------------------------------------- accretion disk
// turbulence in log-polar coordinates (periodic in angle).
// x: fine sheared filaments, y: coarse clumps (which also warp the filaments)
vec2 diskNoise(float lr, float ang, float seed, float fp) {
  vec2 q = vec2(lr * 4.0 + seed * 0.37, ang * (8.0 / TAU));
  float Pq = 8.0, c = 0.0, ac = 0.5, nc = 0.0, fq = fp * 0.45;
  for (int o = 0; o < 3; o++) {
    float wo = clamp(1.6 - 2.2 * fq, 0.0, 1.0);
    c += ac * mix(0.5, vnoiseP(q, Pq), wo);
    nc += ac;
    q = q * 2.0 + vec2(1.7, 5.0);
    Pq *= 2.0;
    fq *= 2.0;
    ac *= 0.5;
  }
  c /= nc;
  vec2 p = vec2((lr + 0.06 * (c - 0.5)) * 10.0 + seed, (ang + 0.6 * (c - 0.5)) * (12.0 / TAU));
  float P = 12.0;
  float s = 0.0, a = 0.5, n = 0.0;
  for (int o = 0; o < 6; o++) {
    float wo = clamp(1.6 - 2.2 * fp, 0.0, 1.0);
    if (wo <= 0.0) break;
    s += a * mix(0.5, vnoiseP(p, P), wo);
    n += a;
    p = p * 2.0 + vec2(5.3, 3.0);
    P *= 2.0;
    fp *= 2.0;
    a *= 0.58;
  }
  return vec2(n > 0.0 ? s / n : 0.5, c);
}

// Keplerian angular speed (rad/s)
float omega(float r) { return OM6 * pow(RIN / max(r, RIN), 1.5); }

// hot spots: integer orbits per loop -> radii follow Kepler
const float HSK[6] = float[6](34.0, 25.0, 18.0, 13.0, 9.0, 6.0);
const float HSA[6] = float[6](0.3, 2.1, 4.4, 1.2, 5.3, 3.4);

// emission (premultiplied rgb) and opacity of the disk at a crossing
// r, psi: disk position; g: redshift factor; mu: |cos| between ray and disk normal;
// drv, dpv: screen derivatives (per pixel, x and y) of r and psi
vec4 diskAt(float r, float psi, float g, float mu, vec2 drv, vec2 dpv) {
  if (r < 2.4 || r > ROUT + 1.0) return vec4(0.0);
  float lr = log(r);
  float om = omega(r);
  float fr = max(abs(drv.x), abs(drv.y));
  float fpsi = max(abs(dpv.x), abs(dpv.y));

  // turbulence: two phases advected with the flow, variance-preserving crossfade
  const float TP = 60.0;
  vec2 n = vec2(0.0);
  float w2 = 0.0;
  for (int i = 0; i < 2; i++) {
    float tt = gT + float(i) * TP * 0.5;
    float cyc = floor(tt / TP);
    float tau = tt - cyc * TP;
    float wgt = 1.0 - abs(2.0 * tau / TP - 1.0);
    float seed = floor(hash11(mod(cyc, LOOP / TP) * 1.37 + float(i) * 17.0) * 211.0);
    float ta = tau + 12.0;                  // a little pre-shear: always trailing
    float ang = psi - om * ta;
    float sh = 1.5 * om * ta / r;           // d(ang)/dr from the shear
    vec2 fx = vec2(10.0 * drv.x / r, (12.0 / TAU) * (dpv.x + sh * drv.x));
    vec2 fy = vec2(10.0 * drv.y / r, (12.0 / TAU) * (dpv.y + sh * drv.y));
    float fp = max(length(fx), length(fy));
    vec2 v = diskNoise(lr, ang, seed, fp);
    n += wgt * (v - 0.5);
    w2 += wgt * wgt;
  }
  n = clamp(n * inversesqrt(w2) * vec2(1.2, 1.3) + 0.5, 0.0, 1.0);

  // radial profile: soft ISCO edge, faint plunging gas inside it, ragged outer edge
  float fe = sqrt(0.25 + fr * fr);
  float edgeIn = smoothstep(RIN - 0.5 * fe, RIN + 0.9 * fe, r);
  float outer = 1.0 - smoothstep(10.0, ROUT, r + 9.0 * (n.y - 0.5));
  float plunge = (1.0 - edgeIn) * smoothstep(2.4, RIN, r) * 0.2;

  // two trailing spiral arms, slowly turning (6 turns per loop)
  float arm = cos(2.0 * (psi - TAU * fract(6.0 * gT / LOOP)) - 7.5 * lr + 2.5 * (n.y - 0.5));
  float armW = clamp(1.5 - 2.4 * fpsi - 7.5 * fr / r, 0.0, 1.0);
  arm = mix(0.7, 0.35 + 0.9 * smoothstep(-0.4, 0.9, arm), armW);

  float streak = n.x * n.x * 2.0 + 0.05;
  float clump = 0.22 + 1.5 * smoothstep(0.3, 0.78, n.y);
  float dens = (edgeIn * outer * arm * clump + plunge) * streak;

  // hot spots
  float hs = 0.0;
  for (int j = 0; j < 6; j++) {
    float k = HSK[j];
    float rj = RIN * pow(36.0 / k, 0.6666667);
    float dr = r - rj;
    if (abs(dr) > 2.5 + 3.0 * fr) continue;
    float pj = HSA[j] + TAU * fract(k * gT / LOOP);
    float dp = mod(psi - pj + PI, TAU) - PI;
    float al = dp * r;
    float L = al > 0.0 ? 0.7 : 2.6 + 0.25 * rj;     // trailing tail
    float wr = sqrt(0.16 + fr * fr);
    float wt = sqrt(L * L + fpsi * fpsi * r * r);
    float life = 0.55 + 0.45 * sin(TAU * fract(float(j + 2) * gT / LOOP) + HSA[j] * 3.0);
    hs += life * life * (0.5 / wr) * (L / wt) * exp(-dr * dr / (wr * wr) - al * al / (wt * wt));
  }
  dens += hs * 1.6 * edgeIn;

  // light: hotter and brighter inwards; Doppler beaming and redshift
  float T = pow(RIN / max(r, RIN), 0.62) * (1.0 + 0.45 * hs);
  float Tobs = T * pow(max(g, 1e-3), 0.95);
  float E = 3.4 * pow(RIN / max(r, RIN * 0.8), 2.3) * (1.0 + 2.0 * hs) * pow(max(g, 1e-3), 2.7) * (1.0 + 1.2 * gFl * exp(-(r - RIN) * 0.4));
  float tauO = dens * mix(0.9, 0.25, smoothstep(RIN, ROUT, r)) / max(mu, 0.04);
  float a = 1.0 - exp(-tauO);
  return vec4(heat(Tobs) * E * a, a);
}

// ---------------------------------------------------------------- infalling clump
vec3 clumpAt(float r, float psi, float g, vec2 drv, vec2 dpv) {
  float te = mod(gT, FP) - 30.0;
  if (te < 0.0 || te > TIN + 4.0) return vec3(0.0);
  float idx = floor(gT / FP);
  float u0 = pow(R0F, 1.5), u1 = pow(RIN, 1.5);
  float kap = (u0 - u1) / TIN;
  float tc = min(te, TIN);
  float up = u0 - kap * tc;
  float rc = pow(up, 0.6666667);
  float pc = hash11(idx * 7.31 + 3.0) * TAU + OM6 * u1 / kap * log(u0 / up);
  float fr = max(abs(drv.x), abs(drv.y));
  float fpsi = max(abs(dpv.x), abs(dpv.y));
  float dr = r - rc;
  float dp = mod(psi - pc + PI, TAU) - PI;
  float al = dp * r;
  float prog = tc / TIN;
  float L = al > 0.0 ? 0.5 : 0.8 + 6.0 * prog * prog;   // tidally stretched tail
  float wr0 = 0.35 + 0.25 * (1.0 - prog);
  float wr = sqrt(wr0 * wr0 + fr * fr);
  float wt = sqrt(L * L + fpsi * fpsi * r * r);
  float blob = (wr0 / wr) * (L / wt) * exp(-dr * dr / (wr * wr) - al * al / (wt * wt));
  float B = 10.0 * smoothstep(0.0, 14.0, te) * pow(R0F / rc, 1.6);
  B *= te > TIN ? exp(-(te - TIN) * 1.2) : 1.0;
  return heat(1.25 * pow(max(g, 1e-3), 0.95)) * B * pow(max(g, 1e-3), 3.0) * blob;
}

// ---------------------------------------------------------------- sky
vec3 nebula(vec2 q, float fps) {
  vec2 o = q - vec2(0.36, 0.24);
  vec2 dir = normalize(vec2(1.0, 0.5));
  vec2 uv = vec2(dot(o, dir), dot(o, vec2(-dir.y, dir.x)));
  float oct = clamp(log2(0.25 / max(fps * 9.0, 1e-6)), 1.0, 6.0);
  float wv = fbm(uv * 1.7 + 3.0, min(oct, 3.0));
  float v = uv.y + 0.1 * (wv - 0.5) + 0.035 * sin(uv.x * 2.1 + 0.7);
  float width = 0.09 + 0.035 * sin(uv.x * 2.4 + 1.3);
  float core = exp(-v * v / (2.0 * width * width));
  float halo = exp(-v * v / (2.0 * 0.17 * 0.17));
  float clump = fbm(uv * vec2(4.5, 7.5) + 11.0, oct);
  float clouds = smoothstep(0.36, 0.78, clump);
  float grain = fbm(uv * vec2(38.0, 44.0) - 4.0, oct - 2.5);
  float dust = fbm(uv * vec2(3.0, 10.0) + vec2(2.0, 9.0), oct);
  float ridge = 1.0 - abs(dust - 0.5) * 2.0;
  float lane = smoothstep(0.5, 0.9, ridge) * exp(-sq((v - 0.012) / (width * 0.7)));
  float bulge = exp(-sq((uv.x + 0.55) / 0.35));
  // deep indigo floor with a faint gradient (never flat black)
  vec3 col = vec3(0.0042, 0.0036, 0.0105) * (0.75 + 0.45 * q.y) * (1.0 + 0.25 * (wv - 0.5));
  col += vec3(0.30, 0.24, 0.80) * halo * 0.01;
  float b = core * (0.2 + 1.7 * clouds * clouds) * (0.55 + 0.9 * grain * grain) * (1.0 + 1.2 * bulge);
  col += mix(vec3(0.55, 0.52, 1.0), vec3(1.0, 0.8, 0.82), clamp(clouds * core + 0.5 * bulge, 0.0, 1.0)) * b * 0.1 * (1.0 - 0.92 * lane);
  float em1 = smoothstep(0.56, 0.82, fbm(uv * vec2(3.6, 5.0) + 31.0, oct));
  col += vec3(1.0, 0.2, 0.46) * em1 * halo * 0.045 * (1.0 - 0.85 * lane);
  float em2 = smoothstep(0.6, 0.88, fbm(uv * vec2(2.6, 3.6) - 17.0, oct));
  col += vec3(0.22, 0.5, 1.0) * em2 * halo * 0.016;
  return col;
}

// lens frame for star splats (set in main)
vec2 gSd;      // radial direction from the hole
float gFr;     // d|beta|/d|theta|
float gFt;     // |beta|/|theta| (signed)
float gSig2;   // pixel PSF variance (screen heights^2)
float gSrc2;   // intrinsic star size variance (source plane)
float gPx;

vec3 starTint(float r) {
  vec3 c = mix(vec3(1.0, 0.6, 0.42), vec3(1.0, 0.86, 0.76), smoothstep(0.0, 0.2, r));
  c = mix(c, vec3(1.0, 0.97, 0.95), smoothstep(0.2, 0.5, r));
  c = mix(c, vec3(0.72, 0.8, 1.0), smoothstep(0.62, 0.95, r));
  return c;
}

vec3 starGrid(vec2 q, float cell, float prob, float F0, float seed) {
  float fpS = gPx * max(abs(gFr), abs(gFt));
  float vis = smoothstep(1.6, 3.5, cell / fpS);
  if (vis <= 0.0) return vec3(0.0);
  vec2 g = q / cell + seed;
  vec2 id = floor(g);
  vec4 h = hash42(id);
  if (h.x > prob) return vec3(0.0);
  vec2 d = (fract(g) - (0.2 + 0.6 * h.yz)) * cell;
  float dr = dot(d, gSd), dt = dot(d, vec2(-gSd.y, gSd.x));
  float ft = abs(gFt) < 1e-4 ? 1e-4 : gFt;
  float sr = gSrc2 / (gFr * gFr) + gSig2;
  float st = gSrc2 / (ft * ft) + gSig2;
  float er = dr / gFr, et = dt / ft;
  float mu = min(1.0 / abs(gFr * ft), 40.0);
  float I = mu * gSig2 * inversesqrt(sr * st) * exp(-0.5 * (er * er / sr + et * et / st));
  float F = F0 * min(pow(max(h.w, 1e-3), -0.8), 30.0);
  return starTint(fract(h.y * 13.1 + h.z * 7.3)) * F * I * vis;
}

vec3 stars(vec2 q) {
  vec2 o = q - vec2(0.36, 0.24);
  vec2 dir = normalize(vec2(1.0, 0.5));
  float v = dot(o, vec2(-dir.y, dir.x));
  float band = exp(-v * v / (2.0 * 0.14 * 0.14));
  float patchy = smoothstep(0.25, 0.8, fbm(q * 2.2 + 5.0, 3.0));
  float dens = 0.25 + 0.55 * patchy + 1.3 * band;
  float lum = clamp(pow(0.001 / gPx, 1.4), 0.12, 6.0);   // same light per area at any resolution, a little fainter when small
  vec3 s = vec3(0.0);
  s += starGrid(q, 0.0048, 0.3 * dens, 0.008 * lum, 0.0);
  s += starGrid(q, 0.0086, 0.22 * dens, 0.02 * lum, 17.0);
  s += starGrid(q, 0.019, 0.22 * (0.5 + 0.5 * dens), 0.05 * lum, 41.0);
  s += starGrid(q, 0.05, 0.22, 0.2 * pow(lum, 0.8), 73.0);
  return s;
}

// ---------------------------------------------------------------- jets
vec3 jets(vec2 th) {
  vec2 ax = normalize(gN.xy);
  vec2 pr = vec2(-ax.y, ax.x);
  float s = dot(th, ax), w = dot(th, pr);
  float side = s >= 0.0 ? 1.0 : -1.0;
  float as = abs(s);
  float tw = TAU * fract(40.0 * gT / LOOP);
  float wig = 0.004 * smoothstep(0.1, 0.5, as) * sin(as * 30.0 - side * tw);
  float width = 0.004 + 0.06 * as;
  float core = exp(-sq((w - wig) / width));
  float sheath = exp(-sq(w / (2.5 * width + 0.012)));
  float along = smoothstep(0.1, 0.22, as) * exp(-as / 0.3);
  // knots travelling outwards
  float kn = 0.0;
  for (int j = 0; j < 3; j++) {
    float pos = 0.1 + 0.8 * fract(float(12 + 5 * j) * gT / LOOP + float(j) * 0.37 + (side > 0.0 ? 0.0 : 0.5));
    kn += exp(-sq((as - pos) / (0.015 + 0.05 * pos))) * smoothstep(0.1, 0.25, pos);
  }
  float dop = side > 0.0 ? 1.0 : 0.25;
  vec3 c = vec3(0.45, 0.5, 1.0) * (core * (0.35 + 1.0 * kn) + 0.22 * sheath) + vec3(0.75, 0.8, 1.0) * core * core * kn * 0.5;
  return c * along * dop * 0.05;
}

// ---------------------------------------------------------------- glow (bloom)
vec3 glowAt(vec2 th) {
  float rho = length(th);
  vec2 d1 = normalize(gD1.xy);     // towards the approaching ansa
  vec2 ns = normalize(gN.xy);
  float a = dot(th, d1), z = dot(th, ns);
  float rsh = FL * BC / DCAM;
  float dr = abs(rho - rsh * 1.1);
  float side = clamp(a / 0.2, -1.0, 1.0);
  float halo = (0.03 / (1.0 + sq(dr / 0.02)) + 0.012 * exp(-dr / 0.07)) * mix(0.25, 1.0, smoothstep(rsh * 0.6, rsh * 1.1, rho)) + 0.003 * exp(-rho / 0.4);
  float band = exp(-z * z / (2.0 * 0.018 * 0.018) - a * a / (2.0 * 0.12 * 0.12));
  band += 0.3 * exp(-z * z / (2.0 * 0.06 * 0.06) - a * a / (2.0 * 0.2 * 0.2));
  float dop = 1.0 + 0.7 * side;
  vec3 c = vec3(1.0, 0.6, 0.38) * halo * dop + vec3(1.0, 0.68, 0.45) * band * 0.04 * dop * dop;
  return c * (1.0 + 2.5 * gFl);
}

// ---------------------------------------------------------------- dust
vec4 dustGrid(vec2 q, float cell, vec2 P, float prob, float rmin, float rmax, float px) {
  vec2 g = q / cell + P * (gT / LOOP);
  vec2 id = floor(g);
  vec4 h = hash42(mod(id, P) + 0.5);
  if (h.x > prob) return vec4(0.0);
  float ph = TAU * fract(3.0 * gT / LOOP + h.y);
  vec2 pos = 0.5 + 0.22 * (h.yz - 0.5) + 0.06 * vec2(sin(ph), cos(ph * 1.0 + h.w * 6.0));
  float R = mix(rmin, rmax, h.w * h.w);
  float d = length((fract(g) - pos) * cell);
  float aa = max(px, 0.12 * R);
  float disc = smoothstep(R + aa * 0.5, R - aa * 0.5, d);
  float rim = smoothstep(R * 0.55, R, d) * disc;
  float body = disc * (0.75 + 0.5 * rim) * (0.55 + 0.45 * fract(h.x * 31.7));
  return vec4(vec3(body), disc);
}

vec4 dust(vec2 q, vec2 thd, float px) {
  // lit by the disk: warm near the hole, brighter on the approaching side
  float rho = length(thd);
  vec2 d1 = normalize(gD1.xy);
  float side = clamp(dot(thd, d1) / max(rho, 1e-3), -1.0, 1.0);
  float lit = 0.05 / (0.03 + rho * rho) * (1.0 + 0.4 * side) * (1.0 + 1.5 * gFl);
  vec3 tint = mix(vec3(0.55, 0.5, 0.9) * 0.012, vec3(1.0, 0.62, 0.4) * 0.05, clamp(lit, 0.0, 1.0)) * (0.4 + lit);
  vec4 a = dustGrid(q, 0.12, vec2(26.0, 18.0), 0.42, 0.006, 0.02, px);
  vec4 b = dustGrid(q + 3.1, 0.055, vec2(40.0, 30.0), 0.32, 0.0025, 0.006, px);
  vec3 c = tint * (a.rgb * 0.7 + b.rgb);
  float al = clamp(a.a * 0.1 + b.a * 0.16, 0.0, 1.0);
  return vec4(c, al);
}

// ---------------------------------------------------------------- main
void main() {
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  float px = 1.0 / u_res.y;
  int lay = u_layer < 0.0 ? -1 : int(u_layer + 0.5);
  bool full = lay < 0;
  gT = mod(u_time, LOOP);
  gPx = px;

  gN = normalize(vec3(-sin(ROLL) * sin(INC), cos(ROLL) * sin(INC), cos(INC)));
  gD1 = normalize(cross(vec3(0.0, 0.0, 1.0), gN));
  gD2 = cross(gN, gD1);

  // flare flash: the clump reaches the ISCO at te = TIN
  {
    float te = mod(gT, FP) - 30.0;
    gFl = te < 0.0 ? 0.0 : smoothstep(TIN - 6.0, TIN, te) * exp(-max(te - TIN, 0.0) / 6.0);
  }

  // ---- the ray through this pixel (hole-local coordinates)
  vec2 th = p + u_par * DH * PAR - HC;
  float rho = max(length(th), 1e-6);
  vec2 sd = th / rho;
  float alp = atan(rho, FL);
  float bscale = DCAM * inversesqrt(1.0 - 2.0 / DCAM);
  float b = bscale * sin(alp);
  float bpx = bscale * cos(alp) * FL / (FL * FL + rho * rho) * px;
  float nz = gN.z, ns = dot(sd, gN.xy);
  float phc0 = atan(-nz, ns) + PI;

  bool needRay = full || lay <= 1 || lay == 4 || lay == 5;
  if (needRay) {
    if (b < BFAR) {
      trace(b, phc0);
    } else {
      cu0 = -1.0; cu1 = -1.0; cw0 = 0.0; cw1 = 0.0; cph0 = phc0; cph1 = phc0 + PI;
      gCap = 0.0;
      gPhiInf = farPhiInf(b);
    }
  }

  // total bending and the lens map beta = sd * f(rho)
  float bend = gCap > 0.5 ? 2.0 * PI : gPhiInf - PI + alp;
  float f = rho - FL * KS * bend;
  vec2 dB = vec2(dFdx(bend), dFdy(bend)) / px;
  float capQ = fwidth(gCap);
  gSd = sd;
  gFr = 1.0 - FL * KS * dot(dB, sd);
  gFt = f / rho;
  gSig2 = sq(0.7 * px);
  gSrc2 = sq(0.00022);

  // disk crossings: positions and their screen derivatives (uniform control flow)
  vec3 e0 = vec3(sin(cph0) * sd, cos(cph0));
  vec3 e1 = vec3(sin(cph1) * sd, cos(cph1));
  float r0 = cu0 > 0.0 ? 1.0 / cu0 : 0.0;
  float r1 = cu1 > 0.0 ? 1.0 / cu1 : 0.0;
  vec2 X0 = r0 * vec2(dot(e0, gD1), dot(e0, gD2));
  vec2 X1 = r1 * vec2(dot(e1, gD1), dot(e1, gD2));
  vec3 dx0 = dFdx(vec3(r0, X0)), dy0 = dFdy(vec3(r0, X0));
  vec3 dx1 = dFdx(vec3(r1, X1)), dy1 = dFdy(vec3(r1, X1));

  vec3 col = vec3(0.0);   // linear composite (full scene)
  vec3 lc = vec3(0.0);    // isolated layer colour (premultiplied)
  float la = 0.0;         // isolated layer alpha

  // where the sky behind this ray is (screen space): hole centre + beta
  vec2 hcS = HC - u_par * DH * PAR;
  vec2 drift = 0.045 * vec2(cos(TAU * gT / LOOP), sin(TAU * gT / LOOP)) + vec2(0.0, 0.0);
  vec2 skyS = hcS + sd * f + drift;
  float fps = px * max(abs(gFr), abs(gFt));
  float skyVis = gCap > 0.5 ? 0.0 : 1.0;

  // ---- 0: deep space (lensed galaxy band)
  if (full || lay == 0) {
    vec3 c = mix(nebula(skyS + u_par * 0.0 * PAR, fps), vec3(0.006, 0.005, 0.014), smoothstep(0.015, 0.06, fps)) * skyVis;
    if (full) col = c; else { lc = c; la = 1.0; }
  }

  // ---- 1: star field (lensed)
  if (full || lay == 1) {
    vec3 c = vec3(0.0);
    if (skyVis > 0.0 && capQ == 0.0) c = stars(skyS + u_par * 0.03 * PAR);
    if (full) col += c; else { lc = c; la = 0.0; }
  }

  // ---- 2: relativistic jets (behind the shadow)
  if (full || lay == 2) {
    vec3 c = jets(th);
    if (full) col += c; else { lc = c; la = 0.0; }
  }

  // ---- 3: shadow and photon ring
  if (full || lay == 3) {
    float cov = clamp((BC - b) / bpx + 0.5, 0.0, 1.0);
    float wr = 0.025;
    float sg = sqrt(wr * wr + 0.35 * bpx * bpx);
    float ring = exp(-0.5 * sq((b - BC - 0.03) / sg)) * wr / sg;
    ring += 0.25 * exp(-max(b - BC, 0.0) / 0.25) * smoothstep(-bpx, bpx, b - BC);
    float side = dot(sd, normalize(gD1.xy));
    vec3 C = mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.9, 0.8), 0.5 + 0.5 * side) * ring * (1.5 + 1.3 * side) * (1.0 + 3.0 * gFl) * 1.6;
    if (full) col = C + col * (1.0 - cov); else { lc = C; la = cov; }
  }

  // ---- 4, 5: accretion disk and the infalling clump
  if (full || lay == 4 || lay == 5) {
    vec4 D = vec4(0.0);
    vec3 K = vec3(0.0);
    for (int n = 0; n < 2; n++) {
      float uc = n == 0 ? cu0 : cu1;
      if (uc <= 0.0) continue;
      float wc = n == 0 ? cw0 : cw1;
      float ph = n == 0 ? cph0 : cph1;
      float r = 1.0 / uc;
      if (r < 2.4 || r > ROUT + 1.0) continue;
      vec3 e = vec3(sin(ph) * sd, cos(ph));
      vec3 ep = vec3(cos(ph) * sd, -sin(ph));
      vec3 kd = normalize(wc * e - uc * ep);            // photon direction (towards the camera)
      vec3 vd = cross(gN, e);                            // orbital direction
      float rv = max(r, 3.2);
      float beta = inversesqrt(rv - 2.0);
      float g = sqrt(1.0 - 3.0 / rv) / (1.0 - beta * dot(vd, kd));
      float mu = abs(dot(kd, gN));
      vec2 X = n == 0 ? X0 : X1;
      vec3 dx = n == 0 ? dx0 : dx1;
      vec3 dy = n == 0 ? dy0 : dy1;
      float psi = atan(X.y, X.x);
      float ir2 = 1.0 / (r * r);
      vec2 dpv = vec2(X.x * dx.z - X.y * dx.y, X.x * dy.z - X.y * dy.y) * ir2;
      vec2 drv = vec2(dx.x, dy.x);
      // derivatives across a crossing that only exists on one side are meaningless: cap them
      drv = clamp(drv, -6.0, 6.0);
      dpv = clamp(dpv, -1.5, 1.5);
      vec4 d = diskAt(r, psi, g, mu, drv, dpv);
      vec3 k = clumpAt(r, psi, g, drv, dpv);
      K += k * (1.0 - D.a);
      D += d * (1.0 - D.a);
    }
    if (full) {
      col = D.rgb + col * (1.0 - D.a);
      col += K;
    } else if (lay == 4) { lc = D.rgb; la = D.a; }
    else { lc = K; la = 0.0; }
  }

  // ---- 6: glow
  if (full || lay == 6) {
    vec3 c = glowAt(p + u_par * DG * PAR - HC);
    if (full) col += c; else { lc = c; la = 0.0; }
  }

  // ---- 7: drifting dust
  if (full || lay == 7) {
    vec2 q = p + u_par * DD * PAR;
    vec4 d = dust(q, q - HC, px);
    if (full) col = d.rgb + col * (1.0 - d.a); else { lc = d.rgb; la = d.a; }
  }

  if (full && u_par.y > 0.5) { fragColor = vec4(encodeC(nebula(skyS, fps) * skyVis * 4.0), 1.0); if (u_par.x > 0.5) fragColor = vec4(fract(skyS * 10.0), 0.0, 1.0); return; }
  if (full) {
    fragColor = vec4(encodeC(col) + dither(), 1.0);
  } else {
    vec3 c = clamp(encodeC(lc) + dither() * step(0.002, la + dot(lc, vec3(1.0))), 0.0, 1.0);
    float a = max(la, max(c.r, max(c.g, c.b)));
    fragColor = vec4(min(c, vec3(a)), a);
  }
}
`,
}
