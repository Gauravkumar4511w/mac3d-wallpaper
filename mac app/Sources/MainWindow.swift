import AppKit
import SwiftUI

/// The app's window: the first-launch setup, then Settings (wallpaper gallery,
/// motion, general, account). While it's open the app shows in the Dock and
/// ⌘-Tab like any other app; closed, it goes back to living in the menu bar.
@MainActor
final class MainWindow: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let model: AppModel

    init(model: AppModel) {
        self.model = model
    }

    var isVisible: Bool { window?.isVisible == true }
    var nsWindow: NSWindow? { window }

    func show(page: AppModel.Page? = nil) {
        if let page, !model.onboarding { model.page = page }
        let window = window ?? makeWindow()
        self.window = window
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        if !window.isVisible { window.center() }
        window.makeKeyAndOrderFront(nil)
    }

    private func makeWindow() -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 960, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.title = "mac3D Wallpaper"
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("mac3D Wallpaper main window")
        window.contentMinSize = NSSize(width: 820, height: 580)
        window.contentView = NSHostingView(rootView: RootView(model: model))
        window.delegate = self
        return window
    }

    func windowWillClose(_ notification: Notification) {
        // Back to a menu bar app: no Dock icon while the window is closed.
        DispatchQueue.main.async { NSApp.setActivationPolicy(.accessory) }
    }
}
