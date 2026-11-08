"""Small SDB transport for an owner-authorized developer connection on ARM Macs."""

import socket
import struct
import time


class Sdb:
    def __init__(self, host, service, timeout=12):
        self.sock = socket.create_connection((host, 26101), timeout=timeout)
        self.sock.settimeout(timeout)
        self.remote = None
        self.pending = bytearray()
        self.closed = False
        for attempt in range(4):
            try:
                self.send('CNXN', 0x00100000, 0x00040000, b'host::\0')
                if self.receive()[0] != 'CNXN':
                    raise RuntimeError('SDB handshake refused')
                break
            except (EOFError, ConnectionResetError):
                self.sock.close()
                if attempt == 3:
                    raise
                time.sleep(0.2 * (attempt + 1))
                self.sock = socket.create_connection((host, 26101), timeout=timeout)
                self.sock.settimeout(timeout)
        self.send('OPEN', 1, 0, service.encode() + b'\0')
        command, remote, local, data = self.receive()
        if command != 'OKAY' or local != 1:
            raise RuntimeError('SDB service refused: ' + command)
        self.remote = remote

    def send(self, command, a, b, data=b''):
        code = int.from_bytes(command.encode(), 'little')
        self.sock.sendall(
            struct.pack('<6I', code, a, b, len(data), sum(data) & 0xFFFFFFFF, code ^ 0xFFFFFFFF) + data
        )

    def exact(self, length):
        result = bytearray()
        while len(result) < length:
            part = self.sock.recv(length - len(result))
            if not part:
                raise EOFError('SDB disconnected')
            result.extend(part)
        return bytes(result)

    def receive(self):
        c, a, b, n, checksum, magic = struct.unpack('<6I', self.exact(24))
        if magic != c ^ 0xFFFFFFFF or n > 1048576:
            raise RuntimeError('Invalid SDB header')
        data = self.exact(n)
        if sum(data) & 0xFFFFFFFF != checksum:
            raise RuntimeError('Invalid SDB checksum')
        return c.to_bytes(4, 'little').decode(), a, b, data

    def event(self):
        command, remote, local, data = self.receive()
        if local != 1:
            raise RuntimeError('Unexpected SDB stream')
        if command == 'WRTE':
            self.send('OKAY', 1, remote)
            self.pending.extend(data)
        elif command == 'CLSE':
            self.closed = True
            self.send('CLSE', 1, remote)
        elif command != 'OKAY':
            raise RuntimeError('Unexpected SDB packet: ' + command)
        return command

    def write(self, data):
        for start in range(0, len(data), 4096):
            self.send('WRTE', 1, self.remote, data[start : start + 4096])
            while self.event() != 'OKAY':
                if self.closed:
                    raise RuntimeError('SDB closed while writing')

    def read(self, length):
        while len(self.pending) < length:
            if self.closed:
                raise EOFError('SDB service closed early')
            self.event()
        result = bytes(self.pending[:length])
        del self.pending[:length]
        return result

    def collect(self, limit=2097152, timeout=30):
        deadline = time.monotonic() + timeout
        while not self.closed:
            if time.monotonic() > deadline or len(self.pending) > limit:
                raise RuntimeError('SDB diagnostic exceeded limit')
            self.event()
        return bytes(self.pending)

    def close(self):
        self.sock.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def shell(host, command):
    with Sdb(host, 'shell:' + command) as channel:
        return channel.collect().decode(errors='replace')


def pull(host, path, limit=2097152):
    with Sdb(host, 'sync:') as channel:
        name = path.encode()
        channel.write(b'RECV' + struct.pack('<I', len(name)) + name)
        data = bytearray()
        while True:
            kind, length = struct.unpack('<4sI', channel.read(8))
            if kind == b'DONE':
                return bytes(data)
            if length > limit or len(data) + length > limit:
                raise RuntimeError('SDB pull exceeds limit')
            chunk = channel.read(length)
            if kind == b'FAIL':
                raise RuntimeError(chunk.decode(errors='replace'))
            if kind != b'DATA':
                raise RuntimeError('Unexpected sync response: ' + repr(kind))
            data.extend(chunk)


def push(host, path, data):
    with Sdb(host, 'sync:', timeout=30) as channel:
        name = (path + ',33188').encode()
        channel.write(b'SEND' + struct.pack('<I', len(name)) + name)
        for start in range(0, len(data), 32768):
            chunk = data[start : start + 32768]
            channel.write(b'DATA' + struct.pack('<I', len(chunk)) + chunk)
        channel.write(b'DONE' + struct.pack('<I', int(time.time())))
        kind, length = struct.unpack('<4sI', channel.read(8))
        if kind != b'OKAY':
            raise RuntimeError(channel.read(length).decode(errors='replace'))
