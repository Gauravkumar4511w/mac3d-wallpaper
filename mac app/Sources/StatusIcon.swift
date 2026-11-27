import AppKit

/// The brand mark (landing page/public/icon.svg) as a menu bar template image,
/// so the menu bar tints it for light and dark mode: the snow-capped peak with
/// the low sun behind its right shoulder and a ridge in front. A thin gap is cut
/// around each shape so they read apart, and a zigzag gap marks the snow line.
enum StatusIcon {
    static let image: NSImage = {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { rect in
            // Drawn on an 18-unit grid (y down), scaled to the image size.
            let s = rect.width / 18
            let p = { (x: CGFloat, y: CGFloat) in NSPoint(x: x * s, y: y * s) }
            func poly(_ pts: [(CGFloat, CGFloat)]) -> NSBezierPath {
                let path = NSBezierPath()
                path.move(to: p(pts[0].0, pts[0].1))
                for pt in pts.dropFirst() { path.line(to: p(pt.0, pt.1)) }
                path.close()
                path.lineJoinStyle = .round
                return path
            }
            let context = NSGraphicsContext.current
            func cut(_ path: NSBezierPath, _ width: CGFloat) {
                context?.compositingOperation = .clear
                path.lineWidth = width * s
                path.stroke()
                path.fill()
                context?.compositingOperation = .sourceOver
            }
            let ink = NSColor.black

            // the sun, low behind the peak's right shoulder
            ink.withAlphaComponent(0.6).setFill()
            NSBezierPath(ovalIn: NSRect(x: 10.0 * s, y: 4.0 * s, width: 6.8 * s, height: 6.8 * s)).fill()

            // the peak: summit, a small dip and shoulder, then the long right slope
            let peak = poly([(0.8, 15.6), (7.4, 2.6), (9.4, 6.0), (10.5, 5.1), (17.2, 15.6)])
            cut(peak, 2.0)
            ink.setFill()
            peak.fill()

            // the snow line: a zigzag gap across the upper slopes
            NSGraphicsContext.saveGraphicsState()
            peak.addClip()
            let snow = NSBezierPath()
            let zig: [(CGFloat, CGFloat)] = [(3.8, 8.2), (5.3, 7.2), (6.4, 8.1), (7.6, 7.0), (8.8, 8.1),
                                             (10.0, 7.1), (11.2, 8.0), (12.4, 7.4)]
            snow.move(to: p(zig[0].0, zig[0].1))
            for pt in zig.dropFirst() { snow.line(to: p(pt.0, pt.1)) }
            snow.lineJoinStyle = .miter
            context?.compositingOperation = .clear
            snow.lineWidth = 1.0 * s
            snow.stroke()
            context?.compositingOperation = .sourceOver
            NSGraphicsContext.restoreGraphicsState()

            // a rolling ridge in front, hiding the peak's base
            let ridge = NSBezierPath()
            ridge.move(to: p(-1, 14.4))
            ridge.curve(to: p(8.6, 15.0), controlPoint1: p(2.4, 13.2), controlPoint2: p(5.6, 15.2))
            ridge.curve(to: p(19, 14.0), controlPoint1: p(12.0, 14.8), controlPoint2: p(15.0, 12.9))
            ridge.line(to: p(19, 16.6))
            ridge.line(to: p(-1, 16.6))
            ridge.close()
            NSGraphicsContext.saveGraphicsState()
            NSBezierPath(rect: rect).addClip()
            cut(ridge, 1.8)
            ink.setFill()
            ridge.fill()
            NSGraphicsContext.restoreGraphicsState()
            return true
        }
        img.isTemplate = true
        return img
    }()
}
