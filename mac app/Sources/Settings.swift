import Foundation

/// One world as reported by the wallpaper page (single source of truth: the
/// landing page's src/scenes.jsx). Cached so the menu is ready at launch.
struct WorldInfo: Codable, Equatable {
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
}

/// Persisted user choices (UserDefaults).
@MainActor
final class Settings {
    static let shared = Settings()
    private let defaults = UserDefaults.standard

    var worldID: String {
        get { defaults.string(forKey: "world") ?? "neon" }
        set { defaults.set(newValue, forKey: "world") }
    }

    /// Pick the world from the clock (dawn peaks, golden-hour dunes, night city…).
    var matchTimeOfDay: Bool {
        get { defaults.object(forKey: "matchTimeOfDay") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "matchTimeOfDay") }
    }

    var showClock: Bool {
        get { defaults.object(forKey: "clock") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "clock") }
    }

    var parallax: Double {
        get { defaults.object(forKey: "parallax") as? Double ?? ParallaxLevel.normal.rawValue }
        set { defaults.set(newValue, forKey: "parallax") }
    }

    var paused: Bool {
        get { defaults.bool(forKey: "paused") }
        set { defaults.set(newValue, forKey: "paused") }
    }

    /// Set once a GPU world proved too heavy for this Mac (it then holds a
    /// still frame); Match Time of Day sticks to the lighter worlds after that.
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
}

/// Which world suits the hour. Rotates through each slot's worlds day by day.
enum TimeOfDay {
    private static let schedule: [(from: Int, ids: [String])] = [
        (0, ["nebula", "aurora", "planet"]),
        (5, ["morning", "blossom"]),
        (9, ["flowervalley", "islands"]),
        (12, ["caravan", "rainforest", "ocean"]),
        (16, ["ember"]),
        (19, ["lagoon", "abyss", "aquarium"]),
        (21, ["neon", "train", "aurora"]),
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
}
