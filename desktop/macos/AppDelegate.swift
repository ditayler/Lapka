import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    let server: ServerProcess
    private let websiteDataStore: WKWebsiteDataStore
    private(set) var window: NSWindow?
    private(set) var webView: WKWebView?
    private var loading: NSTextField?
    private let chrome = WindowChrome()
    private var terminating = false
    private var failed = false

    init(resources: URL, dataDirectory: URL, logDirectory: URL, port: Int, websiteDataStore: WKWebsiteDataStore = .default()) {
        self.server = ServerProcess(resources: resources, dataDirectory: dataDirectory, logDirectory: logDirectory, port: port)
        self.websiteDataStore = websiteDataStore
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        makeMenus()
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Lapka"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        // An empty unified toolbar lets AppKit align its own traffic lights
        // with the player's existing header, without reserving a separate row.
        window.toolbar = NSToolbar(identifier: "LapkaWindow")
        window.toolbarStyle = .unified
        window.delegate = chrome
        window.minSize = NSSize(width: 520, height: 420)
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.center()
        let label = NSTextField(labelWithString: "Starting Lapka…")
        label.textColor = .white
        label.alignment = .center
        label.frame = NSRect(x: 0, y: 385, width: 1280, height: 30)
        label.autoresizingMask = [.width, .minYMargin, .maxYMargin]
        window.contentView?.addSubview(label)
        self.loading = label
        self.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        do {
            try server.start(onReady: { [weak self] url in self?.loadPlayer(url) }, onExit: { [weak self] code in
                guard let self = self, !self.terminating, !self.failed else { return }
                if code == 0 { NSApp.terminate(nil) }
                else { self.showFailure("The local server stopped unexpectedly (exit \(code)).") }
            }, onFailure: { [weak self] message in self?.showFailure(message) })
        } catch { showFailure(error.localizedDescription) }
    }

    private func loadPlayer(_ url: URL) {
        guard let content = window?.contentView else { return }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = websiteDataStore
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.isElementFullscreenEnabled = true
        // WebKit exposes the PiP DOM API on macOS while disabling video PiP
        // for embedders by default. Its public configuration switch is iOS-only.
        // Guard the macOS preference setter so a future WebKit without this
        // optional SPI still launches and reports unsupported PiP normally.
        if config.preferences.responds(to: NSSelectorFromString("_setAllowsPictureInPictureMediaPlayback:")) {
            config.preferences.setValue(true, forKey: "allowsPictureInPictureMediaPlayback")
        }
        chrome.configure(config)
        let view = WKWebView(frame: content.bounds, configuration: config)
        view.autoresizingMask = [.width, .height]
        view.underPageBackgroundColor = .black
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isHidden = true
        content.addSubview(view, positioned: .below, relativeTo: loading)
        self.webView = view
        chrome.install(in: view)
        view.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        chrome.navigationFinished()
        loading?.removeFromSuperview()
        webView.isHidden = false
        window?.makeFirstResponder(webView)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let failure = error as NSError
        if failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled { return }
        if !terminating { showFailure(error.localizedDescription) }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if !terminating { webView.reload() }
    }
    private func isLocal(_ url: URL) -> Bool {
        guard let base = server.baseURL else { return false }
        return url.scheme == base.scheme && url.host == base.host && url.port == base.port
    }
    private func openExternal(_ url: URL) {
        if ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if isLocal(url) { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated { openExternal(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if isLocal(url) { webView.load(action.request) } else { openExternal(url) }
        }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = "Lapka"; alert.informativeText = message
        alert.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = "Lapka"; alert.informativeText = message
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
    private func showFailure(_ message: String) {
        guard !failed else { return }
        failed = true
        loading?.stringValue = "Lapka could not start"
        let alert = NSAlert()
        alert.messageText = "Lapka could not start"
        alert.informativeText = message + "\n\nLog: " + server.logURL.path
        alert.addButton(withTitle: "Quit")
        alert.addButton(withTitle: "Show Log")
        if alert.runModal() == .alertSecondButtonReturn { NSWorkspace.shared.activateFileViewerSelecting([server.logURL]) }
        NSApp.terminate(nil)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        sender.activate(ignoringOtherApps: true)
        return true
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating || !server.isRunning { return .terminateNow }
        terminating = true
        webView?.stopLoading()
        server.stop { sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
    func shutdown(_ completion: @escaping () -> Void) {
        terminating = true
        webView?.stopLoading()
        server.stop(completion)
    }
    @objc private func reloadPlayer() { webView?.reload() }
    private func makeMenus() {
        let menu = NSMenu()
        func group(_ title: String) -> NSMenu {
            let item = NSMenuItem(); let submenu = NSMenu(title: title)
            item.submenu = submenu; menu.addItem(item); return submenu
        }
        func add(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String = "", _ target: AnyObject? = nil) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key); item.target = target; menu.addItem(item)
        }
        let app = group("Lapka")
        add(app, "About Lapka", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), "", NSApp)
        app.addItem(.separator())
        add(app, "Hide Lapka", #selector(NSApplication.hide(_:)), "h", NSApp)
        app.addItem(.separator())
        add(app, "Quit Lapka", #selector(NSApplication.terminate(_:)), "q", NSApp)
        add(group("File"), "Close Window", #selector(NSWindow.performClose(_:)), "w")
        let edit = group("Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] { add(edit, title, Selector(action), key) }
        let view = group("View")
        add(view, "Reload", #selector(reloadPlayer), "r", self)
        add(view, "Toggle Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f")
        view.items.last?.keyEquivalentModifierMask = [.command, .control]
        let windows = group("Window")
        add(windows, "Minimize", #selector(NSWindow.performMiniaturize(_:)), "m")
        add(windows, "Bring All to Front", #selector(NSApplication.arrangeInFront(_:)), "", NSApp)
        NSApp.windowsMenu = windows
        NSApp.mainMenu = menu
    }
}
