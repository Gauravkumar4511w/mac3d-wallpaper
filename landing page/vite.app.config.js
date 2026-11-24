// Build of the desktop wallpaper page (wallpaper.html) for the macOS app in
// ../mac app. Relative asset paths, because the app serves these files from
// its own bundle under a custom URL scheme (no web server, works offline).
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: false, // the app needs none of the site's public/ files (icons, downloads)
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  build: {
    outDir: process.env.APP_WEB_OUT || '../mac app/build/web',
    emptyOutDir: true,
    rollupOptions: { input: 'wallpaper.html' },
  },
})
