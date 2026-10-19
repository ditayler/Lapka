// Render the existing code-native paw favicon at macOS icon sizes.
import AppKit

let html = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
let icon = html.components(separatedBy: "data:image/svg+xml,")[1].components(separatedBy: "\">")[0].removingPercentEncoding!
let pattern = try NSRegularExpression(pattern: "M([0-9.]+) ([0-9.]+)h([0-9.]+)v([0-9.]+)")
let matches = pattern.matches(in: icon, range: NSRange(icon.startIndex..., in: icon))
let folder = URL(fileURLWithPath: CommandLine.arguments[2])
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for factor in [1, 2] {
        let pixels = size * factor
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let context = NSGraphicsContext.current!.cgContext
        context.scaleBy(x: CGFloat(pixels) / 32, y: CGFloat(pixels) / 32)
        context.translateBy(x: 0, y: 32)
        context.scaleBy(x: 1, y: -1)
        NSColor(calibratedRed: 11/255, green: 11/255, blue: 12/255, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 1, y: 1, width: 30, height: 30), xRadius: 6.5, yRadius: 6.5).fill()
        NSColor.white.setFill()
        context.setShouldAntialias(false)
        for match in matches {
            let values = (1...4).map { Double((icon as NSString).substring(with: match.range(at: $0)))! }
            NSBezierPath(rect: NSRect(x: values[0], y: values[1], width: values[2], height: values[3])).fill()
        }
        NSGraphicsContext.restoreGraphicsState()
        let name = "icon_\(size)x\(size)" + (factor == 2 ? "@2x" : "") + ".png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: folder.appendingPathComponent(name))
    }
}
