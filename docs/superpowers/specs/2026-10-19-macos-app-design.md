# Lapka macOS application

## Outcome

A person downloads Lapka.app, moves it to Applications, and opens its icon without a terminal, Node installation, npm or a browser tab. The app contains the existing player and its local Node server. This branch starts at codex/airplay (5ef10eb).

## Application

- macOS 13.5 or newer. Build separate arm64 and x64 bundles; verify arm64 on the available machine.
- A small AppKit application owns a WKWebView window and its bundled Node child process. Enable AirPlay and element fullscreen using public WebKit APIs. Normal HTML media and browser PiP use feature detection; Document Picture in Picture is unavailable in WebKit.
- Show a native loading screen until the server announces its loopback URL; show failures in a native dialog with the log location. Only load the local app in the main webview; send user-initiated external HTTP(S) links to the default browser. JavaScript alert/confirm dialogs must work.
- Reopening the icon brings the same window forward. Closing the window keeps the app available in the Dock; Cmd-Q and the player's Quit action shut it down. Exiting or crashing the parent closes the child's stdin so it can stop itself.
- Never attach to or terminate an unrelated server. Use stable loopback port 18800 by default (LAPKA_DESKTOP_PORT can override), preserving the WKWebView localStorage origin across launches. A busy port produces a native error, not a kill or silent port change.

## Server and data

- A desktop-only Node entry point starts the existing core, prints one JSON readiness record, and handles stdin EOF, SIGTERM, SIGINT and the player Quit API with the same shutdown path.
- Pause downloads and persist state before exiting. Bound shutdown time so open streaming connections cannot leave an invisible server behind.
- The desktop data directory is ~/Library/Application Support/Lapka (override LAPKA_DATA_DIR). Config is config.json and the default library is home/ under that directory. Existing browser/CLI defaults under .dev remain unchanged. A chosen library still survives restarts.
- Logs live in ~/Library/Logs/Lapka; desktop overrides may put logs beside the temporary data directory for isolated verification.
- Place WebKit storage under the application's normal persistent data store. Bundle identifiers and the origin remain stable across app builds.

## Packaging

- npm run build:macos produces dist/macos-<arch>/Lapka.app and a zip. Bundle a pinned official Node 24.13.0 runtime, validating its archive against the official SHASUMS256.txt. A local --node path is supported for offline builds after checking architecture, version and non-system dylib dependencies.
- Copy only the runtime, production dependencies, player/core/profiles, source/licence notices and native sources. Never copy .dev, user libraries, tests or git metadata.
- Reuse the existing paw vector for an .icns icon. Sign locally with an ad-hoc signature by default; an explicit signing identity can produce a Developer ID signed build. Notarization requires the owner's release credentials and is outside this local implementation.
- Do not publish to npm, GitHub Releases, or install into /Applications during this task.

## Verification

- Node integration tests spawn the real desktop entry in an isolated data directory: readiness, independent port, state across restart, Quit/EOF/signal shutdown, and busy-port behavior without harming the existing listener.
- Native smoke tests use the shipping AppDelegate/WKWebView and packaged runtime with isolated temporary data: page load, player controls, AirPlay API detection, application origin, and owned server shutdown. These do not prove transport to an AirPlay receiver.
- Build and open the real .app on macOS, inspect its window/icon, run the existing frontend check and full Node suite. Report existing ffmpeg-dependent failures separately.
