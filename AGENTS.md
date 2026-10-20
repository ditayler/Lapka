# Working on Lapka

## Product and documentation

Lapka is a local player for videos, films and series. Describe it as a player,
not an anime-only player. Anime sites and fixtures remain valid supported cases.
Keep playback and the user's library local; preserve browser and macOS use cases.

- [README.md](README.md) covers the product, installation, building and releases.
- [core/README.md](core/README.md) describes the backend modules and contracts.
- Keep the root README, CHANGELOG and installation guide in English. Do not
  recreate `README.ru.md`, `CHANGELOG.ru.md` or `docs/INSTALL.ru.md` unless
  requested. Localized module documentation still exists and should keep
  working links.
- UI text lives in [web/i18n.js](web/i18n.js). Update all ten dictionaries when
  adding or changing shared wording; preserve translation keys and placeholders.

## Code map and conventions

- `core/main.mjs`: CLI/server entry; `core/lapka.mjs`: orchestration.
- `core/catalog/`, `session/`, `discover/`, `extract/`, `deliver/`, `store/`:
  catalog, network access, discovery, extraction, delivery and persistence.
- `core/sites/` and `profiles/`: site-specific contributions to generic discovery.
  Improve the generic mechanism when possible; keep adapters behind their contracts.
- `core/http/`: HTTP routes, stream delivery and the separate AirPlay listener.
- `web/`: plain browser JavaScript, HTML and CSS. Preserve this structure unless
  the task calls for an architectural change; there is no frontend build step.
- `desktop/macos/`: Swift AppKit/WKWebView shell; `core/desktop.mjs`: its Node
  process. Native changes should not change browser behavior accidentally.
- `scripts/`: build/check/test tools; `test/`: Node tests, browser fixtures and
  native acceptance; `npm/lapka/`: the short-name npm launcher.

Use the existing ESM `.mjs` conventions for Node code. Keep changes focused and
reuse existing interfaces. Preserve the server's loopback/origin checks and
`x-lapka` protection on mutations. AirPlay alone may expose token-scoped media
on the LAN; do not expose settings, arbitrary files or the app API through it.

## Running and verification

Use Node.js 22+ for the application; release automation uses Node.js 24.
Install dependencies with `npm ci` and keep the lockfile consistent with changes.

| Command | Purpose |
| --- | --- |
| `npm start` | Browser application, normally `127.0.0.1:8800` |
| `npm run dev` | Application on 8800 and synthetic test site on 8801 |
| `npm run check` | Frontend syntax, translations, selectors and references |
| `npm test` | Node tests, including browser/media tests |
| `node --test test/update.test.mjs` | Example of running a focused test file |
| `npm run build:macos` | Fresh native app and ZIP in `dist/macos-<arch>/` |
| `npm run build:dmg` | DMG from an existing built app |
| `npm run test:macos` | Native acceptance against a built app |

For packaging/server/update changes, the focused CI checks are:

```sh
npm run check
node --test test/macos-build.test.mjs test/dmg-build.test.mjs test/desktop.test.mjs test/update.test.mjs
```

Run checks appropriate to the change and the full suite for broader behavior
changes. Media tests and the synthetic site's clips need ffmpeg. Browser tests
use a Chromium-family browser; `CHROME` can select its executable. Some real-site
tests require private snapshots and skip without them. Native acceptance needs
macOS, Xcode Command Line Tools and a graphical session.

Report missing prerequisites, skips and environment restrictions separately
from source failures. Passing simulated AirPlay/browser tests does not establish
playback on an actual receiver or WKWebView PiP behavior; verify those in their
real environment when changing them.

## macOS builds and user data

- The app targets macOS 13.5+, bundles Node and owns a server normally on
  `127.0.0.1:18800`. Keep its startup/shutdown and port-conflict handling intact.
- Window close keeps the app running; Cmd-Q stops it and its server. Coordinate
  shutdown before replacing a user's running bundle; never kill an unrelated
  process or remove the library to fix a launch problem.
- Settings and the default library live outside the bundle in
  `~/Library/Application Support/Lapka`; a chosen library may live elsewhere.
  Logs are in `~/Library/Logs/Lapka/server.log`. Updates replace the app, not its
  bundled source files. Desktop update checks use published Releases, not tags.
- Put temporary verification bundles under `.dev/` to avoid extra app copies
  appearing in Spotlight. For example:
  `npm run build:macos -- --output=.dev/verification/Lapka.app` and
  `npm run build:dmg -- --app=.dev/verification/Lapka.app`.
  Native acceptance accepts that app as a positional argument:
  `npm run test:macos -- .dev/verification/Lapka.app`.
- DMG names use the built app's recorded version and architecture, not the
  current checkout version: `Lapka-<version>-macos-<arch>.dmg`.
- Preserve checksum validation and runtime licensing in the builder. Signing
  is currently ad-hoc, without notarization; do not describe downloads as
  Developer ID signed or notarized unless that has been configured and verified.
- Keep build progress readable in terminals and CI, with no elapsed-time column.

## Releases and GitHub

The working fork is `ditayler/Lapka`; upstream is `MythHand/Lapka`. Inspect Git
remotes before pushing: `origin` may still point upstream. Use an explicit
repository when running `gh` commands, and follow the user's requested target.

- Use Conventional Commits: `fix:` for patch, `feat:` for minor, and a
  `BREAKING CHANGE:` footer for major. Squash messages need the same format.
- [Release](.github/workflows/release.yml) is dispatched manually on `main`.
  [.releaserc.cjs](.releaserc.cjs) controls version analysis and generated notes.
  Use headings such as `## 1.4.0 — 20 October 2026`, with English dates in UTC.
- The changelog plugin prepends notes while preserving existing history. It runs
  before npm/git preparation; the version commit includes `CHANGELOG.md`,
  `package.json` and `package-lock.json`. Do not manually bump versions for a
  normal automated release. npm publishing is disabled.
- Semantic-release creates a version tag and draft. The reusable
  [macOS release workflow](.github/workflows/macos-release.yml) builds that exact
  tag for Apple Silicon and Intel, verifies checksums, uploads only the two
  DMGs, and adds their checksums to release notes before publishing the draft.
  ZIPs and checksum files stay in Actions artifacts. Both builds must succeed.
- No releasable commits means no new version or packaging. After a packaging
  failure, rerun **macOS release** with the existing tag; the draft remains.
- Release automation uses the built-in `GITHUB_TOKEN`. Changes to branch
  protection or authentication must preserve the version commit and avoid
  duplicate packaging runs. Do not run a live release merely to test the workflow.

Keep generated bundles, caches, logs, private snapshots and real media out of
Git. Respect `.gitignore`, the existing license notices and trademark files.
