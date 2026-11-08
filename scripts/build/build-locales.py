"""Prepare static draft UI translations. Only public UI phrases leave the workstation.
No device configuration, user names, locations, tokens or app data are sent.
The generated dictionaries work offline; this developer tool is never packaged.
"""

from pathlib import Path
import concurrent.futures
import json
import time
import urllib.request
import urllib.parse
import re

ROOT = Path(__file__).resolve().parents[2]
PHRASES = json.loads((ROOT / '.local/locale-phrases.json').read_text())
LANGS = [
    'en',
    'fr',
    'es',
    'de',
    'pt',
    'da',
    'tr',
    'nl',
    'no',
    'fi',
    'sv',
    'hu',
    'ro',
    'el',
    'sr',
    'hr',
    'sl',
    'sq',
    'ru',
    'uk',
    'pl',
    'ar',
    'zh-CN',
    'ko',
    'ja',
    'hi',
    'bn',
    'kk',
    'fa',
]
CACHE = ROOT / '.local/locale-build'
CACHE.mkdir(exist_ok=True)
OUT = ROOT / 'app/locales'
OUT.mkdir(exist_ok=True)


def translate(q, lang):
    url = 'https://translate.googleapis.com/translate_a/single?' + urllib.parse.urlencode(
        {'client': 'gtx', 'sl': 'it', 'tl': lang, 'dt': 't', 'q': q}
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                d = json.load(r)
            return ''.join(x[0] for x in d[0] if x[0] is not None)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 + attempt * 3)


def one(lang):
    file = CACHE / (lang + '.json')
    data = json.loads(file.read_text()) if file.exists() else {}
    missing = [s for s in PHRASES if s not in data]
    chunks = []
    chunk = []
    length = 0
    for phrase in missing:
        if length + len(phrase) > 2200:
            chunks.append(chunk)
            chunk = []
            length = 0
        chunk.append(phrase)
        length += len(phrase) + 1
    if chunk:
        chunks.append(chunk)
    for chunk in chunks:
        translated = translate('\n'.join(chunk), lang).splitlines()
        if len(translated) != len(chunk):
            translated = [translate(s, lang) for s in chunk]
        for src, dst in zip(chunk, translated):
            if sorted(re.findall(r'\{\d+\}', src)) != sorted(re.findall(r'\{\d+\}', dst)):
                dst = translate(src, lang)
            if sorted(re.findall(r'\{\d+\}', src)) != sorted(re.findall(r'\{\d+\}', dst)):
                raise ValueError('Placeholder mismatch ' + lang + ' ' + src)
            data[src] = dst
        file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    # Hand-reviewed labels, brand names remain unchanged.
    overrides = {
        'en': {
            'Personalizza': 'Customize',
            'Aspetto': 'Appearance',
            'Sorgenti': 'Sources',
            'Lingua': 'Language',
            'Morbido': 'Soft',
            'Satinato': 'Frosted',
            'Trasparente': 'Clear',
            'Grafite': 'Graphite',
            'Icone e nomi': 'Icons and names',
            'Entrambi': 'Both',
            'Memoria RAM': 'RAM',
            'Colori delle app': 'App colors',
            'Card della griglia': 'Grid cards',
        },
        'fr': {'Personalizza': 'Personnaliser', 'Sorgenti': 'Sources', 'Lingua': 'Langue'},
        'de': {'Personalizza': 'Anpassen', 'Sorgenti': 'Quellen', 'Lingua': 'Sprache'},
        'es': {'Personalizza': 'Personalizar', 'Sorgenti': 'Fuentes', 'Lingua': 'Idioma'},
    }
    data.update(overrides.get(lang, {}))
    data.update(json.loads((ROOT / 'scripts/build/locale-overrides.json').read_text()).get(lang, {}))
    OUT.joinpath(lang + '.js').write_text(
        'ZenoI18n.register('
        + json.dumps(lang)
        + ','
        + json.dumps({p: data[p] for p in PHRASES}, ensure_ascii=False, separators=(',', ':'))
        + ');\n'
    )
    return lang, len(PHRASES)


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for result in pool.map(one, LANGS):
        print('Prepared', *result, flush=True)
