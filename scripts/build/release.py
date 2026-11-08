"""Make a release: set the version, commit it and tag it. Nothing is pushed.

    python3 scripts/build/release.py 1.1.0

Before running it, add a "## 1.1.0" section at the top of CHANGELOG.md with
what changed. The script refuses to run on a dirty tree, outside main, or
without that section. Then push with:

    git push origin main v1.1.0

and the release workflow publishes the GitHub release from the changelog.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def fail(message):
    sys.exit('release: ' + message)


def notes(version):
    """The CHANGELOG.md section for this version, without its heading."""
    text = (ROOT / 'CHANGELOG.md').read_text()
    match = re.search(r'^## ' + re.escape(version) + r'\b.*?$\n(.*?)(?=^## |\Z)', text, re.M | re.S)
    return match.group(1).strip() if match else ''


def set_version(version):
    config = ROOT / 'app/config.xml'
    text = config.read_text()
    text, count = re.subn(r'(<widget[^>]*\sversion=")[^"]+(")', r'\g<1>' + version + r'\g<2>', text, count=1)
    if count != 1:
        fail('no version in app/config.xml')
    config.write_text(text)

    package = ROOT / 'package.json'
    data = json.loads(package.read_text())
    data['version'] = version
    package.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

    lock = ROOT / 'package-lock.json'
    data = json.loads(lock.read_text())
    data['version'] = version
    data['packages']['']['version'] = version
    lock.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'\d+\.\d+\.\d+', sys.argv[1]):
        fail('usage: release.py MAJOR.MINOR.PATCH (the TV wants three numbers)')
    version = sys.argv[1]
    tag = 'v' + version
    if git('status', '--porcelain'):
        fail('commit or stash your changes first')
    if git('rev-parse', '--abbrev-ref', 'HEAD') != 'main':
        fail('releases are made from main')
    if tag in git('tag', '--list').split():
        fail(tag + ' already exists')
    if not notes(version):
        fail('add a "## ' + version + '" section to CHANGELOG.md first')

    set_version(version)
    git('add', 'app/config.xml', 'package.json', 'package-lock.json')
    git('commit', '-q', '-m', 'Zeno TV ' + version)
    git('tag', '-a', tag, '-m', 'Zeno TV ' + version)
    print('Tagged ' + tag + ' on ' + git('rev-parse', '--short', 'HEAD') + '. To publish it:')
    print('  git push origin main ' + tag)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--notes':
        print(notes(sys.argv[2]))
    else:
        main()
