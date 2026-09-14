'use strict';
// Chrome 61 CSS baseline pass (tests/tools/css-baseline.js) — unit fixtures + the real stylesheets. Run: node tests/css-baseline.test.js
const fs = require('fs'), path = require('path');
const B = require('./tools/css-baseline');
const ROOT = path.join(__dirname, '..');
const SHEETS = ['styles.css', 'route-games.css', 'caravan.css', 'pattern-chain.css', 'weaving.css', 'guide.css'];
const results = [];
function test(id, title, fn) { try { const d = fn() || []; results.push({ id, title, pass: true, details: d }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)] }); } }
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); }
const one = css => B.transform(css).css.trim();

test('CB-1', 'hex colours with alpha → rgba() (values only; url(), selectors, 3/6-digit hex untouched; @keyframes too)', () => {
  assert(B.hexAlpha('0 0 0 1px #000c') === '0 0 0 1px rgba(0,0,0,0.8)', 'hex4');
  assert(B.hexAlpha('#1a0f0899 url("a#ffffff80.png")') === 'rgba(26,15,8,0.6) url("a#ffffff80.png")', 'hex8 + url untouched: ' + B.hexAlpha('#1a0f0899 url("a#ffffff80.png")'));
  assert(B.hexAlpha('#fff #b58a3c') === '#fff #b58a3c', 'short hex untouched');
  assert(one('#a1b2c3d4{color:#a1b2c3d4}') === '#a1b2c3d4{color:rgba(161,178,195,0.831)}', 'selector kept: ' + one('#a1b2c3d4{color:#a1b2c3d4}'));
  assert(one('@keyframes k{from{filter:drop-shadow(0 0 2px #e4b652aa)}to{opacity:1}}') === '@keyframes k{from{filter:drop-shadow(0 0 2px rgba(228,182,82,0.667))}\nto{opacity:1}}', 'keyframes: ' + one('@keyframes k{from{filter:drop-shadow(0 0 2px #e4b652aa)}to{opacity:1}}'));
  return ['rgba conversion'];
});
test('CB-2', 'inset → top/right/bottom/left before it (1–4 values, calc() values, skipped when a physical side is already declared)', () => {
  assert(one('.a{position:absolute;inset:0}') === '.a{position:absolute;top:0;right:0;bottom:0;left:0;inset:0}', 'inset:0');
  assert(one('.a{inset:48px 0 0}') === '.a{top:48px;right:0;bottom:0;left:0;inset:48px 0 0}', '3 values');
  assert(one('.a{inset:1px 2px 3px 4px}') === '.a{top:1px;right:2px;bottom:3px;left:4px;inset:1px 2px 3px 4px}', '4 values');
  assert(one('.a{inset:calc(-8px * var(--k))}') === '.a{top:calc(-8px * var(--k));right:calc(-8px * var(--k));bottom:calc(-8px * var(--k));left:calc(-8px * var(--k));inset:calc(-8px * var(--k))}', 'calc');
  assert(one('.a{top:1px;inset:0}') === '.a{top:1px;inset:0}', 'skip when physical present');
  return ['inset expansion'];
});
test('CB-3', 'min()/max()/clamp() → same-property fallback first (relative argument for min, last for max, preferred for clamp; nested inside var()/calc(); skipped when a fallback already precedes)', () => {
  assert(B.mathFallback('min(92vw,360px,calc((100vh - 68px) * .6416))') === '92vw', 'min → relative');
  assert(B.mathFallback('min(320px,calc(100% - 40px))') === 'calc(100% - 40px)', 'min → calc');
  assert(B.mathFallback('clamp(40px,6.2vh,52px)') === '6.2vh', 'clamp → preferred');
  assert(B.mathFallback('var(--hud-year,clamp(8px,calc(var(--hud-height)*.139),12px))') === 'var(--hud-year,calc(var(--hud-height)*.139))', 'nested in var()');
  assert(B.mathFallback('max(1px,2px)') === '2px' && B.mathFallback('min(100%,300px)') === '100%', 'max / min');
  assert(B.mathFallback('clamp(1px,min(2vw,3px),4px)') === '2vw', 'nested clamp(min())');
  assert(one('.a{width:min(100%,300px)}') === '.a{width:100%;width:min(100%,300px)}', 'fallback inserted');
  assert(one('.a{width:100%;width:min(100%,300px)}') === '.a{width:100%;width:min(100%,300px)}', 'existing fallback kept');
  return ['math fallbacks'];
});
test('CB-4', 'conic-gradient → solid linear-gradient layer of its first colour, gap on grid → grid-gap first, gap on flex → .no-flex-gap margin rule (row / column / two values / wrap / hand-written kept), :focus-visible → .no-focus-visible :focus copy', () => {
  assert(one('.o{background:radial-gradient(circle,#f3d68a 0 22%,transparent 24%),conic-gradient(from 45deg,#b58a3c 0 25%,transparent 0)}') === '.o{background:radial-gradient(circle,#f3d68a 0 22%,transparent 24%),linear-gradient(#b58a3c,#b58a3c);background:radial-gradient(circle,#f3d68a 0 22%,transparent 24%),conic-gradient(from 45deg,#b58a3c 0 25%,transparent 0)}', 'conic: ' + one('.o{background:radial-gradient(circle,#f3d68a 0 22%,transparent 24%),conic-gradient(from 45deg,#b58a3c 0 25%,transparent 0)}'));
  assert(one('.g{display:grid;gap:8px}') === '.g{display:grid;grid-gap:8px;gap:8px}', 'grid');
  assert(one('.g{display:grid;grid-template-columns:1fr}\n.g{row-gap:4px}') === '.g{display:grid;grid-template-columns:1fr}\n.g{grid-row-gap:4px;row-gap:4px}', 'grid display declared in another rule');
  assert(one('.f{display:flex;gap:8px}') === '.f{display:flex;gap:8px}\n.no-flex-gap .f>*+*{margin-left:8px}', 'flex row: ' + one('.f{display:flex;gap:8px}'));
  assert(one('.f{display:flex;flex-direction:column;gap:9px}') === '.f{display:flex;flex-direction:column;gap:9px}\n.no-flex-gap .f>*+*{margin-top:9px}', 'flex column');
  assert(one('.f{display:inline-flex;gap:3px 12px}') === '.f{display:inline-flex;gap:3px 12px}\n.no-flex-gap .f>*+*{margin-left:12px}', 'two values → column gap');
  assert(one('.f{display:flex;flex-wrap:wrap;gap:2px 10px}') === '.f{display:flex;flex-wrap:wrap;gap:2px 10px}\n.no-flex-gap .f>*{margin-right:10px;margin-bottom:2px}', 'wrap');
  assert(one('.f{display:flex;gap:8px}\n.no-flex-gap .f>*+*{margin-left:6px}') === '.f{display:flex;gap:8px}\n.no-flex-gap .f>*+*{margin-left:6px}', 'hand-written fallback kept, none generated');
  assert(one('.info-row{display:flex}\n.x .info-row{gap:16px}') === '.info-row{display:flex}\n.x .info-row{gap:16px}\n.no-flex-gap .x .info-row>*+*{margin-left:16px}', 'display found through the last compound');
  assert(one('.a:focus-visible,.b{outline:1px solid red}') === '.a:focus-visible,.b{outline:1px solid red}\n.no-focus-visible .a:focus{outline:1px solid red}', 'focus-visible copy: ' + one('.a:focus-visible,.b{outline:1px solid red}'));
  assert(one('@media(max-width:400px){.f{display:flex;gap:4px}}') === '@media (max-width:400px){.f{display:flex;gap:4px}\n.no-flex-gap .f>*+*{margin-left:4px}}', 'inside @media: ' + one('@media(max-width:400px){.f{display:flex;gap:4px}}'));
  return ['conic / gap / focus-visible'];
});
test('CB-5', 'parser: strings, url(), nested at-rules, @font-face and @supports survive a parse → serialize → parse round trip; @import statement kept', () => {
  const css = '@font-face{font-family:"Ma;Shan";src:url("a{b}.woff2") format("woff2")}\n@supports (height:100dvh){:root{--h:100dvh}}\n.a::before{content:"{;}";background:url(x.png)}\n@media (min-width:1px){@media (hover:hover){.b:hover{color:red}}}';
  const p = B.parse(css), s = B.serialize(p), p2 = B.parse(s);
  assert(JSON.stringify(p) === JSON.stringify(p2), 'round trip stable');
  assert(p.length === 4 && p[0].name === 'font-face' && p[0].decls[1][1] === 'url("a{b}.woff2") format("woff2")' && p[2].decls[0][1] === '"{;}"' && p[3].children[0].children[0].selector === '.b:hover', 'structure: ' + JSON.stringify(p).slice(0, 300));
  assert(B.serialize(B.parse('@import url(x.css);.a{b:c}')) === '@import url(x.css);\n.a{b:c}', 'statement at-rule');
  assert(B.serialize(B.parse('/* c */.a{/* d */color:red/* e */}')) === '.a{color:red}', 'comments dropped');
  return ['parser'];
});
test('CB-6', 'lint: flags every unguarded post-Chrome-61 feature on a fixture and passes the transformed fixture; env()/dvh inside @supports pass', () => {
  const bad = '.a{inset:0;color:#0004;width:min(1px,2%);background:conic-gradient(red,blue);height:100dvh;padding-top:env(safe-area-inset-top);margin-inline:1px;overflow:clip}\n.f{display:flex;gap:1px}\n.g{display:grid;gap:1px}\n.b:focus-visible{outline:0}\n.c:has(a){color:red}\n.d{aspect-ratio:1/1}';
  const l = B.lint(bad, { aspectRules: [] });
  const want = ['inset without', 'hex colour with alpha', 'min()/max()/clamp() without', 'conic-gradient() without', 'dynamic viewport unit', 'env() outside @supports', 'logical property', 'overflow: clip', 'flex gap without', 'on a grid container without grid-gap', ':focus-visible without', 'selector Chrome 61 cannot parse', 'ASPECT_RULES'];
  for (const w of want) assert(l.issues.some(i => i.includes(w)), 'missing lint: ' + w + ' in ' + JSON.stringify(l.issues));
  const fixed = B.transform('.a{inset:0;color:#0004;width:min(1px,2%);background:conic-gradient(red,blue)}\n.f{display:flex;gap:1px}\n.g{display:grid;gap:1px}\n.b:focus-visible{outline:0}\n@supports (height:100dvh){:root{--h:100dvh;--t:env(safe-area-inset-top)}}').css;
  const l2 = B.lint(fixed, { aspectRules: [] }); assert(l2.issues.length === 0, 'transformed fixture clean: ' + JSON.stringify(l2.issues));
  return [want.length + ' lint kinds'];
});
test('CB-7', 'real stylesheets: the sources still carry modern-only features, the transformed output lints clean, the pass is idempotent, and every declaration of the source survives', () => {
  const out = [];
  for (const f of SHEETS) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8'), t = B.transform(src), l = B.lint(t.css, { aspectRules: [] });
    const aspectIssues = l.issues.filter(i => i.includes('ASPECT_RULES')), other = l.issues.filter(i => !i.includes('ASPECT_RULES'));
    assert(other.length === 0, f + ' staged lint: ' + JSON.stringify(other.slice(0, 5)));
    assert(B.transform(t.css).css === t.css, f + ' transform is idempotent');
    const count = nodes => nodes.reduce((s, n) => s + (n.decls ? n.decls.length : n.children ? count(n.children) : 0), 0);
    assert(count(B.parse(t.css)) >= count(B.parse(src)), f + ' declarations kept');
    const srcIssues = B.lint(src).issues.length; assert(srcIssues > 0 || f === 'route-games.css' || f === 'guide.css', f + ' source expected to need the pass');
    out.push(f + ' ' + srcIssues + '→0 (' + Object.entries(t.stats).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(', ') + (aspectIssues.length ? '; aspect ' + aspectIssues.length : '') + ')');
  }
  return out;
});
test('CB-8', 'aspect-ratio: every rule of the stylesheets is mirrored in compat.js ASPECT_RULES (selector, ratio, mode) — including the caravan camel (width from height) and the journey-scene auto reset', () => {
  const compat = fs.readFileSync(path.join(ROOT, 'compat.js'), 'utf8'), m = compat.match(/var ASPECT_RULES = \[([\s\S]*?)\n\s*\];/); assert(m, 'ASPECT_RULES list present');
  const rules = JSON.parse('[' + m[1].replace(/'/g, '"') + ']');
  const expected = []; for (const f of SHEETS) expected.push(...B.extractAspectRules(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  for (const r of expected) assert(rules.some(a => B.norm(a[0]) === B.norm(r[0]) && a[1] === r[1] && a[2] === r[2] && a[3] === r[3]), 'compat.js lacks ' + JSON.stringify(r));
  for (const a of rules) assert(expected.some(r => B.norm(a[0]) === B.norm(r[0])), 'compat.js has a stale entry ' + JSON.stringify(a));
  assert(expected.some(r => r[0] === '.caravan-shell .rig .camel' && r[3] === 'width') && expected.some(r => r[0] === '.journey-scene .travel-art' && r[3] === 'auto'), 'modes');
  for (const f of SHEETS) { const l = B.lint(B.transform(fs.readFileSync(path.join(ROOT, f), 'utf8')).css, { aspectRules: rules }); assert(l.issues.length === 0, f + ' with ASPECT_RULES: ' + JSON.stringify(l.issues)); }
  return [rules.length + ' rules mirrored'];
});
const passed = results.filter(r => r.pass).length;
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n  ' + r.details.join('\n  ')));
console.log(`css baseline: ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
