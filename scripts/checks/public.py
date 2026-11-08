"""Release guard for the public repository.

Fails when Git would publish something that belongs in .local/ or dist/: private
paths, signing material, personal assets (matched by content, so a renamed copy is
caught too), unknown font binaries or text that looks like a credential. It looks
at every file Git would add plus every path reachable in history.

It is a safety net, not a licence review or a complete secret scanner. Matches are
reported by file name only, so a failing run never prints the secret itself.
"""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PERSONAL = ROOT / '.local/personal'
FONT_TYPES = {'.ttf', '.otf', '.woff', '.woff2', '.eot'}
PRIVATE_TYPES = {'.p12', '.pem', '.key', '.csr', '.wgt'}
PRIVATE_DIRS = ('.local/', 'dist/', 'node_modules/', 'app/assets/private-fonts/')
PRIVATE_NAMES = {'.env', 'certificate-password.txt', 'profiles.xml', 'session.json'}
SECRETS = re.compile(
    '|'.join(
        [
            r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
            r'gh[pousr]_[A-Za-z0-9]{25,}',
            r'github_pat_[A-Za-z0-9_]{25,}',
            r'AKIA[A-Z0-9]{16}',
        ]
    )
)
LICENCES = [
    'app/assets/manrope-OFL.txt',
    'app/assets/fonts/geist/OFL.txt',
    'app/assets/fonts/newsreader/OFL.txt',
]


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, capture_output=True).stdout.decode()


def private_path(name):
    path = Path(name)
    return (
        name.startswith(PRIVATE_DIRS)
        or path.suffix.lower() in PRIVATE_TYPES
        or path.name in PRIVATE_NAMES
        or path.name.startswith('.env.')
    )


def known_fonts():
    """Font binaries the repository may contain, with their expected SHA-256."""
    fonts = {'app/assets/manrope.woff2': 'e310b55a7fd9677f5e3555e6c6c4d064fa1f1d24393f0ddbe217cea12a8c432f'}
    for entry in json.loads((ROOT / 'app/assets/fonts/SOURCES.json').read_text()):
        if Path(entry['file']).suffix.lower() in FONT_TYPES:
            fonts['app/assets/fonts/' + entry['file']] = entry['sha256']
    return fonts


def main():
    issues = set()
    files = [f for f in git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0') if f]
    fonts = known_fonts()
    for name in files:
        path = ROOT / name
        if private_path(name):
            issues.add('private path would be published: ' + name)
        if path.is_symlink():
            issues.add('symlink: ' + name)
            continue
        if not path.is_file():
            continue
        data = path.read_bytes()
        if path.suffix.lower() in FONT_TYPES and fonts.get(name) != hashlib.sha256(data).hexdigest():
            issues.add('font not in the public font list (or changed): ' + name)
        if SECRETS.search(data.decode('utf-8', 'ignore')):
            issues.add('looks like a credential: ' + name)

    history = git('rev-list', '--objects', '--all').splitlines()
    blobs = {line.split(' ', 1)[0] for line in history}
    for line in history:
        if ' ' in line and private_path(line.split(' ', 1)[1]):
            issues.add('private path in Git history: ' + line.split(' ', 1)[1])
    if PERSONAL.is_dir():
        for path in PERSONAL.rglob('*'):
            if path.is_file() and not path.is_symlink() and not path.is_relative_to(PERSONAL / 'originals'):
                if git('hash-object', str(path)).strip() in blobs:
                    issues.add('personal file content is in Git: ' + str(path.relative_to(ROOT)))

    for name in LICENCES:
        if not (ROOT / name).is_file():
            issues.add('font licence missing: ' + name)

    if issues:
        listed = sorted(issues)
        sys.exit('\n'.join(listed[:20]) + '\n%d problem(s).' % len(listed))
    print('Public source is clean: %d files checked, history included.' % len(files))
    print('Nothing from .local/personal is in Git.')


if __name__ == '__main__':
    main()
