#!/usr/bin/env python3
"""Stamp a cache-busting build id (?v=) into tod-prototype/index.html from the runtime files' content."""
import re, sys, hashlib, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
files = ['tod-prototype.css', 'tod-runtime.js', 'tod-debug.js', 'config/manifest.json']
h = hashlib.sha256()
for f in files: h.update(f.encode()); h.update((root / f).read_bytes())
stamp = sys.argv[1] if len(sys.argv) > 1 else h.hexdigest()[:10]
html = (root / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'(\?v=)(BUILD_STAMP|[0-9a-f]{6,})', r'\g<1>' + stamp, html)
(root / 'index.html').write_text(html, encoding='utf-8')
print('build stamp', stamp)
