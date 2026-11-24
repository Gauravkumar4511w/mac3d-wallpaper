// Shared basics for layered 2.5D worlds on a 16:10 Mac display.
// Coordinates: every <Svg> uses viewBox 0 0 W H (1440 x 900), anchored to the
// bottom (xMidYMax slice). Everything is seeded, so a world draws the same way
// on every render.

export const W = 1440
export const H = 900
export const PAD = 220

export function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export const f = (n) => n.toFixed(1)

export const Svg = ({ children, className = '' }) => (
  <svg
    className={`layer-svg ${className}`}
    viewBox={`0 0 ${W} ${H}`}
    preserveAspectRatio="xMidYMax slice"
    aria-hidden="true"
  >
    {children}
  </svg>
)
