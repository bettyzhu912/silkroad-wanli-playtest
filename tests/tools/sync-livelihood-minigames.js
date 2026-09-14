'use strict';
// Syncs the runtime sources of the two standalone livelihood minigames into the main-game root (the standalone directories stay the
// canonical, independently playable editions; the root copies are what index.html / assets.js load). Nothing is rewritten: every
// script and image is copied byte-for-byte (weaving art gets a `yutian_weaving_` prefix so the flat package has no ambiguous names).
// Usage: node tests/tools/sync-livelihood-minigames.js [--check]   (--check only reports stale copies; tests/livelihood.test.js proves parity)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..');
const check = process.argv.includes('--check');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
// [standalone source, root copy]
const PAIRS = [
  ['pattern-chain/pattern-chain-engine.js', 'pattern-chain-engine.js'],
  ['pattern-chain/pattern-chain-reveal.js', 'pattern-chain-reveal.js'],
  ['weaving-v5/weaving-engine.js', 'weaving-engine.js'],
  ['weaving-v5/art/modal/layout.js', 'weaving-layout.js']
];
for (const f of fs.readdirSync(path.join(root, 'pattern-chain', 'assets', 'runtime'))) if (/\.webp$/.test(f)) PAIRS.push(['pattern-chain/assets/runtime/' + f, f]);
for (const f of fs.readdirSync(path.join(root, 'pattern-chain', 'assets', 'fonts'))) if (/\.woff2$/.test(f)) PAIRS.push(['pattern-chain/assets/fonts/' + f, f]);
for (const f of fs.readdirSync(path.join(root, 'weaving-v5', 'art', 'modal'))) if (/^body_.*\.webp$/.test(f)) PAIRS.push(['weaving-v5/art/modal/' + f, 'yutian_weaving_' + f.replace(/\.webp$/, '_v5.webp')]);
for (const f of fs.readdirSync(path.join(root, 'weaving-v5', 'art'))) if (/\.png$/.test(f)) PAIRS.push(['weaving-v5/art/' + f, 'yutian_weaving_' + f.replace(/\.png$/, '_v5.png')]);
let stale = 0, copied = 0;
for (const [from, to] of PAIRS) {
  const src = path.join(root, from), dst = path.join(root, to);
  const same = fs.existsSync(dst) && sha(src) === sha(dst);
  if (same) continue;
  stale++;
  if (check) { console.log('STALE ' + to + ' (from ' + from + ')'); continue; }
  fs.copyFileSync(src, dst); copied++; console.log('copied ' + from + ' → ' + to);
}
console.log((check ? 'check: ' + stale + ' stale' : 'synced ' + copied + ' file(s)') + ' of ' + PAIRS.length + ' pairs');
module.exports = { PAIRS };
if (check && stale) process.exit(1);
