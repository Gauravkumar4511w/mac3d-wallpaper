import AppKit
import AuthenticationServices
import CryptoKit

/// Optional Google sign-in that keeps your settings (world, auto-change,
/// favourites, clock, parallax) the same on every Mac you use.
///
/// - Sign-in: Google OAuth with PKCE in the system's web sign-in sheet
///   (ASWebAuthenticationSession); no password ever passes through the app.
/// - Account: the Google ID token signs in to Firebase Auth (REST).
/// - Storage: one Firestore document per person, `users/{uid}`, which only
///   that person can read or write (see mac app/firebase/firestore.rules).
///
/// The keys come from `GoogleService-Info.plist` (Firebase console → your
/// Apple app), bundled by build.sh. Without it the Account page says sync
/// isn't set up and everything else works as before.
struct SyncConfig {
    let clientID: String
    let reversedClientID: String
    let apiKey: String
    let projectID: String
    let bundleID = Bundle.main.bundleIdentifier ?? "com.mac3d.wallpaper"

    static let current: SyncConfig? = {
        let url = ProcessInfo.processInfo.environment["MAC3D_SYNC_CONFIG"].map { URL(fileURLWithPath: $0) }
            ?? Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist")
        guard let url, let dict = NSDictionary(contentsOf: url) as? [String: Any],
              let client = dict["CLIENT_ID"] as? String, let reversed = dict["REVERSED_CLIENT_ID"] as? String,
              let key = dict["API_KEY"] as? String, let project = dict["PROJECT_ID"] as? String,
              !client.isEmpty, !key.isEmpty, !project.isEmpty
        else { return nil }
        return SyncConfig(clientID: client, reversedClientID: reversed, apiKey: key, projectID: project)
    }()
}

struct Profile: Codable, Equatable {
    var uid: String
    var email: String
    var name: String
    var photoURL: String?
}

@MainActor
final class Account: NSObject, ObservableObject {
    enum State: Equatable {
        case unavailable // no GoogleService-Info.plist in this build
        case signedOut
        case signingIn
        case signedIn(Profile)
    }

    @Published private(set) var state: State
    @Published private(set) var lastSync: Date?
    @Published private(set) var syncing = false
    @Published var error: String?

    /// Called with settings that came from the cloud, to apply them to the app.
    var onRemoteSettings: ((SyncedSettings) -> Void)?

    private let config = SyncConfig.current
    private let settings = Settings.shared
    private var session: Session?
    private var idToken: (value: String, expires: Date)?
    private var authSession: ASWebAuthenticationSession?
    private weak var anchor: NSWindow?
    private var pushTask: Task<Void, Never>?
    private var pollTimer: Timer?

    /// The saved sign-in: Firebase refresh token plus who it is.
    private struct Session: Codable {
        var refreshToken: String
        var profile: Profile
    }

    override init() {
        state = config == nil ? .unavailable : .signedOut
        super.init()
        if config != nil, let saved = Self.loadSession() {
            session = saved
            state = .signedIn(saved.profile)
        }
        NotificationCenter.default.addObserver(forName: .syncedSettingsChanged, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { self.schedulePush() }
        }
    }

    var isSignedIn: Bool { if case .signedIn = state { true } else { false } }

    /// At launch: fetch what changed on other Macs, then keep checking.
    func start() {
        guard isSignedIn else { return }
        Task { await pull(firstTime: false) }
        let timer = Timer(timeInterval: 15 * 60, repeats: true) { _ in
            MainActor.assumeIsolated { _ = Task { await self.pull(firstTime: false) } }
        }
        RunLoop.main.add(timer, forMode: .common)
        pollTimer = timer
    }

    // MARK: Sign in / out

    func signIn(from window: NSWindow?) {
        guard let config, !isSignedIn, state != .signingIn else { return }
        anchor = window
        error = nil
        state = .signingIn
        Task {
            do {
                let google = try await googleIDToken(config)
                let signed = try await firebaseSignIn(config, googleIDToken: google)
                session = signed
                Self.saveSession(signed)
                state = .signedIn(signed.profile)
                await pull(firstTime: true)
                start()
            } catch {
                state = .signedOut
                if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                    self.error = Self.describe(error)
                }
            }
        }
    }

    func signOut() {
        pushTask?.cancel()
        pollTimer?.invalidate()
        session = nil
        idToken = nil
        lastSync = nil
        Self.saveSession(nil)
        state = config == nil ? .unavailable : .signedOut
    }

    func syncNow() {
        Task { await pull(firstTime: false) }
    }

    /// The web sign-in sheet: Google's consent page, then back to the app with a code.
    private func googleIDToken(_ config: SyncConfig) async throws -> String {
        let verifier = Self.randomURLSafe(32)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let state = Self.randomURLSafe(16)
        let redirect = "\(config.reversedClientID):/oauth2redirect"
        var auth = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        auth.queryItems = [
            .init(name: "client_id", value: config.clientID),
            .init(name: "redirect_uri", value: redirect),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "openid email profile"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
            .init(name: "prompt", value: "select_account"),
        ]
        let callback: URL = try await withCheckedThrowingContinuation { done in
            let session = ASWebAuthenticationSession(url: auth.url!, callbackURLScheme: config.reversedClientID) { url, error in
                if let url { done.resume(returning: url) } else { done.resume(throwing: error ?? SyncError.message("Sign-in didn’t finish.")) }
            }
            session.presentationContextProvider = self
            authSession = session
            if !session.start() { done.resume(throwing: SyncError.message("Couldn’t open the Google sign-in window.")) }
        }
        authSession = nil
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value
        else { throw SyncError.message(items.first(where: { $0.name == "error" })?.value ?? "Google didn’t send a sign-in code.") }

        let token = try await post(form: "https://oauth2.googleapis.com/token", [
            "client_id": config.clientID, "code": code, "code_verifier": verifier,
            "grant_type": "authorization_code", "redirect_uri": redirect,
        ])
        guard let id = token["id_token"] as? String else { throw SyncError.message("Google didn’t return an ID token.") }
        return id
    }

    private func firebaseSignIn(_ config: SyncConfig, googleIDToken: String) async throws -> Session {
        let body: [String: Any] = [
            "postBody": "id_token=\(googleIDToken)&providerId=google.com",
            "requestUri": "http://localhost",
            "returnSecureToken": true,
            "returnIdpCredential": true,
        ]
        let r = try await post(json: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=\(config.apiKey)", body)
        guard let token = r["idToken"] as? String, let refresh = r["refreshToken"] as? String,
              let uid = r["localId"] as? String
        else { throw SyncError.message("Firebase didn’t accept the Google sign-in.") }
        idToken = (token, Date().addingTimeInterval(Double(r["expiresIn"] as? String ?? "3600") ?? 3600))
        let profile = Profile(uid: uid, email: r["email"] as? String ?? "",
                              name: r["displayName"] as? String ?? r["fullName"] as? String ?? "",
                              photoURL: r["photoUrl"] as? String)
        return Session(refreshToken: refresh, profile: profile)
    }

    /// A fresh Firebase ID token (they last an hour).
    private func bearer() async throws -> String {
        if let t = idToken, t.expires.timeIntervalSinceNow > 60 { return t.value }
        guard let config, var session else { throw SyncError.message("Not signed in.") }
        let r = try await post(form: "https://securetoken.googleapis.com/v1/token?key=\(config.apiKey)", [
            "grant_type": "refresh_token", "refresh_token": session.refreshToken,
        ])
        guard let token = r["id_token"] as? String else { throw SyncError.signedOutElsewhere }
        if let refresh = r["refresh_token"] as? String, refresh != session.refreshToken {
            session.refreshToken = refresh
            self.session = session
            Self.saveSession(session)
        }
        idToken = (token, Date().addingTimeInterval(Double(r["expires_in"] as? String ?? "3600") ?? 3600))
        return token
    }

    // MARK: Sync

    private var documentURL: URL? {
        guard let config, case let .signedIn(profile) = state else { return nil }
        return URL(string: "https://firestore.googleapis.com/v1/projects/\(config.projectID)/databases/(default)/documents/users/\(profile.uid)")
    }

    /// Bring this Mac up to date. On the first sign-in the cloud copy wins (so a
    /// new Mac gets your settings); after that the newest change wins.
    private func pull(firstTime: Bool) async {
        guard let url = documentURL else { return }
        syncing = true
        defer { syncing = false }
        do {
            var request = URLRequest(url: url)
            request.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
            let (data, status) = try await send(request)
            if status == 404 {
                try await push()
                return
            }
            guard status == 200, let doc = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let remote = Self.decode(doc["fields"] as? [String: Any] ?? [:])
            else { throw SyncError.http(status, data) }
            let local = settings.synced
            if firstTime || remote.modifiedAt > local.modifiedAt {
                if remote != local { onRemoteSettings?(remote) }
            } else if local.modifiedAt > remote.modifiedAt {
                try await push()
                return
            }
            lastSync = Date()
            error = nil
        } catch {
            handle(error)
        }
    }

    private func schedulePush() {
        guard isSignedIn else { return }
        pushTask?.cancel()
        pushTask = Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000) // settle rapid changes
            guard !Task.isCancelled else { return }
            do { try await push() } catch { handle(error) }
        }
    }

    private func push() async throws {
        guard let url = documentURL else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["fields": Self.encode(settings.synced)])
        let (data, status) = try await send(request)
        guard status == 200 else { throw SyncError.http(status, data) }
        lastSync = Date()
        error = nil
    }

    private func handle(_ error: Error) {
        if case SyncError.signedOutElsewhere = error {
            signOut()
            self.error = "You were signed out. Sign in again to keep syncing."
        } else {
            self.error = Self.describe(error)
        }
    }

    // MARK: Firestore fields

    private static func encode(_ s: SyncedSettings) -> [String: Any] {
        [
            "worldID": ["stringValue": s.worldID],
            "rotation": ["stringValue": s.rotation.rawValue],
            "showClock": ["booleanValue": s.showClock],
            "parallax": ["doubleValue": s.parallax],
            "favorites": ["arrayValue": s.favorites.isEmpty ? [:] : ["values": s.favorites.map { ["stringValue": $0] }]],
            "modifiedAt": ["doubleValue": s.modifiedAt],
        ]
    }

    private static func decode(_ f: [String: Any]) -> SyncedSettings? {
        func value(_ key: String) -> [String: Any]? { f[key] as? [String: Any] }
        func number(_ key: String) -> Double? {
            if let d = value(key)?["doubleValue"] as? Double { return d }
            if let s = value(key)?["integerValue"] as? String { return Double(s) }
            return nil
        }
        guard let world = value("worldID")?["stringValue"] as? String else { return nil }
        let favorites = ((value("favorites")?["arrayValue"] as? [String: Any])?["values"] as? [[String: Any]] ?? [])
            .compactMap { $0["stringValue"] as? String }
        return SyncedSettings(
            worldID: world,
            rotation: Rotation(rawValue: value("rotation")?["stringValue"] as? String ?? "") ?? .timeOfDay,
            showClock: value("showClock")?["booleanValue"] as? Bool ?? true,
            parallax: number("parallax") ?? ParallaxLevel.normal.rawValue,
            favorites: favorites,
            modifiedAt: number("modifiedAt") ?? 0
        )
    }

    // MARK: HTTP

    private func send(_ request: URLRequest) async throws -> (Data, Int) {
        var request = request
        request.timeoutInterval = 20
        // Firebase keys made for an Apple app are restricted to its bundle id.
        if let config { request.setValue(config.bundleID, forHTTPHeaderField: "X-Ios-Bundle-Identifier") }
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    private func post(form url: String, _ fields: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        request.httpBody = fields.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&").data(using: .utf8)
        return try await json(request)
    }

    private func post(json url: String, _ body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await json(request)
    }

    private func json(_ request: URLRequest) async throws -> [String: Any] {
        let (data, status) = try await send(request)
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if status == 400, (object["error"] as? String) == "invalid_grant"
            || ((object["error"] as? [String: Any])?["message"] as? String)?.contains("TOKEN_EXPIRED") == true {
            throw SyncError.signedOutElsewhere
        }
        guard (200..<300).contains(status) else { throw SyncError.http(status, data) }
        return object
    }

    // MARK: Saved session (Application Support, readable only by you)

    private static var sessionFile: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("mac3D Wallpaper", isDirectory: true)
        return dir.appendingPathComponent("account.json")
    }

    private static func loadSession() -> Session? {
        guard let data = try? Data(contentsOf: sessionFile) else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    private static func saveSession(_ session: Session?) {
        let file = sessionFile
        guard let session, let data = try? JSONEncoder().encode(session) else {
            try? FileManager.default.removeItem(at: file)
            return
        }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }

    // MARK: Helpers

    private static func randomURLSafe(_ bytes: Int) -> String {
        var data = Data(count: bytes)
        _ = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        return data.base64URL
    }

    private static func describe(_ error: Error) -> String {
        switch error {
        case let SyncError.message(text): return text
        case let SyncError.http(status, data):
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = (object?["error"] as? [String: Any])?["message"] as? String
                ?? object?["error_description"] as? String ?? object?["error"] as? String
            if status == 403 { return "Sync was refused (403). Check the Firestore rules in the Firebase console." }
            return "Sync failed (\(status))\(message.map { ": \($0)" } ?? ".")"
        case SyncError.signedOutElsewhere: return "You were signed out. Sign in again to keep syncing."
        default:
            if (error as? URLError)?.code == .notConnectedToInternet { return "You’re offline — settings will sync when you’re back online." }
            return error.localizedDescription
        }
    }
}

extension Account: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { anchor ?? NSApp.keyWindow ?? NSWindow() }
    }
}

enum SyncError: Error {
    case message(String)
    case http(Int, Data)
    case signedOutElsewhere
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
