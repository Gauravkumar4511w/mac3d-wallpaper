import AppKit
import WebKit

/// One display's wallpaper: a borderless window at desktop level (above the
/// system wallpaper, below desktop icons and every app) hosting the bundled
/// wallpaper page in a WKWebView. It never takes clicks or focus.
@MainActor
final class DesktopWallpaper: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let screen: NSScreen
    private let frame: NSRect
    private let window: NSWindow
    private let webView: WKWebView
    private let url: URL
    private var ready = false
    private var queued: [String] = []
    private var lastPointer = CGPoint(x: CGFloat.infinity, y: CGFloat.infinity)

    /// Called with the page's world list once it has loaded.
    var onReady: (([WorldInfo]) -> Void)?
    /// Called when a GPU world is too heavy for this Mac's GPU.
    var onGPUSlow: (() -> Void)?

    init(screen: NSScreen, webRoot: URL, world: String, clock: Bool, parallax: Double) {
        self.screen = screen
        frame = screen.frame

        window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.setFrame(frame, display: false)
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenNone]
        window.ignoresMouseEvents = true
        window.isOpaque = true
        window.hasShadow = false
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false
        window.animationBehavior = .none

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: BundleSchemeHandler.scheme)
        config.suppressesIncrementalRendering = true
        webView = WKWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)

        var parts = URLComponents()
        parts.scheme = BundleSchemeHandler.scheme
        parts.host = "app"
        parts.path = "/wallpaper.html"
        parts.queryItems = [
            URLQueryItem(name: "world", value: world),
            URLQueryItem(name: "clock", value: clock ? "1" : "0"),
            URLQueryItem(name: "parallax", value: String(parallax)),
        ]
        url = parts.url!
        super.init()

        config.userContentController.add(WeakMessageHandler(self), name: "mac3d")
        webView.setValue(false, forKey: "drawsBackground") // black window shows until first paint, no white flash
        // WebKit stops drawing while the desktop is fully covered by windows,
        // so the wallpaper costs nothing then. The self-test runs with other
        // windows on top, so it asks WebKit to keep drawing.
        if CommandLine.arguments.contains("--self-test"),
           webView.responds(to: Selector(("_setWindowOcclusionDetectionEnabled:"))) {
            webView.setValue(false, forKey: "windowOcclusionDetectionEnabled")
        }
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window.contentView = webView
        webView.load(URLRequest(url: url))
        window.orderFrontRegardless()
    }

    func close() {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "mac3d")
        webView.stopLoading()
        window.orderOut(nil)
        window.contentView = nil
    }

    // MARK: Commands to the page

    func setWorld(_ id: String) { call("mac3d.setWorld(\(json(id)))") }
    func setClock(_ on: Bool) { call("mac3d.setClock(\(on))") }
    func setPaused(_ on: Bool) { call("mac3d.setPaused(\(on))") }
    func setParallax(_ strength: Double) { call("mac3d.setParallax(\(strength))") }

    /// Global cursor position (AppKit screen coordinates) → -1…1 on this display.
    func pointer(_ p: CGPoint) {
        guard ready else { return }
        let x = max(-1, min(1, (p.x - frame.midX) / (frame.width / 2)))
        let y = max(-1, min(1, -(p.y - frame.midY) / (frame.height / 2)))
        guard abs(x - lastPointer.x) + abs(y - lastPointer.y) > 0.002 else { return }
        lastPointer = CGPoint(x: x, y: y)
        webView.evaluateJavaScript(String(format: "mac3d.pointer(%.4f,%.4f)", x, y))
    }

    /// PNG of what this display shows (used by the build's self-test).
    func snapshot(to file: URL, done: @escaping @MainActor (Bool) -> Void) {
        webView.takeSnapshot(with: nil) { image, _ in
            MainActor.assumeIsolated {
                guard let image, let tiff = image.tiffRepresentation,
                      let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:])
                else { return done(false) }
                done((try? png.write(to: file)) != nil)
            }
        }
    }

    /// Run an async function body that returns a string (self-test diagnostics).
    func inspect(_ body: String, done: @escaping @MainActor (String) -> Void) {
        let occluded = !window.occlusionState.contains(.visible)
        webView.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { result in
            MainActor.assumeIsolated {
                switch result {
                case let .success(value): done("\(value as? String ?? "?") windowOccluded=\(occluded)")
                case let .failure(error): done("error: \(error.localizedDescription)")
                }
            }
        }
    }

    private func call(_ script: String) {
        if ready { webView.evaluateJavaScript(script) } else { queued.append(script) }
    }

    private func json(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        return data.flatMap { String(data: $0, encoding: .utf8) }.map { String($0.dropFirst().dropLast()) } ?? "\"\""
    }

    // MARK: Messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            ready = true
            lastPointer = CGPoint(x: CGFloat.infinity, y: CGFloat.infinity)
            for script in queued { webView.evaluateJavaScript(script) }
            queued.removeAll()
            let list = (body["worlds"] as? [[String: Any]] ?? []).compactMap { w -> WorldInfo? in
                guard let id = w["id"] as? String, let name = w["name"] as? String else { return nil }
                return WorldInfo(id: id, name: name, tag: w["tag"] as? String ?? "", kind: w["kind"] as? String ?? "classic")
            }
            onReady?(list)
        case "gpu-slow":
            onGPUSlow?()
        case "error":
            NSLog("[mac3d] page error: %@", body["message"] as? String ?? "?")
        default:
            break
        }
    }

    // MARK: Navigation

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // The page's process died (memory pressure, GPU reset): start it again.
        ready = false
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[mac3d] load failed: %@", error.localizedDescription)
    }
}

/// WKUserContentController retains its handlers; this breaks the cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
