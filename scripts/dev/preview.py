"""Local preview of the TV interface.

    /home/...   the app, with the personal overlay from .local/personal on top
                (unless --public is given)
    /build/...  the offline pages used by the material and icon builders

Every response is sent with `Cache-Control: no-store`, and byte ranges are
honoured so audio can be seeked like it is from the packaged widget.
"""
import argparse
import mimetypes
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from personal_assets import personal_overlay  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MOUNTS = {'/home/': ROOT / 'app', '/build/': ROOT / 'scripts/build/materials'}


def inside(base, relative):
    """The file `relative` under `base`, or None if it escapes or does not exist."""
    target = (base / relative).resolve()
    if relative.endswith('/') or relative == '':
        target = target / 'index.html'
    return target if target.is_relative_to(base.resolve()) and target.is_file() else None


def byte_range(header, size):
    """(start, end) for a single `bytes=a-b` range, None for the whole file, False if unsatisfiable."""
    if not header:
        return None
    found = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
    if not found or found.groups() == ('', ''):
        return False
    first, last = found.groups()
    if first:
        start, end = int(first), min(size - 1, int(last)) if last else size - 1
    else:
        start, end = max(0, size - int(last)), size - 1
    return (start, end) if start <= end and start < size else False


class Handler(BaseHTTPRequestHandler):
    server_version = 'ZenoPreview'

    def log_message(self, *args):
        pass

    def do_HEAD(self):
        self.respond(body=False)

    def do_GET(self):
        self.respond(body=True)

    def respond(self, body):
        path = unquote(urlsplit(self.path).path)
        if path in ('/', '/home'):
            self.send_response(302)
            self.send_header('Location', '/home/')
            self.send_header('Content-Length', '0')
            self.finish_headers()
            return
        content = self.lookup(path)
        if content is None:
            self.send_error(404)
            return
        span = byte_range(self.headers.get('Range'), len(content))
        if span is False:
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % len(content))
            self.send_header('Content-Length', '0')
            self.finish_headers()
            return
        start, end = span or (0, len(content) - 1)
        self.send_response(206 if span else 200)
        self.send_header('Content-Type', mimetypes.guess_type(path if not path.endswith('/') else 'x.html')[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if span:
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, len(content)))
        self.finish_headers()
        if body:
            self.wfile.write(content[start:end + 1])

    def lookup(self, path):
        for prefix, base in MOUNTS.items():
            if not path.startswith(prefix):
                continue
            relative = path[len(prefix):]
            if base.name == 'app':
                extra = personal_overlay(include_private=self.server.include_private).get(relative)
                if extra is not None:
                    return extra.read_bytes() if isinstance(extra, Path) else extra
            found = inside(base, relative)
            return found.read_bytes() if found else None
        return None

    def finish_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()


class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=4795)
    parser.add_argument('--public', action='store_true', help='leave out everything in .local/personal')
    args = parser.parse_args()
    server = Server(('127.0.0.1', args.port), Handler)
    server.include_private = not args.public
    print('Zeno TV preview: http://127.0.0.1:%d/home/' % server.server_port, flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
