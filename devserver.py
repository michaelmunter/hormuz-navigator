#!/usr/bin/env python3
"""Dev server with no-cache headers to avoid stale JS during development."""
import http.server
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f"Serving on http://localhost:{port} (no-cache)")
http.server.HTTPServer(('', port), NoCacheHandler).serve_forever()
