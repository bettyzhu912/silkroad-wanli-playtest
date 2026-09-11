'use strict';
// Minimal static file server for offline/relative-path verification of the runtime folder (no external dependency).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[3] || path.join(__dirname, '..', '..')), port = Number(process.argv[2] || 8137);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]); let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e, data) => {
      if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); console.log('404 ' + url); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
    });
  });
}).listen(port, '127.0.0.1', () => console.log('static server on http://127.0.0.1:' + port + ' root=' + root));
