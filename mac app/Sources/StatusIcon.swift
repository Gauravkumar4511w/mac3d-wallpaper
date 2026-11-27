import AppKit

/// The brand mark's three stacked layers (landing page/public/icon.svg) as a
/// template image, so the menu bar tints it for light and dark mode. Each layer
/// is a slab silhouette (top face plus thickness), fainter the further back it
/// sits, with a thin gap cut around the layer in front so they read apart.
enum StatusIcon {
    static let image: NSImage = {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { rect in
            // icon.svg draws the slabs on a 100-unit tile, x 22…78, y 20…78
            // (centre 50, 49); map that onto the 18 pt square with a margin.
            let s = rect.width / 66
            let p = { (x: CGFloat, y: CGFloat) in NSPoint(x: (x - 17) * s, y: (y - 16) * s) }
            func slab(_ cy: CGFloat) -> NSBezierPath {
                let path = NSBezierPath()
                path.move(to: p(50, cy - 13))
                path.line(to: p(78, cy))
                path.line(to: p(78, cy + 5))
                path.line(to: p(50, cy + 18))
                path.line(to: p(22, cy + 5))
                path.line(to: p(22, cy))
                path.close()
                path.lineJoinStyle = .round
                return path
            }

            let context = NSGraphicsContext.current
            for (i, (cy, alpha)) in ([(60, 0.45), (46.5, 0.72), (33, 1.0)] as [(CGFloat, CGFloat)]).enumerated() {
                let path = slab(cy)
                if i > 0 {
                    context?.compositingOperation = .clear
                    path.lineWidth = 4.5 * s
                    path.stroke()
                    path.fill()
                    context?.compositingOperation = .sourceOver
                }
                NSColor.black.withAlphaComponent(alpha).setFill()
                path.fill()
            }
            return true
        }
        img.isTemplate = true
        return img
    }()
}
