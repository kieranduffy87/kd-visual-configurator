#!/usr/bin/env python3
"""Dev server for the configurator.

Identical to `python3 -m http.server` except that it sends no-store, which
matters here: Chrome keeps ES modules in a per-document module map and will
happily reuse a stale js/*.js after an edit, so a reload appears to change
nothing. Only used for local development.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, test


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8552
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    test(HandlerClass=partial(NoCacheHandler, directory=directory), port=port)
