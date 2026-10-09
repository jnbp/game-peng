# Peng

A party game for a single phone. The phone is the bomb: roll a task, light the fuse, say a word, pass it on. Whoever holds the phone when it goes off takes a point. Whoever has the most points at the end loses.

**Play:** [peng.bapo.me](https://peng.bapo.me)

The game is available in German and English and follows the device language by default.

## How a round works

1. Set the number of players (names are optional), pick categories, start.
2. Roll: the phone rolls a category and explains it in two sentences.
3. Ready: the task fills the screen and the bomb is lit straight away. If you would rather read first, switch ignition to "By button".
4. The bomb ticks for a random time. The screen is locked meanwhile; only a two-second hold pauses it.
5. Bang: tap who was holding the phone. Whoever got caught starts the next round.

## Categories

| Category | Task |
|---|---|
| Syllable | A word containing the letters. `SH__` means at the start, `__SH` at the end, `__SH__` in the middle, no blanks means anywhere. |
| Famous | A famous person whose first or last name starts with one of the two letters. |
| Question | Name something that fits the question. |
| Compound | Build a compound word; the word shown may go in front or behind. |
| Scramble | A word of at least four letters from the scrambled letters. |
| Chain | Every word connects to the one before: by meaning, by its last letter, or as a compound chain (doorbell, bellboy). |

The dice pick the category, or you choose it yourselves before every round.

## Settings

- Language: German, English or both. In bilingual mode every task is shown in both languages.
- Fuse time: any range you like, 10 to 60 seconds by default.
- Difficulty: easy, medium, hard. It drives syllables, letters, questions and the chain rule.
- Ignition: automatic after "Ready", or by button.
- Rounds, sound, vibration (Android only), safe rule.
- Appearance: dark or light background, accent colour, orientation. "Landscape" rotates the game even with rotation lock on.

Everything is stored in the browser. After the first load the game also works offline and can be added to the home screen.

## Adding content

All tasks live in `data/`, one entry per line. The format is described at the top of each file.

| File | Content | Format |
|---|---|---|
| `data/syllables.js` | Syllables, separate lists for German and English | `SCH:sme:1` (text, allowed positions, level) |
| `data/questions.js` | Questions | `1 \| German \| English` |
| `data/compounds.js` | Words for Compound | `1 \| German \| English` |
| `data/scramble.js` | Source words for Scramble | `1 \| WORD` |
| `data/chains.js` | First words for Chain | `German \| English` |

Level 1 is easy, 2 medium, 3 hard. To verify, run `node scripts/check-data.mjs`; it reports format errors and duplicates.

After any change, bump the version number in `sw.js`, otherwise devices that already installed the game keep seeing the old version for a while.

## Tech

Plain HTML, CSS and JavaScript with no build step. A simple local server is enough, e.g. `python3 -m http.server`. Hosted on GitHub Pages.

| File | Content |
|---|---|
| `index.html` | Page skeleton |
| `css/style.css` | Design |
| `js/app.js` | Screens and game flow |
| `js/tasks.js` | Reads `data/` and draws tasks without repeats |
| `js/audio.js` | All sounds, synthesised in the browser (no audio files) |
| `js/i18n.js` | UI copy in German and English |
| `sw.js`, `manifest.webmanifest` | Offline cache and installation |

For testing, `?t=5` in the URL sets a fixed fuse time of five seconds.

Fonts: Anton and IBM Plex (SIL Open Font License), loaded from Bunny Fonts and cached for offline use after the first visit.

Peng is an independent hobby project with its own content and is not affiliated with the makers of similar board games.
