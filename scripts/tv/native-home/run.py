"""Run one of the helper scripts in this folder on the TV. See README.md.

    python3 scripts/tv/native-home/run.py MODE [APP_ID]

MODE is the name of a .sh file here: inspect, query, apply, restore, debug,
launch, stop-service, appstop or appstart (the last two take an APP_ID).

Each run uploads the script (and the C# helper when it needs it), starts it,
collects its output over a short-lived connection back to this computer, saves
the output in .local/native-home/ and deletes what it uploaded.
"""

import base64
import json
import socket
import sys
import threading
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/lib'))
import identity  # noqa: E402
import tv  # noqa: E402
from sdb_transport import Sdb, push, shell  # noqa: E402

HERE = Path(__file__).resolve().parent
PRIVATE = ROOT / '.local/native-home'
REMOTE_DIR = '/home/owner/share/tmp/sdk_tools/'
MODES = ['query', 'inspect', 'apply', 'restore', 'debug', 'launch', 'stop-service', 'appstop', 'appstart']
HELPER_FILES = ['ZenoHomeControl.' + suffix for suffix in ['dll', 'runtimeconfig.json', 'deps.json']]
SNAPSHOT = 'ZenoHomeOriginal.json'
OUTPUT_LIMIT = 100_000


def check_tv(address, mode):
    """Model, recorded fingerprint and platform must match before anything is uploaded."""
    info = tv.device_info(address)
    tv.check_model(info)
    current = tv.fingerprint(info)
    if tv.FINGERPRINT_FILE.exists():
        if tv.FINGERPRINT_FILE.read_text().strip() != current:
            sys.exit('Different TV; refusing to run anything on it')
    elif mode == 'inspect':
        with tv.FINGERPRINT_FILE.open('x') as output:
            output.write(current + '\n')
    else:
        sys.exit('Run inspect first to record this TV')

    with Sdb(address, 'capability:') as channel:
        raw = channel.collect()
    capabilities = raw[2 : 2 + int.from_bytes(raw[:2], 'little')].decode()
    if not all(c in capabilities for c in ['platform_version:9.0', 'cpu_arch:armv7', 'architecture:32']):
        sys.exit('Unexpected Tizen version or architecture')


def script_for(mode, target):
    ids = identity.load()
    body = (HERE / (mode + '.sh')).read_text()
    body = body.replace('__ZENO_APP__', ids.app_id).replace('__ZENO_SERVICE__', ids.service_id)
    if mode in ('appstop', 'appstart'):
        import manage_app

        if not manage_app.consumer(target, stop_alias=mode == 'appstop'):
            sys.exit('Only regular apps can be started or stopped this way')
        body = body.replace('__TARGET_APP__', target)
    return body


def upload(address, mode, body, token):
    """Upload what this mode needs; returns the remote paths to delete afterwards."""
    if mode in ('query', 'apply', 'restore'):
        for name in HELPER_FILES:
            push(address, REMOTE_DIR + name, (PRIVATE / 'out' / name).read_bytes())
    if mode in ('apply', 'restore'):
        baseline = PRIVATE / 'original.json'
        if not baseline.is_file():
            sys.exit('The saved original Home settings are missing (.local/native-home/original.json)')
        push(address, REMOTE_DIR + SNAPSHOT, baseline.read_bytes())
    remote = REMOTE_DIR + 'zeno-' + token + '.sh'
    push(address, remote, body.encode())
    return remote, [remote] + [REMOTE_DIR + name for name in HELPER_FILES] + [REMOTE_DIR + SNAPSHOT]


def start_command(remote, local, port, token):
    """The SDB command that makes the TV run the uploaded script and send its output back.

    The SDK user cannot run a shell directly, so the command rides inside the package
    name of an install request, which the TV's installer passes to a shell.
    """
    command = 'cat ' + remote + '|bash >/dev/tcp/' + local + '/' + str(port) + ' 2>&1'
    script = '/bin/mkdir /tmp/s-' + token + ' 2>/dev/null&&{ ' + command + ';}'
    encoded = base64.b64encode(script.encode()).decode()
    name = 'new2.tpk`printf${IFS}%s${IFS}' + encoded + '|base64${IFS}-d|bash`.tpk'
    argument = '0 appinstall tpk ' + name
    if len(argument.encode()) > 400:
        raise SystemExit('The start command is longer than expected')
    return argument


def run_and_collect(address, remote, token):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((address, 9))
        local = route.getsockname()[0]
    with socket.socket() as listener:
        listener.bind((local, 0))
        listener.listen(1)
        listener.settimeout(20)
        argument = start_command(remote, local, listener.getsockname()[1], token)

        transport = {}

        def start():
            try:
                transport['output'] = shell(address, argument)
            except Exception as error:
                transport['error'] = str(error)

        worker = threading.Thread(target=start, daemon=True)
        worker.start()
        connection, peer = listener.accept()
        if peer[0] != address:
            connection.close()
            raise RuntimeError('Unexpected connection from ' + peer[0])
        output = bytearray()
        with connection:
            connection.settimeout(15)
            while chunk := connection.recv(65536):
                output.extend(chunk)
                if len(output) > OUTPUT_LIMIT:
                    raise RuntimeError('The TV sent more output than expected')
        worker.join(timeout=3)
    return output.decode(errors='replace'), transport


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'query'
    target = sys.argv[2] if len(sys.argv) > 2 else ''
    if mode not in MODES:
        sys.exit('Use one of: ' + ', '.join(MODES))
    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)

    address = tv.host()
    check_tv(address, mode)
    body = script_for(mode, target)
    token = uuid.uuid4().hex[:12]
    remote, cleanup = upload(address, mode, body, token)

    text, transport = run_and_collect(address, remote, token)
    (PRIVATE / (mode + '-output.txt')).write_text(text)
    (PRIVATE / (mode + '-transport.json')).write_text(json.dumps(transport, indent=2))
    if 'ZENO_HOME_INSPECT_BEGIN' not in text or 'ZENO_HOME_INSPECT_END' not in text:
        raise RuntimeError('Incomplete operation; run query before trying again')

    cleanup_errors = []
    for path in cleanup:
        try:
            shell(address, '0 rmfile "' + path + '"')
        except Exception as error:
            cleanup_errors.append({'path': path, 'error': str(error)})
    (PRIVATE / (mode + '-cleanup.json')).write_text(json.dumps(cleanup_errors, indent=2))
    print(text)


if __name__ == '__main__':
    main()
