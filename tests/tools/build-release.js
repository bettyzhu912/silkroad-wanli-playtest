'use strict';
// Builds the RC3 runtime zip (playable static folder, tests excluded) and the source zip (git archive of HEAD), records SHA-256 + bytes.
// Usage: node tests/tools/build-release.js <outDir>
const { execSync } = require('child_process'); const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..', '..'), out = path.resolve(process.argv[2] || path.join(root, 'dist'));
const version = require('vm').runInNewContext(fs.readFileSync(path.join(root, 'model.js'), 'utf8').match(/releaseVersion:\s*'([^']+)'/)[0].replace(/.*'([^']+)'/, "'$1'"));
fs.mkdirSync(out, { recursive: true });
const commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(), dirty = execSync('git status --porcelain', { cwd: root }).toString().trim();
const tracked = execSync('git ls-files', { cwd: root }).toString().trim().split('\n');
const runtimeFiles = tracked.filter(f => !f.startsWith('tests/') && !f.startsWith('.claude/') && !f.startsWith('.github/') && f !== '.gitignore');
const runtimeZip = path.join(out, version + '.zip'), sourceZip = path.join(out, version + '-source.zip');
for (const z of [runtimeZip, sourceZip]) fs.rmSync(z, { force: true });
// runtime zip: flat folder, index.html at the root (same layout as the GitHub Pages deployment)
execSync('zip -X -q ' + JSON.stringify(runtimeZip) + ' ' + runtimeFiles.map(f => JSON.stringify(f)).join(' '), { cwd: root });
execSync('git archive --format=zip --prefix=' + version + '-source/ -o ' + JSON.stringify(sourceZip) + ' HEAD', { cwd: root });
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const info = { version, commit, dirty: dirty ? dirty.split('\n') : [], builtAt: new Date().toISOString(), runtime: { file: path.basename(runtimeZip), bytes: fs.statSync(runtimeZip).size, sha256: sha(runtimeZip), files: runtimeFiles.length, limitBytes: 10000000 }, source: { file: path.basename(sourceZip), bytes: fs.statSync(sourceZip).size, sha256: sha(sourceZip) } };
info.runtime.withinLimit = info.runtime.bytes <= info.runtime.limitBytes;
fs.writeFileSync(path.join(out, 'BUILD_INFO.json'), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
if (!info.runtime.withinLimit) process.exitCode = 1;
