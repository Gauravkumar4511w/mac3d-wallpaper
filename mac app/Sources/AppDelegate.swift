import AppKit
import ServiceManagement

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let settings = Settings.shared
    private var walls: [DesktopWallpaper] = []
    private var statusItem: NSStatusItem!
    private var pointerTimer: Timer?
    private var clockTimer: Timer?
    private var systemPaused = false // displays asleep, screen locked, user switched
    private var shownWorld = ""
    private var launchedAtLogin = false
    private lazy var account = Account()
    private lazy var model = AppModel(app: self, account: account)
    private lazy var mainWindow = MainWindow(model: model)
    private var webRoot: URL {
        if let dev = ProcessInfo.processInfo.environment["MAC3D_WEB_ROOT"] { return URL(fileURLWithPath: dev) }
        return Bundle.main.resourceURL!.appendingPathComponent("web")
    }
    private var isTesting: Bool {
        CommandLine.arguments.contains("--self-test") || CommandLine.arguments.contains("--render-ui")
    }

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Opened by Open at Login (not by the person): stay quietly in the menu bar.
        let event = NSAppleEventManager.shared().currentAppleEvent
        launchedAtLogin = event?.eventID == kAEOpenApplication
            && event?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem
        NSApp.mainMenu = makeMainMenu()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if UITest.runIfRequested(model: model) { return }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = StatusIcon.image
        statusItem.button?.toolTip = "mac3D Wallpaper"
        statusItem.isVisible = settings.showMenuBarIcon
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu

        #if arch(x86_64)
        // Intel Macs: start with the lighter worlds for automatic changes; GPU
        // worlds stay one click away.
        if UserDefaults.standard.object(forKey: "gpuSlow") == nil { settings.gpuSlow = true }
        #endif
        shownWorld = currentWorld()
        buildWallpapers()
        startPointerTracking()
        startTimeOfDayCheck()
        observeSystem()

        account.onRemoteSettings = { [weak self] remote in self?.applySynced(remote) }
        account.start()

        SelfTest.runIfRequested(app: self)
        // Opened by hand (or for the first time): show the window, so the app
        // never seems to do nothing — its menu bar icon can hide behind the notch.
        if !isTesting && (!settings.onboarded || !launchedAtLogin) { mainWindow.show() }
    }

    /// Opened again while already running (Finder, Launchpad, Spotlight, Dock).
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        mainWindow.show()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        walls.forEach { $0.close() }
    }

    // MARK: Wallpapers (one per display)

    private func buildWallpapers() {
        walls.forEach { $0.close() }
        walls = NSScreen.screens.map { screen in
            DesktopWallpaper(screen: screen, webRoot: webRoot, world: shownWorld,
                             clock: settings.showClock, parallax: settings.parallax)
        }
        for wall in walls {
            wall.onGPUSlow = { [weak self] in
                guard let self, !self.settings.gpuSlow else { return }
                NSLog("[mac3d] GPU worlds are too heavy for this Mac; automatic changes will use the lighter worlds")
                self.settings.gpuSlow = true
                if self.settings.rotation != .off { self.showWorld(self.currentWorld()) }
            }
        }
        walls.first?.onReady = { [weak self] list in
            guard let self, !list.isEmpty else { return }
            if list != self.settings.worlds { self.settings.worlds = list }
            // The cached list may have been empty on first launch: re-pick.
            self.showWorld(self.currentWorld())
            self.model.changed()
        }
        applyPaused()
    }

    /// The world to show now: from the clock or the rotation, or the one the user picked.
    private func currentWorld() -> String {
        // On a slow GPU automatic changes only pick the lighter (SVG) worlds.
        let available = settings.worlds.filter { !(settings.gpuSlow && $0.kind == "gpu") }.map(\.id)
        let ids = Set(available)
        switch settings.rotation {
        case .timeOfDay:
            if let id = TimeOfDay.world(among: ids) { return id }
        case .hourly, .daily:
            let favorites = settings.favorites.filter { ids.contains($0) }
            if let id = TimeOfDay.rotate(favorites.isEmpty ? available : favorites, settings.rotation) { return id }
        case .off:
            break
        }
        if ids.isEmpty || settings.worlds.contains(where: { $0.id == settings.worldID }) { return settings.worldID }
        return settings.worlds.first?.id ?? settings.worldID
    }

    func showWorld(_ id: String) {
        guard id != shownWorld else { return }
        shownWorld = id
        walls.forEach { $0.setWorld(id) }
        model.changed()
    }

    var shownWorldID: String { shownWorld }
    var wallpapers: [DesktopWallpaper] { walls }
    var worldIDs: [String] { settings.worlds.map(\.id) }

    // MARK: Changes (from the menu, the window and sync)

    func pick(_ id: String) {
        settings.rotation = .off // a manual pick stops automatic changes
        settings.worldID = id
        showWorld(id)
        model.changed()
    }

    func nextWorld() {
        let ids = worldIDs
        guard !ids.isEmpty else { return }
        pick(ids[((ids.firstIndex(of: shownWorld) ?? -1) + 1) % ids.count])
    }

    func setRotation(_ rotation: Rotation) {
        if rotation == .off { settings.worldID = shownWorld }
        settings.rotation = rotation
        showWorld(currentWorld())
        model.changed()
    }

    /// Favourites changed: hourly / daily rotation may now pick another world.
    func refreshWorld() {
        if settings.rotation == .hourly || settings.rotation == .daily { showWorld(currentWorld()) }
    }

    func setClock(_ on: Bool) {
        settings.showClock = on
        walls.forEach { $0.setClock(on) }
        model.changed()
    }

    func setParallax(_ value: Double) {
        settings.parallax = value
        walls.forEach { $0.setParallax(value) }
        if value == 0 { walls.forEach { $0.pointer(.zero) } }
        model.changed()
    }

    func setPaused(_ on: Bool) {
        settings.paused = on
        applyPaused()
        model.changed()
    }

    func setMenuBarIcon(_ on: Bool) {
        settings.showMenuBarIcon = on
        statusItem?.isVisible = on
        model.changed()
    }

    /// Settings that arrived from another Mac.
    private func applySynced(_ remote: SyncedSettings) {
        settings.apply(remote)
        walls.forEach {
            $0.setClock(remote.showClock)
            $0.setParallax(remote.parallax)
        }
        showWorld(currentWorld())
        model.changed()
    }

    /// Self-test: the status item's state and the menu it would show.
    func describeMenu() -> String {
        let button = statusItem.button
        var lines = ["status item: visible=\(statusItem.isVisible) image=\(button?.image != nil) window=\(button?.window?.frame ?? .zero)"]
        let menu = NSMenu()
        menuNeedsUpdate(menu)
        func walk(_ m: NSMenu, _ depth: Int) {
            for it in m.items {
                let mark = it.state == .on ? "✓ " : "  "
                lines.append(String(repeating: "    ", count: depth) + (it.isSeparatorItem ? "—" : mark + it.title))
                if let sub = it.submenu { walk(sub, depth + 1) }
            }
        }
        walk(menu, 1)
        return lines.joined(separator: "\n")
    }

    // MARK: Cursor parallax

    private func startPointerTracking() {
        // Polling the cursor needs no permissions; the page eases the motion and
        // nothing is sent while the cursor is still.
        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { _ in
            MainActor.assumeIsolated { [weak self] in
                guard let self, self.settings.parallax > 0, !self.isPaused else { return }
                let p = NSEvent.mouseLocation
                self.walls.forEach { $0.pointer(p) }
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        pointerTimer = timer
    }

    // MARK: Time of day and rotation

    private func startTimeOfDayCheck() {
        let timer = Timer(timeInterval: 60, repeats: true) { _ in
            MainActor.assumeIsolated { [weak self] in
                guard let self, self.settings.rotation != .off else { return }
                self.showWorld(self.currentWorld())
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        clockTimer = timer
    }

    // MARK: Pausing

    private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    private var isPaused: Bool { settings.paused || systemPaused || lowPower }

    private func applyPaused() {
        walls.forEach { $0.setPaused(isPaused) }
    }

    private func observeSystem() {
        let ws = NSWorkspace.shared.notificationCenter
        let pause: [NSNotification.Name] = [NSWorkspace.screensDidSleepNotification, NSWorkspace.willSleepNotification,
                                            NSWorkspace.sessionDidResignActiveNotification]
        let resume: [NSNotification.Name] = [NSWorkspace.screensDidWakeNotification, NSWorkspace.didWakeNotification,
                                             NSWorkspace.sessionDidBecomeActiveNotification]
        for name in pause {
            ws.addObserver(forName: name, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { self.systemPaused = true; self.applyPaused() }
            }
        }
        for name in resume {
            ws.addObserver(forName: name, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated {
                    self.systemPaused = false
                    self.applyPaused()
                    if self.settings.rotation != .off { self.showWorld(self.currentWorld()) }
                    if self.account.isSignedIn { self.account.syncNow() }
                }
            }
        }
        // Low Power Mode on: hold the scene still until it's switched off.
        NotificationCenter.default.addObserver(forName: Notification.Name.NSProcessInfoPowerStateDidChange,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                self.lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
                self.applyPaused()
                self.model.changed()
            }
        }
        // Displays added, removed or rearranged: rebuild (debounced).
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(self.rebuild), object: nil)
                self.perform(#selector(self.rebuild), with: nil, afterDelay: 0.6)
            }
        }
    }

    @objc private func rebuild() { buildWallpapers() }

    // MARK: App menu (shown while the window is open)

    private func makeMainMenu() -> NSMenu {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let app = NSMenu()
        app.addItem(item("About mac3D Wallpaper", #selector(about)))
        app.addItem(.separator())
        app.addItem(item("Settings…", #selector(openSettings), key: ","))
        app.addItem(.separator())
        app.addItem(withTitle: "Hide mac3D Wallpaper", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        app.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit mac3D Wallpaper", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app
        main.addItem(appItem)

        let windowItem = NSMenuItem()
        let window = NSMenu(title: "Window")
        window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        window.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = window
        main.addItem(windowItem)
        NSApp.windowsMenu = window
        return main
    }

    // MARK: Menu bar menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        let title = NSMenuItem(title: "mac3D Wallpaper", action: nil, keyEquivalent: "")
        title.attributedTitle = NSAttributedString(string: "mac3D Wallpaper",
                                                   attributes: [.font: NSFont.boldSystemFont(ofSize: 13)])
        menu.addItem(title)
        if let now = settings.worlds.first(where: { $0.id == shownWorld }) {
            menu.addItem(disabled: "Now: \(now.name) · \(now.tag)")
        }
        menu.addItem(item("Open mac3D Wallpaper…", #selector(openSettings), key: ","))
        menu.addItem(.separator())

        let worldsItem = NSMenuItem(title: "Worlds", action: nil, keyEquivalent: "")
        worldsItem.submenu = worldsMenu()
        menu.addItem(worldsItem)
        menu.addItem(item("Next World", #selector(nextWorldAction)))
        let changes = NSMenuItem(title: "Change Automatically", action: nil, keyEquivalent: "")
        let changesMenu = NSMenu()
        for rotation in Rotation.allCases {
            let it = item(rotation.title, #selector(setRotationAction(_:)), on: settings.rotation == rotation)
            it.representedObject = rotation.rawValue
            changesMenu.addItem(it)
        }
        changes.submenu = changesMenu
        menu.addItem(changes)
        menu.addItem(.separator())

        menu.addItem(item("Show Depth Clock", #selector(toggleClock), on: settings.showClock))
        let parallaxItem = NSMenuItem(title: "Parallax", action: nil, keyEquivalent: "")
        let parallaxMenu = NSMenu()
        for level in ParallaxLevel.allCases {
            let it = item(level.title, #selector(setParallaxAction(_:)), on: abs(settings.parallax - level.rawValue) < 0.01)
            it.representedObject = level.rawValue
            parallaxMenu.addItem(it)
        }
        parallaxItem.submenu = parallaxMenu
        menu.addItem(parallaxItem)
        menu.addItem(item("Pause Animations", #selector(togglePause), on: settings.paused))
        if lowPower { menu.addItem(disabled: "Paused while Low Power Mode is on") }
        if settings.gpuSlow { menu.addItem(disabled: "Automatic changes use the lighter worlds on this Mac") }
        menu.addItem(.separator())

        menu.addItem(item("Open at Login", #selector(toggleLogin), on: SMAppService.mainApp.status == .enabled))
        menu.addItem(item("About mac3D Wallpaper", #selector(about)))
        menu.addItem(item("Quit mac3D Wallpaper", #selector(NSApplication.terminate(_:)), key: "q", target: NSApp))
    }

    private func worldsMenu() -> NSMenu {
        let menu = NSMenu()
        let worlds = settings.worlds
        if worlds.isEmpty {
            menu.addItem(disabled: "Loading worlds…")
            return menu
        }
        let groups: [(kind: String, title: String)] = [("gpu", "Ultra-real · GPU"), ("classic", "Worlds"), ("new", "New · alive")]
        for (i, group) in groups.enumerated() {
            let list = worlds.filter { $0.kind == group.kind }
            guard !list.isEmpty else { continue }
            if i > 0 { menu.addItem(.separator()) }
            menu.addItem(disabled: group.title)
            for w in list {
                let it = item((settings.favorites.contains(w.id) ? "♥ " : "") + w.name, #selector(pickWorld(_:)), on: w.id == shownWorld)
                it.representedObject = w.id
                it.toolTip = w.tag
                it.indentationLevel = 1
                menu.addItem(it)
            }
        }
        return menu
    }

    private func item(_ title: String, _ action: Selector, on: Bool? = nil, key: String = "", target: AnyObject? = nil) -> NSMenuItem {
        let it = NSMenuItem(title: title, action: action, keyEquivalent: key)
        it.target = target ?? self
        if let on { it.state = on ? .on : .off }
        return it
    }

    // MARK: Menu actions

    @objc private func openSettings() { mainWindow.show() }

    @objc private func pickWorld(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        pick(id)
    }

    @objc private func nextWorldAction() { nextWorld() }

    @objc private func setRotationAction(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let rotation = Rotation(rawValue: raw) else { return }
        setRotation(rotation)
    }

    @objc private func toggleClock() { setClock(!settings.showClock) }

    @objc private func setParallaxAction(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        setParallax(value)
    }

    @objc private func togglePause() { setPaused(!settings.paused) }

    @objc private func toggleLogin() {
        model.openAtLogin.toggle()
    }

    @objc private func about() {
        mainWindow.show(page: .about)
    }
}

private extension NSMenu {
    func addItem(disabled title: String) {
        let it = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        it.isEnabled = false
        addItem(it)
    }
}
