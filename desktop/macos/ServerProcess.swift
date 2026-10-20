import Foundation
import Darwin

/// Owns exactly one bundled server. stdin EOF also protects against a crashed parent.
final class ServerProcess {
    private let resources: URL
    private let dataDirectory: URL
    let logURL: URL
    private let port: Int
    private var process: Process?
    private var input: Pipe?
    private var output: Pipe?
    private var log: FileHandle?
    private var pending = Data()
    private var readyTimer: DispatchWorkItem?
    private var stopCallbacks: [() -> Void] = []
    private var stopping = false
    private(set) var baseURL: URL?
    var isRunning: Bool { process?.isRunning == true }
    var pid: Int32? { process?.processIdentifier }

    init(resources: URL, dataDirectory: URL, logDirectory: URL, port: Int) {
        self.resources = resources
        self.dataDirectory = dataDirectory
        self.logURL = logDirectory.appendingPathComponent("server.log")
        self.port = port
    }

    func start(onReady: @escaping (URL) -> Void, onExit: @escaping (Int32) -> Void, onFailure: @escaping (String) -> Void) throws {
        let fm = FileManager.default
        let runtime = resources.appendingPathComponent("runtime/bin/node")
        let app = resources.appendingPathComponent("app")
        guard fm.isExecutableFile(atPath: runtime.path), fm.fileExists(atPath: app.appendingPathComponent("core/desktop.mjs").path) else {
            throw NSError(domain: "Lapka", code: 1, userInfo: [NSLocalizedDescriptionKey: "The application bundle is incomplete. Rebuild or reinstall Lapka."])
        }
        try fm.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        try fm.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !fm.fileExists(atPath: logURL.path) { fm.createFile(atPath: logURL.path, contents: nil) }
        let file = try FileHandle(forWritingTo: logURL)
        file.seekToEndOfFile()
        log = file
        let child = Process(), stdin = Pipe(), stdout = Pipe()
        child.executableURL = runtime
        child.arguments = [app.appendingPathComponent("core/desktop.mjs").path]
        child.currentDirectoryURL = app
        var env = ProcessInfo.processInfo.environment
        // A packaged application must not inherit module injection from a developer shell.
        for key in ["NODE_OPTIONS", "NODE_PATH", "NODE_TEST_CONTEXT"] { env.removeValue(forKey: key) }
        env["PATH"] = resources.appendingPathComponent("runtime/bin").path + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["LAPKA_DATA_DIR"] = dataDirectory.path
        env["LAPKA_DESKTOP_PORT"] = String(port)
        child.environment = env
        child.standardInput = stdin
        child.standardOutput = stdout
        child.standardError = file
        input = stdin; output = stdout; process = child
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes = handle.availableData
            if bytes.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.log?.write(bytes)
                self.pending.append(bytes)
                if self.pending.count > 65536 { self.stop {}; onFailure("Invalid server startup response."); return }
                while let newline = self.pending.firstIndex(of: 10) {
                    let line = self.pending.prefix(upTo: newline)
                    self.pending.removeSubrange(...newline)
                    guard self.baseURL == nil,
                          let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
                          event["type"] as? String == "lapka-ready",
                          let text = event["url"] as? String,
                          let url = URL(string: text), url.scheme == "http", url.host == "127.0.0.1",
                          let port = url.port, (1...65535).contains(port),
                          event["pid"] as? Int32 == child.processIdentifier else { continue }
                    self.baseURL = url
                    self.readyTimer?.cancel()
                    onReady(url)
                }
            }
        }
        child.terminationHandler = { [weak self] ended in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.readyTimer?.cancel()
                self.input?.fileHandleForWriting.closeFile()
                self.output?.fileHandleForReading.readabilityHandler = nil
                self.log?.closeFile(); self.log = nil
                let callbacks = self.stopCallbacks
                self.stopCallbacks.removeAll()
                for callback in callbacks { callback() }
                onExit(ended.terminationStatus)
            }
        }
        try child.run()
        let timeout = DispatchWorkItem { [weak self] in
            guard let self = self, self.baseURL == nil, !self.stopping else { return }
            self.stop {}
            onFailure("The local server did not start within 15 seconds.")
        }
        readyTimer = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
    }

    func stop(_ completion: @escaping () -> Void) {
        guard let child = process, child.isRunning else { completion(); return }
        stopCallbacks.append(completion)
        guard !stopping else { return }
        stopping = true
        readyTimer?.cancel()
        input?.fileHandleForWriting.closeFile()
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            guard child.isRunning else { return }
            child.terminate()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                if child.isRunning { Darwin.kill(child.processIdentifier, SIGKILL) }
            }
        }
    }
}
