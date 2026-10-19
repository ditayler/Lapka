import AppKit
import WebKit

/// Transparent hit regions over the existing web header. Buttons, text and menus
/// stay in WebKit; an actual mouse-down on unused space goes to Window Server.
final class WindowChrome: NSView, WKScriptMessageHandler, NSWindowDelegate {
    private weak var webView: WKWebView?
    private var blocked: [NSRect] = []
    private var ready = false
    private var fullscreen = false
    private var controlsHidden = false
    private var overHeader = false
    private var headerTracking: NSTrackingArea?
    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    func install(in view: WKWebView) {
        webView = view
        frame = view.frame
        autoresizingMask = [.width, .height]
        view.superview?.addSubview(self, positioned: .above, relativeTo: view)
    }

    func configure(_ configuration: WKWebViewConfiguration) {
        configuration.userContentController.add(self, name: "windowChrome")
        configuration.userContentController.addUserScript(WKUserScript(source: Self.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func navigationFinished() {
        setFullscreen(window?.styleMask.contains(.fullScreen) == true)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking = headerTracking { removeTrackingArea(tracking) }
        let tracking = NSTrackingArea(rect: NSRect(x: 0, y: 0, width: bounds.width, height: 57),
            options: [.mouseEnteredAndExited, .activeAlways], owner: self, userInfo: nil)
        addTrackingArea(tracking)
        headerTracking = tracking
    }
    override func mouseEntered(with event: NSEvent) {
        overHeader = true
        updateControls()
    }
    override func mouseExited(with event: NSEvent) {
        overHeader = false
        updateControls()
    }
    private func updateControls() {
        guard !fullscreen else { return } // AppKit owns the fullscreen titlebar.
        setButtonsHidden(controlsHidden && !overHeader)
    }
    private func setButtonsHidden(_ hidden: Bool) {
        for type: NSWindow.ButtonType in [.closeButton, .miniaturizeButton, .zoomButton] {
            if let button = window?.standardWindowButton(type), button.isHidden != hidden { button.isHidden = hidden }
        }
    }
    func windowDidResize(_ notification: Notification) { updateControls() }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        guard ready, !fullscreen, bounds.contains(local), local.y < 57,
              !blocked.contains(where: { $0.contains(local) }) else { return nil }
        return self
    }
    override func mouseDown(with event: NSEvent) {
        guard let window = window else { return }
        if event.clickCount == 2 {
            let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") ?? "Maximize"
            if action == "Minimize" { window.performMiniaturize(nil) }
            else if action != "None" { window.performZoom(nil) }
        } else { window.performDrag(with: event) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let view = webView,
              message.frameInfo.request.url?.host == view.url?.host,
              message.frameInfo.request.url?.port == view.url?.port,
              let body = message.body as? [String: Any], let rects = body["blocked"] as? [[Double]],
              rects.count <= 300 else { return }
        blocked = rects.compactMap { r in
            guard r.count == 4, r.allSatisfy({ $0.isFinite }), r[2] >= 0, r[3] >= 0 else { return nil }
            return NSRect(x: r[0], y: r[1], width: r[2], height: r[3])
        }
        ready = true
        controlsHidden = body["controlsHidden"] as? Bool ?? false
        updateControls()
    }

    private func setFullscreen(_ value: Bool) {
        // Restore controls before handing their presentation back to AppKit.
        if value && !fullscreen { setButtonsHidden(false) }
        fullscreen = value
        updateControls()
        webView?.evaluateJavaScript("document.documentElement.toggleAttribute('data-macos-fullscreen', \(value));", completionHandler: nil)
    }
    func windowWillEnterFullScreen(_ notification: Notification) { setFullscreen(true) }
    func windowDidEnterFullScreen(_ notification: Notification) { setFullscreen(true) }
    func windowDidExitFullScreen(_ notification: Notification) { setFullscreen(false) }
    func windowDidFailToEnterFullScreen(_ window: NSWindow) { setFullscreen(false) }
    func windowDidFailToExitFullScreen(_ window: NSWindow) { setFullscreen(true) }

    private static let script = #"""
    (() => {
      const start = () => {
        const root = document.documentElement;
        root.setAttribute('data-macos', '');
        const style = document.createElement('style');
        style.textContent = `
          :root[data-macos] { --macos-controls:96px; }
          :root[data-macos-fullscreen], :root[data-macos]:has(:fullscreen) { --macos-controls:0px; }
          [data-macos] .queue__tools { padding-left:max(16px, var(--macos-controls)); gap:8px; }
          [data-macos] .workspace { --queue-w:504px; }
          [data-macos] .workspace.queue-narrow { --queue-w:460px; }
          [data-macos] .workspace:not(.queue-open) .titlechip,
          [data-macos] .info { padding-left:calc(36px + var(--macos-controls)); }
          [data-macos] .queue--empty .queue__about { padding-top:57px; }
          @media (min-width:1501px) {
            [data-macos] .workspace { --queue-w:709px; }
            [data-macos] .workspace.queue-narrow { --queue-w:504px; }
          }
          @media (max-width:1100px) { [data-macos] .workspace { --queue-w:460px; } }
          @media (max-width:820px) {
            [data-macos] .workspace, [data-macos] .workspace.queue-narrow { --queue-w:100vw; }
          }
        `;
        document.head.append(style);
        // Re-measure throughout panel slides, font loading, resizes and menus.
        // Geometry alone crosses the bridge; no asynchronous JS mouse gesture
        // is used to start a native drag.
        let until = 0, pending = false;
        const measure = () => {
          pending = false;
          const blocked = [[0, 0, 96, 57]];
          for (const el of document.querySelectorAll('button, a, input, select, textarea, [role="button"], .titlechip__name, .titlechip__path, .menu.open')) {
            if (!el.checkVisibility ? getComputedStyle(el).visibility === 'hidden' : !el.checkVisibility({visibilityProperty:true, opacityProperty:true})) continue;
            for (const r of el.getClientRects()) {
              if (r.top < 57 && r.bottom > 0 && r.right > 0 && r.left < innerWidth)
                blocked.push([r.left, r.top, r.width, r.height]);
            }
          }
          const stage = document.querySelector('#stage'), video = document.querySelector('#video');
          const controlsHidden = !!(stage?.classList.contains('idle') && video && !video.paused && !video.ended
            && !stage.classList.contains('is-empty') && !stage.classList.contains('is-pip')
            && !document.querySelector('.menu.open, #saveMenu:not([hidden]), #deckPack.open, .savepop:not([hidden])'));
          window.webkit.messageHandlers.windowChrome.postMessage({blocked, controlsHidden});
          if (performance.now() < until) { pending = true; requestAnimationFrame(measure); }
        };
        const schedule = () => { until = performance.now() + 500; if (!pending) { pending = true; requestAnimationFrame(measure); } };
        new MutationObserver(records => {
          // Playback counters and progress indicators below the header must not
          // keep this geometry loop alive throughout a whole episode.
          if (records.some(({target}) => {
            const el = target.nodeType === 1 ? target : target.parentElement;
            if (!el) return false;
            if (el.matches('.menu, #deckPack, .savepop')) return true;
            if (el === document.body || ['workspace', 'stage', 'queue'].includes(el.id)) return true;
            const r = el.getBoundingClientRect();
            return r.top < 57 && r.bottom > 0 && r.right > 0 && r.left < innerWidth;
          })) schedule();
        }).observe(document.body, {subtree:true, childList:true, attributes:true, characterData:true});
        new ResizeObserver(schedule).observe(document.body);
        document.fonts.ready.then(schedule);
        addEventListener('resize', schedule);
        addEventListener('fullscreenchange', schedule);
        const video = document.querySelector('#video');
        if (video) for (const event of ['play', 'pause', 'ended', 'emptied', 'enterpictureinpicture', 'leavepictureinpicture']) video.addEventListener(event, schedule);
        schedule();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
      else start();
    })();
    """#
}
