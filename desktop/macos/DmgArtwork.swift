// Code-native installer artwork, using the app's existing icon and system fonts.
import AppKit

let icon = NSImage(contentsOfFile: CommandLine.arguments[1])!
let version = CommandLine.arguments[2]
let architecture = CommandLine.arguments[3] == "arm64" ? "Apple Silicon" : "Intel"
let output = URL(fileURLWithPath: CommandLine.arguments[4])
// Finder does not stretch picture backgrounds when it inherits a larger window
// or opens a tab. Extend the dark canvas through a 4K-sized window while keeping
// the install controls in the initial 720 × 440 point viewport.
let width = 4096, height = 2304
func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> NSRect {
    NSRect(x: x, y: CGFloat(height) - y - h, width: w, height: h)
}
func gray(_ value: CGFloat, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(calibratedWhite: value, alpha: alpha)
}
func text(_ value: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat,
          _ color: NSColor, _ weight: NSFont.Weight = .regular) {
    (value as NSString).draw(at: rect(x, y, 0, size + 6).origin, withAttributes: [
        .font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color,
    ])
}

for scale in [1, 2] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width * scale,
        pixelsHigh: height * scale, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    bitmap.size = NSSize(width: width, height: height)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    gray(0.045).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
    NSGradient(starting: gray(0.095), ending: gray(0.045))!.draw(
        in: rect(0, 0, CGFloat(width), 440), angle: -90)

    icon.draw(in: rect(40, 34, 36, 36))
    text("Lapka", 88, 34, 28, gray(0.96), .semibold)
    text("Drag Lapka into Applications", 40, 91, 18, gray(0.68))

    for x: CGFloat in [112, 432] {
        let card = NSBezierPath(roundedRect: rect(x, 156, 176, 184), xRadius: 24, yRadius: 24)
        gray(1, 0.035).setFill()
        card.fill()
        gray(1, 0.055).setStroke()
        card.lineWidth = 1
        card.stroke()
        // Finder uses dark filename text on picture backgrounds. Keep native
        // labels readable in light and dark system appearances.
        gray(0.78).setFill()
        NSBezierPath(roundedRect: rect(x + 22, 293, 132, 26), xRadius: 13, yRadius: 13).fill()
    }
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 333, y: height - 231))
    arrow.line(to: NSPoint(x: 385, y: height - 231))
    arrow.move(to: NSPoint(x: 374, y: height - 220))
    arrow.line(to: NSPoint(x: 385, y: height - 231))
    arrow.line(to: NSPoint(x: 374, y: height - 242))
    arrow.lineWidth = 2
    arrow.lineCapStyle = .round
    arrow.lineJoinStyle = .round
    gray(0.55).setStroke()
    arrow.stroke()

    gray(1, 0.09).setFill()
    NSBezierPath(rect: rect(40, 370, 640, 1)).fill()
    text("Then open Lapka from Applications.", 40, 394, 13, gray(0.55))
    let detail = "\(version) · \(architecture)"
    let detailWidth = (detail as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 12)]).width
    text(detail, 680 - detailWidth, 395, 12, gray(0.42))

    NSGraphicsContext.restoreGraphicsState()
    let name = scale == 1 ? "background.png" : "background@2x.png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
}
