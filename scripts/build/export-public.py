"""Build an unsigned widget from the public source only, without signing credentials or a TV."""

from pathlib import Path
import hashlib
import json
import zipfile

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from personal_assets import ROOT, write_widget_archive

NOTICES = [('LICENSE', 'LICENSE'), ('docs/credits.md', 'CREDITS.md')]
output = ROOT / 'dist/ZenoTV-public-unsigned.wgt'
output.parent.mkdir(exist_ok=True)
write_widget_archive(output, include_private=False)
with zipfile.ZipFile(output, 'a', zipfile.ZIP_DEFLATED) as archive:
    names = archive.namelist()
    assert not any(
        name.startswith('assets/private-fonts/') for name in names
    ), 'Private font in public widget'
    assert (
        'window.ZenoLocalFonts = [];' in archive.read('assets/font-catalog.js').decode()
    ), 'Unexpected public font catalogue'
    for source, name in NOTICES:
        assert (ROOT / source).is_file(), 'Missing distribution notice: ' + source
        archive.write(ROOT / source, name)
# Notices accompany the widget.
for source, name in NOTICES:
    (output.parent / name).write_bytes((ROOT / source).read_bytes())
report = {
    'file': output.name,
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    'bytes': output.stat().st_size,
    'personal_assets': False,
    'signed': False,
    'scope': 'Offline public-source export only. Asset terms still apply; no TV contacted.',
}
(output.parent / 'public-export.json').write_text(json.dumps(report, indent=2) + '\n')
print('Created ' + str(output.relative_to(ROOT)))
print('Unsigned; public source only. No credentials or TV connection used.')
