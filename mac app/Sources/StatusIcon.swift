import AppKit

/// The landing page's layered logo (a plane over two stacked chevrons) as a
/// template image, so the menu bar tints it for light and dark mode.
enum StatusIcon {
    static let image: NSImage = {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { rect in
            let s = rect.width / 32
            let p = { (x: CGFloat, y: CGFloat) in NSPoint(x: x * s, y: y * s) }

            let top = NSBezierPath()
            top.move(to: p(16, 3.5))
            top.line(to: p(28.5, 10))
            top.line(to: p(16, 16.5))
            top.line(to: p(3.5, 10))
            top.close()
            NSColor.black.setFill()
            top.fill()

            for (y, alpha) in [(15.8, 1.0), (21.6, 0.5)] as [(CGFloat, CGFloat)] {
                let chevron = NSBezierPath()
                chevron.move(to: p(3.5, y))
                chevron.line(to: p(16, y + 6.5))
                chevron.line(to: p(28.5, y))
                chevron.lineWidth = 2.6 * s
                chevron.lineJoinStyle = .round
                chevron.lineCapStyle = .round
                NSColor.black.withAlphaComponent(alpha).setStroke()
                chevron.stroke()
            }
            return true
        }
        img.isTemplate = true
        return img
    }()
}
