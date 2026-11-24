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
    private var webRoot: URL {
        if let dev = ProcessInfo.processInfo.environment["MAC3D_WEB_ROOT"] { return URL(fileURLWithPath: dev) }
        return Bundle.main.resourceURL!.appendingPathComponent("web")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = StatusIcon.image
        statusItem.button?.toolTip = "mac3D Wallpaper"
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu

        #if arch(x86_64)
        // Intel Macs: start with the lighter worlds for Match Time of Day; GPU
        // worlds stay one click away in the menu.
        if UserDefaults.standard.object(forKey: "gpuSlow") == nil { settings.gpuSlow = true }
        #endif
        shownWorld = currentWorld()
        buildWallpapers()
        startPointerTracking()
        startTimeOfDayCheck()
        observeSystem()
        SelfTest.runIfRequested(app: self)
    }

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
                NSLog("[mac3d] GPU worlds are too heavy for this Mac; Match Time of Day will use the lighter worlds")
                self.settings.gpuSlow = true
                if self.settings.matchTimeOfDay { self.showWorld(self.currentWorld()) }
            }
        }
        walls.first?.onReady = { [weak self] list in
            guard let self, !list.isEmpty else { return }
            if list != self.settings.worlds { self.settings.worlds = list }
            // The cached list may have been empty on first launch: re-pick.
            self.showWorld(self.currentWorld())
        }
        applyPaused()
    }

    /// The world to show now: from the clock, or the one the user picked.
    private func currentWorld() -> String {
        // On a slow GPU the clock only picks the lighter (SVG) worlds.
        let ids = Set(settings.worlds.filter { !(settings.gpuSlow && $0.kind == "gpu") }.map(\.id))
        if settings.matchTimeOfDay, let id = TimeOfDay.world(among: ids) { return id }
        if ids.isEmpty || ids.contains(settings.worldID) { return settings.worldID }
        return settings.worlds.first?.id ?? settings.worldID
    }

    func showWorld(_ id: String) {
        guard id != shownWorld else { return }
        shownWorld = id
        walls.forEach { $0.setWorld(id) }
    }

    var wallpapers: [DesktopWallpaper] { walls }

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
    var worldIDs: [String] { settings.worlds.map(\.id) }

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

    // MARK: Time of day

    private func startTimeOfDayCheck() {
        let timer = Timer(timeInterval: 60, repeats: true) { _ in
            MainActor.assumeIsolated { [weak self] in
                guard let self, self.settings.matchTimeOfDay else { return }
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
                    if self.settings.matchTimeOfDay { self.showWorld(self.currentWorld()) }
                }
            }
        }
        // Low Power Mode on: hold the scene still until it's switched off.
        NotificationCenter.default.addObserver(forName: Notification.Name.NSProcessInfoPowerStateDidChange,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                self.lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
                self.applyPaused()
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

    // MARK: Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        let title = NSMenuItem(title: "mac3D Wallpaper", action: nil, keyEquivalent: "")
        title.attributedTitle = NSAttributedString(string: "mac3D Wallpaper",
                                                   attributes: [.font: NSFont.boldSystemFont(ofSize: 13)])
        menu.addItem(title)
        if let now = settings.worlds.first(where: { $0.id == shownWorld }) {
            menu.addItem(disabled: "Now: \(now.name) · \(now.tag)")
        }
        menu.addItem(.separator())

        let worldsItem = NSMenuItem(title: "Worlds", action: nil, keyEquivalent: "")
        worldsItem.submenu = worldsMenu()
        menu.addItem(worldsItem)
        menu.addItem(item("Next World", #selector(nextWorld)))
        menu.addItem(item("Match Time of Day", #selector(toggleTimeOfDay), on: settings.matchTimeOfDay))
        menu.addItem(.separator())

        menu.addItem(item("Show Depth Clock", #selector(toggleClock), on: settings.showClock))
        let parallaxItem = NSMenuItem(title: "Parallax", action: nil, keyEquivalent: "")
        let parallaxMenu = NSMenu()
        for level in ParallaxLevel.allCases {
            let it = item(level.title, #selector(setParallax(_:)), on: abs(settings.parallax - level.rawValue) < 0.01)
            it.representedObject = level.rawValue
            parallaxMenu.addItem(it)
        }
        parallaxItem.submenu = parallaxMenu
        menu.addItem(parallaxItem)
        menu.addItem(item("Pause Animations", #selector(togglePause), on: settings.paused))
        if lowPower { menu.addItem(disabled: "Paused while Low Power Mode is on") }
        if settings.gpuSlow { menu.addItem(disabled: "Match Time of Day uses the lighter worlds on this Mac") }
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
                let it = item(w.name, #selector(pickWorld(_:)), on: w.id == shownWorld)
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

    @objc private func pickWorld(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        settings.matchTimeOfDay = false // a manual pick overrides the clock
        settings.worldID = id
        showWorld(id)
    }

    @objc private func nextWorld() {
        let ids = worldIDs
        guard !ids.isEmpty else { return }
        let next = ids[((ids.firstIndex(of: shownWorld) ?? -1) + 1) % ids.count]
        settings.matchTimeOfDay = false
        settings.worldID = next
        showWorld(next)
    }

    @objc private func toggleTimeOfDay() {
        settings.matchTimeOfDay.toggle()
        if !settings.matchTimeOfDay { settings.worldID = shownWorld }
        showWorld(currentWorld())
    }

    @objc private func toggleClock() {
        settings.showClock.toggle()
        walls.forEach { $0.setClock(settings.showClock) }
    }

    @objc private func setParallax(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        settings.parallax = value
        walls.forEach { $0.setParallax(value) }
        if value == 0 { walls.forEach { $0.pointer(.zero) } }
    }

    @objc private func togglePause() {
        settings.paused.toggle()
        applyPaused()
    }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = "Couldn’t change Open at Login"
            alert.informativeText = "\(error.localizedDescription)\n\nMove mac3D Wallpaper to your Applications folder and try again."
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
        }
    }

    @objc private func about() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.orderFrontStandardAboutPanel(options: [
            .credits: NSAttributedString(string: "Layered, living worlds for your desktop — they follow your cursor and keep time.",
                                         attributes: [.font: NSFont.systemFont(ofSize: 11)]),
        ])
    }
}

private extension NSMenu {
    func addItem(disabled title: String) {
        let it = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        it.isEnabled = false
        addItem(it)
    }
}
