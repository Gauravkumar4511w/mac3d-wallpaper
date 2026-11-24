// Reference world for the shader contract (not shown on the page).
// Shows: aspect-correct coordinates, per-layer parallax, back-to-front
// compositing with premultiplied alpha, and the u_layer isolation switch.

export default {
  id: 'example',
  name: 'Example Hills',
  tag: 'Contract reference',
  accent: '#5aa2ff',
  accent2: '#ffd29a',
  ink: '#1f6fd6',
  glow: '#8cc0ff',
  light: true,
  clockColor: '#1b2a44',
  sky: 'linear-gradient(180deg,#9cc9f5,#f7e6d0)',
  // back -> front; index = u_layer value. depth drives the CSS-side labels.
  layers: [
    { name: 'Sky', depth: 0 },
    { name: 'Far hills', depth: 0.3 },
    { name: 'Near hills', depth: 0.9 },
  ],
  clockAfter: 1, // the desktop clock sits between layer 1 and layer 2
  frag: /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f)); }

// "over" compositing of premultiplied colours, back to front
vec4 over(vec4 back, vec4 front) { return front + back * (1.0 - front.a); }

void main() {
  // p: x in [-aspect/2, aspect/2], y in [0, 1] from bottom — height-relative, so
  // the scene keeps its framing on any aspect ratio ("cover" behaviour).
  vec2 p = (gl_FragCoord.xy - vec2(0.5 * u_res.x, 0.0)) / u_res.y;

  vec4 L[3];
  // 0: sky (opaque)
  vec3 sky = mix(vec3(0.97, 0.90, 0.82), vec3(0.55, 0.76, 0.96), smoothstep(0.2, 1.0, p.y));
  L[0] = vec4(sky, 1.0);
  // 1: far hills — parallax shift = depth * u_par * amount
  vec2 q = p + u_par * 0.3 * 0.03;
  float h1 = 0.42 + 0.08 * noise(q.x * 3.0 + 1.7) + 0.02 * sin(u_time * 0.2 + q.x * 4.0);
  float a1 = smoothstep(0.002, -0.002, q.y - h1);
  L[1] = vec4(vec3(0.62, 0.72, 0.86), 1.0) * a1;
  // 2: near hills
  vec2 r = p + u_par * 0.9 * 0.03;
  float h2 = 0.26 + 0.1 * noise(r.x * 2.0 + 9.0);
  float a2 = smoothstep(0.002, -0.002, r.y - h2);
  L[2] = vec4(vec3(0.25, 0.42, 0.34), 1.0) * a2;

  if (u_layer >= 0.0) {
    int k = int(u_layer + 0.5);
    fragColor = k == 0 ? L[0] : k == 1 ? L[1] : L[2];
    return;
  }
  vec4 c = L[0];
  c = over(c, L[1]);
  c = over(c, L[2]);
  fragColor = vec4(c.rgb, 1.0);
}
`,
}
