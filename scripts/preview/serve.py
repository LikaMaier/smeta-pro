# Раздаёт собранный предпросмотр и web/public: python3 scripts/preview/serve.py  → http://127.0.0.1:5199/?dev=1
import http.server, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOTS = [os.path.join(HERE, 'dist'), os.path.join(HERE, '..', '..', 'web', 'public')]
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split('?')[0].split('#')[0]
        for r in ROOTS:
            f = os.path.join(r, p.lstrip('/'))
            if os.path.isfile(f): return f
        return os.path.join(ROOTS[0], 'index.html')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 5199), H).serve_forever()
