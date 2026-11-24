// mac3D Wallpaper — a menu bar app that puts the layered, living worlds from
// the landing page on your desktop, behind your icons, with cursor parallax
// and the Depth Clock.
import AppKit

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory) // menu bar only: no Dock icon
    withExtendedLifetime(delegate) { app.run() }
}
