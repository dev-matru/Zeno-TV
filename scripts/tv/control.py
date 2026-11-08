"""Install, open or inspect apps on the TV over the developer connection (SDB).

python3 scripts/tv/control.py info               what the TV reports about itself
python3 scripts/tv/control.py install FILE.wgt   install a signed package
python3 scripts/tv/control.py launch [APP_ID]    open Zeno (or another allowed app)
python3 scripts/tv/control.py debug [APP_ID]     same, with the web inspector
python3 scripts/tv/control.py apps               list installed apps
"""

import argparse
import hashlib
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
import identity  # noqa: E402
import tv  # noqa: E402
from sdb_transport import Sdb, push, shell  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WIDGETS = '{http://tizen.org/ns/widgets}'
REMOTE_TMP = '/home/owner/share/tmp/sdk_tools/'
INFO_FIELDS = ['name', 'modelName', 'OS', 'firmwareVersion', 'ip', 'wifiMac', 'developerMode', 'developerIP']


def allowed_apps():
    """Zeno itself, plus the YouTube client it can open."""
    return [identity.load().app_id, 'xvvl3S1TT1.TizenTubeStandalone']


def show_info(address):
    info = tv.device_info(address)
    for field in INFO_FIELDS:
        print('%-16s %s' % (field, info.get(field, '')))


def launch(address, action, app):
    if app not in allowed_apps():
        sys.exit('This app is not on the allowed list')
    if app != identity.load().app_id:
        command = 'debug ' if action == 'debug' else 'was_execute '
        print(shell(address, '0 ' + command + app))
        return
    # Zeno is started through the native helper, which waits for the launch to be confirmed.
    helper = ROOT / 'scripts/tv/native-home/run.py'
    result = subprocess.run([sys.executable, str(helper), action], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode or 'successfully launched' not in result.stdout:
        sys.exit('The TV did not confirm that the app started')


def package_identity(path):
    """App and package id of a signed .wgt, refusing unsigned or unexpected ones."""
    with zipfile.ZipFile(path) as archive:
        if not {'author-signature.xml', 'signature1.xml'}.issubset(archive.namelist()):
            sys.exit('Refusing an unsigned package')
        manifest = ET.fromstring(archive.read('config.xml'))
    application = manifest.find(WIDGETS + 'application')
    app, package = application.get('id'), application.get('package')
    if app not in allowed_apps() or not app.startswith(package + '.'):
        sys.exit('Unexpected app id in the package: ' + str(app))
    return app, package


def install(address, path):
    path = Path(path).resolve()
    data = path.read_bytes()
    app, package = package_identity(path)
    remote = REMOTE_TMP + 'ZenoInstall-' + hashlib.sha256(data).hexdigest()[:12] + '.wgt'

    print('Uploading signed %s (%d bytes)' % (app, len(data)), flush=True)
    push(address, remote, data)
    print('Upload verified; installing', flush=True)
    with Sdb(address, 'shell:0 vd_appinstall ' + package + ' ' + remote, timeout=120) as channel:
        result = channel.collect(timeout=150).decode(errors='replace')
    print(result)

    if 'install completed' not in result.lower():
        sys.exit('The TV did not confirm the installation')
    if app not in shell(address, '0 applist'):
        sys.exit('The app is missing from the TV app list after installing')
    shell(address, '0 rmfile "' + remote + '"')
    print('Installed and found in the app list: ' + app)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('action', choices=['info', 'install', 'launch', 'apps', 'debug'])
    parser.add_argument('target', nargs='?')
    args = parser.parse_args()

    address = tv.host()
    if args.action == 'info':
        show_info(address)
        return
    try:
        tv.check(tv.device_info(address))
    except tv.WrongTV as error:
        sys.exit(str(error))

    if args.action == 'apps':
        print(shell(address, '0 applist'))
    elif args.action in ('launch', 'debug'):
        launch(address, args.action, args.target or identity.load().app_id)
    elif not args.target:
        sys.exit('install needs the path of a signed .wgt')
    else:
        install(address, args.target)


if __name__ == '__main__':
    main()
