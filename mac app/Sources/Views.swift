import SwiftUI

/// Brand pink, from the app icon.
let brand = Color(red: 0.84, green: 0.24, blue: 0.53)

struct RootView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Group {
            if model.onboarding {
                OnboardingView(model: model, account: model.account)
            } else {
                SettingsView(model: model)
            }
        }
        .tint(brand)
        .frame(minWidth: 820, minHeight: 580)
    }
}

// MARK: - Settings window

struct SettingsView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        HStack(spacing: 0) {
            Sidebar(model: model, account: model.account)
            Divider()
            Group {
                switch model.page {
                case .wallpaper: WallpaperPage(model: model)
                case .motion: MotionPage(model: model)
                case .general: GeneralPage(model: model)
                case .account: AccountPage(account: model.account, compact: false)
                case .about: AboutPage(model: model)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

/// The window's sidebar (plain SwiftUI rather than a system List, so it looks
/// the same everywhere and can be rendered by --render-ui).
struct Sidebar: View {
    @ObservedObject var model: AppModel
    @ObservedObject var account: Account

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 10) {
                Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 30, height: 30)
                VStack(alignment: .leading, spacing: 0) {
                    Text("mac3D").font(.system(size: 14, weight: .bold))
                    Text("Wallpaper").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 8).padding(.bottom, 16)
            ForEach(AppModel.Page.allCases) { page in
                let on = model.page == page
                Button { model.page = page } label: {
                    Label(page.title, systemImage: page.symbol)
                        .font(.system(size: 13, weight: on ? .semibold : .regular))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .foregroundStyle(on ? brand : .primary)
                        .background(on ? brand.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer()
            if case let .signedIn(profile) = account.state {
                HStack(spacing: 8) {
                    Avatar(profile: profile).frame(width: 24, height: 24)
                    Text(profile.name.isEmpty ? profile.email : profile.name).font(.caption).lineLimit(1)
                }
                .padding(.horizontal, 8)
            }
        }
        .padding(.top, 50).padding(.horizontal, 12).padding(.bottom, 16)
        .frame(width: 214)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.primary.opacity(0.035))
    }
}

/// A page's title, below the window's traffic lights.
struct PageTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 24, weight: .bold))
            .padding(.horizontal, 28).padding(.top, 46).padding(.bottom, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct WallpaperPage: View {
    @ObservedObject var model: AppModel

    private let groups: [(kind: String, title: String, note: String)] = [
        ("gpu", "Ultra-real", "Drawn live on your GPU"),
        ("classic", "Worlds", "Hand-built layered scenes"),
        ("new", "New · alive", "Scenes with moving life"),
    ]

    var body: some View {
        ScrollView {
            PageTitle(text: "Wallpaper")
            VStack(alignment: .leading, spacing: 26) {
                NowShowing(model: model)
                if model.worlds.isEmpty {
                    HStack(spacing: 10) {
                        ProgressView().controlSize(.small)
                        Text("Loading worlds…").foregroundStyle(.secondary)
                    }
                }
                ForEach(groups, id: \.kind) { group in
                    let list = model.worlds.filter { $0.kind == group.kind }
                    if !list.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(group.title).font(.title3.weight(.semibold))
                                Text(group.note).font(.callout).foregroundStyle(.secondary)
                            }
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 158, maximum: 240), spacing: 16)], spacing: 18) {
                                ForEach(list) { world in
                                    WorldTile(model: model, world: world, selected: world.id == model.shownWorld)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 28).padding(.top, 10).padding(.bottom, 28)
        }
    }
}

struct NowShowing: View {
    @ObservedObject var model: AppModel

    var body: some View {
        HStack(alignment: .top, spacing: 24) {
            Thumb(id: model.shownWorld)
                .frame(width: 300, height: 188)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.12)))
                .shadow(color: .black.opacity(0.25), radius: 14, y: 8)
            VStack(alignment: .leading, spacing: 10) {
                Text("ON YOUR DESKTOP").font(.caption.weight(.semibold)).foregroundStyle(.secondary).tracking(0.6)
                Text(model.shownInfo?.name ?? "—").font(.system(size: 26, weight: .bold))
                if let tag = model.shownInfo?.tag { Text(tag).foregroundStyle(.secondary) }
                Spacer(minLength: 6)
                Text("Changes automatically").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Picker("Changes automatically", selection: Binding(get: { model.rotation }, set: { model.rotation = $0 })) {
                    ForEach(Rotation.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .fixedSize()
                Text(model.rotation.detail).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button { model.nextWorld() } label: { Label("Next world", systemImage: "forward.fill") }
                    Button { model.paused.toggle() } label: {
                        Label(model.paused ? "Resume motion" : "Pause motion", systemImage: model.paused ? "play.fill" : "pause.fill")
                    }
                }
                .controlSize(.large)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WorldTile: View {
    @ObservedObject var model: AppModel
    let world: WorldInfo
    let selected: Bool
    // (This toolchain has no @State, so hover lives in the model.)
    private var hover: Bool { model.hovered == world.id }
    private var favorite: Bool { model.isFavorite(world.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ZStack(alignment: .topTrailing) {
                Thumb(id: world.id)
                    .aspectRatio(16 / 10, contentMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(selected ? brand : .white.opacity(hover ? 0.35 : 0.1), lineWidth: selected ? 3 : 1)
                    )
                    .overlay(alignment: .bottomLeading) {
                        if selected {
                            Label("On desktop", systemImage: "checkmark.circle.fill")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(.ultraThinMaterial, in: Capsule())
                                .padding(8)
                        }
                    }
                    .scaleEffect(hover ? 1.025 : 1)
                    .shadow(color: .black.opacity(hover ? 0.28 : 0.12), radius: hover ? 10 : 4, y: hover ? 6 : 2)
                Button { model.toggleFavorite(world.id) } label: {
                    Image(systemName: favorite ? "heart.fill" : "heart")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(favorite ? brand : .white)
                        .frame(width: 26, height: 26)
                        .background(.black.opacity(0.35), in: Circle())
                }
                .buttonStyle(.plain)
                .padding(7)
                .opacity(favorite || hover ? 1 : 0)
                .help(favorite ? "Remove from favourites" : "Add to favourites")
            }
            Text(world.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Text(world.tag).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        .contentShape(Rectangle())
        .onTapGesture { model.pick(world.id) }
        .onHover { h in
            withAnimation(.easeOut(duration: 0.15)) {
                if h { model.hovered = world.id } else if model.hovered == world.id { model.hovered = nil }
            }
        }
        .help("Put \(world.name) on your desktop")
    }
}

struct Thumb: View {
    let id: String
    var body: some View {
        if let img = Thumbs.image(id) {
            Image(nsImage: img).resizable().aspectRatio(contentMode: .fill)
        } else {
            LinearGradient(colors: [Color(red: 1, green: 0.6, blue: 0.37), Color(red: 0.64, green: 0.18, blue: 0.5),
                                    Color(red: 0.11, green: 0.06, blue: 0.21)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

struct MotionPage: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
        PageTitle(text: "Motion & Clock")
        Form {
            Section {
                Toggle("Depth Clock", isOn: Binding(get: { model.showClock }, set: { model.showClock = $0 }))
                Picker("Parallax", selection: Binding(get: { model.parallax }, set: { model.parallax = $0 })) {
                    ForEach(ParallaxLevel.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("The clock sits between the world’s layers. Parallax sets how much the world moves with your cursor.")
            }
            Section {
                Toggle("Pause animations", isOn: Binding(get: { model.paused }, set: { model.paused = $0 }))
            } footer: {
                Text(model.lowPower
                     ? "Paused while Low Power Mode is on."
                     : "mac3D also rests by itself whenever windows cover the desktop, the screen is locked, or Low Power Mode is on. With Reduce Motion on, the world holds still.")
            }
        }
        .formStyle(.grouped)
        }
    }
}

struct GeneralPage: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
        PageTitle(text: "General")
        Form {
            Section {
                Toggle("Open at login", isOn: Binding(get: { model.openAtLogin }, set: { model.openAtLogin = $0 }))
                Toggle("Show icon in the menu bar", isOn: Binding(get: { model.showMenuBarIcon }, set: { model.showMenuBarIcon = $0 }))
            } footer: {
                Text("Closing this window keeps your wallpaper running. Open mac3D Wallpaper again from Launchpad, Spotlight or the menu bar to come back here.")
            }
            Section {
                Button("Show the welcome setup again") { model.showSetupAgain() }
                Button("Quit mac3D Wallpaper", role: .destructive) { NSApp.terminate(nil) }
            }
        }
        .formStyle(.grouped)
        }
    }
}

struct AccountPage: View {
    @ObservedObject var account: Account
    let compact: Bool

    var body: some View {
        VStack(spacing: compact ? 12 : 16) {
            switch account.state {
            case .unavailable:
                header("icloud.slash", "Sync isn’t set up in this version",
                       "Your settings are saved on this Mac. Google sign-in arrives in an update.")
            case .signedOut, .signingIn:
                header("arrow.triangle.2.circlepath.icloud", "Sync your settings",
                       "Sign in with Google and your world, auto-change, favourites, clock and parallax follow you to every Mac.")
                Button { account.signIn(from: NSApp.keyWindow) } label: {
                    HStack(spacing: 8) {
                        if account.state == .signingIn { ProgressView().controlSize(.small) } else { Image(systemName: "person.crop.circle") }
                        Text(account.state == .signingIn ? "Waiting for Google…" : "Sign in with Google")
                    }
                    .frame(minWidth: 220)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(account.state == .signingIn)
                Text("Only your mac3D settings are stored — nothing from your files, browser or Google account besides your name and email.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 380)
            case let .signedIn(profile):
                Avatar(profile: profile).frame(width: compact ? 52 : 72, height: compact ? 52 : 72)
                VStack(spacing: 3) {
                    Text(profile.name.isEmpty ? profile.email : profile.name).font(.title3.weight(.semibold))
                    if !profile.name.isEmpty { Text(profile.email).foregroundStyle(.secondary) }
                }
                Label(account.syncing ? "Syncing…" : account.lastSync.map { "Synced \(Self.relative($0))" } ?? "Signed in — settings sync across your Macs",
                      systemImage: account.syncing ? "arrow.triangle.2.circlepath" : "checkmark.icloud")
                    .foregroundStyle(.secondary)
                HStack {
                    Button("Sync now") { account.syncNow() }.disabled(account.syncing)
                    Button("Sign out") { account.signOut() }
                }
                .controlSize(.large)
            }
            if let error = account.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.callout).foregroundStyle(.red).multilineTextAlignment(.center).frame(maxWidth: 420)
            }
        }
        .padding(compact ? 0 : 40)
        .frame(maxWidth: .infinity, maxHeight: compact ? nil : .infinity)
    }

    @ViewBuilder private func header(_ symbol: String, _ title: String, _ text: String) -> some View {
        Image(systemName: symbol).font(.system(size: compact ? 30 : 44, weight: .light)).foregroundStyle(brand)
        Text(title).font(compact ? .headline : .title2.weight(.semibold))
        Text(text).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 420)
    }

    static func relative(_ date: Date) -> String {
        if -date.timeIntervalSinceNow < 60 { return "just now" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}

struct Avatar: View {
    let profile: Profile
    var body: some View {
        ZStack {
            Circle().fill(LinearGradient(colors: [brand, Color(red: 0.36, green: 0.13, blue: 0.5)], startPoint: .top, endPoint: .bottom))
            Text(String((profile.name.isEmpty ? profile.email : profile.name).prefix(1)).uppercased())
                .font(.system(size: 28, weight: .semibold)).foregroundStyle(.white)
            if let photo = profile.photoURL, let url = URL(string: photo) {
                AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                    .clipShape(Circle())
            }
        }
    }
}

struct AboutPage: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(spacing: 14) {
            Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 112, height: 112)
            Text("mac3D Wallpaper").font(.title.weight(.bold))
            Text("Version \(model.version)").foregroundStyle(.secondary)
            Text("Layered, living worlds for your desktop — they follow your cursor and keep time.")
                .multilineTextAlignment(.center).frame(maxWidth: 380)
            HStack {
                Link("mac3dwallpaper.com", destination: URL(string: "https://mac3dwallpaper.com")!)
                Text("·").foregroundStyle(.secondary)
                Link("Privacy", destination: URL(string: "https://mac3dwallpaper.com/#privacy")!)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - First launch

struct OnboardingView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var account: Account
    private var step: Int { model.setupStep }

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch step {
                case 0: welcome
                case 1: choose
                default: personalise
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)

            Divider()
            HStack {
                HStack(spacing: 7) {
                    ForEach(0..<3) { i in
                        Circle().fill(i == step ? brand : Color.secondary.opacity(0.35)).frame(width: 7, height: 7)
                    }
                }
                Spacer()
                if step > 0 { Button("Back") { withAnimation { model.setupStep -= 1 } }.controlSize(.large) }
                Button(step == 2 ? "Start using mac3D" : "Continue") {
                    if step == 2 { model.finishOnboarding() } else { withAnimation { model.setupStep += 1 } }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 28).padding(.vertical, 16)
        }
    }

    private var welcome: some View {
        VStack(spacing: 18) {
            Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 128, height: 128)
                .shadow(color: brand.opacity(0.35), radius: 24, y: 10)
            Text("Welcome to mac3D Wallpaper").font(.system(size: 30, weight: .bold))
            Text("Living 3D worlds for your desktop.").font(.title3).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 14) {
                feature("cursorarrow.motionlines", "Follows your cursor", "Every world is built from layers that shift as you move.")
                feature("clock", "Keeps time", "The Depth Clock sits inside the scene, and worlds can change with the hour.")
                feature("leaf", "Light on your Mac", "It rests whenever windows cover the desktop or Low Power Mode is on.")
            }
            .padding(.top, 10)
            .frame(maxWidth: 440)
        }
        .padding(40)
    }

    private func feature(_ symbol: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol).font(.system(size: 20)).foregroundStyle(brand).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(text).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var choose: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Choose your wallpaper").font(.system(size: 26, weight: .bold))
                Text("Pick a world, or let it change with the time of day. You can change this any time.").foregroundStyle(.secondary)
            }
            .padding(.horizontal, 28).padding(.top, 26)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    let auto = model.rotation == .timeOfDay
                    Button { model.rotation = .timeOfDay } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "sun.and.horizon.fill").font(.system(size: 24)).foregroundStyle(brand)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Match the time of day").font(.headline)
                                Text("Sunrise peaks in the morning, golden dunes later, city lights at night.").foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: auto ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(auto ? brand : .secondary)
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.05)))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(auto ? brand : .clear, lineWidth: 2))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140, maximum: 200), spacing: 14)], spacing: 14) {
                        ForEach(model.worlds) { world in
                            WorldTile(model: model, world: world, selected: !auto && world.id == model.shownWorld)
                        }
                    }
                }
                .padding(.horizontal, 28).padding(.bottom, 20)
            }
        }
    }

    private var personalise: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Make it yours").font(.system(size: 26, weight: .bold))
                Text("A few choices — all of them live in Settings later.").foregroundStyle(.secondary)
            }
            Form {
                Section {
                    Toggle("Open at login", isOn: Binding(get: { model.setupOpenAtLogin }, set: { model.setupOpenAtLogin = $0 }))
                    Toggle("Depth Clock", isOn: Binding(get: { model.showClock }, set: { model.showClock = $0 }))
                    Picker("Parallax", selection: Binding(get: { model.parallax }, set: { model.parallax = $0 })) {
                        ForEach(ParallaxLevel.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                if account.state != .unavailable {
                    Section("Sync across your Macs (optional)") {
                        AccountPage(account: account, compact: true).padding(.vertical, 10)
                    }
                }
            }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
            HStack(spacing: 14) {
                Image(nsImage: StatusIcon.image).renderingMode(.template).resizable().frame(width: 22, height: 22)
                    .padding(9).background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Find mac3D any time").font(.headline)
                    Text("It lives in your menu bar. You can also open it from Launchpad or Spotlight — this window comes right back.")
                        .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, 18)
        }
        .padding(.horizontal, 28).padding(.top, 26)
    }
}
