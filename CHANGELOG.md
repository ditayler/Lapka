# What's new

The releases of Lapka, newest first. The "Check for an update" button in the
settings looks at the same releases on GitHub.

## 1.5.0 — 20 October 2026


### Bug Fixes

* add a dark macOS drag-and-drop installer ([aa26d54](https://github.com/ditayler/Lapka/commit/aa26d54355edcccfb4edc3b7e3bc2b48b117aea9))
* add Check for Updates to the macOS menu ([f4bba4d](https://github.com/ditayler/Lapka/commit/f4bba4dec6097fc2701370eda50225507539ece2))
* avoid horizontal scrolling in macOS installer ([4daf10b](https://github.com/ditayler/Lapka/commit/4daf10bfba1ddea58c044202efe6daaa17a2bd18))
* cover enlarged macOS installer windows ([dd45dee](https://github.com/ditayler/Lapka/commit/dd45dee4808f92f7d78ea4298ff40171a77ffc00))
* preserve original changelog heading format ([af32232](https://github.com/ditayler/Lapka/commit/af3223252f0f633836280afa7bcebd74594bd42d))
* preserve original changelog heading format ([e9b3757](https://github.com/ditayler/Lapka/commit/e9b37572f629416b63a08148e76f1cf03377d4fc))
* publish only DMG assets for macOS releases ([35efa3a](https://github.com/ditayler/Lapka/commit/35efa3aa77bfc6a9337202e499d821bf54dc4286))


### Features

* add a dark macOS drag-and-drop installer ([46cfca2](https://github.com/ditayler/Lapka/commit/46cfca268c3497ee1ec2f63e7b3ce1cd9f1c43ac))
* add Check for Updates to the macOS menu ([c42f367](https://github.com/ditayler/Lapka/commit/c42f367aed9680ec03a9d839fee097e28d749c3f))

## 1.4.0 — 20 October 2026


### Bug Fixes

* describe Lapka as a general video player ([702e4ab](https://github.com/ditayler/Lapka/commit/702e4ab8d20cd88b2424de165d9178bb0bfd15ba))
* tailor quit and restart guidance for macOS app ([9ad01c2](https://github.com/ditayler/Lapka/commit/9ad01c2a11ec5c4dacfb9575a79d5cf20cc040d0))


### Features

* add experimental Safari AirPlay streaming ([5ef10eb](https://github.com/ditayler/Lapka/commit/5ef10ebe001ab77e57fe5284a2a7f593461b2fa4))
* add standalone macOS app with native playback controls ([6672937](https://github.com/ditayler/Lapka/commit/66729374e17727c56952cec6c2602de2613f3822))
* add versioned DMG packaging and simplify macOS PiP ([cd64cdd](https://github.com/ditayler/Lapka/commit/cd64cdd3547df94be38a46883ae8c275fc81394b))
* automate macOS release builds and show packaging progress ([3b2a40f](https://github.com/ditayler/Lapka/commit/3b2a40f4f47687b476dd957689fa870313dbfc50))
* generate changelog during macOS releases ([5e2fe59](https://github.com/ditayler/Lapka/commit/5e2fe593c0101035b4e068da7e92e5604a7dbe15))
* publish versioned macOS releases with semantic-release ([70b02c1](https://github.com/ditayler/Lapka/commit/70b02c14125d5fcdbf8aaf58af2189dc27aa6fe8))
* publish versioned macOS releases with semantic-release ([0dbb591](https://github.com/ditayler/Lapka/commit/0dbb59158c7902549f32840d6cb386b93fa665fb))

## 1.3.0 — 17 October 2026

- **The pause window.** On pause the frame shows the series: cover, year, kind, episode count,
  genres, studio, source material, age rating and the dubs of this part. Switched off in the
  settings.
- **The history of links.** There is no separate button any more: the link field in the queue's
  footer opens the history on focus and searches it, the arrows and Enter open a record. On the
  right, the part of the franchise with its cover, year and episode count.
- **Dubs by part.** A map of parts × episodes, at a button in the queue's header and as the right
  column of the dub menu: which episodes have which dubs. Hovering a name lights the episodes,
  hovering an episode lights the names.
- **Playing saved episodes.** A saved episode plays from its own file, without going to the site.
  In the dub menu its dub is marked "on disk".
- **Loading ahead.** A new setting, on by default: the episode is pulled onto the disk while it
  plays, the next one once this one is there whole. The timeline shows what is already on the
  disk. What was pulled stays, even when the site changes the stream's addresses.
- **Holding through a broken connection.** A break does not change the dub or the quality: Lapka
  waits for the same stream several times and only then takes another source. A pause set by
  hand stays a pause through the switch.
- **The episode row in the queue** shows the number of sources of the chosen dub instead of the
  player's name.
- **Reading pages.** New page layouts are read: episode data inside the page's scripts, playlists
  with several qualities in one line, signed addresses re-read when they expire. Titles are
  cleaned of quotes and service tails.
- **Notices.** A failure to join the video in the buffer is named as such, not as "the source is
  not answering".

## 1.2.0 — 2 October 2026

- **The history as a list.** The search at the bottom, the title and the count on top; one row per
  franchise. Each record says where you stopped: the part, the episode, the time, the dub. Dates
  as "today", "yesterday" or the date. A record is removed with a cross. The "links in history"
  setting.
- **The dub for the whole franchise.** The choice is kept under every part open; the same link or
  another part starts in that dub. A chosen quality level is kept as the wanted quality.
- **Reasons in words.** Why a link did not open or a save broke off, the page says in its language
  and to the point: the page, the player, the network, the stream, ffmpeg or the disk refused.
- **Waiting for a source.** A source that took the connection and stays silent no longer holds the
  player for minutes: the wait is limited to seconds, then another source is taken.
- **Interface.** Lapka's own thin scrollbar everywhere; the notice after quitting says how to
  start again, for your system; Esc closes one layer at a time; the queue is never narrower than
  its narrow width.

## 1.1.3 — 25 September 2026

- **The history of pasted links.** A button with a clock in the queue's footer: the title, the
  year, the episodes, the cover, the date and the stopping place; a record opens from that place.
  The last hundred links are kept, the covers lie in the Lapka folder, the list opens without a
  request to any site.
- **The stopping place** is one per episode whatever the dub; it is not lost when the tab closes
  or when Lapka quits.
- **The chosen quality** actually plays, not only shows on the button.

## 1.1.2 — 24 September 2026

- **The save window** is built as the dub menu is: a row per dub, the qualities as tags on the
  right. A tag chooses both the dub and the quality. A group and the queue are saved in the dub
  and quality named; episodes without that dub are marked.
- **A taken port.** A Lapka started on a port already taken says so itself: another Lapka is opened
  in the browser, for another program the next port is suggested.

## 1.1.1 — 23 September 2026

- **Starting through npx.** `npx -y lapka` installs and starts Lapka with no download and no
  project folder; the next start takes the new version by itself. Such a Lapka keeps saved
  episodes in a `Lapka` folder in the home folder until another is chosen.
- **The settings file** lives in the user's system settings folder, one for every way of starting.
- **The language of the log and the update.** The reading log and the update steps speak the
  interface language, in ten languages.
- **Launchers** write nothing into the program folder; stopping and restarting go through Lapka
  itself.

## 1.1.0 — 23 September 2026

- **Watched marks.** An episode watched to the end is marked; the bar shows the stopping place
  before the episode is started.
- **Skipping openings automatically.** A setting in the player section: the "Watch" plate fills
  for six seconds, the cross skips at once.
- **The new settings sheet.** The paw instead of the gear; four columns: the state and quitting,
  the interface, the player, the storage; the shortcuts as a band along the bottom. The storage
  shows the weight of the folder, the saved videos, the notes and the cache, each with a delete
  button.
- **The reading log on the black screen.** While a page is read, the steps of the reading and the
  parts of the franchise are seen as they come.
- **Updating from the settings.** "Check for an update" → "Update to v…", for a cloned folder and
  for a downloaded ZIP.
- **Ten interface languages.**

## 1.0.0 — 16 September 2026

The first public version: a link to a page → episodes, dubs, qualities and subtitles in Lapka's
own player; the queue by franchise; switching the dub without a reload; skipping openings by the
site's timings; resuming from the stopping place; saving an episode as one file with a queue of
downloads; picture-in-picture, the extended one included; launchers for macOS, Windows and Linux;
a quit button in the settings.
