// Writes src/world-meta.json: the small, render-free part of every world
// (names, colours, sky, layer names and depths). The page imports this up
// front and loads each world's heavy art (SVG layers / GLSL) on demand.
//
// Runs before every build (npm "prebuild"); run `npm run worlds:meta` after
// changing a world's name, colours or layers. In dev the page warns when this
// file is out of date.
import { writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIELDS = ['id', 'name', 'tag', 'accent', 'accent2', 'ink', 'glow', 'light', 'clockColor', 'sky', 'clockAfter']

const pick = (w) => {
  const out = {}
  for (const k of FIELDS) if (w[k] !== undefined) out[k] = w[k]
  out.layers = w.layers.map(({ name, depth, sky, clock }) => ({
    name,
    depth,
    ...(sky ? { sky: true } : {}),
    ...(clock ? { clock: true } : {}),
  }))
  return out
}

const server = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
})
try {
  const meta = { svg: {}, gl: {} }
  const svgFiles = readdirSync(join(root, 'src/worlds')).filter((f) => f.endsWith('.jsx') && f !== 'kit.jsx')
  for (const f of svgFiles.sort()) {
    const m = await server.ssrLoadModule(`/src/worlds/${f}`)
    meta.svg[f.replace(/\.jsx$/, '')] = pick(m.default)
  }
  const glFiles = readdirSync(join(root, 'src/gl/worlds')).filter((f) => f.endsWith('.js'))
  for (const f of glFiles.sort()) {
    const m = await server.ssrLoadModule(`/src/gl/worlds/${f}`)
    meta.gl[f.replace(/\.js$/, '')] = pick(m.default)
  }
  writeFileSync(join(root, 'src/world-meta.json'), JSON.stringify(meta, null, 2) + '\n')
  console.log(`world-meta.json: ${Object.keys(meta.svg).length} SVG + ${Object.keys(meta.gl).length} GL worlds`)
} finally {
  await server.close()
}
