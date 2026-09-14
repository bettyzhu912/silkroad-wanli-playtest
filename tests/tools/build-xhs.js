'use strict';
// Builds the Xiaohongshu mini-tool package (minitool-zip-builder skill v1.6.0) from the runtime folder:
//  - ES2017 / Chrome 61 downlevel of every runtime script with TypeScript (tsc), verified with acorn when available
//  - WebP conversion of the images (cwebp), with every reference rewritten (assets.js values, CSS url(), index.html)
//  - index.html without cache-busting query strings (offline zip has no cache to bust; keeps paths exact)
//  - container rule verification (structure, file types, forbidden APIs, dangling references), the skill's own audit script, zip from inside the stage folder
// Usage: node tests/tools/build-xhs.js [outDir] [--tsc <path>] [--no-webp] [--skill <skill dir>]
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync, spawnSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const outDir = path.resolve(argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || path.join(root, 'dist', 'xhs'));
const noWebp = argv.includes('--no-webp');
const version = fs.readFileSync(path.join(root, 'model.js'), 'utf8').match(/releaseVersion:\s*'([^']+)'/)[1];
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim();
const tracked = execFileSync('git', ['ls-files'], { cwd: root }).toString().trim().split('\n').filter(f => f && !f.startsWith('tests/') && !f.startsWith('weaving-demo/') && !f.startsWith('weaving-v5/') && !f.startsWith('caravan-demo/') && !f.startsWith('pattern-chain/') && !f.startsWith('tod-prototype/') && !f.startsWith('.claude/') && f !== '.gitignore');
const report = { version, commit, dirty: dirty ? dirty.split('\n') : [], builtAt: new Date().toISOString(), skill: 'minitool-zip-builder 1.6.0', steps: [], errors: [], warnings: [] };
const step = (name, detail) => { report.steps.push({ name, detail }); console.log('• ' + name + (detail ? ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const fail = msg => { report.errors.push(msg); console.log('ERROR: ' + msg); };
const warn = msg => { report.warnings.push(msg); console.log('WARN: ' + msg); };
const which = bin => { const r = spawnSync('which', [bin]); return r.status === 0 ? r.stdout.toString().trim() : null; };
const stage = path.join(outDir, 'stage');
fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });

// 1. scripts: ES2017 downlevel
const tsc = flag('--tsc') || process.env.TSC || [path.join(root, 'node_modules', '.bin', 'tsc')].find(p => fs.existsSync(p)) || which('tsc');
if (!tsc || !fs.existsSync(tsc)) { fail('TypeScript compiler not found: pass --tsc <path> or install typescript (used only as a build tool; nothing is added to the runtime)'); finish(); }
const jsFiles = tracked.filter(f => f.endsWith('.js'));
const tscResult = spawnSync(tsc, ['--allowJs', '--checkJs', 'false', '--target', 'ES2017', '--lib', 'es2022,dom', '--module', 'none', '--outDir', stage, '--skipLibCheck', '--noEmitOnError', 'false', '--newLine', 'lf', ...jsFiles.map(f => path.join(root, f))], { cwd: root, encoding: 'utf8' });
const emitted = jsFiles.filter(f => fs.existsSync(path.join(stage, path.basename(f))));
if (emitted.length !== jsFiles.length) { fail('tsc emitted ' + emitted.length + '/' + jsFiles.length + ' files: ' + (tscResult.stdout + tscResult.stderr).slice(0, 800)); finish(); }
step('ES2017 downlevel (tsc ' + (spawnSync(tsc, ['--version'], { encoding: 'utf8' }).stdout || '').trim() + ')', emitted.length + ' scripts');
for (const f of jsFiles) { const r = spawnSync(process.execPath, ['--check', path.join(stage, path.basename(f))], { encoding: 'utf8' }); if (r.status !== 0) fail('syntax check failed for ' + f + ': ' + r.stderr.slice(0, 300)); }
let acorn = null; for (const p of [path.join(root, 'node_modules', 'acorn'), process.env.ACORN].filter(Boolean)) { try { acorn = require(p); break; } catch (_) { } }
if (acorn) { let bad = 0; for (const f of jsFiles) { try { acorn.parse(fs.readFileSync(path.join(stage, path.basename(f)), 'utf8'), { ecmaVersion: 2017, sourceType: 'script' }); } catch (e) { bad++; fail('not ES2017: ' + f + ' ' + e.message); } } step('acorn ES2017 parse', bad ? bad + ' failures' : 'all scripts parse as ES2017 classic scripts'); }
else warn('acorn not available: ES2017 syntax verified by tsc target only (set ACORN=<path to acorn package> for an independent parse)');
const residual = jsFiles.filter(f => /\?\.|\?\?|\|\|=|&&=|\?\?=/.test(fs.readFileSync(path.join(stage, path.basename(f)), 'utf8').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')));
if (residual.length) fail('post-ES2017 operators remain in: ' + residual.join(', '));

// 2. styles (Chrome 61 baseline pass: see tests/tools/css-baseline.js) + images
const cssBaseline = require('./css-baseline');
const aspectRules = (() => { const m = fs.readFileSync(path.join(root, 'compat.js'), 'utf8').match(/var ASPECT_RULES = \[([\s\S]*?)\n\s*\];/); return m ? JSON.parse('[' + m[1].replace(/'/g, '"') + ']') : null; })();
if (!aspectRules) fail('compat.js: ASPECT_RULES list not found');
{ const totals = {}, cssWarnings = [];
  for (const f of tracked.filter(f => f.endsWith('.css'))) {
    const source = fs.readFileSync(path.join(root, f), 'utf8'), out = cssBaseline.transform(source);
    fs.writeFileSync(path.join(stage, path.basename(f)), out.css);
    for (const [k, v] of Object.entries(out.stats)) totals[k] = (totals[k] || 0) + v;
    cssWarnings.push(...out.warnings.map(w => path.basename(f) + ': ' + w));
    const l = cssBaseline.lint(out.css, { aspectRules }); for (const i of l.issues) fail(path.basename(f) + ' (staged): ' + i);
    const expected = cssBaseline.extractAspectRules(source); for (const r of expected) if (!aspectRules.some(a => cssBaseline.norm(a[0]) === cssBaseline.norm(r[0]) && a[1] === r[1] && a[2] === r[2] && a[3] === r[3])) fail(path.basename(f) + ': aspect-ratio rule not mirrored in compat.js ASPECT_RULES: ' + JSON.stringify(r));
  }
  report.cssBaseline = { stats: totals, warnings: cssWarnings };
  step('CSS Chrome 61 baseline', Object.entries(totals).map(([k, v]) => k + ' ' + v).join(', ') + (cssWarnings.length ? '; ' + cssWarnings.length + ' approximation(s) noted in XHS_BUILD_INFO.json' : '')); }
for (const f of tracked.filter(f => /\.woff2?$/i.test(f))) fs.copyFileSync(path.join(root, f), path.join(stage, path.basename(f)));   // R32: self-hosted OFL font subsets of 缀纹成章 (referenced from pattern-chain.css)
// R34 GLOBAL_AUDIO_SYSTEM_v0.1: audio is staged as-is, except that a tracked `<name>.mp3` with a tracked `<name>_pkg.m4a` sibling ships only the compact package
// variant (the 10 MiB hard limit cannot carry the 192 kbps master); every script reference to the mp3 name is rewritten to the m4a name below.
const audioRenamed = new Map();
for (const f of tracked.filter(f => /\.(mp3|m4a|wav|ogg)$/i.test(f))) { const name = path.basename(f); if (/\.mp3$/i.test(name) && tracked.includes(f.replace(/\.mp3$/i, '_pkg.m4a'))) { audioRenamed.set(name, name.replace(/\.mp3$/i, '_pkg.m4a')); continue; } fs.copyFileSync(path.join(root, f), path.join(stage, name)); }
if (audioRenamed.size) step('audio → package variants', [...audioRenamed].map(([a, b]) => a + ' → ' + b).join(', '));
const images = tracked.filter(f => /\.(png|jpe?g)$/i.test(f));
const cwebp = noWebp ? null : which('cwebp');
// R38 package size: a tracked `.webp` source is recompressed only where that is provably free of any approved-output change.
// PIXEL-LOCKED — every B7 TOD layer and every mask is staged byte-for-byte. tests/browser/tod-integration-run.js asserts the composited TOD
// frame stays within 1/255 of the approved previews in all nine city × phase states, a criterion signed off on the package itself in R31
// (stage 66/66). Measured on this asset set: lossy sky / city_ground / title_overlay push the composite to 10–105/255, and even the blurred
// *_sky_blur3_* layers — which contribute only faintly — still leave ~12 pixels at 3/255 in the morning state at q99, i.e. the error does not
// vanish with quality. The layers are also already optimally compressed (max-effort lossless re-encoding comes out 2.5% LARGER), so the whole
// family stays exactly as approved and the lock keeps any future build from trading that criterion for bytes.
// Everything else is governed mechanically: a candidate is kept only when it comes out both ≥10% smaller AND visually lossless
// (PSNR ≥ WEBP_MIN_PSNR); otherwise the original is staged untouched, which is what happens to every already-lossy source since a second lossy
// pass only enlarges it. Dimensions never change and no asset is ever dropped, merged or downscaled.
const WEBP_FIDELITY_LOCKED = /^B7_city_|mask/i;
const WEBP_MIN_PSNR = 45, WEBP_MAX_RATIO = 0.9;
const webpReport = { recompressed: [], keptOriginal: [], before: 0, after: 0 };
for (const f of tracked.filter(f => /\.webp$/i.test(f))) {
  const src = path.join(root, f), name = path.basename(f), dest = path.join(stage, name), before = fs.statSync(src).size;
  webpReport.before += before;
  const keep = reason => { fs.copyFileSync(src, dest); webpReport.after += before; webpReport.keptOriginal.push({ file: name, bytes: before, reason }); };
  if (!cwebp) { keep('cwebp not available'); continue; }
  if (WEBP_FIDELITY_LOCKED.test(name)) { keep('pixel-locked: approved TOD layer / mask, staged byte-for-byte'); continue; }
  const tmp = dest + '.recompress.tmp';
  const r = spawnSync(cwebp, ['-q', '92', '-alpha_q', '100', '-m', '6', '-sharp_yuv', '-exact', '-print_psnr', src, '-o', tmp], { encoding: 'utf8' });
  const psnr = Number(((r.stdout + r.stderr).match(/Y-U-V-All-PSNR\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+([\d.]+)/) || [])[1]);
  const after = r.status === 0 && fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
  if (!after) { fs.rmSync(tmp, { force: true }); keep('cwebp failed: ' + (r.stderr || '').slice(0, 120)); continue; }
  if (!(psnr >= WEBP_MIN_PSNR)) { fs.rmSync(tmp, { force: true }); keep('PSNR ' + (psnr || '?') + ' dB below the ' + WEBP_MIN_PSNR + ' dB visually-lossless floor'); continue; }
  if (after > before * WEBP_MAX_RATIO) { fs.rmSync(tmp, { force: true }); keep('re-encode not smaller (' + after.toLocaleString() + ' B, already lossy)'); continue; }
  fs.renameSync(tmp, dest); webpReport.after += after;
  webpReport.recompressed.push({ file: name, before, after, psnr, saved: before - after });
}
webpReport.recompressed.sort((a, b) => b.saved - a.saved);
report.webp = webpReport;
step('WebP sources → package variants (q92, lossless alpha, dimensions unchanged)', webpReport.recompressed.length + ' of ' + (webpReport.recompressed.length + webpReport.keptOriginal.length) + ' recompressed, ' + webpReport.before.toLocaleString() + ' → ' + webpReport.after.toLocaleString() + ' bytes (saved ' + (webpReport.before - webpReport.after).toLocaleString() + ')' + (webpReport.recompressed.length ? ', worst PSNR ' + webpReport.recompressed.reduce((m, x) => Math.min(m, x.psnr), Infinity) + ' dB' : ' — every source is either pixel-locked or already lossy'));
const renamed = new Map();
if (cwebp) {
  // Two quality tiers, both encoded in one generation from the PNG / JPEG masters (the masters are never modified, nothing is downscaled).
  // Small art — every goods icon, glyph and badge — keeps q85: it is where a lower quality shows first and where there are no bytes to win.
  // Only images whose q85 output is already large (backgrounds, panel art, map and travel plates) drop to q78, which is imperceptible on that
  // kind of soft, large artwork and is what brings the package under 10,000,000 bytes without touching a single confirmed asset.
  const Q_SMALL = 85, Q_LARGE = 78, LARGE_BYTES = 50 * 1024, tiers = [];
  const encode = (src, target, q, png) => { const args = png ? ['-quiet', '-q', String(q), '-alpha_q', '100', '-exact', src, '-o', target] : ['-quiet', '-q', String(q), src, '-o', target]; return spawnSync(cwebp, args, { encoding: 'utf8' }); };
  for (const f of images) {
    const src = path.join(root, f), name = path.basename(f), target = name.replace(/\.(png|jpe?g)$/i, '.webp'), out = path.join(stage, target), png = /\.png$/i.test(name);
    let r = encode(src, out, Q_SMALL, png);
    if (r.status !== 0) { fail('cwebp failed for ' + name + ': ' + r.stderr.slice(0, 200)); continue; }
    const atSmall = fs.statSync(out).size;
    if (atSmall >= LARGE_BYTES) {
      r = encode(src, out, Q_LARGE, png);
      if (r.status !== 0) { fail('cwebp failed for ' + name + ' at q' + Q_LARGE + ': ' + r.stderr.slice(0, 200)); continue; }
      tiers.push({ file: target, q: Q_LARGE, bytes: fs.statSync(out).size, atQ85: atSmall });
    }
    renamed.set(name, target);
  }
  report.imageTiers = { qSmall: Q_SMALL, qLarge: Q_LARGE, largeThreshold: LARGE_BYTES, large: tiers.sort((a, b) => b.atQ85 - a.atQ85) };
  const before = images.reduce((s, f) => s + fs.statSync(path.join(root, f)).size, 0), after = [...renamed.values()].reduce((s, f) => s + fs.statSync(path.join(stage, f)).size, 0);
  step('images → WebP (q' + Q_SMALL + ', q' + Q_LARGE + ' for the ' + tiers.length + ' large plates; alpha kept, dimensions unchanged)', renamed.size + ' files, ' + before.toLocaleString() + ' → ' + after.toLocaleString() + ' bytes (large tier saves ' + tiers.reduce((s, t) => s + t.atQ85 - t.bytes, 0).toLocaleString() + ')');
} else { for (const f of images) fs.copyFileSync(path.join(root, f), path.join(stage, path.basename(f))); warn(noWebp ? 'WebP conversion skipped (--no-webp)' : 'cwebp not found: images copied as PNG/JPG (larger package)'); }

// 3. index.html: no query strings, image references rewritten, container template checks
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/((?:src|href)=")([^"?]+)\?v=[0-9a-f]+"/g, '$1$2"');
if (!/<!DOCTYPE html>/i.test(html)) fail('index.html: <!DOCTYPE html> missing');
if (!/lang="zh-CN"/.test(html)) fail('index.html: lang="zh-CN" missing');
if (!/charset="UTF-8"/i.test(html)) fail('index.html: charset=UTF-8 missing');
const viewport = (html.match(/<meta name="viewport" content="([^"]+)"/) || [])[1] || ''; for (const part of ['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover']) if (!viewport.includes(part)) fail('index.html viewport lacks ' + part);
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail('index.html: inline <script> found'); if (/type="module"/.test(html)) fail('index.html: module script found'); if (/<base\s|<iframe|<object|http-equiv="Content-Security-Policy"/i.test(html)) fail('index.html: <base>/<iframe>/<object>/CSP meta found');
if (/\son[a-z]+="/i.test(html)) fail('index.html: inline event handler attribute found');
// 4. rewrite image references in every text file (assets.js: values only, keys untouched)
const rewrite = (text, file) => { if (!renamed.size) return text; if (file === 'assets.js') return text.replace(/(:\s*")([^"]+?)\.(png|jpe?g)"/g, (m, pre, name, ext) => renamed.has(name + '.' + ext) ? pre + renamed.get(name + '.' + ext) + '"' : m); let out = text; for (const [from, to] of renamed) out = out.split(from).join(to); return out; };
html = rewrite(html, 'index.html'); fs.writeFileSync(path.join(stage, 'index.html'), html);
for (const name of fs.readdirSync(stage)) { if (/\.(js|css)$/.test(name)) { const p = path.join(stage, name); fs.writeFileSync(p, rewrite(fs.readFileSync(p, 'utf8'), name)); } }
if (audioRenamed.size) for (const name of fs.readdirSync(stage)) { if (/\.js$/.test(name)) { const p = path.join(stage, name); let t = fs.readFileSync(p, 'utf8'); for (const [a, b] of audioRenamed) t = t.split(a).join(b); fs.writeFileSync(p, t); } }
step('index.html', 'query strings stripped, ' + (renamed.size ? 'image references rewritten to WebP' : 'original image names kept'));

// 5. verification against the container rules
const staged = new Set(fs.readdirSync(stage));
const allowed = /\.(html|css|js|png|jpe?g|gif|webp|svg|woff2?|json|mp3|m4a|wav)$/i;   // R34: packaged media (<audio>) is allowed by the container spec
for (const name of staged) { if (!allowed.test(name)) fail('unsupported file type in package: ' + name); if (/\.(map|DS_Store)$/.test(name) || name === 'node_modules') fail('development artifact in package: ' + name); }
{ const media = [...staged].filter(n => /\.(mp3|m4a|wav)$/i.test(n)); if (media.length) warn('packaged <audio> media (' + media.join(', ') + '): allowed by zip-artifact-spec §3 (音视频 → 包内媒体文件) but absent from the §2 file-type table — confirm in the container'); }
if (!staged.has('index.html')) fail('index.html missing at package root');
if ([...staged].filter(n => n.endsWith('.html')).length !== 1) fail('exactly one .html entry expected');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) { const ref = m[1]; if (/^(https?:)?\/\//.test(ref) || ref.startsWith('/')) fail('index.html absolute/external reference: ' + ref); else if (!staged.has(ref)) fail('index.html references a missing file: ' + ref); }
const assetsText = fs.readFileSync(path.join(stage, 'assets.js'), 'utf8'); const assetValues = [...assetsText.matchAll(/:\s*"([^"]+)"/g)].map(m => m[1]).filter(v => /\.(png|jpe?g|webp|gif|svg)$/i.test(v));
for (const v of new Set(assetValues)) if (!staged.has(v)) fail('assets.js maps to a missing file: ' + v);
for (const cssName of [...staged].filter(n => n.endsWith('.css'))) for (const m of fs.readFileSync(path.join(stage, cssName), 'utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) { const ref = m[1]; if (/^(data:|https?:|\/\/)/.test(ref)) { if (!ref.startsWith('data:')) fail(cssName + ' external url(): ' + ref); } else if (!staged.has(ref.replace(/[?#].*$/, ''))) fail(cssName + ' url() to a missing file: ' + ref); }
const textFiles = [...staged].filter(n => /\.(js|css|html)$/.test(n));
const forbidden = [['fetch(', /\bfetch\(/], ['XMLHttpRequest', /XMLHttpRequest/], ['WebSocket', /new WebSocket\(/], ['EventSource', /new EventSource\(/], ['RTCPeerConnection', /RTCPeerConnection/], ['geolocation', /navigator\.geolocation/], ['clipboard', /navigator\.clipboard|execCommand\(\s*['"](copy|cut|paste)/], ['bluetooth/usb/hid/serial', /navigator\.(bluetooth|usb|hid|serial)\b/], ['battery/connection/credentials/locks', /navigator\.(getBattery|connection|credentials|locks)\b/], ['enumerateDevices/getDisplayMedia', /enumerateDevices|getDisplayMedia/], ['storage.persist/serviceWorker', /storage\.persist|serviceWorker\.register/], ['Worker', /new (Shared)?Worker\(/], ['sensors', /new (Accelerometer|Gyroscope|Magnetometer)\(|DeviceMotionEvent|DeviceOrientationEvent|['"]devicemotion['"]|['"]deviceorientation['"]/], ['fullscreen', /requestFullscreen/], ['eval/new Function/WebAssembly', /\beval\(|new Function\(|WebAssembly\./], ['window.open/prompt', /window\.open\(|\bprompt\(/], ['navigation to external URL', /location\.(href\s*=|assign\(|replace\()/], ['download/_blank/iframe/object/javascript:', /\bdownload=|_blank|<iframe|<object|javascript:/i], ['external http(s) resource', /https?:\/\//], ['import/export', /^\s*(import|export)\s/m]];
for (const name of textFiles) { const text = fs.readFileSync(path.join(stage, name), 'utf8'); for (const [label, re] of forbidden) if (re.test(text)) fail(name + ': forbidden pattern (' + label + ')'); }
step('container rules', 'structure, file types, references, forbidden capability scan: ' + (report.errors.length ? report.errors.length + ' error(s)' : 'clean'));
// text budget
const MIB = 1024 * 1024; let textTotal = 0; for (const name of textFiles) { const size = fs.statSync(path.join(stage, name)).size; textTotal += size; if (size > 2 * MIB) warn(name + ' is ' + (size / MIB).toFixed(2) + ' MiB (review parse cost)'); }
if (textTotal > 5 * MIB) warn('HTML/CSS/JS total ' + (textTotal / MIB).toFixed(2) + ' MiB');
step('text budget', (textTotal / MIB).toFixed(2) + ' MiB uncompressed HTML/CSS/JS');

// 6. zip from inside the stage folder (index.html at the root)
const zipName = version + '-xhs-minitool.zip', zipPath = path.join(outDir, zipName); fs.rmSync(zipPath, { force: true });
const zipResult = spawnSync('zip', ['-X', '-9', '-r', zipPath, '.', '-x', '*.DS_Store'], { cwd: stage, encoding: 'utf8' });   // -9: maximum deflate on the text files (the media is already compressed) if (zipResult.status !== 0) fail('zip failed: ' + zipResult.stderr);
const zipBytes = fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0; if (zipBytes > 10 * MIB) fail('zip is ' + (zipBytes / MIB).toFixed(2) + ' MiB; hard limit 10 MiB'); else if (zipBytes > 2 * MIB) warn('zip is ' + (zipBytes / MIB).toFixed(2) + ' MiB; recommended target is 2 MiB');
const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).stdout.trim().split('\n'); if (!listing.includes('index.html')) fail('index.html is not at the zip root'); if (listing.some(n => n.includes('/') && !n.endsWith('/'))) warn('zip contains subdirectories: ' + listing.filter(n => n.includes('/')).slice(0, 3).join(', '));
report.zip = { file: zipName, bytes: zipBytes, sha256: fs.existsSync(zipPath) ? crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex') : null, entries: listing.length };
step('zip', zipName + ' ' + zipBytes.toLocaleString() + ' bytes, ' + listing.length + ' entries');

// 7. the skill's own audit script (Python: reads the zip listing too)
const skillDir = flag('--skill') || process.env.SKILL_DIR || [path.join(root, '..', '.claude', 'skills', 'minitool-zip-builder'), path.join(root, '.claude', 'skills', 'minitool-zip-builder')].find(p => fs.existsSync(p));
const audit = skillDir && fs.existsSync(path.join(skillDir, 'scripts', 'audit_artifact.py')) ? path.join(skillDir, 'scripts', 'audit_artifact.py') : null;
if (audit) { for (const target of [stage, zipPath]) { const r = spawnSync('python3', [audit, target], { encoding: 'utf8' }); const out = (r.stdout + r.stderr).trim(); report.audit = report.audit || []; report.audit.push({ target: path.basename(target), exit: r.status, output: out }); console.log('audit_artifact.py ' + path.basename(target) + ' → exit ' + r.status + '\n  ' + out.replace(/\n/g, '\n  ')); if (r.status !== 0) fail('skill audit failed for ' + path.basename(target)); } }
else warn('skill audit script not found (pass --skill <dir>); manual size gate: ' + (zipBytes / MIB).toFixed(2) + ' MiB');
finish();
function finish() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'XHS_BUILD_INFO.json'), JSON.stringify(report, null, 2));
  console.log((report.errors.length ? 'FAILED: ' : 'PASS: ') + report.errors.length + ' error(s), ' + report.warnings.length + ' warning(s) → ' + outDir);
  process.exit(report.errors.length ? 1 : 0);
}
