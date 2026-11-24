// Slot Canyon — inside a narrow, wind-and-water-sculpted sandstone slot at noon.
// (work in progress)

export default {
  id: 'canyon',
  name: 'Slot Canyon',
  tag: 'Light beam at noon',
  accent: '#ff8a3d',
  accent2: '#8a5cc8',
  ink: '#9a3f12',
  glow: '#ffd9b0',
  light: false,
  clockColor: '#fff1e2',
  sky: 'linear-gradient(180deg,#ffd9a0 0%,#f0a050 18%,#c8603a 40%,#8a3a4a 62%,#4a2a4e 82%,#2a1c38 100%)',
  stillTime: 60,
  layers: [
    { name: 'Sky crack', depth: 0 },
    { name: 'Far folds', depth: 0.08 },
    { name: 'Glowing walls', depth: 0.2 },
    { name: 'Sand floor', depth: 0.3 },
    { name: 'Light beam', depth: 0.34 },
    { name: 'Near folds', depth: 0.55 },
    { name: 'Near wall', depth: 1.0 },
    { name: 'Dust motes', depth: 1.2 },
  ],
  clockAfter: 2,
  frag: /* glsl */ `
#define TAU 6.28318531
#define PI 3.14159265
#define DEBUG 0

const float LOOP = 2400.0;   // master loop (s)
const float PAR = 0.03;      // parallax per unit depth (screen heights)
const float FOC = 0.75;      // focal length (screen heights)
const float H = 7.0;        // rim height (m)
const float ZMAX = 46.0;
const float ZN = 2.0;        // distance that parallaxes as depth 1.0 (m)
const float TCAM = ZN * PAR / FOC;
const float YAW = 0.10;
const float PITCH = 0.20;
const vec3 CAM0 = vec3(0.0, 1.25, 0.0);
const float EXPO = 1.0;

float Tw;      // wrapped time
float PX;      // one pixel in screen heights
float VIG;
vec3 CAM;      // camera position
vec3 SUN;      // towards the sun (moves on a long cycle)
vec2 APR;      // aperture radii (along, across the crack), m
const vec2 APC = vec2(-2.5, 7.0);     // aperture centre (x, z) on the rim
const vec3 SUN0 = vec3(-0.100, 0.985, 0.120);  // mean sun direction (normalised below)
const float APA = 0.35;               // crack direction

float sq(float x) { return x * x; }
float sat(float x) { return clamp(x, 0.0, 1.0); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * 0.25; }

// ---------------------------------------------------------------- noise
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 h32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vn2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(h13(i), h13(i + vec3(1, 0, 0)), u.x);
  float b = mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), u.x);
  float c = mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), u.x);
  float d = mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

// ---------------------------------------------------------------- canyon
// The slot is described by its centre-line x = c(y, z) and the half-widths of its
// two walls; the phases drift with height, so the walls twist into overlapping,
// undercut folds. Near the beam the centre-line is drawn onto the beam's axis
// (a straight chimney the sun shines down), so the shaft always falls in the open.
vec3 beamAxis(float y) {   // (x, z) of the mean beam axis at height y, and the pull weight scale
  float s = (H - y) / SUN0.y;
  return vec3(APC.x - SUN0.x * s, APC.y - SUN0.z * s, 1.0);
}
float sstep(float a, float b, float x, out float d) {
  float u = clamp((x - a) / (b - a), 0.0, 1.0);
  d = 6.0 * u * (1.0 - u) / (b - a);
  return u * u * (3.0 - 2.0 * u);
}
vec2 cenD(float y, float z) {
  // the floor-level course: a left bend at the beam, then back right, and on
  float d1, d2, d3, d4;
  float c = -1.3 * sstep(1.5, 5.5, z, d1) + 1.6 * sstep(6.5, 11.0, z, d2) - 1.3 * sstep(12.0, 16.5, z, d3) + 1.1 * sstep(17.5, 23.0, z, d4);
  float cz = -1.3 * d1 + 1.6 * d2 - 1.3 * d3 + 1.1 * d4;
  // the walls twist and lean with height, and scallop into lobes
  float ty = smoothstep(0.3, 4.0, y);
  float a1 = 0.6 * z + 0.5 * y + 1.0;
  float a2 = 1.7 * z + 0.35 * y + 0.5;
  c += 0.38 * ty * sin(a1) + 0.16 * sin(a2);
  cz += 0.228 * ty * cos(a1) + 0.272 * cos(a2);
  // pull onto the beam's chimney
  vec3 b = beamAxis(y);
  float dz = (z - b.y) / 2.6;
  float g = 0.85 * exp(-dz * dz) * smoothstep(0.5, 3.0, y);
  float dg = -2.0 * dz / 2.6 * g;
  return vec2(mix(c, b.x, g), cz * (1.0 - g) + (b.x - c) * dg);
}
vec2 halfW(float y, float z) {
  float t = y / H;
  float w = mix(1.05, 0.2, smoothstep(0.15, 1.0, t)) + 0.3 * exp(-sq((t - 0.22) / 0.14));
  w *= 0.85 + 0.15 * sin(0.47 * z + 1.3 + 0.21 * y) + 0.08 * sin(1.13 * z - 0.4 * y);
  w += 0.25 * exp(-sq(z / 3.0)) * (1.0 - smoothstep(0.2, 0.5, t));
  vec3 b = beamAxis(y);
  w += 0.35 * exp(-sq((z - b.y) / 2.2)) * smoothstep(0.25, 0.8, t);
  // flutes: horizontal grooves scoured by floods, wandering along each wall
  float ul = 2.3 * y + 0.9 * sin(0.41 * z) + 0.15 * z + 1.0, ur = 2.0 * y + 1.1 * sin(0.36 * z + 2.0) - 0.12 * z;
  float fl = 0.2 * (sin(ul) + 0.35 * sin(2.0 * ul + 0.8)) + 0.05 * sin(4.6 * y - 0.8 * z + 2.0);
  float fr = 0.2 * (sin(ur) + 0.35 * sin(2.0 * ur + 0.8)) + 0.05 * sin(4.9 * y + 0.7 * z);
  // big rounded bulges: the walls swell and hollow like poured cloth
  fl += 0.28 * sin(0.8 * y + 0.9 * z + 0.4) * sin(0.55 * y - 0.6 * z + 1.9);
  fr += 0.28 * sin(0.75 * y - 0.85 * z + 2.2) * sin(0.6 * y + 0.5 * z + 0.3);
  return vec2(w + fl, w + fr);
}
float floorH(vec2 xz) {
  return 0.10 * sin(0.8 * xz.x + 0.43 * xz.y) + 0.07 * sin(0.31 * xz.y - 0.6 * xz.x + 1.0);
}
// distance-like field (positive in the air)
float WALLD;   // wall part of the last map() call
float FLRD;    // floor part
float map(vec3 P) {
  vec2 c = cenD(P.y, P.z);
  vec2 w = halfW(P.y, P.z);
  float dx = P.x - c.x;
  float lip = abs(c.y) + 0.45;
  float dw = min(dx + w.x, w.y - dx) * inversesqrt(1.0 + lip * lip + 0.3);
  dw = max(dw, P.y - H);
  float df = P.y - floorH(P.xz);
  WALLD = dw; FLRD = df;
  return smin(dw, df, 0.35);
}
vec3 normalAt(vec3 P, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(P + k.xyy * e) + k.yyx * map(P + k.yyx * e) + k.yxy * map(P + k.yxy * e) + k.xxx * map(P + k.xxx * e));
}

// ---------------------------------------------------------------- march
float NSTEP;
float march(vec3 ro, vec3 rd, out float rmin, out float tm) {
  rmin = 1e9; tm = 0.0; NSTEP = 0.0;
  float t = 0.05;
  float dp = 1e9, dpp = 1e9, tp = 0.0;
  float pk = FOC / PX;
  float tol = 0.5 * PX / FOC;
  for (int i = 0; i < 140; i++) {
    vec3 P = ro + rd * t;
    float d = map(P);
    NSTEP += 1.0;
    if (d < tol * t + 0.0005) return t;
    if (dp < dpp && d > dp) {
      float r = dp * pk / tp;
      if (r < rmin) { rmin = r; tm = tp; }
    }
    dpp = dp; dp = d; tp = t;
    t += max(d, 0.002 * t);
    if (t > ZMAX || (P.y > H + 0.5 && rd.y > 0.0)) return 1e9;
  }
  return t;
}

// ---------------------------------------------------------------- the beam
// Sunlight enters through one opening in the crack (an ellipse in the rim plane)
// and falls as a straight shaft. A point is in the beam if its projection along
// the sun onto the rim plane lands inside the opening.
vec2 apQ(vec3 P) {
  vec2 Q = P.xz + SUN.xz / SUN.y * (H - P.y) - APC;
  return (rot(APA) * Q) / APR;
}
float penum(float y) { return (0.015 + 0.0093 * (H - y)) / APR.y; }
float aperture(vec3 P) {
  vec2 q = apQ(P);
  float r = length(q);
  float e = penum(P.y);
  float rg = 1.0 + 0.10 * (vn1(atan(q.y, q.x) * 2.5 + 4.0) - 0.5);
  return smoothstep(rg + e, rg - e, r);
}
// G(r) = integral of the chord length 2 sqrt(r^2 - d^2) dr
float chordG(float r, float d) { float s = sqrt(max(r * r - d * d, 0.0)); return r * s - d * d * log(max(r + s, 1e-6)); }
// line integral (metres) through the shaft along the camera ray, clipped to [0, tmax];
// out: closest-approach point (t) and signed offset across the shaft (normalised)
float beamLine(vec3 ro, vec3 rd, float tmax, out float tc, out float sd) {
  vec2 k = SUN.xz / SUN.y;
  vec2 Q0 = ro.xz + k * (H - ro.y) - APC;
  vec2 Qd = rd.xz - k * rd.y;
  mat2 R = rot(APA);
  vec2 q0 = (R * Q0) / APR, qd = (R * Qd) / APR;
  float iq = inversesqrt(dot(qd, qd));
  tc = -dot(q0, qd) * iq * iq;
  sd = (q0.x * qd.y - q0.y * qd.x) * iq;
  float d = abs(sd);
  float yc = ro.y + rd.y * tc;
  float e = clamp(penum(yc), 0.02, 0.6);
  float r0 = 1.0 - e, r1 = 1.0 + e;
  if (d >= r1) return 0.0;
  float I = (chordG(r1, d) - chordG(max(r0, d), d)) / (2.0 * e);
  if (d < r0) I += 2.0 * sqrt(r0 * r0 - d * d) * 0.0;   // (inner part already in G)
  float hw = sqrt(r1 * r1 - d * d) * iq;
  float vis = sat((tmax - (tc - hw)) / (2.0 * hw)) * step(0.0, tc + hw);
  // only below the rim
  vis *= smoothstep(H + 0.3, H - 0.3, yc);
  return I * iq * vis;
}

// ---------------------------------------------------------------- light
const vec3 SUNC = vec3(1.0, 0.84, 0.64);
const float SUNI = 14.0;
vec3 FOOT;
// light that filters down the slot, bounced from wall to wall (linear, before albedo):
// hot gold from the sunlit rim walls, reddening and fading with every bounce on the
// way down, and a faint blue skylight that keeps the deep folds violet
const vec3 UPL = vec3(0.10, 0.99, 0.08);   // where the light comes from: the crack and the sunlit rim walls
// how much of the bright slot above a point can see (soft: overhangs shade what is under them)
float upVis(vec3 P, vec3 N) {
  float v = 1.0;
  float s = 0.25;
  vec3 dir = normalize(UPL + N * 0.35);
  for (int i = 0; i < 5; i++) {
    float d = map(P + dir * s);
    v = min(v, 2.2 * d / s);
    s *= 1.9;
  }
  return sat(v);
}
// the light field down the slot (linear irradiance by height): white-gold at the rim,
// deepening through orange, red and rose with every bounce, violet at the bottom
vec3 slotGrad(float h) {
  vec3 c = vec3(0.13, 0.09, 0.30);
  c = mix(c, vec3(0.42, 0.15, 0.26), smoothstep(0.0, 0.17, h));
  c = mix(c, vec3(1.10, 0.32, 0.20), smoothstep(0.12, 0.36, h));
  c = mix(c, vec3(2.3, 0.85, 0.30), smoothstep(0.30, 0.56, h));
  c = mix(c, vec3(4.2, 2.2, 0.80), smoothstep(0.52, 0.80, h));
  c = mix(c, vec3(7.5, 5.4, 3.1), smoothstep(0.78, 1.0, h));
  return c;
}
vec3 slotLight(vec3 P, vec3 N, float ao, float vis) {
  // more light pours down where the crack above is wider
  vec2 wt = halfW(H - 0.6, P.z);
  float open = smoothstep(0.1, 0.9, wt.x + wt.y);
  float h = sat(P.y / H + 0.06 * (open - 0.5));
  float form = (0.72 + 0.28 * N.y) * mix(0.62, 1.0, vis);
  vec3 cool = vec3(0.30, 0.32, 1.0) * 0.05;
  return slotGrad(h) * form * ao + cool * ao;
}
// sandstone: flowing cross-bedded laminae. lam is the bedding coordinate (m);
// fp the footprint of one pixel in it, so fine laminae fade before they alias.
float LAMK;   // cross-bed set index of the last call
float bedding(vec3 P) {
  float b = P.y + 0.06 * P.x - 0.04 * P.z + 0.22 * sin(0.33 * P.z + 0.4 * P.x + 1.0) + 0.09 * sin(0.8 * P.z - 0.45 * P.y + 2.0);
  float k = floor(b / 1.15);
  LAMK = k;
  vec2 hk = h22(vec2(k, 3.7));
  float ang = hk.x * TAU;
  // foresets dip within each set, curving onto the set's base
  float f = b / 1.15 - k;
  return b + (0.25 + 0.3 * hk.y) * dot(P.xz, vec2(cos(ang), sin(ang))) * (0.4 + 0.6 * f) + 3.1 * k;
}
float aaw(float freq, float fp) { return 1.0 - smoothstep(0.25, 0.7, freq * fp); }
vec3 stoneAlb(vec3 P, float fp, out float relief, out float rdl) {
  float lam = bedding(P);
  float k = LAMK;
  vec3 hk = h32(vec2(k, 9.1));
  // per-set tint: cream, salmon, deep red, a few violet-grey beds
  vec3 base = mix(vec3(0.80, 0.46, 0.27), vec3(0.86, 0.58, 0.38), hk.x);
  base = mix(base, vec3(0.66, 0.27, 0.15), smoothstep(0.55, 0.95, hk.y) * 0.8);
  base = mix(base, vec3(0.58, 0.36, 0.38), smoothstep(0.82, 1.0, hk.z) * 0.8);
  float w1 = aaw(4.5, fp), w2 = aaw(17.0, fp), w3 = aaw(60.0, fp), w4 = aaw(190.0, fp);
  float n1 = vn1(lam * 4.5 + k * 7.0) - 0.5;
  float n2 = vn1(lam * 17.0 + 3.0) - 0.5;
  float n3 = vn1(lam * 60.0 + 9.0) - 0.5;
  float n4 = vn1(lam * 190.0 + 1.0) - 0.5;
  float tone = 0.30 * n1 * w1 + 0.22 * n2 * w2 + 0.16 * n3 * w3 + 0.10 * n4 * w4;
  // the laminae weather into fine ridges
  float e = 0.004;
  float e2 = 0.01;
  float r2a = vn1((lam + e2) * 17.0 + 3.0), r2b = vn1((lam - e2) * 17.0 + 3.0);
  float r3a = vn1((lam + e2 * 0.3) * 60.0 + 9.0), r3b = vn1((lam - e2 * 0.3) * 60.0 + 9.0);
  float ramp = 0.4 + 0.6 * hk.z;
  relief = 0.0;
  rdl = ramp * ((r2a - r2b) / (2.0 * e2) * w2 + 0.5 * (r3a - r3b) / (0.6 * e2) * w3);
  vec3 alb = base * (1.0 + tone);
  // a slightly darker, redder parting at each set boundary
  float fb = fract(lam * 0.0 + (P.y + 0.06 * P.x - 0.04 * P.z) / 1.15);
  return alb;
}
vec3 shadeWall(vec3 P, vec3 N, vec3 rd, float t) {
  float fp = t * PX / FOC / max(abs(dot(N, rd)), 0.12);
  float relief, rdl;
  vec3 alb = stoneAlb(P, fp, relief, rdl);
  // bump from the laminae: tilt the normal along the bedding gradient
  vec3 gb = vec3(0.06, 1.0, -0.04);
  vec3 gt = gb - N * dot(N, gb);
  vec3 Nb = normalize(N - 0.004 * rdl * gt);
  float ao = sat(0.35 + 0.65 * map(P + N * 0.35) / 0.35);
  ao *= sat(0.5 + 0.5 * map(P + N * 1.0) / 1.0);
  float vis = upVis(P, N);
  vec3 E = slotLight(P, Nb, ao, vis);
  // light bounced up off the sunlit sand where the beam lands
  vec3 dS = FOOT - P;
  float ls = length(dS);
  E += SUNC * vec3(1.0, 0.70, 0.46) * 1.6 * sat(dot(Nb, dS / ls) + 0.2) / (1.0 + 0.8 * ls * ls);
  // direct sun
  E += SUNC * SUNI * aperture(P) * sat(dot(Nb, SUN));
  return alb * E;
}
vec3 shadeFloor(vec3 P, vec3 N, vec3 rd, float t) {
  // wind ripples: asymmetric crests across the slot, wandering
  float fp = t * PX / FOC / max(abs(dot(N, rd)), 0.08);
  vec2 xz = P.xz;
  float ph = dot(xz, vec2(0.95, 0.31)) * 11.0 + 1.3 * sin(xz.y * 0.9 + xz.x * 0.4) + 0.6 * vn2(xz * 1.7) * TAU;
  float wr = aaw(11.0 / TAU, fp);
  float sr = sin(ph), cr = cos(ph);
  vec2 grad = 11.0 * vec2(0.95, 0.31) * (cr + 0.35 * cos(2.0 * ph + 0.6) * 2.0) * wr;
  vec3 Nr = normalize(N + vec3(-grad.x, 0.0, -grad.y) * 0.012);
  vec3 alb = vec3(0.72, 0.46, 0.30) * (1.0 + 0.08 * (vn2(xz * 6.0) - 0.5) + 0.06 * sr * wr);
  float ao = sat(0.4 + 0.6 * map(P + N * 0.5) / 0.5);
  float vis = upVis(P, N);
  vec3 E = slotLight(P, Nr, ao, vis);
  vec3 dS = FOOT - P;
  float ls = length(dS);
  E += SUNC * vec3(1.0, 0.70, 0.46) * 0.6 / (1.0 + 1.2 * ls * ls);
  float ap = aperture(P);
  E += SUNC * SUNI * ap * sat(dot(Nr, SUN));
  return alb * E;
}
vec3 hazeC(float y) {
  return mix(vec3(0.30, 0.13, 0.18), vec3(1.3, 0.70, 0.36), smoothstep(1.0, H, y));
}

// ---------------------------------------------------------------- output
vec3 toDisp(vec3 c) {
  c *= EXPO * VIG;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  PX = 1.0 / u_res.y;
  Tw = mod(u_time, LOOP);
  float sp = TAU * Tw / 600.0;
  SUN = normalize(SUN0 + vec3(0.05 * sin(sp), 0.0, 0.03 * cos(sp)));
  APR = vec2(0.30, 0.12) * vec2(1.0, 1.0 + 0.3 * sin(sp + 0.9));
  FOOT = vec3(APC.x - SUN.x / SUN.y * H, 0.05, APC.y - SUN.z / SUN.y * H);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 vq = (gl_FragCoord.xy / u_res - 0.5) * vec2(1.0, 0.85);
  VIG = 1.0 - 0.32 * smoothstep(0.12, 0.62, dot(vq, vq) * 1.6);
  float dither = (h12(gl_FragCoord.xy + fract(Tw) * 17.0) + h12(gl_FragCoord.xy * 1.37 + 3.1) - 1.0) / 255.0;

  vec3 fw = vec3(sin(YAW) * cos(PITCH), sin(PITCH), cos(YAW) * cos(PITCH));
  vec3 rt = vec3(cos(YAW), 0.0, -sin(YAW));
  vec3 up = cross(fw, rt);
  CAM = CAM0 + (rt * u_par.x + up * u_par.y) * TCAM;
  vec3 rd = normalize(fw * FOC + rt * p.x + up * p.y);

#if DEBUG == 2
  {
    vec2 xz = vec2(p.x * 16.0, (p.y + 0.5) * 22.0 - 1.0);
    vec3 c = vec3(0.0);
    float a = map(vec3(xz.x, 1.25, xz.y)); c += vec3(0.6,0.3,0.1) * step(a, 0.0);
    float b = map(vec3(xz.x, 5.0, xz.y)); c += vec3(0.0,0.3,0.0) * step(b, 0.0);
    float e = map(vec3(xz.x, 9.0, xz.y)); c += vec3(0.0,0.0,0.4) * step(e, 0.0);
    vec3 ba = beamAxis(1.0); c += vec3(1.0) * step(length(xz - ba.xy), 0.15);
    c += vec3(1.0,1.0,0.0) * step(length(xz), 0.1);
    c += 0.3 * step(abs(fract(xz.y) - 0.5), 0.02) + 0.3 * step(abs(fract(xz.x) - 0.5), 0.02);
    float ang = atan(xz.x, xz.y);
    c += vec3(0.0, 0.5, 0.5) * step(abs(ang - YAW), 0.004 * 22.0 / max(length(xz),1.0)) ;
    c += vec3(0.0, 0.5, 0.5) * step(abs(ang - YAW - 0.75), 0.004 * 22.0 / max(length(xz),1.0)) ;
    c += vec3(0.0, 0.5, 0.5) * step(abs(ang - YAW + 0.75), 0.004 * 22.0 / max(length(xz),1.0)) ;
    fragColor = vec4(c, 1.0);
    return;
  }
#endif
  float rmin, tm;
  float t = march(CAM, rd, rmin, tm);
  vec3 col;
#if DEBUG == 3
  fragColor = vec4(vec3(NSTEP / 140.0), 1.0); if (NSTEP > 100.0) fragColor = vec4(1,0,0,1); else if (NSTEP > 60.0) fragColor.g = 1.0;
  return;
#endif
  if (t < 1e8) {
    vec3 P = CAM + rd * t;
    vec3 N = normalAt(P, 0.002 + 0.5 * t * PX / FOC);
#if DEBUG == 4
    { float rl, rdl; col = stoneAlb(P, 0.001, rl, rdl) * (0.5 + 0.5 * N.y); fragColor = vec4(col, 1.0); return; }
#endif
#if DEBUG == 5
    { float rl, rdl; col = stoneAlb(P, 0.001, rl, rdl) * (0.5 + 0.5 * N.y) * upVis(P, N) * map(P + N * 0.3) * map(P + N); fragColor = vec4(col, 1.0); return; }
#endif
#if DEBUG == 1
    col = (N * 0.5 + 0.5) * 0.6;
    col *= 1.0 - 0.5 * smoothstep(0.0, 25.0, t);
    fragColor = vec4(pow(col, vec3(0.8)), 1.0);
    return;
#endif
    map(P);
    float fl = smoothstep(-0.08, 0.08, WALLD - FLRD);
    col = fl > 0.5 ? shadeFloor(P, N, rd, t) : shadeWall(P, N, rd, t);
    col = mix(col, hazeC(P.y), 1.0 - exp(-t / 45.0));
  } else {
    col = vec3(5.0, 5.4, 6.0);
  }
  float tc, sd;
  float L = beamLine(CAM, rd, t, tc, sd);
  col += SUNC * SUNI * 0.05 * L * (0.75 + 0.5 * vn1(sd * 6.0 + 3.0));
  fragColor = vec4(toDisp(col) + dither, 1.0);
}
`,
}
