"""Static check of the widget: identity, version and every file it needs at runtime.

Most files are found by following index.html and the stylesheets. Wallpapers,
their materials and the interface icons are named at runtime, so those are
derived from the wallpaper registry and listed explicitly.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'app'
PACKAGE_ID, APP_ID = (
    'ZenoTV0000',
    'ZenoTV0000.ZenoTV',
)  # what the TV has installed; changing it means a new app
W3C, TIZEN = '{http://www.w3.org/ns/widgets}', '{http://tizen.org/ns/widgets}'
MATERIALS = ['glass-soft', 'field-blur', 'field-frost', 'field-clear']
ICONS = ['apps', 'art', 'home', 'pc', 'settings', 'tv']
problems = []


def need(path, what):
    if not path.is_file():
        problems.append('missing ' + what + ': ' + str(path.relative_to(ROOT)))


def local(reference):
    return not re.match(r'^[a-z][a-z0-9+.-]*:', reference) and not reference.startswith(('#', '$', '//'))


config = ET.parse(APP / 'config.xml').getroot()
application = config.find(TIZEN + 'application')
if application is None:
    problems.append('config.xml has no tizen:application')
elif (application.get('package'), application.get('id')) != (PACKAGE_ID, APP_ID):
    problems.append('application identity changed: ' + str(application.attrib))
version = json.loads((ROOT / 'package.json').read_text())['version']
if config.get('version') != version:
    problems.append('config.xml version %s differs from package.json %s' % (config.get('version'), version))
for tag in ('content', 'icon'):
    node = config.find(W3C + tag)
    if node is None:
        problems.append('config.xml has no ' + tag)
    else:
        need(APP / node.get('src', ''), tag)

page = (APP / 'index.html').read_text()
for reference in re.findall(r'(?:src|href)\s*=\s*["\']([^"\']+)', page):
    if local(reference):
        need(APP / reference.split('?')[0], 'page resource')
for sheet in APP.rglob('*.css'):
    for reference in re.findall(r'url\(\s*["\']?([^)"\']+)', sheet.read_text()):
        if local(reference):
            need(sheet.parent / reference.split('?')[0], 'stylesheet resource')

for generated in ('assets/wallpapers/catalog.js', 'assets/adaptive-ink.js', 'assets/font-catalog.js'):
    need(APP / generated, 'generated catalogue')
for wall in json.loads((APP / 'assets/wallpapers/SOURCES.json').read_text()):
    need(APP / wall['src'], 'wallpaper')
    need(APP / wall['thumb'], 'thumbnail')
    need(APP / 'assets/wallpapers' / (wall['id'] + '-panel.jpg'), 'panel backdrop')
    for kind in MATERIALS:
        need(APP / 'assets/materials' / (wall['id'] + '-' + kind + '.jpg'), 'material')
for icon in ICONS:
    need(APP / 'assets/icons' / (icon + '.svg'), 'icon')

if problems:
    sys.exit('\n'.join(problems))
print('Widget identity, version and bundled resources are valid.')
