"""Build dist/ZenoTV.wgt and sign it with the Tizen SDK kept in .local/ (macOS).

Needs, all inside .local/ and never committed:
  tizen-sdk/                          the official SDK (tools/ide/bin/tizen)
  certificates/private/profiles.xml   the signing profile named "CasaTV"
  certificates/private/certificate-password.txt
  certificates/ca/                    the CA certificates referenced by the profile

The SDK asks for the certificate password on a terminal, so it runs under a
pseudo-terminal here and gets the password typed in; its output is shown with
the password masked.
"""
import os
import pty
import select
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from personal_assets import write_widget_archive  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SDK = ROOT / '.local/tizen-sdk'
TIZEN = SDK / 'tools/ide/bin/tizen'
KEYS = ROOT / '.local/certificates/private'
PROFILE_NAME = 'CasaTV'
DIST = ROOT / 'dist'
SIGN_TIMEOUT = 60


def fail(message):
    sys.exit('package: ' + message)


def prepare_sdk():
    """Point the SDK at this checkout and at the signing profile, with absolute paths."""
    data = SDK / 'data'
    data.mkdir(exist_ok=True)
    (SDK / 'sdk.info').write_text('TIZEN_SDK_INSTALLED_PATH=%s\nTIZEN_SDK_DATA_PATH=%s\nJDK_PATH=%s\n'
                                  % (SDK, data, SDK / 'jdk'))
    profile = KEYS / 'profiles.xml'
    tree = ET.parse(profile)
    for item in tree.getroot().iter('profileitem'):
        for attribute, folder in (('key', KEYS), ('ca', KEYS.parent / 'ca'), ('rootca', KEYS.parent / 'ca')):
            if item.get(attribute):
                item.set(attribute, str(folder / Path(item.get(attribute)).name))
    tree.write(profile, encoding='UTF-8', xml_declaration=True)
    profile.chmod(0o600)
    if subprocess.run([str(TIZEN), 'cli-config', 'default.profiles.path=' + str(profile)],
                      capture_output=True, timeout=30).returncode:
        fail('the SDK refused the signing profile')


def sign(unsigned, out_dir, password):
    """Runs `tizen package` on a pseudo-terminal and answers its prompts."""
    command = [str(TIZEN), 'package', '-t', 'wgt', '-s', PROFILE_NAME, '-o', str(out_dir), '--', str(unsigned)]
    pid, tty = pty.fork()
    if pid == 0:
        os.execv(command[0], command)
    transcript, answered_password, answered_save = b'', 0, 0
    deadline = time.monotonic() + SIGN_TIMEOUT
    try:
        while True:
            if time.monotonic() > deadline:
                os.kill(pid, signal.SIGTERM)
                fail('signing timed out')
            if not select.select([tty], [], [], 1)[0]:
                continue
            try:
                chunk = os.read(tty, 8192)
            except OSError:
                break
            if not chunk:
                break
            transcript += chunk
            asked = transcript.lower().count(b'password:')
            if asked > answered_password:
                os.write(tty, password + b'\n')
                answered_password = asked
            asked = transcript.count(b'No: (N) ?')      # "save the password?" — no
            if asked > answered_save:
                os.write(tty, b'n\n')
                answered_save = asked
    finally:
        os.close(tty)
    os.waitpid(pid, 0)
    return transcript.replace(password, b'*****').decode(errors='replace')


def main():
    password_file = KEYS / 'certificate-password.txt'
    if not TIZEN.exists() or not password_file.exists():
        fail('the SDK or the signing files are missing; see docs/tv-setup.md')
    password = password_file.read_bytes().strip()
    if not password:
        fail('the certificate password file is empty')

    DIST.mkdir(exist_ok=True)
    prepare_sdk()
    unsigned = DIST / 'ZenoTV-unsigned.wgt'
    write_widget_archive(unsigned, include_device=True)
    signed_dir = DIST / 'signed'
    signed_dir.mkdir(exist_ok=True)

    log = sign(unsigned, signed_dir, password)
    if 'is created successfully' not in log:
        print(log)
        fail('the SDK did not report a signed package')
    signed = signed_dir / unsigned.name
    with zipfile.ZipFile(signed) as wgt:
        if not {'author-signature.xml', 'signature1.xml'} <= set(wgt.namelist()):
            fail('the package has no signatures')
    target = DIST / 'ZenoTV.wgt'
    target.write_bytes(signed.read_bytes())
    print('Signed: %s (%d KB)' % (target.relative_to(ROOT), target.stat().st_size // 1024))


if __name__ == '__main__':
    main()
