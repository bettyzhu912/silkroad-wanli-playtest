#!/usr/bin/env python3
"""Stamp cache-busting build ids into index.html (window.__BUILD and ?v=). Run before deploying."""
import re, sys, hashlib, pathlib, time
root = pathlib.Path(__file__).resolve().parents[1]
files = ['app.js', 'bridge.js', 'cargo-icons.js', 'style.css'] + [str(p.relative_to(root)) for p in sorted((root / 'engine').glob('*.js'))]
h = hashlib.sha256()
for f in files: h.update(f.encode()); h.update((root / f).read_bytes())
stamp = sys.argv[1] if len(sys.argv) > 1 else h.hexdigest()[:10]
html = (root / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'(\?v=)(BUILD_STAMP|[0-9a-f]{6,})', r'\g<1>' + stamp, html)
html = re.sub(r'(window\.__BUILD=")(BUILD_STAMP|[0-9a-f]{6,})(")', r'\g<1>' + stamp + r'\3', html)
(root / 'index.html').write_text(html, encoding='utf-8')
app = (root / 'app.js').read_text(encoding='utf-8')
app = re.sub(r"(from '\./(?:bridge|cargo-icons)\.js\?v=)(BUILD_STAMP|[0-9a-f]{6,})'", r'\g<1>' + stamp + "'", app)
(root / 'app.js').write_text(app, encoding='utf-8')
print('build stamp', stamp)
