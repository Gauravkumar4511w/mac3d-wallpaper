// The landing page shows each world as a pre-rendered video (scripts/render-media.mjs)
// instead of rendering it live: video decoding is done by the Mac's media
// hardware, so a page full of worlds stays smooth on any Mac. The app itself
// still renders every world live.
import { useEffect, useRef } from 'react'
import { LockClock, useNow, hm, usePauseOffscreen, useNear } from './SceneView.jsx'

const media = (id, file) => `${import.meta.env.BASE_URL}media/${id}/${file}`
export const layerImage = (id, i) => media(id, `layer-${i}.webp`)

/**
 * A world as a looping video. Its poster and video are only fetched once it
 * comes near the screen; it plays only while it's among the few most visible
 * scenes on the page (the shared animation budget in SceneView.jsx) and holds
 * its frame otherwise; with Reduce Motion it shows the poster.
 * `variant`: 'card' (960×600) or 'hd' (1920×1200).
 */
// Narrow screens get the card video even where 'hd' is asked for: at phone size
// it looks the same, and it's about a quarter of the download.
const SMALL_SCREEN = matchMedia('(max-width: 700px)').matches

export function WorldVideo({ scene, variant: asked = 'card', className = '', children }) {
  const variant = asked === 'hd' && SMALL_SCREEN ? 'card' : asked
  const ref = useRef(null)
  usePauseOffscreen(ref)
  const near = useNear(ref)
  useEffect(() => {
    const wrap = ref.current
    const video = wrap?.querySelector('video')
    if (!video || !near) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if ('paused' in wrap.dataset || reduce.matches) video.pause()
      else video.play().catch(() => {})
    }
    const watch = new MutationObserver(sync)
    watch.observe(wrap, { attributes: true, attributeFilter: ['data-paused'] })
    reduce.addEventListener('change', sync)
    sync()
    return () => {
      watch.disconnect()
      reduce.removeEventListener('change', sync)
    }
  }, [scene.id, variant, near])
  return (
    <div ref={ref} className={`scene world-video ${className}`} style={{ background: scene.sky }}>
      <video
        key={`${scene.id}-${variant}`}
        src={near ? media(scene.id, `${variant}.mp4`) : undefined}
        poster={near ? media(scene.id, `${variant}.jpg`) : undefined}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

function MenuBar({ light }) {
  const now = useNow()
  const day = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className={`menubar ${light ? 'on-light' : ''}`}>
      <span className="mb-left">
        <b>mac3D Wallpaper</b>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Window</span>
      </span>
      <span className="mb-right">
        <span className="mb-icon layers" />
        <span className="mb-icon wifi" />
        <span className="mb-icon batt" />
        <span>
          {day} {hm(now)}
        </span>
      </span>
    </div>
  )
}

const DOCK = [
  'linear-gradient(160deg,#6ec3ff,#2a6df4)',
  'linear-gradient(160deg,#ffffff,#d9dde6)',
  'linear-gradient(160deg,#7ef29a,#1fb35a)',
  'linear-gradient(160deg,#ffd36e,#ff8a3d)',
  'linear-gradient(160deg,#ff8db0,#e5395f)',
  'linear-gradient(160deg,#c3a6ff,#7546f0)',
  'linear-gradient(160deg,#4b4b55,#1d1d24)',
]

function Dock({ accent }) {
  return (
    <div className="dock">
      {DOCK.map((bg) => (
        <span key={bg} className="dock-app" style={{ background: bg }} />
      ))}
      <span className="dock-sep" />
      <span className="dock-app brand-app" style={{ '--a': accent }}>
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 6 26 11 16 16 6 11Z" fill="#fff" />
          <path d="M6 16 16 21 26 16M6 21 16 26 26 21" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  )
}

/**
 * A Mac desktop: the world's HD video, the live Depth Clock floating at its
 * depth (so the page's cursor tilt still moves it against the scene), plus an
 * optional menu bar and dock.
 */
export function MacScreen({ scene, chrome = true, clock = true, variant = 'hd' }) {
  const clk = scene.layers.find((l) => l.clock)
  return (
    <div className="mac-screen">
      <WorldVideo key={scene.id} scene={scene} variant={variant} className="fade-in">
        {clock && clk && (
          <div className="layer" style={{ '--d': clk.depth }}>
            <LockClock color={scene.clockColor} />
          </div>
        )}
      </WorldVideo>
      {chrome && <MenuBar light={scene.light} />}
      {chrome && <Dock accent={scene.accent} />}
    </div>
  )
}
