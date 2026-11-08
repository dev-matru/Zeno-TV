"""Turn downloaded Unsplash originals into the TV wallpaper and thumbnail JPEGs.

The list of photos is app/assets/wallpapers/SOURCES.json. For each entry the
original is looked up in SOURCE_DIR by its Unsplash photo id (the id is part of
the file name Unsplash gives a download). Results land in
.local/materials/wallpapers/ together with a SOURCES.json describing them;
nothing in app/ is touched, so the output can be reviewed first.

Two recipes exist, because the first photos were prepared before the second:
  fit    longest side to 1920 / 512, aspect kept (macOS `sips`)
  cover  cropped to exactly 1920×1080 / 512×288 (Pillow)
"""

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / 'app/assets/wallpapers/SOURCES.json'
OUT = ROOT / '.local/materials/wallpapers'
FIT = {'misty', 'cove', 'forest', 'valley', 'night', 'peaks', 'bridge', 'ridge'}
SIZES = {
    'fit': [('', 1920, 87), ('-thumb', 512, 80)],
    'cover': [('', (1920, 1080), 90, 0), ('-thumb', (512, 288), 85, 2)],
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def photo_id(entry):
    return entry['source'].rstrip('/').rsplit('/', 1)[-1]


def find_original(folder, entry):
    matches = sorted(folder.glob('*' + photo_id(entry) + '*.jp*g'))
    return matches[0] if matches else None


def render_fit(original, id):
    for suffix, width, quality in SIZES['fit']:
        subprocess.run(
            [
                'sips',
                '-Z',
                str(width),
                '-s',
                'format',
                'jpeg',
                '-s',
                'formatOptions',
                str(quality),
                str(original),
                '--out',
                str(OUT / (id + suffix + '.jpg')),
            ],
            check=True,
            capture_output=True,
        )


def render_cover(original, id):
    from PIL import Image, ImageOps

    with Image.open(original) as img:
        img.load()
        icc = img.info.get('icc_profile')
        rgb = ImageOps.exif_transpose(img).convert('RGB')
    full = ImageOps.fit(rgb, SIZES['cover'][0][1], Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    for suffix, size, quality, subsampling in SIZES['cover']:
        picture = full if size == full.size else full.resize(size, Image.Resampling.LANCZOS)
        picture.save(
            OUT / (id + suffix + '.jpg'),
            'JPEG',
            quality=quality,
            subsampling=subsampling,
            optimize=True,
            progressive=False,
            icc_profile=icc,
        )


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('source_dir', type=Path, help='folder with the downloaded originals')
    parser.add_argument('--ids', help='comma-separated wallpaper ids (default: all in SOURCES.json)')
    args = parser.parse_args()

    registry = json.loads(REGISTRY.read_text())
    by_id = {entry['id']: entry for entry in registry}
    wanted = list(by_id) if not args.ids else [s.strip() for s in args.ids.split(',')]
    unknown = [id for id in wanted if id not in by_id]
    if unknown:
        parser.error('unknown ids: ' + ', '.join(unknown) + '. Known: ' + ', '.join(by_id))

    originals = {id: find_original(args.source_dir, by_id[id]) for id in wanted}
    missing = [id + ' (' + photo_id(by_id[id]) + ')' for id, path in originals.items() if path is None]
    if missing:
        parser.error('no original found for: ' + ', '.join(missing))
    if any(id in FIT for id in wanted) and not shutil.which('sips'):
        parser.error('the "fit" recipe needs macOS sips')
    if any(id not in FIT for id in wanted):
        try:
            import PIL  # noqa: F401
        except ImportError:
            parser.error('the "cover" recipe needs Pillow (pip install pillow)')

    OUT.mkdir(parents=True, exist_ok=True)
    staged = []
    for id in wanted:
        original, before = originals[id], digest(originals[id])
        (render_fit if id in FIT else render_cover)(original, id)
        if digest(original) != before:
            raise RuntimeError('original was modified: ' + str(original))
        full, thumb = OUT / (id + '.jpg'), OUT / (id + '-thumb.jpg')
        entry = dict(by_id[id])
        entry.update(
            originalBytes=original.stat().st_size,
            originalSha256=before,
            backgroundBytes=full.stat().st_size,
            backgroundSha256=digest(full),
            thumbnailBytes=thumb.stat().st_size,
            thumbnailSha256=digest(thumb),
        )
        staged.append(entry)
        print('%-10s %8d bytes, thumbnail %7d bytes' % (id, full.stat().st_size, thumb.stat().st_size))

    (OUT / 'SOURCES.json').write_text(json.dumps(staged, indent=2, ensure_ascii=False) + '\n')
    print(
        '%d wallpapers staged in %s. Review them before copying into app/assets/wallpapers.'
        % (len(staged), OUT.relative_to(ROOT))
    )


if __name__ == '__main__':
    main()
