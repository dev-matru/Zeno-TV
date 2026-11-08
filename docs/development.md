# Development

## Run it

You need Node.js 22+ and Python 3.10+.

```sh
npm ci
npm run dev          # http://localhost:4795/home/
```

The preview serves `app/`, the same files that go into the TV package. Use the arrow keys, Enter (OK) and Escape (Back). Hold Enter for the context menu. Anything that needs the TV (launching apps, switching inputs) says so instead of pretending to work.

`npm run dev:public` serves only what is in the repository, without your personal assets. Use it to see what a fresh clone looks like.

## Layout

```
app/                the TV app (HTML, CSS, ES5 JavaScript)
  main.js           screens, focus and settings: wires the modules together
  src/core/         shared helpers, remote input, focus, translations, remote shortcuts
  src/state/        saved preferences, the TV and PC tiles, personal app styles
  src/home/         Grid layout maths, widgets, weather and clock
  src/sources/      HDMI inputs and their icons
  src/system/       talking to Tizen, the network service, system information
  src/look/         glass materials, card colours, colours measured from app icons
  src/type/, src/ui/  typefaces, icons and the logo
  styles/           one stylesheet per area, loaded in order
  service/          background service on the TV (local network, wallpaper cache)
  locales/          translations, one file per language
  assets/           fonts, photos, glass materials, icons, generated data
scripts/
  dev/              local preview server
  build/            packaging, materials, translations, audio, logo
  checks/           syntax, manifest and browser tests
  tv/               install, launch and the optional native Home helper
  lib/              shared helpers (app identity, TV checks, SDB transport)
docs/               this file, TV setup, credits
scripts/dev/demo/   made-up apps that stand in for a TV in the checks
```

The TV runs an older web engine, so code in `app/` stays ES5: `var`, `function`, no arrow functions, no modules. Each file in `src/` is a function that adds one object to `window` (`ZenoSources`, `ZenoWidgets`…) or to `window.Zeno`. Tools in `scripts/` can use modern JavaScript and Python.

Code is formatted automatically: `npm run format` for JavaScript and CSS (Prettier), `ruff format scripts` for Python. `npm run check:format` fails if something is not formatted.

The stage is a fixed 1920×1080 canvas scaled to the screen. Check changes at 1920×1080 and 1280×720.

## Checks

```sh
npm run check            # syntax of every app script + manifest and bundled files
npm run check:public     # nothing personal or secret is tracked by Git
npx playwright install chromium
npm run check:browser    # navigation, settings, persistence in a real browser
```

More focused browser tests are listed in `package.json` (`check:desktop`, `check:palette`, `check:alignment`…). Set `ZENO_PUBLIC=1` to run them without your personal assets. They run against a private preview with a fresh browser profile and never contact a TV.

## Personal assets

Some things you may want on your own TV can't be shared: commercial fonts, service logos, a wallpaper catalogue you don't own. Put them in `.local/personal/`, which Git ignores. The preview and `npm run package` layer that folder over `app/`. The public source never contains them.

```
.local/personal/
  fonts.json                 fonts to offer in Settings → Typography
  fonts/<folder>/<files>     the font files named in fonts.json
  online-wallpapers.json     {"entries": [...]} wallpapers downloaded on the TV
  identity.json              your app ids on the TV (see TV setup)
  storage.json               old saved-data names to carry over after a rename
  apps.json                  your own logo or colour for some apps (see below)
  music/<files>              your own tracks for the music widget (see below)
  music.json                 optional order, titles and notes for those tracks
  screenshot-apps.json       apps to show in the README screenshots (see below)
  overlay/<path>             any file, used as if it were app/<path>
```

A `fonts.json` entry looks like this:

```json
[
  {"id": "myfont", "name": "My Font", "family": "My Font", "folder": "myfont",
   "files": [["MyFont-Light.woff2", 300], ["MyFont-Regular.woff2", 400]],
   "metrics": "", "display": 300, "ui": 400, "clock": 300}
]
```

Zeno lists whatever the TV reports as installed: each app keeps its own name and icon, and in the "brand" card style its card takes the main colour of that icon. To give some apps your own logo or colour, add `apps.json`:

```json
{ "AbCdEf1234.SomeApp": { "logo": "someapp", "color": "200,40,60" } }
```

The key is the app id on the TV (`scripts/tv/native-home/run.py inspect` lists them), `logo` names an SVG in `overlay/assets/icons/`, `color` is "r,g,b". After adding logos, run `node scripts/build/build-icon-metrics.mjs` to measure them and copy the result to `overlay/assets/icons/metrics.js`.

### Music

Put audio files (`.m4a`, `.mp3`, `.aac` or `.wav`) in `.local/personal/music/`. They are added to the package and appear in the music widget after the built-in tracks, titled after their file names. To choose the order, the titles or a short note, list them in `music.json`; only the files listed there are used:

```json
[
  {"file": "evening.m4a", "title": "Evening", "note": "Recorded at home"},
  {"file": "rain-on-roof.mp3", "title": "Rain on the roof"}
]
```

Every track loops until you pause it or switch track. Keep an eye on the package size: the whole app has to be copied to the TV at every update.

The built-in tracks and the timer alarm are generated, not recorded: `python3 scripts/build/build-demo-audio.py` (or `... rain alarm` for just some) writes them to `app/assets/audio/`. The encoding uses macOS `afconvert`.

### Screenshots

`node scripts/build/readme-images.mjs` renders `docs/images/` with a pretend TV. Without other files it lists the made-up apps in `scripts/dev/demo/apps.json`, shown with their initials. With `.local/personal/screenshot-apps.json` (`[{"id": "...", "name": "..."}]`, in the order you want them on the Home) it uses those apps and your personal build, logos and colours included.

## Wallpapers and glass

The glass effect is not live blur: the TV is too slow for that. Every wallpaper ships with pre-rendered versions (blurred, frosted, clear, soft), and cards show the matching crop of those images. Changing focus only moves and fades things.

To add a photo:

1. Add it to `app/assets/wallpapers/SOURCES.json` with its credit.
2. Prepare the background and thumbnail: `python3 scripts/build/prepare-wallpapers.py /path/to/originals --ids <id>`.
3. Render the materials: `node scripts/build/build-materials.mjs <id>`. The output goes to `.local/materials/builder/`. Check it, then copy `*-panel.jpg` to `app/assets/wallpapers/` and the rest to `app/assets/materials/`.
4. Add the entry to `app/assets/wallpapers/catalog.js`.
5. Update the colour hints: `python3 scripts/build/build-wallpaper-colors.py`.
6. Credit it in `docs/credits.md`.

Downloaded wallpapers work differently. The service on the TV fetches them through an image proxy that produces the same blurred variants, then keeps them in the TV's private storage.

## Preferences

Preferences are stored in the TV's `localStorage`. The main key is `zeno.home.v1`. Home apps are saved by their app id on the TV, so they survive the app list being unavailable for a moment. Widgets, sources, remote keys and language each have their own `zeno.*` key. Older keys from earlier versions are read once and migrated, so updating never resets the Home.

## Packaging

`npm run package` builds and signs `dist/ZenoTV.wgt` with the Tizen SDK and certificates in `.local/`. See [TV setup](tv-setup.md).

`npm run export:public` builds an unsigned package from the public source only. It needs no certificates and never contacts a TV.
