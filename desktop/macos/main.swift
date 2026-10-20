import AppKit

let app = NSApplication.shared
let identifier = Bundle.main.bundleIdentifier ?? "org.mythhand.lapka"
if let existing = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
    existing.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    exit(0)
}
let env = ProcessInfo.processInfo.environment
let fm = FileManager.default
let data = env["LAPKA_DATA_DIR"].map { URL(fileURLWithPath: $0) } ?? fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Lapka")
let logs = env["LAPKA_DATA_DIR"] != nil ? data.appendingPathComponent("logs") : fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Lapka")
let port = Int(env["LAPKA_DESKTOP_PORT"] ?? "18800") ?? -1
let delegate = AppDelegate(resources: Bundle.main.resourceURL!, dataDirectory: data, logDirectory: logs, port: port)
app.setActivationPolicy(.regular)
app.delegate = delegate
app.run()
