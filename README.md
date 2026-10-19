<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/l_bl.gif">
    <img src="docs/media/l_wh.gif" alt="Lapka" width="540">
  </picture>
</p>

# Lapka

Русская версия: [README.ru.md](README.ru.md)

A local anime player. Paste a link to an anime or to a single episode: Lapka
reads the page, finds the episodes, dubs, qualities and subtitles, and shows
it all in its own player. Episodes follow one another, the dub you chose is
kept for the whole series, and any episode can be saved as one file into your
own folder.

Everything runs on your machine: a small Node.js server reads the site's
pages with the same requests your browser would make and hands the video to
your browser. Nothing is proxied outward, there are no accounts and no
library in a cloud.

Idea, design and hands-on testing: Dimbo. The code is written together with
Claude in Claude Code.

Lapka grew out of [PIP-Player](https://github.com/MythHand/PIP-Player), a local
player by the same author under the MIT licence. Its code was reworked freely
and, as part of Lapka, goes under Lapka's licence; in its original form it
stays available in the PIP-Player repository under MIT. The MIT notice is kept
in [LICENSES/PIP-Player.MIT.txt](LICENSES/PIP-Player.MIT.txt).

![The start screen: the Lapka seal, the link field and the description on the left](docs/media/home_page.png)

## What it does

- **Queue.** The episodes of every season, film and spin-off of a franchise, in the order they came out.
- **Dubs.** Switched on the fly, without a reload; the choice is kept for the whole series.
- **Quality.** Any variant a source offers, the levels inside one stream included.
- **Subtitles.** As a track of their own, when the source offers them; their look is adjustable.
- **Resume.** From where you stopped, for every episode and dub.
- **Saving.** An episode as one file in your folder, with the chosen dub and the subtitles inside.
  Saves go in a queue, one after another: a pause holds an episode where it got to and continues
  from there, a waiting one can be made the current one, any can be cancelled, and saved files can
  be deleted from the library right in the player. A save that was cut short is finished on its own.
- **Sources.** Several players per episode; a dead source gives way to a live one by itself.
- **A window of its own.** Picture-in-picture, the extended one included, with the controls right in the window.
- **Ten interface languages.**

![The player and the queue: a franchise by parts, the dub menu with qualities](docs/media/audio_select.png)

| Subtitles and their look | The loading window of the queue |
|---|---|
| ![The subtitle menu: track, size, backing, position](docs/media/sub.png) | ![The loading window: saved, now, queued, and the buttons to download, pause, cancel, delete](docs/media/save.png) |

The page reading is one general mechanism, not code written for particular
sites: Lapka looks for players, episode lists and dubs by the way a page is
built. Tested on: aniliberty.top, old.yummyani.me, jut-su.net, animego.me,
anidubonline.ru, gogoanime.by, jkanime.net, newdeaf.co. Other sites built the
same way mostly open too. Sites with DRM, and sites that deliberately lock
their players, Lapka does not break into.

## macOS application

Build `Lapka.app` for macOS 13.5 or newer. Unzip `Lapka-macos-arm64.zip` (Apple
Silicon) or `Lapka-macos-x64.zip` (Intel), move the app into Applications, and
open its icon. Node.js is included, and the player runs in its own WebKit window:
no terminal, npm or separate browser is needed to launch it. The ZIP is currently
a local build artifact; no release has been published.

Closing the window keeps the app in the Dock; opening its icon restores the
window. Cmd-Q, **Lapka → Quit Lapka**, and the player's Quit action stop the app
and its server. The desktop server uses `127.0.0.1:18800`; a conflicting port
shows an error and never terminates another process.

During playback the native window buttons hide with the player controls. Hover
near the top edge to reveal them. They remain visible on pause and while menus
are open; macOS manages them in fullscreen.

Settings and the initial library live in `~/Library/Application Support/Lapka`;
logs are in `~/Library/Logs/Lapka/server.log`. Choose another video folder in
Settings. Replacing or removing the app does not delete the library. Saving
video still needs a separately installed ffmpeg; watching does not. Extended
Document PiP is available in Chromium browsers, not in WebKit; the app supports
system video PiP. This opts into a guarded private WebKit preference because
Apple exposes the public configuration switch only on iOS. Support may need
revision if that SPI changes in a future macOS. Real AirPlay receiver playback
remains unverified.

Quit any app running from the output folder before rebuilding it. Build on macOS
with Node.js 22+ and Xcode Command Line Tools:

```bash
npm ci
npm run build:macos
npm run test:macos
```

Output: `dist/macos-arm64/Lapka.app` and a ZIP beside it (`macos-x64` on Intel).
The builder downloads official Node.js 24.13.0 and verifies the archive SHA-256.
For an offline runtime, use `npm run build:macos -- --node=/absolute/path/bin/node`;
Node's `LICENSE` must be beside `bin/`, or pass `--node-license=/path/LICENSE`.
`--arch=x64` targets Intel; runtime validation requires running that architecture
on the build machine.

Local builds use an ad-hoc signature. Public distribution needs a Developer ID
and notarization; set `LAPKA_SIGN_IDENTITY` to sign with a release identity.

## Running it

You need [Node.js](https://nodejs.org/) 22 or newer (tested on 24) and, only
for saving episodes to a file, [ffmpeg](https://ffmpeg.org/) in PATH. Watching
works without ffmpeg.

```bash
git clone https://github.com/MythHand/Lapka.git
cd Lapka
npm install
npm start
```

Open http://127.0.0.1:8800 in your browser. Chrome or Edge are recommended:
the extended picture-in-picture window exists only there. To stop the server:
Ctrl+C in the terminal.

Or without the terminal: `start.command` on macOS and `start.bat` on Windows
open by a double click, `./start.sh` on Linux. Each checks Node.js, installs
what is missing the first time, starts Lapka in the background and opens it
in the browser; that window can then be closed, Lapka keeps running. To stop
it: `stop.command`, `stop.bat` or `./stop.sh`, or the "Quit Lapka" button at
the foot of the settings (the gear). To update: `update.command`, `update.bat`
or `./update.sh` pulls the newest version into the same folder (not a second
`git clone`: git refuses to write into a folder that exists) and starts Lapka
again if it was running.

![Settings: shortcuts, language and player, the Lapka folder, cache, the quality to save in](docs/media/setting.png)

Lapka's files go into the folder you choose in the settings (the gear →
"Lapka folder"). Until the first choice it is `.dev/home` inside the project
folder. The `LAPKA_HOME` environment variable forces a folder, `PORT` changes
the port.

## If you are not a developer

In short: install Node.js from [nodejs.org](https://nodejs.org/) (the LTS
button), download this project (the green **Code** button → **Download ZIP**),
unpack it and double-click `start.command` (macOS) or `start.bat` (Windows).
The browser opens Lapka by itself.

Step by step for macOS, Windows and Linux, ffmpeg and the usual troubles
included: [docs/INSTALL.md](docs/INSTALL.md). If you are
installing with an AI assistant, give it the link to that file: everything it
needs for an exact answer is there.

## AirPlay (experimental)

In Safari on Mac, open an episode and click AirPlay next to Picture in Picture,
then choose an Apple TV or an AirPlay-enabled TV. Keep the computer running
Lapka and the receiver on the same local network. Allow incoming Node.js
connections if macOS asks. Browsers without the AirPlay API hide the button.

Handoff uses Safari's native playback, preserving position and pause state.
Multi-dub HLS playlists are pinned to the selected dub. The receiver controls
adaptive quality; Lapka's styled subtitle overlay is not sent to the TV.

Preparing a stream in Safari opens a separate port on a local network IPv4
address. It serves only the selected media through a random token URL; app
settings and other APIs stay on localhost. URLs are revoked on source changes
or stops and expire after 24 hours. To select a network adapter explicitly,
start with `LAPKA_AIRPLAY_HOST=192.168.1.10 npm start` (example address).

HTTP delivery and player behavior with a simulated Safari API in Chrome are
covered. Playback on a real AirPlay receiver, episode transitions and device
compatibility still require verification in Safari with hardware.

## Development

- `npm run dev` — Lapka on 8800 and the synthetic test site on 8801.
  `SITE_SLOW_MS=3000 npm run site` slows the synthetic site's files down, for
  trying pauses and the save queue by hand.
- `npm test` — all tests. `npm run check` — the static check of the front end.
  The tests of real sites run on snapshots of their pages, which are kept outside the
  repository; without them those tests report themselves as skipped.
- The map of the core and the contracts of its blocks: [core/README.md](core/README.md).

![npm test: 165 tests pass](docs/media/tests.png)

## Boundaries

Lapka is neutral: a tool on your machine that reads open pages with your own
requests. It does not break DRM, does not proxy traffic outward and keeps
nobody's data. What you watch and where is your responsibility.

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
