import AppKit

/// `--self-test <dir> [--worlds id,id]`: shows each world in turn, saves a PNG
/// of the main display's wallpaper to <dir>/<id>.png, then quits. Used to check
/// every world renders in the app's WebKit (not just in Chrome).
@MainActor
enum SelfTest {
    static func runIfRequested(app: AppDelegate) {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--self-test"), i + 1 < args.count else { return }
        let dir = URL(fileURLWithPath: args[i + 1], isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var only: [String]?
        if let j = args.firstIndex(of: "--worlds"), j + 1 < args.count {
            only = args[j + 1].split(separator: ",").map(String.init)
        }
        // Give the first page time to load and report its world list.
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            MainActor.assumeIsolated {
                let ids = only ?? app.worldIDs
                print("[self-test] " + app.describeMenu())
                print("[self-test] \(ids.count) worlds → \(dir.path)")
                step(app: app, ids: ids, dir: dir, index: 0)
            }
        }
    }

    /// What the page reports about itself: animations running, and for GPU
    /// worlds whether WebGL2 is up and the shader compiled.
    private static let probe = """
    let frames = 0;
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => { frames++; performance.now() - t0 < 1000 ? requestAnimationFrame(tick) : done(); };
      requestAnimationFrame(tick);
      setTimeout(done, 1500);
    });
    const c = document.querySelector('.scene canvas');
    const err = document.querySelector('[data-shader-error]');
    return JSON.stringify({
      fps: frames,
      visibility: document.visibilityState,
      running: document.getAnimations().filter(a => a.playState === 'running').length,
      paused: document.querySelectorAll('[data-paused]').length,
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
      canvas: c ? c.width + 'x' + c.height : null,
      shaderError: err ? err.title : null,
    });
    """

    private static func step(app: AppDelegate, ids: [String], dir: URL, index: Int) {
        guard index < ids.count else {
            print("[self-test] done")
            NSApp.terminate(nil)
            return
        }
        let id = ids[index]
        app.showWorld(id)
        // load + 1.1 s cross-fade + a moment of animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
            MainActor.assumeIsolated {
                guard let wall = app.wallpapers.first else { return }
                wall.snapshot(to: dir.appendingPathComponent("\(id).png")) { ok in
                    wall.inspect(probe) { info in
                        print("[self-test] \(id): \(ok ? "saved" : "FAILED") \(info)")
                        step(app: app, ids: ids, dir: dir, index: index + 1)
                    }
                }
            }
        }
    }
}
