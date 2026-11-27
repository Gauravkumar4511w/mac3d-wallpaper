import AppKit
import ServiceManagement

/// What the window shows and changes. Every change goes through AppDelegate,
/// which owns the wallpapers, so the menu bar menu and the window always agree.
@MainActor
final class AppModel: ObservableObject {
    enum Page: String, CaseIterable, Identifiable {
        case wallpaper, motion, general, account, about
        var id: String { rawValue }
        var title: String {
            switch self {
            case .wallpaper: "Wallpaper"
            case .motion: "Motion & Clock"
            case .general: "General"
            case .account: "Account & Sync"
            case .about: "About"
            }
        }
        var symbol: String {
            switch self {
            case .wallpaper: "photo.on.rectangle.angled"
            case .motion: "cursorarrow.motionlines"
            case .general: "gearshape"
            case .account: "person.crop.circle"
            case .about: "info.circle"
            }
        }
    }

    weak var app: AppDelegate?
    let account: Account
    private let settings = Settings.shared

    @Published var page: Page = .wallpaper
    @Published var onboarding: Bool
    // View state (this toolchain has no SwiftUI @State, so it lives here)
    @Published var hovered: String?
    @Published var setupStep = 0
    @Published var setupOpenAtLogin = true

    init(app: AppDelegate?, account: Account) {
        self.app = app
        self.account = account
        onboarding = !Settings.shared.onboarded
    }

    /// Something changed (here, in the menu bar or from sync): redraw.
    func changed() { objectWillChange.send() }

    // MARK: Worlds

    var worlds: [WorldInfo] { settings.worlds }
    var shownWorld: String {
        let shown = app?.shownWorldID ?? ""
        return shown.isEmpty ? settings.worldID : shown
    }
    var shownInfo: WorldInfo? { worlds.first { $0.id == shownWorld } }

    func pick(_ id: String) { app?.pick(id) }
    func nextWorld() { app?.nextWorld() }

    var rotation: Rotation {
        get { settings.rotation }
        set { app?.setRotation(newValue) }
    }

    func isFavorite(_ id: String) -> Bool { settings.favorites.contains(id) }
    func toggleFavorite(_ id: String) {
        var list = settings.favorites
        if let i = list.firstIndex(of: id) { list.remove(at: i) } else { list.append(id) }
        settings.favorites = list
        app?.refreshWorld()
        changed()
    }

    // MARK: Motion & clock

    var showClock: Bool {
        get { settings.showClock }
        set { app?.setClock(newValue) }
    }

    var parallax: ParallaxLevel {
        get { ParallaxLevel.nearest(settings.parallax) }
        set { app?.setParallax(newValue.rawValue) }
    }

    var paused: Bool {
        get { settings.paused }
        set { app?.setPaused(newValue) }
    }

    var lowPower: Bool { ProcessInfo.processInfo.isLowPowerModeEnabled }

    // MARK: General

    var openAtLogin: Bool {
        get { SMAppService.mainApp.status == .enabled }
        set {
            do {
                if newValue { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            } catch {
                let alert = NSAlert()
                alert.messageText = "Couldn’t change Open at Login"
                alert.informativeText = "\(error.localizedDescription)\n\nMove mac3D Wallpaper to your Applications folder and try again."
                alert.runModal()
            }
            changed()
        }
    }

    var showMenuBarIcon: Bool {
        get { settings.showMenuBarIcon }
        set { app?.setMenuBarIcon(newValue) }
    }

    // MARK: First launch

    func finishOnboarding() {
        if setupOpenAtLogin != openAtLogin { openAtLogin = setupOpenAtLogin }
        settings.onboarded = true
        page = .wallpaper
        onboarding = false
    }

    func showSetupAgain() {
        setupStep = 0
        setupOpenAtLogin = openAtLogin || !settings.onboarded
        onboarding = true
    }

    var version: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "1.0") (\(info?["CFBundleVersion"] as? String ?? "1"))"
    }
}

/// World thumbnails bundled by build.sh (Resources/thumbs/<id>.jpg, from the
/// landing page's media/<id>/card.jpg).
@MainActor
enum Thumbs {
    private static var cache: [String: NSImage] = [:]
    private static let dir: URL? = ProcessInfo.processInfo.environment["MAC3D_THUMBS"].map { URL(fileURLWithPath: $0) }
        ?? Bundle.main.resourceURL?.appendingPathComponent("thumbs")

    static func image(_ id: String) -> NSImage? {
        if let hit = cache[id] { return hit }
        guard let url = dir?.appendingPathComponent("\(id).jpg"), let img = NSImage(contentsOf: url) else { return nil }
        cache[id] = img
        return img
    }
}
