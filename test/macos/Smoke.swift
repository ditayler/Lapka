import AppKit
import WebKit

@main
struct NativeSmoke {
    static var delegate: AppDelegate!
    static var owner: ServerProcess!
    static var checking = false
    static var phase = 0
    static var visibilityStep = 0
    static var seededPipMode = false
    static func main() {
        if CommandLine.arguments[1] == "--generate-video" {
            do { try generateNativeVideo(at: URL(fileURLWithPath: CommandLine.arguments[2])) }
            catch { fail(error.localizedDescription) }
            return
        }
        let resources = URL(fileURLWithPath: CommandLine.arguments[1])
        let data = URL(fileURLWithPath: CommandLine.arguments[2])
        let site = CommandLine.arguments[3]
        let mode = CommandLine.arguments[4]
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        Timer.scheduledTimer(withTimeInterval: mode == "autohide" ? 25 : 20, repeats: false) { _ in fail("native startup timed out") }
        if mode == "parent-exit" {
            owner = ServerProcess(resources: resources, dataDirectory: data, logDirectory: data.appendingPathComponent("logs"), port: 0)
            do {
                try owner.start(onReady: { url in
                    print("PARENT_EXIT " + String(data: try! JSONSerialization.data(withJSONObject: ["url": url.absoluteString, "pid": owner.pid!]), encoding: .utf8)!)
                    fflush(stdout)
                    exit(0) // Deliberately skip stop(): the orphan must notice stdin EOF.
                }, onExit: { code in fail("server exited \(code)") }, onFailure: fail)
            } catch { fail(error.localizedDescription) }
            app.run()
            return
        }
        delegate = AppDelegate(resources: resources, dataDirectory: data, logDirectory: data.appendingPathComponent("logs"), port: 0, websiteDataStore: .nonPersistent())
        app.delegate = delegate
        if mode == "quit" {
            _ = NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
                guard !delegate.server.isRunning else { fail("server survived player Quit"); return }
                print("PASS: player's Quit action terminates the native application")
                fflush(stdout)
            }
        }
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            if mode == "quit", let url = delegate.server.baseURL {
                timer.invalidate()
                var request = URLRequest(url: url.appendingPathComponent("api/quit")); request.httpMethod = "POST"; request.setValue("1", forHTTPHeaderField: "x-lapka")
                URLSession.shared.dataTask(with: request).resume()
                return
            }
            guard !checking, let view = delegate.webView, view.url != nil else { return }
            checking = true
            let script = phase == 0
              ? "(() => { const empty = document.querySelector('#empty'); if (!empty || empty.classList.contains('hide')) return null; return {title:document.title, hasPlayer:!!document.querySelector('#video'), hasAirplay:typeof document.querySelector('#video').webkitShowPlaybackTargetPicker === 'function', origin:location.origin}; })()"
              : "(() => { const v=document.querySelector('#video'), b=document.querySelector('#btnAirplay'); if (!v || v.readyState<1 || b.disabled) return null; v.pause(); v.currentTime=42; return {duration:v.duration,time:v.currentTime,paused:v.paused,airplay:!b.hidden,error:v.error && v.error.code}; })()"
            view.evaluateJavaScript(script) { value, error in
                checking = false
                guard let result = value as? [String: Any] else { return }
                if phase == 0 {
                    if mode == "pip", !seededPipMode {
                        seededPipMode = true
                        view.evaluateJavaScript("localStorage.setItem('lapka.pipMode','document');") { _, _ in view.reload() }
                        return
                    }
                    // These checks drive DOM/AppKit APIs directly. Keep desktop
                    // mouse/keyboard input from changing playback during a run.
                    delegate.window?.ignoresMouseEvents = true
                    delegate.window?.makeFirstResponder(nil)
                    guard let window = delegate.window,
                          window.styleMask.contains(.fullSizeContentView),
                          window.titlebarAppearsTransparent,
                          window.titleVisibility == .hidden,
                          abs(view.bounds.height - window.frame.height) < 1 else {
                        fail("native title bar still consumes a separate row"); return
                    }
                    guard result["title"] as? String == "Lapka", result["hasPlayer"] as? Bool == true,
                          result["hasAirplay"] as? Bool == true,
                          let origin = result["origin"] as? String, origin.hasPrefix("http://127.0.0.1:") else { fail("unexpected page: \(result), \(String(describing: error))") ; return }
                    // WebKit reports this when a reload supersedes another navigation.
                    delegate.webView(view, didFailProvisionalNavigation: nil, withError: URLError(.cancelled))
                    let oldWindow = delegate.window, oldPID = delegate.server.pid
                    delegate.window?.performClose(nil)
                    _ = delegate.applicationShouldHandleReopen(app, hasVisibleWindows: false)
                    guard delegate.window === oldWindow, delegate.window?.isVisible == true, delegate.server.pid == oldPID else { fail("reopen replaced the window/server"); return }
                    let literal = String(data: try! JSONSerialization.data(withJSONObject: [site]), encoding: .utf8)!
                    // Background WebKit may throttle CSS transitions. Measure
                    // settled layouts, as the Chromium layout harness does.
                    view.evaluateJavaScript("const still=document.createElement('style');still.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.append(still);document.querySelector('#linkInput').value=\(literal)[0];document.querySelector('#linkForm').requestSubmit();") { _, error in if let error = error { fail(error.localizedDescription) } }
                    phase = 1
                    return
                }
                guard let duration = result["duration"] as? Double, duration > 170,
                      let time = result["time"] as? Double, abs(time - 42) < 1,
                      result["paused"] as? Bool == true, result["airplay"] as? Bool == true,
                      result["error"] is NSNull else { fail("media failed: \(result)"); return }
                timer.invalidate()
                if mode == "pip" { pipChecks(view: view); return }
                if mode == "autohide" {
                    waitCondition(view: view, condition: "(() => { const v=document.querySelector('#video'); return v.readyState>=2 && !v.seeking; })()") { autohideChecks(view: view) }
                    return
                }
                chromeChecks(view: view, window: delegate.window!) { finishMedia() }
            }
        }
        app.run()
    }
    static func autohideChecks(view: WKWebView, step: Int = 0) {
        visibilityStep = step
        let window = delegate.window!
        let chrome = view.superview!.subviews.last as! WindowChrome
        if step == 1 || step == 2 {
            let type: NSEvent.EventType = step == 1 ? .mouseEntered : .mouseExited
            let event = NSEvent.enterExitEvent(with: type, location: .zero, modifierFlags: [], timestamp: 0,
                windowNumber: window.windowNumber, context: nil, eventNumber: 0, trackingNumber: 0, userData: nil)!
            if step == 1 { chrome.mouseEntered(with: event) } else { chrome.mouseExited(with: event) }
            assertButtons(hidden: step == 2)
            autohideChecks(view: view, step: step + 1)
            return
        }
        if step == 7 {
            window.toggleFullScreen(nil)
            waitFullscreen(view: view, window: window, entering: true) {
                window.toggleFullScreen(nil)
                waitFullscreen(view: view, window: window, entering: false) {
                    // Fullscreen transitions may wake the player's own controls.
                    // Native buttons must follow the resulting UI state.
                    view.evaluateJavaScript("document.querySelector('#stage').classList.contains('idle') && !document.querySelector('#video').paused") { value, _ in
                        assertButtons(hidden: value as? Bool == true)
                        autohideChecks(view: view, step: 8)
                    }
                }
            }
            return
        }
        let play = """
        (() => {
          window.__autohidePlayError=null;
          document.querySelector('#video').play().then(() => {
            document.querySelector('#deck').dispatchEvent(new Event('pointerleave'));
            document.querySelector('#stage').dispatchEvent(new Event('pointermove'));
          }).catch(e => window.__autohidePlayError=e.name+': '+e.message);
        })();
        """
        let steps: [Int: (String, String, Bool)] = [
            0: (play, "document.querySelector('#stage').classList.contains('idle')", true),
            3: ("document.querySelector('#saveMenu').hidden=false;", "!document.querySelector('#saveMenu').hidden", false),
            4: ("document.querySelector('#saveMenu').hidden=true; document.querySelector('#btnGear').click();", "document.querySelector('#gearMenu').classList.contains('open')", false),
            5: ("document.querySelector('#btnGear').click(); document.querySelector('#video').pause();", "document.querySelector('#video').paused", false),
            6: (play, "document.querySelector('#stage').classList.contains('idle')", true),
            8: ("document.querySelector('#video').pause();", "document.querySelector('#video').paused", false)
        ]
        let (action, condition, hidden) = steps[step]!
        view.evaluateJavaScript(action) { _, error in
            if let error = error { fail(error.localizedDescription); return }
            waitCondition(view: view, condition: condition + " /* autohide step \(step) */") {
                // Wait for the asynchronous WebKit -> AppKit state message.
                waitButtons(hidden: hidden) {
                    if step == 8 {
                        delegate.shutdown { print("PASS: native controls hide on playback idle, reveal on header hover/menu/pause, and recover after fullscreen"); exit(0) }
                    } else { autohideChecks(view: view, step: step + 1) }
                }
            }
        }
    }
    static func waitButtons(hidden: Bool, attempts: Int = 0, completion: @escaping () -> Void) {
        let matches = [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton]
            .allSatisfy { delegate.window?.standardWindowButton($0)?.isHidden == hidden }
        if matches { completion(); return }
        guard attempts < 40 else { assertButtons(hidden: hidden); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { waitButtons(hidden: hidden, attempts: attempts + 1, completion: completion) }
    }
    static func assertButtons(hidden: Bool) {
        for type: NSWindow.ButtonType in [.closeButton, .miniaturizeButton, .zoomButton] {
            guard delegate.window?.standardWindowButton(type)?.isHidden == hidden else {
                let chrome = delegate.webView!.superview!.subviews.last!
                let state = Mirror(reflecting: chrome).children.filter { ["controlsHidden", "overHeader", "fullscreen"].contains($0.label ?? "") }.map { "\($0.label!):\($0.value)" }
                fail("native button \(type.rawValue) hidden should be \(hidden), step=\(visibilityStep), \(state)"); return
            }
        }
    }
    static func waitCondition(view: WKWebView, condition: String, attempts: Int = 0, completion: @escaping () -> Void) {
        guard attempts < 60 else {
            view.evaluateJavaScript("({stage:document.querySelector('#stage').className,paused:document.querySelector('#video').paused,playError:window.__autohidePlayError,menus:[...document.querySelectorAll('.menu.open')].map(m=>m.id)})") { value, _ in fail("condition timed out: \(condition); state=\(String(describing:value))") }
            return
        }
        view.evaluateJavaScript(condition) { value, _ in
            if value as? Bool == true { completion() }
            else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { waitCondition(view: view, condition: condition, attempts: attempts + 1, completion: completion) } }
        }
    }
    static func pipChecks(view: WKWebView, attempts: Int = 0) {
        guard attempts < 40 else { fail("video did not finish seeking before PiP"); return }
        view.evaluateJavaScript("(() => { const v=document.querySelector('#video'); return v.readyState>=2 && !v.seeking && v.videoWidth>0; })()") { value, _ in
            guard value as? Bool == true else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { pipChecks(view: view, attempts: attempts + 1) }
                return
            }
            view.evaluateJavaScript("(() => { const b=document.querySelector('#btnPipMode'), p=document.querySelector('#btnPip'), f=document.querySelector('#btnFull'); return b.hidden && b.disabled && !b.getClientRects().length && p.getBoundingClientRect().width === f.getBoundingClientRect().width; })()") { value, _ in
                guard value as? Bool == true else { fail("macOS still shows the split PiP mode control"); return }
                requestPip(view: view)
            }
        }
    }
    static func requestPip(view: WKWebView) {
        view.evaluateJavaScript("""
        (() => {
          const v=document.querySelector('#video');
          window.__pipDiagnostics={standard:document.pictureInPictureEnabled,webkit:typeof v.webkitSetPresentationMode,
            supportsWebkit:v.webkitSupportsPresentationMode?.('picture-in-picture'),width:v.videoWidth,ready:v.readyState};
          const request=v.requestPictureInPicture;
          if (request) v.requestPictureInPicture=function() { return request.call(this).catch(e=>{window.__pipDiagnostics.error=e.name+': '+e.message;throw e;}); };
          document.querySelector('#btnPip').click();
        })();
        """) { _, error in
            if let error = error { fail(error.localizedDescription); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                view.evaluateJavaScript("({active:document.querySelector('#stage').classList.contains('is-pip'), diagnostics:window.__pipDiagnostics})") { value, _ in
                    guard let r = value as? [String: Any], r["active"] as? Bool == true else { fail("PiP did not open: \(String(describing: value))"); return }
                    view.evaluateJavaScript("document.querySelector('#btnPip').click();") { _, _ in
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                            view.evaluateJavaScript("({active:document.querySelector('#stage').classList.contains('is-pip'),time:document.querySelector('#video').currentTime})") { value, _ in
                                guard let r = value as? [String: Any], r["active"] as? Bool == false,
                                      let time = r["time"] as? Double, abs(time - 42) < 1 else { fail("PiP did not return to the player: \(String(describing: value))"); return }
                                playingPipCheck(view: view)
                            }
                        }
                    }
                }
            }
        }
    }
    static func playingPipCheck(view: WKWebView) {
        // Keep the PiP request inside the user-activation scope of this call.
        view.evaluateJavaScript("(() => { document.querySelector('#video').play(); document.querySelector('#btnPip').click(); })();") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                view.evaluateJavaScript("({active:document.querySelector('#stage').classList.contains('is-pip'),time:document.querySelector('#video').currentTime,paused:document.querySelector('#video').paused,diagnostics:window.__pipDiagnostics})") { value, _ in
                    guard let r = value as? [String: Any], r["active"] as? Bool == true,
                          r["paused"] as? Bool == false, let time = r["time"] as? Double, time > 42 else { fail("playing video did not re-enter PiP: \(String(describing: value))"); return }
                    view.closeAllMediaPresentations {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                            view.evaluateJavaScript("!document.querySelector('#stage').classList.contains('is-pip') && !document.pictureInPictureElement") { value, _ in
                                guard value as? Bool == true else { fail("native PiP close left the player in PiP mode"); return }
                                delegate.shutdown { print("PASS: native PiP opens, returns to the same position, reopens while playing and cleans up after native close"); exit(0) }
                            }
                        }
                    }
                }
            }
        }
    }
    static func finishMedia() {
                guard let url = delegate.server.baseURL else { fail("server URL missing"); return }
                delegate.shutdown {
                    URLSession.shared.dataTask(with: url.appendingPathComponent("api/ping")) { _, _, error in
                        guard error != nil else { fail("server survived app shutdown"); return }
                        print("PASS: packaged Node, WKWebView media, seek/pause, AirPlay API, close/reopen, integrated native controls, queue layouts, fullscreen and owned-server shutdown")
                        exit(0)
                    }.resume()
                }
    }
    static func chromeChecks(view: WKWebView, window: NSWindow, step: Int = 0, completion: @escaping () -> Void) {
        let sizes: [(CGFloat, Bool, Bool)] = [(1280, false, true), (1280, true, true), (1000, false, true), (520, false, true), (1280, false, false)]
        if step == sizes.count {
            window.toggleFullScreen(nil)
            waitFullscreen(view: view, window: window, entering: true) {
                window.toggleFullScreen(nil)
                waitFullscreen(view: view, window: window, entering: false, completion: completion)
            }
            return
        }
        let (width, narrow, open) = sizes[step]
        window.setContentSize(NSSize(width: width, height: 800))
        let setup = """
        (() => {
          const w=document.querySelector('#workspace');
          if (w.classList.contains('queue-open') !== \(open)) document.querySelector('#btnList').click();
          if (w.classList.contains('queue-narrow') !== \(narrow)) document.querySelector('#btnQueueWidth').click();
        })();
        """
        view.evaluateJavaScript(setup) { _, error in
            if let error = error { fail(error.localizedDescription); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) {
                let script = """
                (() => {
                  const w=document.querySelector('#workspace'), q=document.querySelector('#queue');
                  document.querySelector('#saveCount').textContent = '123/123';
                  const controls=[...document.querySelectorAll('.queue__tools button')].filter(b=>b.getClientRects().length && getComputedStyle(b).display !== 'none');
                  const rs=controls.map(b=>({id:b.id,r:b.getBoundingClientRect()}));
                  const overlaps=rs.filter(({r})=>r.left<96 || r.right>q.getBoundingClientRect().right+1 || r.top<0 || r.bottom>57);
                  const collisions=rs.filter((a,i)=>rs.slice(i+1).some(b=>a.r.left<b.r.right && b.r.left<a.r.right));
                  const title=document.querySelector('.titlechip__name').getBoundingClientRect();
                  return {native:document.documentElement.hasAttribute('data-macos'), open:w.classList.contains('queue-open'),
                    overlaps:overlaps.map(b=>b.id),collisions:collisions.map(b=>b.id),titleLeft:title.left,
                    button:rs.length ? [rs[0].r.x+rs[0].r.width/2,rs[0].r.y+rs[0].r.height/2] : []};
                })()
                """
                view.evaluateJavaScript(script) { value, error in
                    guard let r = value as? [String: Any], r["native"] as? Bool == true else { fail("native layout absent: \(String(describing: error))"); return }
                    if open {
                        guard (r["overlaps"] as? [String]) == [], (r["collisions"] as? [String]) == [] else { fail("header overlaps at \(width), narrow=\(narrow): \(r)"); return }
                        guard let chrome = view.superview?.subviews.last as? WindowChrome,
                              let point = r["button"] as? [Double], point.count == 2 else { fail("drag overlay missing"); return }
                        let location = chrome.convert(NSPoint(x: point[0], y: point[1]), to: chrome.superview)
                        guard chrome.hitTest(location) == nil else { fail("drag region intercepts web control"); return }
                    } else {
                        guard let x = r["titleLeft"] as? Double, x >= 96 else { fail("closed queue title under native controls"); return }
                        guard let chrome = view.superview?.subviews.last as? WindowChrome,
                              chrome.hitTest(chrome.convert(NSPoint(x: 600, y: 10), to: chrome.superview)) === chrome else { fail("free header does not start native drag"); return }
                        let root = window.contentView!.superview!
                        let point = root.convert(NSPoint(x: 600, y: 10), from: chrome)
                        guard root.hitTest(point) === chrome else { fail("native title area intercepts the drag overlay"); return }
                    }
                    guard let close = window.standardWindowButton(.closeButton),
                          let minimize = window.standardWindowButton(.miniaturizeButton),
                          let zoom = window.standardWindowButton(.zoomButton),
                          close.isEnabled, minimize.isEnabled, zoom.isEnabled else { fail("native window buttons unavailable"); return }
                    for button in [close, minimize, zoom] {
                        let rect = view.convert(button.bounds, from: button)
                        guard rect.minX >= 0, rect.maxX <= 96, rect.minY >= 0, rect.maxY <= 57 else { fail("native button outside reserved area: \(rect)"); return }
                    }
                    chromeChecks(view: view, window: window, step: step + 1, completion: completion)
                }
            }
        }
    }
    static func waitFullscreen(view: WKWebView, window: NSWindow, entering: Bool, attempts: Int = 0, completion: @escaping () -> Void) {
        guard attempts < 60 else { fail("fullscreen transition timed out"); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            view.evaluateJavaScript("document.documentElement.hasAttribute('data-macos-fullscreen')") { value, _ in
                if window.styleMask.contains(.fullScreen) == entering, value as? Bool == entering {
                    // Wait for the system animation before attempting the inverse transition.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: completion)
                } else { waitFullscreen(view: view, window: window, entering: entering, attempts: attempts + 1, completion: completion) }
            }
        }
    }
    static func fail(_ message: String) { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
