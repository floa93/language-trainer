# Language Trainer

A gamified course for Vietnamese (Northern / Hanoi). You work through stages, each with 10 lessons of about 10 sentences. It's a static site in plain HTML, CSS and JavaScript, hosted on GitHub Pages. There is no backend, no login and no build step. Learning progress is stored in your browser.

Live: https://floa93.github.io/language-trainer/

It's built on the same principles as the [Vietnamese vocabulary trainer](https://github.com/floa93/vietnamese): hash routing, a JSON data folder you edit by hand, a CI check of that data, and Web Speech text-to-speech and speech recognition.

## Features

- **Learning path**: stages (units) shown as a winding path of lessons. Lessons open one after the other; finishing one unlocks the next. Every lesson has an intro with a short grammar tip and the list of its sentences.
- **Lessons**: each sentence becomes an exercise of one of these types, mixed and shuffled:
  - *Select the correct translation*: an English sentence and three Vietnamese options.
  - *Translate (VI → EN)*: put English word tiles in the right order. The Vietnamese is read aloud.
  - *Translate (EN → VI)*: put Vietnamese word tiles in the right order.
  - *Tap what you hear*: listen (🔊 normal, 🐢 slow) and build the sentence from tiles.
  - *Read this aloud*: speech recognition (`vi-VN`) checks every word, tones included. *Can’t speak now* skips the speaking exercises for the rest of the lesson.

  Wrong answers come back at the end of the lesson. Other correct English translations are accepted (`alt` in the data).
- **XP, daily goal, streak**: a lesson gives 10 XP, or 15 with no mistakes. Pick a daily goal of 10, 20, 30 or 50 XP.
- **Practice**: 10 random sentences from the lessons you have completed.
- **Phrases**: every sentence in the course, searchable (accents optional, so `ca phe` finds `cà phê`) and filterable by stage, with 🔊 buttons.
- **Settings** (⚙ in the top bar): light or dark theme, daily goal, turn listening, speaking or autoplay on or off, *Unlock all lessons*, export and import of progress, reset, and a voice test.

Listening exercises and 🔊 buttons need a Vietnamese text-to-speech voice on the device. Without one they are hidden, and listening exercises become translation exercises. Speaking needs Chrome (Android/desktop) or Safari (iOS/macOS, with Siri & Dictation turned on). In other browsers speaking exercises become translation exercises.

## Project layout

```
index.html                 app shell (top bar, <main>, bottom navigation)
css/style.css              all styles; light theme, dark theme via Settings
js/app.js                  hash router (#/, #/lesson/<id>, #/lesson/<id>/play, #/practice, #/phrases, #/settings)
js/data.js                 loads data/course.json and the stage files
js/exercises.js            turns sentences into exercises (tiles, choices), checks answers
js/progress.js             completed lessons, XP, streak, settings in localStorage; export/import/reset
js/speech.js               text-to-speech (Web Speech API)
js/listen.js               speech recognition for speaking exercises
js/vietnamese.js           compares a spoken sentence word by word (tones, numbers)
js/util.js, js/theme.js    helpers, light / dark theme
js/views/*.js              one module per screen
data/course.json           list of stage files, in order
data/units/*.json          the stages: lessons and sentences – the only files you edit for content
scripts/validate-data.mjs  data checks (run in CI)
tests/unit/                unit tests (node --test): exercises, answer checking, progress
tests/e2e/                 browser tests (Playwright): lessons, practice, phrases, settings, layout
.github/workflows/deploy.yml  data check + unit tests + browser tests → deploy to GitHub Pages on push to main
```

## Adding content

### A sentence

Add it to a lesson's `items` in `data/units/<stage>.json`:

```json
{ "vi": "Cho tôi một bát phở.", "en": "A bowl of phở, please.",
  "alt": ["Give me a bowl of phở.", "A bowl of pho, please."],
  "note": "bát = bowl in the North (Southern: tô)." }
```

| field | required | notes |
|---|---|---|
| `vi` | yes | Northern (Hanoi) Vietnamese with full tone marks. Each syllable becomes a word tile. |
| `en` | yes | The main English translation. Its words become the English tiles. |
| `alt` | no | Other English translations that count as correct |
| `note` | no | Hint shown after answering (classifiers, politeness, Northern vs Southern words) |

You don't choose exercise types. The app makes every sentence into all of them.

### A lesson

Add an object to a stage's `"lessons"`. Lessons are played in the order they appear in the file.

```json
{ "id": "u3-l11", "title": "Emotions", "tip": "Optional short explanation shown before the lesson.", "items": [ … ] }
```

The `id` must be unique and **must never change**, because progress is stored under it.

### A stage

Create `data/units/04-<name>.json` with `{ "id": "u4", "title": "…", "description": "…", "lessons": [ … ] }` and add the file name to `"units"` in `data/course.json`.

Commit and push to `main`. The GitHub Action checks the data (valid JSON, required fields, unique ids, no duplicate sentences in a lesson, at least 4 sentences per lesson; it warns when a lesson doesn't have 10). If the check passes, it deploys the site. Existing progress is kept.

To run the check locally (needs Node.js): `node scripts/validate-data.mjs`

## Tests

Every push and pull request runs three checks in GitHub Actions. The site is only deployed when all of them pass:

1. **Data and syntax**: `node scripts/validate-data.mjs` and `node --check` on every script.
2. **Unit tests** (`npm run test:unit`, plain Node, no install needed). They check that every sentence's tiles can build its answer, that multiple-choice options are unambiguous, the spoken-sentence checking (tones, numbers), unlocking, XP, streak, and export/import.
3. **Browser tests** (`npm run test:e2e`, Playwright with Chromium, phone and desktop size). They play whole lessons, including a wrong answer and skipping speaking, and test practice, phrase search, settings, backup/restore and the no-horizontal-scroll rule at 360 px. The browser has no Vietnamese voice or microphone in CI, so the tests swap in a fake voice and a fake speech recognizer that "hears" the sentence on screen.

If browser tests fail, the run uploads a `playwright-report` artifact with screenshots and traces.

Run them locally (needs Node.js 22):

```sh
npm ci
npm test                              # data check + unit + browser tests
npx playwright install chromium       # once, or use your installed Chrome:
PW_CHANNEL=chrome npm run test:e2e
```

## Running locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk doesn't work, because browsers block `fetch()` of local files.)

## GitHub Pages setup (one time)

Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
