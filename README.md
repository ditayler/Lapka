<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/l_bl.gif">
    <img src="docs/media/l_wh.gif" alt="Lapka" width="540">
  </picture>
</p>

# Lapka for macOS

A local player for videos, films and series. Paste a link, choose a dub and
quality, and watch in a native macOS window. Your library stays on your Mac.

[![Download for macOS](https://img.shields.io/badge/Download_for_macOS-007AFF?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/ditayler/Lapka/releases)

**macOS 13.5+ · Apple Silicon and Intel**

[All releases](https://github.com/ditayler/Lapka/releases) · [Changelog](CHANGELOG.md)

Looking for the browser version, `npx` launcher, or Windows/Linux instructions?
See the original [MythHand/Lapka project](https://github.com/MythHand/Lapka#readme).
This README covers the macOS application.

![Lapka player interface](docs/media/home_page.png)

## What it does

- Opens video and series links, discovers episodes, dubs, qualities and subtitles.
- Plays episodes in sequence and remembers your position, chosen dub and history.
- Provides system Picture in Picture, fullscreen playback and keyboard controls.
- Saves videos to your folder and plays saved episodes from disk. Saving needs
  a separately installed [ffmpeg](https://ffmpeg.org/); watching does not.
- Keeps settings and the library on your machine, with no account or cloud library.
- Offers ten interface languages.

AirPlay support is experimental. Real receiver playback, episode transitions
and device compatibility still need verification with hardware. Lapka reads
open pages and does not bypass DRM or deliberately locked players.

## macOS application

### Install

1. Open [Releases](https://github.com/ditayler/Lapka/releases).
2. Download the DMG for your Mac:

   | Mac | Download |
   | --- | --- |
   | Apple Silicon (M-series) | `Lapka-<version>-macos-arm64.dmg` |
   | Intel | `Lapka-<version>-macos-x64.dmg` |

3. Open the DMG and drag **Lapka** into **Applications**.
4. Launch **Lapka** from Applications, the Dock or Spotlight.

Node.js is bundled; no terminal, npm or separate browser is needed to launch
the app.

Current downloads are experimental, ad-hoc signed and not notarized.
macOS Gatekeeper may block the first launch after downloading. Developer ID
signing and notarization remain to be configured for normal public distribution.

### Use

Paste a video or series link into Lapka. It reads the page, finds the available
episodes and sources, and opens them in its player.

The native window buttons hide with the playback controls. Move the pointer
near the top edge to reveal them; they stay visible on pause and while menus
are open. macOS manages them in fullscreen.

Closing the window keeps Lapka running in the Dock. Open its icon to restore
the window. **Cmd-Q**, **Lapka → Quit Lapka**, or the player's Quit action
stops the application and its local server.

### Library and updates

Choose your video folder in Settings. Settings and the initial library live in
`~/Library/Application Support/Lapka`; logs are in
`~/Library/Logs/Lapka/server.log`. Replacing or removing the app does not delete
your library or settings.

Choose **Lapka → Check for Updates…** in the macOS menu bar, or check in
Settings. The menu opens Settings and immediately checks for a published
release, including when the player window is closed. Then download the DMG from
[Releases](https://github.com/ditayler/Lapka/releases). Quit Lapka with **Cmd-Q**
and drag the new app into Applications, replacing the old one. Installation
of updates is currently manual.

## Build and test on macOS

Development requires Node.js 22+ and Xcode Command Line Tools. Clone this fork:

```sh
git clone https://github.com/ditayler/Lapka.git
cd Lapka
npm ci
npm run build:macos
npm run build:dmg
```

The builder creates `Lapka.app`, a ZIP and a versioned DMG in
`dist/macos-arm64/` on Apple Silicon, or `dist/macos-x64/` on Intel. It downloads
an official Node.js runtime and verifies its SHA-256 checksum. The DMG uses
the built app's recorded version and architecture, with a dark drag-to-Applications
window and Retina artwork. Its first build downloads pinned, hash-verified
Python packaging tools into `.dev/build-cache/`; Python 3.9+ is supplied by the
Xcode Command Line Tools. These tools are only needed to build the DMG.

The image requests a 720 × 440 point window without a sidebar. Finder can inherit
an existing window's size and sidebar when opening the disk as a tab (for example,
with macOS's “Prefer tabs when opening documents” set to “Always”). A separate
Finder window can use the image's compact layout. The fixed dark background
extends to 4096 × 2304 points for enlarged windows. If Finder reveals hidden
files, their icons sit below the artwork within its width, avoiding horizontal
scrolling. Packaging preserves the user's Finder and tab preferences.

For a custom existing bundle or output folder:

```sh
npm run build:dmg -- --app=/path/Lapka.app --output-dir=/path/releases
```

Quit an app running from the build output before rebuilding it. Packaging an
existing app as a DMG does not require stopping it.

To check the packaged Finder layout, Applications shortcut and signature after
copying the app to a temporary installation folder:

```sh
LAPKA_DMG_TEST_APP=dist/macos-arm64/Lapka.app node --test test/dmg-build.test.mjs
```

Use `macos-x64` on Intel. The opt-in test builds and mounts a temporary DMG;
it does not replace the installed app or open the player.

```sh
npm run check
node --test test/macos-build.test.mjs test/dmg-build.test.mjs test/desktop.test.mjs test/update.test.mjs
npm run test:macos
```

Native acceptance needs a graphical macOS session and a built app. `npm test`
runs the broader suite; media tests need ffmpeg and browser tests need Chrome
or Chromium. The app runs a local server on `127.0.0.1:18800` and reports port
conflicts without terminating another process. Its PiP implementation uses a
guarded private WebKit preference that may need revision in future macOS releases.

Repository guidance: [AGENTS.md](AGENTS.md). Backend architecture:
[core/README.md](core/README.md).

## Publish a macOS release

Run **Actions → Release → Run workflow** on `main`. Semantic-release derives
the next version from commits: `fix:` for patch, `feat:` for minor, and a
`BREAKING CHANGE:` footer for major. Use the same format for squash messages.

The job updates `CHANGELOG.md`, `package.json` and `package-lock.json`, commits
them, and creates a tag and draft GitHub Release. It then builds that exact tag
for Apple Silicon and Intel, uploads the two DMGs, adds their SHA-256 checksums
to the release notes, and publishes the draft only after both builds succeed.
ZIPs and checksum files remain in the Actions artifacts. npm publishing is disabled.

If there are no releasable commits, no version or downloads are created. If
packaging fails, rerun **macOS release** with the existing tag to finish the
draft. Actions artifacts are also available for 30 days.

## Credits

This macOS fork is based on [Lapka by MythHand](https://github.com/MythHand/Lapka).
Original idea, design and hands-on testing: Dimbo. The original code was written
with Claude in Claude Code.

Lapka grew out of [PIP-Player](https://github.com/MythHand/PIP-Player), a local
player by the same author under the MIT licence. Its code was reworked freely
and, as part of Lapka, goes under Lapka's licence; in its original form it
stays available in the PIP-Player repository under MIT. The MIT notice is kept
in [LICENSES/PIP-Player.MIT.txt](LICENSES/PIP-Player.MIT.txt).

## Licence

The code of Lapka is distributed under the [GNU AGPL v3](LICENSE). That means:
use, study, change and distribute it as you like, but derived versions, those
run as a network service included, must open their code under the same
licence. This covers all of Lapka's code, the reworked parts of PIP-Player
included: code taken from Lapka comes under AGPL; the same code taken from the
PIP-Player repository comes from there under MIT.

The Lapka name, the Lapka seal (the paw and the name drawn in characters), and
the MythHand name and mark are not covered by AGPL and are not handed out with
the code; see [TRADEMARKS.md](TRADEMARKS.md). The fonts in `web/assets/fonts`
come under the SIL Open Font License.

© 2026 MythHand · Togulev Dmitry
