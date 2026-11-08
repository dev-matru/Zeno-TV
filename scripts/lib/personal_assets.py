"""Personal asset overlay for the local preview and the owner's package.

The public source ships only openly licensed fonts, the bundled photographs and
original icons. Anything else lives in the ignored folder `.local/personal/`
and is layered over `app/` at preview or package time. It is never copied into
`app/`, so it cannot be committed by accident.

`.local/personal/` layout (all optional):

    fonts.json               list of fonts: id, name, family, folder, files
                             ([file, weight] pairs), metrics, display, ui, clock
    fonts/<folder>/<file>    the font binaries named in fonts.json
    online-wallpapers.json   {"entries": [...]} downloadable wallpaper catalogue
    storage.json             older localStorage keys to carry over (see personal_storage_script)
    identity.json            your app ids on the TV (see scripts/lib/identity.py)
    apps.json                logo and card colour per app id (see personal_app_styles)
    music/<file>             your own tracks (.m4a, .mp3, .aac, .wav), added to the
                             music widget after the built-in ones (see personal_music)
    music.json               optional order and titles: [{"file", "title", "note"}]
    overlay/<path>           any file, served or packaged as app/<path>
"""

from pathlib import Path
import json
import re
import zipfile

import identity

ROOT = Path(__file__).resolve().parents[2]
PERSONAL = ROOT / '.local' / 'personal'
PUBLIC_FONT_IDS = ['geist', 'newsreader']
ONLINE_CATALOG = 'service/online-wallpapers.json'
MUSIC_TYPES = {'.m4a', '.mp3', '.aac', '.wav'}


def is_runtime_source(name):
    """Keep retained rendering tools and legacy layout assets out of the widget."""
    if name in ['grid.css', 'optics.js']:
        return False
    if name.startswith(('assets/grid/', 'assets/vendor/')):
        return False
    return not re.fullmatch(r'assets/wallpapers/[^/]+-glass-\d+\.png', name)


def _inside(path, root):
    path = path.resolve()
    return path.is_relative_to(root.resolve()) and path.is_file()


def _fonts(root):
    manifest = root / '.local/personal/fonts.json'
    if not manifest.is_file():
        return [], {}, []
    fonts_root = root / '.local/personal/fonts'
    assets, css, entries = {}, [], []
    for font in json.loads(manifest.read_text()):
        files = [(fonts_root / font['folder'] / name, name, weight) for name, weight in font['files']]
        # Skip incomplete sets and anything that resolves outside the personal folder.
        if not files or not all(_inside(path, fonts_root) for path, _, _ in files):
            continue
        for path, name, weight in files:
            relative = font['folder'] + '/' + name
            assets['assets/private-fonts/' + relative] = path
            css.append(
                "@font-face{font-family:'" + font['family'] + "';font-style:normal;"
                'font-weight:'
                + str(weight)
                + ";src:url('private-fonts/"
                + relative
                + "') format('"
                + ('woff2' if name.endswith('.woff2') else 'truetype')
                + "');"
                'font-display:block;' + font.get('metrics', '') + '}'
            )
        entries.append({key: font[key] for key in ['id', 'name', 'family', 'display', 'ui', 'clock']})
    return entries, assets, css


def personal_overlay(root=ROOT, include_private=True):
    """Return package-relative paths mapped to bytes or files under .local/personal."""
    assets = {}
    fonts, css = [], ['/* Personal font overlay: empty in the public source. */']
    catalog = []
    if include_private:
        fonts, font_files, font_css = _fonts(root)
        assets.update(font_files)
        css.extend(font_css)
        overlay = root / '.local/personal/overlay'
        if overlay.is_dir():
            for source in sorted(overlay.rglob('*')):
                if source.is_file() and not source.is_symlink() and _inside(source, overlay):
                    assets[source.relative_to(overlay).as_posix()] = source
        online = root / '.local/personal/online-wallpapers.json'
        if online.is_file():
            catalog = json.loads(online.read_text()).get('entries', [])
            assets[ONLINE_CATALOG] = online
    assets['assets/private-fonts.css'] = ('\n'.join(css) + '\n').encode()
    assets['assets/font-catalog.js'] = (
        'window.ZenoLocalFonts = ' + json.dumps(fonts) + ';\n'
        'window.ZenoFontIDs = ' + json.dumps([f['id'] for f in fonts] + PUBLIC_FONT_IDS) + ';\n'
    ).encode()
    personal_js = (
        'window.ZenoWallpapers = (window.ZenoWallpapers || []).concat(' + json.dumps(catalog) + ');\n'
        if catalog
        else '/* No personal wallpaper catalogue. */\n'
    )
    storage = root / '.local/personal/storage.json'
    if include_private and storage.is_file():
        personal_js += personal_storage_script(json.loads(storage.read_text()))
    if include_private:
        personal_js += personal_app_styles(root)
        tracks, music_files = personal_music(root)
        assets.update(music_files)
        if tracks:
            personal_js += 'window.ZenoPersonalMusic = ' + json.dumps(tracks, ensure_ascii=False) + ';\n'
    assets['assets/personal-catalog.js'] = personal_js.encode()
    return assets


# Runs before any module reads localStorage, on every start (each step is a no-op
# once done): copies values saved under old key names to the current ones, renames
# fields inside the saved home, and replaces old app ids wherever the home and the
# remote shortcuts store them.
_STORAGE_SCRIPT = """(function (keys, fields, ids) {
  function renamed(id) {
    return Object.prototype.hasOwnProperty.call(ids, id) ? ids[id] : id;
  }
  function renameList(list) {
    return Array.isArray(list) ? list.map(renamed) : list;
  }
  function renameKeys(object) {
    if (!object || typeof object !== 'object') return object;
    var out = {};
    Object.keys(object).forEach(function (key) {
      out[renamed(key)] = object[key];
    });
    return out;
  }
  function renameDesktop(desktop) {
    if (desktop && typeof desktop === 'object') desktop.positions = renameKeys(desktop.positions);
  }
  try {
    Object.keys(keys).forEach(function (key) {
      var old = localStorage.getItem(keys[key]);
      if (localStorage.getItem(key) === null && old !== null) localStorage.setItem(key, old);
    });

    var home = JSON.parse(localStorage.getItem('zeno.home.v1') || 'null');
    if (home) {
      Object.keys(fields).forEach(function (field) {
        if (home[field] === undefined && home[fields[field]] !== undefined) home[field] = home[fields[field]];
      });
      ['home', 'dock', 'recent'].forEach(function (name) {
        home[name] = renameList(home[name]);
      });
      if (typeof home.lastApp === 'string') home.lastApp = renamed(home.lastApp);
      home.cardColors = renameKeys(home.cardColors);
      renameDesktop(home.desktop);
      if (home.look && typeof home.look === 'object') {
        home.look.cardColors = renameKeys(home.look.cardColors);
        renameDesktop(home.look.desktop);
      }
      localStorage.setItem('zeno.home.v1', JSON.stringify(home));
    }

    var remote = JSON.parse(localStorage.getItem('zeno.remote.v1') || 'null');
    if (remote) {
      Object.keys(remote).forEach(function (button) {
        var target = remote[button];
        if (typeof target === 'string' && target.indexOf('app.') === 0) remote[button] = 'app.' + renamed(target.slice(4));
      });
      localStorage.setItem('zeno.remote.v1', JSON.stringify(remote));
    }
  } catch (ignore) {}
})(%s, %s, %s);
"""


def personal_storage_script(storage):
    """storage.json: earlierHomeKeys [old home keys], renamedKeys {new: old},
    renamedHomeFields {new: old}, renamedAppIds {old: new}."""
    script = ''
    earlier = storage.get('earlierHomeKeys', [])
    if earlier:
        script += (
            'window.ZenoEarlierHomeKeys = (window.ZenoEarlierHomeKeys || []).concat('
            + json.dumps(earlier)
            + ');\n'
        )
    keys = storage.get('renamedKeys', {})
    fields = storage.get('renamedHomeFields', {})
    ids = storage.get('renamedAppIds', {})
    if keys or fields or ids:
        script += _STORAGE_SCRIPT % (json.dumps(keys), json.dumps(fields), json.dumps(ids))
    return script


def personal_app_styles(root):
    """apps.json: {appId: {"logo": name in overlay/assets/icons, "color": "r,g,b"}}."""
    styles = root / '.local/personal/apps.json'
    if not styles.is_file():
        return ''
    return 'window.ZenoAppStyles = ' + json.dumps(json.loads(styles.read_text())) + ';\n'


def personal_music(root):
    """Tracks in music/, as (playlist entries, {package path: file}).

    Without music.json every audio file is listed by name, its title taken from
    the file name. With it, only the files it names, in its order and with its
    titles and notes. Files are packaged as assets/music/track-N.<ext>, so odd
    characters in a file name never reach a URL.
    """
    folder = root / '.local/personal/music'
    if not folder.is_dir():
        return [], {}
    found = {
        p.name: p
        for p in sorted(folder.iterdir(), key=lambda p: p.name.lower())
        if p.is_file() and not p.is_symlink() and p.suffix.lower() in MUSIC_TYPES and _inside(p, folder)
    }
    listing = root / '.local/personal/music.json'
    if listing.is_file():
        wanted = [
            e for e in json.loads(listing.read_text()) if isinstance(e, dict) and e.get('file') in found
        ]
    else:
        wanted = [{'file': name} for name in found]
    tracks, files = [], {}
    for n, entry in enumerate(wanted, 1):
        source = found[entry['file']]
        path = 'assets/music/track-%d%s' % (n, source.suffix.lower())
        title = entry.get('title') or re.sub(r'[_-]+', ' ', source.stem).strip() or 'Brano %d' % n
        tracks.append(
            {
                'id': 'personal-%d' % n,
                'title': str(title)[:80],
                'note': str(entry.get('note') or '')[:120],
                'src': path,
            }
        )
        files[path] = source
    return tracks, files


def _apply_identity(app, overlay, ident):
    """Put your own app ids into every packaged file that names the public ones."""
    marker = identity.public().package
    for source in app.rglob('*'):
        if source.suffix not in ('.js', '.xml') or not source.is_file():
            continue
        name = source.relative_to(app).as_posix()
        current = overlay.get(name, source)
        text = current.read_text() if isinstance(current, Path) else current.decode()
        if marker in text or identity.public().widget in text:
            overlay[name] = identity.personalise(text, ident).encode()


def write_widget_archive(output, root=ROOT, include_private=True, include_device=False):
    """Create an unsigned archive without reading signing or device settings."""
    app = root / 'app'
    overlay = personal_overlay(root, include_private)
    if include_device and (root / '.local/device-defaults.json').is_file():
        personal = json.loads((root / '.local/device-defaults.json').read_text())
        overlay['service/index.js'] = (
            (app / 'service/index.js')
            .read_text()
            .replace("token: '' /* LOCAL_TOKEN */", 'token: ' + json.dumps(personal['localToken']))
            .encode()
        )
        overlay['assets/device-config.js'] = (
            'window.ZenoDeviceDefaults = ' + json.dumps(personal) + ';\n'
        ).encode()
    if include_private:
        _apply_identity(app, overlay, identity.load())
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, allowZip64=False) as package:
        for source in sorted(app.rglob('*')):
            if source.is_symlink():
                raise ValueError(
                    'Widget assets must be regular files, not symlinks: ' + str(source.relative_to(app))
                )
            if not source.is_file():
                continue
            name = source.relative_to(app).as_posix()
            if name.startswith('assets/private-fonts/'):
                raise ValueError('Personal font binaries must stay in .local/personal, not app/.')
            if name not in overlay and is_runtime_source(name):
                package.write(source, name)
        for name, source in sorted(overlay.items()):
            if isinstance(source, Path):
                package.write(source, name)
            else:
                package.writestr(name, source)
