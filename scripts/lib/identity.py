"""Which ids the app has on the TV.

The repository ships neutral placeholder ids (see app/config.xml). Your own
package id, app name, widget id and signing profile go in
`.local/personal/identity.json`, for example:

    {"package": "Ab12Cd34Ef", "app": "ZenoTV",
     "widget": "https://example.org/zeno-tv", "signingProfile": "ZenoTV"}

Every key is optional. Your build and the TV commands then use the ids your TV
already knows, while the public source never mentions them.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PERSONAL_FILE = ROOT / '.local/personal/identity.json'

PUBLIC = {
    'package': 'ZenoTV0000',
    'app': 'ZenoTV',
    'widget': 'https://github.com/dev-matru/Zeno-TV',
    'signingProfile': 'ZenoTV',
}


class Identity:
    def __init__(self, values):
        self.package = values['package']
        self.app = values['app']
        self.widget = values['widget']
        self.signing_profile = values['signingProfile']

    @property
    def app_id(self):
        return self.package + '.' + self.app

    @property
    def service_id(self):
        return self.package + '.NetworkService'


def public():
    return Identity(PUBLIC)


def load():
    """Your identity if you have one, otherwise the public placeholder."""
    values = dict(PUBLIC)
    if PERSONAL_FILE.is_file():
        values.update(json.loads(PERSONAL_FILE.read_text()))
    return Identity(values)


def personalise(text, identity):
    """Swap the public ids in a source file for the given ones."""
    base = public()
    for old, new in [
        (base.app_id, identity.app_id),
        (base.package, identity.package),
        (base.widget, identity.widget),
    ]:
        text = text.replace(old, new)
    return text
