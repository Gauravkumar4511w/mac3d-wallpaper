// Blue Planet — Earth from orbit.
// A procedural Earth-like planet (continents, oceans with sun glint, ice,
// clouds with shadows, city lights) under an analytically scattered
// atmosphere, a cratered moon, a Milky Way band, a dense star field, an
// occasional satellite pass and a subtle lens flare from the sun off-frame.
//
// Everything is lit and composited in linear HDR, then ACES-tonemapped,
// sRGB-encoded and dithered. Layers (u_layer) are premultiplied and
// composited back to front with "over" in the same linear space.

export default {
  id: 'planet',
  name: 'Blue Planet',
  tag: 'Earth from orbit',
  accent: '#5fb4ff',
  accent2: '#ff9a4d',
  ink: '#1257a8',
  glow: '#9fd0ff',
  light: false,
  clockColor: '#f4f8ff',
  sky: 'radial-gradient(140% 70% at 30% 118%, #3d7fc4 0%, #1d4f8c 34%, #0b1f3d 46%, #04070f 58%, #020309 100%)',
  // back -> front; index = u_layer value
  layers: [
    { name: 'Star field', depth: 0 },
    { name: 'Milky Way', depth: 0.06 },
    { name: 'Moon', depth: 0.3 },
    { name: 'Planet', depth: 0.82 },
    { name: 'Clouds', depth: 0.84 },
    { name: 'Atmosphere', depth: 0.86 },
    { name: 'Satellite', depth: 1.1 },
    { name: 'Lens flare', depth: 1.3 },
  ],
  clockAfter: 2, // the clock floats in space: behind it the stars and moon, in front of it the planet
  frag: /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718

// ---------------------------------------------------------------- scene setup
const float FL = 1.6;                                   // focal length (screen-height units)
const vec3 PC = vec3(-0.33, -1.02, -1.45);              // planet centre (planet radius = 1)
const vec3 SUN = vec3(0.895, 0.17, -0.413);            // direction towards the sun
const vec3 AXIS_Y = vec3(-0.30, 0.9, -0.12);            // planet spin axis (normalised in main)
const float ROT_PERIOD = 1500.0;                        // seconds per planet turn
const float CLOUD_PERIOD = 1300.0;                      // clouds drift slightly faster
const float PAR = 0.03;                                 // parallax: screen heights per unit depth

// atmosphere (km). Scale heights are exaggerated ~x3 (and coefficients
// scaled down to match) so the limb reads at wallpaper scale.
const float RK = 6371.0;
const float HR = 25.0;
const float HM = 3.2;
const vec3 BR = vec3(5.8e-3, 13.5e-3, 33.1e-3) / 3.1;
const vec3 BMS = vec3(8.0e-3);
const vec3 BME = vec3(8.8e-3);
const float ATM_TOP = 0.03;                              // shell thickness (planet radii)
const vec3 SUN_E = vec3(0.95, 1.0, 1.1) * 21.0;       // slightly blue: daylight white balance       // solar irradiance (linear units)
const float EXPOSURE = 0.62;

vec3 gAX, gAY, gAZ;        // planet frame basis (camera space)
float gCa, gSa, gCc, gSc;  // surface / cloud rotation

// ---------------------------------------------------------------- hashes & noise
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = mat2(1.6, -1.2, 1.2, 1.6) * p + 7.31;
    a *= 0.5;
  }
  return s;
}

// 3D simplex noise with an integer hash (cheap on scalar GPUs) and an
// analytic gradient: returns (value, d/dx, d/dy, d/dz), value in ~[-1, 1]
uint ihash(ivec3 c) {
  uvec3 u = uvec3(c);
  uint h = u.x * 0x8da6b343u ^ u.y * 0xd8163841u ^ u.z * 0xcb1ab31fu;
  h ^= h >> 16;
  h *= 0x7feb352du;
  h ^= h >> 15;
  return h;
}
vec3 gvec(uint h) {
  return vec3(uvec3(h, h >> 10, h >> 20) & 1023u) * (2.0 / 1023.0) - 1.0;
}
vec4 snoised(vec3 v) {
  vec3 i = floor(v + dot(v, vec3(1.0 / 3.0)));
  vec3 x0 = v - i + dot(i, vec3(1.0 / 6.0));
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g, l.zxy);
  vec3 i2 = max(g, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 / 6.0;
  vec3 x2 = x0 - i2 + 1.0 / 3.0;
  vec3 x3 = x0 - 0.5;
  ivec3 ii = ivec3(i);
  vec3 g0 = gvec(ihash(ii));
  vec3 g1 = gvec(ihash(ii + ivec3(i1)));
  vec3 g2 = gvec(ihash(ii + ivec3(i2)));
  vec3 g3 = gvec(ihash(ii + 1));
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdx = vec4(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3));
  vec4 t = m2 * m * pdx;
  vec3 gr = -8.0 * (t.x * x0 + t.y * x1 + t.z * x2 + t.w * x3);
  gr += m4.x * g0 + m4.y * g1 + m4.z * g2 + m4.w * g3;
  return 105.0 * vec4(dot(m4, pdx), gr);
}
float snoise(vec3 v) {
  vec3 i = floor(v + dot(v, vec3(1.0 / 3.0)));
  vec3 x0 = v - i + dot(i, vec3(1.0 / 6.0));
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g, l.zxy);
  vec3 i2 = max(g, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 / 6.0;
  vec3 x2 = x0 - i2 + 1.0 / 3.0;
  vec3 x3 = x0 - 0.5;
  ivec3 ii = ivec3(i);
  vec4 pdx = vec4(dot(gvec(ihash(ii)), x0), dot(gvec(ihash(ii + ivec3(i1))), x1), dot(gvec(ihash(ii + ivec3(i2))), x2), dot(gvec(ihash(ii + 1)), x3));
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m *= m;
  return 105.0 * dot(m * m, pdx);
}


// fbm with a fractional octave count (smooth, resolution-aware fade-out)
float fbm3(vec3 p, float oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 12; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    s += w * a * snoise(p);
    p = p * 2.03 + vec3(1.71, 9.23, 3.17);
    a *= 0.5;
  }
  return s;
}

// ---------------------------------------------------------------- helpers
vec3 toPlanet(vec3 n) {
  vec3 l = vec3(dot(n, gAX), dot(n, gAY), dot(n, gAZ));
  return vec3(gCa * l.x - gSa * l.z, l.y, gSa * l.x + gCa * l.z);
}
vec3 toCloud(vec3 n) {
  vec3 l = vec3(dot(n, gAX), dot(n, gAY), dot(n, gAZ));
  return vec3(gCc * l.x - gSc * l.z, l.y, gSc * l.x + gCc * l.z);
}
vec3 viewRay(vec2 q) { return normalize(vec3(q.x, q.y - 0.5, -FL)); }

float chapman(float x, float mu) { // Schüler's approximation, mu >= 0
  float c = sqrt(1.5707963 * x);
  return c / ((c - 1.0) * mu + 1.0);
}
// transmittance towards the sun from altitude h (km), sun cosine mu
vec3 sunTrans(float h, float mu) {
  float r = RK + h;
  float tR, tM, vis = 1.0;
  if (mu >= 0.0) {
    tR = exp(-h / HR) * HR * chapman(r / HR, mu);
    tM = exp(-h / HM) * HM * chapman(r / HM, mu);
  } else {
    float ht = r * sqrt(1.0 - mu * mu) - RK;  // tangent altitude of the sun ray
    vis = smoothstep(-2.0, 2.0, ht);
    float hc = max(ht, 0.0);
    float rt = RK + hc;
    tR = 2.0 * exp(-hc / HR) * HR * sqrt(1.5707963 * rt / HR) - exp(-h / HR) * HR * chapman(r / HR, -mu);
    tM = 2.0 * exp(-hc / HM) * HM * sqrt(1.5707963 * rt / HM) - exp(-h / HM) * HM * chapman(r / HM, -mu);
  }
  return exp(-(BR * tR + BME * tM)) * vis;
}
float phaseR(float c) { return 0.0596831 * (1.0 + c * c); }
float phaseM(float c) {
  const float g = 0.78;
  float g2 = g * g;
  return 0.1193662 * (1.0 - g2) * (1.0 + c * c) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

// ---------------------------------------------------------------- planet surface
// returns linear radiance; n = camera-space normal, rd = view ray
vec3 surface(vec3 n, vec3 rd, float fp, float cshadow, float cover) {
  vec3 s = toPlanet(n);
  vec3 Lp = toPlanet(SUN);
  vec3 Vp = toPlanet(-rd);
  float muS = dot(n, SUN);
  float day = smoothstep(-0.12, 0.05, muS);

  // octave budget from pixel footprint
  float oct = clamp(log2(1.0 / (fp * 5.0)) / 1.2, 2.0, 10.0);  // lacunarity 2.3
  oct = mix(min(oct, 5.0), oct, day);
  oct = mix(oct, min(oct, 3.0), smoothstep(0.75, 0.97, cover));  // hidden under thick cloud

  // domain-warped continents
  vec4 wn = snoised(s * 1.3 + 3.1);
  vec3 sw = s + 0.022 * wn.yzw;   // warp along the gradient of one noise
  float base = snoise(sw * 1.05 + 5.0);
  const float SEA = 0.27;
  float h = 0.62 * base;
  float hd = 0.0;  // high-frequency part, drives albedo texture
  vec3 gsum = vec3(0.0);
  float clim = snoise(s * 2.1 + 11.0);  // climate field: moisture, mountain belts, population
  float ridge = smoothstep(0.0, 0.45, clim * 0.8 - 0.5 * wn.x) * smoothstep(-0.15, 0.25, base);
  {
    vec3 p = sw * 2.4;
    float a = 0.5, f = 2.4;
    for (int i = 0; i < 11; i++) {
      float wo = clamp(oct - float(i), 0.0, 1.0);
      if (wo <= 0.0) break;
      vec4 nd = i < 4 ? snoised(p) : vec4(snoise(p), 0.0, 0.0, 0.0);
      // ridged response in the mountain belts, plain fbm elsewhere
      float sa = sqrt(nd.x * nd.x + 0.006);
      float rv = (0.5 - sa) * 1.2;
      vec3 rg = -nd.x / sa * nd.yzw * 1.2;
      float m = ridge * step(1.5, float(i));
      float hv = wo * a * mix(nd.x, rv, m);
      h += hv;
      hd += hv * step(2.5, float(i)) * (1.0 + 0.3 * float(i));
      gsum += wo * a * f * mix(nd.yzw, rg, m) * pow(0.72, float(i));
      p = p * 2.3 + vec3(1.71, 9.23, 3.17);
      f *= 2.3;
      a *= 0.5;
      // open ocean: the remaining octaves cannot reach the shelf, stop early
      if (i >= 2 && h - SEA < -0.14 - 1.7 * a) break;
    }
  }
  float e = h - SEA;
  float lat = abs(s.y);
  float px = fp * 2.0;
  float land = smoothstep(-px, px, e);

  // climate
  float tex = clamp(hd * 5.0, -1.0, 1.0);
  float moist = 0.5 + 0.5 * clim + 0.2 * wn.x + 0.35 * tex;
  float dryBelt = exp(-pow((lat - 0.42) / 0.14, 2.0));
  float coast = smoothstep(0.25, 0.0, e);  // moist air near the sea
  float wet = clamp(moist - 0.55 * dryBelt + 0.35 * exp(-lat * lat / 0.02) + 0.25 * coast + 0.05, 0.0, 1.0);
  float temp = 1.0 - pow(lat, 1.6) * 1.15 - smoothstep(0.3, 0.95, e) * 0.85;

  vec3 desert = mix(vec3(0.47, 0.37, 0.23), vec3(0.4, 0.22, 0.1), smoothstep(0.3, 0.8, 0.5 - 0.4 * wn.x + 0.4 * tex));
  vec3 steppe = vec3(0.17, 0.155, 0.08);
  vec3 grass = vec3(0.075, 0.095, 0.04);
  vec3 forestT = vec3(0.02, 0.045, 0.016);
  vec3 forest = vec3(0.028, 0.05, 0.024);
  vec3 tundra = vec3(0.1, 0.095, 0.07);
  vec3 rock = vec3(0.12, 0.105, 0.09);
  vec3 alb = mix(desert, steppe, smoothstep(0.1, 0.3, wet));
  alb = mix(alb, grass, smoothstep(0.3, 0.5, wet));
  alb = mix(alb, mix(forest, forestT, smoothstep(0.35, 0.0, lat)), smoothstep(0.5, 0.72, wet));
  alb = mix(alb, tundra, smoothstep(0.35, 0.15, temp));
  alb = mix(alb, rock, smoothstep(0.3, 0.6, e) * 0.7);
  alb *= 0.72 + 0.5 * tex;
  float snow = smoothstep(0.06, -0.02, temp + 0.15 * tex);
  alb = mix(alb, vec3(0.72, 0.77, 0.82), snow);

  // ocean
  float shelf = smoothstep(-0.12, 0.0, e);
  vec3 ocean = mix(vec3(0.004, 0.014, 0.04), vec3(0.012, 0.06, 0.075), shelf * shelf);
  float seaIce = smoothstep(0.88, 0.95, lat + 0.04 * wn.x + 0.03 * tex);
  ocean = mix(ocean, vec3(0.6, 0.66, 0.72), seaIce);
  alb = mix(ocean, alb, land);

  // relief normal (planet frame)
  vec3 g = gsum - s * dot(gsum, s);
  vec3 nP = normalize(s - 0.08 * land * g);

  // lighting
  vec3 Ts = sunTrans(0.5, muS);
  float nl = max(dot(nP, Lp), 0.0);
  float soft = smoothstep(-0.03, 0.06, muS);       // soft terminator (sun disk + refraction)
  vec3 sky = vec3(0.05, 0.09, 0.16) * smoothstep(-0.1, 0.4, muS);
  vec3 col = alb * (SUN_E * Ts * nl * soft / PI + sky * 2.5) * cshadow;
  col += alb * sky * 1.5 * (1.0 - cshadow);

  // ocean glint (GGX)
  float wavy = clamp(hd * 8.0 + wn.x * 0.5, -1.0, 1.0);  // wind roughness
  float rough = clamp(0.24 + 0.07 * wavy, 0.1, 0.45);
  vec3 H = normalize(Lp + Vp);
  float nh = max(dot(s, H), 0.0), nv = max(dot(s, Vp), 1e-3), nlo = max(dot(s, Lp), 0.0);
  float a2 = pow(rough, 4.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(Vp, H), 0.0), 5.0);
  float k = rough * rough * 0.5;
  float G = nlo / (nlo * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  float spec = D * F * G / (4.0 * nv + 1e-3);
  col += (1.0 - land) * (1.0 - seaIce) * SUN_E * Ts * spec * soft * cshadow;

  // city lights on the night side
  float night = smoothstep(0.06, -0.12, muS);
  if (night > 0.0 && land > 0.0) {
    float pop = smoothstep(0.05, 0.6, 0.5 + 0.5 * wn.x - 0.3 * clim + 0.4 * tex);
    pop *= smoothstep(0.0, 0.15, temp) * (1.0 - snow) * smoothstep(0.05, 0.4, wet + 0.15);
    pop *= 0.45 + 0.55 * smoothstep(0.22, 0.0, e); // coasts and lowlands
    // clusters of point-like lights; sub-pixel detail fades to its mean
    float c1 = snoise(s * 46.0 + 7.0);
    float c2 = snoise(s * 150.0 + 1.0);
    float c3 = snoise(s * 480.0 - 5.0);
    float f2 = clamp(log2(1.0 / (fp * 150.0)), 0.0, 1.0);
    float f3 = clamp(log2(1.0 / (fp * 480.0)), 0.0, 1.0);
    float metro = smoothstep(0.35, 0.9, c1 + 0.3 * pop);
    float town = mix(0.12, smoothstep(0.35, 0.9, c2), f2);
    float speck = mix(0.15, smoothstep(0.45, 0.95, c3), f3);
    float core = smoothstep(0.7, 1.05, c1 + 0.3 * pop);
    float city = pop * (0.25 * core * (0.3 + town + speck) + metro * town * (0.25 + 2.4 * speck) * 0.5 + 0.3 * town * speck);
    vec3 lc = mix(vec3(1.0, 0.48, 0.15), vec3(1.0, 0.75, 0.48), metro * town);
    col += lc * city * 2.2 * night * land;
  }
  return col;
}

// ---------------------------------------------------------------- clouds
vec3 swirl(vec3 s, vec3 c, float k, float r) {
  float d = 1.0 - dot(s, c);
  float th = k * exp(-d / r);
  float cs = cos(th), sn = sin(th);
  return s * cs + cross(c, s) * sn + c * dot(c, s) * (1.0 - cs);
}
// x: opacity, y: raw thickness (for shading)
vec2 cloudField(vec3 s, float oct, inout vec4 wn, bool reuse) {
  const vec3 C1 = vec3(0.5795, 0.3372, 0.7419);  // hurricane centre (cloud frame)
  vec3 q = swirl(s, C1, 2.4, 0.003);
  float lat = s.y;
  vec3 p = q * vec3(2.0, 3.2, 2.0);
  if (!reuse) wn = snoised(p * 0.8 + 2.3);
  p += wn.yzw * 0.045;
  float big = fbm3(p, min(oct, 3.0));
  float al = abs(lat);
  float cov = 0.16 * exp(-lat * lat / 0.008) - 0.14 * exp(-pow((al - 0.4) / 0.12, 2.0)) + 0.08 * exp(-pow((al - 0.72) / 0.12, 2.0)) - 0.13;
  // hurricane: logarithmic spiral rain bands around a clear eye
  float rho = sqrt(max(2.0 * (1.0 - dot(s, C1)), 0.0));
  if (rho < 0.3) {
    vec3 t1 = normalize(cross(C1, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(C1, t1);
    float phi = atan(dot(s, t2), dot(s, t1));
    float arm = 0.5 + 0.5 * sin(2.0 * phi + 7.0 * log(rho + 0.004) + 3.0 * big);
    float fall = smoothstep(0.3, 0.06, rho);
    cov += fall * (0.32 * arm - 0.02) + 0.35 * smoothstep(0.07, 0.025, rho);
  }
  float n = big;
  // clear sky well below threshold: skip the fine octaves entirely
  if (big + cov < -0.34) return vec2(0.0, big + cov);
  // fine structure: crisp cumulus / stratocumulus texture
  vec3 pd = q * 17.0 + wn.yzw * 0.15;
  float det = 0.0;
  float cell = 0.6;
  {
    float a = 0.5;
    vec3 pp = pd;
    for (int i = 0; i < 7; i++) {
      float w = clamp(oct - 3.0 - float(i), 0.0, 1.0);
      if (w <= 0.0) break;
      float nv = snoise(pp);
      if (i == 1) cell = 1.0 - abs(nv);
      det += w * a * nv;
      pp = pp * 2.4 + vec3(4.1, 1.3, 7.7);
      a *= 0.55;   // rough spectrum: crisp, fractal cloud edges
    }
  }
  n += 0.5 * det + 0.12 * (cell - 0.6) * clamp(oct - 4.0, 0.0, 1.0);
  float x = n + cov;
  float d = smoothstep(0.0, 0.1, x);
  d *= d * (3.0 - 2.0 * d);
  d *= smoothstep(0.006, 0.014, rho);  // the eye
  return vec2(d, x);
}

// ---------------------------------------------------------------- moon
float craters(vec3 p, out float ray) {
  vec3 i = floor(p), f = fract(p);
  float h = 0.0;
  ray = 0.0;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 r = hash33(i + o);
        vec3 c = o + 0.15 + 0.7 * r - f;
        float rad = 0.18 + 0.3 * r.z * r.z;
        float d = length(c) / rad;
        if (d < 2.2) {
          float bowl = (d * d - 1.0) * smoothstep(1.0, 0.75, d);
          float rim = exp(-pow((d - 1.0) * 4.0, 2.0)) * 0.35;
          float ej = exp(-(d - 1.0) * 2.5) * step(1.0, d) * 0.08;
          h += (bowl + rim + ej) * rad;
          ray += step(0.93, r.x) * smoothstep(2.2, 1.0, d);
        }
      }
  return h;
}
float moonHeight(vec3 s, float detail, out float ray) {
  float r1, r2;
  float h = craters(s * 4.0, r1) * 0.5 + craters(s * 11.0 + 3.7, r2) * 0.18 * detail;
  h += 0.03 * snoise(s * 30.0) * detail;
  ray = r1;
  return h;
}

// ---------------------------------------------------------------- stars & sky
vec3 starTint(float r) {
  vec3 c = mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.88, 0.74), smoothstep(0.0, 0.18, r));
  c = mix(c, vec3(1.0, 0.97, 0.94), smoothstep(0.18, 0.5, r));
  c = mix(c, vec3(0.74, 0.83, 1.0), smoothstep(0.62, 0.95, r));
  return c;
}

vec3 starGrid(vec2 q, float cell, float prob, float fmin, float seed, float px, float tw) {
  vec2 g = q / cell + seed;
  vec2 id = floor(g);
  vec4 h = hash42(id);
  if (h.x > prob) return vec3(0.0);
  vec2 pos = 0.2 + 0.6 * h.yz;
  vec2 d = (fract(g) - pos) * cell;
  float sig = 0.72 * px;
  float F = fmin * min(pow(max(h.w, 1e-3), -0.85), 40.0);
  float r2 = dot(d, d);
  float I = F * exp(-r2 / (2.0 * sig * sig)) * px * px / (sig * sig) * (0.000625 / px);
  // twinkle: integer rates in 0.01 rad/s keep the motion seamless over the wrap
  float k = floor(fract(h.x * 91.7) * 150.0 + 50.0) * 0.01;
  I *= 1.0 + 0.16 * sin(tw * k + h.y * TAU) * smoothstep(0.3, 0.9, fract(h.w * 37.0));
  return starTint(fract(h.y * 13.1 + h.z * 7.3)) * I;
}

float mwFrame(vec2 q, out vec2 uv) {
  vec2 A = vec2(-0.05, 1.12);
  vec2 dir = normalize(vec2(-1.0, -0.66));
  vec2 r = q - A;
  uv = vec2(dot(r, dir), dot(r, vec2(-dir.y, dir.x)));
  return exp(-uv.y * uv.y / (2.0 * 0.15 * 0.15));
}

vec3 milkyWay(vec2 q) {
  vec2 uv;
  mwFrame(q, uv);
  vec3 floorc = vec3(0.0012, 0.0016, 0.0028);  // airglow / zodiacal floor: space is never flat black
  vec3 cool0 = vec3(0.78, 0.86, 1.0);
  if (abs(uv.y) > 0.5) return floorc + cool0 * exp(-uv.y * uv.y / (2.0 * 0.36 * 0.36)) * 0.004;
  float wv = fbm2(uv * vec2(2.0, 3.0) + 3.0, 3);
  float v = uv.y + 0.08 * (wv - 0.5);
  float width = 0.12 + 0.04 * sin(uv.x * 2.3 + 1.0);
  float core = exp(-v * v / (2.0 * width * width));
  float halo = exp(-v * v / (2.0 * 0.36 * 0.36));
  // star clouds: grainy, high-contrast clumps rather than smooth smoke
  float clump = fbm2(uv * vec2(6.0, 9.0) + 11.0, 4);
  float grain = fbm2(uv * vec2(55.0, 62.0) - 4.0, 3);
  float clouds = smoothstep(0.3, 0.75, clump);
  // dust lanes: thin, filamentary (ridged) dark structure hugging the centre line
  float dust = fbm2(uv * vec2(3.5, 12.0) + vec2(2.0, 9.0), 5);
  float ridge = 1.0 - abs(dust - 0.5) * 2.0;
  float lane = smoothstep(0.55, 0.92, ridge) * exp(-pow((v - 0.02) / (width * 0.55), 2.0));
  float bulge = exp(-pow((uv.x - 0.78) / 0.32, 2.0));
  float b = core * (0.25 + 1.6 * clouds * clouds) * (0.55 + 0.9 * grain * grain) * (1.0 + 1.4 * bulge);
  b *= 1.0 - 0.9 * lane;
  vec3 warm = vec3(1.0, 0.88, 0.72);
  vec3 cool = vec3(0.78, 0.86, 1.0);
  vec3 col = mix(cool, warm, clamp(bulge * 0.8 + core * 0.2, 0.0, 1.0)) * b * 0.05;
  col += cool * halo * 0.004 * (1.0 - 0.5 * lane);
  // faint emission nebulae along the band
  float neb = smoothstep(0.62, 0.85, fbm2(uv * vec2(6.0, 7.0) + 31.0, 4)) * core;
  col += vec3(0.9, 0.32, 0.42) * neb * 0.02 * (1.0 - lane);
  return col + floorc;
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

// ---------------------------------------------------------------- main
void main() {
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;
  float px = 1.0 / u_res.y;
  float asp = u_res.x / u_res.y;
  int lay = u_layer < 0.0 ? -1 : int(u_layer + 0.5);
  bool full = lay < 0;

  gAY = normalize(AXIS_Y);
  gAX = normalize(cross(gAY, vec3(0.0, 0.0, 1.0)));
  gAZ = cross(gAX, gAY);
  float ang = mod(u_time, ROT_PERIOD) * (TAU / ROT_PERIOD) + 2.4;
  float angc = mod(u_time, CLOUD_PERIOD) * (TAU / CLOUD_PERIOD) + 1.3;
  gCa = cos(ang); gSa = sin(ang);
  gCc = cos(angc); gSc = sin(angc);
  float tw = mod(u_time, 628.3185307);

  // planet silhouette (planet-layer parallax): in the full scene nothing
  // behind a fully covered pixel needs to be evaluated
  vec3 cdir = normalize(PC);
  float pixAng = px / FL;
  float alpha = asin(1.0 / length(PC));
  bool hidden = full && (acos(clamp(dot(viewRay(p + u_par * 0.82 * PAR), cdir), -1.0, 1.0)) - alpha) / pixAng < -1.0;

  vec3 col = vec3(0.0);   // linear composite (full scene)
  vec3 lc = vec3(0.0);    // isolated layer colour (premultiplied)
  float la = 0.0;         // isolated layer alpha

  // ---- 0: star field
  if ((full && !hidden) || lay == 0) {
    vec2 q = p + u_par * 0.0 * PAR;
    vec2 uvm;
    float band = mwFrame(q, uvm);
    float dens = 0.3 + 0.6 * smoothstep(0.25, 0.8, fbm2(q * 3.0 + 5.0, 3)) + 1.8 * band;
    vec3 st = vec3(0.0);
    st += starGrid(q, 0.0062, 0.3 * dens, 0.008, 0.0, px, tw);
    st += starGrid(q, 0.0105, 0.22 * dens, 0.018, 17.0, px, tw);
    st += starGrid(q, 0.024, 0.32, 0.04, 41.0, px, tw);
    // rare bright stars with a soft halo (3x3 search)
    {
      float cell = 0.12;
      vec2 g = q / cell + 3.7;
      vec2 id = floor(g);
      for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec2 cid = id + vec2(float(i), float(j));
          vec4 h = hash42(cid + 0.5);
          if (h.x > 0.55) continue;
          vec2 d = (g - cid - (0.15 + 0.7 * h.yz)) * cell;
          float F = 0.25 * min(pow(max(h.w, 1e-3), -0.9), 25.0);
          float sig = 0.8 * px;
          float r2 = dot(d, d);
          float I = F * exp(-r2 / (2.0 * sig * sig)) * px * px / (sig * sig);
          I += F * 0.0009 * exp(-sqrt(r2) / (0.0016 + 0.0006 * F)) / (0.0016 * 0.0016) * 1e-4;
          float k = floor(fract(h.x * 57.3) * 120.0 + 40.0) * 0.01;
          I *= 1.0 + 0.12 * sin(tw * k + h.y * TAU);
          st += starTint(fract(h.y * 11.7 + h.z * 3.1)) * I;
        }
    }
    if (full) col = st; else { lc = st; la = 0.0; }
  }

  // ---- 1: Milky Way
  if ((full && !hidden) || lay == 1) {
    vec2 q = p + u_par * 0.06 * PAR;
    vec3 mw = milkyWay(q);
    if (full) col += mw; else { lc = mw; la = 0.0; }
  }

  // ---- 2: moon
  if ((full && !hidden) || lay == 2) {
    vec2 q = p + u_par * 0.3 * PAR;
    vec2 M = vec2(-0.56, 0.6);
    const float RM = 0.028;
    vec2 dq = (q - M) / RM;
    float r = length(dq);
    float cov = clamp((1.0 - r) * RM / px + 0.5, 0.0, 1.0);
    if (cov > 0.0) {
      vec3 md = viewRay(M);
      vec3 f = -md;
      vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), f));
      vec3 up = cross(f, rt);
      vec2 dc = dq / max(r, 1.0);
      float z = sqrt(max(1.0 - dot(dc, dc), 0.0));
      vec3 n = dc.x * rt + dc.y * up + z * f;
      // fixed lunar frame (slight tilt)
      vec3 s = vec3(n.x * 0.94 + n.z * 0.34, n.y, -n.x * 0.34 + n.z * 0.94);
      float detail = clamp(RM / px / 60.0, 0.0, 1.0);
      float ray;
      float h0 = moonHeight(s, detail, ray);
      // finite-difference normal in the tangent plane
      vec3 t1 = normalize(cross(n, up)), t2 = cross(n, t1);
      float e = 0.006;
      float rdum;
      // rotate the tangent vectors into the lunar frame
      vec3 t1s = vec3(t1.x * 0.94 + t1.z * 0.34, t1.y, -t1.x * 0.34 + t1.z * 0.94);
      vec3 t2s = vec3(t2.x * 0.94 + t2.z * 0.34, t2.y, -t2.x * 0.34 + t2.z * 0.94);
      float hx = moonHeight(normalize(s + t1s * e), detail, rdum);
      float hy = moonHeight(normalize(s + t2s * e), detail, rdum);
      vec3 nb = normalize(n - (t1 * (hx - h0) + t2 * (hy - h0)) / e * 0.09);
      float maria = smoothstep(0.05, 0.35, fbm3(s * 2.2 + 4.0, 4.0));
      vec3 alb = mix(vec3(0.17, 0.165, 0.155), vec3(0.075, 0.074, 0.072), maria);
      alb *= 0.9 + 0.2 * snoise(s * 18.0) * detail;
      alb += vec3(0.08) * ray * (1.0 - maria * 0.5);
      float mu0 = max(dot(nb, SUN), 0.0);
      float mu = max(dot(nb, f), 0.05);
      float ls = 2.0 * mu0 / (mu0 + mu);               // Lommel-Seeliger
      float term = smoothstep(-0.02, 0.04, dot(n, SUN));
      vec3 mc = alb * SUN_E * mix(mu0, ls * 0.5, 0.6) * term / PI;
      mc += alb * vec3(0.004, 0.006, 0.01) * (1.0 - term); // earthshine
      vec3 C = mc * cov;
      if (full) col = C + col * (1.0 - cov); else { lc = C; la = cov; }
    }
  }

  // ---- planet group (3: surface, 4: clouds, 5: atmosphere)
  vec3 cloudCol = vec3(0.0);
  if (full || (lay >= 3 && lay <= 5)) {
    vec3 rdP = viewRay(p + u_par * 0.82 * PAR);
    vec3 rdC = viewRay(p + u_par * 0.84 * PAR);
    vec3 rdA = viewRay(p + u_par * 0.86 * PAR);
    float dC = length(PC);

    // --- surface
    float tc = dot(rdP, PC);
    vec3 v = rdP * tc - PC;
    float b = length(v);
    float edge = (acos(clamp(dot(rdP, cdir), -1.0, 1.0)) - alpha) / pixAng;
    float covP = clamp(0.5 - edge, 0.0, 1.0);
    vec3 nP = b < 1.0 ? normalize(rdP * (tc - sqrt(1.0 - b * b)) - PC) : v / b;
    float muV = max(dot(nP, -rdP), 0.0);
    float tHit = tc;
    float fp = tHit * pixAng / sqrt(max(muV, 0.02));

    // cloud sample shared by cloud shading and ground shadows
    float covC = 0.0, dens = 0.0, densS = 0.0, thick = 0.0, thickS = 0.0;
    vec3 nC = nP;
    float muSc = dot(nP, SUN);
    const float CH = 0.0035;
    if (covP > 0.0 || lay == 4) {
      float tcC = dot(rdC, PC);
      vec3 vC = rdC * tcC - PC;
      float bC = length(vC);
      float edgeC = (acos(clamp(dot(rdC, cdir), -1.0, 1.0)) - asin((1.0 + CH * 0.3) / dC)) / pixAng;
      covC = clamp(0.5 - edgeC, 0.0, 1.0);
      if (covC > 0.0) {
        nC = bC < 1.0 ? normalize(rdC * (tcC - sqrt(1.0 - bC * bC)) - PC) : vC / bC;
        muSc = dot(nC, SUN);
        float muVc = max(dot(nC, -rdC), 0.0);
        float fpc = tcC * pixAng / sqrt(max(muVc, 0.02));
        float coct = clamp(log2(1.0 / (fpc * 6.5)), 2.0, 9.0);
        coct = 3.0 + max(coct - 3.0, 0.0) / 1.26;  // detail lacunarity 2.4
        float dayc = smoothstep(-0.15, 0.05, muSc);
        coct = mix(min(coct, 4.0), coct, dayc);
        vec3 sc = toCloud(nC);
        vec4 wn;
        vec2 cf = cloudField(sc, coct, wn, false);
        dens = cf.x;
        thick = cf.y;
        // offset towards the sun for self-shading and ground shadows
        vec3 Lt = SUN - nC * muSc;
        float lt = length(Lt);
        float off = clamp(CH * lt / max(muSc, 0.08), 0.0, 0.03);
        vec3 so = toCloud(normalize(nC + Lt / max(lt, 1e-4) * off));
        vec2 cs = cloudField(so, min(coct, 2.0), wn, true);
        densS = cs.x;
        thickS = cs.y;
      }
    }

    if (full || lay == 3) {
      vec3 C = vec3(0.0);
      if (covP > 0.0) {
        float csh = 1.0 - 0.82 * densS * smoothstep(-0.05, 0.1, muSc);
        C = surface(nP, rdP, fp, csh, dens * covC) * covP;
      }
      if (full) col = C + col * (1.0 - covP); else { lc = C; la = covP; }
    }

    if (full || lay == 4) {
      vec3 C = vec3(0.0);
      float a = 0.0;
      if (covC > 0.0 && dens > 0.0) {
        vec3 Ts = sunTrans(15.0, muSc);
        float nl = smoothstep(-0.06, 0.25, muSc) * (0.35 + 0.65 * max(muSc, 0.0));
        float relief = clamp(1.0 - 3.0 * (thickS - thick), 0.3, 1.25);
        float bright = 0.5 + 0.5 * smoothstep(0.0, 0.45, thick);
        vec3 lit = SUN_E * Ts * nl * relief * bright * 0.95 / PI;
        lit += vec3(0.05, 0.08, 0.14) * smoothstep(-0.1, 0.3, muSc) * 1.4;
        lit += vec3(0.0015, 0.002, 0.003);            // faint night-side cloud glow
        a = dens * covC * 0.96 * smoothstep(0.0, 0.12, max(dot(nC, -rdC), 0.0));
        C = lit * a;
      }
      if (full) col = C + col * (1.0 - a); else { lc = C; la = a; }
    }

    if (full || lay == 5) {
      float tcA = dot(rdA, PC);
      vec3 vA = rdA * tcA - PC;
      float bA = length(vA);
      vec3 S = vec3(0.0);
      float a = 0.0;
      if (bA < 1.0 + ATM_TOP) {
        float edgeA = (acos(clamp(dot(rdA, cdir), -1.0, 1.0)) - alpha) / pixAng;
        float covA = clamp(0.5 - edgeA, 0.0, 1.0);
        float cth = dot(rdA, SUN);
        float pR = phaseR(cth), pM = phaseM(cth);
        vec3 Sd = vec3(0.0), Td = vec3(1.0), Sl = vec3(0.0), Tl = vec3(1.0);
        if (covA > 0.0) {
          // ray hits the planet: optical depth from the top of the atmosphere
          vec3 n = bA < 1.0 ? normalize(rdA * (tcA - sqrt(1.0 - bA * bA)) - PC) : vA / bA;
          float muv = max(dot(n, -rdA), 0.0);
          float muS = dot(n, SUN);
          float colR = HR * chapman(RK / HR, muv);
          float colM = HM * chapman(RK / HM, muv);
          vec3 tau = BR * colR + BME * colM;
          Td = exp(-tau);
          vec3 Tlo = sunTrans(HR * 0.35, muS);
          vec3 Thi = sunTrans(HR * 2.2, muS);
          vec3 src = BR * colR * pR * (0.72 * Tlo + 0.28 * Thi) + BMS * colM * pM * sunTrans(HM, muS);
          Sd = 0.6 * SUN_E * src * (1.0 - Td) / max(tau, vec3(1e-4));
        }
        if (covA < 1.0) {
          // limb: Gauss-Hermite quadrature around the closest approach
          float r0 = max(bA, 1.0) * RK;
          float h0 = r0 - RK;
          float sg = sqrt(2.0 * r0 * HR);
          vec3 v0 = vA / bA * max(bA, 1.0);
          vec3 accR = vec3(0.0);
          float colR = 0.0;
          for (int i = 0; i < 5; i++) {
            float xi = i == 0 ? 0.0 : i == 1 ? 0.958572 : i == 2 ? -0.958572 : i == 3 ? 2.020183 : -2.020183;
            float wi = i == 0 ? 0.945309 : i < 3 ? 0.986581 : 1.181488;
            float sk = xi * sg;
            vec3 P = v0 + rdA * (sk / RK);
            float rr = length(P);
            float h = (rr - 1.0) * RK;
            float rho = exp(-h / HR) * wi * sg;
            accR += rho * sunTrans(h, dot(P / rr, SUN));
            colR += rho;
          }
          float colM = exp(-h0 / HM) * sqrt(TAU * r0 * HM);
          vec3 TsM = sunTrans(h0, dot(v0 / length(v0), SUN));
          vec3 tau = BR * colR + BME * colM;
          Tl = exp(-tau);
          vec3 src = BR * pR * accR + BMS * pM * colM * TsM;
          Sl = SUN_E * src * (1.0 - Tl) / max(tau, vec3(1e-4));
        }
        S = mix(Sl, Sd, covA);
        vec3 T = mix(Tl, Td, covA);
        a = clamp(1.0 - dot(T, vec3(0.25, 0.45, 0.3)), 0.0, 1.0);
      }
      if (full) col = S + col * (1.0 - a); else { lc = S; la = a; }
    }
  }

  // ---- 6: satellite (passes every 95 s, crossing in ~30 s)
  if (full || lay == 6) {
    vec2 q = p + u_par * 1.1 * PAR;
    float ph = mod(u_time + 4.0, 95.0) / 30.0;
    vec3 C = vec3(0.0);
    float a = 0.0;
    if (ph < 1.0) {
      float span = asp + 0.2;
      vec2 c = vec2(-0.5 * span + span * ph, 0.5 + 0.08 * ph);
      vec2 dir = normalize(vec2(1.0, 0.09));
      vec2 d = q - c;
      d = vec2(dot(d, dir), dot(d, vec2(-dir.y, dir.x)));
      const float S = 0.0045;
      vec2 e = d / S;
      float aa = px / S;
      // body + truss + two pairs of solar wings
      float body = (1.0 - smoothstep(0.18 - aa, 0.18 + aa, abs(e.x))) * (1.0 - smoothstep(0.1 - aa, 0.1 + aa, abs(e.y)));
      float truss = (1.0 - smoothstep(0.03 - aa, 0.03 + aa, abs(e.y))) * (1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(e.x)));
      vec2 w = vec2(abs(abs(e.x) - 0.62), abs(abs(e.y) - 0.0));
      float wing = (1.0 - smoothstep(0.32 - aa, 0.32 + aa, w.x)) * (1.0 - smoothstep(0.42 - aa, 0.42 + aa, abs(e.y))) * step(0.04, abs(e.y));
      float glint = 0.6 + 0.4 * sin(ph * 26.0);  // panels catching the sun
      vec3 cw = vec3(0.10, 0.13, 0.24) * glint * 5.0 + vec3(0.6, 0.5, 0.35) * pow(glint, 8.0) * 4.0;
      vec3 cb = vec3(0.9, 0.82, 0.62) * 2.6;
      a = clamp(max(max(body, truss), wing), 0.0, 1.0);
      C = (cb * max(body, truss) + cw * wing * (1.0 - body)) ;
      // keep it visible when sub-pixel: soft core
      float core = exp(-dot(d, d) / (2.0 * pow(max(1.2 * px, 0.25 * S), 2.0)));
      C += vec3(0.8, 0.75, 0.6) * core * 0.35;
      a = max(a, core * 0.3);
      float fade = smoothstep(0.0, 0.04, ph) * smoothstep(1.0, 0.96, ph);
      C *= fade;
      a *= fade;
    }
    if (full) col = C + col * (1.0 - a); else { lc = C; la = a; }
  }

  // ---- 7: lens flare and veiling glare from the sun just off the right edge
  if (full || lay == 7) {
    vec2 q = p + u_par * 1.3 * PAR;
    vec2 S = vec2(0.5 * asp + 0.16, 0.58);
    vec2 d = q - S;
    float r = length(d);
    vec3 sunc = vec3(1.0, 0.95, 0.88);
    vec3 F = sunc * (0.09 * exp(-r * 5.0) + 0.0012 / (r * r + 0.006));
    // ghosts on the line through the lens centre
    vec2 cen = vec2(0.0, 0.5);
    vec2 ax = cen - S;
    for (int i = 0; i < 4; i++) {
      float fi = i == 0 ? 0.42 : i == 1 ? 0.78 : i == 2 ? 1.22 : 1.62;
      float ri = i == 0 ? 0.05 : i == 1 ? 0.028 : i == 2 ? 0.085 : 0.045;
      vec3 ti = i == 0 ? vec3(0.35, 1.0, 0.7) : i == 1 ? vec3(1.0, 0.6, 0.3) : i == 2 ? vec3(0.55, 0.6, 1.0) : vec3(1.0, 0.5, 0.75);
      vec2 g = S + ax * fi;
      float dg = length(q - g) / ri;
      float disc = smoothstep(1.0, 0.8, dg) * (0.45 + 0.55 * smoothstep(0.3, 1.0, dg));
      F += ti * disc * 0.011;
    }
    if (full) col += F; else { lc = F; la = 0.0; }
  }

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
