"""Close or uninstall a regular app on the TV, on the owner's request.

    python3 scripts/tv/manage_app.py stop APP_ID
    python3 scripts/tv/manage_app.py uninstall APP_ID

Prints a JSON result. System apps, services and Zeno itself are never touched.
The messages are in Italian because they are shown on the TV as they are.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
import identity  # noqa: E402
import tv  # noqa: E402
from sdb_transport import Sdb, shell  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

# Store apps with a platform-style id (org.tizen.*) that are still regular apps.
PLATFORM_STYLE_APPS = {'org.tizen.netflix-app', 'org.tizen.primevideo', 'com.samsung.tv.aria-video'}
YOUTUBE = 'xvvl3S1TT1.TizenTubeStandalone'
YOUTUBE_PLAYER = 'com.samsung.tv.cobalt-yt'
NOT_AN_APP = re.compile(r'service|worker|installer|launcher|factory|daemon|preview', re.I)


def consumer(app, stop_alias=False):
    """True for an ordinary app the user installed, never for system parts or Zeno."""
    if not isinstance(app, str):
        return False
    if stop_alias and app == YOUTUBE_PLAYER:
        return True
    store_id = app in PLATFORM_STYLE_APPS or re.fullmatch(r'[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+', app)
    zeno = app.startswith(identity.load().package + '.')
    return bool(store_id) and not zeno and not NOT_AN_APP.search(app)


def uninstall_id(app, listing):
    """The package id to uninstall, read from `vd_applist` output for this app."""
    records, record = [], {}
    for line in listing.splitlines():
        match = re.match(r'^-+(app_id|app_tizen_id|app_package_name|type)\s*=(.*?)-{5,}\s*$', line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        if key == 'app_id':
            if record:
                records.append(record)
            record = {}
        record[key] = value
    if record:
        records.append(record)

    matches = [r for r in records if r.get('app_tizen_id') == app]
    if len(matches) != 1:
        raise ValueError('Impossibile verificare il pacchetto dell’app.')
    package = matches[0].get('app_id', '')
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', package) or package == identity.load().package:
        raise ValueError('Pacchetto non consentito.')
    return package


def installed(address, app):
    return re.search("'" + re.escape(app) + "'", shell(address, '0 applist'))


def guarded_host():
    try:
        return tv.checked_host()
    except tv.WrongTV:
        raise ValueError('Identità del TV non corrispondente.')


def uninstall(address, app):
    package = uninstall_id(app, shell(address, '0 vd_applist'))
    with Sdb(address, 'shell:0 vd_appuninstall ' + package, timeout=60) as channel:
        channel.collect(timeout=70)
    after = shell(address, '0 applist')
    if 'Application List for user 5001' not in after:
        raise ValueError('Impossibile verificare il registro dopo l’operazione.')
    if installed(address, app):
        raise ValueError('L’app risulta ancora installata.')
    return {'uninstalled': True, 'message': 'Applicazione disinstallata.'}


def stop(app):
    # YouTube runs its video in a separate player app, which has to close too.
    targets = [app] + ([YOUTUBE_PLAYER] if app == YOUTUBE else [])
    helper = ROOT / 'scripts/tv/native-home/run.py'
    for target in targets:
        result = subprocess.run(
            [sys.executable, str(helper), 'appstop', target], capture_output=True, text=True, timeout=35
        )
        if result.returncode or 'ZENO_APP_STOPPED' not in result.stdout:
            raise ValueError('Il TV non ha confermato la chiusura dell’app.')
    return {'stopped': True, 'message': 'Applicazione chiusa.'}


def run(operation, app):
    if operation not in ('stop', 'uninstall') or not consumer(app):
        raise ValueError('Operazione non consentita per questa applicazione.')
    address = guarded_host()
    if not installed(address, app):
        raise ValueError('Applicazione non presente nel registro del TV.')
    return uninstall(address, app) if operation == 'uninstall' else stop(app)


if __name__ == '__main__':
    try:
        print(json.dumps(run(sys.argv[1], sys.argv[2])))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
