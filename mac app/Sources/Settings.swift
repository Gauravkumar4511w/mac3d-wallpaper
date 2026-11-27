import Foundation

/// One world as reported by the wallpaper page (single source of truth: the
/// landing page's src/scenes.jsx). Cached so the menu is ready at launch.
struct WorldInfo: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let tag: String
    /// "gpu" (Ultra-real shader worlds), "classic" or "new"
    let kind: String
}

enum ParallaxLevel: Double, CaseIterable {
    case off = 0
    case subtle = 0.55
    case normal = 1
    case strong = 1.6

    var title: String {
        switch self {
        case .off: "Off"
        case .subtle: "Subtle"
        case .normal: "Normal"
        case .strong: "Strong"
        }
    }

    /// The level closest to a stored strength.
    static func nearest(_ value: Double) -> ParallaxLevel {
        allCases.min { abs($0.rawValue - value) < abs($1.rawValue - value) } ?? .normal
    }
}

/// How the wallpaper changes by itself.
enum Rotation: String, CaseIterable, Codable {
    case off, timeOfDay, hourly, daily

    var title: String {
        switch self {
        case .off: "Keep the world I pick"
        case .timeOfDay: "Match the time of day"
        case .hourly: "A new world every hour"
        case .daily: "A new world every day"
        }
    }

    var detail: String {
        switch self {
        case .off: "Your wallpaper stays put until you choose another world."
        case .timeOfDay: "Sunrise peaks in the morning, golden dunes in the afternoon, city lights at night."
        case .hourly, .daily: "Cycles through your favourites (♥), or every world if you haven’t picked any."
        }
    }
}

/// The settings that follow you between Macs when you sign in. Per-Mac things
/// (pause, open at login, menu bar icon) stay local.
struct SyncedSettings: Equatable {
    var worldID: String
    var rotation: Rotation
    var showClock: Bool
    var parallax: Double
    var favorites: [String]
    /// When these were last changed (seconds since 1970); newest wins.
    var modifiedAt: Double
}

extension Notification.Name {
    /// Posted when a synced setting changes on this Mac (not when one arrives from the cloud).
    static let syncedSettingsChanged = Notification.Name("mac3d.syncedSettingsChanged")
}

/// Persisted user choices (UserDefaults).
@MainActor
final class Settings {
    static let shared = Settings()
    private let defaults = UserDefaults.standard

    var worldID: String {
        get { defaults.string(forKey: "world") ?? "valleyofflowers" }
        set { defaults.set(newValue, forKey: "world"); touched() }
    }

    var rotation: Rotation {
        get {
            if let raw = defaults.string(forKey: "rotation"), let r = Rotation(rawValue: raw) { return r }
            // Before 1.1 this was a single "Match Time of Day" switch (on by default).
            return (defaults.object(forKey: "matchTimeOfDay") as? Bool ?? true) ? .timeOfDay : .off
        }
        set { defaults.set(newValue.rawValue, forKey: "rotation"); touched() }
    }

    var showClock: Bool {
        get { defaults.object(forKey: "clock") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "clock"); touched() }
    }

    var parallax: Double {
        get { defaults.object(forKey: "parallax") as? Double ?? ParallaxLevel.normal.rawValue }
        set { defaults.set(newValue, forKey: "parallax"); touched() }
    }

    /// World ids marked with a heart; hourly / daily rotation uses only these.
    var favorites: [String] {
        get { defaults.stringArray(forKey: "favorites") ?? [] }
        set { defaults.set(newValue, forKey: "favorites"); touched() }
    }

    var paused: Bool {
        get { defaults.bool(forKey: "paused") }
        set { defaults.set(newValue, forKey: "paused") }
    }

    /// The first-launch setup has been finished.
    var onboarded: Bool {
        get { defaults.bool(forKey: "onboarded") }
        set { defaults.set(newValue, forKey: "onboarded") }
    }

    var showMenuBarIcon: Bool {
        get { defaults.object(forKey: "menuBarIcon") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "menuBarIcon") }
    }

    /// Set once a GPU world proved too heavy for this Mac (it then holds a
    /// still frame); automatic changes stick to the lighter worlds after that.
    var gpuSlow: Bool {
        get { defaults.bool(forKey: "gpuSlow") }
        set { defaults.set(newValue, forKey: "gpuSlow") }
    }

    var worlds: [WorldInfo] {
        get {
            guard let data = defaults.data(forKey: "worlds") else { return [] }
            return (try? JSONDecoder().decode([WorldInfo].self, from: data)) ?? []
        }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "worlds") }
    }

    // MARK: Sync

    private var modifiedAt: Double {
        get { defaults.double(forKey: "modifiedAt") }
        set { defaults.set(newValue, forKey: "modifiedAt") }
    }
    private var applyingRemote = false

    private func touched() {
        guard !applyingRemote else { return }
        modifiedAt = Date().timeIntervalSince1970
        NotificationCenter.default.post(name: .syncedSettingsChanged, object: nil)
    }

    var synced: SyncedSettings {
        SyncedSettings(worldID: worldID, rotation: rotation, showClock: showClock, parallax: parallax,
                       favorites: favorites, modifiedAt: modifiedAt)
    }

    /// Take settings that came from the cloud, without echoing them back.
    func apply(_ remote: SyncedSettings) {
        applyingRemote = true
        defer { applyingRemote = false }
        worldID = remote.worldID
        rotation = remote.rotation
        showClock = remote.showClock
        parallax = remote.parallax
        favorites = remote.favorites
        modifiedAt = remote.modifiedAt
    }
}

/// Which world suits the hour. Rotates through each slot's worlds day by day.
enum TimeOfDay {
    // Each slot lists GPU worlds first and at least one light SVG world, so a
    // Mac with a slow GPU (which skips GPU worlds) always has a match.
    private static let schedule: [(from: Int, ids: [String])] = [
        (0, ["fjord", "wintercabin", "blackhole", "planet", "aurora", "nebula", "train"]),
        (5, ["summit", "windowseat", "autumnlake", "bamboo", "morning", "blossom"]),
        (9, ["valleyofflowers", "flowervalley", "icefalls", "turquoisebay", "bamboo", "islands", "morning"]),
        (12, ["turquoisebay", "valleyofflowers", "aquarium", "canyon", "icefalls", "rainforest", "caravan"]),
        (16, ["sahara", "ocean", "canyon", "ember", "caravan"]),
        (19, ["volcano", "stormlight", "wintercabin", "lagoon", "abyss"]),
        (21, ["citylights", "fjord", "blackhole", "neon", "train", "aurora"]),
    ]

    static func world(at date: Date = Date(), among available: Set<String>) -> String? {
        let cal = Calendar.current
        let hour = cal.component(.hour, from: date)
        guard let slot = schedule.last(where: { $0.from <= hour }) else { return nil }
        let ids = slot.ids.filter { available.isEmpty || available.contains($0) }
        guard !ids.isEmpty else { return nil }
        let day = cal.ordinality(of: .day, in: .year, for: date) ?? 0
        return ids[day % ids.count]
    }

    /// Hourly / daily rotation: the same pick all hour (or all day), in order.
    static func rotate(_ pool: [String], _ rotation: Rotation, at date: Date = Date()) -> String? {
        guard !pool.isEmpty else { return nil }
        let local = date.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: date))
        let slot = Int(local / (rotation == .hourly ? 3600 : 86400))
        return pool[slot % pool.count]
    }
}
