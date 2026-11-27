import AppKit
import SwiftUI

/// `--render-ui <dir> [--dark]`: renders the window's pages and the first-launch
/// steps to PNGs in <dir>, then quits. Nothing is shown on screen and no
/// settings are changed, so it's safe to run next to the real app.
@MainActor
enum UITest {
    static func runIfRequested(model: AppModel) -> Bool {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--render-ui"), i + 1 < args.count else { return false }
        let dir = URL(fileURLWithPath: args[i + 1], isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSApp.appearance = NSAppearance(named: args.contains("--dark") ? .darkAqua : .aqua)

        var shots: [(String, AnyView)] = []
        for page in AppModel.Page.allCases {
            shots.append(("settings-\(page.rawValue)", AnyView(SettingsView(model: model).onAppear { model.page = page })))
        }
        for step in 0..<3 {
            shots.append(("setup-\(step + 1)", AnyView(OnboardingView(model: model, account: model.account).onAppear { model.setupStep = step })))
        }
        render(shots, into: dir, index: 0)
        return true
    }

    private static func render(_ shots: [(String, AnyView)], into dir: URL, index: Int) {
        guard index < shots.count else {
            print("[render-ui] done → \(dir.path)")
            NSApp.terminate(nil)
            return
        }
        let (name, view) = shots[index]
        let size = NSSize(width: 960, height: 680)
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                              styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        let host = NSHostingView(rootView: view.tint(brand).frame(width: size.width, height: size.height))
        window.contentView = host
        window.setFrameOrigin(NSPoint(x: -10000, y: -10000)) // off screen
        window.orderBack(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            MainActor.assumeIsolated {
                host.layoutSubtreeIfNeeded()
                if let frame = window.contentView?.superview, let rep = frame.bitmapImageRepForCachingDisplay(in: frame.bounds) {
                    frame.cacheDisplay(in: frame.bounds, to: rep)
                    let file = dir.appendingPathComponent("\(name).png")
                    try? rep.representation(using: .png, properties: [:])?.write(to: file)
                    print("[render-ui] \(name).png")
                }
                window.orderOut(nil)
                render(shots, into: dir, index: index + 1)
            }
        }
    }
}
