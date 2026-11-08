"""Checks shared by every command that talks to the TV.

The TV is described in `.local/device.json`:

    {"host": "192.168.1.53", "model": "QE65S90DATXZT"}

`scripts/tv/native-home/run.py inspect` also records a fingerprint of the TV's
unique id in `.local/native-home/device-identity.sha256`. Commands that change
something on the TV refuse to run unless the model and the fingerprint match,
so a different TV on the same address is never touched.
"""

import hashlib
import ipaddress
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEVICE_FILE = ROOT / '.local/device.json'
FINGERPRINT_FILE = ROOT / '.local/native-home/device-identity.sha256'


class WrongTV(Exception):
    pass


def settings():
    return json.loads(DEVICE_FILE.read_text())


def host():
    address = settings()['host']
    ipaddress.ip_address(address)
    return address


def device_info(address):
    """What the TV says about itself on its local REST port."""
    with urllib.request.urlopen('http://' + address + ':8001/api/v2/', timeout=5) as response:
        return json.load(response).get('device', {})


def fingerprint(info):
    unique_id = info.get('id')
    if not unique_id:
        raise WrongTV('The TV did not report its unique id')
    return hashlib.sha256(unique_id.encode()).hexdigest()


def check_model(info):
    expected = settings().get('model')
    if not expected:
        raise WrongTV('Add your TV model ("model") to .local/device.json')
    if info.get('modelName') != expected:
        raise WrongTV('This is not the expected TV model')


def check(info):
    """Model and recorded fingerprint must both match."""
    check_model(info)
    if not FINGERPRINT_FILE.exists():
        raise WrongTV('No TV recorded yet: run scripts/tv/native-home/run.py inspect first')
    if FINGERPRINT_FILE.read_text().strip() != fingerprint(info):
        raise WrongTV('This is a different TV from the one recorded')


def checked_host():
    """The TV's address, after checking that it is the right TV."""
    address = host()
    check(device_info(address))
    return address
