'use strict';
// Rewrites the `?v=<sha256[:16]>` cache-busting tags in index.html from the current file contents (same scheme as RC2).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..'), file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8'), changed = [];
html = html.replace(/((?:href|src)=")([^"?]+)\?v=([0-9a-f]{16})"/g, (m, pre, name, old) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex').slice(0, 16);
  if (hash !== old) changed.push(name + ': ' + old + ' -> ' + hash);
  return pre + name + '?v=' + hash + '"';
});
fs.writeFileSync(file, html);
console.log(changed.length ? changed.join('\n') : 'index.html hashes already current');
