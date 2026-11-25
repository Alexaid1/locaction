"""Serve the static site at /locaction/ with single HTTP byte ranges for PMTiles."""

import argparse
from functools import lru_cache
import gzip
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path, PurePosixPath
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PREFIX = '/locaction/'
PUBLIC_FILES = {'index.html', 'example.html', 'styles.css', 'app.mjs', 'config.mjs', 'methodology.mjs', 'demo-data.json', 'mitino.webp'}
PUBLIC_DIRS = {'map', 'app', 'api', 'contract'}


@lru_cache(maxsize=16)
def compressed_file(path, modified):
    return gzip.compress(path.read_bytes(), mtime=0)


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        return super().translate_path('/' + path.removeprefix(PREFIX))

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if path in ('/', PREFIX.rstrip('/')):
            self.send_response(302)
            self.send_header('Location', PREFIX)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        parts = PurePosixPath(path.removeprefix(PREFIX)).parts
        if (not path.startswith(PREFIX) or any(part.startswith('.') for part in parts)
                or (parts and not (parts[0] in PUBLIC_FILES or parts[0] in PUBLIC_DIRS))):
            self.send_error(404)
            return None
        target = Path(self.translate_path(path))
        if target.suffix == '.pmtiles' and target.is_file():
            return self.serve_archive(target)
        if path.endswith('/') and path != PREFIX:
            self.send_error(404)
            return None
        if path == PREFIX:
            target = ROOT / 'index.html'
        if ('gzip' in self.headers.get('Accept-Encoding', '') and target.is_file()
                and target.suffix in {'.html', '.css', '.mjs', '.js', '.json'}):
            data = compressed_file(target, target.stat().st_mtime_ns)
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(target)))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return BytesIO(data)
        return super().send_head()

    def serve_archive(self, target):
        info = target.stat()
        size = info.st_size
        etag = f'"{info.st_mtime_ns:x}-{size:x}"'
        requested = self.headers.get('Range')
        if not requested:
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(size))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('ETag', etag)
            self.end_headers()
            return target.open('rb')

        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
        start, end = size, -1
        if match:
            low, high = match.groups()
            if low:
                start = int(low)
                end = min(int(high), size - 1) if high else size - 1
            elif high:
                start, end = max(0, size - int(high)), size - 1
        if start > end or end < 0:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        length = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(length))
        self.send_header('ETag', etag)
        self.end_headers()
        with target.open('rb') as archive:
            archive.seek(start)
            return BytesIO(archive.read(length))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8092)
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', args.port), PreviewHandler) as server:
        print(f'http://127.0.0.1:{server.server_port}{PREFIX}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
